// owns: source cell placement, seeding, and shared-supply / budget-capped injection
// edit for: brush shapes, initial layout, or player supply apportionment

const Source = {
	want: [0, 0, 0],
	room: [0, 0, 0],

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
				Field.src[ny * Field.w + nx] = on ? mask : 0;
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

	// running rational apportionment splits limited flow or mass evenly across all player sources with zero rounding loss
	inject(s) {
		const rate = Math.round(s.sourceRate * FP_ONE);
		if (rate <= 0) return;
		const src = Field.src, ch = Field.ch, cap = Field.cap, total = Field.total;
		const want = this.want, room = this.room;
		const defCeil = CAP_DEF * FP_ONE;
		const flow = s.playerFlow > 0 ? Math.round(s.playerFlow * FP_ONE) : Infinity;
		want[0] = want[1] = want[2] = 0;
		for (let i = 0; i < Field.n; i++) {
			const m = src[i];
			if (!m) continue;
			for (let p = 0; p < 3; p++) {
				if (!(m & (1 << p))) continue;
				const head = (cap[p] || defCeil) - ch[p][i];
				if (head > 0) want[p] += rate < head ? rate : head;
			}
		}
		for (let p = 0; p < 3; p++) {
			let lim = Field.budget[p] - total[p];
			if (flow < lim) lim = flow;
			if (lim < 0) lim = 0;
			room[p] = want[p] < lim ? want[p] : lim;
		}
		if (!(room[0] || room[1] || room[2])) return;
		for (let i = 0; i < Field.n; i++) {
			const m = src[i];
			if (!m) continue;
			for (let p = 0; p < 3; p++) {
				if (!(m & (1 << p)) || !room[p]) continue;
				const head = (cap[p] || defCeil) - ch[p][i];
				if (head <= 0) continue;
				const w = rate < head ? rate : head;
				const add = room[p] >= want[p] ? w : (want[p] === w ? room[p] : (w * (room[p] / want[p])) | 0);
				room[p] -= add;
				want[p] -= w;
				ch[p][i] += add;
				total[p] += add;
			}
		}
	},
};

if (typeof module !== 'undefined') module.exports = { Source };
