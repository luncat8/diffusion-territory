// owns: node harness — one VM context from the page's sim scripts
// edit for: which files load, extra API exports

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SIM = ['settings.js', 'field.js', 'presets.js', 'source.js', 'gas.js', 'react.js', 'objective.js', 'solution.js', 'tick.js'];
const API = 'globalThis.API = { Settings, REACT_MODES, SCENES, Field, Presets, Source, Gas, React, Objective, Tick, ' +
	'FP, FP_ONE, FP_HALF, NO_COLOR, REF_OWNED, CAP_DEF, PAIR_A, PAIR_B, PAIR_NAMES, PAIR_INDEX, Solution, ' +
	'ZONE_R, NEED_PCT, HOLD_CAPTURE, HOLD_ACTIVE, HOLD_DONE }';

function pageScripts() {
	const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
	return Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), m => m[1]);
}

module.exports = function load(only) {
	const ctx = vm.createContext({ console });
	for (const f of only || SIM) {
		vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
	}
	vm.runInContext(API, ctx);
	return ctx.API;
};

module.exports.SIM = SIM;
module.exports.pageScripts = pageScripts;
