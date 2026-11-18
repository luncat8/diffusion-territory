# diffusion territory

128×128 three-player (R, G, B) territory simulation driven by staggered-grid compressible gas dynamics.

Open `index.html` directly (`file://`) or serve the root folder:

	python3 -m http.server 8000

Checks: `npm run checks` (simulation, objective, solution and rivals), `npm run smoke` (`jsdom`), `npm run bench`, `npm run objective-bench` (scene measurement, minutes; `npm run objective-bench -- 600 rival-pressure` tests rival effects).
