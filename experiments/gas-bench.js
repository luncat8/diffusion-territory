// owns: gas dynamics performance and equalization benchmark
// edit for: parameter sweeps, timing measurements, and gradient profiles

const load = require('./load');
const sim = load();
const { Settings, Field, Source, Gas, Tick, FP_ONE } = sim;

const W = 128, H = 128;

function benchCase(name, over, frames) {
	Field.init(W, H);
	Gas.init(W, H);
	Object.assign(Settings, {
		gasSpeed: 50, gasDamping: 20, depletion: 0, mixMask: 0, mixRate: [50, 50, 50],
		reactMask: 0, reactRate: [5, 5, 5], maxMass: 0, sourceRate: 255, capBase: 0, capTerritory: 100, substeps: 1,
	}, over);
	Source.seed(64, 64, 0);
	Source.seed(20, 100, 1);
	Source.seed(107, 20, 2);

	const t0 = performance.now();
	for (let f = 0; f < frames; f++) Tick.run(Settings);
	const ms = performance.now() - t0;

	let minP = Infinity, maxP = 0, mixed = 0;
	for (let i = 0; i < Field.n; i++) {
		const r = Field.ch[0][i], g = Field.ch[1][i], b = Field.ch[2][i];
		const p = (r + g + b) / FP_ONE;
		if (p < minP) minP = p;
		if (p > maxP) maxP = p;
		if ((r > FP_ONE ? 1 : 0) + (g > FP_ONE ? 1 : 0) + (b > FP_ONE ? 1 : 0) > 1) mixed++;
	}
	console.log(`case=${name} frames=${frames} ms_per_frame=${(ms / frames).toFixed(3)} owned=${Field.owned.join('/')} mixed=${mixed} minP=${minP.toFixed(1)} maxP=${maxP.toFixed(1)}`);
}

benchCase('unmix_default', { mixMask: 0, depletion: 0 }, 1500);
benchCase('unmix_dep03', { mixMask: 0, depletion: 0.3 }, 800);
benchCase('mix_all_react5', { mixMask: 7, mixRate: [50, 50, 50], reactMask: 7, reactRate: [5, 5, 5] }, 1200);
benchCase('mix_rg_only', { mixMask: 1, mixRate: [50, 50, 50] }, 1200);
benchCase('mix100_noreact', { mixMask: 7, mixRate: [100, 100, 100] }, 1200);
benchCase('unmix_fast', { gasSpeed: 90, gasDamping: 10 }, 1000);
