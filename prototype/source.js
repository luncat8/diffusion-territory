// owns: source cells and the color they inject
// edit for: paint rules, inject rate, budget limits

const Source = {
	room: new Float64Array(3),

	paint(x, y, player, on) {
		const i = y * Field.w + x;
		const bit = 1 << player;
		Field.src[i] = on ? Field.src[i] | bit : Field.src[i] & ~bit;
	},

	// a source plus a small heap, so the map shows a gradient before mass builds up
	seed(x, y, player) {
		Source.paint(x, y, player, 1);
		for (let dy = -2; dy <= 2; dy++) {
			for (let dx = -2; dx <= 2; dx++) {
				const step = 3 - Math.max(Math.abs(dx), Math.abs(dy));
				if (step <= 0) continue;
				Field.v[((y + dy) * Field.w + (x + dx)) * 3 + player] = step * 60 * FP_ONE;
			}
		}
	},

	inject(s) {
		const rate = s.sourceRate * FP_ONE;
		if (!rate) return;
		const v = Field.v;
		const src = Field.src;
		const cap = Field.cap;
		const total = Field.total;
		const budget = Field.budget;
		const room = Source.room;
		room[0] = budget[0] - total[0];
		room[1] = budget[1] - total[1];
		room[2] = budget[2] - total[2];
		for (let i = 0, j = 0; i < Field.n; i++, j += 3) {
			const mask = src[i];
			if (!mask) continue;
			for (let p = 0; p < 3; p++) {
				if (!(mask & (1 << p))) continue;
				if (room[p] <= 0) continue;
				let add = rate;
				if (add > room[p]) add = room[p];
				const head = (cap[p] || CAP_MAX * FP_ONE) - v[j + p];
				if (head <= 0) continue;
				if (add > head) add = head;
				v[j + p] += add;
				room[p] -= add;
				total[p] += add;
			}
		}
	},
};

if (typeof module !== 'undefined') module.exports = { Source };
