# equalisation: local walk vs gas pressure

Field 128×128, one color, a 1-cell-wide line at 255 in the middle, everything else empty.
Target: max deviation from the mean below 5 %. Raw numbers: `logs/equalize-128.log`
(`node bench.js` regenerates them).

| scheme | frames to 5 % | ms/frame | mass drift |
| --- | --- | --- | --- |
| diffusion k=0.25 | never within 40 000 (43.8 % left) | 0.47 | 0 ppm |
| diffusion k=0.25, 2 steps/frame | never within 20 000 (same 43.8 %) | 0.86 | 0 ppm |
| Brownian 100 % + diffusion | 5 171 | 0.76 | 0 ppm |
| Brownian 100 % alone | never (the line is relocated, never split) | 0.20 | 0 ppm |
| pressure 2 % | 161 | 1.37 | 0 ppm |
| pressure 5 % | 62 | 1.26 | 0 ppm |
| pressure 25 % | 11 | 1.32 | 0 ppm |
| pressure 100 % | 1 | 1.74 | 0 ppm |

## why the walk is that slow

Diffusion moves mass one cell per step, so a disturbance spreads like √t: crossing 128 cells
needs on the order of 128² steps. The slowest mode of the 4-neighbour update decays by
`1 - 4k·sin²(π/N)` per step; at `k = 0.25` and `N = 128` that is `0.99985`, an e-folding time of
about 6 600 frames. A whole-line flattening therefore runs for tens of thousands of frames, and
the deviation is still 43.8 % after 40 000. This is not an implementation defect: it is the cost of
a local, explicit scheme. Sub-steps only move along the same curve (2 steps = twice the work for
twice the progress).

That is also why "the pressure never becomes equal": with depletion off and one source, the
field's total is small compared to `cells × 255`, so most of the map is nearly black, and the
part that is lit stays a rounded blob around the source. Fill time is mass-bound
(`cells × 255 / sourceRate` frames), not diffusion-bound.

## why pressure is different

The mean pyramid answers "what is the average of this whole region" directly. A cell is moved
toward the mean of its group at every scale, finest to coarsest, so the coarsest level removes the
mode that a walk needs 6 600 frames for. Cost is one pass per level over the field: about 1.3 ms
for seven levels, which is why the pass is optional and off by default.

Two consequences are deliberate:

- pressure is non-local. The pyramid links every cell of a color with the rest of that color, so
  mass can equalise across a barrier of another color (a gas has no walls). Diffusion keeps walls
  exact; use diffusion when the wall rule matters.
- pressure ignores the per-cell ceiling: it redistributes existing mass, it never creates any, and
  the ceiling still gates injection.

## if faster *and* wall-exact is needed

A masked multigrid V-cycle would give the same O(N) convergence while honouring walls: restrict
the residual instead of the value, restrict only along allowed edges, prolong with the same masks,
two smoothing sweeps per level. Cost stays one to two field passes per cycle. This is the next step
if pressure has to follow the territory rule exactly.
