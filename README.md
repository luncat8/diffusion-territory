# diffusion territory

Prototype: 128×128 cells, three players (R, G, B), diffusion + Brownian exchange per color.

Open `index.html` in a browser (works from `file://`) or serve the folder:

	python3 -m http.server 8000

Panel: click a player, then click or drag on the map to place sources; right-click erases.
Hover the map for per-channel values with fractions. `pause` / `step` / `reset`.

Checks: `node experiments/checks.js`, `node experiments/dom-smoke.js` (needs `npm i jsdom`).
