// owns: boot, shared root refs, and button wiring
// edit for: load order, boot sequence, or initial player seeds

const $ = id => document.getElementById(id);

const Main = {
	init() {
		Field.init(128, 128);
		Gas.init(Field.w, Field.h);
		View.init($('canv'), $('tip'));
		UrlSettings.load();
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
		UrlSettings.save();
	},

	single() {
		Tick.run(Settings);
		Loop.frame++;
		View.draw();
		View.stats($('stats'));
	},

	loadScene(index) {
		Presets.apply(Settings, index);
		Main.reset();
		UrlSettings.save();
	},

	reset() {
		Field.reset();
		Gas.reset();
		Loop.frame = 0;
		Presets.seed(Settings.scene);
		Field.analyze();
		Field.caps(Settings.capBase, Settings.capTerritory, Settings.maxMass);
		Source.prepare(Settings);
		Field.analyze();
		View.draw();
		View.stats($('stats'));
		Controls.sync();
	},
};

Main.init();
