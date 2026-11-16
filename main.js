// owns: boot, shared root refs, and button wiring
// edit for: load order, boot sequence, or initial player seeds

const $ = id => document.getElementById(id);

const Main = {
	init() {
		Field.init(128, 128);
		Gas.init(Field.w, Field.h);
		View.init($('canv'), $('tip'));
		Controls.build();
		Main.wire();
		Main.reset();
		Loop.start();
	},

	wire() {
		$('pause').addEventListener('click', Main.pause);
		$('step').addEventListener('click', Main.single);
		$('reset').addEventListener('click', Main.reset);
	},

	pause() {
		Settings.paused = Settings.paused ? 0 : 1;
		Controls.sync();
	},

	single() {
		Tick.run(Settings);
		Loop.frame++;
		View.draw();
		View.stats($('stats'));
	},

	reset() {
		Field.reset();
		Gas.reset();
		Loop.frame = 0;
		Source.seed(64, 64, 0);
		Source.seed(20, 100, 1);
		Source.seed(107, 20, 2);
		Field.analyze();
		Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
		View.draw();
		View.stats($('stats'));
		Controls.sync();
	},
};

Main.init();
