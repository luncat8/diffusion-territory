// owns: the 60 Hz animation loop and stats cadence
// edit for: sim rate or stats refresh interval

const Loop = {
	frame: 0,
	fps: 0,
	win: 0,
	last: 0,
	spent: 0,
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
