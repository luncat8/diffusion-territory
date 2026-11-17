// owns: capture-and-hold task variants and default GUI restoration
// edit for: task pools, scene/pigment/target selection, or default reset scope

const TASK_TARGETS = [10, 20, 30, 60];
const TASK_PLAYERS = 3;

const Task = {
	defaults(s, scene) {
		const id = scene === undefined ? s.scene : scene;
		Presets.copyRules(s, UrlSettings.baseline(id));
	},

	generate(s) {
		const scene = (s.scene + 1 + Task.roll(SCENES.length - 1)) % SCENES.length;
		const paint = Task.roll(TASK_PLAYERS);
		const target = TASK_TARGETS[Task.roll(TASK_TARGETS.length)];
		Task.defaults(s, scene);
		s.paint = paint;
		s.holdTarget = target;
	},

	roll(n) {
		return Math.floor(Math.random() * n);
	},
};

if (typeof module !== 'undefined') module.exports = { Task, TASK_TARGETS, TASK_PLAYERS };
