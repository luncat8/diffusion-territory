// owns: source cell placement, seeding, and budget-capped injection
// edit for: brush shapes, initial layout, or injection formula

const Source = {
	paint(x, y, player, on, radius = 0) {
		const mask = 1 << player;
		const r = radius | 0;
		for (let dy = -r; dy <= r; dy++) {
			const ny = y + dy;
			if (ny < 0 || ny >= Field.h) continue;
			for (let dx = -r; dx <= r; dx++) {
				if (r > 0 && dx * dx + dy * dy > r * r) continue;
				const nx = x + dx;
				if (nx < 0 || nx >= Field.w) continue;
				const i = ny * Field.w + nx;
				Field.src[i] = on ? mask : 0;
			}
		}
	},

	seed(x, y, player) {
		this.paint(x, y, player, 1, 1);
		const ch = Field.ch[player];
		for (let dy = -2; dy <= 2; dy++) {
			const ny = y + dy;
			if (ny < 0 || ny >= Field.h) continue;
			for (let dx = -2; dx <= 2; dx++) {
				const nx = x + dx;
				if (nx < 0 || nx >= Field.w) continue;
				const dist = Math.abs(dx) + Math.abs(dy);
				const amt = dist <= 1 ? 255 : (dist <= 2 ? 160 : 80);
				ch[ny * Field.w + nx] = amt * FP_ONE;
			}
		}
	},

	inject(s) {
		const rate = Math.round(s.sourceRate * FP_ONE);
		if (rate <= 0) return;
		const src = Field.src;
		const ch = Field.ch;
		const cap = Field.cap;
		const budget = Field.budget;
		const total = Field.total;
		const defCeil = CAP_DEF * FP_ONE;
		for (let i = 0; i < Field.n; i++) {
			const m = src[i];
			if (!m) continue;
			for (let p = 0; p < 3; p++) {
				if (!(m & (1 << p))) continue;
				const room = budget[p] - total[p];
				if (room <= 0) continue;
				const ceil = cap[p] || defCeil;
				const head = ceil - ch[p][i];
				if (head <= 0) continue;
				let add = rate < room ? rate : room;
				if (head < add) add = head;
				ch[p][i] += add;
				total[p] += add;
			}
		}
	},
};

if (typeof module !== 'undefined') module.exports = { Source };
