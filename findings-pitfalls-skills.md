# findings — notes and pitfalls for agents

## quantised flux makes a fixed point (the "stable gradient" bug)

Averaging with integer / quantised flux always has edges whose flux rounds to zero. If `f = 0`
for `|d|` above zero and the field has no other reason to change, the field is a fixed point:
it stops one step short of flat and looks like a frozen gradient.
Measured on a 1×128 line, plain 8-bit `f = (d*k)>>8`: frozen from frame 1000 to 100000,
`dev = 100.78 %`, half the line at exactly 0, mass 255 unchanged (`experiments/int-stall.js`).

Two independent fixes, apply both:

- enough fractional bits that the residual is invisible (Q12.12 here, 1/4096 of a display unit);
- if the rounded flux is zero but the difference is not, move one quantum towards the low side.
  A quantum at that scale is invisible, and it removes the fixed point completely.

Also: `f = (d*k + FP/2) >> FP` rounds half up, so positive and negative differences do not round
symmetrically; it cannot destroy mass (the same `f` is applied to both ends) but it does bias the
shape. Fix by the ±1 rule above, not by extra precision alone.

## clamping a negative to zero adds mass

Fixed-point flux can leave a cell a few quanta below zero. `if (v < 0) v = 0` silently *adds*
those quanta to the field: measured +260 units on a 32×32 field within 200 frames, which then
looks like the sim "creating color". Keep the debt in place when it is smaller than one display
unit and hand anything deeper to the richest neighbour (`Field.settle`). Then mass drift is
0.0 ppm over 40 000 frames.

## Math.round / Math.floor in a hot loop is 20× slower than `| 0`

Same loop, 49k iterations over typed arrays, V8: `Math.floor(want)` 5.4 ms, `Math.round(want)`
8.3 ms, `want | 0` 0.51 ms. Converting a double result into an `Int32Array` element after
`Math.floor` appears to defeat the fast path. In a per-frame kernel use `| 0` and carry the
fraction in a separate `Float64Array` accumulator.

## Brownian: parity pairing beats a second buffer

A random swap pass needs each cell to take part at most once, otherwise a cell can travel far in
one pass. Iterating only cells with `(x+y)` even and swapping with a random 4-neighbour makes the
pass a permutation in place: no copy, no aliasing hazard, mass exact, at most one cell of travel.
Relevant when a second buffer would need a swap anyway.

A pure swap pass cannot equalise a uniform blob (it relocates it), so it never replaces diffusion;
it accelerates the parts of the field that already have a gradient.

## top-level `const` is not `window.<name>`

Classic `<script>` top-level `const` creates a global lexical binding, not a property of `window`.
A jsdom/browser test that does `window.Field` gets `undefined`; use `window.eval('Field')`.
Also: separate `window.eval()` calls do **not** share lexical bindings, so a multi-file test must
inject real `<script>` elements (jsdom `runScripts: 'dangerously'`, inline the file text) instead
of evaluating the files one by one.

## a cap must be an inflow ceiling, never a clamp

Removing color above the ceiling breaks conservation and reads as "diffusion stopped". Limit
inflow per edge and the injection per source cell; let outflow run unconstrained. A cell above
its ceiling then drains normally. Derive the total budget from the same per-cell number
(`budget = cap * owned`) so the two rules cannot contradict each other.

## fill time is mass-bound, not diffusion-bound

`cells × 255 / sourceRate` frames is the floor for a one-source map of 128²: 16 384 × 255 / 32 ≈
130 000 frames. If a test "never reaches 255" with depletion off, check the source rate and the
number of source cells before blaming the kernel.

## multigrid for "u is constant per region": restrict the value, not the residual

For the homogeneous problem Au = 0 (equalize per connected region), a residual-restriction V-cycle
stalls: the coarse correction operator defined by aggregation is ~sz× stiffer per level (sz =
aggregate size), so each prolongation adds a correction ~1/sz of what the error needs. Measured on
a 128×128 line: contraction ≈ 0.93 per cycle, error still 860 % after 12 cycles; the Galerkin
equivalent (off-diagonal = Σ crossing weights) is better (~1.5× per cycle) and still useless.

The working variant restricts the value: average to coarse (size-weighted), flatten the coarse
representation there (V-cycle again, or a few smooths at the bottom), prolong the flattening delta
uniformly to children. Same masks, same edges, two smoothing sweeps per level. Measured: max on a
255-line drops 255 → 19 → 4.4 → 2.3 in three cycles (dev 12700 % → 17 % in 3 cycles).

Construction rules that keep walls exact through coarsening:

- aggregate 2×2 blocks, split each block into components along its internal edges (BFS); cells that
  touch only on a diagonal must land in different coarse nodes;
- restriction = size-weighted average of the fine values (telescoping mass conservation at every
  level); the prolong adds the coarse delta to children;
- smoothing moves mass across edges (g = wt·su·sv/(su+sv), x -= k·Σg·(x−x̂)/sz); edge flows cancel
  pairwise so Σ sz·x is invariant per sweep to the float;
- per frame, quantise with truncation + per-cell error feedback and dump the summed leftover onto
  the richest cell of the channel: mass is exact by construction;
- hierarchies are cached and rebuilt only when a channel's mask changes (byte-compare); a 128²
  all-color build is ~40 ms, dominance flips rebuild only the channels whose mask byte differs.

Coarsening bug pattern: reset the visited/in-slot arrays at slot granularity AFTER the member
loop, never after each component — a per-component reset re-assigns every cell 4× and no two
cells ever share an aggregate.

## staggered gas dynamics: avoiding ratcheting, checkerboarding, and VOF speckles

- Feeding an asymmetric foreign-pressure term (`pfor`) or a one-way check valve (`if fl > 0 && pfb > pa: fl = 0`)
  into a damped momentum accumulator `(jx, jy)` turns jagged diagonal 3-player interfaces into an acoustic ratchet
  that pumps boundary pressure steadily past source pressure (`> 360` vs `255` cap). Keep unmixable momentum
  strictly conservative on shared `ptot = R + G + B` and route species along faces via `sendEdge` instead.
- Blending VOF `sendEdge` (winner-take-all single-color edge transfer) with partial-pressure `mix > 0` creates
  phase-separation droplet checkerboarding inside partially mixed regions (`[106, 252, 0, 121, 0, 74]`). Use bulk
  `ptot` + VOF exclusively when unmixable (`!mixable || !mixRate`), and smooth per-species momentum scaled by
  `mixRate / 100` across foreign-held edges when mixable.
- Running a VOF surface-tension pass (`smoothInterface`) for isolated `<= 1`-neighbor boundary droplets eliminates
  corner-shear flotsam/speckling along curved diagonal interfaces (`orphans -> 0`) with zero pressure disturbance
  when exchanging equal quanta `min(ch[da][a], ch[db][b])` while skipping active source cells.

## mixable gas permeability, 3-species reaction, and painted-source purge

- Scaling mixable face momentum AFTER damping (`fl = perm * (damp * fl + k * dr)`) replaces `damp` with `perm * damp`,
  collapsing steady conductance by `13.5x` at `mixRate = 50%` (`0.5 / 0.54` vs `1 / 0.08`) and `40x` at `20%`.
  Scale acceleration `k * perm` with gentle Maxwell-Stefan drag `damp * (0.75 + 0.25 * perm)` weighted by symmetric
  face foreign density `((ptot[a] - ra) + (ptot[b] - rb)) / (32 * FP_ONE)`: asymmetric `dr > 0 ? ob : oa` or steep
  thresholds excite a `(pi, pi)` checkerboard oscillation along reactive fronts.
- Computing 3-player reaction from `min(R, G, B)` when all three channels are non-zero lets `1` quantum of a third
  species drop `take` to `0` and permanently paralyze reaction between two `200`-unit gases. Sort channels
  `v0 <= v1 <= v2`, react `v0` across all three, and react `v1 - v0` across the top two (minimum `1` quantum).
  Map slider `r` (`0..100`) via `(r / 100)^4` so 60 Hz per-frame removal spans glowing reactive overlap (`15..35`,
  `mixed=4110`) to 1-frame annihilation (`100`) instead of turning `2/3` of the grid black (`dark=10834` at linear `20%`).
- Painting a source inside existing enemy territory traps foreign gas in the source cross unless `pickDonorSpecies`
  expels `!(src[d] & (1 << f))` species first, clearing the source to `255` with exact foreign mass conservation.


