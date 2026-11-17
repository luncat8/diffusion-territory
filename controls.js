// owns: panel widgets and their binding to Settings
// edit for: slider list, labels, pair groups, reaction modes, paint players, buttons, focus spot

const MODE_HINTS = [
	'both colors in the pair lose the same amount where they overlap',
	'locally denser color loses proportionally less than the minority color',
	'locally denser color converts minority color into itself, conserving total mass',
	'one color consumes the other with no loss; click pair badge to flip direction',
];

const CONTROLS = [
	{ key: 'gasSpeed', label: 'Gas pressure speed', short: 'pressure', min: 0, max: 100, step: 1, unit: '%', hint: 'pressure wave propagation speed; 0 stops gas flow' },
	{ key: 'gasDamping', label: 'Gas viscosity', short: 'viscosity', min: 0, max: 100, step: 1, unit: '%', hint: 'momentum drag; low = bouncy acoustic waves, high = thick viscous drift' },
	{ key: 'mixRate', label: 'Mix into other color', group: 'mix', kind: 'rate', hint: 'permeability at which each color pair enters the other color; unchecked or 0% acts as a wall' },
	{ key: 'reactRate', label: 'Reaction', group: 'react', kind: 'rate', hint: 'percent of minority consumed per tick at full concentrations; dilute reagents react much slower' },
	{ key: 'reactExponent', label: 'Reaction dilution exponent', min: 1, max: 2, step: 1, unit: '', hint: '1: slow trace consumption; 2: stronger suppression in dilute pigment' },
	{ key: 'sourceMode', label: 'Production rule', min: 0, max: 2, step: 1, labels: ['dominance', 'low pigment', 'low pigment + threshold'], hint: 'all modes require at least 5% of the producing pigment; below 5% is uncontrolled' },
	{ key: 'sourceDominance', label: 'Dominance multiplier k', min: 1, max: 5, step: 0.1, unit: '×', hint: 'dominance production requires own pigment > k × sum of rivals' },
	{ key: 'sourceThreshold', label: 'Production total threshold', min: 0.05, max: 3, step: 0.05, unit: '×255', hint: 'thresholded mode produces only when total pigment is below this value' },
	...['R toward G', 'R toward B', 'G toward R', 'G toward B', 'B toward R', 'B toward G'].map((label, index) => ({
		key: 'response', index, label, min: -100, max: 100, step: 1, unit: '%',
		hint: 'positive: move up rival gradient; negative: move away; requires pair mixing; 0 ignores rival',
	})),
	{ key: 'depletion', label: 'Depletion', min: 0, max: 5, step: 0.1, unit: '/f', hint: 'color removed from every cell each frame (1.0 = 1 of 255/f); >0 forms gradient, 0 equalizes' },
	{ key: 'playerFlow', label: 'Player supply', min: 0, max: 2000, step: 20, unit: '/f', hint: 'total growth per player per tick shared across eligible cells; 0 = unlimited' },
	{ key: 'maxMass', label: 'Total color limit', min: 0, max: 2000, step: 20, unit: 'k', hint: 'maximum total pigment per player; 0 = unlimited' },
	{ key: 'sourceRate', label: 'Cell production rate', short: 'production', min: 0, max: 255, step: 1, unit: '/f', hint: 'pigment per eligible cell per tick before fertility and saturation; 0 disables growth' },
	{ key: 'capBase', label: 'Max color per cell', min: 0, max: 1023, step: 1, unit: '', hint: 'per-cell ceiling on a 16-cell territory; 0 = no limit' },
	{ key: 'capTerritory', label: 'Small territory boost', min: 0, max: 100, step: 1, unit: '%', hint: 'how far a smaller territory raises the per-cell ceiling' },
	{ key: 'brush', label: 'Pigment brush', short: 'brush', min: 0, max: 3, step: 1, unit: '', hint: 'pigment paint diameter in cells' },
	{ key: 'showSources', label: 'Production overlay', min: 0, max: 1, step: 1, labels: ['off', 'on'], hint: 'mark all cells eligible to produce pigment; shared supply may still limit growth' },
	{ key: 'substeps', label: 'Steps per frame', min: 1, max: 2, step: 1, unit: '', hint: 'physics passes per frame' },
];

const SPOT_KEYS = ['sourceRate', 'gasSpeed', 'gasDamping', 'brush'];

const Controls = {
	knobs: [],
	picks: [],
	toggles: [],
	modes: [],
	dirs: [],
	paintDot: null,
	sceneSelect: null,
	spotMode: null,
	spotModeRow: null,

	buildScenes() {
		const row = document.createElement('label');
		row.className = 'scene-row';
		row.append('test scene');
		Controls.sceneSelect = document.createElement('select');
		Controls.sceneSelect.id = 'scene-select';
		for (let i = 0; i < SCENES.length; i++) {
			const option = document.createElement('option');
			option.value = i;
			option.textContent = SCENES[i].name;
			Controls.sceneSelect.append(option);
		}
		Controls.sceneSelect.addEventListener('change', () => Main.loadScene(+Controls.sceneSelect.value));
		row.append(Controls.sceneSelect);
		$('scenes').append(row);
	},

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
		for (let p = 0; p < 3; p++) Controls.buildRateRow(host, def, p, def.label + ' ' + PAIR_NAMES[p], false, -1);
	},

	// spot rows reuse this factory but resolve their pair from the active pigment, so two rows cover both rivals
	buildRateRow(host, def, p, label, spot, slot) {
		const row = document.createElement('div');
		row.className = 'row';
		if (spot) row.classList.add('spot-row');
		const head = document.createElement('label');
		const name = document.createElement('span');
		name.textContent = label;
		if (def.group === 'react' && !spot) {
			const dir = document.createElement('button');
			dir.type = 'button';
			dir.className = 'dir';
			dir.id = 'dir-' + PAIR_NAMES[p].toLowerCase();
			dir.title = 'flip which color consumes the other in this pair';
			dir.addEventListener('click', () => Controls.flipDir(p));
			name.append(' ', dir);
			Controls.dirs.push({ p, node: dir });
		}
		const val = document.createElement('output');
		head.append(name, val);
		const input = document.createElement('input');
		input.type = 'range';
		input.id = spot ? 'spot-' + def.group + '-' + slot : def.group + '-' + PAIR_NAMES[p].toLowerCase();
		input.title = def.hint;
		input.min = 0;
		input.max = 100;
		input.step = 1;
		input.value = spot ? 0 : Settings[def.key][p];
		input.addEventListener('input', () => {
			const pair = spot ? Controls.spotPair(slot) : p;
			Controls.editRate(def, pair, input);
		});
		row.append(head, input);
		host.append(row);
		Controls.knobs.push({ def, p, row, input, val, name, labelBase: spot ? label : '', spot: spot ? def.group : '', slot: spot ? slot : -1 });
		if (!spot) Controls.showRate(def, p, val);
	},

	buildKnob(host, def, prefix = 'ctrl') {
		const spot = prefix === 'spot';
		const row = document.createElement('div');
		row.className = 'row';
		if (spot) row.classList.add('spot-row');
		const head = document.createElement('label');
		const name = document.createElement('span');
		name.textContent = spot && def.short ? def.short : def.label;
		const val = document.createElement('output');
		head.append(name, val);
		const input = document.createElement('input');
		input.type = 'range';
		input.id = prefix + '-' + def.key + (def.index === undefined ? '' : '-' + def.index);
		input.title = def.hint;
		input.min = def.min;
		input.max = def.max;
		input.step = def.step;
		input.value = def.index === undefined ? Settings[def.key] : Settings[def.key][def.index];
		input.addEventListener('input', () => Controls.edit(def, input));
		row.append(head, input);
		host.append(row);
		Controls.knobs.push({ def, p: -1, row, input, val, spot: spot ? def.key : '', slot: -1 });
		Controls.show(def, input, val);
	},

	build() {
		Controls.buildScenes();
		const host = $('rows');
		for (const def of CONTROLS) {
			if (def.kind === 'rate') {
				Controls.buildChecks(host, def);
				if (def.group === 'react') Controls.buildModes(host);
				Controls.buildRates(host, def);
				continue;
			}
			Controls.buildKnob(host, def);
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

	// quick controls for the hold objective: production, pressure, viscosity, brush, both pair rates, reaction mode
	buildSpot(host) {
		for (const key of SPOT_KEYS) {
			const def = CONTROLS.find(d => d.key === key && d.index === undefined);
			if (def) Controls.buildKnob(host, def, 'spot');
		}
		const mix = CONTROLS.find(d => d.group === 'mix');
		const react = CONTROLS.find(d => d.group === 'react');
		for (let slot = 0; slot < 2; slot++) Controls.buildRateRow(host, mix, -1, 'mix', true, slot);
		for (let slot = 0; slot < 2; slot++) Controls.buildRateRow(host, react, -1, 'react', true, slot);
		Controls.buildSpotMode(host);
		Controls.sync();
	},

	buildSpotMode(host) {
		const row = document.createElement('div');
		row.className = 'row spot-row';
		const label = document.createElement('label');
		const name = document.createElement('span');
		name.textContent = 'reaction mode';
		const select = document.createElement('select');
		select.id = 'spot-mode';
		select.title = MODE_HINTS[0];
		for (let m = 0; m < REACT_MODES.length; m++) {
			const option = document.createElement('option');
			option.value = m;
			option.textContent = REACT_MODES[m];
			select.append(option);
		}
		select.addEventListener('change', () => Controls.setMode(+select.value));
		label.append(name, select);
		row.append(label);
		host.append(row);
		Controls.spotMode = select;
		Controls.spotModeRow = row;
	},

	spotlight(keys) {
		for (const k of Controls.knobs) {
			if (k.spot) k.row.classList.toggle('focus', keys.indexOf(k.spot) >= 0);
		}
		if (Controls.spotModeRow) Controls.spotModeRow.classList.toggle('focus', keys.indexOf('react') >= 0);
	},

	maskKey(def) {
		return def.group === 'mix' ? 'mixMask' : 'reactMask';
	},

	spotPair(slot) {
		return PAIR_INDEX[Settings.paint][(Settings.paint + 1 + slot) % 3];
	},

	refresh() {
		Controls.sync();
		View.stats($('stats'));
		UrlSettings.save();
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
		if (Controls.spotMode) {
			Controls.spotMode.value = m;
			Controls.spotMode.title = MODE_HINTS[m];
		}
		Controls.refresh();
	},

	flipDir(p) {
		Settings.reactDir[p] = Settings.reactDir[p] ? 0 : 1;
		if (Settings.reactRate[p] > 0) Settings.reactMask |= 1 << p;
		Controls.refresh();
	},

	// dragging a pair rate above 0 enables that pair, so a slider always takes effect immediately
	editRate(def, p, input) {
		Settings[def.key][p] = +input.value;
		if (Settings[def.key][p] > 0) Settings[Controls.maskKey(def)] |= 1 << p;
		Controls.refresh();
	},

	edit(def, input) {
		if (def.index === undefined) Settings[def.key] = +input.value;
		else Settings[def.key][def.index] = +input.value;
		Controls.sync();
		UrlSettings.save();
	},

	show(def, input, val) {
		const v = def.index === undefined ? Settings[def.key] : Settings[def.key][def.index];
		const offable = def.key === 'capBase' || def.key === 'maxMass' || def.key === 'playerFlow';
		if (def.labels) val.textContent = def.labels[v];
		else if (offable) val.textContent = v ? v + def.unit : 'off';
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
		UrlSettings.save();
	},

	pairLive(def, p) {
		const bit = 1 << p;
		if (!(Settings[Controls.maskKey(def)] & bit) || Settings[def.key][p] <= 0) return false;
		return def.group === 'mix' || !!(Gas.liveMask(Settings) & bit);
	},

	sync() {
		Controls.sceneSelect.value = Settings.scene;
		for (const k of Controls.knobs) {
			if (k.slot >= 0) {
				const p = Controls.spotPair(k.slot);
				k.p = p;
				k.name.textContent = k.labelBase + ' ' + View.names[(Settings.paint + 1 + k.slot) % 3];
				k.input.value = Settings[k.def.key][p];
				Controls.showRate(k.def, p, k.val);
				k.row.classList.toggle('dim', !Controls.pairLive(k.def, p));
				continue;
			}
			if (k.p >= 0) {
				k.row.classList.toggle('dim', !Controls.pairLive(k.def, k.p));
				k.input.value = Settings[k.def.key][k.p];
				Controls.showRate(k.def, k.p, k.val);
				continue;
			}
			Controls.show(k.def, k.input, k.val);
		}
		for (const t of Controls.toggles) {
			const mask = Settings[Controls.maskKey(t.def)];
			t.node.checked = t.p < 0 ? mask === 7 : !!(mask & (1 << t.p));
		}
		for (let m = 0; m < Controls.modes.length; m++) {
			Controls.modes[m].classList.toggle('on', Settings.reactMode === m);
		}
		if (Controls.spotMode) {
			Controls.spotMode.value = Settings.reactMode;
			Controls.spotMode.title = MODE_HINTS[Settings.reactMode];
		}
		const showDir = Settings.reactMode === 3;
		for (const d of Controls.dirs) {
			d.node.hidden = !showDir;
			d.node.textContent = View.dirLabel(d.p, Settings.reactDir[d.p]);
		}
		for (let p = 0; p < 3; p++) Controls.picks[p].classList.toggle('on', Settings.paint === p);
		Controls.paintDot.textContent = 'paint pigment: left click · erase pigment: right click';
		$('pause').textContent = Settings.paused ? 'resume' : 'pause';
	},
};
