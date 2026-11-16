// owns: panel widgets and their binding to Settings
// edit for: slider list, labels, pair groups, paint players, buttons

const PAIRS = ['rg', 'rb', 'gb'];

const CONTROLS = [
	{ key: 'gasSpeed', label: 'Gas pressure speed', min: 0, max: 100, step: 1, unit: '%', hint: 'pressure wave propagation speed; 0 stops gas flow' },
	{ key: 'gasDamping', label: 'Gas viscosity', min: 0, max: 100, step: 1, unit: '%', hint: 'momentum drag; low = bouncy acoustic waves, high = thick viscous drift' },
	{ key: 'mixRate', label: 'Mix into other color', group: 'mix', kind: 'rate', hint: 'rate at which each color pair enters the other pair color; a checked pair mixes, unchecked pairs push like unmixable gases' },
	{ key: 'reactRate', label: 'Reaction', group: 'react', kind: 'rate', hint: 'reaction amount removed from each color of the pair per frame where the pair overlaps' },
	{ key: 'depletion', label: 'Depletion', min: 0, max: 5, step: 0.1, unit: '/f', hint: 'color removed from every cell each frame (1.0 = 1 of 255/f); >0 forms gradient, 0 equalizes' },
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
	toggles: [],
	paintDot: null,

	pairName(p) {
		return PAIRS[p].toUpperCase();
	},

	// one checkbox per pair plus an "all" box; the all box is a shortcut, pair boxes stay the truth
	buildChecks(host, def) {
		const g = document.createElement('div');
		g.className = 'row checks';
		const title = document.createElement('span');
		title.className = 'group';
		title.textContent = def.group === 'mix' ? 'mixing' : 'reaction';
		g.append(title);
		const all = document.createElement('label');
		const allTick = document.createElement('input');
		allTick.type = 'checkbox';
		allTick.id = def.group + '-all';
		allTick.addEventListener('change', () => Controls.setGroup(def, allTick.checked ? 7 : 0));
		all.append(allTick, 'all');
		for (let p = 0; p < 3; p++) {
			const l = document.createElement('label');
			const tick = document.createElement('input');
			tick.type = 'checkbox';
			tick.id = def.group + '-' + PAIRS[p] + '-on';
			tick.addEventListener('change', () => Controls.setPair(def, p, tick.checked));
			l.append(tick, Controls.pairName(p));
			g.append(l);
			Controls.toggles.push({ def, p, node: tick });
		}
		g.append(all);
		Controls.toggles.push({ def, p: -1, node: allTick });
		host.append(g);
	},

	buildRates(host, def) {
		for (let p = 0; p < 3; p++) {
			const row = document.createElement('div');
			row.className = 'row';
			const head = document.createElement('label');
			const name = document.createElement('span');
			name.textContent = def.label + ' ' + Controls.pairName(p);
			const val = document.createElement('output');
			head.append(name, val);
			const input = document.createElement('input');
			input.type = 'range';
			input.id = def.group + '-' + PAIRS[p];
			input.title = def.hint;
			input.min = 0;
			input.max = 100;
			input.step = 1;
			input.value = Settings[def.key][p];
			input.addEventListener('input', () => Controls.editRate(def, p, input, val));
			row.append(head, input);
			host.append(row);
			Controls.knobs.push({ def, p, row, input, val });
			Controls.showRate(def, p, val);
		}
	},

	build() {
		const host = $('rows');
		for (const def of CONTROLS) {
			if (def.kind === 'rate') {
				Controls.buildChecks(host, def);
				Controls.buildRates(host, def);
				continue;
			}
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
			Controls.knobs.push({ def, p: -1, row, input, val });
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

	maskKey(def) {
		return def.group === 'mix' ? 'mixMask' : 'reactMask';
	},

	setPair(def, p, on) {
		const bit = 1 << p;
		const key = Controls.maskKey(def);
		Settings[key] = on ? Settings[key] | bit : Settings[key] & ~bit;
		Controls.sync();
	},

	setGroup(def, mask) {
		Settings[Controls.maskKey(def)] = mask;
		Controls.sync();
	},

	// dragging a pair rate above 0 enables that pair, so a slider always takes effect immediately
	editRate(def, p, input, val) {
		Settings[def.key][p] = +input.value;
		if (Settings[def.key][p] > 0) Settings[Controls.maskKey(def)] |= 1 << p;
		Controls.sync();
	},

	edit(def, input, val) {
		Settings[def.key] = +input.value;
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

	showRate(def, p, val) {
		val.textContent = Settings[def.key][p] + '/f';
	},

	pick(p) {
		Settings.paint = p;
		Controls.sync();
	},

	// a pair row is live only when its box is checked and its rate is above zero
	pairLive(def, p) {
		return !!(Settings[Controls.maskKey(def)] & (1 << p)) && Settings[def.key][p] > 0;
	},

	sync() {
		for (const k of Controls.knobs) {
			if (k.p >= 0) {
				k.row.classList.toggle('dim', !Controls.pairLive(k.def, k.p));
				Controls.showRate(k.def, k.p, k.val);
			} else {
				Controls.show(k.def, k.input, k.val);
			}
		}
		for (const t of Controls.toggles) {
			const mask = Settings[Controls.maskKey(t.def)];
			t.node.checked = t.p < 0 ? mask === 7 : !!(mask & (1 << t.p));
		}
		for (let p = 0; p < 3; p++) Controls.picks[p].classList.toggle('on', Settings.paint === p);
		Controls.paintDot.textContent = 'paint source: left click · erase: right click';
		$('pause').textContent = Settings.paused ? 'resume' : 'pause';
	},
};
