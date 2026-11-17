// owns: objective HUD — task actions, hold progress, zone shares, attempt history, focus controls, solution and its explanation
// edit for: task actions, objective readouts, hint wording, HUD layout, solution panel

const HUD = {
	host: null,
	fill: null,
	status: null,
	holdLine: null,
	zoneLine: null,
	goalLine: null,
	history: null,
	run: null,
	hint: null,
	target: null,
	fold: null,
	picks: [],
	zBars: [],
	solveBtn: null,
	revertBtn: null,
	why: null,
	whyHead: null,
	whyNotes: null,
	whyChanged: null,
	newTaskBtn: null,
	resetGuiBtn: null,
	taskLine: null,

	init(host) {
		HUD.host = host;
		host.hidden = false;
		HUD.build(host);
		Controls.buildSpot($('hud-spots'));
		HUD.syncTarget();
		HUD.refresh();
	},

	el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	},

	build(host) {
		const main = HUD.el('div', 'hud-main');
		const head = HUD.el('div', 'hud-head');
		head.append(HUD.el('span', 'hud-title', 'objective'));
		const colors = HUD.el('div', 'hud-colors');
		for (let p = 0; p < 3; p++) {
			const b = HUD.el('button', 'pick p' + p, View.names[p]);
			b.type = 'button';
			b.id = 'hud-pick-' + p;
			b.title = 'play this pigment; the attempt restarts';
			b.addEventListener('click', () => HUD.pick(p));
			colors.append(b);
			HUD.picks.push(b);
		}
		head.append(colors);
		HUD.status = HUD.el('span', 'hud-status', 'CAPTURE');
		HUD.status.id = 'hud-status';
		HUD.status.title = 'capture below ' + NEED_PCT + '%, holding above it, held at the target';
		head.append(HUD.status);
		HUD.fold = HUD.el('button', 'hud-fold', '–');
		HUD.fold.type = 'button';
		HUD.fold.title = 'collapse objective panel';
		HUD.fold.addEventListener('click', HUD.toggle);
		head.append(HUD.fold);
		main.append(head);
		main.append(HUD.el('div', 'hud-sub', 'hold the center ring · ' + NEED_PCT + '% share'));

		const taskRow = HUD.el('div', 'hud-task-row');
		taskRow.append(HUD.el('span', 'hud-task-label', 'task'));
		HUD.newTaskBtn = HUD.el('button', 'hud-task primary', 'new task');
		HUD.newTaskBtn.type = 'button';
		HUD.newTaskBtn.id = 'hud-new-task';
		HUD.newTaskBtn.title = 'load a different scene, pigment and hold target; restore scene defaults and restart';
		HUD.newTaskBtn.addEventListener('click', HUD.newTask);
		HUD.resetGuiBtn = HUD.el('button', 'hud-task', 'reset GUI');
		HUD.resetGuiBtn.type = 'button';
		HUD.resetGuiBtn.id = 'hud-reset-gui';
		HUD.resetGuiBtn.title = 'keep this scene; restore default sliders, R pigment, brush and 20 s target';
		HUD.resetGuiBtn.addEventListener('click', HUD.resetGui);
		taskRow.append(HUD.newTaskBtn, HUD.resetGuiBtn);
		main.append(taskRow);
		HUD.taskLine = HUD.el('div', 'hud-task-name', '');
		main.append(HUD.taskLine);

		const bar = HUD.el('div', 'hud-bar');
		bar.title = 'fills while you dominate ' + NEED_PCT + '% of the ring; losing it drains twice as fast';
		HUD.fill = HUD.el('div', 'hud-fill');
		HUD.fill.id = 'hud-fill';
		bar.append(HUD.fill);
		main.append(bar);

		const line = HUD.el('div', 'hud-line');
		HUD.holdLine = HUD.el('span', 'hud-hold', '0.0 / 20 s');
		line.append(HUD.holdLine);
		main.append(line);

		HUD.zoneLine = HUD.el('div', 'hud-detail', '');
		main.append(HUD.zoneLine);

		const zbar = HUD.el('div', 'hud-zbar');
		zbar.title = 'ring cells by dominant pigment; open = empty or tied';
		for (let c = 0; c < 3; c++) {
			const span = HUD.el('span', 'z p' + c);
			zbar.append(span);
			HUD.zBars.push(span);
		}
		HUD.zBars.push(HUD.el('span', 'z open'));
		zbar.append(HUD.zBars[3]);
		main.append(zbar);

		HUD.goalLine = HUD.el('div', 'hud-detail', '');
		main.append(HUD.goalLine);

		const side = HUD.el('div', 'hud-side');
		HUD.history = HUD.el('div', 'hud-detail', '');
		HUD.run = HUD.el('div', 'hud-detail', '');
		HUD.hint = HUD.el('div', 'hud-hint', '');
		side.append(HUD.history, HUD.run, HUD.hint);

		const focus = HUD.el('div', 'hud-focus');
		focus.append(HUD.el('div', 'hud-caption', 'focus · changes that matter now'));
		const spots = HUD.el('div', 'hud-spots');
		spots.id = 'hud-spots';
		focus.append(spots);
		const solveRow = HUD.el('div', 'hud-solve-row');
		HUD.solveBtn = HUD.el('button', 'hud-solve', 'solve');
		HUD.solveBtn.type = 'button';
		HUD.solveBtn.id = 'hud-solve';
		HUD.solveBtn.title = 'apply the suggested settings and mark every control that changes';
		HUD.solveBtn.addEventListener('click', () => HUD.solve());
		HUD.revertBtn = HUD.el('button', 'hud-revert', 'revert');
		HUD.revertBtn.type = 'button';
		HUD.revertBtn.id = 'hud-revert';
		HUD.revertBtn.title = 'restore the settings from before the suggestion';
		HUD.revertBtn.hidden = true;
		HUD.revertBtn.addEventListener('click', HUD.revert);
		solveRow.append(HUD.solveBtn, HUD.revertBtn);
		focus.append(solveRow);
		focus.append(HUD.whyPanel());

		const foot = HUD.el('div', 'hud-foot');
		const label = HUD.el('label', 'hud-target-label', 'target');
		HUD.target = document.createElement('select');
		HUD.target.id = 'hud-target';
		for (const value of TASK_TARGETS) {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = value + ' s';
			HUD.target.append(option);
		}
		HUD.target.addEventListener('change', HUD.setTarget);
		label.append(HUD.target);
		foot.append(label);
		const newBtn = HUD.el('button', 'hud-new', 'new attempt');
		newBtn.type = 'button';
		newBtn.title = 'clear hold progress and history; the map keeps its current state';
		newBtn.addEventListener('click', HUD.restart);
		foot.append(newBtn);
		focus.append(foot);

		host.append(main, side, focus);
	},

	whyPanel() {
		HUD.why = HUD.el('div', 'hud-why');
		HUD.why.id = 'hud-why';
		HUD.why.hidden = true;
		HUD.whyHead = HUD.el('div', 'hud-why-head');
		HUD.whyNotes = HUD.el('div', 'hud-why-notes');
		HUD.whyChanged = HUD.el('div', 'hud-why-changes');
		HUD.why.append(HUD.whyHead, HUD.whyNotes, HUD.whyChanged);
		return HUD.why;
	},

	newTask() {
		Task.generate(Settings);
		HUD.startTask('new task', 'scene, pigment and target are new; every setting is back to its scene default');
	},

	resetGui() {
		Task.defaults(Settings);
		HUD.startTask('GUI defaults', 'the current scene is kept; every setting is back to its default');
	},

	startTask(headline, note) {
		Solution.clear();
		Controls.unflash();
		Main.reset();
		Controls.refresh();
		HUD.showWhy({ headline, notes: [HUD.taskText(), note], edits: [] });
		HUD.refresh();
	},

	taskText() {
		return SCENES[Settings.scene].name + ' · ' + View.names[Settings.paint] + ' pigment · hold ' + Settings.holdTarget + ' s';
	},

	solve(quiet) {
		const plan = Solution.apply(Settings, Objective);
		Controls.refresh();
		if (!quiet) Controls.flash(plan.edits);
		HUD.showWhy(plan);
		HUD.refresh();
	},

	// scene rules replace every setting, so the suggestion restarts from the new scene
	solveActive() {
		return Solution.active();
	},

	rescene() {
		Solution.clear();
		HUD.solve(true);
	},

	revert() {
		const plan = Solution.revert(Settings);
		if (!plan) return;
		Controls.refresh();
		Controls.flash(plan.edits);
		HUD.showWhy(plan);
		HUD.refresh();
	},

	showWhy(plan) {
		HUD.whyHead.textContent = plan.headline;
		HUD.whyNotes.replaceChildren();
		for (const note of plan.notes) HUD.whyNotes.append(HUD.el('div', 'hud-why-note', note));
		HUD.whyChanged.textContent = plan.edits.length ? 'changed · ' + plan.edits.map(Controls.changeText).join(' · ') : '';
		HUD.why.hidden = false;
		HUD.revertBtn.hidden = !Solution.active();
	},

	pick(p) {
		if (p !== Settings.paint) {
			Controls.pick(p);
			Objective.reset(Settings);
			if (Solution.active()) HUD.solve();
		}
		HUD.refresh();
	},

	restart() {
		Objective.reset(Settings);
		HUD.refresh();
	},

	toggle() {
		const folded = HUD.host.classList.toggle('folded');
		HUD.fold.textContent = folded ? '+' : '–';
		HUD.fold.title = folded ? 'expand objective panel' : 'collapse objective panel';
	},

	syncTarget() {
		const value = Settings.holdTarget;
		if (!Array.from(HUD.target.options).some(o => +o.value === value)) {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = value + ' s';
			HUD.target.append(option);
		}
		HUD.target.value = value;
	},

	setTarget() {
		Settings.holdTarget = +HUD.target.value;
		UrlSettings.save();
		Objective.reset(Settings);
		HUD.refresh();
	},

	focusKeys() {
		if (Objective.control) return ['gasDamping', 'react', 'mix'];
		if (Objective.mass[Objective.player] < Objective.area * FP_ONE) return ['brush', 'sourceRate', 'react'];
		return ['sourceRate', 'mix', 'react'];
	},

	rival() {
		let best = -1;
		let bestShare = -1;
		for (let p = 0; p < 3; p++) {
			if (p === Objective.player) continue;
			if (Objective.share[p] > bestShare) {
				bestShare = Objective.share[p];
				best = p;
			}
		}
		return best;
	},

	refresh() {
		if (!HUD.host || !Objective.area) return;
		if (+HUD.target.value !== Settings.holdTarget) HUD.syncTarget();
		HUD.taskLine.textContent = HUD.taskText();
		const o = Objective;
		const p = o.player < 0 ? Settings.paint : o.player;
		const rival = HUD.rival();
		const margin = o.share[p] - o.share[rival];
		const ratio = o.holdRatio();
		HUD.fill.style.width = (ratio * 100).toFixed(1) + '%';
		HUD.fill.style.background = View.zoneColors[p];
		HUD.holdLine.textContent = (o.hold / 60).toFixed(1) + ' / ' + (o.target / 60).toFixed(0) + ' s';
		HUD.zoneLine.textContent = 'zone  ' +
			View.names[0] + ' ' + HUD.pct(o.share[0]) + '%  ' +
			View.names[1] + ' ' + HUD.pct(o.share[1]) + '%  ' +
			View.names[2] + ' ' + HUD.pct(o.share[2]) + '%  open ' + HUD.pct(100 - o.share[0] - o.share[1] - o.share[2]) + '%';
		HUD.goalLine.textContent = 'you ' + HUD.pct(o.share[p]) + '% · need ' + NEED_PCT + '% · margin ' +
			HUD.signed(margin) + 'pp · trend ' + HUD.signed(o.trend[p]) + '%/s · peak ' + HUD.pct(o.peak[p]) + '%';
		HUD.history.textContent = 'best ' + (o.best / 60).toFixed(1) + 's · captures ' + o.captures +
			' · losses ' + o.losses + ' · lead flips ' + o.flips;
		HUD.run.textContent = 'elapsed ' + HUD.clock(o.elapsed) + ' · in control ' +
			HUD.pct(o.controlFrames * 100 / Math.max(1, o.elapsed)) + '%' + (o.state === 2 ? ' · held at ' + HUD.clock(o.heldAt) : '');
		HUD.hint.textContent = HUD.tip(p, rival);
		HUD.status.textContent = o.state === 2 ? 'HELD' : o.control ? 'HOLDING' : 'CAPTURE';
		HUD.host.classList.toggle('holding', !!o.control && o.state !== 2);
		HUD.host.classList.toggle('done', o.state === 2);
		for (let c = 0; c < 3; c++) {
			HUD.zBars[c].style.width = o.share[c].toFixed(1) + '%';
			HUD.picks[c].classList.toggle('on', p === c);
		}
		HUD.zBars[3].style.width = (100 - o.share[0] - o.share[1] - o.share[2]).toFixed(1) + '%';
		Controls.spotlight(HUD.focusKeys());
	},

	tip(p, rival) {
		const o = Objective;
		if (o.state === 2) return 'target held — new attempt keeps the map, reset reruns the scene';
		if (o.hold > 0 && !o.control) return 'hold draining — take back ' + NEED_PCT + '% of the ring or the streak goes to zero';
		if (!o.control) {
			if (o.mass[p] < o.area * FP_ONE) return 'no pigment in the ring — paint ' + View.names[p] + ' inside it';
			return 'below ' + NEED_PCT + '% — open mix/reaction with ' + View.names[rival] + ' or raise production';
		}
		return 'holding — margin ' + HUD.signed(o.share[p] - o.share[rival]) + 'pp, rival trend ' +
			HUD.signed(o.trend[rival]) + '%/s';
	},

	pct(v) {
		return Math.round(v);
	},

	signed(v) {
		return (v >= 0 ? '+' : '') + v.toFixed(1);
	},

	clock(frames) {
		const s = Math.floor(frames / 60);
		const m = Math.floor(s / 60);
		const r = s - m * 60;
		return m + ':' + (r < 10 ? '0' : '') + r;
	},
};
