// owns: gas-pressure equalization — masked multigrid V-cycle per color
// edit for: cycle counts, transfer strength, aggregation rule

const MG_RELAX = 0.85;
const MG_BOTTOM_SWEEPS = 30;
const MG_LEVEL_SWEEPS = 2;
const MG_FLAT_QUANTUM = 32;
const MG_CYCLES_AT_100 = 6;

const Pressure = {
	w: 0,
	h: 0,
	hier: [null, null, null],
	snap: [null, null, null],
	acc: null,
	xold: null,
	cycleAcc: 0,
	scratch: null,

	init(w, h) {
		this.w = w;
		this.h = h;
		this.hier = [null, null, null];
		this.snap = [null, null, null];
		this.acc = [new Float64Array(w * h), new Float64Array(w * h), new Float64Array(w * h)];
		this.xold = [new Float64Array(w * h), new Float64Array(w * h), new Float64Array(w * h)];
		this.cycleAcc = 0;
		this.scratch = {};
	},

	// build-time scratch: tower sizes shrink geometrically, reuse the largest
	scratchFor(name, size, ctor) {
		const cur = this.scratch[name];
		if (cur && cur.length >= size) return cur;
		const arr = new ctor(size);
		this.scratch[name] = arr;
		return arr;
	},

	// a gas has no slowest mode: a local walk needs O(N^2) frames to carry a
	// gradient across the grid, the coarse levels carry it in one V-cycle.
	// the slider is a compute budget: 100 buys a full flatten per frame, a
	// fraction queues fractional cycles so weak settings cost almost nothing
	equalize(s) {
		const t = s.pressure / 100;
		if (t <= 0) return;
		this.refresh();
		const cost = this.cycleAcc + t * MG_CYCLES_AT_100;
		const cycles = cost | 0;
		this.cycleAcc = cost - cycles;
		if (!cycles) return;
		const v = Field.v;
		for (let c = 0; c < 3; c++) {
			const H = this.hier[c];
			if (!H) continue;
			this.solve(H, c, cycles, v);
		}
		Field.settle();
	},

	// masks change only when dominance flips; rebuild the hierarchies only then,
	// so a quiet field pays one byte compare per cell and nothing else
	refresh() {
		const dom = Field.dom;
		for (let c = 0; c < 3; c++) {
			let mask = this.snap[c];
			if (mask) {
				let same = true;
				for (let i = 0; i < mask.length; i++) {
					const d = dom[i];
					if (mask[i] !== ((d === c || d === NO_COLOR) ? 1 : 0)) { same = false; break; }
				}
				if (same) continue;
			} else {
				this.snap[c] = mask = new Uint8Array(dom.length);
			}
			for (let i = 0; i < mask.length; i++) { const d = dom[i]; mask[i] = (d === c || d === NO_COLOR) ? 1 : 0; }
			this.hier[c] = this.build(c);
		}
	},

	build(c) {
		const w = this.w;
		const h = this.h;
		const dom = Field.dom;
		const H = { idx: new Int32Array(w * h).fill(-1), cells: null, levels: [] };
		const gx = [];
		const gy = [];
		for (let i = 0; i < Field.n; i++) {
			const d = dom[i];
			if (d !== c && d !== NO_COLOR) continue;
			H.idx[i] = gx.length;
			gx.push(i % w);
			gy.push((i / w) | 0);
		}
		const n0 = gx.length;
		if (!n0) return null;
		const cells = new Int32Array(n0);
		for (let i = 0; i < H.idx.length; i++) if (H.idx[i] >= 0) cells[H.idx[i]] = i;
		H.cells = cells;
		let edgeCount = 0;
		for (let i = 0; i < Field.n; i++) {
			const u = H.idx[i];
			if (u < 0) continue;
			const x = i % w;
			if (x + 1 < w && H.idx[i + 1] >= 0) edgeCount++;
			if (i + w < Field.n && H.idx[i + w] >= 0) edgeCount++;
		}
		const eU = new Int32Array(edgeCount);
		const eV = new Int32Array(edgeCount);
		let ei = 0;
		for (let i = 0; i < Field.n; i++) {
			const u = H.idx[i];
			if (u < 0) continue;
			const x = i % w;
			if (x + 1 < w) { const v2 = H.idx[i + 1]; if (v2 >= 0) { eU[ei] = u; eV[ei] = v2; ei++; } }
			if (i + w < Field.n) { const v2 = H.idx[i + w]; if (v2 >= 0) { eU[ei] = u; eV[ei] = v2; ei++; } }
		}
		let lw = w, lh = h;
		let level = {
			sz: new Float64Array(n0).fill(1),
			gx: Int32Array.from(gx),
			gy: Int32Array.from(gy),
			eU,
			eV,
			eW: new Float64Array(edgeCount).fill(1),
			parent: null,
		};
		for (;;) {
			H.levels.push(level);
			this.finalize(level);
			if (lw === 1 && lh === 1) break;
			lw = Math.max(1, (lw + 1) >> 1);
			lh = Math.max(1, (lh + 1) >> 1);
			level = this.coarsen(level, lw, lh);
		}
		return H;
	},

	// 2x2 blocks with no internal edge split into components, so a wall that
	// runs through a block keeps the two sides on separate coarse nodes.
	// bucket sort + CSR adjacency: no maps, no per-node objects, all flat arrays
	coarsen(level, cw, ch) {
		const n = level.sz.length;
		const slots = cw * ch;
		const counts = this.scratchFor('counts', slots, Int32Array);
		counts.fill(0);
		const gx = level.gx, gy = level.gy;
		for (let i = 0; i < n; i++) counts[((gy[i] >> 1) * cw) + (gx[i] >> 1)]++;
		const offsets = this.scratchFor('offsets', slots + 1, Int32Array);
		for (let s = 0; s < slots; s++) offsets[s + 1] = offsets[s] + counts[s];
		const members = this.scratchFor('members', n, Int32Array);
		const cursor = this.scratchFor('cursor', slots, Int32Array);
		cursor.set(offsets.subarray(0, slots));
		for (let i = 0; i < n; i++) members[cursor[((gy[i] >> 1) * cw) + (gx[i] >> 1)]++] = i;
		const deg = this.scratchFor('deg', n, Int32Array);
		deg.fill(0);
		for (let e = 0; e < level.eU.length; e++) { deg[level.eU[e]]++; deg[level.eV[e]]++; }
		const adjOff = this.scratchFor('adjOff', n + 1, Int32Array);
		for (let i = 0; i < n; i++) adjOff[i + 1] = adjOff[i] + deg[i];
		const adjNode = this.scratchFor('adjNode', level.eU.length * 2, Int32Array);
		const acur = this.scratchFor('acur', n, Int32Array);
		acur.set(adjOff.subarray(0, n));
		for (let e = 0; e < level.eU.length; e++) {
			adjNode[acur[level.eU[e]]++] = level.eV[e];
			adjNode[acur[level.eV[e]]++] = level.eU[e];
		}
		const parent = new Int32Array(n);
		const inSlot = this.scratchFor('inSlot', n, Uint8Array);
		inSlot.fill(0);
		const seen = this.scratchFor('seen', n, Uint8Array);
		seen.fill(0);
		const stack = this.scratchFor('stack', n, Int32Array);
		const compArr = this.scratchFor('compArr', n, Int32Array);
		const nextGx = [], nextGy = [], nextSz = [];
		for (let s = 0; s < slots; s++) {
			const begin = offsets[s], end = offsets[s + 1];
			if (begin === end) continue;
			for (let i = begin; i < end; i++) inSlot[members[i]] = 1;
			const cgy = (s / cw) | 0, cgx = s - cgy * cw;
			for (let i = begin; i < end; i++) {
				const start = members[i];
				if (seen[start]) continue;
				let ns = 0, nc = 0, sz = 0;
				stack[ns++] = start;
				seen[start] = 1;
				while (ns) {
					const u = stack[--ns];
					compArr[nc++] = u;
					sz += level.sz[u];
					for (let a = adjOff[u]; a < adjOff[u + 1]; a++) {
						const nb = adjNode[a];
						if (seen[nb] || !inSlot[nb]) continue;
						seen[nb] = 1;
						stack[ns++] = nb;
					}
				}
				const pid = nextGx.length;
				nextGx.push(cgx);
				nextGy.push(cgy);
				nextSz.push(sz);
				for (let k = 0; k < nc; k++) parent[compArr[k]] = pid;
			}
			for (let i = begin; i < end; i++) { inSlot[members[i]] = 0; seen[members[i]] = 0; }
		}
		const emap = new Map();
		for (let e = 0; e < level.eU.length; e++) {
			const pu = parent[level.eU[e]];
			const pv = parent[level.eV[e]];
			if (pu === pv) continue;
			const a = pu < pv ? pu : pv;
			const b2 = pu < pv ? pv : pu;
			const key = a * 16777216 + b2;
			emap.set(key, (emap.get(key) || 0) + level.eW[e]);
		}
		const cU = [], cV = [], cW = [];
		for (const [key, wt] of emap) {
			cU.push((key / 16777216) | 0);
			cV.push(key % 16777216);
			cW.push(wt);
		}
		level.parent = parent;
		return {
			sz: Float64Array.from(nextSz),
			gx: Int32Array.from(nextGx),
			gy: Int32Array.from(nextGy),
			eU: Int32Array.from(cU),
			eV: Int32Array.from(cV),
			eW: Float64Array.from(cW),
			parent: null,
		};
	},

	// smoother damping in the sz-metric; walls make some nodes degree 1, an
	// isolated node gets k = 0 instead of a division by zero
	finalize(level) {
		const n = level.sz.length;
		const coeff = this.scratchFor('coeff', n, Float64Array);
		coeff.fill(0);
		for (let e = 0; e < level.eU.length; e++) {
			const u = level.eU[e], v = level.eV[e];
			const su = level.sz[u], sv = level.sz[v];
			const g = level.eW[e] * su * sv / (su + sv);
			coeff[u] += g;
			coeff[v] += g;
		}
		let mc = 0;
		for (let i = 0; i < n; i++) { const q = coeff[i] / level.sz[i]; if (q > mc) mc = q; }
		level.k = mc > 0 ? MG_RELAX / mc : 0;
		level.ax = new Float64Array(n);
		level.x = new Float64Array(n);
		level.xold = new Float64Array(n);
		level.rxs = new Float64Array(n);
		level.snap = new Float64Array(n);
	},

	// edge flows cancel pairwise, so every sweep keeps Σ sz·x fixed to the quantum
	sweep(H, l, x, sweeps) {
		const lv = H.levels[l];
		for (let s = 0; s < sweeps; s++) {
			const ax = lv.ax;
			ax.fill(0);
			for (let e = 0; e < lv.eU.length; e++) {
				const u = lv.eU[e], v = lv.eV[e];
				const su = lv.sz[u], sv = lv.sz[v];
				const g = lv.eW[e] * su * sv / (su + sv);
				const fl = g * (x[u] - x[v]);
				ax[u] += fl;
				ax[v] -= fl;
			}
			for (let i = 0; i < lv.sz.length; i++) x[i] -= lv.k * ax[i] / lv.sz[i];
		}
	},

	// size-weighted average restriction; mass is preserved by construction
	restrict(H, l, x) {
		const lv = H.levels[l];
		const coarse = H.levels[l + 1];
		const out = coarse.x;
		out.fill(0);
		const acc = lv.rxs;
		acc.fill(0);
		for (let i = 0; i < lv.sz.length; i++) {
			const p = lv.parent[i];
			out[p] += x[i] * lv.sz[i];
			acc[p] += lv.sz[i];
		}
		for (let i = 0; i < out.length; i++) if (acc[i] > 0) out[i] /= acc[i];
	},

	vcycle(H, l, x) {
		const lv = H.levels[l];
		const top = H.levels.length - 1;
		if (l === top) {
			this.sweep(H, l, x, MG_BOTTOM_SWEEPS);
			return;
		}
		this.sweep(H, l, x, MG_LEVEL_SWEEPS);
		const coarse = H.levels[l + 1];
		this.restrict(H, l, x);
		const cx = coarse.x;
		const cxo = coarse.xold;
		for (let i = 0; i < cx.length; i++) cxo[i] = cx[i];
		this.vcycle(H, l + 1, cx);
		for (let i = 0; i < lv.sz.length; i++) x[i] += cx[lv.parent[i]] - cxo[lv.parent[i]];
		this.sweep(H, l, x, MG_LEVEL_SWEEPS);
	},

	solve(H, c, cycles, v) {
		const lv = H.levels[0];
		const xold = this.xold[c];
		const x = lv.x;
		const snap = lv.snap;
		const cells = H.cells;
		let any = 0;
		for (let i = 0; i < lv.sz.length; i++) {
			const val = v[cells[i] * 3 + c];
			x[i] = val;
			xold[i] = val;
			any |= val;
		}
		if (!any) return; // an all-zero channel is already flat
		for (let cycle = 0; cycle < cycles; cycle++) {
			for (let i = 0; i < lv.sz.length; i++) snap[i] = x[i];
			this.vcycle(H, 0, x);
			let maxDelta = 0;
			for (let i = 0; i < lv.sz.length; i++) {
				const d = x[i] - snap[i];
				const ad = d < 0 ? -d : d;
				if (ad > maxDelta) maxDelta = ad;
			}
			if (maxDelta < MG_FLAT_QUANTUM) break;
		}
		const acc = this.acc[c];
		let sum = 0;
		let arg = -1, argV = 0;
		for (let i = 0; i < lv.sz.length; i++) {
			const cell = cells[i];
			const j = cell * 3 + c;
			const want = x[i] - xold[i] + acc[cell];
			const m = want | 0;
			acc[cell] = want - m;
			v[j] += m;
			sum += m;
			if (v[j] > argV) { argV = v[j]; arg = cell; }
		}
		// hand the rounding leftover to the richest cell so mass is exact by construction
		if (sum && arg >= 0) v[arg * 3 + c] -= sum;
	},
};

if (typeof module !== 'undefined') module.exports = { Pressure };
