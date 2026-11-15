// owns: grid buffers, rules and their settings
// edit for: cell model, diffusion/reaction equations, defaults

const N = 128;
const CELLS = N * N;
// fixed point: 4 fraction bits let low concentrations keep spreading instead of truncating to 0
const SHIFT = 4;
const MAXV = 255 << SHIFT;

const CH_R = 0;
const CH_G = 1;
const CH_B = 2;
const CH_NONE = -1;

const settings = {
	running: true,
	speed: 4,
	deplete: 1,
	diffuse: 128,
	crossAllow: [
		[false, false, false],
		[false, false, false],
		[false, false, false]
	],
	crossRate: [
		[0, 64, 64],
		[64, 0, 64],
		[64, 64, 0]
	],
	react: 8
};

const grid = {
	cells: CELLS,
	src: new Uint8Array(CELLS),
	ch: [new Uint16Array(CELLS), new Uint16Array(CELLS), new Uint16Array(CELLS)],
	back: [new Uint16Array(CELLS), new Uint16Array(CELLS), new Uint16Array(CELLS)],
	count: new Int32Array(3),
	mixed: 0
};

const nb4 = new Int32Array(4);

function decayPass(cur, next, d) {
	for (let i = 0; i < CELLS; i++) {
		const v = cur[i] - d;
		next[i] = v > 0 ? v : 0;
	}
}

// occupancy is sampled from cur, so two colors may claim the same empty cell in one frame
function spreadPass(c, cur, next, a, b, d, rate) {
	const c1 = (c + 1) % 3;
	const c2 = (c + 2) % 3;
	const allow = settings.crossAllow;
	const cross = settings.crossRate;
	const can1 = allow[c][c1] || allow[c1][c];
	const can2 = allow[c][c2] || allow[c2][c];
	const r1 = cross[c][c1];
	const r2 = cross[c][c2];
	let i = 0;
	for (let y = 0; y < N; y++) {
		const up = (y > 0 ? y - 1 : N - 1) * N;
		const down = (y < N - 1 ? y + 1 : 0) * N;
		for (let x = 0; x < N; x++, i++) {
			// spreading the post-decay value keeps moved <= base, so next[i] never goes
			// negative and the pass stays independent of the visit order
			const v = cur[i] > d ? cur[i] - d : 0;
			if (v === 0) continue;
			nb4[0] = x > 0 ? i - 1 : i + N - 1;
			nb4[1] = x < N - 1 ? i + 1 : i - N + 1;
			nb4[2] = up + x;
			nb4[3] = down + x;
			let moved = 0;
			for (let k = 0; k < 4; k++) {
				const j = nb4[k];
				const ha = a[j] > 0;
				const hb = b[j] > 0;
				let r = rate;
				if (ha || hb) {
					if ((ha && !can1) || (hb && !can2)) continue;
					if (ha && hb) r = r1 < r2 ? r1 : r2;
					else r = ha ? r1 : r2;
				}
				const share = (v * r) >> 10;
				if (share === 0) continue;
				moved += share;
				next[j] += share;
			}
			next[i] -= moved;
		}
	}
}

function reactPass(r, g, b, rate) {
	if (rate === 0) return;
	for (let i = 0; i < CELLS; i++) {
		let vr = r[i], vg = g[i], vb = b[i];
		if ((vr > 0) + (vg > 0) + (vb > 0) < 2) continue;
		let pairRate = rate;
		if (vr > 0 && vg > 0 && vb > 0) {
			const rg = Math.min(vr, vg, rate);
			const gb = Math.min(vg, vb, rate);
			const rb = Math.min(vr, vb, rate);
			const dr = rg + rb, dg = rg + gb, db = rb + gb;
			if (dr <= vr && dg <= vg && db <= vb) {
				r[i] = vr - dr; g[i] = vg - dg; b[i] = vb - db;
				continue;
			}
			// drain the shared 3-way core first so low-concentration overlaps stay channel-symmetric
			const s = Math.min(vr, vg, vb);
			vr -= s; vg -= s; vb -= s;
			pairRate = rate - (s >> 1);
		}
		if (vr > 0 && vg > 0) { const d = Math.min(vr, vg, pairRate); vr -= d; vg -= d; }
		if (vg > 0 && vb > 0) { const d = Math.min(vg, vb, pairRate); vg -= d; vb -= d; }
		if (vr > 0 && vb > 0) { const d = Math.min(vr, vb, pairRate); vr -= d; vb -= d; }
		r[i] = vr; g[i] = vg; b[i] = vb;
	}
}

function sourcePass(src, ch) {
	const r = ch[0], g = ch[1], b = ch[2];
	for (let i = 0; i < CELLS; i++) {
		// clamp after spread so saturated cells receive all 4 neighbours before capping
		if (r[i] > MAXV) r[i] = MAXV;
		if (g[i] > MAXV) g[i] = MAXV;
		if (b[i] > MAXV) b[i] = MAXV;
		const s = src[i];
		if (s > 0) ch[s - 1][i] = MAXV;
	}
}

// a cell belongs to its strongest channel; cells held by 2+ channels count as contested
function countPass(r, g, b) {
	const count = grid.count;
	count[0] = 0; count[1] = 0; count[2] = 0;
	let mixed = 0;
	for (let i = 0; i < CELLS; i++) {
		const vr = r[i], vg = g[i], vb = b[i];
		const held = (vr > 0) + (vg > 0) + (vb > 0);
		if (held === 0) continue;
		if (held > 1) mixed++;
		let top = 0, ch = -1;
		if (vr > 0) { top = vr; ch = 0; }
		if (vg > top) { top = vg; ch = 1; }
		if (vb > top) { ch = 2; }
		count[ch]++;
	}
	grid.mixed = mixed;
}

function simStep() {
	const ch = grid.ch, back = grid.back;
	const rate = settings.diffuse;
	const decay = settings.deplete << SHIFT;
	for (let c = 0; c < 3; c++) {
		decayPass(ch[c], back[c], decay);
		spreadPass(c, ch[c], back[c], ch[(c + 1) % 3], ch[(c + 2) % 3], decay, rate);
	}
	sourcePass(grid.src, back);
	reactPass(back[0], back[1], back[2], settings.react << SHIFT);
	countPass(back[0], back[1], back[2]);
	for (let c = 0; c < 3; c++) {
		// ch is grid.ch, so the old current buffer must be read before it is overwritten
		const cur = ch[c];
		grid.ch[c] = back[c];
		grid.back[c] = cur;
	}
}

function simCount() {
	countPass(grid.ch[0], grid.ch[1], grid.ch[2]);
}

function simPaint(i, c) {
	if (c === CH_NONE) { simClear(i); return; }
	grid.src[i] = c + 1;
	grid.ch[c][i] = MAXV;
}

function simClear(i) {
	grid.src[i] = 0;
	grid.ch[0][i] = 0;
	grid.ch[1][i] = 0;
	grid.ch[2][i] = 0;
}

function simReset() {
	grid.src.fill(0);
	for (let c = 0; c < 3; c++) {
		grid.ch[c].fill(0);
		grid.back[c].fill(0);
	}
	simCount();
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		N, CELLS, SHIFT, MAXV,
		CH_R, CH_G, CH_B, CH_NONE,
		settings, grid,
		simStep, simCount, simPaint, simClear, simReset
	};
}
