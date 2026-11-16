// owns: grid buffers, rules and their settings
// edit for: cell model, diffusion/reaction equations, defaults

const N = 128;
const CELLS = N * N;
const MAXV = 255;
const INV_1024 = 1 / 1024;

const CH_R = 0;
const CH_G = 1;
const CH_B = 2;
const CH_NONE = -1;

const settings = {
	running: true,
	speed: 4,
	deplete: 1,
	diffuse: 128,
	brownian: 0,
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
	react: 8,
	maxColor: Infinity,
	territoryCap: 0
};

const grid = {
	cells: CELLS,
	src: new Uint8Array(CELLS),
	ch: [new Float64Array(CELLS), new Float64Array(CELLS), new Float64Array(CELLS)],
	back: [new Float64Array(CELLS), new Float64Array(CELLS), new Float64Array(CELLS)],
	count: new Int32Array(3),
	mixed: 0
};

function nbRate(va, vb, rate, can1, can2, r1, r2) {
	const ha = va > 0, hb = vb > 0;
	if (!ha && !hb) return rate;
	if ((ha && !can1) || (hb && !can2)) return 0;
	if (ha && hb) return r1 < r2 ? r1 : r2;
	return ha ? r1 : r2;
}

// xorshift32 with a fixed seed so headless probes stay reproducible
let rngState = 0x9e3779b9;
function rnd() {
	rngState ^= rngState << 13;
	rngState ^= rngState >>> 17;
	rngState ^= rngState << 5;
	return rngState >>> 0;
}

const brDir = new Int8Array(CELLS);
const brPartner = new Int32Array(CELLS);

// one shared shuffle for all channels: the gas moves together, so co-located species stay
// co-located; shuffling each channel separately separates them and breaks spread's bounds
function brownianPass(cur, nxt) {
	const p = settings.brownian;
	brPartner.fill(-1);
	// all proposals must be written before any acceptance reads a neighbour's
	for (let y = 0; y < N; y++) {
		const row = y * N;
		for (let x = y & 1; x < N; x += 2) {
			const i = row + x;
			brDir[i] = p > 0 && (p === 255 || (rnd() & 255) < p) ? rnd() & 3 : -1;
		}
	}
	for (let y = 0; y < N; y++) {
		const row = y * N;
		for (let x = (y + 1) & 1; x < N; x += 2) {
			const i = row + x;
			const l = x > 0 ? i - 1 : i + N - 1;
			const r = x < N - 1 ? i + 1 : i - N + 1;
			const u = y > 0 ? i - N : i + N * (N - 1);
			const d = y < N - 1 ? i + N : i - N * (N - 1);
			const cl = (brDir[l] === 1) + (brDir[r] === 0) + (brDir[u] === 3) + (brDir[d] === 2);
			if (cl === 0) continue;
			let t = rnd() % cl, m = -1;
			if (brDir[l] === 1 && t-- === 0) m = l;
			else if (brDir[r] === 0 && t-- === 0) m = r;
			else if (brDir[u] === 3 && t-- === 0) m = u;
			else m = d;
			brPartner[i] = m;
			brPartner[m] = i;
		}
	}
	for (let c = 0; c < 3; c++) {
		const a = cur[c], b = nxt[c];
		for (let i = 0; i < CELLS; i++) {
			const m = brPartner[i];
			b[i] = a[m < 0 ? i : m];
		}
	}
}

// gather in symmetric L+R / U+D pairs keeps float64 diffusion exact under mirror flip
// sc time-dilates cross rates so substepped rounds keep the same per-step balance
function spreadPass(c, cur, next, a, b, d, rate, sc) {
	const c1 = (c + 1) % 3;
	const c2 = (c + 2) % 3;
	const allow = settings.crossAllow;
	const cross = settings.crossRate;
	const can1 = allow[c][c1] || allow[c1][c];
	const can2 = allow[c][c2] || allow[c2][c];
	const r1 = cross[c][c1] * sc;
	const r2 = cross[c][c2] * sc;
	let i = 0;
	for (let y = 0; y < N; y++) {
		const up = (y > 0 ? y - 1 : N - 1) * N;
		const down = (y < N - 1 ? y + 1 : 0) * N;
		for (let x = 0; x < N; x++, i++) {
			const j0 = x > 0 ? i - 1 : i + N - 1;
			const j1 = x < N - 1 ? i + 1 : i - N + 1;
			const j2 = up + x;
			const j3 = down + x;
			const v = cur[i] > d ? cur[i] - d : 0;
			const v0 = cur[j0] > d ? cur[j0] - d : 0;
			const v1 = cur[j1] > d ? cur[j1] - d : 0;
			const v2 = cur[j2] > d ? cur[j2] - d : 0;
			const v3 = cur[j3] > d ? cur[j3] - d : 0;
			if (v === 0 && v0 === 0 && v1 === 0 && v2 === 0 && v3 === 0) {
				next[i] = 0;
				continue;
			}
			let moved = 0;
			if (v > 0) {
				const o0 = nbRate(a[j0], b[j0], rate, can1, can2, r1, r2);
				const o1 = nbRate(a[j1], b[j1], rate, can1, can2, r1, r2);
				const o2 = nbRate(a[j2], b[j2], rate, can1, can2, r1, r2);
				const o3 = nbRate(a[j3], b[j3], rate, can1, can2, r1, r2);
				moved = v * ((o0 + o1) + (o2 + o3)) * INV_1024;
			}
			const rIn = nbRate(a[i], b[i], rate, can1, can2, r1, r2);
			const inflow = rIn > 0 ? ((v0 + v1) + (v2 + v3)) * rIn * INV_1024 : 0;
			next[i] = (v - moved) + inflow;
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
			pairRate = rate - s * 0.5;
		}
		if (vr > 0 && vg > 0) { const d = Math.min(vr, vg, pairRate); vr -= d; vg -= d; }
		if (vg > 0 && vb > 0) { const d = Math.min(vg, vb, pairRate); vg -= d; vb -= d; }
		if (vr > 0 && vb > 0) { const d = Math.min(vr, vb, pairRate); vr -= d; vb -= d; }
		r[i] = vr; g[i] = vg; b[i] = vb;
	}
}

// the cap limits production, not storage: once a channel holds its cap the sources stop
// feeding and the stored color keeps diffusing, so mass stays conserved
function sourcePass(src, ch) {
	const base = settings.maxColor;
	const perCell = settings.territoryCap;
	for (let c = 0; c < 3; c++) {
		const a = ch[c];
		if (!(base < Infinity)) {
			for (let i = 0; i < CELLS; i++) {
				if (a[i] > MAXV) a[i] = MAXV;
				if (src[i] === c + 1) a[i] = MAXV;
			}
			continue;
		}
		const cap = base + perCell * grid.count[c];
		let total = 0;
		for (let i = 0; i < CELLS; i++) {
			if (a[i] > MAXV) a[i] = MAXV;
			total += a[i];
		}
		for (let i = 0; i < CELLS; i++) {
			if (src[i] !== c + 1) continue;
			const room = cap - (total - a[i]);
			const v = room >= MAXV ? MAXV : room > 0 ? room : 0;
			total += v - a[i];
			a[i] = v;
		}
	}
}

// a cell belongs to its strongest channel; ties keep the lower channel
function cellOwner(r, g, b) {
	let top = 0, ch = -1;
	if (r > 0) { top = r; ch = 0; }
	if (g > top) { top = g; ch = 1; }
	if (b > top) ch = 2;
	return ch;
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
		count[cellOwner(vr, vg, vb)]++;
	}
	grid.mixed = mixed;
}

// paint/clear touch one cell, so undo its old ownership and recount from the live values
function adjustCount(i, r, g, b) {
	const count = grid.count;
	const held = (r > 0) + (g > 0) + (b > 0);
	if (held > 0) count[cellOwner(r, g, b)]--;
	if (held > 1) grid.mixed--;
	const nr = grid.ch[0][i], ng = grid.ch[1][i], nb = grid.ch[2][i];
	const nHeld = (nr > 0) + (ng > 0) + (nb > 0);
	if (nHeld > 0) count[cellOwner(nr, ng, nb)]++;
	if (nHeld > 1) grid.mixed++;
}

function swapBuffers() {
	const ch = grid.ch, back = grid.back;
	for (let c = 0; c < 3; c++) {
		const t = ch[c];
		ch[c] = back[c];
		back[c] = t;
	}
}

// explicit spread is only stable while a neighbour share stays <= 255/1024 per round,
// so rates above 255 run as several stable rounds; deplete still taxes once per step.
// brownian runs once per step before the rounds, so the diffusion slider cannot
// multiply its passes; every phase reads ch, writes back, then swaps
function simStep() {
	const rate = settings.diffuse;
	const rounds = rate > MAXV ? Math.ceil(rate / MAXV) : 1;
	const sc = 1 / rounds;
	const sub = rate * sc;
	const decay = settings.deplete;
	const brown = settings.brownian;
	if (brown > 0) {
		brownianPass(grid.ch, grid.back);
		swapBuffers();
	}
	for (let r = 0; r < rounds; r++) {
		for (let c = 0; c < 3; c++) {
			spreadPass(c, grid.ch[c], grid.back[c], grid.ch[(c + 1) % 3], grid.ch[(c + 2) % 3], r === 0 ? decay : 0, sub, sc);
		}
		sourcePass(grid.src, grid.back);
		swapBuffers();
	}
	reactPass(grid.ch[0], grid.ch[1], grid.ch[2], settings.react);
	countPass(grid.ch[0], grid.ch[1], grid.ch[2]);
}

function simCount() {
	countPass(grid.ch[0], grid.ch[1], grid.ch[2]);
}

function simPaint(i, c) {
	if (c === CH_NONE) { simClear(i); return; }
	const ch = grid.ch;
	const r = ch[0][i], g = ch[1][i], b = ch[2][i];
	grid.src[i] = c + 1;
	ch[c][i] = MAXV;
	// count must stay fresh between steps: the cap in sourcePass reads it
	adjustCount(i, r, g, b);
}

function simClear(i) {
	const ch = grid.ch;
	const r = ch[0][i], g = ch[1][i], b = ch[2][i];
	grid.src[i] = 0;
	ch[0][i] = 0;
	ch[1][i] = 0;
	ch[2][i] = 0;
	adjustCount(i, r, g, b);
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
		N, CELLS, MAXV,
		CH_R, CH_G, CH_B, CH_NONE,
		settings, grid,
		simStep, simCount, simPaint, simClear, simReset
	};
}
