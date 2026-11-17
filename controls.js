// owns: panel widgets and their binding to Settings
// edit for: slider list, labels, pair groups, reaction modes, paint players, buttons

const MODE_HINTS = [
	'both colors in the pair lose the same amount where they overlap',
	'locally denser color loses proportionally less than the minority color',
	'locally denser color converts minority color into itself, conserving total mass',
	'one color consumes the other with no loss; click pair badge to flip direction',
];

const CONTROLS = [
	{ key: 'gasSpeed', label: 'Gas pressure speed', min: 0, max: 100, step: 1, unit: '%', hint: 'pressure wave propagation speed; 0 stops gas flow' },
	{ key: 'gasDamping', label: 'Gas viscosity', min: 0, max: 100, step: 1, unit: '%', hint: 'momentum drag; low = bouncy acoustic waves, high = thick viscous drift' },
	{ key: 'mixRate', label: 'Mix into other color', group: 'mix', kind: 'rate', hint: 'permeability at which each color pair enters the other color; unchecked or 0% acts as a wall' },
	{ key: 'reactRate', label: 'Reaction', group: 'react', kind: 'rate', hint: 'per-frame reaction strength where the color pair overlaps' },
	{ key: 'depletion', label: 'Depletion', min: 0, max: 5, step: 0.1, unit: '/f', hint: 'color removed from every cell each frame (1.0 = 1 of 255/f); >0 forms gradient, 0 equalizes' },
	{ key: 'playerFlow', label: 'Player supply', min: 0, max: 2000, step: 20, unit: '/f', hint: 'total color a player injects per frame shared across all their sources; 0 = unlimited per source' },
	{ key: 'maxMass', label: 'Total color limit', min: 0, max: 2000, step: 20, unit: 'k', hint: 'maximum total color mass a player can hold; 0 = unlimited (sources stay at 255)' },
	{ key: 'sourceRate', label: 'Source rate', min: 0, max: 255, step: 1, unit: '/f', hint: 'maximum color a single source cell injects each frame' },
	{ key: 'capBase', label: 'Max color per cell', min: 0, max: 1023, step: 1, unit: '', hint: 'per-cell ceiling on a 16-cell territory; 0 = no limit' },
	{ key: 'capTerritory', label: 'Small territory boost', min: 0, max: 100, step: 1, unit: '%', hint: 'how far a smaller territory raises the per-cell ceiling' },
	{ key: 'brush', label: 'Source brush', min: 0, max: 3, step: 1, unit: '', hint: 'source paint diameter in cells' },
	{ key: 'substeps', label: 'Steps per frame', min: 1, max: 2, step: 1, unit: '', hint: 'physics passes per frame' },
];

const Controls = {
	knobs: [],
	picks: [],
	toggles: [],
	modes: [],
	dirs: [],
	paintDot: null,

	// one checkbox per pair plus an "all" shortcut; individual pair bits stay authoritative
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
			const slug = PAIR_NAMES[p].toLowerCase();
			const l = document.createElement('label');
			const tick = document.createElement('input');
			tick.type = 'checkbox';
			tick.id = def.group + '-' + slug + '-on';
			tick.addEventListener('change', () => Controls.setPair(def, p, tick.checked));
			l.append(tick, PAIR_NAMES[p]);
			g.append(l);
			Controls.toggles.push({ def, p, node: tick });
		}
		g.append(all);
		Controls.toggles.push({ def, p: -1, node: allTick });
		host.append(g);
	},

	buildModes(host) {
		const row = document.createElement('div');
		row.className = 'row modes';
		for (let m = 0; m < REACT_MODES.length; m++) {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'mode';
			b.id = 'mode-' + REACT_MODES[m];
			b.textContent = REACT_MODES[m];
			b.title = MODE_HINTS[m];
			b.addEventListener('click', () => Controls.setMode(m));
			row.append(b);
			Controls.modes.push(b);
		}
		host.append(row);
	},

	buildRates(host, def) {
		for (let p = 0; p < 3; p++) {
			const slug = PAIR_NAMES[p].toLowerCase();
			const row = document.createElement('div');
			row.className = 'row';
			const head = document.createElement('label');
			const name = document.createElement('span');
			name.textContent = def.label + ' ' + PAIR_NAMES[p];
			if (def.group === 'react') {
				const dir = document.createElement('button');
				dir.type = 'button';
				dir.className = 'dir';
				dir.id = 'dir-' + slug;
				dir.title = 'flip which color consumes the other in this pair';
				dir.addEventListener('click', () => Controls.flipDir(p));
				name.append(' ', dir);
				Controls.dirs.push({ p, node: dir });
			}
			const val = document.createElement('output');
			head.append(name, val);
			const input = document.createElement('input');
			input.type = 'range';
			input.id = def.group + '-' + slug;
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
				if (def.group === 'react') Controls.buildModes(host);
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
			input.id = 'ctrl-' + def.key;
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

	refresh() {
		Controls.sync();
		View.stats($('stats'));
	},

	setPair(def, p, on) {
		const bit = 1 << p;
		const key = Controls.maskKey(def);
		Settings[key] = on ? Settings[key] | bit : Settings[key] & ~bit;
		Controls.refresh();
	},

	setGroup(def, mask) {
		Settings[Controls.maskKey(def)] = mask;
		Controls.refresh();
	},

	setMode(m) {
		Settings.reactMode = m;
		Controls.refresh();
	},

	flipDir(p) {
		Settings.reactDir[p] = Settings.reactDir[p] ? 0 : 1;
		if (Settings.reactRate[p] > 0) Settings.reactMask |= 1 << p;
		Controls.refresh();
	},

	// dragging a pair rate above 0 enables that pair, so a slider always takes effect immediately
	editRate(def, p, input, val) {
		Settings[def.key][p] = +input.value;
		if (Settings[def.key][p] > 0) Settings[Controls.maskKey(def)] |= 1 << p;
		Controls.refresh();
	},

	edit(def, input, val) {
		Settings[def.key] = +input.value;
		Controls.show(def, input, val);
	},

	show(def, input, val) {
		const v = Settings[def.key];
		const offable = def.key === 'capBase' || def.key === 'maxMass' || def.key === 'playerFlow';
		if (offable) val.textContent = v ? v + def.unit : 'off';
		else if (def.key === 'brush') val.textContent = (v * 2 + 1) + 'px';
		else if (def.key === 'depletion') val.textContent = v.toFixed(1) + def.unit;
		else val.textContent = v + def.unit;
		input.value = v;
	},

	showRate(def, p, val) {
		val.textContent = Settings[def.key][p] + '%';
	},

	pick(p) {
		Settings.paint = p;
		Controls.sync();
	},

	pairLive(def, p) {
		const bit = 1 << p;
		if (!(Settings[Controls.maskKey(def)] & bit) || Settings[def.key][p] <= 0) return false;
		return def.group === 'mix' || !!(Gas.liveMask(Settings) & bit);
	},

	sync() {
		for (const k of Controls.knobs) {
			if (k.p >= 0) {
				k.row.classList.toggle('dim', !Controls.pairLive(k.def, k.p));
				k.input.value = Settings[k.def.key][k.p];
				Controls.showRate(k.def, k.p, k.val);
			} else {
				Controls.show(k.def, k.input, k.val);
			}
		}
		for (const t of Controls.toggles) {
			const mask = Settings[Controls.maskKey(t.def)];
			t.node.checked = t.p < 0 ? mask === 7 : !!(mask & (1 << t.p));
		}
		for (let m = 0; m < Controls.modes.length; m++) {
			Controls.modes[m].classList.toggle('on', Settings.reactMode === m);
		}
		const showDir = Settings.reactMode === 3;
		for (const d of Controls.dirs) {
			d.node.hidden = !showDir;
			d.node.textContent = View.dirLabel(d.p, Settings.reactDir[d.p]);
		}
		for (let p = 0; p < 3; p++) Controls.picks[p].classList.toggle('on', Settings.paint === p);
		Controls.paintDot.textContent = 'paint source: left click · erase: right click';
		$('pause').textContent = Settings.paused ? 'resume' : 'pause';
	},
};
