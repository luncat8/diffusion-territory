// owns: reproducible visual test scenes and their simulation settings
// edit for: scene layouts, names, or starting conditions

const SCENES = [
	{ name: 'Classic seeds', layout: 'classic' },
	{ name: 'Three-way junction', layout: 'junction' },
	{ name: 'Pair contact', layout: 'pair' },
	{ name: 'Absorption front', layout: 'absorb' },
	{ name: 'Pressure bubble', layout: 'bubble' },
	{ name: 'Growing colonies', layout: 'colonies' },
];

const SCENE_DEFAULTS = {
	gasSpeed: 65, gasDamping: 15, depletion: 0,
	mixMask: 0, mixRate: [50, 50, 50],
	reactMask: 0, reactRate: [2, 2, 2], reactMode: 0, reactExponent: 1,
	reactDir: [0, 1, 0], response: [0, 0, 0, 0, 0, 0],
	sourceRate: 5, sourceMode: 0, sourceDominance: 2, sourceThreshold: 1,
	capBase: 0, capTerritory: 100, maxMass: 0, playerFlow: 0,
	substeps: 1, showSources: 0, holdTarget: 20,
};

const SCENE_RULES = [
	{},
	{ gasSpeed: 55, gasDamping: 22, mixMask: 7, mixRate: [55, 55, 55], reactMask: 7, reactRate: [8, 8, 8], sourceRate: 0 },
	{ gasSpeed: 60, gasDamping: 28, mixMask: 1, mixRate: [75, 50, 50], reactMask: 1, reactRate: [14, 2, 2], reactMode: 2, sourceRate: 0 },
	{ gasSpeed: 70, gasDamping: 20, mixMask: 1, mixRate: [80, 50, 50], reactMask: 1, reactRate: [22, 2, 2], reactMode: 3, reactDir: [1, 1, 0], sourceRate: 0 },
	{ gasSpeed: 90, gasDamping: 5, sourceRate: 0 },
	{ gasSpeed: 50, gasDamping: 30, depletion: 0.8, mixMask: 7, mixRate: [45, 45, 45], reactMask: 7, reactRate: [3, 3, 3], reactMode: 1, sourceRate: 9, sourceMode: 1, capBase: 255 },
];

const Presets = {
	apply(s, index) {
		const id = Math.max(0, Math.min(SCENES.length - 1, index | 0));
		Presets.copyRules(s, SCENE_DEFAULTS);
		Presets.copyRules(s, SCENE_RULES[id]);
		s.scene = id;
		s.paused = 0;
	},

	copyRules(s, rules) {
		for (const key of Object.keys(rules)) {
			s[key] = Array.isArray(rules[key]) ? rules[key].slice() : rules[key];
		}
	},

	seed(index) {
		const layout = SCENES[index].layout;
		if (layout === 'classic') Presets.classic();
		if (layout === 'junction') Presets.junction();
		if (layout === 'pair') Presets.pair();
		if (layout === 'absorb') Presets.absorb();
		if (layout === 'bubble') Presets.bubble();
		if (layout === 'colonies') Presets.colonies();
	},

	classic() {
		Source.seed(64, 64, 0);
		Source.seed(20, 100, 1);
		Source.seed(107, 20, 2);
	},

	set(player, x, y, value = 255) {
		if (x < 0 || y < 0 || x >= Field.w || y >= Field.h) return;
		Field.ch[player][y * Field.w + x] = value * FP_ONE;
	},

	junction() {
		const sx = [32, 96, 64], sy = [32, 32, 96];
		for (let y = 0; y < Field.h; y++) {
			for (let x = 0; x < Field.w; x++) {
				let winner = 0;
				let best = Infinity;
				for (let p = 0; p < 3; p++) {
					const dx = x - sx[p], dy = y - sy[p];
					const dist = dx * dx + dy * dy;
					if (dist < best) { best = dist; winner = p; }
				}
				Presets.set(winner, x, y);
			}
		}
	},

	pair() {
		for (let y = 0; y < Field.h; y++) {
			for (let x = 0; x < Field.w; x++) Presets.set(x < Field.w / 2 ? 0 : 1, x, y);
		}
	},

	absorb() {
		Presets.pair();
		const cx = Field.w / 2, cy = Field.h / 2;
		for (let y = cy - 8; y <= cy + 8; y++) {
			for (let x = cx - 8; x <= cx + 8; x++) {
				const dx = x - cx, dy = y - cy;
				if (dx * dx + dy * dy <= 64) Presets.set(2, x, y, 190);
			}
		}
	},

	bubble() {
		const cx = Field.w / 2, cy = Field.h / 2;
		const radius = Math.min(Field.w, Field.h) * 0.22;
		for (let y = 0; y < Field.h; y++) {
			for (let x = 0; x < Field.w; x++) {
				const dx = x - cx, dy = y - cy;
				if (dx * dx + dy * dy <= radius * radius) Presets.set(0, x, y);
			}
		}
	},

	colonies() {
		Source.seed(28, 28, 0);
		Source.seed(99, 30, 1);
		Source.seed(63, 98, 2);
	},
};

if (typeof module !== 'undefined') module.exports = { Presets, SCENES };
