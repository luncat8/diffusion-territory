// owns: canvas pixels and pointer -> cell mapping
// edit for: palette, draw pass, hit test

let cvs = null;
let ctx = null;
let img = null;
let px = null;

function renderInit() {
	cvs = $("canv");
	ctx = cvs.getContext("2d");
	img = ctx.createImageData(N, N);
	px = new Uint32Array(img.data.buffer);
}

function renderDraw() {
	const r = grid.ch[CH_R], g = grid.ch[CH_G], b = grid.ch[CH_B];
	for (let i = 0; i < CELLS; i++) {
		px[i] = 0xff000000 | (((b[i] + 0.5) | 0) << 16) | (((g[i] + 0.5) | 0) << 8) | ((r[i] + 0.5) | 0);
	}
	ctx.putImageData(img, 0, 0);
}

function renderPick(clientX, clientY, out) {
	const rect = cvs.getBoundingClientRect();
	const x = Math.floor((clientX - rect.left) * N / rect.width);
	const y = Math.floor((clientY - rect.top) * N / rect.height);
	out[0] = x;
	out[1] = y;
	return x >= 0 && y >= 0 && x < N && y < N;
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = { renderInit, renderDraw, renderPick };
}
