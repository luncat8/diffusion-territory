// owns: the cell grid — fixed point storage, per-frame analysis, player caps
// edit for: grid size, fixed point bits, cap/territory formula

const FP = 12;
const FP_ONE = 1 << FP;
const FP_HALF = 1 << (FP - 1);
const REF_OWNED = 16;
const CAP_MAX = 4095;
const NO_COLOR = 3;

const Field = {
	w: 0,
	h: 0,
	n: 0,
	v: null,
	nxt: null,
	dom: null,
	src: null,
	owned: new Int32Array(3),
	total: new Float64Array(3),
	cap: new Int32Array(3),
	budget: new Float64Array(3),
	rnd: 2463534242,

	init(w, h) {
		this.w = w;
		this.h = h;
		this.n = w * h;
		this.v = new Int32Array(this.n * 3);
		this.nxt = new Int32Array(this.n * 3);
		this.dom = new Uint8Array(this.n);
		this.src = new Uint8Array(this.n);
		this.reset();
	},

	reset() {
		this.v.fill(0);
		this.nxt.fill(0);
		this.dom.fill(NO_COLOR);
		this.src.fill(0);
		this.owned.fill(0);
		this.total.fill(0);
		this.cap.fill(0);
		this.budget.fill(Infinity);
	},

	analyze() {
		const v = this.v;
		const dom = this.dom;
		const owned = this.owned;
		const total = this.total;
		owned.fill(0);
		total.fill(0);
		for (let i = 0, j = 0; i < this.n; i++, j += 3) {
			const r = v[j], g = v[j + 1], b = v[j + 2];
			total[0] += r; total[1] += g; total[2] += b;
			let c = NO_COLOR;
			if (r >= FP_ONE && r > g && r > b) c = 0;
			else if (g >= FP_ONE && g > r && g > b) c = 1;
			else if (b >= FP_ONE && b > r && b > g) c = 2;
			dom[i] = c;
			if (c !== NO_COLOR) owned[c]++;
		}
	},

	// a player keeps at most capBase per cell on a REF_OWNED-cell territory;
	// smaller territory raises the per-cell share instead of capping total early
	caps(capBase, capTerritory) {
		const base = capBase * FP_ONE;
		const t = capTerritory / 100;
		for (let p = 0; p < 3; p++) {
			if (!base) { this.cap[p] = 0; this.budget[p] = Infinity; continue; }
			const area = this.owned[p] || 1;
			const grow = 1 + t * Math.max(0, REF_OWNED / area - 1);
			let cap = Math.round(base * grow);
			if (cap > CAP_MAX * FP_ONE) cap = CAP_MAX * FP_ONE;
			if (cap < FP_ONE) cap = FP_ONE;
			this.cap[p] = cap;
			this.budget[p] = cap * area;
		}
	},

	// a cell can end a step a few quanta below zero; keep that debt in place and
	// hand anything deeper to the richest neighbour, so mass stays exact
	settle() {
		const v = this.v;
		const w = this.w;
		const h = this.h;
		for (let i = 0, j = 0; i < this.n; i++, j += 3) {
			for (let c = 0; c < 3; c++) {
				const debt = v[j + c];
				if (debt > -FP_ONE) continue;
				const x = i % w;
				const y = (i / w) | 0;
				let best = -1;
				let bestV = 0;
				if (x > 0) { const t = v[(i - 1) * 3 + c]; if (t > bestV) { bestV = t; best = i - 1; } }
				if (x + 1 < w) { const t = v[(i + 1) * 3 + c]; if (t > bestV) { bestV = t; best = i + 1; } }
				if (y > 0) { const t = v[(i - w) * 3 + c]; if (t > bestV) { bestV = t; best = i - w; } }
				if (y + 1 < h) { const t = v[(i + w) * 3 + c]; if (t > bestV) { bestV = t; best = i + w; } }
				if (best < 0) continue;
				v[j + c] = 0;
				v[best * 3 + c] += debt;
			}
		}
	},

	sample(x, y, out) {
		const i = y * this.w + x;
		const j = i * 3;
		const v = this.v;
		for (let c = 0; c < 3; c++) {
			const val = v[j + c];
			out[c] = val > 0 ? val >> FP : 0;
			out[c + 3] = val > 0 ? val & (FP_ONE - 1) : 0;
		}
		out[6] = this.src[i];
		out[7] = this.dom[i];
	},
};

if (typeof module !== 'undefined') module.exports = { Field, FP, FP_ONE, FP_HALF, NO_COLOR, REF_OWNED, CAP_MAX };
