# AGENTS.md

## style

- use a single tab indentation. LF end. main.js preallocates `$ = id => document.getElementById(id)` for every file.

- avoid deep nesting of braces { } and long if-else.
- flatten with early returns, helper functions, or flat data tables.

- avoid duplication of code.

- avoid allocations in the hot path (per-frame loop, sim, render).
- no new {}, [], object literals, closures, or string concat in the frame loop.
- reuse preallocated buffers / typed arrays / scratch objects.
- allocate once at setup, mutate in place per frame.
- these are not strict rules, use best.

- comments say why and decisions only. what-code-does belongs in names.
- 0-2 comments per function is normal. 3+ usually means names or structure are wrong — rename or restructure, don't comment.
- no banners, no commented-out code, no TODOs in code — that goes to plan or findings instead.

good:
	// 2x step: halves samples, still >60fps (plan 0.3, log 11-02)
not good:
	// increment i
	// loop over items

- no legacy support, no old versions, no outdated browsers, no leftovers and no over protecting from unreal edge cases. we need clean architecture.

good:
obj.action(obj.data)
obj.data.action()

not good:
getObj().data().action()

## runtime

- file:// friendly, classic <script> tags, no modules, no build.
- guard module.exports so files also run under node.
- no internet links: vendor any lib as a local js file.

## architecture

- index.html defines script load order. plain top-level globals, no per-file IIFE, no modules.
- one composer file owns root, $, shared objects and the boot tail. it implements nothing.
- feature files own their state and DOM refs. never reach into another file's internals.
- shared code gets a named owner. no junk drawers: no state.js, utils.js, misc.js, common.js.
- no definition-time cross-file reads: other files' code is called from inside functions only.
- top-level names must not collide with index.html ids (window[id] binding). check before adding any global. on collision: rename the newer binding; collision patterns -> findings.

## files

- every source file starts with a 1-2 line header:
	// owns: input handling and rebinding
	// edit for: key maps, bind changes
- relevance is decided from head -12. never read a full file just to learn what it is.
- keep this map updated when ownership changes:
	main.js — owns boot/wiring only. edit for load order, boot, wiring.
	settings.js — owns rule values, reaction mode list, and hold target default. edit for defaults.
	objective.js — owns the capture-and-hold ring, hold timer, and attempt statistics. edit for zone shape, control threshold, decay, goal rules.
	hud.js — owns the objective column: task actions, hold bar, zone shares, attempt history, focus host, hints, solution button and explanation. edit for objective readouts, hints, layout.
	presets.js — owns reproducible visual test scenes and their simulation settings. edit for scene layouts and starting conditions.
	field.js — owns planar Q12.12 grid, pair tables/metrics, analysis, and caps. edit for storage, cap formula.
	source.js — owns pigment painting, local production eligibility and shared-supply growth. edit for paint/seed/production rules.
	gas.js — owns staggered gas dynamics, per-pair transport, depletion. edit for gas physics.
	react.js — owns per-pair reaction modes (mutual/majority/convert/absorb) and pair scoring. edit for reaction laws.
	tick.js — owns step order and objective sampling. edit for phase order.
	rivals.js — owns two deterministic pressure sources near the objective ring. edit for source rate, footprint, or placement.
	view.js — owns canvas, cursor readout, source marks, objective ring, player & pair stats. edit for color/UI of the map.
	controls.js — owns panel widgets, focus widgets, pair toggles, reaction mode/dir controls, scene selection, and the solution highlight. edit for sliders and buttons.
	solution.js — owns the suggested objective setup, its explanation plan, and the revert snapshot. edit for suggestion values, when a rule fires, or wording.
	task.js — owns capture-and-hold task variants and default GUI restoration. edit for scene/pigment/target rolls or default reset scope.
	url-settings.js — owns shareable URL persistence for GUI settings. edit for URL encoding and validation.
	loop.js — owns pacing, stats cadence, and HUD cadence. edit for frame loop.
	experiments/ — node checks, dom smoke, gas bench, snapshots; prototype/ — archived diffusion + Brownian + multigrid V-cycle. neither loads in the page.
- new code goes to its owner, never appended "because the file is already there". no owner exists -> new file + header + map entry.
- file > ~500 lines = defect. split by feature within the same plan.
- moves are pure moves: contiguous ranges, snap to enclosing declarations, no behavior change.
- refactor or dedup mixed into a move = defect. separate plan, record the idea as a finding.

- findings-pitfalls-skills.md — notes and pitfalls for LLM agents. write here if found a good way to do something.
- archive/ — implemented plans, worklogs.

## plans

- plan*.md is NOT the implementation log. final plan = standalone design artifact, written as if implemented today: no references to chat, to what was tried, or to what was done. usable for a fork or reimplementation.
- plan numbers (0.1, gui.1) identify subjects, not version or execution order. ok to continue old numbers by subject and implement in any useful order.
- drafts (0.1.x-draft.md) — human thoughts about goals and design. user prompts may be stored as drafts to keep a reference of the global task.

## worklogs

- worklog = index + evidence, not a diary. it has two future readers: the agent bisecting a regression into this change, and whoever forks or reimplements.
- worklog is named after its plan: archive/0.1.0-plan.md -> archive/0.1.0-worklog.md.
- entry <= 15 lines:
	plan id
	changed: file + nature (move/feature/fix), one line each
	validation: what ran, result, key numbers
	decisions and why — the only part anyone rereads
	pitfalls: one line here, full note in findings
	next step suggestion
- never record: plan restatement, attempt narrative, code walkthrough. git already has the diff.
- placement of process text:
	archive/ — how it was done
	findings — reusable lessons
	README — how to run only, <=10 lines, changes only when run instructions change
	in-game help / tooltips — written as if the product shipped today
- dev-process text anywhere else (README, in-game help, UI, tooltips) = defect.
- "we added a button to sum a and b" never exists outside archive/.

## experiments

- experiments/ — node measurement scripts, never loaded by the page.
- logs are machine format: fixed keys, fixed units, one line per metric.
	fps_pre=58 fps_post=61 step=2x plan=0.3
	a log a human must parse is a defect.
- comparison = a ~15-line node script: diff two logs by key, flag |delta| > 5%. conclusion (1 sentence + numbers) -> findings, raw stays in logs.
- keep only runs that produced a decision. prune the rest when the plan closes.

## validation

- scope = blast radius of the change. never "run everything to be safe".
	L0	node --check on touched files. every edit batch. seconds.
	L1	targeted smoke of the touched area (dom_smoke etc.). after a behavior change or a code move.
	L2	full suite + manual pass list. plan completion, handoff, or shared/boot files touched (index.html, load order, composer).
- leaf file touched -> L1 max. shared/boot touched -> L2.
- previous stage's validation stands until something it covers changes. no reruns to feel safe.
- batch checks at checkpoints, never per file inside one move. full tests after every work = CPU defect.
- manual pass list (look, sound, feel) lives in the plan; one file per commit (bisectable).

## workflow

- review the previous task and the next step plan; fix compliance in place, improve the plan only with a concrete reason, rerun only what a fix touches.
- record steps and validation in `archive/*-worklog.md` per `## worklogs`.
- end the job with a next step suggestion.

## sandbox

- git push returns "Invalid username or token" is ok, no need to investigate or report - i will apply manually

## current workstream

plans 0.2.0–0.2.3, 0.3.1, 0.4.0–0.4.3 (archive/); constraints: planar Q12.12 Int32 (`Field.ch[0..2]` on `Field.v`), max 2 gas substeps/tick and 2 ticks/frame, mass-exact integer edge transfers + Float64 accumulators.
	after sim change: checks.js + rival-checks.js; after UI/boot change: dom-smoke.js.
latest: 0.4.3 shareable global pace at 0.125× by default and sim-time HUD; 0.4.2 deterministic rival pressure sources in the ring, task toggle/URL and continuous-score measurement; 0.4.1 solution button, changed-control highlight, explanation/revert, task actions and pair-mask activation; 0.4.0 capture-and-hold ring/HUD and scene bench; 0.3.1 local production, 5% control threshold, smooth reactions, directional gradient response; `npm run checks` includes concentration, objective, solution and rival regressions.

## housekeeping

- editable law: fix bad rules in place; prune dead rules when a plan closes; keep < 150 lines.
