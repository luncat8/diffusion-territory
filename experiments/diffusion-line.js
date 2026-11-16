// owns: headless 1px-line spread test — how far color travels, where it stalls
// edit for: seed patterns, frame budgets, reported metrics

const load = require('./load');
const sim = load();
const { Settings, Field, Pressure, Tick, FP, FP_ONE } = sim;

const W = 128;
const H = 128;
const frames = +(process.argv[2] || 20000);
const report = +(process.argv[3] || 1000);

function seedLine(color) {
	for (let y = 0; y < H; y++) Field.v[(y * W + 64) * 3 + color] = 255 * FP_ONE;
}

function metrics(color) {
	const v = Field.v;
	let sum = 0, max = 0, min = 1e9, live = 0;
	for (let i = 0; i < Field.n; i++) {
		const x = v[i * 3 + color];
		sum += x;
		if (x > max) max = x;
		if (x < min) min = x;
		if (x > 0) live++;
	}
	const mean = sum / Field.n;
	return { mean, max, min, live, dev: mean > 0 ? (max - mean) / mean : 0, sum };
}

function run(s) {
	Field.init(W, H);
	Pressure.init(W, H);
	Object.assign(Settings, {
		diffusion: 100, brownian: 0, depletion: 0, reaction: 0, sourceRate: 0,
		capBase: 0, capTerritory: 100, blockForeign: 1, foreignRate: 0,
		substeps: 1, pressure: 0,
	});
	Object.assign(Settings, s || {});
	seedLine(0);
	const t0 = process.hrtime.bigint();
	let flat = -1;
	for (let f = 0; f <= frames; f++) {
		if (f % report === 0) {
			const m = metrics(0);
			console.log(
				`mode=${tag} frame=${f} mean=${(m.mean / FP_ONE).toFixed(3)} max=${(m.max / FP_ONE).toFixed(3)}` +
				` min=${(m.min / FP_ONE).toFixed(3)} live=${m.live} dev=${(m.dev * 100).toFixed(2)}% mass=${Math.round(m.sum / FP_ONE)}`
			);
		}
		if (flat < 0 && f > 0) {
			const m = metrics(0);
			if (m.dev < 0.05) flat = f;
		}
		Tick.run(Settings);
	}
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	console.log(`mode=${tag} flat_frame=${flat} frames=${frames} ms_total=${ms.toFixed(1)} ms_frame=${(ms / frames).toFixed(3)}`);
}

let tag = 'q8_8';
run({});

tag = 'q8_8_brownian';
run({ brownian: 100 });

tag = 'q8_8_two_steps';
run({ substeps: 2 });

tag = 'q8_8_pressure';
run({ pressure: 5 });
