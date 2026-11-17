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

## per-pair masks: bits name pairs, not species

A 3-pair rule set tempts one mask type for two meanings. Reading a pair mask with `mask & 3`, `mask & 5`,
`mask & 6` (species pairs) makes every source carry bits the check does not expect: `3 & 5 = 1`, so all
three "pair" tests were true for a single-pair mask and the whole solver ran with every pair enabled.
That failure is silent — the map still moves, only the rule is ignored. Keep two vocabularies apart:
pair index bits (`1 << p`, mask `0..7`) for permissions and rates, species bitmask (`1 << c`, `3/5/6`)
only inside the per-direction allow table. A directional acceptance check (open one pair, assert mass
crosses in that pair and not in the other two) catches it in one run; a symmetry or mass check does not.

## a blocked direction must be a valve, not a low permeability

Scaling face conductance by `k * (1 - g)` with `g` growing on foreign density reads naturally as "less
permeable", but at `g = 1` it only halves the conduct and keeps the damped momentum. A disabled pair
then leaks at ~1/4 of an open pair — visible as slow but complete penetration. Two consequences:

- To make a rule absolute, branch in the acceleration: clear the flux when both directions are
  blocked, keep only the allowed sign when one is. The wall then holds exactly.
- Do not implement "blocked" as "this face carries no flux at all": a face whose two sides both hold
  gas is a gate, so zeroing it turns the neighbour into a vacuum and pressure suction pulls the donor
  across the "wall" (measured: whole regions swapped owners). The blocked side must keep the damped
  push term; only the mass flux is zero.

Also: `Gas.liveMask` must require `(mixMask & (1 << p)) && mixRate[p] > 0`, and `React.run` must
intersect `reactMask` with `liveMask`. Leaving `allow` open at `rate = 0` leaked `319 715` display
units across a 200-vs-10 front because `f = other / (32 * FP_ONE) < 1` leaves `1 - g > 0`; running
reaction on an unmixable pair eroded `132 000` display units along the 1-cell VOF interface seam.

## a per-pair reaction needs a per-pair draw, not sorted channels

"Two largest react, then the smallest against the larger two" is a good 3-player default when all
pairs share one rate. With per-pair rules it is wrong: the top-two draw uses the pair of those two
channels, so enabling only `RB` and letting G sit above both makes R and B react through the RG rate,
and a single enabled pair drains two colors that never touched each other. Draw per present pair
(`min(a, b) * share`), then scale all draws by one common factor when a channel would be overdrawn.

Reaction strength: square the slider (`share = (rate / 100)^2`). Linear scaling has no thin-front
regime: measured on a `200/200` pair, `rate = 1` keeps `199.98` per frame and still drains the pair
in ~98 frames, while `rate = 5` clears most of a 128² map — everything between is a cliff. Squared,
`1` removes `0.02 %` of the minimum per frame (a seconds-long fade), `5` removes `0.25 %` (a wide
glowing overlap), `25` removes `6 %` (a bright seam), `100` annihilates overlap in one frame.

## DOM panel: ids must be unique per widget, and handlers must capture the node

Two traps when a panel grows to grouped widgets:

- `id = group + '-' + pair` for both the checkbox and the slider of the same pair silently produces
  two nodes with one id; `getElementById` returns the first, so the slider handler you thought you
  bound is never the node the test pokes. Suffix the kind (`-on` for checkboxes) or key by role.
- A range handler of the form `input.addEventListener('input', () => edit(def, p, input, val))` is
  safe only if `input` is the parameter of the loop that created it. Reading `+input.value` through a
  stale `def` (`def` replaced by a node, `Settings[def.key]` then `undefined`) throws inside the
listener, which jsdom reports as silence rather than a failing check. Assert the setting changed
after dispatching the event, not just that the event listener was attached.

## fractional reaction demand and gain-separate conversion scaling

Pure truncation stalls below one quantum; a minimum-one-quantum floor instead destroys weak signals
too quickly. Accumulate fractional reaction demand per cell/pair/direction, round only at application,
and clamp integer losses against current availability. Clear carries on reset and inactive demands.
With concentration-dependent reactions, dilute pigment must survive much longer than dense overlap.

For mass-conserving conversion (`u += d, v -= d`), scale each channel's gains against `cap[c] - x[c]`
and `budget[c] - total[c]` independently of losses (`d` bounded by `min(sLoss[loser], sGain[winner])`).
Scaling on net `gain - loss` can overshoot `cap` by 1 quantum after independent integer truncation,
and a single cell-wide scale factor stalls an unrelated pair `GB` whenever `R` sits at its cap.

## static-source reference: shared supply creates a source-count sweet spot

Apportioning a player's per-frame flow limit `playerFlow` across active sources via running rational
division (`add = w * (room / want) | 0`, last source gets exact `room`) avoids scanline starvation
and wastes zero quanta without extra arrays. Combined with the `255` source ceiling and per-cell
depletion, source count `K` self-limits along an inverted-U curve (`playerFlow = 600, dep = 0.1`):
`K = 1` claims `1521` cells (ceiling-choked), `K = 2` peaks at `3475` (`peak = 255`), `K = 8` drops
to `2845` (`peak = 75`), `K = 64` collapses to `576` (`peak = 9`).

## eligibility must not grant transport privileges

When every eligible cell can produce, source-specific purge/pinning rules become territory-wide
forces unrelated to concentration gradients. Remove those rules rather than rasterizing dynamic
production into the old hub physics. Snapshot rival concentrations before per-species edge passes
so an earlier species transfer does not change another species' signal within the same substep.

A 64-cell RG line after 300 ticks (2% mutual reaction, production 5, speed 20, damping 100) has
green traces increasing toward the border: positions 0/8/16/24/31 = 0.011/0.301/4.536/28.206/106.208.
R→G attraction 50 raises red at cell 32 from 106.208 to 186.577 without target searches.

## an objective measures the opening seed unless every variant makes the same move

Settings-only sweeps of the six scenes (12 s target, 10 s runs) put the tested player in control at frame 0 in 2 of 6 scenes and below 55 % in the other 4; mean control spread was 0.1 s for pressure and 0.0 s for mixing. The layout, not the rule under test, decided the outcome.

Give every variant one identical opening claim instead: clear and paint a radius-8 disc at the ring centre before the run. The same sweep at 6 s then separates the choices: production 1.2 s mean control spread / 7.6 pp peak-share spread, pressure 0.1 s / 0.0 pp, mixing 0.0 s / 0.7 pp, reaction 0.5 s / 0.4 pp. Colour choice is the strongest lever (2.8 s / 31.4 pp) because every scene favours one seed.

- A hold gate clamps the metric at zero below the threshold. Log peak share next to control time and mark an axis sensitive on either spread.
- Deterministic runs make the opening move part of the experiment, so put it in the plan.
- 128² `Tick` costs ~28 ms in node: 66 runs × 360 ticks is ~25 min. Two levels per axis is the practical limit.

## duplicate widgets need one sync loop, not one copy per panel

A compact focus panel reuses the panel's widget factory and reads the same `Settings`. Every edit resyncs all knobs, so the duplicate slider, the panel slider and the URL never disagree. Build duplicate rows from the definition table and resolve pair-dependent values (rival pair index, labels) at sync time; copying values at build time creates a second source of truth that drifts on the first colour switch.

## the objective panel must own every key its solver writes

A one-click suggested setup is a second, invisible writer of `Settings`. If a suggestion raises a key that has no
widget in the objective column, the numbers move somewhere else on the page and the panel's claim about "the
settings that matter" is false. Keep the writable list with the solver (`Solution.keys`) and the focus-block list
with the controls (`SPOT_KEYS`, `SPOT_SELECTS`), then assert set inclusion in a node check. Deriving the widgets
from the solver list inverts the dependency — the panel would own rule semantics — and a solver that adds a key
without a widget is exactly the defect the check catches.

Related: a focus row that appends a direction button to its label span and later rewrites the label with
`textContent` silently deletes the button. The node and its listener stay in the JS array, so a check that only
counts `Controls.dirs` passes while the DOM has no direction control. Keep the label in its own text node and
assign `nodeValue`.

## absorb direction is the ring lever, production alone is not

Measured on the six scenes with the same radius-8 opening claim, patch applied at frame 60, 160 frames
(`objective-bench.js 160 solution`, 2026-11): production 16 on the low-pigment rule alone left control time
unchanged or slightly worse (scene 5: 2.32 s → 2.20 s), while mixing 55 % + absorb 12 % + directions pointed at
the player moved scenes 1–3 from 0 s to 1.4–1.7 s of control and from 34–55 % to 100 % peak ring share, with no
scene losing control time. Mean gain 0.8 s control, 26.4 pp peak share.

With default directions the same patch gained nothing on 3 of 6 scenes: absorb is one-way, so an unset direction
lets the rival eat the player in one of the two pairs. A suggestion that enables absorb must write directions.

## a pair rate is inert without its mask bit

A solver that compares only `mixRate[p]` / `reactRate[p]` to its target can report a no-op while the pair is
disabled, leaving the GUI apparently solved but physically unchanged. Treat the rate and its mask bit as one
control: record an `enable` edit when the target rate is already stored but the bit is off, restore the whole
mask on revert, and highlight both the pair checkbox and the focus slider.

## task defaults and nondeterministic rolls

`Task.defaults` consumes `UrlSettings.baseline(scene)` instead of keeping a second copy of application defaults;
the baseline already layers the selected scene profile over the boot settings. In DOM checks, stub `Task.roll`
with a fixed sequence rather than replacing global `Math.random`, which leaks into other checks and jsdom
internals.
