// owns: panel widgets and their binding to Settings
// edit for: slider list, labels, paint players, buttons

const CONTROLS = [
	{ key: 'gasSpeed', label: 'Gas pressure speed', min: 0, max: 100, step: 1, unit: '%', hint: 'pressure wave propagation speed; 0 stops gas flow' },
	{ key: 'gasDamping', label: 'Gas viscosity', min: 0, max: 100, step: 1, unit: '%', hint: 'momentum drag; low = bouncy acoustic waves, high = thick viscous drift' },
	{ key: 'depletion', label: 'Depletion', min: 0, max: 5, step: 0.1, unit: '/f', hint: 'color removed from every cell each frame (1.0 = 1 of 255/f); >0 forms gradient, 0 equalizes' },
	{ key: 'mixRate', label: 'Mix into other color', min: 0, max: 100, step: 1, unit: '%', mixDep: 1, hint: 'rate at which gas enters cells occupied by other colors' },
	{ key: 'reaction', label: 'Mix reaction', min: 0, max: 100, step: 1, unit: '%', mixDep: 1, hint: 'reaction rate removing overlapping gases where colors mix' },
	{ key: 'maxMass', label: 'Total color limit', min: 0, max: 2000, step: 20, unit: 'k', hint: 'maximum total color mass a player can hold; 0 = unlimited (sources stay at 255)' },
	{ key: 'sourceRate', label: 'Source rate', min: 0, max: 255, step: 1, unit: '/f', hint: 'color a source cell injects each frame' },
	{ key: 'capBase', label: 'Max color per cell', min: 0, max: 1023, step: 1, unit: '', hint: 'per-cell ceiling on a 16-cell territory; 0 = no limit' },
	{ key: 'capTerritory', label: 'Small territory boost', min: 0, max: 100, step: 1, unit: '%', hint: 'how far a smaller territory raises the per-cell ceiling' },
	{ key: 'brush', label: 'Source brush', min: 0, max: 3, step: 1, unit: '', hint: 'source paint diameter in cells' },
	{ key: 'substeps', label: 'Steps per frame', min: 1, max: 2, step: 1, unit: '', hint: 'physics passes per frame' },
];

const Controls = {
	knobs: [],
	picks: [],
	mixBox: null,
	paintDot: null,

	buildMixToggle(host) {
		const mixRow = document.createElement('div');
		mixRow.className = 'row check';
		const tick = document.createElement('input');
		tick.type = 'checkbox';
		tick.id = 'mixable';
		tick.checked = !!Settings.mixable;
		const label = document.createElement('label');
		label.textContent = 'Allow mixing into other colors';
		label.title = 'unchecked: gases cannot enter cells with other colors and clash by pressure; checked: gases interpenetrate and react';
		label.prepend(tick);
		tick.addEventListener('change', () => {
			Settings.mixable = tick.checked ? 1 : 0;
			Controls.sync();
		});
		mixRow.append(label);
		host.append(mixRow);
		Controls.mixBox = tick;
	},

	build() {
		const host = $('rows');
		for (const def of CONTROLS) {
			if (def.key === 'mixRate') Controls.buildMixToggle(host);
			const row = document.createElement('div');
			row.className = 'row';
			const head = document.createElement('label');
			const name = document.createElement('span');
			name.textContent = def.label;
			const val = document.createElement('output');
			head.append(name, val);
			const input = document.createElement('input');
			input.type = 'range';
			input.title = def.hint;
			input.min = def.min;
			input.max = def.max;
			input.step = def.step;
			input.value = Settings[def.key];
			input.addEventListener('input', () => Controls.edit(def, input, val));
			row.append(head, input);
			host.append(row);
			Controls.knobs.push({ def, row, input, val });
			Controls.show(def, input, val);
		}

		const host2 = $('players');
		for (let p = 0; p < 3; p++) {
			const b = document.createElement('button');
			b.className = 'pick p' + p;
			b.textContent = View.names[p];
			b.addEventListener('click', () => Controls.pick(p));
			host2.append(b);
			Controls.picks.push(b);
		}
		Controls.paintDot = document.createElement('span');
		Controls.paintDot.className = 'hint';
		host2.append(Controls.paintDot);
	},

	// dragging mixRate > 0 activates mixing automatically so moving the slider never silently no-ops
	edit(def, input, val) {
		Settings[def.key] = +input.value;
		if (def.key === 'mixRate' && Settings.mixRate > 0 && !Settings.mixable) {
			Settings.mixable = 1;
			Controls.sync();
			return;
		}
		Controls.show(def, input, val);
	},

	show(def, input, val) {
		const v = Settings[def.key];
		if (def.key === 'capBase' || def.key === 'maxMass') val.textContent = v ? v + def.unit : 'off';
		else if (def.key === 'brush') val.textContent = (v * 2 + 1) + 'px';
		else if (def.key === 'depletion') val.textContent = v.toFixed(1) + def.unit;
		else val.textContent = v + def.unit;
		input.value = v;
	},

	pick(p) {
		Settings.paint = p;
		Controls.sync();
	},

	sync() {
		const mixOn = !!Settings.mixable;
		for (const k of Controls.knobs) {
			Controls.show(k.def, k.input, k.val);
			if (k.def.mixDep) k.row.classList.toggle('dim', !mixOn);
		}
		if (Controls.mixBox) Controls.mixBox.checked = mixOn;
		for (let p = 0; p < 3; p++) Controls.picks[p].classList.toggle('on', Settings.paint === p);
		Controls.paintDot.textContent = 'paint source: left click · erase: right click';
		$('pause').textContent = Settings.paused ? 'resume' : 'pause';
	},
};
