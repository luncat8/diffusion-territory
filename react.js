// owns: per-pair overlap reaction modes and pair-level score accumulation
// edit for: reaction laws (mutual, majority, convert, absorb) or pair scoring

const React = {
	generation: -1,
	mode: -1,
	fracU: null,
	fracV: null,
	rq: [0, 0, 0],
	lu: [0, 0, 0],
	lv: [0, 0, 0],
	cellX: [0, 0, 0],
	loss: [0, 0, 0],
	gain: [0, 0, 0],
	sLoss: [1, 1, 1],
	sGain: [1, 1, 1],

	prepare(mode) {
		if (this.generation === Field.generation && this.mode === mode) return;
		this.fracU = new Float64Array(Field.n * 3);
		this.fracV = new Float64Array(Field.n * 3);
		this.generation = Field.generation;
		this.mode = mode;
	},

	// Carry only sub-quantum demand, never blocked consumption from a previous state.
	quantize(value, carry, at, limit) {
		if (!value) { carry[at] = 0; return 0; }
		const demand = value + carry[at];
		const whole = Math.floor(demand);
		const amount = Math.min(whole, Math.max(0, Math.floor(limit)));
		carry[at] = amount < whole ? 0 : demand - whole;
		return amount;
	},

	pairDemand(p, a, b, q, mode, dir) {
		const lo = a < b ? a : b;
		if (mode === 2) {
			if (a === b) return 0;
			const m = lo * q * (a > b ? a - b : b - a) / (a + b);
			if (a > b) this.lv[p] = m;
			else this.lu[p] = m;
			return 1;
		}
		const m = lo * q;
		if (mode === 0) { this.lu[p] = m; this.lv[p] = m; return 1; }
		if (mode === 3) {
			if (dir) this.lu[p] = m;
			else this.lv[p] = m;
			return 1;
		}
		if (a >= b) { this.lv[p] = m; this.lu[p] = m * (b / a); }
		else { this.lu[p] = m; this.lv[p] = m * (a / b); }
		return 1;
	},

	// scale gains separately from losses so capped channels never stall unrelated pairs or leak a quantum
	applyConvert(i) {
		const ch = Field.ch, cap = Field.cap, budget = Field.budget, total = Field.total;
		const burn = Field.pairBurn, net = Field.pairNet;
		const lu = this.lu, lv = this.lv, x = this.cellX;
		const loss = this.loss, gain = this.gain, sLoss = this.sLoss, sGain = this.sGain;
		gain[0] = lv[0] + lv[1]; gain[1] = lu[0] + lv[2]; gain[2] = lu[1] + lu[2];
		for (let c = 0; c < 3; c++) {
			sLoss[c] = loss[c] > x[c] ? x[c] / loss[c] : 1;
			const g = gain[c];
			if (!g) { sGain[c] = 1; continue; }
			let sg = 1;
			if (cap[c] > 0) {
				const r = cap[c] - x[c];
				sg = r <= 0 ? 0 : (r < g ? r / g : 1);
			}
			const rb = budget[c] - total[c];
			if (g * sg > rb) sg = rb > 0 ? rb / g : 0;
			sGain[c] = sg;
		}
		for (let p = 0; p < 3; p++) {
			const u = PAIR_A[p], v = PAIR_B[p];
			const su = sLoss[u] < sGain[v] ? sLoss[u] : sGain[v];
			const sv = sLoss[v] < sGain[u] ? sLoss[v] : sGain[u];
			const at = p * Field.n + i;
			const toV = this.quantize(lu[p] * su, this.fracU, at,
				Math.min(ch[u][i], budget[v] - total[v], cap[v] ? cap[v] - ch[v][i] : Infinity));
			const toU = this.quantize(lv[p] * sv, this.fracV, at,
				Math.min(ch[v][i], budget[u] - total[u], cap[u] ? cap[u] - ch[u][i] : Infinity));
			const d = toU - toV;
			if (!d) continue;
			ch[u][i] += d; total[u] += d;
			ch[v][i] -= d; total[v] -= d;
			burn[p] += d > 0 ? d : -d;
			net[p] += d;
		}
	},

	// only actively mixing pairs may react, protecting 1-cell unmixable VOF seams from false erosion
	run(s) {
		const rm = s.reactMask & Gas.liveMask(s);
		if (!rm) return;
		const rr = s.reactRate, rq = this.rq, dir = s.reactDir;
		const mode = s.reactMode | 0;
		this.prepare(mode);
		for (let p = 0; p < 3; p++) {
			const q = rm & (1 << p) ? Math.min(100, rr[p]) / 100 : 0;
			rq[p] = q;
		}
		if (!(rq[0] || rq[1] || rq[2])) return;
		const ch = Field.ch, total = Field.total, burn = Field.pairBurn, net = Field.pairNet;
		const lu = this.lu, lv = this.lv, x = this.cellX, loss = this.loss;
		for (let i = 0; i < Field.n; i++) {
			x[0] = ch[0][i]; x[1] = ch[1][i]; x[2] = ch[2][i];
			let any = 0;
			for (let p = 0; p < 3; p++) {
				lu[p] = 0; lv[p] = 0;
				const q = rq[p];
				const at = p * Field.n + i;
				const a = x[PAIR_A[p]], b = x[PAIR_B[p]];
				if (!q || !a || !b || (mode === 2 && a === b)) {
					this.fracU[at] = this.fracV[at] = 0;
					continue;
				}
				const ref = CAP_DEF * FP_ONE;
				const product = Math.min(1, a / ref) * Math.min(1, b / ref);
				const factor = s.reactExponent === 2 ? product * product : product;
				any |= this.pairDemand(p, a, b, q * factor, mode, dir[p]);
			}
			if (!any) continue;
			loss[0] = lu[0] + lu[1]; loss[1] = lv[0] + lu[2]; loss[2] = lv[1] + lv[2];
			if (mode === 2) { this.applyConvert(i); continue; }
			let sc = 1;
			for (let c = 0; c < 3; c++) {
				if (loss[c] > x[c]) { const t = x[c] / loss[c]; if (t < sc) sc = t; }
			}
			for (let p = 0; p < 3; p++) {
				const u = PAIR_A[p], v = PAIR_B[p], at = p * Field.n + i;
				const tu = this.quantize(lu[p] * sc, this.fracU, at, ch[u][i]);
				const tv = this.quantize(lv[p] * sc, this.fracV, at, ch[v][i]);
				if (!(tu || tv)) continue;
				ch[u][i] -= tu; total[u] -= tu;
				ch[v][i] -= tv; total[v] -= tv;
				burn[p] += tu > tv ? tu : tv;
				net[p] += tv - tu;
			}
		}
	},
};

if (typeof module !== 'undefined') module.exports = { React };
