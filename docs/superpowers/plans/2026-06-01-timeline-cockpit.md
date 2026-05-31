# Timeline Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent multi-lane timeline docked at the bottom of the bas-ems dashboard that acts as a time machine: dragging its playhead rewinds/scrubs the entire app across the 180 s simulated hour, and clicking an alarm auto-plays a captioned Incident Replay.

**Architecture:** Pure view-side. A new `clockSource` decides which `t` is fed to the unchanged `sim.frame(t)` (live wall-clock / paused / replay). A `timelineData` module precomputes per-lane series once from `load.sample(t')` (never `frame()`). A canvas `TimelineCockpit` renders cached static lanes + a per-frame playhead and owns scrub/click input. `replay` drives the clock through an alarm's cause-chain with captions. Zero edits to `src/engine/*`; no change to the `frame` contract.

**Tech Stack:** Vanilla ES5-style classic `<script>` IIFEs on `window.BAS`; HTML5 Canvas 2D; no dependencies; runs from `file://`. Headless tests via `bun` loading source through `new Function` (same pattern as `_selftest.mjs`); UI verified in a real browser through the gstack `browse` binary.

---

## Constraints (must hold for every task)
- **No edits to `src/engine/*`** and no change to the object returned by `BAS.sim.frame(t)`.
- **`file://`-safe:** classic scripts on `window.BAS`; no `fetch`, ES modules, web fonts, `getImageData`, network, npm, or WebGL.
- **Deterministic:** every rendered moment derives from `sim.frame(t)` / `load.sample(t)`, pure in `t`. Same playhead → identical state.
- **Precompute via `BAS.sim.load.sample(t')`, NEVER `BAS.sim.frame(t')`** (frame mutates `lastT`/`streamCursor` and returns one reused object).
- **Precompute on first use (post-init), not at module top level** (`BAS.sim.load` exists only after `BAS.sim.init()`).
- **No per-frame allocation:** static lanes drawn once to a cached offscreen canvas; per frame only the playhead + hover redraw.

## File structure

| File | New/Mod | Responsibility |
|---|---|---|
| `src/app/clock-source.js` | new | Time mode + the `t` fed to `sim.frame`. Pure logic, headless-testable. |
| `src/ui/timeline-data.js` | new | Precompute (cached) the lane series for the whole loop. Headless-testable. |
| `src/ui/timeline.js` | new | Canvas multi-lane renderer, transport row, scrub/click input. |
| `src/app/replay.js` | new | Incident Replay driver + caption builder (builder is headless-testable). |
| `src/app/main.js` | mod | One-line: feed `clockSource.now()` to `sim.frame`. |
| `src/app/shell.js` | mod | Mount the cockpit strip; keyboard `space`/`,`/`.`. |
| `styles/layout.css` | mod | `.cockpit` strip layout. |
| `styles/components.css` | mod | Lanes, playhead, transport, caption strip styling. |
| `index.html` | mod | Add 4 `<script src>` includes (bundler auto-inlines). |
| `build-single.mjs` | mod | Post-build presence assertion. |
| `_timeline_test.mjs` | new | Headless tests for clock-source, timeline-data, replay caption builder. |

---

## Task 0: (Optional) initialise git

Skip if you don't want version control; then treat every "Commit" step below as a no-op checkpoint.

- [ ] **Step 1: init**

Run: `cd /e/repo/bas-ems && git init && git add -A && git commit -m "chore: snapshot before timeline-cockpit"`
Expected: a baseline commit. If you skip this, ignore all later `git` commands.

---

## Task 1: clock-source (the substrate)

**Files:**
- Create: `src/app/clock-source.js`
- Test: `_timeline_test.mjs`

- [ ] **Step 1: Write the failing test**

Add this to a new file `_timeline_test.mjs` (loads engine + the file under test into a mock `window`, stubs `BAS.clock.now`):

```js
// Headless tests for the Timeline Cockpit logic modules. Run: bun _timeline_test.mjs
import { readFileSync } from 'fs';
const win = {};
function load(p){ new Function('window', readFileSync(p,'utf8'))(win); }
['prng','clock','master-data','events','load-model','sim'].forEach(f => load(`src/engine/${f}.js`));
load('src/app/clock-source.js');
const BAS = win.BAS;
let pass=0, fail=0;
const ok=(n,c,x)=>{(c?pass++:fail++);console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};

// Deterministically stub the wall clock so 'live' time is controllable.
let WALL = 0;                       // seconds, 0..180
BAS.clock.now = () => WALL;

const cs = BAS.clockSource;
// live mode passes wall-clock through (offset 0)
WALL = 12.0; ok('live now == wall', Math.abs(cs.now() - 12.0) < 1e-9, cs.now().toFixed(3));
// scrubTo freezes at the scrubbed t regardless of wall advancing
cs.scrubTo(90); WALL = 30;
ok('paused holds scrubT', Math.abs(cs.now() - 90) < 1e-9 && cs.mode === 'paused');
// resume() plays-from-here: now() continues from 90 as wall advances
cs.resume(); WALL = 30;  ok('resume base == scrubT', Math.abs(cs.now() - 90) < 1e-6);
WALL = 35;               ok('resume advances', Math.abs(cs.now() - 95) < 1e-6, cs.now().toFixed(3));
// wrap stays in [0,180)
cs.scrubTo(179.5); cs.resume(); WALL = 0 + 5; // wall jumped; just assert range
let v = cs.now(); ok('now in [0,180)', v >= 0 && v < 180, v.toFixed(3));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: FAIL — `clock-source.js` does not exist yet (`ENOENT`) or `BAS.clockSource` is undefined.

- [ ] **Step 3: Write the implementation**

Create `src/app/clock-source.js`:

```js
/* bas-ems — view-side clock source (time-machine substrate)
 * Classic script -> window.BAS.clockSource
 * Decides which t is fed to sim.frame(t): live wall-clock, paused/scrub, or replay.
 * Engine untouched. BAS.clock.now() is the wall-clock base (wraps mod 180).
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var CK = BAS.clock, P = CK.PERIOD;
  var mode = 'live', offset = 0, scrubT = 0, rep = null, lastT = 0, listeners = [];

  function wrap(t) { return ((t % P) + P) % P; }
  function wall() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000; }
  function emit() { for (var i = 0; i < listeners.length; i++) listeners[i](mode, lastT); }
  function toLiveAt(t) { offset = wrap(t - CK.now()); mode = 'live'; }

  function now() {
    var t;
    if (mode === 'live') { t = wrap(CK.now() + offset); }
    else if (mode === 'paused') { t = scrubT; }
    else { // replay (monotonic stopwatch via wall(), output wrapped)
      var tRaw = rep.startT + (wall() - rep.wall0) * rep.rate;
      if (tRaw >= rep.endT) {
        var endWrap = wrap(rep.endT), oe = rep.onEnd; rep = null; toLiveAt(endWrap);
        t = endWrap; lastT = t; emit(); if (oe) oe(); return t;
      }
      t = wrap(tRaw); if (rep.onTick) rep.onTick(t);
    }
    lastT = t; return t;
  }

  BAS.clockSource = {
    get mode() { return mode; },
    now: now,
    isLive: function () { return mode === 'live'; },
    scrubTo: function (t) { rep = null; scrubT = wrap(t); mode = 'paused'; emit(); },
    resume: function () { rep = null; toLiveAt(scrubT); emit(); },
    pause: function () { var t = now(); rep = null; scrubT = t; mode = 'paused'; emit(); },
    togglePlay: function () { if (mode === 'live') this.pause(); else this.resume(); },
    step: function (d) { rep = null; scrubT = wrap(scrubT + d); mode = 'paused'; emit(); },
    cancel: function () { if (mode === 'replay') { var t = lastT; rep = null; toLiveAt(t); emit(); } },
    // startT may be negative / endT may exceed P; replay.js passes a forward window.
    startReplay: function (startT, endT, rate, onTick, onEnd) {
      rep = { startT: startT, endT: endT, rate: rate || 1.5, wall0: wall(), onTick: onTick, onEnd: onEnd };
      mode = 'replay'; emit();
    },
    onChange: function (cb) { listeners.push(cb); }
  };
})(window.BAS);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: PASS — all clock-source assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/app/clock-source.js _timeline_test.mjs
git commit -m "feat(time): add view-side clockSource substrate"
```

---

## Task 2: wire main.js to the clock source

**Files:**
- Modify: `src/app/main.js` (the RAF loop)

- [ ] **Step 1: Make the edit**

In `src/app/main.js`, inside `frameLoop`, replace `var t = clock.now();` with:

```js
var t = (BAS.clockSource ? BAS.clockSource.now() : clock.now());
```

(Single line. If `clock-source.js` is loaded, it drives time; otherwise the app falls back to live wall-clock — so this is safe to land before the cockpit UI exists.)

- [ ] **Step 2: Add the include so it actually loads**

In `index.html`, add BEFORE `src/app/main.js` (after the ui includes):

```html
<script src="src/app/clock-source.js"></script>
```

- [ ] **Step 3: Verify no regression in the browser**

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse.exe"
"$B" goto "file:///E:/repo/bas-ems/index.html"; "$B" wait --load
"$B" console --errors
"$B" js "({active: BAS.app.active, live: BAS.clockSource.isLive(), demand: document.querySelector('.hdr-kpi .val').textContent})"
```
Expected: no console errors; `live:true`; demand reads a value — the app still runs live exactly as before.

- [ ] **Step 4: Engine still green**

Run: `cd /e/repo/bas-ems && bun _selftest.mjs`
Expected: `22 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/main.js index.html
git commit -m "feat(time): drive sim time from clockSource"
```

---

## Task 3: timeline-data (demand series, cached)

**Files:**
- Create: `src/ui/timeline-data.js`
- Test: `_timeline_test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `_timeline_test.mjs` (before the final summary lines — move the summary to the end):

```js
load('src/ui/timeline-data.js');
BAS.sim.init();
const td1 = BAS.ui.timelineData.get();
ok('demand length 360', td1.demand.length === 360, String(td1.demand.length));
ok('peakMW plausible 20-50', td1.peakMW > 20 && td1.peakMW < 50, td1.peakMW.toFixed(1));
ok('demand[0] finite', Number.isFinite(td1.demand[0]));
// determinism: a fresh build equals the cached one element-for-element
BAS.ui.timelineData._reset();
const td2 = BAS.ui.timelineData.get();
let identical = td1.demand.length === td2.demand.length;
for (let i = 0; i < td1.demand.length && identical; i++) if (td1.demand[i] !== td2.demand[i]) identical = false;
ok('demand precompute deterministic', identical);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: FAIL — `timeline-data.js` missing / `BAS.ui.timelineData` undefined.

- [ ] **Step 3: Write the implementation**

Create `src/ui/timeline-data.js`:

```js
/* bas-ems — timeline lane data (precomputed once, cached)
 * Classic script -> window.BAS.ui.timelineData
 * Built from BAS.sim.load.sample(t') + BAS.sim.model. NEVER calls BAS.sim.frame().
 * Demand series in this task; alarms/density/e10 added in Task 5.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var cache = null;
  function build() {
    var load = BAS.sim.load, P = BAS.clock.PERIOD, N = 360;
    if (!load) throw new Error('timelineData.get() called before BAS.sim.init()');
    var demand = new Float32Array(N), peak = 0, min = 1e9;
    for (var i = 0; i < N; i++) {
      var mw = load.sample(i / N * P).totalKW / 1000;
      demand[i] = mw; if (mw > peak) peak = mw; if (mw < min) min = mw;
    }
    cache = { N: N, P: P, demand: demand, peakMW: peak, minMW: min,
      alarms: [], density: new Uint16Array(120), bins: 120, e10: {} };
    return cache;
  }
  BAS.ui = BAS.ui || {};
  BAS.ui.timelineData = {
    get: function () { return cache || build(); },
    _reset: function () { cache = null; }
  };
})(window.BAS);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: PASS — demand length/peak/determinism all green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/timeline-data.js _timeline_test.mjs
git commit -m "feat(time): timelineData demand precompute (cached, deterministic)"
```

---

## Task 4: TimelineCockpit UI — demand lane + playhead + transport + scrub (Slice 1 end)

**Files:**
- Create: `src/ui/timeline.js`
- Modify: `src/app/shell.js`, `styles/layout.css`, `styles/components.css`, `index.html`, `build-single.mjs`

- [ ] **Step 1: Create `src/ui/timeline.js`**

```js
/* bas-ems — Timeline Cockpit (canvas multi-lane time machine)
 * Classic script -> window.BAS.ui.TimelineCockpit(container) -> { update(frame), setTool(id), destroy() }
 * Slice 1: demand lane + playhead + transport + drag-scrub. Lanes 2-4 added in Task 6.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, CS = null;

  BAS.ui.TimelineCockpit = function (container) {
    CS = BAS.clockSource;
    var data = U.timelineData.get();
    var collapsed = false, hoverX = -1;

    // ---- DOM: transport row + canvas ----
    var root = el('div', 'cockpit-inner');
    var bar = el('div', 'tl-transport');
    var playBtn = el('button', 'tl-btn', '❚❚');          // shows pause glyph while live
    var clock = el('span', 'tl-clock', '00:00:00');
    var pill = el('span', 'tl-pill live', 'LIVE');
    var spacer = el('span', 'tl-spacer');
    var chevron = el('button', 'tl-btn', '▾');
    bar.appendChild(playBtn); bar.appendChild(clock); bar.appendChild(pill);
    bar.appendChild(spacer); bar.appendChild(chevron);
    var canvas = el('canvas', 'tl-canvas');
    root.appendChild(bar); root.appendChild(canvas);
    container.appendChild(root);

    // ---- cached static layer (lanes drawn once) ----
    var staticC = document.createElement('canvas'), staticW = 0, staticH = 0, dpr = 1;
    function laneRect() { return { x: 0, y: 0, w: canvas._w, h: canvas._h }; }
    function xToT(px) { return Math.max(0, Math.min(data.P - 0.001, (px / canvas._w) * data.P)); }
    function tToX(t) { return (t / data.P) * canvas._w; }

    function rebuildStatic() {
      var ctx = U.fitCanvas(canvas, collapsed ? 24 : 92);   // sets canvas._w/_h + DPR transform
      var w = canvas._w, h = canvas._h; dpr = canvas._dpr;
      staticC.width = canvas.width; staticC.height = canvas.height;
      var s = staticC.getContext('2d'); s.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.clearRect(0, 0, w, h);
      // demand area chart across the whole loop
      var range = (data.peakMW - data.minMW) || 1, N = data.demand.length;
      s.beginPath();
      for (var i = 0; i < N; i++) {
        var x = i / (N - 1) * w, y = h - 4 - ((data.demand[i] - data.minMW) / range) * (h - 10);
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
      s.lineTo(w, h); s.lineTo(0, h); s.closePath();
      s.fillStyle = U.hexA(U.cssVar('--accent'), .14); s.fill();
      s.beginPath();
      for (var j = 0; j < N; j++) { var x2 = j / (N - 1) * w, y2 = h - 4 - ((data.demand[j] - data.minMW) / range) * (h - 10); if (j === 0) s.moveTo(x2, y2); else s.lineTo(x2, y2); }
      s.strokeStyle = U.cssVar('--accent'); s.lineWidth = 1; s.stroke();
      staticW = w; staticH = h;
    }

    function render(frame) {
      if (canvas._w !== staticW || canvas._h !== staticH) rebuildStatic();
      var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var w = canvas._w, h = canvas._h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(staticC, 0, 0, w, h);
      // playhead
      var px = tToX(frame.t);
      ctx.strokeStyle = CS.isLive() ? U.cssVar('--accent') : U.cssVar('--warn');
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      // hover crosshair
      if (hoverX >= 0) { ctx.strokeStyle = 'rgba(180,200,230,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hoverX, 0); ctx.lineTo(hoverX, h); ctx.stroke(); }
    }

    // ---- input ----
    var dragging = false;
    function px(e) { var r = canvas.getBoundingClientRect(); return e.clientX - r.left; }
    canvas.addEventListener('mousedown', function (e) { dragging = true; CS.scrubTo(xToT(px(e))); });
    window.addEventListener('mousemove', function (e) { if (dragging) CS.scrubTo(xToT(px(e))); });
    window.addEventListener('mouseup', function () { if (dragging) { dragging = false; CS.resume(); } });
    canvas.addEventListener('mousemove', function (e) { hoverX = px(e); });
    canvas.addEventListener('mouseleave', function () { hoverX = -1; });
    playBtn.addEventListener('click', function () { CS.togglePlay(); });
    chevron.addEventListener('click', function () { collapsed = !collapsed; chevron.textContent = collapsed ? '▴' : '▾'; staticW = -1; });

    CS.onChange(function (mode) {
      pill.className = 'tl-pill ' + mode; pill.textContent = mode.toUpperCase();
      playBtn.textContent = (mode === 'live') ? '❚❚' : '▶';
    });

    return {
      update: function (frame) { clock.textContent = frame.sim.hms; render(frame); },
      setTool: function () {},     // Task 6
      destroy: function () { container.removeChild(root); }
    };
  };
})(window.BAS);
```

- [ ] **Step 2: Mount it in `src/app/shell.js`**

In `shell.js` `build(root)`, AFTER `body` is appended to `app` and before `root.appendChild(app)`, add a cockpit strip:

```js
    // bottom time-machine cockpit
    var cockpit = el('div', 'cockpit');
    app.appendChild(cockpit);
    refs.cockpit = BAS.ui.TimelineCockpit(cockpit);
```

In `shell.js` `update(frame)`, at the end add:

```js
    if (refs.cockpit) refs.cockpit.update(frame);
```

Add a keydown handler at the end of `build()` (kept clear of the arrow/number module nav):

```js
    window.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea|button/i.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); BAS.clockSource.togglePlay(); }
      else if (e.key === ',') { BAS.clockSource.step(-1); }
      else if (e.key === '.') { BAS.clockSource.step(1); }
    });
```

- [ ] **Step 3: Styles**

In `styles/layout.css`, the `.app` already is `display:flex; flex-direction:column; height:100vh;` and `.body` is `flex:1`. Add:

```css
.cockpit { flex: 0 0 auto; background: var(--bg-1); border-top: 1px solid var(--line-2); }
.cockpit-inner { padding: 6px 10px 8px; }
```

In `styles/components.css`, add:

```css
.tl-transport { display:flex; align-items:center; gap:10px; height:22px; }
.tl-btn { background:var(--bg-3); color:var(--text-dim); border:1px solid var(--line-2); border-radius:4px;
  font-family:var(--mono); font-size:var(--fs-1); padding:1px 8px; cursor:pointer; }
.tl-btn:hover { color:var(--text); border-color:var(--line-3); }
.tl-clock { font-family:var(--mono); font-size:var(--fs-2); color:var(--accent); letter-spacing:1px; }
.tl-pill { font-family:var(--mono); font-size:var(--fs-0); padding:1px 7px; border-radius:10px; letter-spacing:.1em; }
.tl-pill.live { color:var(--good); border:1px solid rgba(52,211,153,.4); }
.tl-pill.paused { color:var(--warn); border:1px solid rgba(245,183,61,.4); }
.tl-pill.replay { color:var(--accent-2); border:1px solid rgba(58,157,255,.4); }
.tl-spacer { flex:1; }
.tl-canvas { display:block; width:100%; cursor:ew-resize; margin-top:6px; }
```

- [ ] **Step 4: Includes + build assertion**

In `index.html`, add after `src/ui/livefab.js` (and clock-source already added in Task 2):

```html
<script src="src/ui/timeline-data.js"></script>
<script src="src/ui/timeline.js"></script>
```

In `build-single.mjs`, before `writeFileSync('bas-ems.html', html);`, add a presence assertion:

```js
['BAS.clockSource', 'BAS.ui.timelineData', 'BAS.ui.TimelineCockpit'].forEach(function (sym) {
  if (html.indexOf(sym) === -1) { throw new Error('build-single: ' + sym + ' missing from bundle — check index.html includes'); }
});
```

- [ ] **Step 5: Browser QA — the substrate works**

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse.exe"
"$B" goto "file:///E:/repo/bas-ems/index.html"; "$B" wait --load
"$B" console --errors
# scrub to t=45 and confirm every module reflects that past moment + pill flips to PAUSED
"$B" js "BAS.clockSource.scrubTo(45)"
"$B" js "({mode:BAS.clockSource.mode, t:BAS.clockSource.now().toFixed(1), pill:document.querySelector('.tl-pill').textContent})"
"$B" screenshot /tmp/tl-scrub.png
# resume and confirm it returns to live
"$B" js "BAS.clockSource.resume()"
"$B" js "({live:BAS.clockSource.isLive(), pill:document.querySelector('.tl-pill').textContent})"
```
Expected: no console errors; after `scrubTo(45)`, `mode:'paused'`, pill `PAUSED`, and the screenshot shows KPIs/modules at the t=45 state; after `resume()`, `live:true`, pill `LIVE`. Then read `/tmp/tl-scrub.png` to eyeball that the playhead sits ~25% across the demand lane.

- [ ] **Step 6: Engine + single-file build green**

Run: `cd /e/repo/bas-ems && bun _selftest.mjs && bun build-single.mjs`
Expected: `22 passed, 0 failed`; `wrote bas-ems.html (...)` with no assertion throw.

- [ ] **Step 7: Commit**

```bash
git add src/ui/timeline.js src/app/shell.js styles/layout.css styles/components.css index.html build-single.mjs
git commit -m "feat(time): timeline cockpit — demand lane, playhead, scrub, transport"
```

---

## Task 5: timeline-data — alarms, event density, E10 ribbon (Slice 2 data)

**Files:**
- Modify: `src/ui/timeline-data.js`
- Test: `_timeline_test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `_timeline_test.mjs` (before summary):

```js
BAS.ui.timelineData._reset();
const td = BAS.ui.timelineData.get();
ok('alarms populated', td.alarms.length > 0, String(td.alarms.length));
ok('alarm has setT<clearT', td.alarms.every(a => a.setT >= 0 && a.clearT <= 180 && a.setT < a.clearT));
ok('density 120 bins', td.density.length === 120);
ok('density nonzero somewhere', Array.from(td.density).some(v => v > 0));
const firstTool = BAS.master.tools[0].id;
ok('e10 ribbon for a tool', Array.isArray(td.e10[firstTool]) && td.e10[firstTool].length > 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: FAIL — `alarms` empty, `density` all zero, `e10` empty (Task 3 stubbed them).

- [ ] **Step 3: Extend `build()` in `src/ui/timeline-data.js`**

Replace the `cache = {...}` assignment with a full build (keep the demand loop above it):

```js
    var model = BAS.sim.model, bins = 120;
    // alarms straight from the deterministic model
    var alarms = model.alarms.map(function (a) {
      return { alid: a.alid, area: a.area, tool: a.tool, sev: a.sev, setT: a.set, clearT: a.clear, text: a.text };
    });
    // event-density histogram
    var density = new Uint16Array(bins);
    for (var e = 0; e < model.events.length; e++) {
      var b = Math.min(bins - 1, Math.floor(model.events[e].sec / P * bins)); density[b]++;
    }
    // E10 ribbons per tool (already loop-closed segments)
    var e10 = {};
    var ids = Object.keys(model.e10);
    for (var k = 0; k < ids.length; k++) {
      e10[ids[k]] = model.e10[ids[k]].map(function (s) { return { state: s.state, startT: s.start, endT: s.end }; });
    }
    cache = { N: N, P: P, demand: demand, peakMW: peak, minMW: min,
      alarms: alarms, density: density, bins: bins, e10: e10 };
    return cache;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: PASS — alarms/density/e10 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/timeline-data.js _timeline_test.mjs
git commit -m "feat(time): timelineData alarms/density/e10 series"
```

---

## Task 6: timeline.js — render lanes 2-4 + tool selector

**Files:**
- Modify: `src/ui/timeline.js`, `styles/components.css`

- [ ] **Step 1: Add lane drawing to `rebuildStatic()`**

In `src/ui/timeline.js`, the cockpit shows 4 stacked lanes when expanded. Replace the single demand drawing in `rebuildStatic()` with a lane layout. Add these constants at the top of the factory and rewrite the lane drawing (full code):

```js
    var LANES = ['demand', 'alarms', 'density', 'e10'];
    var selTool = BAS.master.tools[0].id;
```

In `rebuildStatic()`, after sizing, replace the demand-only block with stacked lanes (demand top, then alarms, density, e10):

```js
      var laneH = Math.floor((h - 4) / 4), pad = 2;
      function laneY(i) { return 2 + i * laneH; }
      // 0: demand area
      drawDemand(s, 0, laneY(0), w, laneH - pad);
      // 1: alarms spans
      for (var ai = 0; ai < data.alarms.length; ai++) {
        var a = data.alarms[ai], ax = a.setT / data.P * w, aw = Math.max(2, (a.clearT - a.setT) / data.P * w);
        s.fillStyle = a.sev === 'MAJOR' ? U.cssVar('--bad') : U.cssVar('--warn');
        s.fillRect(ax, laneY(1) + 2, aw, laneH - pad - 4);
      }
      // 2: event-density heat strip
      var dmax = 1; for (var d0 = 0; d0 < data.density.length; d0++) if (data.density[d0] > dmax) dmax = data.density[d0];
      var bw = w / data.density.length;
      for (var d = 0; d < data.density.length; d++) {
        s.fillStyle = U.hexA(U.cssVar('--accent'), 0.12 + 0.6 * (data.density[d] / dmax));
        s.fillRect(d * bw, laneY(2) + 1, bw + 0.5, laneH - pad - 2);
      }
      // 3: E10 ribbon for selected tool
      var segs = data.e10[selTool] || [];
      var stcol = { 'Productive': '#34d399', 'Standby': '#3a9dff', 'Engineering': '#9a7bff', 'Scheduled Down': '#f5b73d', 'Unscheduled Down': '#ff5d6c', 'Non-Scheduled': '#5c6981' };
      for (var sg = 0; sg < segs.length; sg++) {
        var sx = segs[sg].startT / data.P * w, sw = (segs[sg].endT - segs[sg].startT) / data.P * w;
        s.fillStyle = stcol[segs[sg].state] || '#5c6981'; s.fillRect(sx, laneY(3) + 1, sw, laneH - pad - 2);
      }
```

Extract the demand drawing into a helper used above:

```js
    function drawDemand(s, x0, y0, w, hh) {
      var range = (data.peakMW - data.minMW) || 1, N = data.demand.length;
      s.save(); s.beginPath(); s.rect(x0, y0, w, hh); s.clip();
      s.beginPath();
      for (var i = 0; i < N; i++) { var x = i / (N - 1) * w, y = y0 + hh - ((data.demand[i] - data.minMW) / range) * hh; if (i === 0) s.moveTo(x, y); else s.lineTo(x, y); }
      s.lineTo(w, y0 + hh); s.lineTo(0, y0 + hh); s.closePath();
      s.fillStyle = U.hexA(U.cssVar('--accent'), .14); s.fill();
      s.beginPath();
      for (var j = 0; j < N; j++) { var x2 = j / (N - 1) * w, y2 = y0 + hh - ((data.demand[j] - data.minMW) / range) * hh; if (j === 0) s.moveTo(x2, y2); else s.lineTo(x2, y2); }
      s.strokeStyle = U.cssVar('--accent'); s.lineWidth = 1; s.stroke(); s.restore();
    }
```

- [ ] **Step 2: Add a tool selector to the transport row**

After `pill` is appended in the constructor, add a `<select>` for the E10 lane's tool:

```js
    var toolSel = el('select', 'tl-select');
    BAS.master.tools.forEach(function (t) { var o = el('option'); o.value = t.id; o.textContent = t.id; toolSel.appendChild(o); });
    toolSel.value = selTool;
    toolSel.addEventListener('change', function () { selTool = toolSel.value; staticW = -1; });
    bar.insertBefore(toolSel, spacer);
```

Wire it into the returned `setTool`:

```js
      setTool: function (id) { selTool = id; toolSel.value = id; staticW = -1; },
```

- [ ] **Step 3: Style the select**

In `styles/components.css`:

```css
.tl-select { background:var(--bg-3); color:var(--text-dim); border:1px solid var(--line-2); border-radius:4px;
  font-family:var(--mono); font-size:var(--fs-0); padding:1px 4px; }
```

- [ ] **Step 4: Browser QA — four lanes render and click targets exist**

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse.exe"
"$B" goto "file:///E:/repo/bas-ems/index.html"; "$B" wait --load
"$B" console --errors
"$B" js "({alarms: BAS.ui.timelineData.get().alarms.length, sel: document.querySelector('.tl-select').value})"
"$B" screenshot /tmp/tl-lanes.png
```
Expected: no console errors; alarms > 0; read `/tmp/tl-lanes.png` and confirm four stacked lanes (demand curve, alarm ticks, density heat, a colored E10 ribbon).

- [ ] **Step 5: Commit**

```bash
git add src/ui/timeline.js styles/components.css
git commit -m "feat(time): timeline lanes — alarms, density, E10 ribbon + tool selector"
```

---

## Task 7: replay — caption builder (pure) + clock integration

**Files:**
- Create: `src/app/replay.js`
- Test: `_timeline_test.mjs` (append)

- [ ] **Step 1: Write the failing test (caption builder is pure → headless-testable)**

Append to `_timeline_test.mjs` (before summary). Load replay first:

```js
load('src/app/replay.js');
const al = BAS.ui.timelineData.get().alarms[0];
const w = BAS.replay._window(al);
ok('replay window brackets the alarm', w.startT <= al.setT && w.endT >= al.clearT && w.endT > w.startT);
const caps = BAS.replay._captions(al);
ok('captions non-empty', caps.length >= 2, String(caps.length));
ok('captions sorted by t', caps.every((c, i) => i === 0 || c.t >= caps[i - 1].t));
ok('a caption mentions ALARM', caps.some(c => /ALARM|ALID/.test(c.text)));
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: FAIL — `replay.js` missing.

- [ ] **Step 3: Write `src/app/replay.js`**

```js
/* bas-ems — Incident Replay (drive the clock through an alarm's cause-chain)
 * Classic script -> window.BAS.replay
 * Caption builder reads BAS.sim.model (deterministic), not the live stream.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var P = BAS.clock.PERIOD, active = false, stripEl = null, caps = [], capIdx = 0;

  function fwd(a, b) { var d = b - a; return ((d % P) + P) % P; } // forward span a->b

  function _window(al) {
    var startT = al.setT - 8;                          // may be negative (kept linear)
    var dur = fwd(al.setT, al.clearT) + 13;            // 8s lead + span + 5s tail
    return { startT: startT, endT: startT + dur };
  }

  function _captions(al) {
    var model = BAS.sim.model, lo = ((al.setT - 8) % P + P) % P, hi = ((al.clearT + 5) % P + P) % P;
    function inWin(sec) { return lo <= hi ? (sec >= lo && sec <= hi) : (sec >= lo || sec <= hi); }
    var out = [];
    var ev = model.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.area !== al.area || !inWin(e.sec)) continue;
      if (e.type === 'ProcessJobStart') out.push({ t: e.sec, text: e.tool + ' Process Job Start' });
      else if (e.type === 'FDCExcursion') out.push({ t: e.sec, text: 'FDC excursion @ ' + e.tool });
      else if (e.type === 'SPCOutOfControl') out.push({ t: e.sec, text: 'SPC out-of-control @ ' + e.tool });
    }
    out.push({ t: al.setT, text: 'ALARM ' + al.alid + ' — ' + al.text + ' @ ' + al.tool });
    out.push({ t: al.clearT, text: 'Alarm cleared' });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function start(al) {
    if (active) stop();
    var w = _window(al); caps = _captions(al); capIdx = 0; active = true;
    ensureStrip(); stripEl.style.display = 'flex'; stripEl.textContent = 'Incident Replay — ALID ' + al.alid;
    if (BAS.ui._timelineHighlight) BAS.ui._timelineHighlight(al);
    BAS.clockSource.startReplay(w.startT, w.endT, 1.5, onTick, onEnd);
  }
  function onTick(t) {
    // advance captions whose time has passed (wrapped compare via forward distance is fine for short windows)
    while (capIdx < caps.length && nearOrPast(caps[capIdx].t, t)) { stripEl.textContent = caps[capIdx].text; capIdx++; }
  }
  function nearOrPast(capT, t) { return fwd(capT, t) < 1.0 || fwd(t, capT) > P - 1.0; }
  function onEnd() { stop(); }
  function stop() {
    active = false; if (stripEl) stripEl.style.display = 'none';
    if (BAS.ui._timelineHighlight) BAS.ui._timelineHighlight(null);
    if (BAS.clockSource.cancel) BAS.clockSource.cancel();   // exit replay -> live (no-op if already live)
  }
  function ensureStrip() {
    if (stripEl) return;
    stripEl = BAS.ui.el('div', 'replay-strip'); stripEl.style.display = 'none';
    document.body.appendChild(stripEl);
  }

  BAS.replay = { start: start, stop: stop, get active() { return active; }, _window: _window, _captions: _captions };
})(window.BAS);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /e/repo/bas-ems && bun _timeline_test.mjs`
Expected: PASS — window/captions assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/app/replay.js _timeline_test.mjs
git commit -m "feat(time): incident replay driver + caption builder"
```

---

## Task 8: wire replay into the timeline (click an alarm → replay) + highlight + reduced-motion

**Files:**
- Modify: `src/ui/timeline.js`, `styles/components.css`, `index.html`

- [ ] **Step 1: Alarm hit-test + click → replay**

In `src/ui/timeline.js`, add a helper that maps a click to an alarm span on lane 1, and call `BAS.replay.start` on hit. Add inside the factory:

```js
    function alarmAt(pxX, pxY) {
      var h = canvas._h, laneH = Math.floor((h - 4) / 4), y0 = 2 + 1 * laneH;
      if (pxY < y0 || pxY > y0 + laneH) return null;
      var t = xToT(pxX);
      for (var i = 0; i < data.alarms.length; i++) { var a = data.alarms[i]; if (t >= a.setT && t <= a.clearT) return a; }
      return null;
    }
```

Change the `mousedown` handler to prefer an alarm click over a scrub:

```js
    canvas.addEventListener('mousedown', function (e) {
      var r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var a = alarmAt(mx, my);
      if (a && BAS.replay) { BAS.replay.start(a); return; }
      dragging = true; CS.scrubTo(xToT(mx));
    });
```

- [ ] **Step 2: Expose a highlight hook for replay**

In `src/ui/timeline.js`, add a module-level highlight target and draw it; expose the setter the replay module calls:

```js
    var hi = null;            // highlighted alarm window {setT,clearT}
    BAS.ui._timelineHighlight = function (al) { hi = al; };
```

In `render(frame)`, after drawing the playhead, draw the highlight band if present:

```js
      if (hi) {
        var hx = tToX(hi.setT - 8 < 0 ? 0 : hi.setT - 8), hw = ((hi.clearT - hi.setT) + 13) / data.P * w;
        ctx.fillStyle = U.hexA(U.cssVar('--accent-2'), .12); ctx.fillRect(hx, 0, hw, h);
      }
```

- [ ] **Step 3: Caption-strip style + reduced-motion**

In `styles/components.css`:

```css
.replay-strip { position:fixed; left:50%; transform:translateX(-50%); bottom:118px; z-index:40;
  display:flex; align-items:center; gap:8px; max-width:70vw; padding:8px 14px;
  background:rgba(12,17,26,.94); border:1px solid var(--accent-2); border-radius:8px;
  font-family:var(--mono); font-size:var(--fs-2); color:var(--text); box-shadow:var(--shadow); }
@media (prefers-reduced-motion: reduce) { .replay-strip { transition:none; } }
```

- [ ] **Step 4: Include replay.js**

In `index.html`, add before `src/app/shell.js`:

```html
<script src="src/app/replay.js"></script>
```

- [ ] **Step 5: Browser QA — full feature**

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse.exe"
"$B" goto "file:///E:/repo/bas-ems/index.html"; "$B" wait --load
"$B" console --errors
# launch replay on the first alarm programmatically, confirm mode + caption strip
"$B" js "BAS.replay.start(BAS.ui.timelineData.get().alarms[0])"
"$B" js "({mode:BAS.clockSource.mode, active:BAS.replay.active, caption:document.querySelector('.replay-strip').textContent})"
"$B" screenshot /tmp/tl-replay.png
# end the replay (also auto-ends at the window's end after ~17s real time) and confirm it returns to live
"$B" js "BAS.replay.stop()"
"$B" js "({replayMode: BAS.clockSource.mode === 'replay', active: BAS.replay.active, live: BAS.clockSource.isLive()})"
```
Expected: no console errors; during replay `mode:'replay'`, `active:true`, the caption strip shows cause-chain text; the screenshot shows the highlighted alarm window on the timeline; after `stop()`, `replayMode:false`, `active:false`, `live:true`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/timeline.js styles/components.css index.html
git commit -m "feat(time): alarm-click incident replay + window highlight + caption strip"
```

---

## Task 9: final integration verification

**Files:** none (verification only)

- [ ] **Step 1: All headless tests green**

Run: `cd /e/repo/bas-ems && bun _selftest.mjs && bun _timeline_test.mjs`
Expected: `22 passed, 0 failed` (engine) and all timeline-logic assertions pass.

- [ ] **Step 2: Single-file build + presence assertion**

Run: `cd /e/repo/bas-ems && bun build-single.mjs`
Expected: `wrote bas-ems.html (...)` with no assertion throw (the 3 symbols are present).

- [ ] **Step 3: Full browser pass from the bundle**

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse.exe"
"$B" goto "file:///E:/repo/bas-ems/bas-ems.html"; "$B" wait --load
"$B" console --errors
# scrub, click an alarm, resume; click through a couple modules to confirm they rewind in sync
"$B" js "location.hash='#cooling'"; "$B" js "BAS.clockSource.scrubTo(60)"; "$B" screenshot /tmp/tl-cooling-scrub.png
"$B" js "BAS.clockSource.resume()"
```
Expected: zero console errors from the single-file bundle; the cooling module renders the t=60 state while scrubbed; returns to live on resume.

- [ ] **Step 4: Memory check (flat over a scrub/play session)**

```bash
"$B" js "performance.memory ? (performance.memory.usedJSHeapSize/1048576).toFixed(1)+' MB' : 'n/a'"
# scrub back and forth a few times, then re-check — should not climb materially
"$B" js "for(var i=0;i<20;i++){BAS.clockSource.scrubTo((i*9)%180);}"
"$B" js "performance.memory ? (performance.memory.usedJSHeapSize/1048576).toFixed(1)+' MB' : 'n/a'"
```
Expected: heap roughly flat (cached static lanes mean scrubbing allocates nothing per move).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(time): timeline cockpit complete (substrate + 4 lanes + incident replay)"
```

---

## Definition of Done
- `bun _selftest.mjs` → 22/22 (engine untouched); `bun _timeline_test.mjs` → all green.
- `bas-ems.html` opens from `file://` with zero console errors and the build presence-assertion passes.
- Dragging the playhead rewinds every module in sync; play/pause + `space`/`,`/`.` work.
- The four lanes render (demand, alarms, density, E10 ribbon) with a working tool selector.
- Clicking an alarm plays a captioned Incident Replay and returns to live.
- Heap stays flat across a scrub/play session.
