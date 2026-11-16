// owns: why quantised diffusion stalls — naive 8-bit vs the shipped kernel, 1x128 line
// edit for: profiled frames, rate

const load = require('./load');
const sim = load();
const { Settings, Field, Diffuse, FP, FP_ONE } = sim;

const N = 128;
const marks = [0, 100, 1000, 5000, 20000, 100000];
const frameCap = 100000;

const naive = new Int32Array(N);
naive[N >> 1] = 255;

Field.init(N, 1);
Field.v[(N >> 1) * 3] = 255 * FP_ONE;

Object.assign(Settings, {
	diffusion: 100, brownian: 0, depletion: 0, reaction: 0, sourceRate: 0,
	capBase: 0, blockForeign: 1, foreignRate: 0, substeps: 1, pressure: 0,
});

function stats(v, scale) {
	let sum = 0, max = 0, min = 1e9;
	for (let i = 0; i < N; i++) {
		sum += v[i];
		if (v[i] > max) max = v[i];
		if (v[i] < min) min = v[i];
	}
	const mean = sum / N;
	return { dev: mean > 0 ? (max - mean) / mean * 100 : 0, max: max / scale, min: min / scale, mass: (sum / scale).toFixed(2) };
}

function line(v, scale, frame, tag) {
	const s = stats(v, scale);
	console.log(
		`scheme=${tag} frame=${frame} dev=${s.dev.toFixed(4)}% max=${s.max.toFixed(3)} min=${s.min.toFixed(3)} mass=${s.mass}`
	);
}

function naiveStep(v) {
	const o = Int32Array.from(v);
	for (let i = 0; i < N - 1; i++) {
		const f = ((v[i] - v[i + 1]) * 64) >> 8;
		o[i] -= f;
		o[i + 1] += f;
	}
	return o;
}

function red() {
	const out = new Int32Array(N);
	for (let i = 0; i < N; i++) out[i] = Field.v[i * 3];
	return out;
}

let a = naive;
for (let frame = 0; frame <= frameCap; frame++) {
	if (marks.includes(frame)) {
		line(a, 1, frame, 'naive8');
		line(red(), FP_ONE, frame, 'shipped_q' + FP);
	}
	a = naiveStep(a);
	Field.analyze();
	Field.caps(0, 0);
	Diffuse.diffusion(Settings);
}
