// owns: panel widgets and their binding to Settings
// edit for: slider list, labels, paint players, buttons

const CONTROLS = [
	{ key: 'diffusion', label: 'Diffusion', min: 0, max: 100, step: 1, unit: '%', hint: 'flux per neighbour, 100 = widest stable step' },
	{ key: 'brownian', label: 'Brownian shift', min: 0, max: 100, step: 1, unit: '%', hint: 'chance to swap a cell with a random neighbour before diffusion' },
	{ key: 'depletion', label: 'Depletion', min: 0, max: 8, step: 1, unit: '/f', hint: 'color removed from every cell each frame' },
	{ key: 'reaction', label: 'Mix reaction', min: 0, max: 100, step: 1, unit: '%', hint: 'share of the smaller color removed where two colors meet' },
	{ key: 'sourceRate', label: 'Source rate', min: 0, max: 255, step: 1, unit: '/f', hint: 'color a source cell adds each frame' },
	{ key: 'capBase', label: 'Max color per cell', min: 0, max: 1023, step: 1, unit: '', hint: 'per-cell ceiling on a 16-cell territory; 0 = no limit' },
	{ key: 'capTerritory', label: 'Small territory boost', min: 0, max: 100, step: 1, unit: '%', hint: 'how far a smaller territory raises the per-cell ceiling' },
	{ key: 'foreignRate', label: 'Diffuse into other color', min: 0, max: 100, step: 1, unit: '%', hint: 'flux into cells another color holds, used when blocking is off' },
	{ key: 'substeps', label: 'Steps per frame', min: 1, max: 2, step: 1, unit: '', hint: 'physics passes per frame' },
	{ key: 'pressure', label: 'Gas pressure equalize', min: 0, max: 100, step: 1, unit: '%', hint: 'multi-scale mean transfer: equalises the whole field, ignores the per-cell ceiling' },
];

const Controls = {
	knobs: [],
	picks: [],
	paintDot: null,

	build() {
		const host = $('rows');
		for (const def of CONTROLS) {
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
			Controls.knobs.push({ def, input, val });
			Controls.show(def, input, val);
		}
		const block = document.createElement('div');
		block.className = 'row check';
		const tick = document.createElement('input');
		tick.type = 'checkbox';
		tick.checked = !!Settings.blockForeign;
		const bt = document.createElement('label');
		bt.textContent = 'Colors block each other';
		bt.prepend(tick);
		tick.addEventListener('change', () => { Settings.blockForeign = tick.checked ? 1 : 0; });
		block.append(bt);
		host.append(block);
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

	edit(def, input, val) {
		Settings[def.key] = +input.value;
		Controls.show(def, input, val);
	},

	show(def, input, val) {
		const v = Settings[def.key];
		if (def.key === 'capBase') val.textContent = v ? v + def.unit : 'off';
		else val.textContent = v + def.unit;
		input.value = v;
	},

	pick(p) {
		Settings.paint = p;
		Controls.sync();
	},

	sync() {
		for (const k of Controls.knobs) Controls.show(k.def, k.input, k.val);
		for (let p = 0; p < 3; p++) Controls.picks[p].classList.toggle('on', Settings.paint === p);
		Controls.paintDot.textContent = 'paint source: click map';
		$('pause').textContent = Settings.paused ? 'resume' : 'pause';
	},
};
