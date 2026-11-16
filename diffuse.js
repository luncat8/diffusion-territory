// owns: motion kernels — Brownian cell exchange, diffusion flux, color reaction, depletion
// edit for: scheme, stability limit, edge rules

const Diffuse = {
	// parity pairing swaps every cell at most once per pass, so one cell cannot
	// travel far in a single frame and no second buffer is needed
	brownian(s) {
		const prob = s.brownian * 10;
		if (prob <= 0) return;
		const v = Field.v;
		const dom = Field.dom;
		const w = Field.w;
		const h = Field.h;
		const block = s.blockForeign;
		let rnd = Field.rnd;
		for (let y = 0; y < h; y++) {
			const row = y * w;
			for (let x = (y & 1) ? 0 : 1; x < w; x += 2) {
				const a = row + x;
				rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5;
				if ((rnd >>> 0) % 1000 >= prob) continue;
				const dir = (rnd >>> 20) & 3;
				let bx = x;
				let by = y;
				if (dir < 2) bx += dir === 0 ? 1 : -1;
				else by += dir === 2 ? 1 : -1;
				if (bx < 0) bx = 1;
				else if (bx >= w) bx = w - 2;
				if (by < 0) by = 1;
				else if (by >= h) by = h - 2;
				if (bx < 0 || by < 0) continue;
				const b = by * w + bx;
				if (block && dom[a] !== NO_COLOR && dom[b] !== NO_COLOR && dom[a] !== dom[b]) continue;
				const ja = a * 3;
				const jb = b * 3;
				if (v[ja] === v[jb] && v[ja + 1] === v[jb + 1] && v[ja + 2] === v[jb + 2]) continue;
				let t = v[ja]; v[ja] = v[jb]; v[jb] = t;
				t = v[ja + 1]; v[ja + 1] = v[jb + 1]; v[jb + 1] = t;
				t = v[ja + 2]; v[ja + 2] = v[jb + 2]; v[jb + 2] = t;
			}
		}
		Field.rnd = rnd | 0;
	},

	// one flux per edge applied to both ends: exactly conservative, k <= 0.25
	// keeps the 4-neighbour update stable. a rounded flux of zero is replaced by
	// one quantum towards the low side: without that, quantisation makes a
	// staircase a fixed point and the gradient freezes short of flat.
	diffusion(s) {
		if (s.diffusion <= 0) return;
		const k = Math.max(1, Math.round(s.diffusion * 64 / 100));
		const v = Field.v;
		const o = Field.nxt;
		const w = Field.w;
		const h = Field.h;
		const dom = Field.dom;
		const cap = Field.cap;
		const block = s.blockForeign;
		const cut = block ? 0 : (k * s.foreignRate / 100) | 0;
		o.set(v);
		for (let y = 0; y < h; y++) {
			const row = y * w;
			for (let x = 0; x < w; x++) {
				const a = row + x;
				for (let d = 0; d < 2; d++) {
					if (d === 0 ? x + 1 >= w : y + 1 >= h) continue;
					const b = d === 0 ? a + 1 : a + w;
					const ja = a * 3;
					const jb = b * 3;
					const fa = dom[a] !== NO_COLOR;
					const fb = dom[b] !== NO_COLOR;
					for (let c = 0; c < 3; c++) {
						const va = v[ja + c];
						const vb = v[jb + c];
						const diff = va - vb;
						if (!diff) continue;
						let kk = k;
						if ((diff > 0 ? fb : fa) && dom[diff > 0 ? b : a] !== c) {
							if (block) continue;
							kk = cut;
							if (!kk) continue;
						}
						let f = (diff * kk + FP_HALF) >> FP;
						if (!f) f = diff > 0 ? 1 : -1;
						const cp = cap[c];
						if (cp) {
							const room = f > 0 ? cp - vb : cp - va;
							if (f > 0) f = f > room ? (room > 0 ? room : 0) : f;
							else f = -f > room ? (room > 0 ? -room : 0) : f;
							if (!f) continue;
						}
						o[ja + c] -= f;
						o[jb + c] += f;
					}
				}
			}
		}
		Field.v = o;
		Field.nxt = v;
		Field.settle();
	},

	// mixing destroys the shared part of two colors, never the larger one alone
	react(s) {
		const r = s.reaction;
		if (!r) return;
		const v = Field.v;
		for (let i = 0, j = 0; i < Field.n; i++, j += 3) {
			const a = v[j], b = v[j + 1], c = v[j + 2];
			let m = 0;
			if (a > 0 && b > 0) m = a < b ? a : b;
			if (c > 0) {
				if (!m) { if (a > 0) m = a < c ? a : c; else if (b > 0) m = b < c ? b : c; }
				else if (c < m) m = c;
			}
			if (!m) continue;
			const take = (m * r / 100) | 0;
			if (!take) continue;
			if (a > 0) v[j] = a - take;
			if (b > 0) v[j + 1] = b - take;
			if (c > 0) v[j + 2] = c - take;
		}
	},

	deplete(s) {
		const d = s.depletion * FP_ONE;
		if (!d) return;
		const v = Field.v;
		for (let j = 0; j < v.length; j++) {
			const val = v[j] - d;
			v[j] = val > 0 ? val : 0;
		}
	},
};

if (typeof module !== 'undefined') module.exports = { Diffuse };
