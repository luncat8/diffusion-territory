// owns: pointer painting, hover probing and keyboard shortcuts
// edit for: brush keys, mouse buttons, hover probe, drag shape

let brush = CH_R;
let mode = 0;
let lastX = -1;
let lastY = -1;

const pick = new Int32Array(2);
const KEY_BRUSH = { "1": CH_R, "2": CH_G, "3": CH_B, "0": CH_NONE };

function inputInit() {
	const c = $("canv");
	c.addEventListener("pointerdown", down);
	c.addEventListener("pointermove", move);
	c.addEventListener("pointerup", end);
	c.addEventListener("pointercancel", end);
	c.addEventListener("pointerleave", probeOff);
	c.addEventListener("contextmenu", e => e.preventDefault());
	window.addEventListener("keydown", key);
}

function inputSetBrush(c) {
	brush = c;
	uiSync();
}

function inputBrush() {
	return brush;
}

function down(e) {
	e.preventDefault();
	e.target.setPointerCapture(e.pointerId);
	mode = e.button === 2 || e.shiftKey ? 2 : 1;
	stroke(e);
}

function move(e) {
	if (mode !== 0) stroke(e);
	if (!renderPick(e.clientX, e.clientY, pick)) { probeOff(); return; }
	uiProbe(pick[0], pick[1], e.clientX, e.clientY);
}

function probeOff() {
	uiProbe(-1, -1, 0, 0);
}

function end() {
	mode = 0;
	lastX = -1;
}

function stroke(e) {
	if (!renderPick(e.clientX, e.clientY, pick)) return;
	if (lastX < 0) dot(pick[0], pick[1]);
	else line(lastX, lastY, pick[0], pick[1]);
	lastX = pick[0];
	lastY = pick[1];
	if (!settings.running) simCount();
}

// pointer moves skip cells on a fast drag, so the stroke is filled in
function line(x0, y0, x1, y1) {
	const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
	for (let s = 1; s <= steps; s++) {
		const t = s / steps;
		dot(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
	}
}

function dot(x, y) {
	const i = y * N + x;
	if (mode === 2) simClear(i);
	else simPaint(i, brush);
}

function key(e) {
	const k = e.key;
	if (k in KEY_BRUSH) { inputSetBrush(KEY_BRUSH[k]); return; }
	if (k === " ") { e.preventDefault(); uiToggleRun(); return; }
	if (k === "s") { simStep(); return; }
	if (k === "c") { simReset(); }
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = { inputInit, inputSetBrush, inputBrush };
}
