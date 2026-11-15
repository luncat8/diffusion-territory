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
console.log("dom=keys running=" + running + " play_label=" + els.get("play").textContent);

const deplete = els.get("deplete");
deplete.value = "4";
deplete.dispatch("input");
const cross = els.get("crossDiffuse");
cross.checked = true;
cross.dispatch("change");
console.log("dom=settings deplete=" + S.deplete + " cross=" + S.crossDiffuse +
	" intrusion_disabled=" + els.get("diffuseOther").disabled + " deplete_label=" + els.get("depleteVal").textContent);

sandbox.window.handlers.keydown({ key: "c", preventDefault() {} });
steps(2);
console.log("dom=clear r_cells=" + g.count[0] + " g_cells=" + g.count[1] + " sources=" + g.src.reduce((a, v) => a + (v > 0), 0));
