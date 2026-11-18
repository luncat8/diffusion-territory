// owns: capture-and-hold objective — zone sampling, hold timer, attempt history
// edit for: zone shape/radius, control threshold, hold decay, or goal rules

const ZONE_R = 24;
const NEED_PCT = 55;
const HOLD_DECAY = 2;
const TREND_FRAMES = 30;
const HOLD_CAPTURE = 0;
const HOLD_ACTIVE = 1;
const HOLD_DONE = 2;

const Objective = {
	w: 0,
	h: 0,
	n: 0,
	cx: 0,
	cy: 0,
	r: 0,
	area: 0,
	needCount: 1,
	idx: null,
	player: -1,
	target: 1,
	hold: 0,
	best: 0,
	score: 0,
	rate: 0,
	elapsed: 0,
	heldAt: 0,
	control: 0,
	captures: 0,
	losses: 0,
	flips: 0,
	state: HOLD_CAPTURE,
	leader: -1,
	leaderPrev: -1,
	counts: [0, 0, 0],
	share: [0, 0, 0],
	trend: [0, 0, 0],
	prev: [0, 0, 0],
	peak: [0, 0, 0],
	mass: [0, 0, 0],
	neutral: 0,
	elapsedSince: 0,
	controlFrames: 0,

	init(w, h, radius = ZONE_R) {
		this.w = w;
		this.h = h;
		this.n = w * h;
		this.cx = w >> 1;
		this.cy = h >> 1;
		this.r = radius;
		const cells = new Int32Array(this.n);
		let area = 0;
		for (let y = 0; y < h; y++) {
			const dy = y - this.cy;
			for (let x = 0; x < w; x++) {
				const dx = x - this.cx;
				if (dx * dx + dy * dy <= radius * radius) cells[area++] = y * w + x;
			}
		}
		this.idx = cells.subarray(0, area);
		this.area = area;
		this.needCount = Math.ceil(area * NEED_PCT / 100);
	},

	reset(s) {
		this.player = s.paint | 0;
		this.target = Math.max(1, Math.round(s.holdTarget * 60));
		this.hold = 0;
		this.best = 0;
		this.score = 0;
		this.rate = 0;
		this.elapsed = 0;
		this.heldAt = 0;
		this.control = 0;
		this.captures = 0;
		this.losses = 0;
		this.flips = 0;
		this.state = HOLD_CAPTURE;
		this.leader = -1;
		this.leaderPrev = -1;
		this.elapsedSince = 0;
		this.controlFrames = 0;
		for (let p = 0; p < 3; p++) {
			this.counts[p] = 0;
			this.share[p] = 0;
			this.trend[p] = 0;
			this.prev[p] = 0;
			this.peak[p] = 0;
			this.mass[p] = 0;
		}
		this.neutral = 0;
		if (this.area) {
			this.read();
			for (let p = 0; p < 3; p++) this.prev[p] = this.share[p];
		}
	},

	// dominance already computed by Field.analyze, so a zone sample is one pass over a cached index list
	read() {
		const dom = Field.dom;
		const idx = this.idx;
		const counts = this.counts;
		const mass = this.mass;
		const ch = Field.ch;
		let c0 = 0, c1 = 0, c2 = 0;
		let m0 = 0, m1 = 0, m2 = 0;
		this.leader = -1;
		for (let k = 0; k < this.area; k++) {
			const i = idx[k];
			const d = dom[i];
			if (d === 0) c0++;
			else if (d === 1) c1++;
			else if (d === 2) c2++;
			m0 += ch[0][i];
			m1 += ch[1][i];
			m2 += ch[2][i];
		}
		counts[0] = c0; counts[1] = c1; counts[2] = c2;
		mass[0] = m0; mass[1] = m1; mass[2] = m2;
		this.neutral = this.area - c0 - c1 - c2;
		const scale = 100 / this.area;
		for (let p = 0; p < 3; p++) {
			this.share[p] = counts[p] * scale;
			if (this.share[p] > this.peak[p]) this.peak[p] = this.share[p];
			if (this.counts[p] >= this.needCount) this.leader = p;
		}
	},

	// shares stay in percent so the HUD and the zone bars can print them without extra division
	step(s) {
		if (!this.area) return;
		if (s.paint !== this.player) this.reset(s);
		const target = Math.max(1, Math.round(s.holdTarget * 60));
		if (target !== this.target) this.target = target;
		this.read();
		const was = this.control;
		this.control = this.counts[this.player] >= this.needCount ? 1 : 0;
		if (this.control && !was) this.captures++;
		if (!this.control && was) this.losses++;
		if (this.leader !== -1 && this.leaderPrev !== -1 && this.leader !== this.leaderPrev) this.flips++;
		this.leaderPrev = this.leader;
		if (this.state !== HOLD_DONE) this.advance();
		if (this.hold > this.best) this.best = this.hold;
		if (this.control) this.controlFrames++;
		this.trendStep();
		this.elapsed++;
	},

	// hold fills at share/need per frame and drains on the deficit, so partial share still moves the bar
	advance() {
		const rate = this.share[this.player] / NEED_PCT;
		this.rate = rate;
		this.score += rate;
		this.hold += rate >= 1 ? rate : rate - HOLD_DECAY * (1 - rate);
		if (this.hold < 0) this.hold = 0;
		if (this.hold >= this.target) {
			this.hold = this.target;
			this.heldAt = this.elapsed;
			this.state = HOLD_DONE;
			return;
		}
		this.state = this.hold > 0 ? HOLD_ACTIVE : HOLD_CAPTURE;
	},

	trendStep() {
		this.elapsedSince++;
		if (this.elapsedSince < TREND_FRAMES) return;
		const rate = 60 / this.elapsedSince;
		for (let p = 0; p < 3; p++) {
			this.trend[p] = (this.share[p] - this.prev[p]) * rate;
			this.prev[p] = this.share[p];
		}
		this.elapsedSince = 0;
	},

	holdRatio() {
		return this.target ? this.hold / this.target : 0;
	},
};

if (typeof module !== 'undefined') {
	module.exports = { Objective, ZONE_R, NEED_PCT, HOLD_CAPTURE, HOLD_ACTIVE, HOLD_DONE };
}
