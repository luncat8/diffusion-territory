// owns: solution checks — suggestion plan, pair masks/directions, apply/revert, focus-block coverage, absorb flip
// edit for: suggestion rules, revert contract, or the keys a solution may write

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Settings, Field, Gas, Objective, Tick, Solution, FP_ONE, HOLD_DONE } = require('./load')();

const ROOT = path.join(__dirname, '..');
const KEYS = ['sourceRate', 'sourceMode', 'mixMask', 'reactMask', 'mixRate', 'reactRate', 'reactMode', 'reactDir', 'reactExponent', 'brush', 'gasSpeed', 'gasDamping'];
const BASE = {
	paint: 0, sourceRate: 5, sourceMode: 0, mixMask: 0, mixRate: [50, 50, 50],
	reactMask: 0, reactRate: [2, 2, 2], reactMode: 0, reactDir: [0, 1, 0], reactExponent: 1, brush: 1,
	gasSpeed: 0, gasDamping: 15, depletion: 0, sourceDominance: 2, sourceThreshold: 1,
	capBase: 0, capTerritory: 100, maxMass: 0, playerFlow: 0, response: [0, 0, 0, 0, 0, 0], substeps: 1,
};
let failures = 0;

function check(name, ok, value) {
	if (!ok) failures++;
	console.log(`check=${name} ok=${ok ? 1 : 0} value=${value}`);
}

function state(over) {
	return Object.assign({ player: 0, area: 1809, mass: [1809 * FP_ONE, 400 * FP_ONE, 0], share: [40, 60, 0], control: 0, state: 0 }, over);
}

function fresh(over) {
	const s = {};
	for (const key of Object.keys(BASE)) s[key] = Array.isArray(BASE[key]) ? BASE[key].slice() : BASE[key];
	return Object.assign(s, over);
}

function snapshot(s) {
	return JSON.stringify(KEYS.map(key => s[key]));
}

function controlsScope() {
	const ctx = vm.createContext({});
	for (const file of ['settings.js', 'controls.js']) {
		vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
	}
	return ctx;
}

let dirsOk = true;
let masksOk = true;
let modesOk = true;
for (let player = 0; player < 3; player++) {
	const s = fresh({ paint: player });
	const plan = Solution.apply(s, state({ player }));
	const pairs = Solution.pairs(player);
	for (const p of [0, 1, 2]) {
		const own = pairs.indexOf(p) >= 0;
		if (!!(s.mixMask & (1 << p)) !== own || !!(s.reactMask & (1 << p)) !== own) masksOk = false;
		if (own && s.reactDir[p] !== Solution.dirFor(p, player)) dirsOk = false;
	}
	modesOk = modesOk && s.reactMode === 3 && s.reactExponent === 1 && plan.edits.length > 0;
	Solution.last = null;
}
check('own_pairs_only', masksOk, 'two pairs per pigment');
check('absorb_points_at_rival', dirsOk, 'player consumes rival');
check('absorb_mode_and_dilution', modesOk, 'mode 3, exponent 1');

const raised = fresh();
Solution.apply(raised, state({}));
check('production_raised', raised.sourceRate === 16 && raised.sourceMode === 1, `rate=${raised.sourceRate} rule=${raised.sourceMode}`);
check('pressure_raised', raised.gasSpeed === 90 && raised.gasDamping === 30, `speed=${raised.gasSpeed} damping=${raised.gasDamping}`);
Solution.last = null;

const pure = fresh();
const pureBefore = snapshot(pure);
const purePlan = Solution.suggest(pure, state({}));
check('suggest_does_not_mutate', snapshot(pure) === pureBefore && Solution.last === null && purePlan.edits.length > 0,
	`edits=${purePlan.edits.length} keys=${purePlan.edits.map(e => e.key).join(',')}`);
check('second_rule_set_explained', purePlan.notes.some(n => n.indexOf('pressure:') === 0) &&
	purePlan.notes.some(n => n.indexOf('permeability:') === 0), purePlan.notes.join(' | '));

const keptPressure = fresh({ gasSpeed: 100, gasDamping: 80 });
Solution.apply(keptPressure, state({}));
check('higher_pressure_kept', keptPressure.gasSpeed === 100 && keptPressure.gasDamping === 80,
	`speed=${keptPressure.gasSpeed} damping=${keptPressure.gasDamping}`);
Solution.last = null;

const kept = fresh({ sourceRate: 40, mixRate: [90, 90, 90], reactRate: [30, 30, 30], reactExponent: 2 });
const keptPlan = Solution.apply(kept, state({}));
check('higher_values_kept', kept.sourceRate === 40 && kept.mixRate[0] === 90 && kept.reactRate[0] === 30,
	`rate=${kept.sourceRate} mix=${kept.mixRate[0]} react=${kept.reactRate[0]} edits=${keptPlan.edits.length}`);
Solution.last = null;

const dormant = fresh({ mixMask: 0, reactMask: 0, mixRate: [55, 55, 55], reactRate: [12, 12, 12], reactDir: [0, 0, 0] });
const dormantPlan = Solution.apply(dormant, state({}));
check('disabled_target_pairs_enable', dormant.mixMask === 3 && dormant.reactMask === 3 &&
	dormantPlan.edits.filter(e => e.enable).length === 4,
	`mix=${dormant.mixMask} react=${dormant.reactMask} enabled=${dormantPlan.edits.filter(e => e.enable).length}`);
Solution.last = null;

const before = fresh({ mixMask: 2, reactMask: 0, reactDir: [1, 1, 0] });
const original = snapshot(before);
Solution.apply(before, state({ player: 0 }));
const applied = snapshot(before);
const revertPlan = Solution.revert(before);
check('revert_restores_every_key', applied !== original && snapshot(before) === original && Solution.last === null,
	`edits=${revertPlan.edits.length} keys=${KEYS.length}`);

const setUp = fresh();
Solution.apply(setUp, state({}));
const again = Solution.suggest(setUp, state({}));
check('second_solve_is_noop', again.edits.length === 0 && again.headline.indexOf('already') >= 0, again.headline);
Solution.last = null;

const held = Solution.suggest(fresh(), state({ control: 1, state: HOLD_DONE, share: [70, 20, 0] }));
check('held_objective_noop', held.edits.length === 0 && held.headline === 'objective held', held.headline);

const empty = Solution.suggest(fresh(), state({ mass: [0, 0, 0], share: [0, 100, 0] }));
const editKeys = empty.edits.map(e => e.key);
check('no_pigment_raises_brush', empty.edits.some(e => e.key === 'brush' && e.to === 2) &&
	empty.notes.some(note => note.indexOf('paint inside the ring') >= 0), editKeys.join(','));

const ctx = controlsScope();
const spotKeys = vm.runInContext('SPOT_KEYS', ctx);
const defs = vm.runInContext('CONTROLS', ctx);
const selects = vm.runInContext('SPOT_SELECTS', ctx).map(spec => spec.def.key);
const knobKeys = spotKeys.filter(key => {
	const def = defs.find(d => d.key === key && d.index === undefined);
	return def && !def.labels;
});
const selectKeys = spotKeys.filter(key => {
	const def = defs.find(d => d.key === key && d.index === undefined);
	return def && def.labels;
}).concat(selects);
const covered = key => knobKeys.indexOf(key) >= 0 || selectKeys.indexOf(key) >= 0 ||
	key === 'mixRate' || key === 'reactRate' || key === 'reactDir';
const missing = Solution.keys.filter(key => !covered(key));
check('focus_block_covers_solution', missing.length === 0, `spot=${spotKeys.join('/')} selects=${selects.join('/')} missing=${missing.join('/') || 'none'}`);
const planned = Solution.suggest(fresh(), state({})).edits.map(e => e.key);
check('plan_keys_declared', planned.every(key => Solution.keys.indexOf(key) >= 0), planned.join(','));

function arena(patch) {
	Object.assign(Settings, fresh());
	Settings.paint = 0;
	Field.init(24, 24);
	Gas.init(24, 24);
	Objective.init(24, 24, 6);
	for (let k = 0; k < Objective.area; k++) {
		Field.ch[0][Objective.idx[k]] = 60 * FP_ONE;
		Field.ch[1][Objective.idx[k]] = 255 * FP_ONE;
	}
	Field.analyze();
	Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
	Objective.reset(Settings);
	if (patch) Solution.apply(Settings, Objective);
	for (let i = 0; i < 120; i++) Tick.run(Settings);
	return Objective.counts[0];
}
const baseCount = arena(false);
Solution.last = null;
const solvedCount = arena(true);
check('absorb_flips_contested_cells', baseCount === 0 && solvedCount > Objective.area / 2,
	`base=${baseCount} solved=${solvedCount} area=${Objective.area}`);

console.log(`failures=${failures}`);
process.exit(failures ? 1 : 0);
