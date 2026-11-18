// owns: objective measurement — hold outcome sensitivity to pressure, production, mixing, reaction, color, solution
// edit for: axes, levels, run length, or metric keys

const sim = require('./load')();
const { Settings, Field, Gas, Source, Objective, Presets, SCENES, Tick, Solution } = sim;

const FRAMES = +(process.argv[2] || 360);
const ONLY = process.argv[3] || '';
const PATCH_AT = 60;
const TARGET_S = 3;
const PLAYER = 0;
const SENSITIVE_S = 1;
const SENSITIVE_PCT = 5;
const CLAIM_R = 8;

Field.init(128, 128);
Gas.init(Field.w, Field.h);
Objective.init(Field.w, Field.h);

// the solution axis applies the suggested patch mid-attempt, so its spread is the gain the button buys
const PATCH = { patch: 1 };

const AXES = [
	['pressure', [['low', { gasSpeed: 20 }], ['high', { gasSpeed: 90 }]]],
	['production', [['off', { sourceRate: 0 }], ['high', { sourceRate: 16 }]]],
	['mixing', [['closed', { mixMask: 0 }], ['open', { mixMask: 7, mixRate: [60, 60, 60] }]]],
	['reaction', [
		['off', { mixMask: 7, mixRate: [60, 60, 60], reactMask: 0, reactRate: [0, 0, 0] }],
		['high', { mixMask: 7, mixRate: [60, 60, 60], reactMask: 7, reactRate: [20, 20, 20] }],
	]],
	['solution', [['base', null], ['patch', PATCH]]],
];

// equal opening move for every variant: take a disc inside the ring, then let the rules decide the contest
function claim(player) {
	const cx = Field.w >> 1;
	const cy = Field.h >> 1;
	for (let dy = -CLAIM_R; dy <= CLAIM_R; dy++) {
		for (let dx = -CLAIM_R; dx <= CLAIM_R; dx++) {
			if (dx * dx + dy * dy > CLAIM_R * CLAIM_R) continue;
			const i = (cy + dy) * Field.w + cx + dx;
			Field.ch[0][i] = 0;
			Field.ch[1][i] = 0;
			Field.ch[2][i] = 0;
		}
	}
	Source.paint(cx, cy, player, true, CLAIM_R);
}

function setup(scene, over, player) {
	Presets.apply(Settings, scene);
	if (over && over !== PATCH) Presets.copyRules(Settings, over);
	Settings.paint = player;
	Settings.holdTarget = TARGET_S;
	Field.reset();
	Gas.reset();
	Presets.seed(scene);
	claim(player);
	Field.analyze();
	Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
	Source.prepare(Settings);
	Objective.reset(Settings);
	Solution.last = null;
}

function measure(scene, over, player = PLAYER) {
	setup(scene, over, player);
	const patch = over === PATCH;
	for (let i = 0; i < FRAMES; i++) {
		if (patch && i === PATCH_AT) Solution.apply(Settings, Objective);
		Tick.run(Settings);
	}
	return {
		hold: Objective.best / 60,
		control: Objective.controlFrames / 60,
		share: Objective.peak[player],
		score: Objective.score / 60,
		flips: Objective.flips,
		captures: Objective.captures,
	};
}

function log(scene, axis, level, run) {
	console.log(`scene=${scene} axis=${axis} level=${level} hold_s=${run.hold.toFixed(1)} ` +
		`control_s=${run.control.toFixed(1)} share=${run.share.toFixed(1)} score_s=${run.score.toFixed(1)} flips=${run.flips} captures=${run.captures}`);
}

function mean(values) {
	let sum = 0;
	for (const v of values) sum += v;
	return sum / values.length;
}

function spread(values) {
	let min = Infinity, max = -Infinity;
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return max - min;
}

function flag(controlSpread, shareSpread, scoreSpread) {
	return controlSpread >= SENSITIVE_S || shareSpread >= SENSITIVE_PCT || scoreSpread >= SENSITIVE_S ? 1 : 0;
}

const sceneCount = SCENES.length;
for (const [axis, levels] of AXES) {
	if (ONLY && axis !== ONLY) continue;
	const axisHolds = [];
	const axisControls = [];
	const axisShares = [];
	const axisScores = [];
	for (let scene = 0; scene < sceneCount; scene++) {
		const holds = [];
		const controls = [];
		const shares = [];
		const scores = [];
		for (const [level, over] of levels) {
			const run = measure(scene, over);
			log(scene, axis, level, run);
			holds.push(run.hold);
			controls.push(run.control);
			shares.push(run.share);
			scores.push(run.score);
		}
		axisHolds.push(spread(holds));
		axisControls.push(spread(controls));
		axisShares.push(spread(shares));
		axisScores.push(spread(scores));
		console.log(`scene=${scene} axis=${axis} hold_spread_s=${spread(holds).toFixed(1)} ` +
			`control_spread_s=${spread(controls).toFixed(1)} share_spread_pp=${spread(shares).toFixed(1)} score_spread_s=${spread(scores).toFixed(1)} ` +
			`sensitive=${flag(spread(controls), spread(shares), spread(scores))}`);
	}
	console.log(`axis=${axis} scenes=${sceneCount} mean_hold_spread_s=${mean(axisHolds).toFixed(1)} ` +
		`mean_control_spread_s=${mean(axisControls).toFixed(1)} mean_share_spread_pp=${mean(axisShares).toFixed(1)} mean_score_spread_s=${mean(axisScores).toFixed(1)} ` +
		`sensitive=${flag(mean(axisControls), mean(axisShares), mean(axisScores))}`);
}

const playerHolds = [];
const playerControls = [];
const playerShares = [];
const playerScores = [];
for (let scene = 0; scene < sceneCount && (!ONLY || ONLY === 'player'); scene++) {
	const holds = [];
	const controls = [];
	const shares = [];
	const scores = [];
	for (let player = 0; player < 3; player++) {
		const run = measure(scene, null, player);
		log(scene, 'player', player, run);
		holds.push(run.hold);
		controls.push(run.control);
		shares.push(run.share);
		scores.push(run.score);
	}
	playerHolds.push(spread(holds));
	playerControls.push(spread(controls));
	playerShares.push(spread(shares));
	playerScores.push(spread(scores));
	console.log(`scene=${scene} axis=player hold_spread_s=${spread(holds).toFixed(1)} ` +
		`control_spread_s=${spread(controls).toFixed(1)} share_spread_pp=${spread(shares).toFixed(1)} score_spread_s=${spread(scores).toFixed(1)} ` +
		`sensitive=${flag(spread(controls), spread(shares), spread(scores))}`);
}
if (!ONLY || ONLY === 'player') {
	console.log(`axis=player scenes=${sceneCount} mean_hold_spread_s=${mean(playerHolds).toFixed(1)} ` +
		`mean_control_spread_s=${mean(playerControls).toFixed(1)} mean_share_spread_pp=${mean(playerShares).toFixed(1)} mean_score_spread_s=${mean(playerScores).toFixed(1)} ` +
		`sensitive=${flag(mean(playerControls), mean(playerShares), mean(playerScores))}`);
}
