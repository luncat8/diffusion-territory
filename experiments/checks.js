// owns: validation checks for the rules — mass, sliders, caps, blocking, reaction
// edit for: new rule assertions

const load = require('./load');
const sim = load();
const { Settings, Field, Source, Diffuse, Pressure, Tick, FP, FP_ONE, REF_OWNED } = sim;

const W = 64;
const H = 64;
let failures = 0;

const BASE = {
	diffusion: 100, brownian: 20, depletion: 0, reaction: 0, sourceRate: 0,
	capBase: 0, capTerritory: 100, blockForeign: 1, foreignRate: 0,
	substeps: 1, pressure: 0, paused: 0, paint: 0,
};

function setup(over) {
	Field.init(W, H);
	Pressure.init(W, H);
	Object.assign(Settings, BASE, over);
}

function check(name, ok, value) {
	if (!ok) failures++;
	console.log(`check=${name} ok=${ok ? 1 : 0} value=${value}`);
}

function mass() {
	let s = 0;
	for (let k = 0; k < Field.v.length; k++) s += Field.v[k];
	return s;
}

function massOf(ch) {
	let s = 0;
	for (let i = 0; i < Field.n; i++) s += Field.v[i * 3 + ch];
	return s;
}

function maxOf(ch) {
	let m = 0;
	for (let i = 0; i < Field.n; i++) if (Field.v[i * 3 + ch] > m) m = Field.v[i * 3 + ch];
	return m;
}

function liveCount(ch) {
	let c = 0;
	for (let i = 0; i < Field.n; i++) if (Field.v[i * 3 + ch] > 0) c++;
	return c;
}

function run(n) {
	for (let i = 0; i < n; i++) Tick.run(Settings);
}

// mass conservation of motion only
setup({});
for (let y = 0; y < H; y++) Field.v[(y * W + (W >> 1)) * 3] = 255 * FP_ONE;
const m0 = massOf(0);
run(500);
check('mass_motion', massOf(0) === m0, `${m0} -> ${massOf(0)}`);

// a slider at zero must be a true no-op
for (const off of [{ diffusion: 0, brownian: 0 }, { diffusion: 0, brownian: 100 }, { diffusion: 100, brownian: 0 }]) {
	setup(off);
	for (let y = 0; y < H; y++) Field.v[(y * W + (W >> 1)) * 3] = 255 * FP_ONE;
	const before = Int32Array.from(Field.v);
	run(1);
	if (off.brownian === 0) {
		const same = Int32Array.from(before).every((x, i) => x === Field.v[i]);
		check(`brownian_off_keeps_field_diff_${off.diffusion}`, off.diffusion === 0 ? same : !same, same ? 'identical' : 'changed');
	}
}

setup({ diffusion: 0, brownian: 0 });
for (let y = 0; y < H; y++) Field.v[(y * W + (W >> 1)) * 3] = 255 * FP_ONE;
let before = Int32Array.from(Field.v);
run(50);
check('both_off_is_static', Int32Array.from(before).every((x, i) => x === Field.v[i]), 'identical');

// diffusion rate ordering: stronger slider spreads wider
function spreadAfter(rate, frames) {
	setup({ diffusion: rate });
	for (let y = 0; y < H; y++) Field.v[(y * W + (W >> 1)) * 3] = 255 * FP_ONE;
	run(frames);
	return liveCount(0);
}
const s25 = spreadAfter(25, 100);
const s50 = spreadAfter(50, 100);
const s100 = spreadAfter(100, 100);
check('rate_ordering', s25 <= s50 && s50 <= s100 && s25 < s100, `${s25} <= ${s50} <= ${s100}`);

// low gradient keeps moving: a nearly flat field must still equalise
setup({ diffusion: 100 });
Field.v[(0) * 3] = 255 * FP_ONE;
for (let i = 1; i < Field.n; i++) Field.v[i * 3] = 254 * FP_ONE;
const lowStart = maxOf(0) - 254 * FP_ONE;
run(200);
check('low_gradient_moves', maxOf(0) < 255 * FP_ONE, `max ${(maxOf(0) / FP_ONE).toFixed(3)} spread ${(lowStart / FP_ONE).toFixed(3)}`);

// cap limits the source, never the outflow, and never invents mass
setup({ sourceRate: 32, capBase: 60, capTerritory: 0 });
Source.paint(W >> 1, H >> 1, 0, 1);
run(400);
const capCell = Field.v[((H >> 1) * W + (W >> 1)) * 3];
check('cap_holds_cell', capCell <= 60 * FP_ONE, `${(capCell / FP_ONE).toFixed(2)} <= 60`);
check('cap_no_overshoot_anywhere', maxOf(0) <= 60 * FP_ONE, `${(maxOf(0) / FP_ONE).toFixed(2)}`);

// territory dependence: 2 cells own a bigger per-cell share than 16
setup({ capBase: 50, capTerritory: 100, sourceRate: 0 });
Field.v[0] = 100 * FP_ONE;
Field.v[3] = 100 * FP_ONE;
Field.analyze();
Field.caps(Settings.capBase, Settings.capTerritory);
check('cap_small_territory', Field.cap[0] === 400 * FP_ONE && Field.owned[0] === 2, `cap=${Field.cap[0] / FP_ONE} owned=${Field.owned[0]}`);
for (let i = 0; i < REF_OWNED; i++) Field.v[i * 3] = 100 * FP_ONE;
Field.analyze();
Field.caps(Settings.capBase, Settings.capTerritory);
check('cap_full_territory', Field.cap[0] === 50 * FP_ONE, `cap=${Field.cap[0] / FP_ONE} owned=${Field.owned[0]}`);

// a shrinking cap must not delete the color already in the field
setup({ capBase: 50, capTerritory: 100 });
Field.v[0] = 100 * FP_ONE;
Field.analyze();
Field.caps(Settings.capBase, Settings.capTerritory);
const kept = massOf(0);
run(5);
check('cap_keeps_mass', massOf(0) === kept, `${kept} -> ${massOf(0)}`);

// blocking: color does not enter a cell dominated by another color
setup({ diffusion: 100, blockForeign: 1 });
for (let y = 0; y < H; y++) {
	Field.v[(y * W + 10) * 3] = 200 * FP_ONE;
	Field.v[(y * W + 11) * 3 + 1] = 200 * FP_ONE;
}
run(100);
let leaked = 0;
for (let y = 0; y < H; y++) if (Field.v[(y * W + 11) * 3] > 0) leaked++;
check('block_holds_wall', leaked === 0, `leaked_cells=${leaked}`);

setup({ diffusion: 100, blockForeign: 0, foreignRate: 100 });
for (let y = 0; y < H; y++) {
	Field.v[(y * W + 10) * 3] = 200 * FP_ONE;
	Field.v[(y * W + 11) * 3 + 1] = 200 * FP_ONE;
}
run(100);
leaked = 0;
for (let y = 0; y < H; y++) if (Field.v[(y * W + 11) * 3] > 0) leaked++;
check('open_wall_mixes', leaked > 0, `mixed_cells=${leaked}`);

// reaction removes the shared part of two colors
setup({ reaction: 100, diffusion: 0, brownian: 0 });
Field.v[0] = 200 * FP_ONE;
Field.v[1] = 60 * FP_ONE;
run(1);
check('reaction_takes_min', Field.v[0] === 140 * FP_ONE && Field.v[1] === 0, `r=${Field.v[0] / FP_ONE} g=${Field.v[1] / FP_ONE}`);

// depletion drives a painted field to zero, off it does not
setup({ depletion: 2, diffusion: 0, brownian: 0 });
Field.v[0] = 10 * FP_ONE;
run(10);
check('depletion_drains', Field.v[0] === 0, `r=${Field.v[0] / FP_ONE}`);
setup({ depletion: 0, diffusion: 0, brownian: 0 });
Field.v[0] = 10 * FP_ONE;
run(10);
check('depletion_off_holds', Field.v[0] === 10 * FP_ONE, `r=${Field.v[0] / FP_ONE}`);

// brownian shuffles nearest cells: the blob walks, mass stays put
setup({ diffusion: 0, brownian: 100 });
Field.v[0] = 255 * FP_ONE;
const b0 = massOf(0);
run(100);
check('brownian_mass', massOf(0) === b0, `${b0} -> ${massOf(0)}`);
check('brownian_moves', Field.v[0] < 255 * FP_ONE, `seed_cell=${(Field.v[0] / FP_ONE).toFixed(2)}`);

// source with depletion off keeps filling the map
setup({ sourceRate: 64, depletion: 0 });
Source.paint(W >> 1, H >> 1, 0, 1);
run(3000);
check('fills_without_depletion', liveCount(0) === Field.n, `live=${liveCount(0)} of ${Field.n} max=${(maxOf(0) / FP_ONE).toFixed(0)}`);

// pressure never creates or destroys mass, walls included
setup({ pressure: 10 });
for (let y = 0; y < H; y++) {
	Field.v[(y * W + 10) * 3] = 200 * FP_ONE;
	Field.v[(y * W + 30) * 3 + 1] = 200 * FP_ONE;
}
const p0 = mass();
run(200);
check('pressure_mass', mass() === p0, `${p0} -> ${mass()}`);

// pressure equalises in far fewer frames than a local walk
function frames5(over, limit) {
	setup(over);
	for (let y = 0; y < H; y++) Field.v[(y * W + (W >> 1)) * 3] = 255 * FP_ONE;
	const mean = 255 / W * (128 / W) * 0 + massOf(0) / Field.n;
	for (let f = 1; f <= limit; f++) {
		Tick.run(Settings);
		if ((maxOf(0) - mean) / mean < 0.05) return f;
	}
	return -1;
}
const local = frames5({ diffusion: 100 }, 20000);
const gas = frames5({ pressure: 5 }, 20000);
check('pressure_beats_walk', gas > 0 && (local < 0 || gas * 10 < local), `local=${local} gas=${gas}`);

console.log(`failures=${failures}`);
process.exit(failures ? 1 : 0);
