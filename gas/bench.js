// owns: equalization race — local diffusion vs gas pressure on the same field
// edit for: field size, schemes, thresholds

const load = require('../experiments/load');
const sim = load();
const { Settings, Field, Pressure, Tick, FP_ONE } = sim;

const W = 128;
const H = 128;

function seed() {
	Field.init(W, H);
	Pressure.init(W, H);
	for (let y = 0; y < H; y++) Field.v[(y * W + 64) * 3] = 255 * FP_ONE;
}

function metrics() {
	const v = Field.v;
	let sum = 0, max = 0;
	for (let i = 0; i < Field.n; i++) {
		const x = v[i * 3];
		sum += x;
		if (x > max) max = x;
	}
	const mean = sum / Field.n;
	return { mean, dev: mean > 0 ? (max - mean) / mean : 0, sum };
}

function race(name, cfg, frames) {
	seed();
	Object.assign(Settings, {
		diffusion: 0, brownian: 0, depletion: 0, reaction: 0, sourceRate: 0,
		capBase: 0, capTerritory: 100, blockForeign: 1, foreignRate: 0,
		substeps: 1, pressure: 0,
	});
	Object.assign(Settings, cfg);
	const m0 = metrics();
	const t0 = process.hrtime.bigint();
	let hit = -1;
	for (let f = 0; f <= frames; f++) {
		if (hit < 0 && f > 0 && metrics().dev < 0.05) hit = f;
		Tick.run(Settings);
	}
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	const m1 = metrics();
	console.log(
		`scheme=${name} frames_to_5pct=${hit} frames_run=${frames} ms_frame=${(ms / frames).toFixed(3)}` +
		` dev_end=${(m1.dev * 100).toFixed(3)}% mass_drift=${((m1.sum - m0.sum) / m0.sum * 1e6).toFixed(1)}ppm`
	);
}

race('jacobi_k25', { diffusion: 100 }, 40000);
race('jacobi_k25_two_steps', { diffusion: 100, substeps: 2 }, 20000);
race('brownian_on_jacobi', { diffusion: 100, brownian: 100 }, 20000);
race('brownian_only', { diffusion: 0, brownian: 100 }, 2000);
race('pressure_2pct', { pressure: 2 }, 400);
race('pressure_5pct', { pressure: 5 }, 200);
race('pressure_25pct', { pressure: 25 }, 100);
race('pressure_100pct', { pressure: 100 }, 30);
