// owns: the Q12.12 cell grid, ownership masks, territory caps, and cell reads
// edit for: grid size, fixed-point precision, ownership tie rule, or cap curve

const FP = 12;
const FP_ONE = 1 << FP;
const FP_HALF = FP_ONE >> 1;
const NO_COLOR = 3;
const REF_OWNED = 16;
const CAP_DEF = 255;

const Field = {
	w: 0,
	h: 0,
	n: 0,
	v: null,
	ch: [null, null, null],
	dom: null,
	src: null,
	owned: [0, 0, 0],
	total: [0, 0, 0],
	cap: [0, 0, 0],
	budget: [0, 0, 0],

	init(w, h) {
		this.w = w;
		this.h = h;
		this.n = w * h;
		this.v = new Int32Array(this.n * 3);
		this.ch = [
			this.v.subarray(0, this.n),
			this.v.subarray(this.n, this.n * 2),
			this.v.subarray(this.n * 2, this.n * 3),
		];
		this.dom = new Uint8Array(this.n);
		this.src = new Uint8Array(this.n);
		this.reset();
	},

	reset() {
		this.v.fill(0);
		this.dom.fill(NO_COLOR);
		this.src.fill(0);
		for (let p = 0; p < 3; p++) {
			this.owned[p] = 0;
			this.total[p] = 0;
			this.cap[p] = 0;
			this.budget[p] = Infinity;
		}
	},

	analyze() {
		const c0 = this.ch[0];
		const c1 = this.ch[1];
		const c2 = this.ch[2];
		const dom = this.dom;
		let o0 = 0, o1 = 0, o2 = 0;
		let t0 = 0, t1 = 0, t2 = 0;
		for (let i = 0; i < this.n; i++) {
			const r = c0[i], g = c1[i], b = c2[i];
			t0 += r;
			t1 += g;
			t2 += b;
			const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
			let d = NO_COLOR;
			if (max >= FP_ONE) {
				const ties = (r === max ? 1 : 0) + (g === max ? 1 : 0) + (b === max ? 1 : 0);
				if (ties === 1) d = r === max ? 0 : (g === max ? 1 : 2);
			}
			dom[i] = d;
			if (d === 0) o0++;
			else if (d === 1) o1++;
			else if (d === 2) o2++;
		}
		this.owned[0] = o0; this.owned[1] = o1; this.owned[2] = o2;
		this.total[0] = t0; this.total[1] = t1; this.total[2] = t2;
	},

	// smaller territories sustain higher per-cell ceilings; maxMass caps total player gas (Boyle's law)
	caps(base, territory, maxMass = 0) {
		const b = base * FP_ONE;
		const t = territory / 100;
		const ceil = CAP_DEF * 16 * FP_ONE;
		const massLim = maxMass > 0 ? maxMass * 1000 * FP_ONE : Infinity;
		for (let p = 0; p < 3; p++) {
			if (!b) {
				this.cap[p] = 0;
				this.budget[p] = massLim;
				continue;
			}
			const area = this.owned[p] || 1;
			const grow = 1 + t * Math.max(0, REF_OWNED / area - 1);
			let c = Math.round(b * grow);
			if (c > ceil) c = ceil;
			if (c < FP_ONE) c = FP_ONE;
			this.cap[p] = c;
			const cellLim = c * area;
			this.budget[p] = massLim < cellLim ? massLim : cellLim;
		}
	},

	sample(x, y, out) {
		const i = y * this.w + x;
		const r = this.ch[0][i], g = this.ch[1][i], b = this.ch[2][i];
		out[0] = r >> FP;
		out[1] = g >> FP;
		out[2] = b >> FP;
		out[3] = r & (FP_ONE - 1);
		out[4] = g & (FP_ONE - 1);
		out[5] = b & (FP_ONE - 1);
		out[6] = this.src[i];
		out[7] = this.dom[i];
		return out;
	},
};

if (typeof module !== 'undefined') {
	module.exports = {
		Field, FP, FP_ONE, FP_HALF, NO_COLOR, REF_OWNED, CAP_DEF,
	};
}
