// owns: the per-frame kernel sequence
// edit for: step order

const Tick = {
	run(s) {
		Field.analyze();
		Field.caps(s.capBase, s.capTerritory);
		Source.inject(s);
		// shift before flux: the walk then relaxes a randomised field instead of
		// re-enforcing the same lattice pattern every frame
		for (let i = 0; i < s.substeps; i++) {
			Diffuse.brownian(s);
			Diffuse.diffusion(s);
		}
		Diffuse.react(s);
		Diffuse.deplete(s);
		Pressure.equalize(s);
	},
};

if (typeof module !== 'undefined') module.exports = { Tick };
