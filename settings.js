// owns: global simulation rule values and UI defaults
// edit for: slider default values, reaction mode list, or tuning presets

const REACT_MODES = ['mutual', 'majority', 'convert', 'absorb'];

const Settings = {
	scene: 0,
	simSpeed: 0.125,
	gasSpeed: 65,
	gasDamping: 15,
	depletion: 0,
	mixMask: 0,
	mixRate: [50, 50, 50],
	reactMask: 0,
	reactRate: [2, 2, 2],
	reactMode: 0,
	reactExponent: 1,
	response: [0, 0, 0, 0, 0, 0],
	reactDir: [0, 1, 0],
	playerFlow: 0,
	maxMass: 0,
	sourceRate: 5,
	sourceMode: 0,
	sourceDominance: 2,
	sourceThreshold: 1,
	capBase: 0,
	capTerritory: 100,
	substeps: 1,
	paused: 0,
	paint: 0,
	brush: 1,
	showSources: 0,
	holdTarget: 20,
	rivalPressure: 0,
};

if (typeof module !== 'undefined') module.exports = { Settings, REACT_MODES };
