// owns: concentration-driven production, reaction, and local response regressions
// edit for: threshold, fractional demand, source laws, and conservative gradient transport

const assert = require('assert/strict');
const { Settings, Field, Source, Gas, React, Tick, FP_ONE, NO_COLOR } = require('./load')();
const ref = 255 * FP_ONE;
let checks = 0;

function check(name, condition) {
	assert.ok(condition, name);
	checks++;
	console.log(`check=${name} ok=1`);
}

function setup(w = 1, h = 1, over) {
	Field.init(w, h);
	Gas.init(w, h);
	Object.assign(Settings, {
		gasSpeed: 0, gasDamping: 100, mixMask: 7, mixRate: [100, 100, 100],
		reactMask: 0, reactRate: [2, 2, 2], reactMode: 0, reactExponent: 1,
		reactDir: [0, 1, 0], response: [0, 0, 0, 0, 0, 0], depletion: 0,
		playerFlow: 0, maxMass: 0, sourceRate: 5, sourceMode: 0,
		sourceDominance: 2, sourceThreshold: 1, capBase: 0, capTerritory: 0, substeps: 1,
	}, over);
}

function produce() {
	Field.analyze();
	Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
	Source.inject(Settings);
}

for (let mode = 0; mode < 3; mode++) {
	setup(3, 1, { sourceMode: mode });
	Field.ch[0][1] = Math.ceil(ref * 0.05) - 1;
	Field.ch[0][2] = Math.ceil(ref * 0.05);
	const before = Field.ch[0][1];
	produce();
	check(`production_threshold_mode_${mode}`, Field.ch[0][0] === 0 && Field.ch[0][1] === before && Field.ch[0][2] > Math.ceil(ref * 0.05));
	Field.analyze();
	check(`control_threshold_mode_${mode}`, Field.dom[0] === NO_COLOR && Field.dom[1] === NO_COLOR && Field.dom[2] === 0);
}

setup();
Field.ch[0][0] = 100 * FP_ONE;
Field.ch[1][0] = 50 * FP_ONE;
produce();
check('dominance_strict_boundary', Field.ch[0][0] === 100 * FP_ONE && Field.ch[1][0] === 50 * FP_ONE);
Field.ch[0][0]++;
produce();
check('dominance_local_growth', Field.ch[0][0] > 100 * FP_ONE + 1 && Field.ch[1][0] === 50 * FP_ONE);

setup(2, 1, { sourceMode: 1 });
Field.ch[0][0] = Field.ch[0][1] = 100 * FP_ONE;
Field.ch[1][1] = 200 * FP_ONE;
produce();
check('low_pigment_fertility', Field.ch[0][0] > Field.ch[0][1]);

setup(2, 1, { sourceMode: 2, sourceThreshold: 1 });
Field.ch[0][0] = Field.ch[0][1] = 100 * FP_ONE;
Field.ch[1][1] = 155 * FP_ONE;
produce();
check('thresholded_total_boundary', Field.ch[0][0] > 100 * FP_ONE && Field.ch[0][1] === 100 * FP_ONE);

setup(3, 1, { sourceMode: 1, sourceRate: 255 });
Field.ch[0][0] = 25 * FP_ONE;
Field.ch[0][1] = 200 * FP_ONE;
Field.ch[0][2] = ref;
produce();
check('saturation_limits_growth', Field.ch[0][0] - 25 * FP_ONE > Field.ch[0][1] - 200 * FP_ONE && Field.ch[0][2] === ref && Field.ch[0].every(v => v <= ref));

setup(2, 1, { sourceRate: 255, playerFlow: 100 });
Field.ch[0].fill(100 * FP_ONE);
produce();
check('shared_supply_fair_exact', Field.ch[0][0] === 150 * FP_ONE && Field.ch[0][1] === 150 * FP_ONE && Field.total[0] === 300 * FP_ONE);

setup(2, 1, { sourceRate: 255, maxMass: 0.25 });
Field.ch[0].fill(100 * FP_ONE);
produce();
check('production_total_budget', Field.total[0] === 250 * FP_ONE && Field.ch[0][0] === Field.ch[0][1]);

setup(1, 1, { capBase: 100, sourceRate: 255 });
Field.ch[0][0] = 99 * FP_ONE;
for (let t = 0; t < 50; t++) produce();
check('production_cell_ceiling', Field.ch[0][0] <= 100 * FP_ONE && Field.ch[0][0] > 99 * FP_ONE);

setup(1, 1, { sourceMode: 1, sourceRate: 1 });
Field.ch[0][0] = ref - 1;
for (let t = 0; t < 1000; t++) produce();
check('production_fractional_accumulation', Field.ch[0][0] === ref);
Field.reset();
produce();
check('production_reset_no_spontaneous_growth', Field.total[0] === 0 && Source.carry.every(v => v === 0));

setup(1, 1, { sourceRate: 0, reactMask: 1 });
Field.ch[0][0] = Field.ch[1][0] = ref;
Tick.run(Settings);
check('reaction_full_two_percent', Field.ch[0][0] === ref - Math.floor(ref * 0.02) && Field.ch[0][0] === Field.ch[1][0]);

function traceReaction(exponent) {
	setup(1, 1, { sourceRate: 0, reactMask: 1, reactExponent: exponent });
	Field.ch[0][0] = ref;
	Field.ch[1][0] = Math.round(0.1 * FP_ONE);
	Field.analyze();
	for (let t = 0; t < 1000; t++) React.run(Settings);
	return Field.ch[1][0];
}
const trace1 = traceReaction(1), trace2 = traceReaction(2);
check('reaction_trace_fractional_and_slow', trace1 > 0 && trace1 < Math.round(0.1 * FP_ONE));
check('reaction_exponent_suppression', trace2 > trace1);
Field.reset();
Field.ch[0][0] = ref;
Field.analyze();
React.run(Settings);
check('reaction_reset_clears_carry', Field.ch[0][0] === ref && React.fracU.every(v => v === 0) && React.fracV.every(v => v === 0));

for (let mode = 0; mode < 4; mode++) {
	setup(2, 1, { sourceRate: 0, reactMask: 7, reactMode: mode, reactRate: [100, 100, 100], capBase: 255 });
	Field.ch[0].fill(ref);
	Field.ch[1].fill(ref - 100);
	Field.ch[2].fill(ref - 200);
	const mass = Field.v.reduce((a, b) => a + b, 0);
	for (let t = 0; t < 100; t++) Tick.run(Settings);
	check(`reaction_bounds_mode_${mode}`, Field.v.every(v => v >= 0 && v <= ref));
	if (mode === 2) check('conversion_exact_three_species_mass', Field.v.reduce((a, b) => a + b, 0) === mass);
}

function response(slot, strength, closed = false, ceiling = 0, substeps = 1) {
	setup(2, 1, { sourceRate: 0, gasSpeed: 1, capBase: ceiling, substeps });
	const own = Math.floor(slot / 2), index = slot % 2;
	const rival = index < own ? index : index + 1;
	Field.ch[own].fill(100 * FP_ONE);
	Field.ch[rival][0] = FP_ONE;
	Field.ch[rival][1] = 2 * FP_ONE;
	Settings.response[slot] = strength;
	if (closed) Settings.mixMask = own + rival === 1 ? 6 : (own + rival === 2 ? 5 : 3);
	const mass = Field.v.reduce((a, b) => a + b, 0);
	Tick.run(Settings);
	assert.equal(Field.v.reduce((a, b) => a + b, 0), mass);
	assert.ok(Field.v.every(v => v >= 0 && (!ceiling || v <= ceiling * FP_ONE)));
	return Field.ch[own][1];
}

for (let slot = 0; slot < 6; slot++) {
	const neutral = response(slot, 0), toward = response(slot, 100), away = response(slot, -100);
	check(`directional_response_${slot}`, toward > neutral && away < neutral);
	check(`closed_pair_response_${slot}`, response(slot, 100, true) === response(slot, 0, true));
	check(`response_cap_${slot}`, response(slot, 100, false, 100) <= 100 * FP_ONE);
}
check('response_two_substeps_conservative', response(0, 100, false, 0, 2) > response(0, 0, false, 0, 2));

function border(responseStrength) {
	setup(64, 1, { gasSpeed: 20, mixMask: 1, reactMask: 1 });
	Settings.response[0] = responseStrength;
	for (let i = 0; i < 64; i++) Field.ch[i < 32 ? 0 : 1][i] = ref;
	for (let t = 0; t < 300; t++) Tick.run(Settings);
	check('border_trace_gradient_' + responseStrength,
		Field.ch[1][0] > 0 && Field.ch[1][0] < Field.ch[1][8] &&
		Field.ch[1][8] < Field.ch[1][16] && Field.ch[1][16] < Field.ch[1][24] &&
		Field.ch[1][24] < Field.ch[1][31]);
	return Field.ch[0][32];
}
const neutralBorder = border(0), attractedBorder = border(50);
check('attraction_concentrates_red_at_border', attractedBorder > neutralBorder);

setup(4, 4);
Source.paint(1, 1, 0, true);
const painted = Field.ch[0][5];
Source.paint(1, 1, 1, true);
check('paint_preserves_other_pigment', painted === ref && Field.ch[0][5] === ref && Field.ch[1][5] === ref);
Source.paint(1, 1, 0, false);
check('erase_selected_pigment', Field.ch[0][5] === 0 && Field.ch[1][5] === ref);
console.log(`checks=${checks} failures=0`);
