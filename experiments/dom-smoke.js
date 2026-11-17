// owns: DOM smoke test — boot the page in jsdom with a stub 2D context
// edit for: wiring assertions

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), m => m[1]);
for (const f of scripts) {
	html = html.replace(`<script src="${f}"></script>`, `<script>${fs.readFileSync(path.join(ROOT, f), 'utf8')}</script>`);
}

function stubCanvas(window) {
	const ctx = {
		imageSmoothingEnabled: false,
		fillStyle: '#000',
		strokeStyle: '#000',
		lineWidth: 1,
		createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
		putImageData: () => {},
		drawImage: () => {},
		fillRect: () => {},
		strokeRect: () => {},
	};
	window.HTMLCanvasElement.prototype.getContext = () => ctx;
	window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
		left: 0, top: 0, width: 512, height: 512, clientLeft: 0, clientTop: 0,
	});
}

const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
const { window } = dom;
const scope = name => window.eval(name);
const doc = window.document;
const canvas = doc.getElementById('canv');
const tip = doc.getElementById('tip');

let failures = 0;
function check(name, ok, value) {
	if (!ok) failures++;
	console.log(`check=${name} ok=${ok ? 1 : 0} value=${value}`);
}

check('boot_scripts', scripts.length === 12, scripts.join(','));
check('field_init', scope('Field').n === 128 * 128, `n=${scope('Field').n}`);
check('scene_presets', doc.querySelectorAll('#scene-select option').length === 6 &&
	doc.getElementById('scene-select').value === '0', `scene=${doc.getElementById('scene-select').value}`);
const ranges = doc.querySelectorAll('#rows input[type=range]');
check('sliders', ranges.length === 27, `rows=${ranges.length}`);
check('mix_checkboxes', ['mix-all', 'mix-rg-on', 'mix-rb-on', 'mix-gb-on'].every(id => !!doc.getElementById(id)), 'rg rb gb all');
check('react_checkboxes', ['react-all', 'react-rg-on', 'react-rb-on', 'react-gb-on'].every(id => !!doc.getElementById(id)), 'rg rb gb all');
check('react_mode_buttons', ['mode-mutual', 'mode-majority', 'mode-convert', 'mode-absorb'].every(id => !!doc.getElementById(id)), 'four modes');
check('react_dir_buttons', ['dir-rg', 'dir-rb', 'dir-gb'].every(id => doc.getElementById(id) && doc.getElementById(id).hidden), 'hidden until absorb');
check('pair_sliders', ['mix-rg', 'mix-rb', 'mix-gb', 'react-rg', 'react-rb', 'react-gb'].every(id => !!doc.getElementById(id)), 'six pair sliders');
check('player_buttons', doc.querySelectorAll('#players button').length === 3, 'R G B');
check('sources_seeded', Array.from(scope('Field').src).filter(Boolean).length === 60, 'seed sources');

scope('Tick').run(scope('Settings'));
scope('View').draw();
check('step_runs', scope('Field').total[0] > 0, `mass_r=${Math.round(scope('Field').total[0] / scope('FP_ONE'))}`);

function mouse(type, x, y, extra) {
	canvas.dispatchEvent(new window.MouseEvent(type, Object.assign({ clientX: x, clientY: y, bubbles: true }, extra)));
}
mouse('mousemove', 100, 100);
check('hover_readout', !tip.hidden && tip.textContent.includes('R ') && tip.textContent.includes('pressure '), JSON.stringify(tip.textContent));

mouse('mousedown', 400, 400, { button: 0 });
const cell = (400 >> 2) * 128 + (400 >> 2);
check('click_paints', scope('Field').ch[0][cell] === 255 * scope('FP_ONE'), `src=${scope('Field').src[cell]}`);
mouse('mousedown', 400, 400, { button: 2 });
check('right_click_erases', scope('Field').ch[0][cell] === 0, `src=${scope('Field').src[cell]}`);

const slider = doc.querySelectorAll('#rows input[type=range]')[0];
slider.value = '35';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
check('slider_binds', scope('Settings').gasSpeed === 35, `gasSpeed=${scope('Settings').gasSpeed}`);

const rgBox = doc.getElementById('mix-rg-on');
rgBox.checked = true;
rgBox.dispatchEvent(new window.Event('change', { bubbles: true }));
const settings = scope('Settings');
check('pair_checkbox_binds', settings.mixMask === 1, `mixMask=${settings.mixMask}`);

doc.getElementById('mix-gb-on').checked = true;
doc.getElementById('mix-gb-on').dispatchEvent(new window.Event('change', { bubbles: true }));
check('pair_checkbox_accumulates', settings.mixMask === 5, `mixMask=${settings.mixMask}`);

const allBox = doc.getElementById('mix-all');
allBox.checked = true;
allBox.dispatchEvent(new window.Event('change', { bubbles: true }));
check('group_toggle_all', settings.mixMask === 7 && doc.getElementById('mix-rg-on').checked, `mixMask=${settings.mixMask}`);

allBox.checked = false;
allBox.dispatchEvent(new window.Event('change', { bubbles: true }));
check('group_toggle_none', settings.mixMask === 0 && !doc.getElementById('mix-gb-on').checked, `mixMask=${settings.mixMask}`);

const mixSlider = doc.getElementById('mix-rb');
mixSlider.value = '65';
mixSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
check('pair_slider_auto_enables', settings.mixMask === 2 && settings.mixRate[1] === 65,
	`mixMask=${settings.mixMask} rate=${settings.mixRate.join('/')}`);

const rAll = doc.getElementById('react-all');
rAll.checked = true;
rAll.dispatchEvent(new window.Event('change', { bubbles: true }));
check('react_group_binds', settings.reactMask === 7, `reactMask=${settings.reactMask}`);
const reactSlider = doc.getElementById('react-rg');
reactSlider.value = '0';
reactSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('react-rg-on').checked = false;
doc.getElementById('react-rg-on').dispatchEvent(new window.Event('change', { bubbles: true }));
check('react_pair_unchecked', settings.reactMask === 6 && doc.getElementById('react-rg-on').checked === false, `reactMask=${settings.reactMask}`);

doc.getElementById('mode-absorb').click();
const dirRb = doc.getElementById('dir-rb');
check('absorb_shows_dirs', settings.reactMode === 3 && !dirRb.hidden && dirRb.textContent === 'B>R', dirRb.textContent);
dirRb.click();
check('dir_flips', settings.reactDir[1] === 0 && dirRb.textContent === 'R>B' &&
	doc.getElementById('stats').textContent.includes('R>B'), dirRb.textContent);
doc.getElementById('mode-convert').click();
check('mode_switches', settings.reactMode === 2 && dirRb.hidden &&
	doc.getElementById('stats').textContent.includes('(convert)'), 'convert');
doc.getElementById('mode-mutual').click();

const flowSlider = doc.getElementById('ctrl-playerFlow');
flowSlider.value = '400';
flowSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
check('player_flow_binds', settings.playerFlow === 400, `playerFlow=${settings.playerFlow}`);
flowSlider.value = '0';
flowSlider.dispatchEvent(new window.Event('input', { bubbles: true }));

for (const [id, value, expression] of [
	['ctrl-sourceMode', '2', 'Settings.sourceMode === 2'],
	['ctrl-sourceDominance', '3', 'Settings.sourceDominance === 3'],
	['ctrl-sourceThreshold', '0.5', 'Settings.sourceThreshold === 0.5'],
	['ctrl-reactExponent', '2', 'Settings.reactExponent === 2'],
	['ctrl-response-0', '35', 'Settings.response[0] === 35'],
	['ctrl-response-5', '-20', 'Settings.response[5] === -20'],
	['ctrl-showSources', '1', 'Settings.showSources === 1'],
]) {
	const input = doc.getElementById(id);
	input.value = value;
	input.dispatchEvent(new window.Event('input', { bubbles: true }));
	check(id + '_binds', scope(expression), value);
}
scope('Settings').sourceMode = 0;
scope('Settings').sourceDominance = 2;

check('stats_pair_names', doc.getElementById('stats').textContent.includes('mix RB') &&
	doc.getElementById('stats').textContent.includes('pairs  RG'), 'mix RB + pairs line');

doc.getElementById('pause').click();
check('pause_toggles', scope('Settings').paused === 1, doc.getElementById('pause').textContent);
doc.getElementById('pause').click();
doc.getElementById('reset').click();
const resetField = scope('Field');
check('reset_reseeds', Array.from(resetField.src).filter(Boolean).length === 60 &&
	resetField.total[0] > 0 && resetField.total[1] > 0 && resetField.total[2] > 0, 'three sources with heaps');

const sceneSelect = doc.getElementById('scene-select');
let scenesLoad = true;
for (let i = 0; i < sceneSelect.options.length; i++) {
	sceneSelect.value = String(i);
	sceneSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	scenesLoad = scenesLoad && scope('Settings').scene === i && scope('Loop').frame === 0 &&
		scope('Field').total[0] + scope('Field').total[1] + scope('Field').total[2] > 0;
}
check('scene_selection_loads_layout_and_rules', scenesLoad, `scenes=${sceneSelect.options.length}`);
sceneSelect.value = '0';
sceneSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

check('url_defaults_omitted', !new URL(window.location.href).searchParams.has('dt.scene'), window.location.search);
sceneSelect.value = '2';
sceneSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
const tuned = doc.getElementById('ctrl-gasSpeed');
tuned.value = '42';
tuned.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('pause').click();
const saved = new URL(window.location.href);
check('url_scene_relative', saved.searchParams.get('dt.scene') === '2' && saved.searchParams.get('dt.gasSpeed') === '42' &&
	!saved.searchParams.has('dt.reactMode') && saved.searchParams.get('dt.paused') === '1', saved.search);
const restored = new JSDOM(html, { url: saved.href, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
check('url_reload', restored.window.eval('Settings.scene === 2 && Settings.gasSpeed === 42 && Settings.reactMode === 2 && Settings.paused === 1') &&
	restored.window.document.getElementById('ctrl-gasSpeed').value === '42', 'scene, profile, overrides, controls');
restored.window.close();
const fileDom = new JSDOM(html, { url: 'file:///tmp/index.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
const fileSlider = fileDom.window.document.getElementById('ctrl-gasSpeed');
fileSlider.value = '42';
fileSlider.dispatchEvent(new fileDom.window.Event('input', { bubbles: true }));
const fileReload = new JSDOM(html, { url: fileDom.window.location.href, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
check('url_file_roundtrip', fileReload.window.eval('Settings.gasSpeed === 42'), fileDom.window.location.href);
fileDom.window.close();
fileReload.window.close();
const invalid = new JSDOM(html, { url: 'https://example.test/?dt.scene=999&dt.gasSpeed=NaN&dt.mixRate.0=999', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
check('url_invalid_ignored', invalid.window.eval('Settings.scene === 0 && Settings.gasSpeed === 65 && Settings.mixRate[0] === 50'), 'invalid values');
invalid.window.close();
tuned.value = '60';
tuned.dispatchEvent(new window.Event('input', { bubbles: true }));
check('url_restored_default_removed', !new URL(window.location.href).searchParams.has('dt.gasSpeed'), window.location.search);
doc.getElementById('pause').click();

setTimeout(() => {
	check('raf_loop', scope('Loop').frame > 0, `frames=${scope('Loop').frame}`);
	check('stats_panel', doc.getElementById('stats').textContent.length > 0, 'written');
	window.close();
	console.log(`failures=${failures}`);
	process.exit(failures ? 1 : 0);
}, 900);
