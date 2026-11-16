# findings, pitfalls, skills

## double-buffer swap aliases instead of swapping (0.1.0)

`const ch = grid.ch` is a reference, not a copy. This swap is wrong:

	grid.ch[c] = back[c];
	grid.back[c] = ch[c];   // ch[c] already is the new array

After the first step both names point at the same buffer and every later pass runs in place.
In-place diffusion does not look broken: values stay in range, blobs still grow, mass is roughly
conserved. It only shows up as a directional bias — mass drifts toward lower indices because a
cell already updated this pass feeds its neighbours. Found it with one symmetry probe: a single
source must read equal at distance d in all four directions (broken: 1529 left vs 1114 right,
fixed: 1744 in all four). Cheap permanent guard: two sources at mirrored positions
(x and N-1-x) must produce exactly mirrored fields; sim_smoke reports mismatch_cells, it has to
stay 0.

## integer diffusion needs fraction bits (0.1.0)

With values in 0..255, `share = (v * rate) >> 10` truncates to 0 whenever `v * rate < 1024`, so a
frontier sitting at concentration 1-3 stops dead and territories grow hard ragged edges. Storing
values `<< 4` in a Uint16Array (`MAXV = 255 << 4`) keeps 1/16 display units flowing. Keep the
settings in display units (`settings.deplete << SHIFT`) so the UI never sees the scale.

## spread the post-decay value, not the pre-decay one (0.1.0)

If diffusion runs on the pre-decay value, `next[i] = base - moved` can go negative for cells whose
value is near the decay step. The clamp to 0 then depends on visit order: a cell that already
received from its left/up neighbour loses that mass, a gift arriving later survives. Computing the
share from `max(0, cur - decay)` makes `moved <= base`, so next never goes negative, the clamp
disappears and the pass is order independent.

## clamp saturation after spread, not inside the spread loop (0.1.1)

Clamping `next[j]` to `MAXV` inside `spreadPass` deletes gifts arriving from earlier (up/left)
neighbours before `j` subtracts its own outflow `moved`. A uniform 10x10 block of `MAXV` at
`deplete=0, diffuse=255` dropped to `2048` inside and produced `2048` vs `16` across opposite
corners. `Uint16Array` holds up to `65535` while peak intermediate sum is `MAXV + 4*(MAXV*255>>10)
= 8144`, so `spreadPass` accumulates `next[j] += share` unclamped and `sourcePass` clamps `<= MAXV`
afterward; `conserve_saturated` drift and `corner_delta` stay 0.

## 3-way reaction must be simultaneous (0.1.1)

Sequential pairwise subtraction (`RG`, `GB`, `RB`) in `reactPass` consumes `R` and `G` first and
leaves `B` untouched whenever channels drop below `2 * rate`. Running simultaneous deltas when
`dr <= vr && dg <= vg && db <= vb` and otherwise stripping `s = min(vr, vg, vb)` first before
reacting the remaining pair up to `rate - (s >> 1)` keeps integer arithmetic exact and invariant
under R/G/B permutation.

## float64 gather avoids quantization stalls and mirror drift (0.1.2)

Even with 4 fraction bits (`Uint16Array`, `SHIFT = 4`), `(v * r) >> 10` truncates net flow to
zero whenever adjacent cells differ by less than `1024 / r` units, freezing `deplete = 0` fields
in a staircase at `254` or lower. `Float32Array` still stalls around `254.92-254.99` due to
24-bit cancellation against `4 * share`. `Float64Array` in native `0..255` units converges cleanly,
and pairing `(left + right) + (up + down)` in a gather `spreadPass` keeps `x -> N-1-x` mirror
fields bit-identical (`mismatch_cells = 0`). Render with `(v + 0.5) | 0` so asymptotic `254.5+`
displays as `255`.

## stable gradients are a timescale artifact, not a precision one (0.1.3)

With deplete=0 a lone source DOES converge to uniform 255 — but explicit 4-neighbour spread is stable
only while the per-neighbour share stays <= 255/1024 per update, so the coarsest 128² gradient decays
by one e-fold per ~1659 steps at rate 128 (1/(2·(rate/1024)·(2π/N)²)). A 1px line source needs ~30000
steps to pass 250 everywhere, and integer rendering hides the <1 unit/frame creep, so the map reads as
a frozen gradient. Higher diffusion was unreachable: rate > 255 diverges. Fix: run rates above 255 as
ceil(rate/255) rounds of rate/rounds per step (cross rates scaled by 1/rounds, deplete applied once per
step, sources pinned per round); the <= 255 path stays bit-identical. A line then passes 250 at ~8000
steps. Total fill time is gated by source count, not rate: one point cell exports at most ~250 units per
round, so paint strokes, not dots.
Separately, deplete > 0 forms a TRUE equilibrium: only `v = cur − d` flows and a cell keeps nothing but
inflow, so inventory <= d evaporates; a deplete=1 line source pins at reach=7 by step 300 and is
bit-identical at step 30000.
Diagnose slow motion with the hover probe (0.1 resolution), never with pixel colors.

## a total cap must limit production, never rescale the field (0.1.4)

Rescaling a whole channel by `cap / total` every step to enforce "player can keep N units"
destroys mass: the far field (< 1 display unit) is multiplied by `cap/total < 1` each step and
decays geometrically to black, leaving only the pinned source dot — the map reads as "diffusion
stopped", even though the relative gradient keeps diffusing. Enforce the cap on the source
instead: pin each source cell to `min(MAXV, cap - (total - its value))`. The total then saturates
at the cap, stored color is never destroyed, and the field keeps diffusing the held mass. Watch
out for the stale-count variant: a territory-dependent cap read from a count that predates the
freshly painted source (count 0) caps at `maxColor` alone or 0 and starves the source on step
one — keep the count fresh O(1) in paint/clear (one cell's ownership changes, undo + recount).

## random swap passes need a full snapshot phase before the accept phase (0.1.4)

A "randomly swap nearest cells" pass written row-interleaved (propose evens of row y, accept
odds of row y, next row) breaks in a subtle way: odds in row y read the down neighbour's
direction from row y+1, which is only written in the NEXT outer iteration — i.e. they read the
PREVIOUS pass's stale direction. The partner mapping silently stops being a permutation (724
duplicate + 724 missing reads on 128²) and mass is created/lost every step until the field
collapses to zero. A first pass on a fresh zero scratch can look perfect; the bug shows from the
second pass on. Fix: write ALL proposals first, then accept. Also make multi-claimer acceptance
uniform (pick `rnd() % claimers`): a "later claimer replaces with 1/2" tiebreak biases the last
checked direction and drifts the field. Verify with a mass-drift case (source cut off) and a
uniform-field no-op case, not by eye.

## node smoke of classic scripts without a browser (0.1.0)

experiments/dom_smoke.js loads index.html, extracts the script order and the ids, stubs just
enough DOM, and runs the real boot in one vm context. Two tricks:

- `require()` works for the plain sim modules, but top-level `const` of a classic script does not
  land on the sandbox object. Read it back with `vm.runInContext("grid", ctx)`.
- make the stub `getElementById` throw on an unknown id. Every `$()` id typo then fails the smoke
  instead of silently doing nothing in the browser.
