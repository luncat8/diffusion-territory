# diffusion territory

128×128 three-player (R, G, B) territory simulation driven by staggered-grid compressible gas dynamics.

Open `index.html` directly (works from `file://`) or serve the root folder:

	python3 -m http.server 8000

Panel: select R/G/B and paint or right-click erase sources; tune speed, viscosity, depletion, mixability, reaction, and caps.
Checks: `node experiments/checks.js`, `node experiments/dom-smoke.js` (requires `jsdom`), `node experiments/gas-bench.js`.
Previous explicit-diffusion + Brownian prototype is preserved in `prototype/`.
