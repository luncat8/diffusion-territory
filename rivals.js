// owns: deterministic rival pressure sources for capture-and-hold tasks
// edit for: source rate, footprint, or rival placement

const RIVAL_SOURCE_RATE = 2;
const RIVAL_SOURCE_RADIUS = 4;
const RIVAL_SOURCE_CELLS = 49;
const RIVAL_TAU = Math.PI * 2;
const RIVAL_HOME_ANGLES = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];

const Rivals = {
	players: new Int8Array(2),
	sites: new Int32Array(2 * RIVAL_SOURCE_CELLS),
	owner: -1,
	ready: false,

	init(s) {
		this.ready = true;
		this.reset(s);
	},

	reset(s) {
		this.owner = s.paint;
		this.sites.fill(-1);
		const home = RIVAL_HOME_ANGLES[s.paint];
		const radius = Math.max(RIVAL_SOURCE_RADIUS + 1, Objective.r - RIVAL_SOURCE_RADIUS - 1);
		for (let slot = 0; slot < 2; slot++) {
			const p = (s.paint + slot + 1) % 3;
			this.players[slot] = p;
			let delta = RIVAL_HOME_ANGLES[p] - home;
			if (delta > Math.PI) delta -= RIVAL_TAU;
			if (delta < -Math.PI) delta += RIVAL_TAU;
			const angle = home + delta * 0.5;
			const cx = Objective.cx + Math.round(Math.cos(angle) * radius);
			const cy = Objective.cy + Math.round(Math.sin(angle) * radius);
			let at = slot * RIVAL_SOURCE_CELLS;
			for (let dy = -RIVAL_SOURCE_RADIUS; dy <= RIVAL_SOURCE_RADIUS; dy++) {
				for (let dx = -RIVAL_SOURCE_RADIUS; dx <= RIVAL_SOURCE_RADIUS; dx++) {
					if (dx * dx + dy * dy > RIVAL_SOURCE_RADIUS * RIVAL_SOURCE_RADIUS) continue;
					const x = cx + dx, y = cy + dy;
					this.sites[at++] = x < 0 || y < 0 || x >= Field.w || y >= Field.h ? -1 : y * Field.w + x;
				}
			}
		}
	},

	step(s) {
		if (!this.ready || !s.rivalPressure || Objective.state === HOLD_DONE) return;
		if (this.owner !== s.paint) this.reset(s);
		const sites = this.sites;
		const rate = RIVAL_SOURCE_RATE * FP_ONE;
		for (let slot = 0; slot < 2; slot++) {
			const p = this.players[slot];
			const ch = Field.ch[p];
			const cap = Field.cap[p] || CAP_DEF * FP_ONE;
			const start = slot * RIVAL_SOURCE_CELLS;
			for (let k = 0; k < RIVAL_SOURCE_CELLS; k++) {
				const i = sites[start + k];
				if (i < 0) continue;
				const head = cap - ch[i];
				if (head > 0) ch[i] += Math.min(head, rate);
			}
		}
	},
};

if (typeof module !== 'undefined') {
	module.exports = { Rivals, RIVAL_SOURCE_RATE, RIVAL_SOURCE_RADIUS, RIVAL_SOURCE_CELLS };
}
