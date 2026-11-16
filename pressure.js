// owns: gas-pressure equalization — hierarchical mean transfer per color
// edit for: pyramid depth, transfer strength, compatibility rule

const Pressure = {
	dims: [],
	sums: [],
	counts: [],
	recip: [],
	acc: [],
	levels: 0,

	init(w, h) {
		this.levels = 0;
		this.dims = [{ w, h, n: w * h }];
		while (this.dims[this.levels].w > 1 || this.dims[this.levels].h > 1) {
			const p = this.dims[this.levels];
			const nw = Math.max(1, (p.w + 1) >> 1);
			const nh = Math.max(1, (p.h + 1) >> 1);
			this.dims.push({ w: nw, h: nh, n: nw * nh });
			this.levels++;
		}
		this.sums = [];
		this.counts = [];
		this.recip = [];
		this.acc = [];
		for (const d of this.dims) {
			this.sums.push(new Float64Array(d.n * 3));
			this.counts.push(new Int32Array(d.n * 3));
			this.recip.push(new Float64Array(d.n * 3));
			this.acc.push(new Float64Array(d.n * 3));
		}
	},

	// a gas has no slowest mode: a local walk needs O(N^2) frames to carry a
	// gradient across the grid, the coarse means carry it in one pass
	equalize(s) {
		const t = s.pressure / 100;
		if (t <= 0 || !this.levels) return;
		this.flat();
		for (let l = 1; l <= this.levels; l++) {
			this.up(l);
			this.mean(l);
		}
		for (let l = 1; l <= this.levels; l++) this.shift(l, t);
		Field.settle();
	},

	flat() {
		const v = Field.v;
		const dom = Field.dom;
		const sums = this.sums[0];
		const counts = this.counts[0];
		for (let i = 0, j = 0; i < Field.n; i++, j += 3) {
			const d = dom[i];
			for (let c = 0; c < 3; c++) {
				const ok = d === c || d === NO_COLOR;
				sums[j + c] = ok ? v[j + c] : 0;
				counts[j + c] = ok ? 1 : 0;
			}
		}
	},

	up(l) {
		const p = this.dims[l - 1];
		const c = this.dims[l];
		const ps = this.sums[l - 1];
		const pc = this.counts[l - 1];
		const cs = this.sums[l];
		const cc = this.counts[l];
		cs.fill(0);
		cc.fill(0);
		for (let y = 0; y < p.h; y++) {
			const cy = y >> 1;
			for (let x = 0; x < p.w; x++) {
				const pi = (y * p.w + x) * 3;
				const ci = (cy * c.w + (x >> 1)) * 3;
				for (let ch = 0; ch < 3; ch++) {
					cs[ci + ch] += ps[pi + ch];
					cc[ci + ch] += pc[pi + ch];
				}
			}
		}
	},

	mean(l) {
		const counts = this.counts[l];
		const recip = this.recip[l];
		for (let k = 0; k < counts.length; k++) recip[k] = counts[k] ? 1 / counts[k] : 0;
	},

	// error feedback keeps each group's moves summing to zero, so the only
	// residual is a single unit and it can never push a cell negative
	shift(l, t) {
		const w = Field.w;
		const h = Field.h;
		const c = this.dims[l];
		const v = Field.v;
		const dom = Field.dom;
		const sums = this.sums[l];
		const recip = this.recip[l];
		const acc = this.acc[l];
		acc.fill(0);
		for (let y = 0; y < h; y++) {
			const gy = (y >> l) * c.w;
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				const j = i * 3;
				const g = (gy + (x >> l)) * 3;
				const d = dom[i];
				for (let ch = 0; ch < 3; ch++) {
					if (d !== NO_COLOR && d !== ch) continue;
					const r = recip[g + ch];
					if (!r) continue;
					const want = t * (sums[g + ch] * r - v[j + ch]) + acc[g + ch];
					const m = want | 0;
					acc[g + ch] = want - m;
					v[j + ch] += m;
				}
			}
		}
		const counts = this.counts[l];
		for (let g = 0; g < c.n * 3; g++) {
			if (!counts[g]) continue;
			const a = acc[g];
			const fix = (a > 0 ? a + 0.5 : a - 0.5) | 0;
			if (!fix) continue;
			const gi = g / 3 | 0;
			const gx = gi % c.w;
			const gy = (gi / c.w) | 0;
			const j = ((gy << l) * w + (gx << l)) * 3 + (g % 3);
			if (j < v.length) v[j] += fix;
		}
	},
};

if (typeof module !== 'undefined') module.exports = { Pressure };
