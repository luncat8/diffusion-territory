// owns: per-frame physics phase ordering
// edit for: changing the order of transport, reaction, depletion, or source injection

const Tick = {
	run(s) {
		Field.analyze();
		Field.caps(s.capBase, s.capTerritory, s.maxMass);
		const n = Math.max(1, Math.min(2, s.substeps | 0));
		for (let i = 0; i < n; i++) Gas.step(s);
		React.run(s);
		Gas.deplete(s);
		Field.analyze();
		Field.caps(s.capBase, s.capTerritory, s.maxMass);
		Source.inject(s);
		Source.prepare(s);
		Field.analyze();
	},
};

if (typeof module !== 'undefined') module.exports = { Tick };
