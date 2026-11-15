// owns: control panel, settings binding and the readout
// edit for: control set, ranges, readout format

const STATS_MS = 200;
const RANGES = ["deplete", "diffuse", "react", "speed"];
const PAIRS = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]];

let elPlay = null;
let elStats = null;
let frameCount = 0;
let tPrev = 0;
let tNext = 0;

function uiInit() {
	elPlay = $("play");
	elStats = $("stats");
	for (let i = 0; i < RANGES.length; i++) bindRange(RANGES[i]);
	bindCross();
	bindPlayers();
	elPlay.addEventListener("click", uiToggleRun);
	$("stepBtn").addEventListener("click", () => simStep());
	$("reset").addEventListener("click", () => simReset());
	tPrev = performance.now();
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
	module.exports = { uiInit, uiSync, uiStats, uiToggleRun };
}
