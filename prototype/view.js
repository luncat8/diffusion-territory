// owns: canvas painting, cursor readout, source marks
// edit for: color mapping, tooltip fields, canvas interactions

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
		View.read(i, e);
	},

	press(e) {
		const i = View.at(e);
		if (i < 0) return;
		View.paintCell(i, Settings.paint, e.button !== 2);
		View.read(i, e);
	},

	paintCell(i, player, on) {
		Source.paint(i % Field.w, (i / Field.w) | 0, player, on);
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
		View.text =
			x + ',' + y + '  ' + (c[6] ? 'src ' + View.maskName(c[6]) : 'no src') + '  ' + View.state(c) +
			'\nR ' + View.fixed(c[0], c[3]) + '  G ' + View.fixed(c[1], c[4]) + '  B ' + View.fixed(c[2], c[5]) +
			'\ncap R ' + View.capText(0) + ' G ' + View.capText(1) + ' B ' + View.capText(2);
		View.tip.textContent = View.text;
		View.tip.hidden = false;
		const r = View.canvas.getBoundingClientRect();
		View.tip.style.transform = 'translate(' + (e.clientX - r.left + 14) + 'px,' + (e.clientY - r.top + 14) + 'px)';
	},

	state(c) {
		if (c[7] !== NO_COLOR) return View.names[c[7]];
		return c[0] > 0 || c[1] > 0 || c[2] > 0 ? 'mixed' : 'empty';
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
		const v = Field.v;
		const d = this.pix.data;
		for (let i = 0, j = 0, p = 0; i < Field.n; i++, j += 3, p += 4) {
			let r = v[j] >> FP;
			let g = v[j + 1] >> FP;
			let b = v[j + 2] >> FP;
			d[p] = r > 255 ? 255 : r > 0 ? r : 0;
			d[p + 1] = g > 255 ? 255 : g > 0 ? g : 0;
			d[p + 2] = b > 255 ? 255 : b > 0 ? b : 0;
			d[p + 3] = 255;
		}
		this.imgCtx.putImageData(this.pix, 0, 0);
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
		this.marks();
		this.cursor();
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
		this.ctx.strokeStyle = '#fff';
		this.ctx.lineWidth = 1;
		this.ctx.strokeRect((i % Field.w) * s + 0.5, ((i / Field.w) | 0) * s + 0.5, s - 1, s - 1);
	},

	stats(node) {
		let s = 'fps ' + Loop.fps + '\n';
		for (let p = 0; p < 3; p++) {
			s += View.names[p] + ' cells ' + Field.owned[p] +
				'  cap ' + (Field.cap[p] ? (Field.cap[p] >> FP) : 'off') +
				'  mass ' + Math.round(Field.total[p] / FP_ONE) + '\n';
		}
		s += 'frame ' + Loop.frame;
		node.textContent = s;
	},
};
