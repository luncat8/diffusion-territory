// owns: boot, shared root refs, wiring
// edit for: load order, boot sequence, buttons

const $ = id => document.getElementById(id);

const Main = {
	init() {
		Field.init(128, 128);
		Pressure.init(Field.w, Field.h);
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
		View.draw();
		View.stats($('stats'));
	},

	reset() {
		Field.reset();
		Source.seed(64, 64, 0);
		Source.seed(20, 100, 1);
		Source.seed(107, 20, 2);
		Field.analyze();
		Field.caps(Settings.capBase, Settings.capTerritory);
		View.draw();
		Controls.sync();
	},

};

Main.init();
