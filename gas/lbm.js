// owns: lattice Boltzmann gas prototype, never loaded by the page
// edit for: lattice constants, viscosity, source pinning

const N = 128;
const CELLS = N * N;
const EX = [0, 1, 0, -1, 0, -1, -1, 1, 1];
const EY = [0, 0, 1, 0, -1, 1, -1, -1, 1];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const CS2 = 1 / 3;
const NU = 0.15;
const OMEGA = 1 / (3 * NU + 0.5);
const RHO0 = 0.1;
const EPS = 1e-12;

const f = [], g = [];
for (let c = 0; c < 3; c++) {
	f.push([]); g.push([]);
	for (let k = 0; k < 9; k++) { f[c].push(new Float64Array(CELLS)); g[c].push(new Float64Array(CELLS)); }
}
const rho = new Float64Array(CELLS);
const rhoK = [new Float64Array(CELLS), new Float64Array(CELLS), new Float64Array(CELLS)];
const velX = new Float64Array(CELLS);
const velY = new Float64Array(CELLS);
const src = new Uint8Array(CELLS);

// streaming destinations with toroidal wrap, precomputed once
const DEST = [];
for (let k = 0; k < 9; k++) {
	const d = new Int32Array(CELLS);
	for (let y = 0; y < N; y++) {
		for (let x = 0; x < N; x++) {
			d[y * N + x] = ((y + EY[k] + N) % N) * N + ((x + EX[k] + N) % N);
		}
	}
	DEST.push(d);
}

function lbmReset() {
	for (let c = 0; c < 3; c++) {
		for (let k = 0; k < 9; k++) { f[c][k].fill(W[k] * RHO0); g[c][k].fill(W[k] * RHO0); }
		rhoK[c].fill(RHO0);
	}
	rho.fill(3 * RHO0); velX.fill(0); velY.fill(0); src.fill(0);
}

function lbmPaint(i, c) {
	src[i] = c + 1;
	for (let k = 0; k < 9; k++) f[c][k][i] = W[k];
}

function lbmStep() {
	for (let i = 0; i < CELLS; i++) {
		let r = 0, mx = 0, my = 0;
		for (let c = 0; c < 3; c++) {
			let rk = 0;
			for (let k = 0; k < 9; k++) { const fk = f[c][k][i]; rk += fk; mx += fk * EX[k]; my += fk * EY[k]; }
			rhoK[c][i] = rk;
			r += rk;
		}
		rho[i] = r;
		let ux = r > EPS ? mx / r : 0, uy = r > EPS ? my / r : 0;
		let u2 = ux * ux + uy * uy;
		if (u2 > 0.25) { const s = 0.5 / Math.sqrt(u2); ux *= s; uy *= s; u2 = 0.25; }
		velX[i] = ux; velY[i] = uy;
		for (let c = 0; c < 3; c++) {
			const rk = rhoK[c][i];
			for (let k = 0; k < 9; k++) {
				const eu = EX[k] * ux + EY[k] * uy;
				const feq = W[k] * rk * (1 + eu / CS2 + eu * eu / (2 * CS2 * CS2) - u2 / (2 * CS2));
				f[c][k][i] += OMEGA * (feq - f[c][k][i]);
			}
		}
	}
	for (let c = 0; c < 3; c++) {
		for (let k = 0; k < 9; k++) {
			const fk = f[c][k], gk = g[c][k], dk = DEST[k];
			for (let i = 0; i < CELLS; i++) gk[dk[i]] = fk[i];
		}
	}
	for (let c = 0; c < 3; c++) {
		for (let k = 0; k < 9; k++) { const t = f[c][k]; f[c][k] = g[c][k]; g[c][k] = t; }
	}
	for (let i = 0; i < CELLS; i++) {
		const c = src[i];
		if (c === 0) continue;
		for (let k = 0; k < 9; k++) f[c - 1][k][i] = W[k];
	}
}

function lbmMinRho() {
	let m = Infinity;
	for (let i = 0; i < CELLS; i++) if (rho[i] < m) m = rho[i];
	return m;
}

function lbmMinSpecies(c) {
	let m = Infinity;
	const s = rhoK[c];
	for (let i = 0; i < CELLS; i++) if (s[i] < m) m = s[i];
	return m;
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = { N, CELLS, rho, rhoK, src, lbmReset, lbmPaint, lbmStep, lbmMinRho, lbmMinSpecies };
}
