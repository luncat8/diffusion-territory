// owns: headless steps-to-uniform comparison of diffusion vs lattice Boltzmann
// edit for: source geometry, uniform thresholds, step caps

const sim = require("../sim.js");
const lbm = require("./lbm.js");
const S = sim.settings, G = sim.grid, N = sim.N, MAXV = sim.MAXV;
const at = (x, y) => y * N + x;

sim.simReset();
S.deplete = 0; S.diffuse = 1020; S.react = 0; S.brownian = 0;
S.maxColor = Infinity; S.territoryCap = 0;
for (let c = 0; c < 3; c++) for (let t = 0; t < 3; t++) { S.crossAllow[c][t] = false; S.crossRate[c][t] = 0; }
for (let y = 0; y < N; y++) sim.simPaint(at(64, y), sim.CH_R);
const minR = () => { let m = MAXV; for (let i = 0; i < G.cells; i++) if (G.ch[0][i] < m) m = G.ch[0][i]; return m; };
let steps = 0, t0 = performance.now();
while (minR() < 250 && steps < 30000) { sim.simStep(); steps++; }
const msDiff = (performance.now() - t0) / steps;
console.log("case=diffuse_uniform steps=" + steps + " ms_per_step=" + msDiff.toFixed(3) +
	" wall_ms=" + (msDiff * steps).toFixed(0) + " min=" + minR().toFixed(2));

lbm.lbmReset();
for (let y = 0; y < N; y++) lbm.lbmPaint(at(64, y), 0);
steps = 0; t0 = performance.now();
let stepsRho = -1, stepsSp = -1;
while (stepsSp < 0 && steps < 5000) {
	lbm.lbmStep(); steps++;
	if (stepsRho < 0 && lbm.lbmMinRho() >= 0.98) stepsRho = steps;
	if (lbm.lbmMinSpecies(0) >= 0.98) stepsSp = steps;
}
const msLbm = (performance.now() - t0) / steps;
console.log("case=lbm_uniform steps_rho=" + stepsRho + " steps_species=" + stepsSp +
	" ms_per_step=" + msLbm.toFixed(3) + " wall_ms=" + (msLbm * steps).toFixed(0) +
	" min_rho=" + lbm.lbmMinRho().toFixed(4) + " species_min=" + lbm.lbmMinSpecies(0).toFixed(4));
