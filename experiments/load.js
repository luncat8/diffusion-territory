// owns: node harness — one VM context from the page's sim scripts
// edit for: which files load, extra API exports

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SIM = ['settings.js', 'field.js', 'source.js', 'gas.js', 'tick.js'];
const API = 'globalThis.API = { Settings, Field, Source, Gas, Tick, FP, FP_ONE, FP_HALF, NO_COLOR, REF_OWNED, CAP_DEF }';

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
