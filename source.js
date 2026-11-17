// owns: pigment painting, local production eligibility, and budget-capped growth
// edit for: brush shapes, source laws, or player supply apportionment

const Source = {
	want: [0, 0, 0],
	room: [0, 0, 0],
	generation: -1,
	weights: null,
	carry: null,

	paint(x, y, player, on, radius = 0) {
		const r = radius | 0;
		for (let dy = -r; dy <= r; dy++) {
			const ny = y + dy;
			if (ny < 0 || ny >= Field.h) continue;
			for (let dx = -r; dx <= r; dx++) {
				if (r > 0 && dx * dx + dy * dy > r * r) continue;
				const nx = x + dx;
				if (nx < 0 || nx >= Field.w) continue;
				const i = ny * Field.w + nx;
				Field.ch[player][i] = on ? CAP_DEF * FP_ONE : 0;
			}
		}
	},

	seed(x, y, player) {
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

	prepare(s) {
		if (this.generation !== Field.generation) {
			this.weights = new Float64Array(Field.n * 3);
			this.carry = new Float64Array(Field.n * 3);
			this.generation = Field.generation;
		}
		if (s.sourceRate <= 0) {
			Field.src.fill(0);
			this.carry.fill(0);
			return;
		}
		const ch = Field.ch, ref = CAP_DEF * FP_ONE;
		for (let i = 0; i < Field.n; i++) {
			const sum = ch[0][i] + ch[1][i] + ch[2][i];
			let mask = 0;
			for (let p = 0; p < 3; p++) {
				const value = ch[p][i], at = p * Field.n + i;
				const ceiling = Field.cap[p] || ref;
				let fertility = s.sourceMode === 0 ? 1 : Math.max(0, 1 - sum / (3 * ref));
				if (value < CONTROL_MIN || value >= ceiling ||
					(s.sourceMode === 0 && value <= (sum - value) * s.sourceDominance) ||
					(s.sourceMode === 2 && sum >= s.sourceThreshold * ref)) fertility = 0;
				this.weights[at] = s.sourceRate * FP_ONE * fertility * Math.max(0, 1 - value / ceiling);
				if (this.weights[at] > 0) mask |= 1 << p;
				else this.carry[at] = 0;
			}
			Field.src[i] = mask;
		}
	},

	// Snapshot demands before growth so one pigment cannot alter another's eligibility mid-tick.
	inject(s) {
		this.prepare(s);
		if (s.sourceRate <= 0) return;
		const ch = Field.ch, cap = Field.cap, total = Field.total;
		const want = this.want, room = this.room, weights = this.weights, carry = this.carry;
		const defCeil = CAP_DEF * FP_ONE;
		const flow = s.playerFlow > 0 ? Math.round(s.playerFlow * FP_ONE) : Infinity;
		want[0] = want[1] = want[2] = 0;
		for (let p = 0; p < 3; p++) {
			for (let i = 0; i < Field.n; i++) {
				const at = p * Field.n + i;
				const demand = weights[at] + carry[at];
				const w = Math.min(Math.floor(demand), Math.max(0, (cap[p] || defCeil) - ch[p][i]));
				carry[at] = demand - Math.floor(demand);
				weights[at] = w;
				want[p] += w;
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
			for (let p = 0; p < 3; p++) {
				if (!room[p]) continue;
				const head = (cap[p] || defCeil) - ch[p][i];
				if (head <= 0) continue;
				const w = weights[p * Field.n + i];
				if (!w) continue;
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
