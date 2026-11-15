// owns: load order, shared $, boot tail and the frame loop
// edit for: script order, init sequence, frame pacing

const $ = id => document.getElementById(id);

function frame() {
	if (settings.running) {
		for (let s = 0; s < settings.speed; s++) simStep();
	}
	renderDraw();
	uiStats();
	requestAnimationFrame(frame);
}

function boot() {
	renderInit();
	inputInit();
	uiInit();
	uiSync();
	requestAnimationFrame(frame);
}

if (typeof document !== "undefined") boot();
if (typeof module !== "undefined" && module.exports) module.exports = { $ };
