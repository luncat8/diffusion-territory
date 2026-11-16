// owns: node smoke of the page wiring against a stub DOM, never loaded by the page
// edit for: stubbed browser surface, scenarios checked

const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const ids = [...html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)].map(m => [m[2], m[1]]);

const makeEl = id => {
	const e = {
		id,
		tagName: "div",
		dataset: {},
		children: [],
		handlers: {},
		textContent: "",
		value: "",
		checked: false,
		disabled: false,
		style: {},
		classes: new Set(),
		classList: {
			toggle(name, on) { on ? e.classes.add(name) : e.classes.delete(name); }
		},
		addEventListener(type, fn) { (e.handlers[type] = e.handlers[type] || []).push(fn); },
		dispatch(type, ev) {
			const list = e.handlers[type] || [];
			for (const fn of list) fn(Object.assign({ target: e, type, preventDefault() {} }, ev));
		},
		getBoundingClientRect() { return { left: 0, top: 0, width: 512, height: 512 }; },
		getContext() {
			return {
				createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
				putImageData() {}
			};
		},
		setPointerCapture() {}
	};
	return e;
};

const els = new Map();
for (const [id, tag] of ids) {
	const e = makeEl(id);
	e.tagName = tag.toUpperCase();
	if (id === "canv") { e.width = 128; e.height = 128; }
	els.set(id, e);
}

// the panel reads its brush buttons as children, so the stub mirrors that block
const block = html.match(/id="players">([\s\S]*?)<\/div>/)[1];
for (const m of block.matchAll(/<button class="sw" data-ch="(-?\d)"/g)) {
	const b = makeEl("brush" + m[1]);
	b.dataset.ch = m[1];
	els.get("players").children.push(b);
}

let rafCb = null;
const sandbox = {
	requestAnimationFrame(fn) { rafCb = fn; return 1; },
	performance,
	Math,
	console
};
sandbox.window = sandbox;
sandbox.document = {
	getElementById(id) {
		const e = els.get(id);
		if (!e) throw new Error("index.html has no element with id=" + id);
		return e;
	}
};
sandbox.window.addEventListener = (type, fn) => (sandbox.handlers[type] = fn);
sandbox.window.handlers = {};

const ctx = vm.createContext(sandbox);
for (const src of scripts) {
	vm.runInContext(fs.readFileSync(__dirname + "/../" + src, "utf8"), ctx, { filename: src });
}

const canv = els.get("canv");
const steps = n => {
	for (let i = 0; i < n; i++) {
		const cb = rafCb;
		rafCb = null;
		cb();
	}
};

// top-level const lives in the global lexical scope, not on the sandbox object
const g = vm.runInContext("grid", ctx);
const S = vm.runInContext("settings", ctx);

steps(2);
console.log("dom=boot scripts=" + scripts.length + " ids=" + ids.length + " play_label=" + els.get("play").textContent);

S.deplete = 1;
S.diffuse = 128;
canv.dispatch("pointerdown", { clientX: 256, clientY: 256, button: 0, shiftKey: false, pointerId: 1 });
canv.dispatch("pointermove", { clientX: 300, clientY: 256, button: 0, shiftKey: false, pointerId: 1 });
canv.dispatch("pointerup", { pointerId: 1 });
steps(120);
console.log("dom=paint r_cells=" + g.count[0] + " sources=" + g.src.reduce((a, v) => a + (v > 0), 0));

els.get("players").children[1].dispatch("click");
canv.dispatch("pointerdown", { clientX: 356, clientY: 256, button: 0, shiftKey: false, pointerId: 2 });
canv.dispatch("pointerup", { pointerId: 2 });
steps(120);
console.log("dom=brush g_cells=" + g.count[1] + " stats=" + JSON.stringify(els.get("stats").textContent));

sandbox.window.handlers.keydown({ key: " ", preventDefault() {} });
const running = S.running;
steps(10);
sandbox.window.handlers.keydown({ key: "s", preventDefault() {} });
canv.dispatch("pointerdown", { clientX: 128, clientY: 128, button: 0, shiftKey: false, pointerId: 3 });
canv.dispatch("pointerup", { pointerId: 3 });
console.log("dom=keys running=" + running + " play_label=" + els.get("play").textContent + " paused_g=" + g.count[1]);

const deplete = els.get("deplete");
deplete.value = "4";
deplete.dispatch("input");
const r01Pre = els.get("rate01").disabled;
const r10Pre = els.get("rate10").disabled;
const a01 = els.get("allow01");
const a10 = els.get("allow10");
a01.checked = true;
a01.dispatch("change");
const r01On = els.get("rate01").disabled;
const r10On = els.get("rate10").disabled;
const r02On = els.get("rate02").disabled;
const r01 = els.get("rate01");
r01.value = "120";
r01.dispatch("input");
const r10 = els.get("rate10");
r10.value = "40";
r10.dispatch("input");
console.log("dom=settings deplete=" + S.deplete + " deplete_label=" + els.get("depleteVal").textContent +
	" r01_pre=" + r01Pre + " r10_pre=" + r10Pre +
	" allow_rg=" + S.crossAllow[0][1] + " r01_dis=" + r01On + " r10_dis=" + r10On + " r02_dis=" + r02On +
	" rate_rg=" + S.crossRate[0][1] + " rate_gr=" + S.crossRate[1][0] +
	" r01_lbl=" + els.get("rate01Val").textContent + " r10_lbl=" + els.get("rate10Val").textContent);
a10.checked = true;
a10.dispatch("change");
a01.checked = false;
a01.dispatch("change");
const r01Keep = els.get("rate01").disabled;
const r10Keep = els.get("rate10").disabled;
a10.checked = false;
a10.dispatch("change");
console.log("dom=cross_sym keep_r01=" + r01Keep + " keep_r10=" + r10Keep +
	" off_r01=" + els.get("rate01").disabled + " off_r10=" + els.get("rate10").disabled);

const mc = els.get("maxColor");
const tc = els.get("territoryCap");
const mcInitLbl = els.get("maxColorVal").textContent;
const tcInitDis = tc.disabled;
mc.value = "0";
mc.dispatch("input");
const tcOnDis = tc.disabled;
tc.value = "200";
tc.dispatch("input");
mc.value = "7";
mc.dispatch("input");
console.log("dom=cap init_lbl=" + mcInitLbl + " init_dis=" + tcInitDis +
	" on_dis=" + tcOnDis + " max=" + S.maxColor + " max_lbl=" + els.get("maxColorVal").textContent +
	" per_cell=" + S.territoryCap + " per_lbl=" + els.get("territoryCapVal").textContent);

const probe = els.get("probe");
canv.dispatch("pointermove", { clientX: 356, clientY: 256, button: 0, shiftKey: false, pointerId: 4 });
console.log("dom=probe display=" + probe.style.display + " xy=" + els.get("probeXY").textContent +
	" r=[" + els.get("probeR").textContent + "] g=[" + els.get("probeG").textContent +
	"] b=[" + els.get("probeB").textContent + "]");
canv.dispatch("pointerleave", {});
console.log("dom=probe_hide display=" + probe.style.display);

sandbox.window.handlers.keydown({ key: "c", preventDefault() {} });
steps(2);
console.log("dom=clear r_cells=" + g.count[0] + " g_cells=" + g.count[1] + " sources=" + g.src.reduce((a, v) => a + (v > 0), 0));
