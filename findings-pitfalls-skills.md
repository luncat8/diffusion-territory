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

## node smoke of classic scripts without a browser (0.1.0)

experiments/dom_smoke.js loads index.html, extracts the script order and the ids, stubs just
enough DOM, and runs the real boot in one vm context. Two tricks:

- `require()` works for the plain sim modules, but top-level `const` of a classic script does not
  land on the sandbox object. Read it back with `vm.runInContext("grid", ctx)`.
- make the stub `getElementById` throw on an unknown id. Every `$()` id typo then fails the smoke
  instead of silently doing nothing in the browser.
