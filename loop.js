// owns: fixed-step simulation pacing, stats cadence, and objective HUD cadence
// edit for: sim rate, stats refresh interval, or HUD refresh interval

const MAX_TICKS_PER_FRAME = 2;

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

	reset() {
		Loop.frame = 0;
		Loop.acc = 0;
	},

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
			// Scale how often ticks run, not the physics step; don't bank work after a stall.
			const ms = dt > 250 ? Loop.step : dt;
			Loop.acc += Math.min(ms * Settings.simSpeed, MAX_TICKS_PER_FRAME * Loop.step);
			let n = 0;
			while (Loop.acc >= Loop.step && n < MAX_TICKS_PER_FRAME) {
				Tick.run(Settings);
				Loop.acc -= Loop.step;
				n++;
			}
			Loop.frame += n;
		}
		View.draw();
	},
};
