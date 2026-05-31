# Design Spec: Timeline Cockpit

Date: 2026-06-01
Project: bas-ems (static fab BAS/EMS SCADA simulation)
Status: APPROVED (brainstorming) — ready for implementation planning
Author: brainstorming session

## Summary

A persistent **multi-lane timeline** docked at the bottom of the dashboard that doubles
as a **time machine for the whole fab**. A draggable playhead controls the entire app's
clock: drag it and every module (schematics, KPIs, gauges, living-fab) rewinds or
fast-forwards in sync across the 180 s simulated hour. The lanes make the timeline a
mini-historian; clicking an alarm launches **Incident Replay** — an auto-played,
captioned reconstruction of that alarm's cause-chain.

This is "wild but cheap" because the engine is fully deterministic: `BAS.sim.frame(t)`
is a pure function of time, so any past/future moment is computable. The feature needs
**zero engine change** — only the view-side clock that decides which `t` to render.

## Goals / Non-goals

**Goals**
- One global time control rewinds/scrubs the entire dashboard in sync.
- An always-on multi-lane historian timeline (demand, alarms, event density, E10 state).
- Incident Replay: click an alarm → captioned auto-play of its cause-chain.
- Stay fully within the product's identity: static, `file://`-safe, zero-dependency,
  deterministic, 60 fps, no per-frame allocation.

**Non-goals**
- No edits to `src/engine/*` (frozen) and no change to the `frame` contract.
- No `fetch` / ES modules / web fonts / `getImageData` / network / npm / WebGL.
- No persistence, no real data, no server.
- Ghost/compare overlays and a dedicated 3D view are explicitly out (future add-ons).

## Hard constraints (carry into implementation)
- Classic `<script>` IIFE on `window.BAS`; add the 4 new files to `index.html` include
  order. `build-single.mjs` auto-inlines from `index.html` (no edit needed); add the
  post-build assertion that `BAS.clockSource` and `BAS.ui.TimelineCockpit` appear in
  `bas-ems.html`.
- Determinism: every rendered moment derives from `sim.frame(t)` / `load.sample(t)`,
  pure in `t`. Same playhead position → identical fab state.
- Precompute the lane series via `BAS.sim.load.sample(t')` and `BAS.sim.model`,
  **never** `BAS.sim.frame(t')` (frame() mutates `lastT`/`streamCursor` and returns one
  reused object — sampling it would corrupt the live stream and alias every sample).
- Precompute **on first mount**, not at module top level (`BAS.sim.load` only exists
  after `BAS.sim.init()`; module scripts run before that).
- No per-frame allocation: static lanes drawn once to a cached offscreen canvas; per
  frame only the 1 px playhead + a hover readout redraw.

## Architecture

Four new files + one shell edit + CSS. Zero engine change.

| File | Role |
|---|---|
| `src/app/clock-source.js` | The substrate. Owns time mode and computes the `t` fed to `sim.frame(t)`. |
| `src/ui/timeline-data.js` | Lazily precomputes the per-lane series for the whole loop (cached). |
| `src/ui/timeline.js` | Canvas multi-lane renderer + drag/click handling + transport controls. |
| `src/app/replay.js` | Incident Replay driver + caption strip. |
| `src/app/shell.js` (edit) | Mount the bottom cockpit strip; keyboard transport. |
| `styles/components.css`, `styles/layout.css` (edit) | Cockpit strip, lanes, playhead, captions, transport. |

### The clock source (the whole trick)

Today `main.js`'s RAF loop runs `t = BAS.clock.now()` (wall-clock, wraps mod 180) and
passes it to `sim.frame(t)`. `clock-source.js` wraps that with a mode + an offset:

```
window.BAS.clockSource = {
  mode: 'live' | 'paused' | 'replay',
  now(): number,                 // mode-aware t in [0,180), fed to sim.frame
  isLive(): boolean,
  scrubTo(t): void,              // enter 'paused' at t (drag)
  resume(): void,                // 'play-from-here': re-base offset so live continues from current t
  togglePlay(): void,            // paused <-> live
  step(deltaSec): void,          // nudge while paused
  startReplay(startT, endT, rate, onTick, onEnd): void,
  onChange(cb): void             // notify the timeline UI of mode/time changes
}
```

Internals (all view-side; engine untouched):
- `offset` (mod 180), `scrubT`, `replay = { startT, endT, rate, wall0 }`.
- `live`   → `now() = (BAS.clock.now() + offset) % 180`
- `paused` → `now() = scrubT`
- `replay` → `now() = min(endT, startT + (BAS.clock.now()-wall0)*rate)`; clamp `dt` so a
  backgrounded tab cannot fast-forward; when `now() >= endT` → call `onEnd`, return to
  `live` re-based at `endT`.
- `resume()` (play-from-here): `offset = (scrubT - BAS.clock.now() + 180) % 180`, mode='live'.

`main.js` edit: `var t = (BAS.clockSource ? BAS.clockSource.now() : BAS.clock.now());`
(single line; everything downstream is unchanged).

### Timeline data (precomputed once)

```
window.BAS.ui.timelineData = {
  get(): {                       // build-on-first-call, then cached
    demand:  Float32Array,       // total MW at N=360 points across 0..180
    peakMW:  number, minMW: number,
    alarms:  [{ alid, area, tool, sev, setT, clearT }],   // from BAS.sim.model.alarms
    density: Uint16Array,        // ~120 bins of event counts (BAS.sim.model.events)
    e10:     { [toolId]: [{ state, startT, endT }] },      // from BAS.sim.model.e10
    N: 360, bins: 120
  }
}
```

Built from `BAS.sim.load.sample(t')` (demand) + `BAS.sim.model` (alarms/events/e10).
Deterministic; allocated once on first `get()`; never recomputed.

### Timeline cockpit UI

```
window.BAS.ui.TimelineCockpit(container) -> { update(frame), setTool(toolId), destroy() }
```
- Builds: a transport row (play/pause button, `HH:MM:SS` sim-time readout, a `LIVE`/
  `SCRUB`/`REPLAY` status pill, a tool selector for the E10 lane) + a canvas timeline.
- Static layer: draws all four lanes once to an offscreen canvas (rebuilt only on
  resize or tool change). The visible canvas blits the cached layer + draws the playhead
  at `frame.t` + an optional hover crosshair/tooltip each frame.
- Lanes (top→bottom): **Demand** area chart · **Alarms** spans (click targets) ·
  **Event-density** heat strip · **E10 ribbon** for the selected tool (default: the
  first tool in `BAS.master.tools`; selector changes it and rebuilds only that lane).
- Pointer: drag on the timeline → `clockSource.scrubTo(xToT(px))`; release →
  `clockSource.resume()`; click an alarm span → `BAS.replay.start(alarm)`; hover → readout.
- **Collapsible:** a chevron collapses the cockpit to a ~24 px strip showing only the
  playhead/progress (so it doesn't permanently eat vertical space on dense modules);
  default expanded. Collapse state persists in-memory for the session.

### Incident Replay

```
window.BAS.replay = { start(alarm): void, stop(): void, active: boolean }
```
- On `start(alarm)`: window = `[alarm.setT - 8, alarm.clearT + 5]` (clamped to the loop);
  call `clockSource.startReplay(window.start, window.end, 1.5, onTick, onEnd)`; highlight
  the window on the timeline; render a bottom **caption strip**.
- Caption sequence is built from `timelineData` (NOT the live stream, so it tolerates the
  quiet-ticker-during-scrub case): pick the salient events in the alarm's area within the
  window (e.g. `ProcessJobStart`, `FDCExcursion`, `AlarmSet`) + the facility channel that
  spikes, and emit timed captions, e.g.:
  `T-8s ETCH-05 ProcessJobStart -> acid exhaust climbing -> T-3s FDC excursion ->
   T0 ALARM 1610 set -> abatement load peaks -> T+12s cleared.`
- `onEnd` → return to live.

## Data flow

```
RAF (main.js): clockSource.now() -> t -> sim.frame(t) -> app.update(frame)
                                                       -> cockpit.update(frame)   [playhead at t; lanes cached]
drag playhead   -> cockpit -> clockSource.scrubTo(t')   (mode=paused; every module renders t')
release         -> clockSource.resume()                  (play-from-here)
click alarm     -> replay.start(alarm) -> clockSource.startReplay(...) + captions + highlight
replay end      -> clockSource returns to live
```

## Decisions (locked at the design gate)
- **Four lanes** as listed (demand, alarms, event-density, E10 ribbon).
- **Replay returns to live** at the end (not pause). Configurable later.
- **Keyboard:** `space` = play/pause, `,` / `.` = step back/forward while paused. The
  enhancement plan's `ArrowLeft/Right` + `1-8` module navigation is left untouched; the
  cockpit owns only `space`/`,`/`.`.

## Relationship to the reviewed enhancement plan (`ui-ux-enhancements.md`)
- **Supersedes Task 4 (loop-progress bar):** the cockpit's playhead *is* a richer
  loop-progress indicator. Drop Task 4 if the cockpit ships.
- **Overlaps Task 19 (Trends/historian view) on "demand over the hour":** they are
  complementary, not duplicate — the cockpit lane is a *compact scrub control* (one
  series, a few pixels tall, you drag it), while Trends is a *full-detail historian*
  (multiple series, spec bands, min/avg/max, read-only). Decision: keep both, and have
  Trends reuse `BAS.ui.timelineData` so there is one precompute, not two. Revisit only if
  it feels redundant in practice.
- **Already cut:** Task 12 (header mini-sparklines) — the cockpit + Trends cover trends.
- **Coordinate with Task 3 keyboard nav:** the cockpit claims only `space`/`,`/`.`;
  module nav keeps `ArrowLeft/Right` + `1-9`.

## Edge cases
- **Ticker quiet while scrubbing** — backward jumps trip the sim event-cursor resync
  (emits nothing). Intended: the timeline is the event view during scrub; the live
  stream re-syncs on resume.
- **Determinism** — `sim.frame(t')` is pure in `t`; scrubbing to a moment always shows
  the identical state.
- **Performance** — cached static lanes; per frame only a 1 px playhead + hover redraw;
  flat memory.
- **Reduced motion** — Replay steps rather than smooth-slides; scrubber unaffected.
- **Loop wrap / backgrounded tab** — timeline spans the full loop (wrapping is natural);
  replay advances by clamped `dt` so a backgrounded tab can't fast-forward.
- **Layout** — `.app` is a flex column; the cockpit is a fixed-height (~140 px) last
  child; `.body` keeps `flex: 1`, so module content reflows above it.

## Testing
- Engine self-test stays **22/22** (no engine edit).
- New headless determinism checks (`_selftest` style): `timelineData.get()` returns
  identical output across two builds; `clockSource.now()` returns exactly `scrubT` while
  paused; replay `now()` is monotonic and clamps to `endT`.
- Browser QA (`file://`, via the browse binary): drag scrubber → all modules reflect the
  time; click alarm → replay plays with caption; resume → live; zero console errors; flat
  memory over a multi-minute scrub/play session.

## Build sequencing (vertical slice)
1. **Slice 1** — `clock-source.js` + transport (play/pause/scrub) + the **Demand lane** +
   playhead, wired through `main.js`/`shell.js`. The substrate working end-to-end with
   every module rewinding. Verify determinism + `file://`.
2. **Slice 2** — `timeline-data.js` full build + the other three lanes (alarms,
   event-density, E10 ribbon) + tool selector.
3. **Slice 3** — `replay.js` Incident Replay + caption strip + window highlight.

## Distribution
Static, unchanged: serve the folder or open `index.html` / the single-file `bas-ems.html`
from `file://`. Add the 4 new `<script src>` tags to `index.html` (the bundler picks them
up automatically) and the post-build presence assertion.
