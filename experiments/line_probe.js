// owns: headless probe of far-field convergence from a 1px line source
// edit for: line geometry, checkpoints, thresholds

const sim = require("../sim.js");
const S = sim.settings, G = sim.grid, N = sim.N, MAXV = sim.MAXV;

const at = (x, y) => y * N + x;
const DISTS = [1, 2, 4, 8, 16, 32, 63];

const clearCross = () => {
	for (let c = 0; c < 3; c++) {
		for (let t = 0; t < 3; t++) {
			S.crossAllow[c][t] = false;
			S.crossRate[c][t] = 0;
		}
	}
};

const paintLine = () => {
	for (let y = 0; y < N; y++) sim.simPaint(at(64, y), sim.CH_R);
};

const paintPoint = () => sim.simPaint(at(64, 64), sim.CH_R);

// reach = max distance with any color, high = max distance at >= 250, sum + per-distance samples
const probe = () => {
	const a = G.ch[0];
	let sum = 0, reach = 0, high = 0, min = MAXV;
	for (let y = 0; y < N; y++) {
		for (let x = 0; x < N; x++) {
			const v = a[at(x, y)];
			sum += v;
			if (v < min) min = v;
			const d = Math.min(Math.abs(x - 64), N - Math.abs(x - 64));
			if (v >= 1 && d > reach) reach = d;
			if (v >= 250 && d > high) high = d;
		}
	}
	let s = "";
	for (let i = 0; i < DISTS.length; i++) s += " d" + DISTS[i] + "=" + a[at(64 + DISTS[i], 64)].toFixed(2);
	return "sum=" + sum.toFixed(1) + " min=" + min.toFixed(2) + " reach=" + reach + " high=" + high + s;
};

// seconds of live play at 60fps = steps * speed / 60
const CHECKS = [100, 300, 1000, 3000, 10000, 30000];
const CHECKS_FAST = [250, 500, 1000, 2000, 4000, 8000];
const CHECKS_MID = [100, 300, 1000, 3000, 10000];

const runCase = (name, rate, keepSource, deplete, checks, paint, brown = 0) => {
	sim.simReset();
	S.deplete = deplete; S.diffuse = rate; S.react = 0;
	S.maxColor = Infinity; S.territoryCap = 0; S.brownian = brown;
	clearCross();
	paint();
	if (!keepSource) for (let i = 0; i < G.cells; i++) G.src[i] = 0;
	let step = 0;
	for (let i = 0; i < checks.length; i++) {
		while (step < checks[i]) { sim.simStep(); step++; }
		console.log("case=" + name + " rate=" + rate + " brown=" + brown + " deplete=" + deplete +
			" step=" + step + " " + probe());
	}
};

runCase("line_src", 128, true, 0, CHECKS, paintLine);
runCase("line_src", 255, true, 0, CHECKS, paintLine);
runCase("line_src", 510, true, 0, CHECKS_FAST, paintLine);
runCase("line_src", 1020, true, 0, CHECKS_FAST, paintLine);
runCase("point_src", 1020, true, 0, CHECKS_FAST, paintPoint);
runCase("line_init", 128, false, 0, CHECKS, paintLine);
runCase("line_src", 128, true, 1, CHECKS, paintLine);
runCase("line_src", 128, true, 0, CHECKS_MID, paintLine, 64);
runCase("line_src", 128, true, 0, CHECKS_MID, paintLine, 255);
