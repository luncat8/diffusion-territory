// owns: the 60 Hz animation loop, stats cadence, and objective HUD cadence
// edit for: sim rate, stats refresh interval, or HUD refresh interval

const Loop = {
	frame: 0,
	fps: 0,
	win: 0,
	last: 0,
	spent: 0,
	ui: 0,
	acc: 0,
	step: 1000 / 60,
	raf: 0,

	start() {
		Loop.last = performance.now();
		Loop.raf = requestAnimationFrame(Loop.tick);
	},

	// 60 sim steps per second whatever the display does, at most two per frame
	tick(now) {
		Loop.raf = requestAnimationFrame(Loop.tick);
		Loop.win++;
		const dt = now - Loop.last;
		Loop.last = now;
		Loop.spent += dt;
		Loop.ui += dt;
		if (Loop.ui >= 250) {
			Loop.ui = 0;
			HUD.refresh();
		}
		if (Loop.spent >= 500) {
			Loop.fps = Math.round(Loop.win * 1000 / Loop.spent);
			Loop.win = 0;
			Loop.spent = 0;
			View.stats($('stats'));
		}
		if (!Settings.paused) {
			Loop.acc += dt > 250 ? Loop.step : dt;
			let n = 0;
			while (Loop.acc >= Loop.step && n < 2) {
				Tick.run(Settings);
				Loop.acc -= Loop.step;
				n++;
			}
			Loop.frame += n;
		}
		View.draw();
	},
};
