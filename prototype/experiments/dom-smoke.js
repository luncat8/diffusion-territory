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

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stubCanvas });
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

check('boot_scripts', scripts.length === 10, scripts.join(','));
check('field_init', scope('Field').n === 128 * 128, `n=${scope('Field').n}`);
check('sliders', doc.querySelectorAll('#rows input[type=range]').length === 10, `rows=${doc.querySelectorAll('#rows input[type=range]').length}`);
check('player_buttons', doc.querySelectorAll('#players button').length === 3, 'R G B');
check('sources_seeded', Array.from(scope('Field').src).filter(Boolean).length === 3, 'seed sources');

scope('Tick').run(scope('Settings'));
scope('View').draw();
check('step_runs', scope('Field').total[0] > 0, `mass_r=${Math.round(scope('Field').total[0] / scope('FP_ONE'))}`);

function mouse(type, x, y, extra) {
	canvas.dispatchEvent(new window.MouseEvent(type, Object.assign({ clientX: x, clientY: y, bubbles: true }, extra)));
}
mouse('mousemove', 100, 100);
check('hover_readout', !tip.hidden && tip.textContent.includes('R '), JSON.stringify(tip.textContent));

mouse('mousedown', 400, 400, { button: 0 });
const cell = (400 >> 2) * 128 + (400 >> 2);
check('click_paints', (scope('Field').src[cell] & 1) === 1, `src=${scope('Field').src[cell]}`);
mouse('mousedown', 400, 400, { button: 2 });
check('right_click_erases', (scope('Field').src[cell] & 1) === 0, `src=${scope('Field').src[cell]}`);

const slider = doc.querySelectorAll('#rows input[type=range]')[0];
slider.value = '35';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
check('slider_binds', scope('Settings').diffusion === 35, `diffusion=${scope('Settings').diffusion}`);

doc.getElementById('pause').click();
check('pause_toggles', scope('Settings').paused === 1, doc.getElementById('pause').textContent);
doc.getElementById('pause').click();
doc.getElementById('reset').click();
const resetField = scope('Field');
check('reset_reseeds', Array.from(resetField.src).filter(Boolean).length === 3 &&
	resetField.total[0] > 0 && resetField.total[1] > 0 && resetField.total[2] > 0, 'three sources with heaps');

setTimeout(() => {
	check('raf_loop', scope('Loop').frame > 0, `frames=${scope('Loop').frame}`);
	check('stats_panel', doc.getElementById('stats').textContent.length > 0, 'written');
	window.close();
	console.log(`failures=${failures}`);
	process.exit(failures ? 1 : 0);
}, 900);
