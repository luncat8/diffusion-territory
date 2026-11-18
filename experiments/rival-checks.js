// owns: scripted rival regressions — pressure toggle, ring footprint, player order, and source caps
// edit for: rival pressure behavior

const { Settings, Field, Gas, Objective, Rivals, FP_ONE, CAP_DEF, HOLD_DONE } = require('./load')();

const W = 128;
const H = 128;
const R = 24;
let failures = 0;

function check(name, ok, value) {
	if (!ok) failures++;
	console.log(`check=${name} ok=${ok ? 1 : 0} value=${value}`);
}

function setup(player = 0, pressure = 1) {
	Field.init(W, H);
	Gas.init(W, H);
	Objective.init(W, H, R);
	Object.assign(Settings, {
		paint: player, holdTarget: 20, rivalPressure: pressure, paused: 0,
		gasSpeed: 0, gasDamping: 0, depletion: 0, sourceRate: 0,
		mixMask: 0, mixRate: [0, 0, 0], reactMask: 0, reactRate: [0, 0, 0],
		reactMode: 0, reactExponent: 1, maxMass: 0, playerFlow: 0, capBase: 0,
		capTerritory: 100, substeps: 1,
	});
	for (let k = 0; k < Objective.area; k++) Field.ch[player][Objective.idx[k]] = 255 * FP_ONE;
	Field.analyze();
	Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
	Objective.reset(Settings);
	Rivals.init(Settings);
}

function rivalMass(player) {
	let mass = 0;
	for (let i = 0; i < Field.n; i++) mass += Field.ch[player][i];
	return mass;
}

setup(0, 0);
for (let i = 0; i < 180; i++) Rivals.step(Settings);
check('pressure_off_has_no_sources', rivalMass(1) === 0 && rivalMass(2) === 0,
	`mass=${rivalMass(1) + rivalMass(2)}`);

setup();
for (let i = 0; i < 130; i++) Rivals.step(Settings);
Field.analyze();
Objective.read();
check('sources_contest_ring', rivalMass(1) > 0 && rivalMass(2) > 0 &&
	Objective.share[0] < 100 && Objective.neutral > 0,
	`r1=${rivalMass(1)} r2=${rivalMass(2)} share=${Objective.share[0].toFixed(1)} open=${Objective.neutral}`);

setup();
const zone = new Uint8Array(Field.n);
for (let k = 0; k < Objective.area; k++) zone[Objective.idx[k]] = 1;
Rivals.step(Settings);
let inside = true;
for (let i = 0; i < Field.n; i++) {
	if ((Field.ch[1][i] || Field.ch[2][i]) && !zone[i]) { inside = false; break; }
}
check('rival_sources_inside_objective', inside && rivalMass(1) > 0 && rivalMass(2) > 0,
	`inside=${inside ? 1 : 0} mass=${rivalMass(1) + rivalMass(2)}`);

setup(1, 1);
Rivals.step(Settings);
check('active_color_switches_attackers', rivalMass(2) > 0 && rivalMass(0) > 0 && rivalMass(1) === Objective.area * 255 * FP_ONE,
	`r0=${rivalMass(0)} r2=${rivalMass(2)} active=${rivalMass(1)}`);

setup();
Rivals.step(Settings);
const beforeOff = rivalMass(1) + rivalMass(2);
Settings.rivalPressure = 0;
for (let i = 0; i < 30; i++) Rivals.step(Settings);
check('toggle_off_stops_future_supply', rivalMass(1) + rivalMass(2) === beforeOff,
	`before=${beforeOff} after=${rivalMass(1) + rivalMass(2)}`);

setup();
Objective.state = HOLD_DONE;
for (let i = 0; i < 30; i++) Rivals.step(Settings);
check('held_objective_stops_pressure', rivalMass(1) === 0 && rivalMass(2) === 0,
	`mass=${rivalMass(1) + rivalMass(2)}`);

setup();
for (let i = 0; i < 200; i++) Rivals.step(Settings);
Field.analyze();
let withinCaps = true;
for (let p = 0; p < 3; p++) {
	for (let i = 0; i < Field.n; i++) {
		if (Field.ch[p][i] > (Field.cap[p] || CAP_DEF * FP_ONE)) { withinCaps = false; break; }
	}
}
check('rival_sources_respect_cell_caps', withinCaps, `caps=${Field.cap.join('/')}`);

console.log(`failures=${failures}`);
process.exit(failures ? 1 : 0);
