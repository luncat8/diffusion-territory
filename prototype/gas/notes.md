# equalisation: local walk vs gas pressure

Field 128×128, one color, a 1-cell-wide line at 255 in the middle, everything else empty.
Target: max deviation from the mean below 5 %. Raw numbers: `logs/equalize-128.log`
(`node bench.js > logs/equalize-128.log` regenerates them).

| scheme | frames to 5 % | ms/frame | mass drift |
| --- | --- | --- | --- |
| diffusion k=0.25 | never within 40 000 (43.8 % left) | 0.49 | 0 ppm |
| diffusion k=0.25, 2 steps/frame | never within 20 000 (same 43.8 %) | 0.98 | 0 ppm |
| Brownian 100 % + diffusion | 5 171 | 0.88 | 0 ppm |
| Brownian 100 % alone | never (the line is relocated, never split) | 0.23 | 0 ppm |
| pressure 2 % | 34 | 0.62 | 0 ppm |
| pressure 5 % | 14 | 0.74 | 0 ppm |
| pressure 25 % | 3 | 1.28 | 0 ppm |
| pressure 100 % | 2 | 2.10 | 0 ppm |

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

Pressure is a masked multigrid V-cycle, one hierarchy per color. The smoother is a damped
gradient step on edge flows in the size-weighted metric (each sweep keeps total mass of its
component exactly). Coarsening groups 2x2 blocks and splits a block into components along its
internal edges, so a wall running through a block never merges the two sides into one coarse
node, and diagonal-touching cells never merge either. Mass survives coarsening because
restriction is a size-weighted average and prolongation extends the coarse flattening delta.
The 4x4-block artifact of the old mean pyramid is gone: gradient ratios at block boundaries sit
at ~1.0 on a random smoothed blob (pyramid showed 5–50). Cost is a fraction of a frame: the
slider is a compute budget — 100 buys ~a full flatten per frame, weak settings queue fractional
cycles and run at ~0.1–0.3 ms.

Two consequences are deliberate, one changed:

- pressure is wall-exact now. Foreign-dominated cells exclude themselves from the channel's mask,
  edges never cross walls at any level, and mass cannot equalise across a barrier. Diffusion is no
  longer required for the wall rule (both are wall-exact).
- pressure ignores the per-cell ceiling: it redistributes existing mass, it never creates any, and
  the ceiling still gates injection.

Design notes, measured before the switch:

- residual restriction (solve A e = r on the coarse grid) stalls on this homogeneous Laplace
  problem: the coarse correction operator is ~sz x stiffer per level and the V-cycle
  contraction sat at ~0.93 per cycle, never flattening the line. The shipped variant flattens the
  coarse representation itself (value restriction) and adds the coarse delta uniformly; the same
  masks, edges, sweeps and aggregation apply. Convergence: dev 12700 % -> 2.5 % in 4 cycles.
- strength semantic changed from a per-level mean blend to a cycle budget: the slider queues
  V-cycles per frame, 100 = 6 cycles/frame, weak settings accumulate fractionally so a quiet
  field costs less than 0.5 ms. The pyramid moved more mass per unit slider but crossed walls;
  the V-cycle is wall-exact and block-free, and lands the 5 % target 3–5x sooner (see log).
- hierarchies rebuild only when a channel's mask changes (byte compare per cell); a quiet field
  pays nothing. A 128x128 all-color build costs ~40 ms once per channel; in-game dominance flips
  rebuild only the affected channel.
