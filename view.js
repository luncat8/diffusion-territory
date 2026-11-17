// owns: canvas rendering, pigment painting, cursor readout, production marks, objective ring, and stats
// edit for: color mapping, tooltip fields, pair score formatting, canvas interactions

const View = {
	canvas: null,
	ctx: null,
	imgCtx: null,
	img: null,
	pix: null,
	tip: null,
	scale: 4,
	hover: -1,
	cell: new Int32Array(8),
	markers: ['', '#f66', '#6f6', '#fc6', '#66f', '#f6f', '#6ff', '#fff'],
	names: ['R', 'G', 'B'],
	zoneColors: ['#f66', '#6f6', '#66f'],
	text: '',

	init(canvas, tip) {
		this.canvas = canvas;
		this.tip = tip;
		this.ctx = canvas.getContext('2d');
		this.scale = canvas.width / Field.w;
		this.img = document.createElement('canvas');
		this.img.width = Field.w;
		this.img.height = Field.h;
		this.imgCtx = this.img.getContext('2d');
		this.pix = this.imgCtx.createImageData(Field.w, Field.h);
		canvas.addEventListener('mousemove', View.move);
		canvas.addEventListener('mousedown', View.press);
		canvas.addEventListener('mouseleave', View.leave);
		canvas.addEventListener('contextmenu', View.block);
	},

	block(e) {
		e.preventDefault();
	},

	at(e) {
		const r = View.canvas.getBoundingClientRect();
		const x = Math.floor((e.clientX - r.left - View.canvas.clientLeft) / r.width * Field.w);
		const y = Math.floor((e.clientY - r.top - View.canvas.clientTop) / r.height * Field.h);
		if (x < 0 || y < 0 || x >= Field.w || y >= Field.h) return -1;
		return y * Field.w + x;
	},

	move(e) {
		const i = View.at(e);
		View.hover = i;
		if (i < 0) { View.tip.hidden = true; return; }
		if (e.buttons & 1) View.paintCell(i, Settings.paint, true);
		else if (e.buttons & 2) View.paintCell(i, Settings.paint, false);
		View.read(i, e);
	},

	press(e) {
		const i = View.at(e);
		if (i < 0) return;
		View.paintCell(i, Settings.paint, e.button !== 2);
		View.read(i, e);
	},

	paintCell(i, player, on) {
		Source.paint(i % Field.w, (i / Field.w) | 0, player, on, Settings.brush);
		Field.analyze();
		Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
		Source.prepare(Settings);
		Field.analyze();
	},

	leave() {
		View.hover = -1;
		View.tip.hidden = true;
	},

	read(i, e) {
		const c = View.cell;
		const x = i % Field.w;
		const y = (i / Field.w) | 0;
		Field.sample(x, y, c);
		const p = c[0] + c[1] + c[2];
		View.text =
			x + ',' + y + '  ' + (c[6] ? 'growth ' + View.maskName(c[6]) : 'no growth') + '  ' + View.state(c) +
			'\nR ' + View.fixed(c[0], c[3]) + '  G ' + View.fixed(c[1], c[4]) + '  B ' + View.fixed(c[2], c[5]) +
			'\npressure ' + p + '  cap R ' + View.capText(0) + ' G ' + View.capText(1) + ' B ' + View.capText(2);
		View.tip.textContent = View.text;
		View.tip.hidden = false;
		const r = View.canvas.getBoundingClientRect();
		View.tip.style.transform = 'translate(' + (e.clientX - r.left + 14) + 'px,' + (e.clientY - r.top + 14) + 'px)';
	},

	state(c) {
		if (c[7] !== NO_COLOR) return View.names[c[7]];
		const max = Math.max(c[0] * FP_ONE + c[3], c[1] * FP_ONE + c[4], c[2] * FP_ONE + c[5]);
		if (!max) return 'empty';
		return max < CONTROL_MIN ? 'uncontrolled' : 'contested';
	},

	capText(p) {
		return Field.cap[p] ? String(Field.cap[p] >> FP) : 'off';
	},

	maskName(mask) {
		let s = '';
		for (let p = 0; p < 3; p++) if (mask & (1 << p)) s += View.names[p];
		return s;
	},

	fixed(int, frac) {
		const f = frac * 100 / FP_ONE | 0;
		return int + '.' + (f < 10 ? '0' : '') + f;
	},

	draw() {
		const c0 = Field.ch[0];
		const c1 = Field.ch[1];
		const c2 = Field.ch[2];
		const d = this.pix.data;
		for (let i = 0, p = 0; i < Field.n; i++, p += 4) {
			const r = c0[i] >> FP;
			const g = c1[i] >> FP;
			const b = c2[i] >> FP;
			d[p] = r > 255 ? 255 : r > 0 ? r : 0;
			d[p + 1] = g > 255 ? 255 : g > 0 ? g : 0;
			d[p + 2] = b > 255 ? 255 : b > 0 ? b : 0;
			d[p + 3] = 255;
		}
		this.imgCtx.putImageData(this.pix, 0, 0);
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
		if (Settings.showSources) this.marks();
		this.zone();
		this.cursor();
	},

	// ring doubles as the hold gauge, so progress is read on the map instead of only in the panel
	zone() {
		const o = Objective;
		if (!o.area) return;
		const s = this.scale;
		const cx = (o.cx + 0.5) * s;
		const cy = (o.cy + 0.5) * s;
		const rr = (o.r + 0.5) * s;
		const ctx = this.ctx;
		ctx.beginPath();
		ctx.arc(cx, cy, rr, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(255,255,255,0.32)';
		ctx.lineWidth = 1;
		ctx.stroke();
		const ratio = o.holdRatio();
		if (!ratio) return;
		ctx.beginPath();
		ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
		ctx.strokeStyle = this.zoneColors[o.player];
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.lineWidth = 1;
	},

	marks() {
		const src = Field.src;
		const s = this.scale;
		for (let i = 0; i < Field.n; i++) {
			const m = src[i];
			if (!m) continue;
			this.ctx.fillStyle = this.markers[m];
			this.ctx.fillRect((i % Field.w) * s + (s >> 1) - 1, ((i / Field.w) | 0) * s + (s >> 1) - 1, 2, 2);
		}
	},

	cursor() {
		const i = this.hover;
		if (i < 0) return;
		const s = this.scale;
		const r = Settings.brush;
		const x = (i % Field.w) - r;
		const y = ((i / Field.w) | 0) - r;
		const span = (r * 2 + 1) * s;
		this.ctx.strokeStyle = '#fff';
		this.ctx.lineWidth = 1;
		this.ctx.strokeRect(x * s + 0.5, y * s + 0.5, span - 1, span - 1);
	},

	short(n) {
		return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);
	},

	dirLabel(p, dir) {
		const a = View.names[PAIR_A[p]], b = View.names[PAIR_B[p]];
		return dir ? b + '>' + a : a + '>' + b;
	},

	pairsText(mask, rates, directed) {
		let s = '';
		for (let p = 0; p < 3; p++) {
			if (!((mask & (1 << p)) && rates[p] > 0)) continue;
			const tag = directed ? View.dirLabel(p, Settings.reactDir[p]) : PAIR_NAMES[p];
			s += (s ? '/' : '') + tag;
		}
		return s || 'none';
	},

	pairStat(p) {
		const cells = Field.pairCells[p];
		const burn = Math.round(Field.pairBurn[p] / FP_ONE);
		const net = Math.round(Field.pairNet[p] / FP_ONE);
		const head = PAIR_NAMES[p] + ' ' + cells;
		if (!burn) return head;
		if (!net) return head + ' -' + View.short(burn);
		const win = net > 0 ? View.names[PAIR_A[p]] : View.names[PAIR_B[p]];
		return head + ' ' + win + '+' + View.short(Math.abs(net));
	},

	stats(node) {
		const live = Gas.liveMask(Settings);
		const rText = View.pairsText(Settings.reactMask & live, Settings.reactRate, Settings.reactMode === 3);
		const rMode = rText === 'none' ? '' : ' (' + REACT_MODES[Settings.reactMode] + ')';
		let s = 'fps ' + Loop.fps + '  mix ' + View.pairsText(live, Settings.mixRate, false) +
			' · react ' + rText + rMode + '\n';
		for (let p = 0; p < 3; p++) {
			const mass = Math.round(Field.total[p] / FP_ONE);
			const lim = Settings.maxMass > 0 ? '/' + (Settings.maxMass * 1000) : '';
			s += View.names[p] + ' cells ' + Field.owned[p] + '  growth ' + Field.srcCount[p] +
				'  cap ' + View.capText(p) + '  mass ' + mass + lim + '\n';
		}
		s += 'pairs  ' + View.pairStat(0) + ' · ' + View.pairStat(1) + ' · ' + View.pairStat(2) + '\n';
		s += 'frame ' + Loop.frame;
		node.textContent = s;
	},
};
