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
		beginPath: () => {},
		closePath: () => {},
		arc: () => {},
		stroke: () => {},
		save: () => {},
		restore: () => {},
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

check('boot_scripts', scripts.length === 17, scripts.join(','));
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

const hud = doc.getElementById('hud');
check('hud_visible', !hud.hidden && !!hud.querySelector('.hud-head'), 'hud built');
check('hud_task_actions', ['hud-new-task', 'hud-reset-gui', 'hud-rivals'].every(id => {
	const button = doc.getElementById(id);
	return button && !button.hidden && button.closest('.hud-main') !== null;
}) && !!hud.querySelector('.hud-task-name'), 'top-of-panel new task + reset GUI');
check('rival_pressure_defaults_off', scope('Settings').rivalPressure === 0 &&
	doc.getElementById('hud-rivals').textContent === 'rivals off', 'off in GUI defaults');
check('objective_zone', scope('Objective').area > 1700 && scope('Objective').player === 0,
	`area=${scope('Objective').area} player=${scope('Objective').player}`);
check('hud_spot_controls', ['spot-sourceRate', 'spot-sourceMode', 'spot-gasSpeed', 'spot-gasDamping', 'spot-brush',
	'spot-reactExponent', 'spot-mix-0', 'spot-mix-1', 'spot-react-0', 'spot-react-1', 'spot-reactMode',
	'spot-dir-0', 'spot-dir-1'].every(id => !!doc.getElementById(id)), 'thirteen quick controls');
const spotRate = doc.getElementById('spot-sourceRate');
spotRate.value = '12';
spotRate.dispatchEvent(new window.Event('input', { bubbles: true }));
check('spot_slider_binds', scope('Settings').sourceRate === 12 && doc.getElementById('ctrl-sourceRate').value === '12',
	`sourceRate=${scope('Settings').sourceRate}`);
spotRate.value = '5';
spotRate.dispatchEvent(new window.Event('input', { bubbles: true }));

doc.getElementById('hud-pick-1').click();
check('hud_color_switch', scope('Settings').paint === 1 && scope('Objective').player === 1,
	`paint=${scope('Settings').paint} player=${scope('Objective').player}`);
doc.getElementById('hud-pick-0').click();

const targetSelect = doc.getElementById('hud-target');
targetSelect.value = '30';
targetSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
check('hud_target_binds', scope('Settings').holdTarget === 30 && scope('Objective').target === 1800 &&
	new URL(window.location.href).searchParams.get('dt.holdTarget') === '30',
	`target=${scope('Objective').target} url=${window.location.search}`);
targetSelect.value = '20';
targetSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

scope('Source').paint(64, 64, 0, true, 24);
scope('Tick').run(scope('Settings'));
scope('HUD').refresh();
check('hud_hold_progress', scope('Objective').control === 1 && doc.getElementById('hud-status').textContent === 'HOLDING' &&
	parseFloat(doc.getElementById('hud-fill').style.width) > 0,
	`status=${doc.getElementById('hud-status').textContent} width=${doc.getElementById('hud-fill').style.width}`);

const solvedSettings = scope('Settings');
const previewBtn = doc.getElementById('hud-preview');
check('preview_button_exists', !!previewBtn && previewBtn.id === 'hud-preview', 'press-to-preview');
const solveBtn = doc.getElementById('hud-solve');
const beforePreview = { sourceRate: solvedSettings.sourceRate, gasSpeed: solvedSettings.gasSpeed, reactMode: solvedSettings.reactMode };
const beforeUrl = window.location.search;
solveBtn.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
const previewSpot = doc.getElementById('spot-sourceRate').closest('.spot-row');
const previewSlider = doc.getElementById('spot-sourceRate');
check('preview_on_hover_shows_positions_without_change', solvedSettings.sourceRate === beforePreview.sourceRate &&
	solvedSettings.gasSpeed === beforePreview.gasSpeed && solvedSettings.reactMode === beforePreview.reactMode &&
	previewSpot.classList.contains('preview') && previewSlider.value === '16' &&
	previewSpot.querySelector('output').textContent.includes('→') && window.location.search === beforeUrl &&
	doc.getElementById('hud-why').textContent.includes('preview'),
	`rate=${solvedSettings.sourceRate} slider=${previewSlider.value} why=${doc.getElementById('hud-why').textContent.slice(0, 40)}`);
solveBtn.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
check('preview_off_restores_positions', !previewSpot.classList.contains('preview') && previewSlider.value === String(beforePreview.sourceRate) &&
	solvedSettings.sourceRate === beforePreview.sourceRate,
	`slider=${previewSlider.value} rate=${solvedSettings.sourceRate}`);
previewBtn.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
check('preview_on_press', previewSpot.classList.contains('preview') && solvedSettings.sourceRate === beforePreview.sourceRate,
	`preview=${previewSpot.className}`);
previewBtn.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
check('preview_off_on_release', !previewSpot.classList.contains('preview') && previewSlider.value === String(beforePreview.sourceRate),
	`slider=${previewSlider.value}`);

doc.getElementById('hud-solve').click();
check('solve_applies_suggestion', solvedSettings.sourceRate === 16 && solvedSettings.sourceMode === 1 &&
	solvedSettings.reactMode === 3 && solvedSettings.reactExponent === 1 && solvedSettings.mixMask === 3 &&
	solvedSettings.reactMask === 3 && solvedSettings.reactDir[0] === 0 && solvedSettings.reactDir[1] === 0 &&
	solvedSettings.gasSpeed === 90 && solvedSettings.gasDamping === 30,
	`rate=${solvedSettings.sourceRate} mode=${solvedSettings.reactMode} mix=${solvedSettings.mixMask} ` +
	`react=${solvedSettings.reactMask} dir=${solvedSettings.reactDir.join('/')} speed=${solvedSettings.gasSpeed}`);
const mixSpot = doc.getElementById('spot-mix-0').closest('.spot-row');
check('solve_marks_changed_rows', mixSpot.classList.contains('solved') &&
	mixSpot.querySelector('output').textContent.includes('→'),
	`${mixSpot.className} ${mixSpot.querySelector('output').textContent}`);
const why = doc.getElementById('hud-why');
check('solve_explains', !why.hidden && why.textContent.includes('absorb') && why.textContent.includes('production') &&
	why.textContent.includes('pressure') && why.textContent.includes('permeability') &&
	why.textContent.includes('mode mutual → absorb'), why.textContent.slice(0, 80));
check('solve_saved_to_url', new URL(window.location.href).searchParams.get('dt.reactMode') === '3' &&
	new URL(window.location.href).searchParams.get('dt.sourceRate') === '16', window.location.search);
doc.getElementById('hud-revert').click();
check('revert_restores_settings', solvedSettings.sourceRate === 5 && solvedSettings.sourceMode === 0 &&
	solvedSettings.reactMode === 0 && solvedSettings.mixMask === 0 && solvedSettings.reactMask === 0 &&
	solvedSettings.reactDir[1] === 1 && solvedSettings.gasSpeed === 65 && solvedSettings.gasDamping === 15,
	`rate=${solvedSettings.sourceRate} mode=${solvedSettings.reactMode} mix=${solvedSettings.mixMask} speed=${solvedSettings.gasSpeed}`);
check('revert_hides_url_params', !new URL(window.location.href).searchParams.has('dt.reactMode'), window.location.search);

doc.getElementById('hud-solve').click();
const sceneSwitch = doc.getElementById('scene-select');
sceneSwitch.value = '2';
sceneSwitch.dispatchEvent(new window.Event('change', { bubbles: true }));
check('solution_follows_scene', solvedSettings.scene === 2 && solvedSettings.reactMode === 3 &&
	solvedSettings.sourceMode === 1 && solvedSettings.sourceRate === 16 && solvedSettings.gasSpeed === 90 && !why.hidden,
	`scene=${solvedSettings.scene} mode=${solvedSettings.reactMode} rate=${solvedSettings.sourceRate} speed=${solvedSettings.gasSpeed}`);
doc.getElementById('hud-revert').click();
check('revert_restores_scene_rules', solvedSettings.sourceRate === 0 && solvedSettings.reactMode === 2 &&
	solvedSettings.reactRate[0] === 14 && solvedSettings.mixRate[0] === 75 &&
	solvedSettings.gasSpeed === 60 && solvedSettings.gasDamping === 28,
	`rate=${solvedSettings.sourceRate} mode=${solvedSettings.reactMode} react=${solvedSettings.reactRate[0]} speed=${solvedSettings.gasSpeed}`);
sceneSwitch.value = '0';
sceneSwitch.dispatchEvent(new window.Event('change', { bubbles: true }));

hud.querySelector('.hud-fold').click();
check('hud_folds', hud.classList.contains('folded'), 'folded');
hud.querySelector('.hud-fold').click();

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
sceneSelect.value = '0';
sceneSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

const taskRoll = scope('Task').roll;
const taskRolls = [4, 2, 3];
scope('Task').roll = () => taskRolls.shift();
doc.getElementById('hud-new-task').click();
scope('Task').roll = taskRoll;
const taskSettings = scope('Settings');
const taskUrl = new URL(window.location.href);
check('new_task_generates_clean_task', taskSettings.scene === 5 && taskSettings.paint === 2 &&
	taskSettings.holdTarget === 60 && taskSettings.rivalPressure === 1 && taskSettings.brush === 1 && taskSettings.paused === 0 &&
	taskSettings.gasSpeed === 50 && taskSettings.sourceRate === 9 && taskSettings.reactMode === 1 &&
	scope('Objective').player === 2 && scope('Objective').target === 3600 && scope('Loop').frame === 0 &&
	scope('Solution').last === null && doc.getElementById('hud-revert').hidden &&
	doc.getElementById('scene-select').value === '5' && doc.getElementById('hud-target').value === '60' &&
	doc.getElementById('hud-rivals').textContent === 'rivals on' &&
	hud.querySelector('.hud-task-name').textContent.includes('Growing colonies') &&
	hud.querySelector('.hud-task-name').textContent.includes('B pigment · hold 60 s') &&
	!doc.getElementById('hud-why').hidden && doc.getElementById('hud-why').textContent.includes('new task') &&
	taskUrl.searchParams.get('dt.scene') === '5' && taskUrl.searchParams.get('dt.paint') === '2' &&
	taskUrl.searchParams.get('dt.holdTarget') === '60' && taskUrl.searchParams.get('dt.rivalPressure') === '1' &&
	!taskUrl.searchParams.has('dt.gasSpeed'),
	`scene=${taskSettings.scene} paint=${taskSettings.paint} target=${taskSettings.holdTarget} url=${taskUrl.search}`);

doc.getElementById('hud-solve').click();
const solvedRows = doc.querySelectorAll('.solved').length;
const guiSlider = doc.getElementById('ctrl-gasSpeed');
guiSlider.value = '84';
guiSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('hud-reset-gui').click();
const guiUrl = new URL(window.location.href);
check('reset_gui_restores_scene_defaults', solvedRows > 0 && doc.querySelectorAll('.solved').length === 0 &&
	taskSettings.scene === 5 && taskSettings.paint === 0 && taskSettings.holdTarget === 20 &&
	taskSettings.rivalPressure === 0 && taskSettings.brush === 1 && taskSettings.paused === 0 && taskSettings.gasSpeed === 50 &&
	taskSettings.sourceRate === 9 && taskSettings.reactMode === 1 && scope('Solution').last === null &&
	scope('Objective').player === 0 && scope('Objective').target === 1200 && scope('Loop').frame === 0 &&
	doc.getElementById('hud-revert').hidden && doc.getElementById('hud-target').value === '20' &&
	doc.getElementById('hud-rivals').textContent === 'rivals off' &&
	doc.getElementById('ctrl-gasSpeed').value === '50' &&
	doc.getElementById('hud-why').textContent.includes('GUI defaults') &&
	guiUrl.searchParams.get('dt.scene') === '5' && !guiUrl.searchParams.has('dt.paint') &&
	!guiUrl.searchParams.has('dt.holdTarget') && !guiUrl.searchParams.has('dt.gasSpeed') &&
	!guiUrl.searchParams.has('dt.reactMode') && !guiUrl.searchParams.has('dt.rivalPressure'),
	`rows=${solvedRows} paint=${taskSettings.paint} target=${taskSettings.holdTarget} url=${guiUrl.search}`);

doc.getElementById('hud-rivals').click();
const rivalryUrl = new URL(window.location.href);
check('rival_toggle_on', taskSettings.rivalPressure === 1 && scope('Objective').elapsed === 0 &&
	doc.getElementById('hud-rivals').textContent === 'rivals on' && rivalryUrl.searchParams.get('dt.rivalPressure') === '1',
	`mode=${taskSettings.rivalPressure} url=${rivalryUrl.search}`);
const rivalryReload = new JSDOM(html, { url: rivalryUrl.href, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
check('rival_pressure_url_roundtrip', rivalryReload.window.eval('Settings.rivalPressure === 1'), rivalryUrl.search);
rivalryReload.window.close();
doc.getElementById('hud-rivals').click();
check('rival_toggle_off', taskSettings.rivalPressure === 0 &&
	doc.getElementById('hud-rivals').textContent === 'rivals off' &&
	!new URL(window.location.href).searchParams.has('dt.rivalPressure'), `mode=${taskSettings.rivalPressure}`);

setTimeout(() => {
	check('raf_loop', scope('Loop').frame > 0, `frames=${scope('Loop').frame}`);
	check('stats_panel', doc.getElementById('stats').textContent.length > 0, 'written');
	window.close();
	console.log(`failures=${failures}`);
	process.exit(failures ? 1 : 0);
}, 900);
