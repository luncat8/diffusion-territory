// owns: simulation invariant and gas dynamics physics checks
// edit for: regression checks and acceptance criteria

const load = require('./load');
const sim = load();
const { Settings, Field, Source, Gas, Tick, FP_ONE, REF_OWNED } = sim;

const W = 128;
const H = 128;
let failures = 0;

function setup(over) {
	Field.init(W, H);
	Gas.init(W, H);
	Object.assign(Settings, {
		gasSpeed: 65,
		gasDamping: 15,
		depletion: 0,
		mixMask: 0,
		mixRate: [50, 50, 50],
		reactMask: 0,
		reactRate: [10, 10, 10],
		reactMode: 0,
		reactDir: [0, 1, 0],
		playerFlow: 0,
		maxMass: 0,
		sourceRate: 255,
		capBase: 0,
		capTerritory: 100,
		substeps: 1,
	}, over);
}

function run(frames) {
	for (let i = 0; i < frames; i++) Tick.run(Settings);
}

function check(name, ok, value) {
	if (!ok) failures++;
	console.log(`check=${name} ok=${ok ? 1 : 0} value=${value}`);
}

function massOf(p) {
	const rc = Field.ch[p];
	let s = 0;
	for (let i = 0; i < Field.n; i++) s += rc[i];
	return s;
}

function maxOf(p) {
	const rc = Field.ch[p];
	let m = 0;
	for (let i = 0; i < Field.n; i++) if (rc[i] > m) m = rc[i];
	return m;
}

// 1. Exact mass conservation (unmixable)
setup({ sourceRate: 0 });
for (let y = 56; y < 72; y++) {
	for (let x = 56; x < 72; x++) Field.ch[0][y * W + x] = 255 * FP_ONE;
}
const m0u = massOf(0);
run(120);
const m1u = massOf(0);
check('mass_motion_unmixable', m0u === m1u, `${m0u} -> ${m1u}`);

// 2. Exact mass conservation (mixable, 3 overlapping species)
setup({ sourceRate: 0, mixMask: 7 });
for (let y = 56; y < 72; y++) {
	for (let x = 56; x < 72; x++) {
		const i = y * W + x;
		Field.ch[0][i] = 200 * FP_ONE;
		Field.ch[1][i + 8] = 150 * FP_ONE;
		Field.ch[2][i - 8] = 100 * FP_ONE;
	}
}
const mm0 = [massOf(0), massOf(1), massOf(2)];
run(120);
const mm1 = [massOf(0), massOf(1), massOf(2)];
check('mass_motion_mixable', mm0[0] === mm1[0] && mm0[1] === mm1[1] && mm0[2] === mm1[2], `${mm0.join(',')} -> ${mm1.join(',')}`);

// 3. Zero speed is a complete no-op
setup({ gasSpeed: 0, sourceRate: 0 });
Field.ch[0][64 * W + 64] = 200 * FP_ONE;
Field.ch[1][64 * W + 65] = 100 * FP_ONE;
const snap = new Int32Array(Field.v);
run(40);
check('zero_speed_is_static', Field.v.every((v, i) => v === snap[i]), 'identical');

// 4. Gas speed ordering
function spreadAfter(speed, frames) {
	setup({ gasSpeed: speed, sourceRate: 0 });
	for (let y = 60; y <= 68; y++) {
		for (let x = 60; x <= 68; x++) Field.ch[0][y * W + x] = 255 * FP_ONE;
	}
	run(frames);
	let live = 0;
	for (let i = 0; i < Field.n; i++) if (Field.ch[0][i] >= FP_ONE) live++;
	return live;
}
const s25 = spreadAfter(25, 60);
const s50 = spreadAfter(50, 60);
const s100 = spreadAfter(100, 60);
check('speed_ordering', s25 <= s50 && s50 <= s100 && s25 < s100, `${s25} <= ${s50} <= ${s100}`);

// 5. Low gradient keeps moving cleanly
setup({ gasSpeed: 100, sourceRate: 0 });
Field.ch[0][0] = 255 * FP_ONE;
for (let i = 1; i < Field.n; i++) Field.ch[0][i] = 254 * FP_ONE;
run(200);
check('low_gradient_moves', maxOf(0) < 255 * FP_ONE, `max=${(maxOf(0) / FP_ONE).toFixed(3)}`);

// 6. Cap enforcement & territory dependence
setup({ sourceRate: 64, capBase: 60, capTerritory: 0 });
Source.paint(64, 64, 0, 1);
run(400);
const capCell = Field.ch[0][64 * W + 64];
check('cap_holds_cell', capCell <= 60 * FP_ONE, `${(capCell / FP_ONE).toFixed(2)} <= 60`);
check('cap_no_overshoot_anywhere', maxOf(0) <= 60 * FP_ONE, `${(maxOf(0) / FP_ONE).toFixed(2)}`);

setup({ capBase: 50, capTerritory: 100, sourceRate: 0 });
Field.ch[0][0] = 100 * FP_ONE;
Field.ch[0][1] = 100 * FP_ONE;
Field.analyze();
Field.caps(Settings.capBase, Settings.capTerritory);
check('cap_small_territory', Field.cap[0] === 400 * FP_ONE && Field.owned[0] === 2, `cap=${Field.cap[0] / FP_ONE}`);
for (let i = 0; i < REF_OWNED; i++) Field.ch[0][i] = 100 * FP_ONE;
Field.analyze();
Field.caps(Settings.capBase, Settings.capTerritory);
check('cap_full_territory', Field.cap[0] === 50 * FP_ONE, `cap=${Field.cap[0] / FP_ONE}`);

setup({ capBase: 50, capTerritory: 100, sourceRate: 0 });
Field.ch[0][0] = 100 * FP_ONE;
Field.analyze();
Field.caps(Settings.capBase, Settings.capTerritory);
const kept = massOf(0);
run(5);
check('cap_keeps_mass', massOf(0) === kept, `${kept} -> ${massOf(0)}`);

// 7. Unmixable equal symmetric pressure holds wall with zero leak
setup({ gasSpeed: 100, sourceRate: 0 });
for (let y = 0; y < H; y++) {
	Field.ch[0][y * W + 63] = 200 * FP_ONE;
	Field.ch[1][y * W + 64] = 200 * FP_ONE;
}
run(100);
let leakedSym = 0;
for (let y = 0; y < H; y++) if (Field.ch[0][y * W + 64] > 0) leakedSym++;
check('unmixable_wall_symmetry', leakedSym === 0, `leaked=${leakedSym}`);

// 8. Unmixable high pressure compresses and pushes low pressure gas cleanly
setup({ gasSpeed: 65, sourceRate: 0 });
for (let y = 0; y < H; y++) {
	for (let x = 0; x < 64; x++) Field.ch[0][y * W + x] = 200 * FP_ONE;
	for (let x = 64; x < W; x++) Field.ch[1][y * W + x] = 50 * FP_ONE;
}
const massG0 = massOf(1);
run(1200);
const massG1 = massOf(1);
let rMaxX = 0, gMinX = W, mixedSeam = 0;
for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		const i = y * W + x;
		if (Field.ch[0][i] > FP_ONE && x > rMaxX) rMaxX = x;
		if (Field.ch[1][i] > FP_ONE && x < gMinX) gMinX = x;
		if (Field.ch[0][i] > FP_ONE && Field.ch[1][i] > FP_ONE) mixedSeam++;
	}
}
check('unmixable_pressure_pushes', rMaxX >= 95 && gMinX >= 95 && massG0 === massG1 && mixedSeam <= 2 * H,
	`rMaxX=${rMaxX} gMinX=${gMinX} mixed=${mixedSeam} mass_ok=${massG0 === massG1}`);

// 9. Unmixable 3-player seeds fill & equalize pressure across the whole grid
setup({ gasSpeed: 70, gasDamping: 15, depletion: 0 });
Source.seed(64, 64, 0);
Source.seed(20, 100, 1);
Source.seed(107, 20, 2);
run(3500);
let minP = Infinity, maxP = 0, liveAll = 0;
for (let i = 0; i < Field.n; i++) {
	const p = (Field.ch[0][i] + Field.ch[1][i] + Field.ch[2][i]) / FP_ONE;
	if (p < minP) minP = p;
	if (p > maxP) maxP = p;
	if (p >= 1) liveAll++;
}
check('unmixable_fills_uniformly', liveAll === Field.n && minP > 210 && maxP < 270,
	`live=${liveAll}/${Field.n} minP=${minP.toFixed(1)} maxP=${maxP.toFixed(1)}`);

// 10. Mixable interpenetration and mixRate ordering
function foreignReach(rate) {
	setup({ gasSpeed: 60, mixMask: 7, mixRate: [rate, rate, rate], sourceRate: 0 });
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < 64; x++) Field.ch[0][y * W + x] = 200 * FP_ONE;
		for (let x = 64; x < W; x++) Field.ch[1][y * W + x] = 200 * FP_ONE;
	}
	run(300);
	let rMassInRight = 0;
	for (let y = 0; y < H; y++) {
		for (let x = 64; x < W; x++) rMassInRight += Field.ch[0][y * W + x];
	}
	return rMassInRight;
}
const m10 = foreignReach(10);
const m50 = foreignReach(50);
const m100 = foreignReach(100);
check('mixable_rate_ordering', m10 > 0 && m10 < m50 && m50 < m100,
	`${Math.round(m10 / FP_ONE)} < ${Math.round(m50 / FP_ONE)} < ${Math.round(m100 / FP_ONE)}`);

// 11. Reaction consumes smaller species in mixable mode and ignores unmixable seam
setup({ gasSpeed: 0, mixMask: 7, mixRate: [100, 100, 100], reactMask: 7, reactRate: [100, 100, 100], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 60 * FP_ONE;
run(1);
check('reaction_takes_min', Field.ch[0][0] === 140 * FP_ONE && Field.ch[1][0] === 0,
	`r=${Field.ch[0][0] / FP_ONE} g=${Field.ch[1][0] / FP_ONE}`);

setup({ gasSpeed: 50, mixMask: 0, reactMask: 7, reactRate: [100, 100, 100], sourceRate: 0 });
for (let y = 0; y < H; y++) {
	for (let x = 0; x < 64; x++) Field.ch[0][y * W + x] = 200 * FP_ONE;
	for (let x = 64; x < W; x++) Field.ch[1][y * W + x] = 50 * FP_ONE;
}
const ur0 = massOf(0), ug0 = massOf(1);
run(100);
Settings.mixMask = 7;
Settings.mixRate = [0, 0, 0];
run(100);
check('unmixable_skips_reaction', massOf(0) === ur0 && massOf(1) === ug0,
	`R:${ur0}->${massOf(0)} G:${ug0}->${massOf(1)}`);

// 12. Depletion > 0 forms a steady spatial gradient; depletion == 0 fills uniformly
setup({ gasSpeed: 65, depletion: 0.5 });
Source.seed(64, 64, 0);
run(600);
const centerVal = Field.ch[0][64 * W + 64] / FP_ONE;
const midVal = Field.ch[0][64 * W + 71] / FP_ONE;
const farVal = Field.ch[0][64 * W + 110] / FP_ONE;
let depLive = 0;
for (let i = 0; i < Field.n; i++) if (Field.ch[0][i] >= FP_ONE) depLive++;
check('depletion_forms_gradient', centerVal >= 250 && midVal > 5 && midVal < 180 && farVal === 0 && depLive < Field.n * 0.25,
	`center=${centerVal.toFixed(1)} mid=${midVal.toFixed(1)} far=${farVal.toFixed(1)} live=${depLive}`);

setup({ gasSpeed: 80, gasDamping: 15, depletion: 0 });
Source.seed(64, 64, 0);
run(5000);
let sMin = Infinity, sMax = 0;
for (let i = 0; i < Field.n; i++) {
	const v = Field.ch[0][i] / FP_ONE;
	if (v < sMin) sMin = v;
	if (v > sMax) sMax = v;
}
check('depletion_off_equalizes_single', sMin > 200 && sMax <= 255.1, `min=${sMin.toFixed(1)} max=${sMax.toFixed(1)}`);

// 13. Visual speed at default settings (neither frozen nor instant full-grid)
setup({});
Source.seed(64, 64, 0);
run(60);
let visLive = 0;
for (let i = 0; i < Field.n; i++) if (Field.ch[0][i] >= FP_ONE) visLive++;
check('visual_speed_1sec', visLive > 500 && visLive < Field.n * 0.65, `live_at_1s=${visLive}`);

// 14. Substeps clamped at max 2
setup({ substeps: 2 });
Source.seed(64, 64, 0);
run(20);
const sub2 = new Int32Array(Field.v);
setup({ substeps: 10 });
Source.seed(64, 64, 0);
run(20);
check('substeps_capped_at_2', Field.v.every((v, i) => v === sub2[i]), '10 clamped to 2');

// 15. Trace 3rd species never paralyzes pairwise reaction
setup({ gasSpeed: 0, mixMask: 7, mixRate: [100, 100, 100], reactMask: 7, reactRate: [50, 50, 50], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 200 * FP_ONE;
Field.ch[2][0] = 10;
run(1);
const expectLeft = 150 * FP_ONE - 2;
check('reaction_3species_no_stall',
	Field.ch[0][0] === expectLeft && Field.ch[0][0] === Field.ch[1][0] && Field.ch[2][0] === 6,
	`r=${(Field.ch[0][0] / FP_ONE).toFixed(2)} g=${(Field.ch[1][0] / FP_ONE).toFixed(2)} b_q=${Field.ch[2][0]}`);

// 16. Mixable default reaction forms visible mixed front without collapsing map to black
setup({ gasSpeed: 65, gasDamping: 15 });
Source.seed(64, 64, 0);
Source.seed(20, 100, 1);
Source.seed(107, 20, 2);
run(1200);
Settings.mixMask = 7;
Settings.mixRate = [50, 50, 50];
Settings.reactMask = 7;
Settings.reactRate = [5, 5, 5];
run(900);
let mixedVis = 0, brightVis = 0;
for (let i = 0; i < Field.n; i++) {
	const r = Field.ch[0][i] >> 12, g = Field.ch[1][i] >> 12, b = Field.ch[2][i] >> 12;
	if ((r > 32 ? 1 : 0) + (g > 32 ? 1 : 0) + (b > 32 ? 1 : 0) >= 2) mixedVis++;
	if (r + g + b > 120) brightVis++;
}
check('mixable_visible_reactive_front', mixedVis > 1500 && brightVis > 4000,
	`mixed=${mixedVis} bright=${brightVis}`);

// 17. Total color limit (maxMass) caps player total and equalizes across map when depletion == 0
setup({ gasSpeed: 85, gasDamping: 15, depletion: 0, maxMass: 400 });
Source.seed(64, 64, 0);
run(3500);
let limMin = Infinity, limMax = 0;
for (let i = 0; i < Field.n; i++) {
	const v = Field.ch[0][i] / FP_ONE;
	if (v < limMin) limMin = v;
	if (v > limMax) limMax = v;
}
check('max_mass_equalizes',
	massOf(0) === 400000 * FP_ONE && limMin > 19 && limMax < 30,
	`mass=${massOf(0) / FP_ONE} min=${limMin.toFixed(1)} max=${limMax.toFixed(1)}`);

// 18. Painting source inside enemy territory purges displaced enemy gas with exact mass conservation
setup({ gasSpeed: 65, gasDamping: 15, sourceRate: 0 });
for (let i = 0; i < Field.n; i++) Field.ch[2][i] = 200 * FP_ONE;
const bInit = massOf(2);
Settings.sourceRate = 255;
Source.paint(64, 64, 0, 1, 1);
run(250);
const centerIdx = 64 * W + 64;
check('paint_in_enemy_purges',
	Field.ch[0][centerIdx] === 255 * FP_ONE && Field.ch[2][centerIdx] === 0 && massOf(2) === bInit,
	`R=${Field.ch[0][centerIdx] / FP_ONE} B_at_src=${Field.ch[2][centerIdx]} B_conserved=${massOf(2) === bInit}`);

// 19. Pair permission is directional: RG on, RB off lets R through G but not through B
setup({ gasSpeed: 60, mixMask: 3, mixRate: [100, 100, 100], sourceRate: 0 });
for (let y = 0; y < H; y++) {
	for (let x = 0; x < 20; x++) Field.ch[0][y * W + x] = 200 * FP_ONE;
	for (let x = 54; x < 74; x++) Field.ch[1][y * W + x] = 200 * FP_ONE;
	for (let x = 20; x < 54; x++) Field.ch[2][y * W + x] = 200 * FP_ONE;
}
run(300);
let rInG = 0, gInB = 0, bInR = 0, bInG = 0;
for (let y = 0; y < H; y++) {
	for (let x = 0; x < 20; x++) bInR += Field.ch[2][y * W + x];
	for (let x = 20; x < 54; x++) bInG += Field.ch[2][y * W + x] - 200 * FP_ONE;
	for (let x = 54; x < 74; x++) rInG += Field.ch[0][y * W + x];
	for (let x = 0; x < 54; x++) gInB += Field.ch[1][y * W + x];
}
check('pair_permission_directional', rInG > 0 && gInB === 0 && bInR > 0,
	`rInG=${Math.round(rInG / FP_ONE)} gInB=${Math.round(gInB / FP_ONE)} bInR_pressure=${Math.round(bInR / FP_ONE)}`);

// 20. Per-pair ordering: a pair open at 90% penetrates further than the same pair at 10%
function reach(rate) {
	setup({ gasSpeed: 60, mixMask: 3, mixRate: [rate, rate, rate], sourceRate: 0 });
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < 64; x++) Field.ch[0][y * W + x] = 200 * FP_ONE;
		for (let x = 64; x < W; x++) Field.ch[1][y * W + x] = 200 * FP_ONE;
	}
	run(300);
	let m = 0;
	for (let y = 0; y < H; y++) for (let x = 64; x < W; x++) m += Field.ch[0][y * W + x];
	return m;
}
const p10 = reach(10);
const p50 = reach(50);
const p90 = reach(90);
check('pair_rate_ordering', p10 > 0 && p10 < p50 && p50 < p90,
	`${Math.round(p10 / FP_ONE)} < ${Math.round(p50 / FP_ONE)} < ${Math.round(p90 / FP_ONE)}`);

// 21. Reaction acts only on permitted pairs, with the configured amount from each side
setup({ gasSpeed: 0, mixMask: 7, mixRate: [100, 100, 100], reactMask: 1, reactRate: [50, 50, 50], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 200 * FP_ONE;
Field.ch[2][0] = 200 * FP_ONE;
run(1);
const rgTake = 200 * 0.25 | 0;
check('react_per_pair_only', Field.ch[0][0] === (200 - rgTake) * FP_ONE &&
	Field.ch[1][0] === (200 - rgTake) * FP_ONE && Field.ch[2][0] === 200 * FP_ONE,
	`r=${Field.ch[0][0] / FP_ONE} g=${Field.ch[1][0] / FP_ONE} b=${Field.ch[2][0] / FP_ONE}`);

setup({ gasSpeed: 0, mixMask: 7, mixRate: [100, 100, 100], reactMask: 7, reactRate: [0, 0, 100], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 200 * FP_ONE;
run(1);
check('react_pair_masked', Field.ch[0][0] === 200 * FP_ONE && Field.ch[1][0] === 200 * FP_ONE,
	`r=${Field.ch[0][0] / FP_ONE} g=${Field.ch[1][0] / FP_ONE}`);

setup({ gasSpeed: 0, mixMask: 7, mixRate: [100, 100, 100], reactMask: 7, reactRate: [10, 0, 0], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 200 * FP_ONE;
const rm0 = [massOf(0), massOf(1)];
run(5);
const dRG = rm0[0] - massOf(0);
check('react_amount_per_frame', dRG > 0 && dRG === rm0[1] - massOf(1),
	`dR=${Math.round(dRG / FP_ONE)} dG=${Math.round((rm0[1] - massOf(1)) / FP_ONE)}`);

// 22. Pair mix rate 0 with the pair checked never leaks even into low-density neighbor
setup({ gasSpeed: 60, mixMask: 3, mixRate: [0, 50, 0], sourceRate: 0 });
for (let y = 0; y < H; y++) {
	for (let x = 0; x < 64; x++) Field.ch[0][y * W + x] = 200 * FP_ONE;
	for (let x = 64; x < W; x++) Field.ch[1][y * W + x] = 10 * FP_ONE;
}
const wall0 = [massOf(0), massOf(1)];
run(200);
let zeroLeak = 0;
for (let y = 0; y < H; y++) for (let x = 64; x < W; x++) zeroLeak += Field.ch[0][y * W + x];
check('mix_rate_zero_is_wall', zeroLeak === 0 && massOf(0) === wall0[0] && massOf(1) === wall0[1],
	`leak=${zeroLeak} mass_ok=${massOf(0) === wall0[0]}`);

// 23. All pairs off is the unmixable wall, all pairs on mixes all three channels
setup({ gasSpeed: 65, gasDamping: 15, sourceRate: 0 });
Source.seed(64, 64, 0);
Source.seed(20, 100, 1);
Source.seed(107, 20, 2);
run(800);
let wallMixed = 0;
for (let i = 0; i < Field.n; i++) {
	const r = Field.ch[0][i], g = Field.ch[1][i], b = Field.ch[2][i];
	if ((r > 0 ? 1 : 0) + (g > 0 ? 1 : 0) + (b > 0 ? 1 : 0) >= 2) wallMixed++;
}
const wallMass = [massOf(0), massOf(1), massOf(2)];
run(200);
check('all_pairs_off_separates', wallMixed <= 400 && massOf(0) === wallMass[0] && massOf(1) === wallMass[1],
	`overlap=${wallMixed}`);

Settings.mixMask = 7;
Settings.mixRate = [50, 50, 50];
run(600);
let allMixed = 0;
for (let i = 0; i < Field.n; i++) {
	const r = Field.ch[0][i], g = Field.ch[1][i], b = Field.ch[2][i];
	if ((r > 0 ? 1 : 0) + (g > 0 ? 1 : 0) + (b > 0 ? 1 : 0) >= 2) allMixed++;
}
check('all_pairs_on_mixes', allMixed > 4000, `overlap=${allMixed}`);

// 24. One-cell seed keeps moving and never gains or loses mass
setup({ gasSpeed: 100, gasDamping: 15, sourceRate: 0 });
Field.ch[0][64 * W + 64] = 255 * FP_ONE;
run(4000);
let live = 0;
for (let i = 0; i < Field.n; i++) if (Field.ch[0][i] > 0) live++;
check('single_quantum_spreads', live > 4000 && massOf(0) === 255 * FP_ONE,
	`live=${live} mass_ok=${massOf(0) === 255 * FP_ONE}`);

// 25. Slow reaction clears minority all the way to 0 (no sub-quantum stall)
setup({ gasSpeed: 0, mixMask: 1, reactMask: 1, reactRate: [5, 0, 0], reactMode: 0, sourceRate: 0 });
Field.ch[0][0] = 2 * FP_ONE;
Field.ch[1][0] = 2 * FP_ONE;
run(9000);
check('react_no_subquantum_stall', Field.ch[0][0] === 0 && Field.ch[1][0] === 0,
	`rem=${Field.ch[0][0]},${Field.ch[1][0]}`);

// 26. Majority mode: denser side loses proportionally less; equal tie is symmetric
setup({ gasSpeed: 0, mixMask: 1, reactMask: 1, reactRate: [50, 0, 0], reactMode: 1, sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 50 * FP_ONE;
Field.ch[0][1] = 120 * FP_ONE;
Field.ch[1][1] = 120 * FP_ONE;
run(1);
const majR = 200 * FP_ONE - Field.ch[0][0], majG = 50 * FP_ONE - Field.ch[1][0];
check('react_majority_law',
	majG === 4 * majR && Field.ch[0][1] === Field.ch[1][1] && Field.pairNet[0] === majG - majR,
	`lossR=${majR / FP_ONE} lossG=${majG / FP_ONE} tie=${Field.ch[0][1] / FP_ONE}`);

// 27. Convert mode: exact total-mass conservation, respects cap & budget, flips minority to majority
setup({ gasSpeed: 65, mixMask: 7, mixRate: [70, 70, 70], reactMask: 7, reactRate: [25, 25, 25], reactMode: 2, sourceRate: 0 });
Source.seed(64, 64, 0);
Source.seed(50, 64, 1);
Source.seed(78, 64, 2);
const convSum0 = massOf(0) + massOf(1) + massOf(2);
run(400);
const convSum1 = massOf(0) + massOf(1) + massOf(2);
check('react_convert_conserves_mass', convSum0 === convSum1 && Field.pairBurn[0] > 0,
	`sum=${convSum0}->${convSum1} burnRG=${Math.round(Field.pairBurn[0] / FP_ONE)}`);

setup({ gasSpeed: 0, mixMask: 1, reactMask: 1, reactRate: [100, 0, 0], reactMode: 2, capBase: 180, capTerritory: 0, sourceRate: 0 });
Field.ch[0][0] = 150 * FP_ONE;
Field.ch[1][0] = 100 * FP_ONE;
run(5);
check('react_convert_respects_cap',
	Field.ch[0][0] === 180 * FP_ONE && Field.ch[1][0] === 70 * FP_ONE,
	`R=${Field.ch[0][0] / FP_ONE} G=${Field.ch[1][0] / FP_ONE}`);

// 28. Absorb mode: consumes only the prey side, flips on reactDir, cyclic 3-way tie stays symmetric
setup({ gasSpeed: 0, mixMask: 1, reactMask: 1, reactRate: [50, 0, 0], reactMode: 3, reactDir: [0, 1, 0], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 100 * FP_ONE;
run(1);
const abs0Ok = Field.ch[0][0] === 200 * FP_ONE && Field.ch[1][0] === 75 * FP_ONE && Field.pairNet[0] === 25 * FP_ONE;
Settings.reactDir[0] = 1;
run(1);
const abs1Ok = Field.ch[0][0] < 200 * FP_ONE && Field.ch[1][0] === 75 * FP_ONE && Field.pairNet[0] < 25 * FP_ONE;
check('react_absorb_directional', abs0Ok && abs1Ok,
	`R=${(Field.ch[0][0] / FP_ONE).toFixed(2)} G=${Field.ch[1][0] / FP_ONE}`);

setup({ gasSpeed: 0, mixMask: 7, reactMask: 7, reactRate: [50, 50, 50], reactMode: 3, reactDir: [0, 1, 0], sourceRate: 0 });
Field.ch[0][0] = 200 * FP_ONE;
Field.ch[1][0] = 200 * FP_ONE;
Field.ch[2][0] = 200 * FP_ONE;
run(1);
check('react_absorb_cyclic_symmetry',
	Field.ch[0][0] === 150 * FP_ONE && Field.ch[1][0] === 150 * FP_ONE && Field.ch[2][0] === 150 * FP_ONE,
	`rgb=${[0, 1, 2].map(c => Field.ch[c][0] / FP_ONE).join('/')}`);

// 29. Pair overlap metric matches live cell counts
setup({ gasSpeed: 0, sourceRate: 0 });
Field.ch[0][0] = 10 * FP_ONE; Field.ch[1][0] = 10 * FP_ONE;
Field.ch[0][1] = 10 * FP_ONE; Field.ch[1][1] = 10 * FP_ONE; Field.ch[2][1] = 10 * FP_ONE;
Field.analyze();
check('pair_cells_counted',
	Field.pairCells[0] === 2 && Field.pairCells[1] === 1 && Field.pairCells[2] === 1,
	`pairs=${Field.pairCells.join('/')}`);

// 30. Shared player supply splits evenly (no scanline bias) and creates emergent concentration sweet spot
setup({ gasSpeed: 0, sourceRate: 255, playerFlow: 100 });
Source.paint(10, 10, 0, 1, 0);
Source.paint(110, 110, 0, 1, 0);
run(1);
const sA = Field.ch[0][10 * W + 10], sB = Field.ch[0][110 * W + 110];
check('player_flow_fair_split',
	sA + sB === 100 * FP_ONE && Math.abs(sA - sB) <= 1,
	`a=${sA / FP_ONE} b=${sB / FP_ONE}`);

setup({ gasSpeed: 65, gasDamping: 15, depletion: 0.15, sourceRate: 255, playerFlow: 300 });
Source.paint(32, 44, 0, 1, 0);
Source.paint(32, 64, 0, 1, 0);
Source.paint(32, 84, 0, 1, 0);
for (let gx = 0; gx < 5; gx++) {
	for (let gy = 0; gy < 8; gy++) Source.paint(76 + gx * 10, 16 + gy * 13, 1, 1, 0);
}
run(600);
check('player_flow_punishes_overspread',
	Field.owned[0] > Field.owned[1] * 2,
	`focused3=${Field.owned[0]} spammed40=${Field.owned[1]}`);

console.log(`failures=${failures}`);
process.exit(failures ? 1 : 0);
