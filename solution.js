// owns: suggested settings for the capture-and-hold objective, their explanation, and the revert
// edit for: suggestion targets, when a rule fires, or explanation wording

const SOLUTION_PROD = 16;
const SOLUTION_MIX = 55;
const SOLUTION_REACT = 12;
const SOLUTION_BRUSH = 2;
const SOLUTION_MODE = 3;

const Solution = {
	last: null,

	// every key here must have a widget in the objective focus block; solution-checks asserts the coverage
	keys: ['sourceRate', 'sourceMode', 'mixRate', 'reactRate', 'reactDir', 'reactMode', 'reactExponent', 'brush'],

	clear() {
		this.last = null;
	},

	active() {
		return !!this.last;
	},

	pairs(player) {
		return [PAIR_INDEX[player][(player + 1) % 3], PAIR_INDEX[player][(player + 2) % 3]];
	},

	// absorb direction 0 makes PAIR_A eat PAIR_B, so point every own pair at the rival
	dirFor(p, player) {
		return player === PAIR_A[p] ? 0 : 1;
	},

	read(s, key, index) {
		return index < 0 ? s[key] : s[key][index];
	},

	write(s, key, index, value) {
		if (index < 0) s[key] = value;
		else s[key][index] = value;
	},

	// growth feeds the cells that already hold the paint, absorb flips the cells both colours share
	suggest(s, o) {
		const player = o.player < 0 ? s.paint : o.player;
		const plan = { player, headline: '', notes: [], edits: [] };
		if (o.state === HOLD_DONE) {
			plan.headline = 'objective held';
			plan.notes.push('the ring is held at the target; no setting has to change');
			return plan;
		}
		Solution.add(plan, s, 'sourceRate', -1, Math.max(s.sourceRate, SOLUTION_PROD));
		Solution.add(plan, s, 'sourceMode', -1, 1);
		for (const p of Solution.pairs(player)) {
			Solution.addPair(plan, s, 'mixRate', p, Math.max(s.mixRate[p], SOLUTION_MIX), 'mixMask');
			Solution.addPair(plan, s, 'reactRate', p, Math.max(s.reactRate[p], SOLUTION_REACT), 'reactMask');
			Solution.add(plan, s, 'reactDir', p, Solution.dirFor(p, player));
		}
		Solution.add(plan, s, 'reactMode', -1, SOLUTION_MODE);
		Solution.add(plan, s, 'reactExponent', -1, 1);
		if (o.mass[player] < o.area * FP_ONE) Solution.add(plan, s, 'brush', -1, Math.max(s.brush, SOLUTION_BRUSH));
		Solution.explain(plan, o, player);
		return plan;
	},

	add(plan, s, key, index, to) {
		const from = Solution.read(s, key, index);
		if (from === to) return;
		plan.edits.push({ key, index, from, to });
	},

	// a pair rate is inert while its mask bit is off, so disabling a pair is an edit even at the target rate
	addPair(plan, s, key, index, to, mask) {
		const from = Solution.read(s, key, index);
		const enabled = !!(s[mask] & (1 << index));
		if (from === to && enabled) return;
		plan.edits.push({ key, index, from, to, enable: !enabled });
	},

	explain(plan, o, player) {
		if (!plan.edits.length) {
			plan.headline = 'suggested setup already in place';
			plan.notes.push('growth and one-way absorb are set; the ring is yours to paint');
			return;
		}
		plan.headline = o.control ? 'keep the ring' : 'take the ring';
		plan.notes.push('absorb: your colour takes the rival share of every cell you both occupy, never the reverse');
		plan.notes.push('mixing opens both rival pairs so the reaction reaches cells beyond the front');
		plan.notes.push('production on the low-pigment rule refills every cell that holds 5% of your colour');
		if (plan.edits.some(e => e.enable)) plan.notes.push('rival pair switches are on, so their rates can reach the ring');
		if (o.mass[player] < o.area * FP_ONE) plan.notes.push('paint inside the ring first: growth and absorb need your pigment there');
	},

	apply(s, o) {
		const plan = Solution.suggest(s, o);
		if (!plan.edits.length && !Solution.last) return plan;
		if (!Solution.last) {
			Solution.last = { player: -1, values: [], mixMask: s.mixMask, reactMask: s.reactMask };
		}
		for (const e of plan.edits) {
			if (!Solution.tracks(e)) Solution.last.values.push({ key: e.key, index: e.index, value: e.from });
			Solution.write(s, e.key, e.index, e.to);
			if (e.key === 'mixRate') s.mixMask |= 1 << e.index;
			if (e.key === 'reactRate') s.reactMask |= 1 << e.index;
		}
		Solution.last.player = plan.player;
		return plan;
	},

	tracks(e) {
		for (const v of Solution.last.values) {
			if (v.key === e.key && v.index === e.index) return true;
		}
		return false;
	},

	revert(s) {
		const last = Solution.last;
		if (!last) return null;
		const plan = { player: last.player, headline: 'reverted', notes: ['every setting the suggestion changed is back where it was'], edits: [] };
		for (const v of last.values) {
			const from = Solution.read(s, v.key, v.index);
			Solution.write(s, v.key, v.index, v.value);
			if (from !== v.value) plan.edits.push({ key: v.key, index: v.index, from, to: v.value });
		}
		s.mixMask = last.mixMask;
		s.reactMask = last.reactMask;
		Solution.last = null;
		return plan;
	},
};

if (typeof module !== 'undefined') {
	module.exports = { Solution, SOLUTION_PROD, SOLUTION_MIX, SOLUTION_REACT, SOLUTION_BRUSH, SOLUTION_MODE };
}
