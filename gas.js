// owns: staggered-grid compressible gas dynamics, per-pair transport, and depletion
// edit for: wave speed/damping mapping, unmixable VOF routing, pair permeability, or sinks

const Gas = {
	w: 0,
	h: 0,
	n: 0,
	k: 0,
	damp: 0,
	invRef: 0,
	lastMode: -1,
	response: null,
	signal: null,
	responseStep: 1,
	allow: [7, 7, 7],
	pq: [1, 1, 1, 1, 1, 1, 1, 1, 1],
	bx: null,
	by: null,
	bax: null,
	bay: null,
	sx: null,
	sy: null,
	sax: null,
	say: null,
	ptot: null,
	outSum: null,
	outScale: null,

	init(w, h) {
		this.w = w;
		this.h = h;
		this.n = w * h;
		this.invRef = 1 / (32 * FP_ONE);
		this.bx = new Float64Array(this.n);
		this.by = new Float64Array(this.n);
		this.bax = [new Float64Array(this.n), new Float64Array(this.n), new Float64Array(this.n)];
		this.bay = [new Float64Array(this.n), new Float64Array(this.n), new Float64Array(this.n)];
		this.sx = [new Float64Array(this.n), new Float64Array(this.n), new Float64Array(this.n)];
		this.sy = [new Float64Array(this.n), new Float64Array(this.n), new Float64Array(this.n)];
		this.sax = [new Float64Array(this.n), new Float64Array(this.n), new Float64Array(this.n)];
		this.say = [new Float64Array(this.n), new Float64Array(this.n), new Float64Array(this.n)];
		this.ptot = new Int32Array(this.n);
		this.signal = new Int32Array(this.n * 3);
		this.outSum = new Float64Array(this.n);
		this.outScale = new Float64Array(this.n);
		this.reset();
	},

	reset() {
		this.lastMode = -1;
		this.clearBulk();
		this.clearSpecies();
	},

	clearBulk() {
		this.bx.fill(0);
		this.by.fill(0);
		for (let c = 0; c < 3; c++) {
			this.bax[c].fill(0);
			this.bay[c].fill(0);
		}
	},

	clearSpecies() {
		for (let c = 0; c < 3; c++) {
			this.sx[c].fill(0);
			this.sy[c].fill(0);
			this.sax[c].fill(0);
			this.say[c].fill(0);
		}
	},

	// Von Neumann bound: k < (1 + damp) / 4 ensures linear wave stability on 4-neighbor grid
	updateParams(s) {
		if (s.gasSpeed <= 0) {
			this.k = 0;
			this.damp = 0;
			return;
		}
		const d = Math.max(0, Math.min(100, s.gasDamping)) / 100;
		const damp = 0.96 - 0.61 * Math.pow(d, 1.45);
		const kMax = 0.85 * (1 + damp) / 4;
		this.damp = damp;
		this.k = Math.min(kMax, (Math.min(100, s.gasSpeed) / 100) * 0.34);
	},

	liveMask(s) {
		const mm = s.mixMask & 7, rr = s.mixRate;
		return ((mm & 1) && rr[0] > 0 ? 1 : 0) |
			((mm & 2) && rr[1] > 0 ? 2 : 0) |
			((mm & 4) && rr[2] > 0 ? 4 : 0);
	},

	// zero-rate pairs close allow so low-density receivers never leak across a checked 0% wall
	rules(s) {
		const q = this.pq, a = this.allow, rr = s.mixRate;
		const live = this.liveMask(s);
		const on0 = live & 1, on1 = live & 2, on2 = live & 4;
		q[1] = q[3] = on0 ? rr[0] / 100 : 0;
		q[2] = q[6] = on1 ? rr[1] / 100 : 0;
		q[5] = q[7] = on2 ? rr[2] / 100 : 0;
		a[0] = 1 | (on0 ? 2 : 0) | (on1 ? 4 : 0);
		a[1] = 2 | (on0 ? 1 : 0) | (on2 ? 4 : 0);
		a[2] = 4 | (on1 ? 1 : 0) | (on2 ? 2 : 0);
		return live;
	},

	step(s) {
		this.updateParams(s);
		const live = this.rules(s);
		this.response = s.response;
		this.responseStep = 1 / Math.max(1, Math.min(2, s.substeps | 0));
		if (this.k <= 0) {
			this.reset();
			return;
		}
		const mix = live ? 1 : 0;
		if (this.lastMode !== -1 && this.lastMode !== mix) {
			if (mix) this.clearBulk();
			else this.clearSpecies();
		}
		this.lastMode = mix;
		if (mix) this.stepMixable(this.k, this.damp);
		else this.stepUnmixable(this.k, this.damp);
	},

	// Route bulk flow without creating or deleting any species.
	pickDonorSpecies(d, r) {
		const c0 = Field.ch[0], c1 = Field.ch[1], c2 = Field.ch[2];
		const d0 = c0[d], d1 = c1[d], d2 = c2[d];
		if (!(d0 + d1 + d2)) return -1;
		const r0 = c0[r], r1 = c1[r], r2 = c2[r];
		let c = -1, best = 0;
		if (d0 > 0 && r0 > best) { best = r0; c = 0; }
		if (d1 > 0 && r1 > best) { best = r1; c = 1; }
		if (d2 > 0 && r2 > best) { best = r2; c = 2; }
		if (c >= 0) return c;
		return (d0 >= d1 && d0 >= d2) ? 0 : (d1 >= d2 ? 1 : 2);
	},

	sendEdge(d, r, fl, e, acc, cap) {
		const c = this.pickDonorSpecies(d, r);
		if (c < 0) return;
		const rc = Field.ch[c];
		const want = fl + acc[c][e];
		let m = want | 0;
		let capped = false;
		if (m > rc[d]) { m = rc[d]; capped = true; }
		const cp = cap[c];
		if (cp > 0 && m > 0) {
			const room = cp - rc[r];
			if (m > room) { m = room > 0 ? room : 0; capped = true; }
		}
		acc[c][e] = capped ? 0 : want - m;
		if (m > 0) {
			rc[d] -= m;
			rc[r] += m;
		}
	},

	sharpen(cap) {
		const w = this.w, h = this.h, ch = Field.ch;
		const c0 = ch[0], c1 = ch[1], c2 = ch[2];
		for (let y = 0; y < h; y++) {
			const row = y * w;
			for (let x = 0; x < w; x++) {
				const i = row + x;
				const r = c0[i], g = c1[i], b = c2[i];
				if ((r > 0 ? 1 : 0) + (g > 0 ? 1 : 0) + (b > 0 ? 1 : 0) <= 1) continue;
				const domC = (r >= g && r >= b) ? 0 : (g >= b ? 1 : 2);
				for (let minC = 0; minC < 3; minC++) {
					if (minC === domC || ch[minC][i] === 0) continue;
					this.swapIfMatch(i, x, y, minC, domC, cap);
				}
			}
		}
		this.smoothInterface(cap);
	},

	nbCount(x, y, c) {
		const w = this.w, dom = Field.dom, i = y * w + x;
		let s = 0;
		if (x > 0 && dom[i - 1] === c) s++;
		if (x + 1 < w && dom[i + 1] === c) s++;
		if (y > 0 && dom[i - w] === c) s++;
		if (y + 1 < this.h && dom[i + w] === c) s++;
		return s;
	},

	// VOF surface tension: pull isolated <=1-neighbor droplets back to their main interface
	smoothInterface(cap) {
		Field.analyze();
		const w = this.w, h = this.h, dom = Field.dom, ch = Field.ch;
		for (let y = 0; y < h; y++) {
			const row = y * w;
			for (let x = 0; x < w; x++) {
				const a = row + x, da = dom[a];
				if (da === NO_COLOR) continue;
				const sa = this.nbCount(x, y, da);
				if (sa >= 2) continue;
				for (let d = 0; d < 4; d++) {
					const nx = d === 0 ? x + 1 : (d === 1 ? x - 1 : x);
					const ny = d === 2 ? y + 1 : (d === 3 ? y - 1 : y);
					if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
					const b = ny * w + nx, db = dom[b];
					if (db === NO_COLOR || db === da) continue;
					const sbForA = this.nbCount(nx, ny, da) - 1;
					const saForB = this.nbCount(x, y, db) - 1;
					const sb = this.nbCount(nx, ny, db);
					if (sbForA <= sa || saForB < sb) continue;
					let sw = ch[da][a] < ch[db][b] ? ch[da][a] : ch[db][b];
					if (cap[da] > 0) { const rm = cap[da] - ch[da][b]; if (sw > rm) sw = rm > 0 ? rm : 0; }
					if (cap[db] > 0) { const rm = cap[db] - ch[db][a]; if (sw > rm) sw = rm > 0 ? rm : 0; }
					if (sw <= 0) continue;
					ch[da][a] -= sw; ch[da][b] += sw;
					ch[db][b] -= sw; ch[db][a] += sw;
					if (ch[db][a] > ch[da][a]) dom[a] = db;
					if (ch[da][b] > ch[db][b]) dom[b] = da;
					break;
				}
			}
		}
	},

	swapPair(i, nb, mArr, dArr, cpM, cpD) {
		if (mArr[nb] < dArr[nb]) return;
		let sw = mArr[i] < dArr[nb] ? mArr[i] : dArr[nb];
		if (cpM > 0) {
			const rm = cpM - mArr[nb];
			if (sw > rm) sw = rm > 0 ? rm : 0;
		}
		if (cpD > 0) {
			const rd = cpD - dArr[i];
			if (sw > rd) sw = rd > 0 ? rd : 0;
		}
		if (sw <= 0) return;
		mArr[i] -= sw; mArr[nb] += sw;
		dArr[nb] -= sw; dArr[i] += sw;
	},

	swapIfMatch(i, x, y, minC, domC, cap) {
		const mArr = Field.ch[minC], dArr = Field.ch[domC];
		const cpM = cap[minC], cpD = cap[domC];
		if (x > 0 && mArr[i]) this.swapPair(i, i - 1, mArr, dArr, cpM, cpD);
		if (x + 1 < this.w && mArr[i]) this.swapPair(i, i + 1, mArr, dArr, cpM, cpD);
		if (y > 0 && mArr[i]) this.swapPair(i, i - this.w, mArr, dArr, cpM, cpD);
		if (y + 1 < this.h && mArr[i]) this.swapPair(i, i + this.w, mArr, dArr, cpM, cpD);
	},

	accelBulkFace(a, b, j, ptot, outSum, damp, k) {
		const pa = ptot[a], pb = ptot[b];
		let fl = j[a];
		if (!pa && !pb && !fl) return;
		fl = damp * fl + k * (pa - pb);
		j[a] = fl;
		if (fl > 0) outSum[a] += fl;
		else if (fl < 0) outSum[b] -= fl;
	},

	transferBulkFace(a, b, j, acc, cap, outScale) {
		const fl = j[a] * (j[a] > 0 ? outScale[a] : outScale[b]);
		j[a] = fl;
		if (fl > 0) this.sendEdge(a, b, fl, a, acc, cap);
		else if (fl < 0) this.sendEdge(b, a, -fl, a, acc, cap);
	},

	// unmixable gases accelerate via shared total pressure and stay separated along a ~1-cell VOF seam
	stepUnmixable(k, damp) {
		const w = this.w, h = this.h, n = this.n;
		const c0 = Field.ch[0], c1 = Field.ch[1], c2 = Field.ch[2];
		const cap = Field.cap;
		const ptot = this.ptot, outSum = this.outSum, outScale = this.outScale;
		const bx = this.bx, by = this.by, bax = this.bax, bay = this.bay;

		for (let i = 0; i < n; i++) ptot[i] = c0[i] + c1[i] + c2[i];
		outSum.fill(0);
		for (let y = 0; y < h; y++) {
			const row = y * w, hasY = y + 1 < h;
			for (let x = 0; x < w; x++) {
				const i = row + x;
				if (x + 1 < w) this.accelBulkFace(i, i + 1, bx, ptot, outSum, damp, k);
				if (hasY) this.accelBulkFace(i, i + w, by, ptot, outSum, damp, k);
			}
		}
		for (let i = 0; i < n; i++) {
			const have = ptot[i];
			outScale[i] = (outSum[i] > have && outSum[i] > 0) ? have / outSum[i] : 1;
		}
		for (let y = 0; y < h; y++) {
			const row = y * w, hasY = y + 1 < h;
			for (let x = 0; x < w; x++) {
				const i = row + x;
				if (x + 1 < w && bx[i]) this.transferBulkFace(i, i + 1, bx, bax, cap, outScale);
				if (hasY && by[i]) this.transferBulkFace(i, i + w, by, bay, cap, outScale);
			}
		}
		this.sharpen(cap);
	},

	// forbidden directions act as a hard valve; allowed foreign gas applies symmetric Maxwell-Stefan drag
	accelMixFace(a, b, j, rc, ptot, outSum, damp, k, c) {
		const ra = rc[a], rb = rc[b];
		let fl = j[a];
		if (!ra && !rb && !fl) return;
		const ma = Field.dom[a], mb = Field.dom[b];
		const alw = this.allow[c];
		const okAB = mb === NO_COLOR || (alw >> mb) & 1;
		const okBA = ma === NO_COLOR || (alw >> ma) & 1;
		if (!okAB && !okBA) {
			j[a] = 0;
			return;
		}
		const oa = ptot[a] - ra, ob = ptot[b] - rb;
		const other = oa + ob;
		if (!other) {
			fl = damp * fl + k * (ra - rb);
		} else {
			const f = other * this.invRef < 1 ? other * this.invRef : 1;
			const q = this.pq;
			const qa = ma === NO_COLOR ? 1 : q[c * 3 + ma];
			const qb = mb === NO_COLOR ? 1 : q[c * 3 + mb];
			const g = f * (oa * (1 - qa) + ob * (1 - qb)) / other;
			fl = damp * (1 - 0.25 * g) * fl + k * (1 - g) * (ra - rb);
		}
		for (let rival = 0; rival < 3; rival++) {
			if (rival === c || !(alw & (1 << rival))) continue;
			const slot = c * 2 + (rival < c ? rival : rival - 1);
			const chi = this.response[slot] / 100 * this.responseStep;
			const delta = (this.signal[rival * this.n + b] - this.signal[rival * this.n + a]) / (CAP_DEF * FP_ONE);
			const drive = chi * delta;
			fl += drive * (drive > 0 ? ra : rb);
		}
		if (!okAB && fl > 0) fl = 0;
		else if (!okBA && fl < 0) fl = 0;
		j[a] = fl;
		if (fl > 0) outSum[a] += fl;
		else if (fl < 0) outSum[b] -= fl;
	},

	sendMix(a, b, j, acc, rc, cp, outScale) {
		const fl = j[a] * (j[a] > 0 ? outScale[a] : outScale[b]);
		j[a] = fl;
		const want = fl + acc[a];
		let m = want | 0;
		let capped = false;
		if (m > rc[a]) { m = rc[a]; capped = true; }
		else if (-m > rc[b]) { m = -rc[b]; capped = true; }
		if (cp > 0) {
			if (m > 0) {
				const room = cp - rc[b];
				if (m > room) { m = room > 0 ? room : 0; capped = true; }
			} else if (m < 0) {
				const room = cp - rc[a];
				if (-m > room) { m = room > 0 ? -room : 0; capped = true; }
			}
		}
		acc[a] = capped ? 0 : want - m;
		if (m) {
			rc[a] -= m;
			rc[b] += m;
		}
	},

	// one shared per-species face flux: opposite species cannot tie against each other through it
	stepMixable(k, damp) {
		this.signal.set(Field.v);
		const w = this.w, h = this.h, n = this.n;
		const c0 = Field.ch[0], c1 = Field.ch[1], c2 = Field.ch[2];
		const cap = Field.cap, ptot = this.ptot;
		const outSum = this.outSum, outScale = this.outScale;

		for (let i = 0; i < n; i++) ptot[i] = c0[i] + c1[i] + c2[i];
		for (let c = 0; c < 3; c++) {
			const rc = c === 0 ? c0 : (c === 1 ? c1 : c2);
			const cp = cap[c];
			const jx = this.sx[c], jy = this.sy[c], ax = this.sax[c], ay = this.say[c];
			outSum.fill(0);
			for (let y = 0; y < h; y++) {
				const row = y * w, hasY = y + 1 < h;
				for (let x = 0; x < w; x++) {
					const i = row + x;
					if (x + 1 < w) this.accelMixFace(i, i + 1, jx, rc, ptot, outSum, damp, k, c);
					if (hasY) this.accelMixFace(i, i + w, jy, rc, ptot, outSum, damp, k, c);
				}
			}
			for (let i = 0; i < n; i++) {
				const have = rc[i];
				outScale[i] = (outSum[i] > have && outSum[i] > 0) ? have / outSum[i] : 1;
			}
			for (let y = 0; y < h; y++) {
				const row = y * w, hasY = y + 1 < h;
				for (let x = 0; x < w; x++) {
					const i = row + x;
					if (x + 1 < w && jx[i]) this.sendMix(i, i + 1, jx, ax, rc, cp, outScale);
					if (hasY && jy[i]) this.sendMix(i, i + w, jy, ay, rc, cp, outScale);
				}
			}
		}
	},

	deplete(s) {
		const d = Math.round(s.depletion * FP_ONE);
		if (d <= 0) return;
		const v = Field.v;
		for (let j = 0; j < v.length; j++) {
			const val = v[j] - d;
			v[j] = val > 0 ? val : 0;
		}
	},
};

if (typeof module !== 'undefined') module.exports = { Gas };
