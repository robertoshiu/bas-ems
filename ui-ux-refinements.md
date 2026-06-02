# BAS-EMS UI/UX Refinements: Ticker Rhythm / Trends Labels / Schematic Fonts

## TL;DR

> **Quick Summary**: Three targeted polish fixes to bas-ems SCADA simulation: (1) refactor the shared event Ticker into a 3-tier rhythm with a bounded pause queue, (2) replace Canvas-text min/avg/max + X-axis labels on the Trends module with crisp HTML DOM overlays, (3) fix the schematic font cascade bug so UPW / Gas Yard / Cooling labels render in 8px sans-serif while values stay monospace.
>
> **Deliverables**:
> - Layered event ticker (AlarmSet 1/sec, ControlStateChange 4s/row, routine 6s/row) with pause-aware bounded queue (cap 64)
> - Trends chart labels as HTML `<span>` overlays synced via `ResizeObserver`
> - Schematic label class split (sans-serif labels, monospace values at 8px)
> - All existing headless tests still pass; Playwright screenshot evidence captured
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 3 independent feature streams in Wave 1
> **Critical Path**: Wave 1 (3 features) → Wave 2 (verification) → F1-F4

---

## Context

### Original Request
User reported 3 UI/UX issues in Traditional Chinese:
1. 所有 ticker 節奏有點快,要符合真實場景,包含各類趨勢圖
2. Trends/Historian 圖形底部指標數字太粗導致模糊
3. UPW Process Flow, Gas Yard 的流程圖字體過大也不美觀

### Interview Summary
**Key Discussions** (8 user decisions across 2 rounds):
- **Ticker**: 3-tier layered rhythm — AlarmSet throttled 1/sec, ControlStateChange 4s/row, routine 6s/row; entry animation .28s → .5s; pause bypass for tier-1 only; Production log synchronized (uses same shared `BAS.ui.Ticker`)
- **Alarm flood**: throttled to 1/sec (capped per second, not unlimited)
- **Production log**: synchronized with new tiered logic (uses same component)
- **Schematic flow animation**: NOT changed (keep current speed)
- **Pause interaction**: tier-1 bypasses pause, tier-2/3 enter bounded pending queue (cap 64, ring-buffer overflow), drain on mouseleave with tier cadence
- **Trends**: full DOM overlay (HTML spans for min/avg/max + X-axis, ResizeObserver sync, pointer-events: none, font-smoothing: antialiased)
- **Schematic**: Option C — `components.css:71 font-size: 10px → 8px` + add `.schematic .label { font-family: var(--sans); font-weight: 500 }` + `schematic.js:151` adds `class='label'` to label text
- **High accuracy mode**: enabled (Momus review loop)

**Research Findings**:
- Ticker shared component `BAS.ui.Ticker` at `src/ui/ticker.js:47`, used only by `src/app/shell.js:346` (Event Rail, 2/9 rowsPerSec) and `src/modules/production.js:33` (Production log, 1/3 rowsPerSec)
- Trends canvas at `src/modules/trends.js:228-248` (X-axis 9px @ 0.5 opacity, min/avg/max 10px @ 0.62/0.8 opacity); DPR handled at lines 137-144 and 322-332
- Schematic CSS override at `styles/components.css:71` (`font-size: 10px; font-family: var(--mono);`) overrides inline SVG `font-size` attributes, making `fontScale: 0.8` (passed in `upw.js:68`, `gas-exhaust.js:119`) a complete no-op
- NODE_W=54, NODE_H=22 in `schematic.js:25`
- Cooling module exists at `src/modules/cooling.js` and uses the same `U.Schematic()` — fixing the CSS affects UPW + Gas Yard + Cooling (3 modules)

### Metis Review
**Identified Gaps** (all addressed):
- ✅ Tier-1/2/3 explicit event-type mapping (enum in `ticker.js`)
- ✅ Alarm flood throttled to 1/sec (not unlimited, not 3+counter)
- ✅ Pause queue: bounded (cap 64), ring-buffer overflow, FIFO drain on mouseleave
- ✅ Production log: synchronized (uses same Ticker, inherits tier logic)
- ✅ Schematic flow animation: NOT touched (keep current speed)
- ✅ DOM overlay positioning: ResizeObserver, pointer-events: none
- ✅ DPR handling: Canvas already correct (lines 137-144), DOM via CSS natural path
- ✅ Color tokens: use existing `--text-dim` / `--text` for overlay
- ✅ Edge cases: empty data (skip overlay), label truncation (text-anchor middle, allow overflow)
- ✅ `prefers-reduced-motion`: 0s animation duration
- ✅ font-weight 500 fallback to 400 (system font usually lacks 500)
- ✅ `font-smoothing: antialiased` for crisp DOM text

### Oracle Phase 1
**Verdict**: GO (5/5 PASS) — pending queue mechanism explicitly specified after first NO-GO iteration.

---

## Work Objectives

### Core Objective
Polish 3 specific UI pain points in the SCADA simulation so the dashboard feels like a real fab operator console: realistic event pacing, crisp chart labels, and refined schematic typography.

### Concrete Deliverables
- Updated `src/ui/ticker.js` — `tierOf()` replaces `isHigh()`, pending queue, pause-bypass logic
- Updated `src/modules/trends.js` — HTML overlay layer, ResizeObserver, no Canvas text for axes/stats
- Updated `src/ui/schematic.js` — `class='label'` on label `<text>` elements (line ~151)
- Updated `styles/components.css` — schematic font-size 10→8, .label rule, ticker entry .28→.5s, trend overlay styles, prefers-reduced-motion
- (No `build-single.mjs` update needed — no new files)

### Definition of Done
- [ ] `bun _selftest.mjs` passes all 22 checks
- [ ] `bun _trends_test.mjs` passes (engine untouched)
- [ ] `bun _schematic_test.mjs` passes (SVG structure preserved)
- [ ] `bun _upw_test.mjs` passes (buildRows logic untouched)
- [ ] `bun _gas_test.mjs` passes (cabinet coupling untouched)
- [ ] Playwright screenshot of UPW / Gas Yard / Cooling modules shows refined typography
- [ ] Playwright measurement: Event Rail row cadence ≈ 6s ± 0.5s for routine events
- [ ] Visual: trend chart labels are crisp (no blur) on 1x DPR 1080p

### Must Have
- 3-tier rhythm with documented tier→event-type mapping
- Bounded pending queue (cap 64) with ring-buffer overflow during pause
- Tier-1 bypasses pause (alarm always shown when hover-paused)
- DOM overlay for Trends min/avg/max + X-axis (no Canvas text for these)
- Schematic labels in sans-serif, values in monospace
- Schematic font-size reduced from 10px to 8px
- All existing headless tests pass unchanged
- file:// safe, no new deps, no engine changes

### Must NOT Have (Guardrails)
- ❌ No modifications to `src/engine/*` (CONTRACT.md FROZEN)
- ❌ No changes to `frame` shape
- ❌ No `fetch`, ES modules, web fonts, `getImageData`, CDN links
- ❌ No per-frame allocation in hot paths (no `push`/`shift` on arrays in update)
- ❌ No new color tokens (use existing `--text`, `--text-dim`, `--mono`, `--sans`, `--fs-0..8`)
- ❌ No new event types in engine
- ❌ No schematic flow animation speed change
- ❌ No Sparkline, Demo Mode, Timeline Cockpit changes
- ❌ No new files (no `build-single.mjs` update needed)

### Spec Framework Integration
- **Detected Framework**: None (no `openspec/`, `.specify/`, or `_bmad/` directory)
- This is a pure code refactor against the existing frozen CONTRACT.md

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (5 headless bun tests)
- **Automated tests**: Existing tests must still pass (no new tests written — UI polish is verified via existing coverage + visual screenshots)
- **Framework**: `bun` for headless tests; `playwright` for visual verification
- **Test files unchanged**:
  - `_selftest.mjs` (22 engine checks)
  - `_trends_test.mjs` (engine load.sample)
  - `_schematic_test.mjs` (SVG structure + dashoffset)
  - `_upw_test.mjs` (buildRows badge classification)
  - `_gas_test.mjs` (cabinet production coupling)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.
- **Headless tests**: `bun _<name>_test.mjs` — must show all PASS lines
- **Visual**: Playwright screenshot of UPW / Gas Yard / Cooling modules → `.omo/evidence/task-N-module-screenshot.png`
- **Pace measurement**: Playwright script that counts Event Rail rows over 30s window → `.omo/evidence/task-N-ticker-pace.txt`
- **DOM overlay sync**: Playwright `page.setViewportSize()` resize test, screenshot before/after → `.omo/evidence/task-N-overlay-resize.png`
- **Schematic typography**: Playwright `page.evaluate()` to read computed style of `.schematic .label` element → `.omo/evidence/task-N-schematic-styles.txt`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (3 independent feature streams - all can run in parallel):
├── 1. Ticker Layered Rhythm [ticker.js + components.css entry anim + reduced-motion]
├── 2. Schematic Font Fix [schematic.js label class + components.css .schematic rules]
└── 3. Trends DOM Overlay [trends.js + components.css overlay styles]

Wave 2 (Verification - both can run in parallel after Wave 1):
├── 4. Run all 5 headless tests
└── 5. Playwright visual + pace + typography verification

Wave FINAL (4 parallel review agents - after ALL tasks):
├── F1. Plan compliance audit
├── F2. Code quality review
├── F3. Real manual QA
└── F4. Scope fidelity check
-> Present results -> Get explicit user okay

Critical Path: 1, 2, 3 (parallel) → 4, 5 (parallel) → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 4, 5 | 1 |
| 3 | — | 4, 5 | 1 |
| 4 | 1, 2, 3 | F1-F4 | 2 |
| 5 | 1, 2, 3 | F1-F4 | 2 |
| F1-F4 | 4, 5 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `unspecified-high`
  - T1 (ticker): single-file refactor with internal state changes
  - T2 (schematic): minimal — 1 class attribute + CSS rule
  - T3 (trends): DOM overlay infrastructure, ResizeObserver wiring
- **Wave 2**: 2 tasks — T4 `quick`, T5 `unspecified-high`
  - T4 (tests): run 5 bun test files, parse PASS/FAIL
  - T5 (visual): Playwright screenshots + pace measurement + style assertions
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> **FORMAT**: Task labels use bare numbers (`1.`, `2.`, ...) — NOT `T1.`, `Task 1.`, `Phase 1:`.
> Final Verification Wave uses `F1.`, `F2.`, etc.
> **A task WITHOUT QA Scenarios is INCOMPLETE.**

- [ ] 1. Ticker Layered Rhythm (`src/ui/ticker.js` + `styles/components.css`)

  **What to do**:
  - Replace `isHigh()` (line 45) with `tierOf(e)` returning 1, 2, or 3
  - Define tier configuration at top of `BAS.ui.Ticker`:
    ```js
    var TIER1 = { rate: 1, types: ['AlarmSet'] };                      // 1/sec
    var TIER2 = { rate: 1/4, types: ['ControlStateChange'] };          // 4s/row
    // TIER3 = default fallback, 6s/row, all other types
    ```
  - Add `lastTierMs = { 1: -1e9, 2: -1e9, 3: -1e9 }` to closure scope (zero allocation)
  - Add `pendingQueue` to closure (array, capacity 64, ring-buffer overflow)
  - Refactor `push()`:
    - When `paused === true`: route tier-1 to immediate `insertBefore`; route tier-2/3 to `pendingQueue` (push, trim to 64 with `length > 64 ? shift() : null` — actually use `if (pendingQueue.length >= 64) pendingQueue.shift()` then `push()`)
    - When `paused === false`: drain `pendingQueue` first by tier cadence, then process new events by tier cadence
    - Use `lastTierMs[tier]` to enforce per-tier min gap (`1000/TIER1.rate`, `4000`, `6000`)
  - Add `drainPending()` helper that iterates `pendingQueue` and applies tier-cadence rate limit
  - Update `rowEl()` to accept tier param so it can apply tier-specific class
  - Update `components.css`:
    - Line 109: change `animation: evtIn .28s ease;` → `animation: evtIn .5s ease;`
    - Add `@media (prefers-reduced-motion: reduce) { .evt.enter { animation-duration: 0s !important; } }` at the end of the .evt block
  - Do NOT change the `BAS.ui.Ticker` public API signature
  - Do NOT change `shell.js:346` or `production.js:33` (tier logic is project-wide default)

  **Must NOT do**:
  - Do not modify `frame` shape or any `src/engine/*` file
  - Do not change `isHigh()` external callers (it's internal to ticker.js)
  - Do not introduce `setTimeout` / `setInterval` (use closure state)
  - Do not allocate objects/arrays per frame in `push()` hot path
  - Do not change `BAS.ui.Ticker` signature (callers must remain source-compatible)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file refactor with closure-scope state additions; existing test coverage
  - **Skills**: []
    - No special skills needed; pure IIFE refactor

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5 (verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/ticker.js:47-116` — Current `BAS.ui.Ticker` constructor and `push()` method
  - `src/ui/ticker.js:56` — Current `minGapMs` calculation pattern to mirror per-tier
  - `src/ui/ticker.js:60-61` — Current pause-on-hover pattern (extend, don't replace)
  - `src/ui/ticker.js:82-113` — Current `push()` loop logic (refactor in place)
  - `src/ui/ticker.js:104-105` — Current tier-1 (AlarmSet) bypass path

  **API/Type References**:
  - `src/app/shell.js:346` — Caller passes `{ rateEl, maxRows, rowsPerSec: 2/9 }` — keep API
  - `src/modules/production.js:33` — Caller passes `{ showAll, maxRows, rowsPerSec: 1/3, rateEl }` — keep API

  **Test References**:
  - `_selftest.mjs` — engine 22 checks; no ticker UI test exists
  - `_schematic_test.mjs` — schematic SVG, not ticker

  **WHY Each Reference Matters**:
  - `ticker.js:56` (`minGapMs`): Pattern for computing per-tier min-gap; replicate as `tierMinGapMs = { 1: 1000, 2: 4000, 3: 6000 }`
  - `ticker.js:104-105` (bypass path): This is the current single-tier bypass; generalize to 3-tier
  - `shell.js:346` + `production.js:33`: Public API consumers — do not break their signature

  **Acceptance Criteria**:
  - [ ] `tierOf(e)` returns 1 for `AlarmSet`, 2 for `ControlStateChange`, 3 for everything else
  - [ ] Tier-1 events appear at most 1 per second (measured: send 5 AlarmSet in 1s, see exactly 1)
  - [ ] Tier-2 events appear at most 1 per 4 seconds
  - [ ] Tier-3 events appear at most 1 per 6 seconds
  - [ ] Tier-1 bypasses `paused` state (still shows when hover-paused)
  - [ ] Tier-2/3 enter `pendingQueue` when paused, drain on `mouseleave`
  - [ ] `pendingQueue` capacity is 64, overflows by `shift()` (ring-buffer style)
  - [ ] Entry animation is `.5s` (was `.28s`)
  - [ ] `prefers-reduced-motion: reduce` makes entry animation `0s`
  - [ ] `BAS.ui.Ticker` signature unchanged (shell.js + production.js require no changes)
  - [ ] Zero per-frame allocation in `push()` hot path

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tier-1 throttled to 1/sec (Playwright + live ticker)
    Tool: Playwright
    Preconditions: bas-ems.html opened in Playwright
    Steps:
      1. page.evaluate() injects a test harness: `window.__ticker = BAS.ui.Ticker` (already on window.BAS)
      2. page.evaluate() creates a div, attaches ticker, exposes on window
      3. page.evaluate(() => { for (let i = 0; i < 5; i++) { window.__ticker.push([{ type: 'AlarmSet', cls: 'alarm' }], { hms: '12:00:00' }); } })
      4. Assert page.locator('div .evt.cls-alarm').count() === 1
    Expected Result: Only 1 AlarmSet row appears despite 5 events
    Evidence: .omo/evidence/task-1-tier1-throttle.txt

  Scenario: Tier-3 at 6s/row cadence (Playwright + fake timers)
    Tool: Playwright
    Preconditions: Ticker attached to test div
    Steps:
      1. page.evaluate() monkeypatches `performance.now` to return t=0
      2. Push [{ type: 'LotStart', cls: 'lot' }] at fake t=0
      3. page.evaluate() advances `performance.now` to t=2000
      4. Push another LotStart → assert only 1 row in stream
      5. page.evaluate() advances to t=7000
      6. Push another LotStart → assert 2 rows in stream
    Expected Result: Second row appears at ≥6s gap
    Evidence: .omo/evidence/task-1-tier3-cadence.txt

  Scenario: Pause bypasses for tier-1 (Playwright)
    Tool: Playwright
    Preconditions: Ticker attached to test div
    Steps:
      1. page.evaluate() dispatches mouseenter on the div → paused=true
      2. page.evaluate() pushes [{ type: 'LotStart' }] then [{ type: 'AlarmSet' }]
      3. Assert div.querySelectorAll('.evt.cls-lot').length === 0
      4. Assert div.querySelectorAll('.evt.cls-alarm').length === 1
    Expected Result: AlarmSet shows during pause, LotStart queued
    Evidence: .omo/evidence/task-1-pause-bypass.txt

  Scenario: Pending queue drains on mouseleave (observable via DOM, not closure)
    Tool: Playwright
    Preconditions: bas-ems.html opened in Playwright, Event Rail visible
    Steps:
      1. page.evaluate() reads the BAS.ui.Ticker instance from the DOM (window scope)
      2. Set paused=true via dispatching mouseenter on the event stream element
      3. page.evaluate() pushes 3 simulated events to the ticker (use the ticker's own push() with synthetic event objects)
      4. Assert: stream.querySelectorAll('.evt.cls-lot').length === 0 (events queued, not rendered)
      5. Dispatch mouseleave on stream → paused=false
      6. page.evaluate() manually call ticker.push() once to trigger drainPending (drain is on next push, not on unpause itself)
      7. Assert: stream now has .evt.cls-lot rows (drained from queue)
    Expected Result: 0 rows during pause, ≥1 row after mouseleave + next push
    Evidence: .omo/evidence/task-1-queue-drain.png

  Scenario: Entry animation is .5s
    Tool: Bash (grep)
    Preconditions: components.css modified
    Steps:
      1. Search components.css for '.evt.enter'
      2. Assert it contains 'evtIn .5s'
    Expected Result: 0.5s animation duration
    Evidence: .omo/evidence/task-1-animation-duration.txt
  ```

  **Commit**: YES
  - Message: `feat(ticker): layered rhythm (tier-1 1/sec, tier-2 4s, tier-3 6s) with pause queue`
  - Files: `src/ui/ticker.js`, `styles/components.css`
  - Pre-commit: `bun _selftest.mjs` passes

- [ ] 2. Schematic Font Fix (`src/ui/schematic.js` + `styles/components.css`)

  **What to do**:
  - In `src/ui/schematic.js` around line 150-157, find the label `<text>` element creation
  - Add `class: 'label'` attribute to that text element (alongside existing attrs)
  - Verify the value `<text>` element (line 159-166) does NOT get the `label` class (only `val` class)
  - In `styles/components.css`:
    - Line 71: change `.schematic text { ... font-size: 10px; }` → `font-size: 8px;`
    - After line 72 (after `.schematic .val { fill: var(--text); }`): add `.schematic .label { font-family: var(--sans); font-weight: 500; }`
  - Verify visual result on UPW, Gas Yard, Cooling modules
  - Do NOT change NODE_W=54, NODE_H=22 (keep box dimensions)
  - Do NOT change label/value positions in schematic.js

  **Must NOT do**:
  - Do not change `schematic.js:25` (NODE_W, NODE_H constants)
  - Do not change pipe or flow rendering
  - Do not change value text (keep monospace, no label class)
  - Do not add new color tokens
  - Do not change `font-family: var(--mono)` fallback on line 74

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 1 attribute addition + 1 CSS rule change
  - **Skills**: []
    - No special skills needed; trivial change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5 (verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/schematic.js:25` — `NODE_W = 54, NODE_H = 22` constants (do not change)
  - `src/ui/schematic.js:150-157` — Label text creation (target for class addition)
  - `src/ui/schematic.js:159-166` — Value text creation (do not touch)
  - `styles/components.css:67-69` — Existing `.schematic .pipe / .flow / .node` rules
  - `styles/components.css:71-72` — Existing `.schematic text / .val` rules (modify font-size, add .label)

  **API/Type References**:
  - `src/modules/upw.js:54-68` — UPW module instantiates U.Schematic with `fontScale: 0.8`
  - `src/modules/gas-exhaust.js:116-121` — Gas Yard module instantiates U.Schematic with `fontScale: 0.8`
  - `src/modules/cooling.js:25+` — Cooling module instantiates U.Schematic (same pattern)

  **WHY Each Reference Matters**:
  - `schematic.js:150-157` is the EXACT location to add `class: 'label'` — single attribute change
  - `components.css:71-72` is where the override lives; the inline `font-size` attribute was being killed by the CSS rule
  - All 3 modules (UPW, Gas, Cooling) share the same `U.Schematic()`; one fix benefits all

  **Acceptance Criteria**:
  - [ ] Label `<text>` elements have `class="label"` attribute
  - [ ] Value `<text>` elements do NOT have `label` class
  - [ ] `components.css:71` reads `font-size: 8px;` (was 10px)
  - [ ] New CSS rule `.schematic .label { font-family: var(--sans); font-weight: 500; }` exists
  - [ ] UPW schematic labels render in sans-serif
  - [ ] Gas Yard schematic labels render in sans-serif
  - [ ] Cooling schematic labels render in sans-serif
  - [ ] Values in all 3 schematics still render in monospace
  - [ ] NODE_W=54, NODE_H=22 unchanged

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schematic label has class='label' (Playwright + live SVG)
    Tool: Playwright
    Preconditions: bas-ems.html opened, UPW module active
    Steps:
      1. Navigate to #upw, wait 800ms
      2. page.evaluate(() => {
           const labels = document.querySelectorAll('.schematic text.label');
           return Array.from(labels).slice(0, 3).map(l => l.textContent);
         })
      3. Assert returned array contains at least one non-empty string (e.g., 'Raw Water' or 'RO Unit')
    Expected Result: Labels exist with class='label' and have content
    Evidence: .omo/evidence/task-2-label-class.txt

  Scenario: Schematic value has class='val' but NOT 'label' (Playwright)
    Tool: Playwright
    Preconditions: UPW module active
    Steps:
      1. page.evaluate(() => {
           const vals = document.querySelectorAll('.schematic text.val');
           return Array.from(vals).slice(0, 3).map(v => ({
             classList: v.className.baseVal || v.getAttribute('class'),
             text: v.textContent
           }));
         })
      2. Assert each entry has 'val' in classList
      3. Assert no entry has 'label' in classList
    Expected Result: Values have 'val' only, no 'label'
    Evidence: .omo/evidence/task-2-value-no-label.txt

  Scenario: components.css .schematic text font-size is 8px
    Tool: Bash (grep)
    Preconditions: components.css modified
    Steps:
      1. grep -n '\.schematic text' styles/components.css
      2. Assert the matched line contains 'font-size: 8px'
    Expected Result: 8px font-size in CSS
    Evidence: .omo/evidence/task-2-css-fontsize.txt

  Scenario: .schematic .label rule exists in components.css
    Tool: Bash (grep)
    Preconditions: components.css modified
    Steps:
      1. grep -n '\.schematic \.label' styles/components.css
      2. Assert matched line contains 'font-family: var(--sans)'
    Expected Result: Label uses sans-serif
    Evidence: .omo/evidence/task-2-css-label-rule.txt

  Scenario: UPW schematic visual — labels in sans-serif
    Tool: Playwright
    Preconditions: bas-ems.html opened, UPW module active
    Steps:
      1. Navigate to #upw
      2. Wait 500ms for render
      3. page.evaluate(() => {
           const labels = document.querySelectorAll('.schematic text.label');
           return Array.from(labels).map(l => getComputedStyle(l).fontFamily);
         })
      4. Assert at least 1 label returns a sans-serif family
    Expected Result: Labels computed font-family contains 'Segoe UI' or system-ui (sans-serif)
    Evidence: .omo/evidence/task-2-upw-labels-sans.png
  ```

  **Commit**: YES
  - Message: `feat(schematic): sans-serif labels at 8px (fontScale override fix)`
  - Files: `src/ui/schematic.js`, `styles/components.css`
  - Pre-commit: `bun _schematic_test.mjs` passes

- [ ] 3. Trends DOM Overlay (`src/modules/trends.js` + `styles/components.css`)

  **What to do**:
  - In `src/modules/trends.js`, locate `drawStatic()` (line 135) and the X-axis + min/avg/max rendering (lines 228-248)
  - Remove the `ctx.fillText` calls for X-axis labels (line 228-235) and min/avg/max (line 238-248)
  - In `mount()`: after creating each chart canvas, create an overlay container with absolute positioning
  - Add HTML elements per chart (one set of overlays per chart):
    ```html
    <div class="trend-overlay" data-stat="min">min 432</div>
    <div class="trend-overlay" data-stat="avg">avg 446</div>
    <div class="trend-overlay" data-stat="max">max 461</div>
    <div class="trend-overlay x-axis" data-x="0">0m</div>
    <div class="trend-overlay x-axis" data-x="15">15m</div>
    <div class="trend-overlay x-axis" data-x="30">30m</div>
    <div class="trend-overlay x-axis" data-x="45">45m</div>
    <div class="trend-overlay x-axis" data-x="60">60m</div>
    ```
  - In `update()` or new `updateOverlays()`: write min/avg/max values to DOM (not Canvas)
  - Set up `ResizeObserver` on each chart container to sync overlay positions to canvas dimensions
  - Handle empty data: if `ch.vals.length === 0`, render "—" in overlays
  - Add to `styles/components.css`:
    ```css
    .trend-overlay { position: absolute; pointer-events: none;
      font-family: var(--mono); font-size: var(--fs-1); line-height: 1;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    .trend-overlay[data-stat="min"] { left: 6px; bottom: 6px; color: var(--text-dim); }
    .trend-overlay[data-stat="avg"] { left: 50%; transform: translateX(-50%); bottom: 6px; color: var(--text); }
    .trend-overlay[data-stat="max"] { right: 6px; bottom: 6px; color: var(--text-dim); }
    .trend-overlay.x-axis { bottom: 18px; color: var(--text-dim); }
    .trend-overlay.x-axis[data-x="0"]  { left: 6px; }
    .trend-overlay.x-axis[data-x="30"] { left: 50%; transform: translateX(-50%); }
    .trend-overlay.x-axis[data-x="60"] { right: 6px; }
    ```
  - Verify DPR: Canvas still uses `devicePixelRatio` (lines 137-144, 322-332); DOM overlay uses CSS
  - Zero per-frame allocation: create overlay elements once in `mount()`, update via `textContent`

  **Must NOT do**:
  - Do not remove setpoint band, peak line Canvas drawing
  - Do not change data calculation (`ch.min`, `ch.avg`, `ch.max`, `ch.vals`)
  - Do not change PAD_T, PAD_L, PAD_R
  - Do not introduce `getBoundingClientRect()` per frame
  - Do not add per-frame allocation in update path
  - Do not change canvas drawing order
  - Do not break existing ResizeObserver (if any)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: DOM overlay infrastructure, ResizeObserver wiring, DPR-aware positioning
  - **Skills**: []
    - No special skills needed; standard DOM API

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5 (verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/modules/trends.js:135-254` — Current `drawStatic()` (target for refactor)
  - `src/modules/trends.js:228-235` — X-axis label Canvas drawing (remove)
  - `src/modules/trends.js:238-248` — min/avg/max Canvas drawing (remove)
  - `src/modules/trends.js:137-144` — DPR handling for static layer (keep as-is)
  - `src/modules/trends.js:322-332` — DPR handling for live layer (keep as-is)
  - `src/modules/trends.js:146` — `PAD_T = 18, PAD_B = 34` (keep PAD_B)
  - `styles/components.css:212` — `canvas.trend-chart` style (do not change)

  **API/Type References**:
  - `ch.min`, `ch.avg`, `ch.max` — Pre-computed statistics; reuse as overlay values
  - `ch.vals` — Time-series data array; `length` check for empty data
  - `ch.offscreen` — Existing offscreen canvas (keep)
  - `xLabels = [0, 15, 30, 45, 60]` — X-axis label values (use for DOM overlay)

  **Test References**:
  - `_trends_test.mjs` — Engine-level load.sample validation; no UI test

  **WHY Each Reference Matters**:
  - `trends.js:228-248` are the EXACT lines to remove (Canvas text)
  - `trends.js:137-144` shows existing DPR pattern — DOM overlay doesn't need this; CSS handles it
  - `ch.min/avg/max` are pre-computed; no need to recompute for overlay
  - `xLabels = [0, 15, 30, 45, 60]` — same labels, just rendered as DOM

  **Acceptance Criteria**:
  - [ ] No `ctx.fillText` calls for X-axis or min/avg/max in `drawStatic()`
  - [ ] Each chart has 3 stat overlays (min, avg, max) + 5 X-axis overlays (0, 15, 30, 45, 60m)
  - [ ] Overlays use existing CSS variables (`--mono`, `--text-dim`, `--fs-1`)
  - [ ] Overlays have `pointer-events: none`
  - [ ] Overlays use `-webkit-font-smoothing: antialiased`
  - [ ] `ResizeObserver` syncs overlay positions to canvas dimensions
  - [ ] Empty data renders "—" in overlay (or hides overlay)
  - [ ] Setpoint band, peak line, curve all still drawn in Canvas
  - [ ] DPR handling unchanged (Canvas still scales by `devicePixelRatio`)
  - [ ] Zero per-frame allocation in update path (overlays created in `mount()`)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Trends overlay elements exist per chart
    Tool: Playwright
    Preconditions: bas-ems.html opened, Trends module active
    Steps:
      1. Navigate to #trends
      2. Wait 1s for render
      3. Assert document.querySelectorAll('.trend-chart').length === 5
      4. For first chart: assert .trend-overlay[data-stat="min"], [data-stat="avg"], [data-stat="max"] all exist
      5. Assert at least 3 .trend-overlay.x-axis elements
    Expected Result: All overlay elements present for every chart
    Evidence: .omo/evidence/task-3-overlay-elements.txt

  Scenario: Overlay values are independent of Canvas (Playwright + live DOM)
    Tool: Playwright
    Preconditions: bas-ems.html opened, Trends module active
    Steps:
      1. Navigate to #trends, wait 1500ms
      2. page.evaluate(() => {
           const charts = document.querySelectorAll('.trend-chart');
           if (!charts[0]) return null;
           const overlay = charts[0].parentElement.querySelector('.trend-overlay[data-stat="avg"]');
           return overlay ? overlay.textContent : null;
         })
      3. Assert returned text matches pattern /^avg [\d.]+$/ (e.g., "avg 446.12")
      4. Visually compare with screenshot of canvas to confirm same number
    Expected Result: Overlay text is well-formed and matches canvas visual
    Evidence: .omo/evidence/task-3-overlay-values.txt

  Scenario: ResizeObserver syncs overlay
    Tool: Playwright
    Preconditions: Trends module active
    Steps:
      1. Get first chart's overlay .x-axis[data-x="30"] bounding rect
      2. page.setViewportSize({ width: 1920, height: 1080 })
      3. Wait 200ms for ResizeObserver
      4. Get same overlay bounding rect
      5. Assert new x-coordinate is approximately at chart center
    Expected Result: Overlay position tracks canvas resize
    Evidence: .omo/evidence/task-3-overlay-resize.png

  Scenario: No Canvas text for min/avg/max
    Tool: Bash (grep)
    Preconditions: trends.js modified
    Steps:
      1. Search trends.js for 'fillText' (in drawStatic scope)
      2. Assert no occurrence in lines 220-260 (the min/avg/max area)
    Expected Result: No fillText calls for min/avg/max or X-axis
    Evidence: .omo/evidence/task-3-no-canvas-text.txt

  Scenario: Visual crispness — overlay at 1x and 2x DPR
    Tool: Playwright
    Preconditions: Trends module active
    Steps:
      1. Screenshot first chart at 1x DPR
      2. Screenshot first chart at devicePixelRatio=2
      3. Compare text clarity (visual)
    Expected Result: Text is crisp in both (DOM overlay, not Canvas)
    Evidence: .omo/evidence/task-3-dpi-crispness.png
  ```

  **Commit**: YES
  - Message: `feat(trends): HTML overlay for crisp min/avg/max + X-axis labels`
  - Files: `src/modules/trends.js`, `styles/components.css`
  - Pre-commit: `bun _trends_test.mjs` passes

- [ ] 4. Run All Headless Tests (Verification)

  **What to do**:
  - Run all 5 headless bun test files and verify they all pass
  - Capture full output to `.omo/evidence/task-4-test-results.txt`
  - If any test fails: identify which test, which assertion, and the offending code change
  - All 5 must show "PASS" or equivalent success indicator

  **Tests to run**:
  ```bash
  bun _selftest.mjs         # engine 22 checks
  bun _trends_test.mjs      # engine load.sample
  bun _schematic_test.mjs   # SVG structure + dashoffset
  bun _upw_test.mjs         # buildRows badge classification
  bun _gas_test.mjs         # cabinet production coupling
  ```

  **Must NOT do**:
  - Do not modify any test file
  - Do not skip tests or mark them as expected-to-fail
  - Do not run any test outside the 5 listed (no new tests in this work)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run 5 bun commands, parse output, report
  - **Skills**: []
    - No special skills needed; standard CLI

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 1, 2, 3 (Wave 1)

  **References**:

  **Pattern References**:
  - Each `_*_test.mjs` file is self-contained; runs with `bun <filename>`
  - Tests use `readFileSync` + `new Function()` to load engine files into a mock window
  - Tests assert PASS lines; non-zero exit code indicates failure

  **Test References**:
  - All 5 test files at the repo root

  **WHY Each Reference Matters**:
  - These are the project's only automated tests; passing them is a hard requirement
  - All 5 tests cover logic that Wave 1 changes might inadvertently affect
  - If any test fails, the implementing agent (or upstream task) must fix it before handoff

  **Acceptance Criteria**:
  - [ ] `bun _selftest.mjs` returns 0 exit code and shows 22 PASS lines
  - [ ] `bun _trends_test.mjs` returns 0 exit code and shows all PASS lines
  - [ ] `bun _schematic_test.mjs` returns 0 exit code and shows all PASS lines
  - [ ] `bun _upw_test.mjs` returns 0 exit code and shows all PASS lines
  - [ ] `bun _gas_test.mjs` returns 0 exit code and shows all PASS lines
  - [ ] Combined output saved to `.omo/evidence/task-4-test-results.txt`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 5 tests pass
    Tool: Bash (PowerShell)
    Preconditions: Wave 1 complete; all 3 source files modified
    Steps:
      1. cd E:\repo\bas-ems
      2. bun _selftest.mjs 2>&1 | Tee-Object -FilePath .omo/evidence/task-4-test-results.txt
      3. bun _trends_test.mjs 2>&1 | Tee-Object -Append .omo/evidence/task-4-test-results.txt
      4. bun _schematic_test.mjs 2>&1 | Tee-Object -Append .omo/evidence/task-4-test-results.txt
      5. bun _upw_test.mjs 2>&1 | Tee-Object -Append .omo/evidence/task-4-test-results.txt
      6. bun _gas_test.mjs 2>&1 | Tee-Object -Append .omo/evidence/task-4-test-results.txt
      7. Assert $LASTEXITCODE === 0 for all 5
    Expected Result: All 5 tests pass; combined file shows no FAIL lines
    Evidence: .omo/evidence/task-4-test-results.txt
  ```

  **Commit**: NO (verification only)

- [ ] 5. Playwright Visual + Pace + Typography Verification

  **What to do**:
  - Open `E:\repo\bas-ems\bas-ems.html` (or build it via `bun build-single.mjs` first) in Playwright
  - For each affected module (UPW, Gas Yard, Cooling, Trends, Production), navigate, wait for render, screenshot
  - Measure Event Rail ticker pace over 30 seconds
  - Read computed styles of schematic labels (verify sans-serif)
  - Read computed styles of trend overlay (verify font tokens)
  - Capture all evidence to `.omo/evidence/`

  **Sub-tasks**:
  1. Screenshot UPW module: `.omo/evidence/task-5-upw-schematic.png`
  2. Screenshot Gas Yard module: `.omo/evidence/task-5-gas-schematic.png`
  3. Screenshot Cooling module: `.omo/evidence/task-5-cooling-schematic.png`
  4. Screenshot Trends module: `.omo/evidence/task-5-trends-overlay.png`
  5. Screenshot Production module: `.omo/evidence/task-5-production-ticker.png`
  6. Measure Event Rail pace: count rows over 30s, save to `.omo/evidence/task-5-ticker-pace.txt`
  7. Read schematic .label computed font-family, save to `.omo/evidence/task-5-schematic-styles.txt`
  8. Read trend overlay computed font, save to `.omo/evidence/task-5-trend-styles.txt`
  9. Verify no console errors during navigation, save to `.omo/evidence/task-5-console.log`

  **Must NOT do**:
  - Do not modify any source file during verification
  - Do not skip screenshots (all 5 are required)
  - Do not modify the running bas-ems.html state

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step Playwright orchestration with evidence capture
  - **Skills**: []
    - Standard Playwright (built into opencode)

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 1, 2, 3 (Wave 1)

  **References**:

  **Pattern References**:
  - `bas-ems.html` — Single-file build at repo root (or build via `bun build-single.mjs`)
  - Hash-based routing: `#production`, `#cleanroom`, `#cooling`, `#upw`, `#gas-exhaust`, `#trends`

  **Test References**:
  - `_schematic_test.mjs` — Verifies SVG structure (Playwright should produce visually equivalent)
  - `_trends_test.mjs` — Verifies engine data (Playwright should produce visually equivalent)

  **WHY Each Reference Matters**:
  - `bas-ems.html` is the deployment artifact; visual verification must use it
  - Hash routing is how Playwright switches modules between screenshots
  - No DOM selectors are exposed for internal data, so screenshots + computed styles are the verification method

  **Acceptance Criteria**:
  - [ ] 5 module screenshots saved (UPW, Gas, Cooling, Trends, Production)
  - [ ] Ticker pace measurement saved with 30s row count
  - [ ] Schematic .label computed font-family is sans-serif
  - [ ] Trend overlay computed font uses existing tokens
  - [ ] No console errors during navigation
  - [ ] All 8 evidence files exist in `.omo/evidence/`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 5 module screenshots captured
    Tool: Playwright
    Preconditions: bas-ems.html opened in Playwright
    Steps:
      1. Navigate to file://E:\repo\bas-ems\bas-ems.html
      2. Wait 1s
      3. For each of [#production, #upw, #gas-exhaust, #cooling, #trends]:
         a. Set hash to module
         b. Wait 800ms
         c. Screenshot full page → .omo/evidence/task-5-{module}.png
      4. Assert all 5 screenshot files exist with size > 10KB
    Expected Result: 5 valid screenshots
    Evidence: .omo/evidence/task-5-{production,upw,gas-schematic,cooling-schematic,trends}.png

  Scenario: Ticker pace measured at ~6s/row
    Tool: Playwright
    Preconditions: bas-ems.html opened, Event Rail visible
    Steps:
      1. Clear Event Rail (navigate to fresh hash)
      2. Record t0 = Date.now()
      3. Wait 30s real time
      4. Count .evt rows in stream
      5. Save to .omo/evidence/task-5-ticker-pace.txt
      6. Assert 4-7 rows appeared (30s / 6s = 5 rows, ±1 tolerance)
    Expected Result: Routine ticker pace is ~6s/row
    Evidence: .omo/evidence/task-5-ticker-pace.txt

  Scenario: Schematic labels are sans-serif
    Tool: Playwright
    Preconditions: UPW module active
    Steps:
      1. Navigate to #upw
      2. Wait 800ms
      3. page.evaluate(() => {
           const labels = document.querySelectorAll('.schematic text.label');
           return Array.from(labels).slice(0, 3).map(l => ({
             text: l.textContent,
             fontFamily: getComputedStyle(l).fontFamily,
             fontSize: getComputedStyle(l).fontSize
           }));
         })
      4. Assert all 3 returned fontFamily contains 'Segoe UI' or 'system-ui' (sans-serif indicators)
      5. Assert fontSize is '8px' or close
    Expected Result: Labels are sans-serif 8px
    Evidence: .omo/evidence/task-5-schematic-styles.txt

  Scenario: Trend overlay has correct font tokens
    Tool: Playwright
    Preconditions: Trends module active
    Steps:
      1. Navigate to #trends
      2. Wait 800ms
      3. page.evaluate(() => {
           const ov = document.querySelector('.trend-overlay');
           if (!ov) return null;
           const s = getComputedStyle(ov);
           return {
             fontFamily: s.fontFamily,
             fontSize: s.fontSize,
             pointerEvents: s.pointerEvents
           };
         })
      4. Assert fontFamily contains 'monospace' (mono stack)
      5. Assert fontSize is 11px (--fs-1)
      6. Assert pointerEvents is 'none'
    Expected Result: Overlay uses --mono, 11px, no pointer events
    Evidence: .omo/evidence/task-5-trend-styles.txt

  Scenario: No console errors
    Tool: Playwright
    Preconditions: bas-ems.html opened
    Steps:
      1. Subscribe to console events
      2. Navigate through all 5 modules
      3. Assert no 'error' or 'exception' events fired
    Expected Result: Clean console
    Evidence: .omo/evidence/task-5-console.log
  ```

  **Commit**: NO (verification only)

---

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.omo/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun _selftest.mjs` + 4 other test files. Review all changed files for: `as any` / `@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify all 3 changes are minimal, surgical, and don't introduce new patterns.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Open `bas-ems.html`. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (e.g., ticker rhythm + schematic flow should look coherent in same screenshot). Test edge cases: rapid alarm flood, narrow viewport resize, high-DPR display. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify engine files unchanged.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(ticker): layered rhythm (tier-1 1/sec, tier-2 4s, tier-3 6s) with pause queue`
  - Files: `src/ui/ticker.js`, `styles/components.css`
- **2**: `feat(schematic): sans-serif labels at 8px (fontScale override fix)`
  - Files: `src/ui/schematic.js`, `styles/components.css`
- **3**: `feat(trends): HTML overlay for crisp min/avg/max + X-axis labels`
  - Files: `src/modules/trends.js`, `styles/components.css`
- **(No build-single.mjs commit — no new files added)**

---

## Success Criteria

### Verification Commands
```bash
bun _selftest.mjs          # Expected: 22 PASS lines, 0 FAIL
bun _trends_test.mjs       # Expected: all PASS
bun _schematic_test.mjs    # Expected: all PASS
bun _upw_test.mjs          # Expected: all PASS
bun _gas_test.mjs          # Expected: all PASS
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (engine untouched, no fetch/ESM/web fonts, no new color tokens)
- [ ] All 5 headless tests pass
- [ ] Playwright evidence files exist in `.omo/evidence/`
- [ ] Ticker pace measured at ~6s/row for routine events
- [ ] Trend labels are crisp (visual verification)
- [ ] Schematic labels are sans-serif 8px (computed style verification)

---

# GSTACK /autoplan REVIEW REPORT

> Auto-review pipeline run 2026-06-03 on branch `main` (commit `2d5a8aa`). Voices: Codex 0.135.0 (`-s read-only`) + independent Claude subagents, per phase. Decisions auto-made via the 6 principles; premises, user-challenges, and taste calls surfaced to the user at the final gate. **No source code was modified** — this is a plan review; implementation happens after approval.

## Scope detection
- **UI scope: YES** — ticker pacing, trend labels, schematic typography are all view/render concerns → CEO + **Design** + Eng phases ran.
- **DX scope: NO** — the product is an operator-facing SCADA *demo*, not a developer tool; the only "API" reference is the internal `BAS.ui.Ticker` signature (incidental). No public SDK/CLI/integration surface. Phase 3.5 (DX) skipped with reason.

## What already exists (sub-problem → existing code, leverage not rebuild)
- Event ticker shared component: `src/ui/ticker.js` `BAS.ui.Ticker` — already has pause-on-hover (`:60-61`), single-tier alarm bypass (`isHigh` `:45`/`:104`), per-frame display throttle (`minGapMs` `:56`), and throttled evt/s readout (`:93`). The plan *extends* this, doesn't rebuild.
- Per-module ticker speeds: just shipped in commit `3aa525d` — `shell.js:346` `rowsPerSec:2/9` (~4.5s rail), `production.js:33` `rowsPerSec:1/3` (~3s firehose, `showAll:true`).
- Trend DPR handling: already correct (`trends.js:137-144`, `322-332`) — confirms the blur is sub-pixel Canvas text, validating the DOM-overlay approach.
- Reduced-motion: already handled — `components.css:266` kills `.evt.enter` animation under `prefers-reduced-motion`.
- Schematic font no-op: premise **verified** — `.schematic text{font-size:10px}` (`components.css:71`, specificity 0,1,1) wins over the SVG `font-size` presentation attribute (specificity 0), so `fontScale:0.8` (`schematic.js:154,163`) is genuinely dead. CSS is the correct lever; fixes UPW + Gas + Cooling (cooling doesn't even pass `fontScale`).

## NOT in scope (deferred, with rationale)
- ~~Sparkline / 趨勢圖 scroll-speed retune~~ → **NOW IN SCOPE** per the final gate (user chose "Add sparkline retune"). See **Task 6** below. This relaxes guardrail line 105 ("No Sparkline changes") for the scroll-speed knob only.
- **Ticker cadence "demo mode" override** (CEO suggestion) — out of blast radius; defer.
- **Schematic long-label truncation / NODE_W widening** — plan forbids resizing the box; deferred (verify longest label fits at 8px instead).

---

## CEO DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Claude   Codex   Consensus
  ──────────────────────────────────── ──────── ─────── ──────────
  1. Premises valid?                    partial  partial DISAGREE → premise gate (sparkline scope)
  2. Right problem to solve?            partial  partial CONFIRMED (schematic = real win; ticker over-focused on mechanics)
  3. Scope calibration correct?         NO(High) NO(High) CONFIRMED (queue + verification = over-scoped for "Short")
  4. Alternatives explored?             NO(Med)  NO(Low)  CONFIRMED (drop-and-resume never priced)
  5. Competitive/market risk?           n/a      n/a      N/A (internal demo)
  6. 6-month trajectory sound?          risk(Med) risk(Low) CONFIRMED (cadence numbers are unvalidated guesses)
```

## DESIGN DUAL VOICES — LITMUS SCORECARD
```
  Dimension                            Claude   Codex   Consensus
  ──────────────────────────────────── ──────── ─────── ──────────
  1. Overlay info hierarchy / layout    collide  cramped CONFIRMED (min/avg/max + 5 ticks tight at 140px / col-4)
  2. Overlay positioning correct?       CRIT     High    CONFIRMED (no position:relative ancestor → overlays escape)
  3. Pacing feel (rail vs firehose)?    wrong    sleepy  CONFIRMED (production firehose must NOT drop to 6s)
  4. Peak-label consistency?            High     Med     CONFIRMED (1 Canvas label among crisp DOM on hero chart)
  5. Schematic typography legible?      clip risk marginal CONFIRMED (long labels at 8px in 54px box; weight 500 blurs on Win)
  6. Overlay font size (11px)?          too big  —        Claude-only (use --fs-0 10px; flagged regardless)
  7. Missing states?                    rm-dup   hover    Both (reduced-motion redundant / no value readout)
```

## ENG DUAL VOICES — CONSENSUS TABLE
```
  Dimension                            Claude   Codex   Consensus
  ──────────────────────────────────── ──────── ─────── ──────────
  1. Architecture sound?                regress  regress CONFIRMED (tier-3 hardcode reverts per-module rowsPerSec)
  2. Edge cases / overlays handled?     NO       NO      CONFIRMED (positioning bug, 15/45 unpositioned, dead empty-guard)
  3. Perf / zero-alloc real?            NO(High) NO(High) CONFIRMED (shift() O(n), "ring buffer" mislabeled, not zero-alloc)
  4. Queue UX (unpause)?                bug(High) bug(High) CONFIRMED (multi-minute stale-tail replay; drain not on mouseleave)
  5. Contract/API preserved?           clean    clean   CONFIRMED (no CONTRACT/engine violation; signature intact)
  6. Test coverage sufficient?          false-safety false-safety CONFIRMED (existing tests won't catch the regressions)
```

## Cross-phase themes (independent flags in ≥2 phases = high confidence)
- **Pending queue is over-engineered** — CEO (cut it), Design (least-visible surface), Eng (stale tail, not zero-alloc). 3/3 phases. **Highest-confidence signal in the review.**
- **Tier-3 / production-firehose cadence** — CEO (#5 don't synchronize), Design (firehose ≠ metronome), Eng (dead `rowsPerSec`, reverts shipped commit). 3/3 phases.
- **Overlay positioning + ResizeObserver complexity** — Design (critical wrapper bug), Eng (critical wrapper bug + unneeded observer), CEO (overbuilt). 3/3 phases.

## Failure modes & test-gap registry
| # | Failure mode | Sev | Caught by existing tests? | Mitigation |
|---|---|---|---|---|
| 1 | Overlays position against `.app`/viewport (no relative ancestor) | CRIT | No (engine/DOM-structure tests only) | Add `.trend-chart-wrap{position:relative}` + Playwright bounding-rect assert |
| 2 | Production firehose silently slows 3s→6s (rowsPerSec dead) | HIGH | No (no ticker cadence test) | Tier-3 inherits `rowsPerSec`; Playwright per-caller cadence assert |
| 3 | Unpause replays a multi-minute stale tail | HIGH | No | Simplify queue (drain-all / drop-and-resume); assert no stale rows post-unpause |
| 4 | x-axis 15m/45m collapse to left:0 | MED | No | Position all 5 (or render 3) |
| 5 | Dead empty-data guard gives false "edge handled" confidence | MED | No | `if(!built)` guard; drop from acceptance evidence |
| 6 | Long schematic labels clip at 8px in 54px box | MED | `_schematic_test` checks structure, not width | Verify longest label; abbreviate if needed |

---

## Decision Audit Trail
| # | Phase | Decision | Class | Principle | Rationale | Rejected |
|---|-------|----------|-------|-----------|-----------|----------|
| 1 | Eng | Wrap each canvas in `.trend-chart-wrap{position:relative}`; append overlays there | Mechanical | P5 | Absolute overlays need a positioned ancestor; `.panel-b` has none → they escape (3/3 phases) | Leave overlays in `.panel-b` (ships broken) |
| 2 | Eng | Position `data-x="15"`/`"45"` (`left:25%/75%`+translateX) or render only 0/30/60 | Mechanical | P1 | Plan emits 5 ticks, CSS positions 3 | Two mispositioned labels |
| 3 | Eng | Replace dead `ch.vals.length===0` guard with `if(!built)` | Mechanical | P5 | `Float64Array(240)` is never length 0 | Keep dead guard |
| 4 | Eng | Drop ResizeObserver; rely on CSS % in the relative wrapper | Mechanical | P5,P3 | CSS % auto-tracks width; canvas already self-heals DPR each frame | 5 observers (gold-plating) |
| 5 | Eng | Drop the new `prefers-reduced-motion` rule | Mechanical | P4 (DRY) | `components.css:266` already kills `.evt.enter` under reduced-motion | Duplicate reduced-motion logic |
| 6 | Eng | Omit the `rowEl()` tier-class param | Mechanical | P5 | No CSS consumes a tier class | Unused param |
| 7 | Schematic | Accept Task 2 as written; note values also go 10→8px; verify longest label fits | Mechanical | P1 | Premise verified (CSS specificity); strongest item | Reject the sound fix |
| 8 | Design | Trend overlay font → `--fs-0` (10px) + `--text-dim`/`--text-mut` | **Taste** | P1 | User complaint was "too thick/blurry"; 11px regrows them; crispness comes from DOM not size | 11px (louder than prior tuning) |
| 9 | Design | Move `peak NN` to a DOM overlay too | **Taste** | P1 | Leaving 1 Canvas label among crisp DOM = visible inconsistency on hero chart | Canvas peak orphan |
| 10 | Design | Keep AlarmSet tier-1 at 1/sec; ensure it bypasses pause; note burst-drop trade | **Taste** | P6 | User explicitly chose 1/sec; only 1 voice objected (not both) | Remove throttle |
| 11 | Eng/CEO | Tier-3 routine cadence inherits caller `rowsPerSec`; only tier-1(1s)/tier-2(4s) fixed | **User Challenge** | P2,P5 | Hardcoding 6s reverts the per-module commit, guts the firehose, deads `rowsPerSec` | (user decides) |
| 12 | CEO/Eng | Simplify the pending queue (drain-all-on-unpause, or drop-and-resume-live) | **User Challenge** | P5,P3 | Stale multi-minute tail; not zero-alloc; least-visible surface; both CEO voices say cut | (user decides) |
| 13 | CEO | Keep `.omo` verification but right-size; non-blocking | Mechanical | P6 | Heavy but harmless; outside code blast radius | Expand verification |

---

## Final Gate Decisions (user-confirmed 2026-06-03)
1. **Sparkline scope** → *Add sparkline retune* (overrode the "keep out of scope" recommendation). → new **Task 6**.
2. **Pause queue** (Challenge #12) → *Cut queue, resume live*. Delete the pending-queue entirely; while paused keep tier-1 alarms visible, drop tier-2/3, resume the live stream on `mouseleave`.
3. **Routine pace** (Challenge #11) → *Inherit per-caller `rowsPerSec`*. Tier-3 gap = existing `1000/rowsPerSec` (rail ~4.5s, production firehose ~3s); only tier-1 (1s) and tier-2 (4s) are fixed.
4. **Trend labels** → *Apply both*. Overlays at `--fs-0` (10px); move `peak NN` to a DOM overlay too.

These four supersede the ⚑ markers below. All other deltas are auto-decided (see Decision Audit Trail).

## Revised task specs (deltas to fold in — decisions locked per the gate above)

### Task 1 — Ticker (revised)
- `tierOf(e)`: 1=`AlarmSet`, 2=`ControlStateChange`, 3=else. ✔ as planned.
- `tierMinGapMs = { 1: 1000, 2: 4000, 3: <caller> }` where **tier-3 = the existing `minGapMs` (`1000/rowsPerSec`)** ⚑ (Challenge #11) — preserves rail ~4.5s / production firehose ~3s, only layers alarm-1s + state-4s on top. (If you pick global 6s, set `tierMinGapMs[3]=6000` and accept the firehose slowdown.)
- Tier-1 (`AlarmSet`): always shown, **bypasses pause**, capped 1/sec (audit #10).
- Pause handling ⚑ (Challenge #12): recommend **drop tier-2/3 while paused, resume live on mouseleave** (delete pending queue), OR if a queue is required, drain the *whole* bounded queue in one frame on `mouseleave` (no tier-cadence stale tail; drain in the `mouseleave` handler, not the next `push`).
- Entry animation `.28s → .5s` (`components.css:109`). ✔ **Drop** the new reduced-motion rule (audit #5). **Omit** the `rowEl` tier param (audit #6).
- Public `BAS.ui.Ticker` signature unchanged; `rowsPerSec` stays meaningful (add an inline comment that it drives tier-3).

### Task 2 — Schematic (accept as written)
- `class:'label'` on label `<text>` (`schematic.js:150-157`); `components.css:71` `10px→8px`; add `.schematic .label{font-family:var(--sans);font-weight:500}`. ✔
- **Note**: values also shrink 10→8px (intended). **Verify** longest label ("Polish Loop", "Acid Scrubber") fits at 8px in the 54px box; consider `font-weight:400` if 500 looks fuzzy on Windows (audit #7, design).

### Task 3 — Trends overlay (revised)
- **Wrap each canvas in `.trend-chart-wrap{position:relative;height:140px}`; append overlays into the wrapper** (audit #1, fixes the critical escape bug).
- Remove Canvas `fillText` for X-axis (`trends.js:227-236`) and min/avg/max (`238-248`). **Also move `peak NN` (`:187`) to a DOM overlay** ⚑→recommended (audit #9).
- Overlay font **`--fs-0` (10px)** + `--text-dim`/`--text-mut` ⚑→recommended (audit #8), `pointer-events:none`, mono, `-webkit-font-smoothing:antialiased`.
- Position **all five** x-axis ticks (add `[data-x="15"]{left:25%}` `[data-x="45"]{left:75%}` with `translateX(-50%)`) — or render only 0/30/60 (audit #2).
- **Drop ResizeObserver** (audit #4); CSS % tracks resize. Replace empty-guard with `if(!built)` (audit #3). min/avg/max are static → write once at mount, not per-frame.

### Task 6 — Sparkline pacing retune (NEW, added at the gate)
- **What**: slow the sparklines still scrolling at the fast default. Mechanism: `widgets.js:41` `var slow = opts.slow || 3` (records 1 of every `slow` pushes). The modules on the default-3 are `cooling.js:162,169` (CHW load/power), `gas-exhaust.js:353` (exhaust), `upw.js:145,146` (flow/resistivity). Already-calm modules override it: cleanroom `15`, energy `9`, sustainability `9`.
- **Recommended fix (surgical, DRY)**: raise the shared default `opts.slow || 3` → `opts.slow || 6` in `widgets.js:41`. One line; slows exactly the 5 default-using sparklines ~2× (cooling/gas/upw) and leaves the explicitly-tuned modules untouched. **`6` is a starting value — eyeball-tune in the running loop (6–9 range); cadence numbers need a visual sign-off, not just a unit check** (CEO finding #5).
- **Alternative**: set `slow: 6` explicitly at each of the 5 call sites (matches the per-module convention, more visible, 5 edits vs 1). Either is acceptable; the one-line default is recommended.
- **Must NOT**: change `widgets.js` push/render hot-path logic, the ring-buffer indices, or any module's *data*; only the `slow` cadence. No engine touch. (Note `production.js` hero canvas is `LiveFab`, not a Sparkline — not affected.)
- **Acceptance**: cooling/gas/upw sparklines visibly scroll slower; cleanroom/energy/sustainability unchanged; `bun _selftest.mjs` + module tests still pass; visual sign-off on feel.
- **Files**: `src/ui/widgets.js` (or the 5 call sites). **Commit**: `feat(spark): calmer default sparkline scroll (slow 3→6)`.

## Review scores
- **CEO**: APPROVE WITH CONCERNS — schematic strong; ticker over-scoped (queue now cut); one premise gap (now resolved → Task 6).
- **Design**: must-fix C1(positioning), font-size, peak-label, firehose before build.
- **Eng**: Task 2 clean; Tasks 1 & 3 need the deltas above; no CONTRACT/engine violation, no test breakage.
- **Guardrails**: ✔ no engine/`frame` change, no fetch/ESM/web-fonts, no new color tokens, file://-safe.

<!-- END /autoplan REVIEW REPORT -->

## GSTACK REVIEW REPORT
Plan reviewed by /autoplan (CEO + Design + Eng dual voices: Codex 0.135.0 + independent Claude subagents). Status: **APPROVED with decisions** (2026-06-03). All gate items resolved — see "Final Gate Decisions" and Decision Audit Trail above. Final scope: Task 1 (ticker, queue cut + per-caller pace), Task 2 (schematic, as written), Task 3 (trends overlay, revised), Task 6 (sparkline retune). Verification: 5 headless bun tests + Playwright visual/pace/typography. No engine/CONTRACT changes; file://-safe; no new tokens. Ready to implement.
