// owns: node smoke of the sim rules, never loaded by the page
// edit for: scenarios measured, log keys

const sim = require("../sim.js");
const S = sim.settings, G = sim.grid, N = sim.N, MAXV = sim.MAXV;

const at = (x, y) => y * N + x;

const run = frames => {
	for (let f = 0; f < frames; f++) sim.simStep();
};

const scan = () => {
	let t = 0, peak = 0;
	for (let c = 0; c < 3; c++) {
		const a = G.ch[c];
		for (let i = 0; i < G.cells; i++) {
			t += a[i];
			if (a[i] > peak) peak = a[i];
		}
	}
	return [t, peak];
};

const report = (name, extra) => {
	const [t, peak] = scan();
	console.log("case=" + name + " " + extra +
		" r_cells=" + G.count[0] + " g_cells=" + G.count[1] + " b_cells=" + G.count[2] +
		" mixed=" + G.mixed + " total=" + t + " peak=" + peak + " peak_max=" + MAXV);
};

sim.simReset();
S.deplete = 1; S.diffuse = 128; S.crossDiffuse = false; S.diffuseOther = 64; S.react = 8;
sim.simPaint(at(64, 64), sim.CH_R);
run(600);
report("spread", "frames=600 radius=" + Math.sqrt(G.count[0] / Math.PI).toFixed(2));

sim.simReset();
sim.simPaint(at(64, 64), sim.CH_R);
sim.simPaint(at(40, 40), sim.CH_G);
sim.simPaint(at(90, 90), sim.CH_B);
const t0 = performance.now();
run(300);
const ms = (performance.now() - t0) / 300;
report("timing", "steps=300 ms_per_step=" + ms.toFixed(3) + " ms_per_frame_at_speed4=" + (ms * 4).toFixed(2));

sim.simReset();
S.deplete = 0; S.react = 0; S.crossDiffuse = false;
sim.simPaint(at(64, 64), sim.CH_R);
sim.simStep();
sim.simClear(at(64, 64));
const pre = scan()[0];
run(300);
console.log("case=conserve frames=300 total_pre=" + pre + " total_post=" + scan()[0] + " drift=" + (scan()[0] - pre));

// 59 and 68 are mirror images under x -> N-1-x, so both fields must stay exact mirrors
sim.simReset();
S.deplete = 1; S.react = 8; S.crossDiffuse = true;
sim.simPaint(at(59, 64), sim.CH_R);
sim.simPaint(at(68, 64), sim.CH_G);
run(900);
let mismatch = 0, maxDelta = 0;
for (let y = 0; y < N; y++) {
	for (let x = 0; x < N; x++) {
		const d = Math.abs(G.ch[0][y * N + x] - G.ch[1][y * N + (N - 1 - x)]);
		if (d === 0) continue;
		mismatch++;
		if (d > maxDelta) maxDelta = d;
	}
}
report("mirror", "frames=900 mismatch_cells=" + mismatch + " max_delta=" + maxDelta);

const front = (cross, react) => {
	sim.simReset();
	S.deplete = 1; S.crossDiffuse = cross; S.react = react;
	sim.simPaint(at(61, 64), sim.CH_R);
	sim.simPaint(at(67, 64), sim.CH_G);
	run(1200);
	report("front", "frames=1200 gap=6 cross=" + cross + " reaction=" + react);
};
front(false, 0);
front(false, 8);
front(true, 0);
front(true, 8);
