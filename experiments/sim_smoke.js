// owns: node smoke of the sim rules, never loaded by the page
// edit for: scenarios measured, log keys

const sim = require("../sim.js");
const S = sim.settings, G = sim.grid, N = sim.N, MAXV = sim.MAXV;

const at = (x, y) => y * N + x;

const run = frames => {
	for (let f = 0; f < frames; f++) sim.simStep();
};

const clearCross = (rate = 64) => {
	for (let c = 0; c < 3; c++) {
		for (let t = 0; t < 3; t++) {
			S.crossAllow[c][t] = false;
			S.crossRate[c][t] = c === t ? 0 : rate;
		}
	}
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
S.deplete = 1; S.diffuse = 128; S.react = 8;
clearCross(64);
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
S.deplete = 0; S.react = 0; clearCross(64);
sim.simPaint(at(64, 64), sim.CH_R);
sim.simStep();
sim.simClear(at(64, 64));
const pre = scan()[0];
run(300);
console.log("case=conserve frames=300 total_pre=" + pre + " total_post=" + scan()[0] + " drift=" + (scan()[0] - pre));

sim.simReset();
S.deplete = 0; S.diffuse = 255; S.react = 0; clearCross(64);
for (let y = 59; y <= 68; y++) for (let x = 59; x <= 68; x++) G.ch[0][at(x, y)] = MAXV;
const satPre = scan()[0];
sim.simStep();
const cTL = G.ch[0][at(59, 59)], cTR = G.ch[0][at(68, 59)];
const cBL = G.ch[0][at(59, 68)], cBR = G.ch[0][at(68, 68)];
const cDelta = Math.max(cTL, cTR, cBL, cBR) - Math.min(cTL, cTR, cBL, cBR);
console.log("case=conserve_saturated steps=1 total_pre=" + satPre + " total_post=" + scan()[0] +
	" drift=" + (scan()[0] - satPre) + " corner_delta=" + cDelta);

// 59 and 68 are mirror images under x -> N-1-x, so both fields must stay exact mirrors
sim.simReset();
S.deplete = 1; S.diffuse = 128; S.react = 8;
clearCross(64);
S.crossAllow[0][1] = true; S.crossAllow[1][0] = true;
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

const front = (allowRG, react) => {
	sim.simReset();
	S.deplete = 1; S.diffuse = 128; S.react = react;
	clearCross(64);
	S.crossAllow[0][1] = allowRG;
	sim.simPaint(at(61, 64), sim.CH_R);
	sim.simPaint(at(67, 64), sim.CH_G);
	run(1200);
	report("front", "frames=1200 gap=6 allow_rg=" + allowRG + " reaction=" + react);
};
front(false, 0);
front(false, 8);
front(true, 0);
front(true, 8);

// one-sided allow enables both R->G and G->R while keeping B isolated
sim.simReset();
S.deplete = 1; S.diffuse = 128; S.react = 0;
clearCross(64);
S.crossAllow[0][1] = true;
sim.simPaint(at(50, 64), sim.CH_R);
sim.simPaint(at(54, 64), sim.CH_G);
sim.simPaint(at(80, 64), sim.CH_R);
sim.simPaint(at(84, 64), sim.CH_B);
run(600);
console.log("case=pair_isolation allow_rg_only=true r_at_g_src=" + G.ch[0][at(54, 64)] +
	" g_at_r_src=" + G.ch[1][at(50, 64)] + " r_at_b_src=" + G.ch[0][at(84, 64)] +
	" b_at_r_src=" + G.ch[2][at(80, 64)]);

// asymmetric target rates: R penetrates G much further than G penetrates R
sim.simReset();
S.deplete = 1; S.diffuse = 128; S.react = 0;
clearCross(64);
S.crossAllow[0][1] = true;
S.crossRate[0][1] = 128;
S.crossRate[1][0] = 16;
sim.simPaint(at(62, 64), sim.CH_R);
sim.simPaint(at(66, 64), sim.CH_G);
run(600);
console.log("case=asym_rate r_to_g=" + S.crossRate[0][1] + " g_to_r=" + S.crossRate[1][0] +
	" r_cells=" + G.count[0] + " g_cells=" + G.count[1] +
	" r_at_g_src=" + G.ch[0][at(66, 64)] + " g_at_r_src=" + G.ch[1][at(62, 64)]);

// 3-way reaction symmetry when all 3 channels overlap below 2*react
sim.simReset();
S.deplete = 0; S.diffuse = 0; S.react = 8;
clearCross(64);
G.ch[0][at(64, 64)] = 100; G.ch[1][at(64, 64)] = 100; G.ch[2][at(64, 64)] = 100;
G.ch[0][at(65, 64)] = 200; G.ch[1][at(65, 64)] = 200; G.ch[2][at(65, 64)] = 200;
G.ch[0][at(66, 64)] = 100; G.ch[1][at(66, 64)] = 100; G.ch[2][at(66, 64)] = 10;
G.ch[0][at(67, 64)] = 10; G.ch[1][at(67, 64)] = 100; G.ch[2][at(67, 64)] = 100;
sim.simStep();
const d1 = Math.max(G.ch[0][at(64, 64)], G.ch[1][at(64, 64)], G.ch[2][at(64, 64)]) -
	Math.min(G.ch[0][at(64, 64)], G.ch[1][at(64, 64)], G.ch[2][at(64, 64)]);
const d2 = Math.max(G.ch[0][at(65, 64)], G.ch[1][at(65, 64)], G.ch[2][at(65, 64)]) -
	Math.min(G.ch[0][at(65, 64)], G.ch[1][at(65, 64)], G.ch[2][at(65, 64)]);
const dPerm = Math.abs(G.ch[0][at(66, 64)] - G.ch[2][at(67, 64)]) +
	Math.abs(G.ch[1][at(66, 64)] - G.ch[1][at(67, 64)]) +
	Math.abs(G.ch[2][at(66, 64)] - G.ch[0][at(67, 64)]);
console.log("case=react3_sym delta_100=" + d1 + " delta_200=" + d2 +
	" perm_delta=" + dPerm + " rem_100=" + G.ch[0][at(64, 64)] + " rem_200=" + G.ch[0][at(65, 64)]);

// deplete=0 reaches 255 without stalling at integer staircases
sim.simReset();
S.deplete = 0; S.diffuse = 128; S.react = 0;
clearCross(64);
for (let y = 0; y < N; y += 8) for (let x = 0; x < N; x += 8) sim.simPaint(at(x, y), sim.CH_R);
run(5000);
let minV = MAXV, round255 = 0;
for (let i = 0; i < G.cells; i++) {
	const v = G.ch[0][i];
	if (v < minV) minV = v;
	if (((v + 0.5) | 0) >= 255) round255++;
}
console.log("case=deplete_zero frames=5000 min=" + minV.toFixed(6) + " round_255=" + round255 + " cells=" + G.cells);

// maxColor flat cap holds total color <= maxColor regardless of spread
sim.simReset();
S.deplete = 0; S.diffuse = 128; S.react = 0;
S.maxColor = 400; S.territoryCap = 0;
clearCross(64);
sim.simPaint(at(64, 64), sim.CH_R);
sim.simPaint(at(65, 64), sim.CH_R);
run(200);
let sumFlat = 0;
for (let i = 0; i < G.cells; i++) sumFlat += G.ch[0][i];
console.log("case=cap_flat max=400 r_cells=" + G.count[0] + " total=" + sumFlat.toFixed(6));

// territory-dependent cap: 2 boxed-in cells with maxColor=0, territoryCap=200 => cap 400
sim.simReset();
S.deplete = 0; S.diffuse = 128; S.react = 0;
S.maxColor = 0; S.territoryCap = 200;
clearCross(64);
for (let y = 62; y <= 66; y++) {
	for (let x = 62; x <= 67; x++) {
		const isR = y === 64 && (x === 64 || x === 65);
		sim.simPaint(at(x, y), isR ? sim.CH_R : sim.CH_G);
	}
}
run(50);
let sumTerr = 0;
for (let i = 0; i < G.cells; i++) sumTerr += G.ch[0][i];
console.log("case=cap_territory max=0 per_cell=200 r_cells=" + G.count[0] + " total=" + sumTerr.toFixed(6));
S.maxColor = Infinity; S.territoryCap = 0;
