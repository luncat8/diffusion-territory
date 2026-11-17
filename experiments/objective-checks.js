// owns: objective regression checks — zone geometry, zone shares, hold timer, decay, attempt resets
// edit for: zone rules, hold decay, goal target, or objective statistics

const { Settings, Field, Gas, Objective, Tick, FP_ONE, HOLD_ACTIVE, HOLD_DONE } = require('./load')();

const W = 9;
const H = 9;
const R = 2;
let failures = 0;

function check(name, ok, value) {
	if (!ok) failures++;
	console.log(`check=${name} ok=${ok ? 1 : 0} value=${value}`);
}

function setup(over) {
	Field.init(W, H);
	Gas.init(W, H);
	Objective.init(W, H, R);
	Object.assign(Settings, {
		paint: 0, holdTarget: 20, gasSpeed: 0, sourceRate: 0, reactMask: 0, mixMask: 0,
	}, over);
	Objective.reset(Settings);
}

function occupy(player) {
	for (let c = 0; c < 3; c++) Field.ch[c].fill(0);
	for (let k = 0; k < Objective.area; k++) Field.ch[player][Objective.idx[k]] = 255 * FP_ONE;
}

function frame() {
	Field.analyze();
	Objective.step(Settings);
}

setup();
check('zone_geometry', Objective.area === 13 && Objective.needCount === 8 && Objective.cx === 4 && Objective.cy === 4,
	`area=${Objective.area} need=${Objective.needCount}`);

occupy(0);
frame();
check('zone_control_counts', Objective.counts[0] === 13 && Math.round(Objective.share[0]) === 100 &&
	Objective.control === 1 && Objective.hold === 1 && Objective.state === HOLD_ACTIVE,
	`share=${Objective.share[0].toFixed(1)} hold=${Objective.hold}`);

setup({ holdTarget: 0.1 });
occupy(0);
for (let i = 0; i < 6; i++) frame();
check('hold_reaches_target', Objective.state === HOLD_DONE && Objective.hold === Objective.target &&
	Objective.best === Objective.target && Objective.captures === 1,
	`hold=${Objective.hold} target=${Objective.target} state=${Objective.state}`);

setup();
occupy(0);
for (let i = 0; i < 4; i++) frame();
const heldFour = Objective.hold;
occupy(1);
frame();
check('hold_decays_on_loss', Objective.control === 0 && Objective.losses === 1 &&
	Objective.hold === heldFour - 2 && Objective.state !== HOLD_DONE,
	`hold=${Objective.hold} losses=${Objective.losses}`);

for (let i = 0; i < 4; i++) frame();
check('hold_reaches_zero', Objective.hold === 0 && Objective.state !== HOLD_DONE, `hold=${Objective.hold}`);

setup({ paint: 0 });
occupy(0);
frame();
const firstPlayer = Objective.player;
Settings.paint = 1;
occupy(1);
frame();
check('player_switch_resets', Objective.player === 1 && Objective.hold === 1 &&
	firstPlayer === 0 && Objective.captures === 1,
	`player=${Objective.player} hold=${Objective.hold}`);

setup();
occupy(0);
for (let i = 0; i < 61; i++) frame();
const flatTrend = Objective.trend[0];
occupy(1);
for (let i = 0; i < 30; i++) frame();
check('trend_follows_zone_share', Math.abs(flatTrend) < 1 && Objective.trend[0] < -50,
	`flat=${flatTrend.toFixed(2)} drop=${Objective.trend[0].toFixed(1)}`);

setup({ paint: 2 });
occupy(0);
frame();
check('non_player_control_does_not_hold', Objective.control === 0 && Objective.hold === 0 &&
	Objective.share[0] === 100 && Objective.mass[0] > Objective.area * FP_ONE,
	`control=${Objective.control} share_r=${Objective.share[0]}`);

setup({ holdTarget: 1 });
occupy(0);
for (let i = 0; i < 3; i++) Tick.run(Settings);
const targetFrames = Objective.target;
Settings.holdTarget = 0.05;
frame();
check('target_change_retunes_goal', targetFrames === 60 && Objective.target === 3 &&
	Objective.state === HOLD_DONE,
	`target=${targetFrames}->${Objective.target} state=${Objective.state}`);

console.log(`failures=${failures}`);
process.exit(failures ? 1 : 0);
