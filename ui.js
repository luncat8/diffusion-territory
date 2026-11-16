// owns: control panel, settings binding and the readout
// edit for: control set, ranges, readout format

const STATS_MS = 200;
const RANGES = ["deplete", "diffuse", "react", "territoryCap", "speed"];
const PAIRS = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]];
const CAP_STEPS = [
	0, 50, 100, 150, 200, 250, 300, 400, 500, 600, 800,
	1000, 1500, 2000, 3000, 4000, 5000, 7500,
	10000, 15000, 20000, 30000, 50000, 75000,
	100000, 200000, 500000, 1000000, Infinity
];

let elPlay = null;
let elStats = null;
let elProbe = null;
let elProbeXY = null;
let elProbeR = null;
let elProbeG = null;
let elProbeB = null;
let frameCount = 0;
let tPrev = 0;
let tNext = 0;

function uiInit() {
	elPlay = $("play");
	elStats = $("stats");
	elProbe = $("probe");
	elProbeXY = $("probeXY");
	elProbeR = $("probeR");
	elProbeG = $("probeG");
	elProbeB = $("probeB");
	for (let i = 0; i < RANGES.length; i++) bindRange(RANGES[i]);
	bindMaxColor();
	bindCross();
	bindPlayers();
	elPlay.addEventListener("click", uiToggleRun);
	$("stepBtn").addEventListener("click", () => simStep());
	$("reset").addEventListener("click", () => simReset());
	tPrev = performance.now();
}

function formatCap(v) {
	if (v === Infinity) return "∞";
	if (v >= 1000000) return (v / 1000000) + "M";
	if (v >= 1000) return (v / 1000) + "k";
	return "" + v;
}

function bindMaxColor() {
	const el = $("maxColor"), out = $("maxColorVal"), dep = $("territoryCap");
	el.max = CAP_STEPS.length - 1;
	const idx = CAP_STEPS.indexOf(settings.maxColor);
	el.value = idx >= 0 ? idx : CAP_STEPS.length - 1;
	const sync = () => {
		const v = CAP_STEPS[+el.value];
		settings.maxColor = v;
		out.textContent = formatCap(v);
		dep.disabled = v === Infinity;
	};
	sync();
	el.addEventListener("input", sync);
}

// slider ids mirror settings keys, so one binder covers every rule knob
function bindRange(key) {
	const el = $(key), out = $(key + "Val");
	el.value = settings[key];
	const sync = () => {
		settings[key] = +el.value;
		out.textContent = el.value;
	};
	sync();
	el.addEventListener("input", sync);
}

function bindCross() {
	for (let i = 0; i < PAIRS.length; i++) {
		const c = PAIRS[i][0], t = PAIRS[i][1];
		const key = "" + c + t;
		const chk = $("allow" + key), rng = $("rate" + key), out = $("rate" + key + "Val");
		chk.checked = settings.crossAllow[c][t];
		rng.value = settings.crossRate[c][t];
		out.textContent = rng.value;
		chk.addEventListener("change", () => {
			settings.crossAllow[c][t] = chk.checked;
			syncCross();
		});
		rng.addEventListener("input", () => {
			settings.crossRate[c][t] = +rng.value;
			out.textContent = rng.value;
		});
	}
	syncCross();
}

function syncCross() {
	const allow = settings.crossAllow;
	for (let i = 0; i < PAIRS.length; i++) {
		const c = PAIRS[i][0], t = PAIRS[i][1];
		$("rate" + c + t).disabled = !(allow[c][t] || allow[t][c]);
	}
}

function bindPlayers() {
	const kids = $("players").children;
	for (let i = 0; i < kids.length; i++) {
		const b = kids[i];
		b.addEventListener("click", () => inputSetBrush(+b.dataset.ch));
	}
}

function uiToggleRun() {
	settings.running = !settings.running;
	uiSync();
}

function uiSync() {
	const brush = inputBrush();
	const kids = $("players").children;
	for (let i = 0; i < kids.length; i++) {
		kids[i].classList.toggle("on", +kids[i].dataset.ch === brush);
	}
	elPlay.textContent = settings.running ? "pause" : "play";
}

// one decimal keeps the slow asymptotic creep near 255 visible that integer rendering hides
function uiProbe(x, y, px, py) {
	if (x < 0) { elProbe.style.display = "none"; return; }
	const i = y * N + x;
	elProbeXY.textContent = x + "," + y;
	elProbeR.textContent = "R " + grid.ch[CH_R][i].toFixed(1);
	elProbeG.textContent = "G " + grid.ch[CH_G][i].toFixed(1);
	elProbeB.textContent = "B " + grid.ch[CH_B][i].toFixed(1);
	elProbe.style.display = "block";
	elProbe.style.left = (px + 14) + "px";
	elProbe.style.top = (py + 18) + "px";
}

function uiStats() {
	const t = performance.now();
	frameCount++;
	if (t < tNext) return;
	const dt = t - tPrev;
	const fps = dt > 0 ? frameCount * 1000 / dt : 0;
	frameCount = 0;
	tPrev = t;
	tNext = t + STATS_MS;
	elStats.textContent = "R " + grid.count[0] + "  G " + grid.count[1] + "  B " + grid.count[2] +
		"  mix " + grid.mixed + "  " + fps.toFixed(0) + " fps";
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = { uiInit, uiSync, uiStats, uiToggleRun, uiProbe };
}
