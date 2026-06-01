# UI/UX & Functional Enhancements for bas-ems

## TL;DR

> **Quick Summary**: Enhance the existing bas-ems SCADA simulation with SVG system schematics, interactive canvas tooltips, keyboard navigation, alarm management, event filtering, and domain-accuracy improvements — all within the frozen engine contract and file:// constraints.
> 
> **Deliverables**:
> - SVG schematics for Cooling, UPW, and Gas modules
> - Interactive living-fab canvas with hover tooltips
> - Keyboard navigation (arrow keys, number keys)
> - Expandable alarm banner with history and cross-module navigation
> - Event stream filtering by type/area/severity
> - UPW near-spec excursions for realism
> - Header KPI mini-sparklines
> - Loop progress indicator
> - ARIA accessibility labels
> - Gas cabinet production coupling
> - Favicon, data export, module info strips
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (SVG schematic utility) → Tasks 2-4 (three schematics) → Task 15 (integration testing)

---

## Context

### Original Request
User asked to review the design plan (quito-unknown-design-20260531-222725.md) against existing implementation and identify UI/UX and functional improvements. After a full codebase read of all 30+ source files, 20 improvement items were identified.

### Interview Summary
**Key Discussions**:
- All 8 modules are implemented and working
- Engine is complete and frozen (CONTRACT.md)
- Design plan explicitly calls for SVG schematics that were never built
- Living-fab canvas is decorative only (no interactivity)
- No keyboard navigation, no ARIA, no alarm history

**Research Findings**:
- `schematic.js` listed in design architecture but never created
- CSS already has `.schematic .pipe/.flow/.node/.val` classes ready
- `U.svg()` and `U.SVGNS` helpers exist in util.js
- Canvas-2D hit-testing is feasible via coordinate math against layout.bays
- Frame contract cannot change — all new features derive from existing frame fields

### Metis Review
**Identified Gaps** (addressed):
- CONTRACT.md is frozen — engine files cannot be modified
- SVG schematics need responsive handling and performance throttling
- Canvas tooltips need geometric hit-testing (no getImageData under file://)
- Alarm history must use ring buffer to prevent memory growth
- build-single.mjs must be updated when adding new source files

### Oracle Phase 1
**Verdict**: GO (4/5 pass, Check 2 conditional on priority assignment)
- Priorities assigned: P0 (credibility), P1 (UX), P2 (polish), P3 (code quality)
- Scope OUT defined: WebGL hero, backend, real data, mobile layout deferred

---

## Work Objectives

### Core Objective
Enhance the bas-ems SCADA simulation to be more convincing for domain experts and more usable for demo presentations, while respecting the frozen engine contract and file:// constraints.

### Concrete Deliverables
- `src/ui/schematic.js` — reusable SVG schematic renderer with animated flow lines
- Updated `src/modules/cooling.js` — chiller plant P&ID schematic
- Updated `src/modules/upw.js` — UPW process flow schematic + near-spec excursions
- Updated `src/modules/gas-exhaust.js` — gas yard schematic + production coupling
- Updated `src/ui/livefab.js` — hover tooltips on bays and facility nodes
- Updated `src/app/shell.js` — keyboard nav, alarm expansion, loop progress, header sparklines
- Updated `src/ui/ticker.js` — event stream filtering
- Updated `styles/components.css` — new component styles
- Updated `styles/layout.css` — loop progress bar, tooltip styles
- Updated `index.html` — favicon, new script includes
- Updated `build-single.mjs` — include new files

### Definition of Done
- [ ] `bun _selftest.mjs` passes all 22 checks (engine unchanged)
- [ ] `bas-ems.html` opens from file:// in Chrome with zero console errors
- [ ] All 8 modules render with correct data
- [ ] SVG schematics animate with production-driven flow lines
- [ ] Living-fab canvas shows tooltips on hover
- [ ] Arrow keys switch modules, number keys 1-8 jump to modules
- [ ] Alarm banner expands on click, shows all active alarms
- [ ] Event stream has filter buttons for type and severity
- [ ] UPW quality table shows warn/bad badges when values approach spec limits
- [ ] Header KPIs have mini-sparklines
- [ ] Loop progress bar shows position in 180s cycle
- [ ] Interactive elements have ARIA labels

### Must Have
- SVG schematics for Cooling, UPW, and Gas modules (design spec requirement)
- Living-fab canvas interactivity (tooltips)
- Keyboard navigation
- Alarm banner expansion
- UPW near-spec excursions
- Event stream filtering
- All features file:// safe (no fetch, no ES modules, no getImageData)
- All features loop-identical (deterministic on frame.tick)
- No per-frame allocations in hot paths
- 60fps performance maintained

### Must NOT Have (Guardrails)
- No modifications to any file in `src/engine/` — engine is frozen
- No changes to the `frame` shape returned by `BAS.sim.frame(t)`
- No `fetch`, ES modules, web fonts, `getImageData`, or network requests
- No npm dependencies or CDN links
- No per-frame allocations in hot paths (ring buffers, not push/shift)
- No WebGL (deferred to roadmap per design plan)
- No responsive mobile layout (SCADA is desktop-only)
- No backend integration or real data connectivity
- No vendor logos or trademarks
- No "PUE" terminology (use facility/process overhead ratio)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (engine self-test)
- **Automated tests**: None for UI (agent-executed QA)
- **Framework**: `_selftest.mjs` for engine, Playwright/manual for UI
- **Verification**: Each task has QA scenarios executable by the implementing agent

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **Canvas/SVG**: Use Bash (node/bun REPL) — Import, call functions, compare output
- **Keyboard**: Use Playwright — Send keypresses, assert navigation state
- **file://**: Open bas-ems.html, verify no console errors, no network requests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1:  SVG schematic utility module [quick]
├── Task 2:  Living-fab canvas hover tooltips [unspecified-high]
├── Task 3:  Keyboard navigation [quick]
├── Task 4:  Loop progress indicator [quick]
├── Task 5:  Favicon + index.html cleanup [quick]
└── Task 6:  ARIA accessibility labels [quick]

Wave 2 (Core Features — after Wave 1):
├── Task 7:  Cooling module chiller plant schematic (depends: 1) [visual-engineering]
├── Task 8:  UPW module process flow schematic + excursions (depends: 1) [visual-engineering]
├── Task 9:  Gas module gas yard schematic + coupling (depends: 1) [visual-engineering]
├── Task 10: Alarm banner expansion + history (depends: 6) [unspecified-high]
├── Task 11: Event stream filtering [quick]
└── Task 12: Header KPI mini-sparklines [quick]

Wave 3 (Integration + Polish — after Wave 2):
├── Task 13: Cross-module alarm-to-navigate (depends: 10) [unspecified-high]
├── Task 14: Sustainability targets from sim state [quick]
├── Task 15: Equipment registry optimization [quick]
├── Task 16: Data snapshot/export [quick]
├── Task 17: Module info strips [quick]
└── Task 18: Responsive improvements (1080px+) [visual-engineering]

Wave 4 (Final Verification — after ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Tasks 7-9 → Task 15 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 7, 8, 9 | 1 |
| 2 | — | — | 1 |
| 3 | — | — | 1 |
| 4 | — | — | 1 |
| 5 | — | — | 1 |
| 6 | — | 10 | 1 |
| 7 | 1 | — | 2 |
| 8 | 1 | — | 2 |
| 9 | 1 | — | 2 |
| 10 | 6 | 13 | 2 |
| 11 | — | — | 2 |
| 12 | — | — | 2 |
| 13 | 10 | — | 3 |
| 14 | — | — | 3 |
| 15 | — | — | 3 |
| 16 | — | — | 3 |
| 17 | — | — | 3 |
| 18 | — | — | 3 |
| F1-F4 | ALL | — | 4 |

### Agent Dispatch Summary

- **Wave 1**: 6 tasks — T1 `quick`, T2 `unspecified-high`, T3 `quick`, T4 `quick`, T5 `quick`, T6 `quick`
- **Wave 2**: 6 tasks — T7 `visual-engineering`, T8 `visual-engineering`, T9 `visual-engineering`, T10 `unspecified-high`, T11 `quick`, T12 `quick`
- **Wave 3**: 6 tasks — T13 `unspecified-high`, T14 `quick`, T15 `quick`, T16 `quick`, T17 `quick`, T18 `visual-engineering`
- **Wave 4**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> ### Post-Cockpit Reconciliation (2026-06-01)
> This plan predates the now-shipped **Timeline Cockpit** (bottom scrub/replay time-machine:
> `clock-source.js`, `timeline-data.js`, `timeline.js`, `replay.js`). Reconciled before execution:
> - **CORE BUILD SET (this pass):** Tasks **1, 2, 3, 6, 7, 8, 9, 10** — the expert-convincing core
>   (SVG P&ID schematics + UPW excursions + livefab tooltips + keyboard nav + ARIA + alarm expansion).
> - **Task 4 (Loop Progress Indicator) — ⛔ DROPPED.** Superseded by the cockpit's playhead + 180 s
>   lane strip, which already shows loop position, richer. Do NOT build.
> - **Task 3 (Keyboard Nav):** `shell.js` ALREADY has a keydown handler binding Space / `,` / `.` to
>   the cockpit transport — coexist, do not clobber (see Task 3 Must-NOT-do).
> - **Deferred (not this pass):** T5 favicon (optional), T11 filtering, T12 sparklines, T13
>   alarm-navigate (reconcile alarm-click vs cockpit replay first), T14 sustainability, T15–18 tail,
>   T19 Trends (must REUSE `BAS.ui.timelineData`, never re-sample `frame()`), T20 Demo (must showcase scrub/replay).

- [ ] 1. Create SVG Schematic Utility Module (`src/ui/schematic.js`)

  **What to do**:
  - Create `src/ui/schematic.js` as a classic IIFE on `window.BAS`
  - Implement `U.Schematic(container, opts)` — a reusable SVG schematic renderer
  - Support animated flow lines using SVG `stroke-dashoffset` driven by `frame.load` channels
  - Support node boxes (equipment) with live value labels from `frame`
  - Support pipe connections between nodes with flow direction arrows
  - Use the existing CSS classes: `.schematic .pipe`, `.schematic .flow`, `.schematic .node`, `.schematic .val`
  - Use `U.svg(tag, attrs)` and `U.SVGNS` from util.js for SVG element creation
  - Implement `update(frame)` method that updates flow animation speed and node values
  - Throttle SVG attribute updates to every 4th frame (`fc % 4`) for performance
  - Pre-compute SVG element references in closure (no per-frame DOM queries)
  - Add to `index.html` before modules but after widgets.js
  - Update `build-single.mjs` to include the new file

  **Must NOT do**:
  - Do not use `getImageData` or any pixel readback
  - Do not use ES modules or fetch
  - Do not create per-frame allocations (reuse closure vars)
  - Do not modify any engine files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation following established patterns
  - **Skills**: []
    - No special skills needed — uses existing U.svg() helpers

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 8, 9 (all schematics depend on this)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/util.js:84-89` — `U.svg(tag, attrs)` and `U.SVGNS` helpers for SVG element creation
  - `src/ui/widgets.js:87-124` — `U.gauge(opts)` pattern: SVG creation, closure-scope refs, `set(v)` method
  - `src/ui/widgets.js:31-78` — `U.Sparkline(canvas, opts)` ring buffer pattern for time-series data

  **API/Type References**:
  - `styles/components.css:65-73` — `.schematic .pipe`, `.schematic .flow`, `.schematic .node`, `.schematic .val` CSS classes already defined
  - `CONTRACT.md:88-100` — `BAS.ui` API surface that new utilities must conform to

  **WHY Each Reference Matters**:
  - `util.js:84-89`: These are the ONLY SVG helpers you should use — they handle namespace correctly
  - `widgets.js:87-124`: The gauge is the closest existing SVG widget — copy its pattern for closure-scope refs and update method
  - `components.css:65-73`: These CSS classes are already styled — use them instead of creating new ones

  **Acceptance Criteria**:
  - [ ] `U.Schematic(container, opts)` creates an SVG element with configurable nodes and pipes
  - [ ] Flow animation speed is proportional to the connected `frame.load` channel value
  - [ ] Node labels display live values updated from `frame` data
  - [ ] Zero heap allocations in the `update()` hot path (closure-scope reuse only)
  - [ ] SVG uses existing `.schematic .pipe/.flow/.node/.val` CSS classes from `components.css`
  - [ ] `build-single.mjs` updated to include `src/ui/schematic.js`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schematic renders SVG with nodes and pipes
    Tool: Bash (bun/node REPL)
    Preconditions: index.html loads schematic.js after widgets.js
    Steps:
      1. Load engine files into a mock window object (same pattern as _selftest.mjs)
      2. Create a container div
      3. Call BAS.ui.Schematic(container, { nodes: [{id:'A',label:'Node A',x:50,y:50},{id:'B',label:'Node B',x:200,y:50}], pipes: [{from:'A',to:'B',channel:'chwRT'}] })
      4. Verify container.querySelector('svg') exists
      5. Verify container.querySelectorAll('.node').length === 2
      6. Verify container.querySelectorAll('.pipe, .flow').length >= 1
    Expected Result: SVG element exists with 2 node groups and at least 1 pipe/flow path
    Evidence: .omo/evidence/task-1-svg-basic.svg

  Scenario: Schematic updates flow animation from frame data
    Tool: Bash (bun/node REPL)
    Preconditions: Schematic created with a pipe connected to 'chwRT' channel
    Steps:
      1. Create schematic with nodes A→B, pipe channel 'chwRT'
      2. Call schematic.update({ load: { chwRT: 5000 }, tick: 100 })
      3. Verify the flow path's stroke-dashoffset attribute changed from initial value
      4. Call schematic.update({ load: { chwRT: 10000 }, tick: 200 })
      5. Verify stroke-dashoffset changed again (different animation speed)
    Expected Result: Flow animation speed varies with load channel value
    Evidence: .omo/evidence/task-1-flow-animation.txt

  Scenario: No per-frame allocations in update path
    Tool: Bash (grep)
    Preconditions: schematic.js exists
    Steps:
      1. Search schematic.js for 'new ' inside the update function scope
      2. Search for 'createElement' inside update function scope
      3. Search for '.push(' inside update function scope
    Expected Result: Zero matches for allocation patterns in update path
    Evidence: .omo/evidence/task-1-no-alloc.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(ui): add reusable SVG schematic utility module`
  - Files: `src/ui/schematic.js`, `index.html`, `build-single.mjs`

- [ ] 2. Living-Fab Canvas Hover Tooltips

  **What to do**:
  - Add `mousemove` event listener to the living-fab canvas in `livefab.js`
  - Implement geometric hit-testing against `layout.bays[]` and `layout.nodes[]` arrays (already computed in closure)
  - On hit: create/show a tooltip DOM element (absolute-positioned div) with:
    - Bay: name, area ID, active/total tools (from `frame.areaStates`), process load kW (from `frame.load.areaKW`)
    - Facility node: label, current value with unit
  - On miss/leave: hide tooltip
  - Store tooltip element in closure (create once in first update, reuse)
  - Use `pointer-events: none` on tooltip to prevent hover interference
  - Style tooltip with existing SCADA dark theme (use `--bg-2`, `--line-2`, `--text`, `--mono`)
  - Add CSS for `.livefab-tooltip` in `components.css`

  **Must NOT do**:
  - Do not use `getImageData` for hit-testing (use coordinate math only)
  - Do not create tooltip elements on every mousemove (reuse closure ref)
  - Do not add click-to-navigate (hover tooltips only in this task)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Canvas coordinate math + DOM tooltip management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ui/livefab.js:41-56` — `computeLayout(w, h)` returns `{nodes, bays, busY, w, h}` — use these for hit-testing
  - `src/ui/livefab.js:147-182` — Bay rendering loop shows exactly where bays are drawn (x, y, w, h)
  - `src/ui/livefab.js:126-142` — Node rendering shows facility node positions
  - `src/ui/ticker.js:61-62` — Pause-on-hover pattern (mouseenter/mouseleave)

  **API/Type References**:
  - `CONTRACT.md:56-57` — `frame.areaStates` shape: `{ Productive, Standby, Engineering, ..., total }`
  - `CONTRACT.md:39` — `frame.load.areaKW` shape: `{ LITHO, ETCH, DIFF, ... }`

  **WHY Each Reference Matters**:
  - `livefab.js:41-56`: The layout object has all the coordinates you need — don't recompute
  - `livefab.js:147-182`: Shows exact drawing positions so hit-test coordinates match visual positions
  - `ticker.js:61-62`: Copy this exact pattern for mouseenter/mouseleave on the canvas

  **Acceptance Criteria**:
  - [ ] Hovering over a bay shows tooltip with bay name, area ID, active/total tools, and process load kW
  - [ ] Hovering over a facility node shows tooltip with label and current value
  - [ ] Tooltip disappears when mouse leaves the canvas
  - [ ] No tooltip appears when hovering over empty canvas areas
  - [ ] Tooltip uses SCADA dark theme styling (existing CSS variables)
  - [ ] Tooltip uses `pointer-events: none` to prevent hover interference

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tooltip appears when hovering over a bay
    Tool: Playwright
    Preconditions: Production module is active, canvas is visible
    Steps:
      1. Navigate to #production
      2. Wait for canvas to render (500ms)
      3. Move mouse to coordinates where the first bay is drawn (approximate center of first bay)
      4. Wait 100ms for tooltip to appear
      5. Assert tooltip element exists with class 'livefab-tooltip'
      6. Assert tooltip text contains bay name and area ID
      7. Assert tooltip text contains 'kW' (process load)
    Expected Result: Tooltip visible with bay name, area, active/total, and kW reading
    Failure Indicators: No tooltip element, empty text, wrong position
    Evidence: .omo/evidence/task-2-bay-tooltip.png

  Scenario: Tooltip disappears when mouse leaves canvas
    Tool: Playwright
    Preconditions: Tooltip is visible from previous hover
    Steps:
      1. Hover over a bay to show tooltip
      2. Move mouse outside the canvas element
      3. Wait 100ms
      4. Assert tooltip has display:none or is removed from DOM
    Expected Result: Tooltip hidden
    Evidence: .omo/evidence/task-2-tooltip-hidden.png

  Scenario: No tooltip on empty canvas area
    Tool: Playwright
    Preconditions: Canvas is visible
    Steps:
      1. Move mouse to a gap between bays (e.g., top-left corner with no bay)
      2. Wait 100ms
      3. Assert no tooltip visible OR tooltip has display:none
    Expected Result: No tooltip shown for non-interactive areas
    Evidence: .omo/evidence/task-2-no-tooltip.png
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(ui): add hover tooltips to living-fab canvas`
  - Files: `src/ui/livefab.js`, `styles/components.css`

- [ ] 3. Keyboard Navigation

  **What to do**:
  - Add `keydown` event listener in `shell.js` (in the `build` function)
  - Left/Right arrow keys: switch to previous/next module in nav order
  - Number keys 1-8: jump to module by index (1=Production, 2=Cleanroom, etc.)
  - Escape: return to Production (hero module)
  - Update `location.hash` to trigger existing routing
  - Add `role="tab"` to nav items, `role="tabpanel"` to content area
  - Add `aria-current="page"` to active nav item (update in `activate()`)

  **Must NOT do**:
  - Do not add keyboard shortcuts that conflict with browser defaults (Ctrl+, Alt+)
  - Do not add focus trapping (keep it simple)
  - **Do not bind Space, `,` (comma), or `.` (period).** `shell.js` ALREADY has a keydown handler
    (in `build`) binding those to the Timeline Cockpit transport (`BAS.clockSource.togglePlay` /
    `step(-1)` / `step(+1)`). EXTEND that existing handler (preferred) — or add a second listener —
    for Left/Right arrows, digits 1-8, and Escape only. Preserve its `input|textarea|button` target
    guard. Do NOT remove, replace, or override the existing transport bindings.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change with straightforward event handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/shell.js:77-79` — Hash routing: `window.addEventListener('hashchange', onHash)` and `activate(initial)`
  - `src/app/shell.js:82-98` — `buildNav(nav)` creates nav items with `dataset.id` and click handlers
  - `src/app/shell.js:103-116` — `activate(id)` handles module switching and active class toggling

  **WHY Each Reference Matters**:
  - `shell.js:77-79`: Keyboard nav should set `location.hash` which triggers the existing `onHash` handler — don't duplicate routing logic
  - `shell.js:82-98`: Nav items have `dataset.id` — use this for module ordering, not DOM text content
  - `shell.js:103-116`: The `activate()` function already handles all the state management — just trigger it via hash change

  **Acceptance Criteria**:
  - [ ] Left/Right arrow keys switch to previous/next module in nav order
  - [ ] Number keys 1-8 jump to corresponding module by index
  - [ ] Escape key returns to Production module
  - [ ] Nav items have `role="tab"` and `aria-selected` updates on activation
  - [ ] Content area has `role="tabpanel"`
  - [ ] Keyboard navigation uses existing hash-based routing (no duplicate logic)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Right arrow switches to next module
    Tool: Playwright
    Preconditions: App loaded, Production module active
    Steps:
      1. Navigate to #production
      2. Press ArrowRight key
      3. Assert location.hash changes to next module ID
      4. Assert corresponding nav item has class 'active'
    Expected Result: Module switches to Cleanroom (next in nav order)
    Evidence: .omo/evidence/task-3-arrow-right.png

  Scenario: Number key jumps to specific module
    Tool: Playwright
    Preconditions: App loaded, any module active
    Steps:
      1. Press key '5' (should map to Gas & Exhaust, 5th module)
      2. Assert location.hash changes to 'gas-exhaust'
      3. Assert Gas & Exhaust nav item has class 'active'
    Expected Result: Module switches to Gas & Exhaust
    Evidence: .omo/evidence/task-3-number-key.png

  Scenario: Escape returns to Production
    Tool: Playwright
    Preconditions: App loaded, Cleanroom module active
    Steps:
      1. Navigate to #cleanroom
      2. Press Escape key
      3. Assert location.hash changes to 'production'
    Expected Result: Module switches to Production
    Evidence: .omo/evidence/task-3-escape.png
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(shell): add keyboard navigation (arrow keys, number keys, Escape)`
  - Files: `src/app/shell.js`

- [ ] 4. Loop Progress Indicator — ⛔ DROPPED (superseded by Timeline Cockpit playhead + 180s strip; do NOT build)

  **What to do**:
  - Add a thin progress bar below the clock in the topbar
  - Drive width from `frame.sim.progress` (0..1, already in the frame contract)
  - Use CSS `transition: width 0.1s linear` for smooth updates
  - Style: thin (3px), accent color, positioned at bottom of topbar
  - Add `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
  - Update in `shell.js` `update()` function alongside the clock update

  **Must NOT do**:
  - Do not add percentage text (the bar is enough)
  - Do not add a separate panel (keep it in the topbar)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single DOM element + one line in update()
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/shell.js:43-46` — Clock element: `var clock = el('div', 'clock'); clock.innerHTML = '...'`
  - `src/app/shell.js:119-126` — `update()` function: `refs.clock.textContent = frame.sim.hms;`
  - `styles/layout.css:22-27` — Topbar layout: `display: flex; align-items: center; height: 50px; border-bottom: 1px solid var(--line-2)`

  **API/Type References**:
  - `CONTRACT.md:30` — `frame.sim.progress` is 0..1, already available

  **WHY Each Reference Matters**:
  - `shell.js:43-46`: The clock is in the topbar — add the progress bar right after it
  - `shell.js:119-126`: The update function already reads `frame.sim` — add one line for progress
  - `layout.css:22-27`: The topbar has `position: relative` — use absolute positioning for the bar at the bottom edge

  **Acceptance Criteria**:
  - [ ] Thin progress bar visible at bottom of topbar
  - [ ] Bar width driven by `frame.sim.progress` (0..1)
  - [ ] Bar wraps smoothly from 100% to 0% at loop boundary
  - [ ] Bar has `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
  - [ ] Bar styled with accent color, 3px height, CSS transition for smoothness

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Progress bar shows loop position
    Tool: Playwright
    Preconditions: App loaded and running
    Steps:
      1. Wait for simulation to run 2 seconds
      2. Find element with role="progressbar" in topbar
      3. Assert element exists
      4. Assert style.width is between 0% and 100%
      5. Assert aria-valuenow attribute is set
    Expected Result: Progress bar exists with width reflecting loop position
    Evidence: .omo/evidence/task-4-progress-bar.png

  Scenario: Progress bar wraps at loop boundary
    Tool: Playwright
    Preconditions: App loaded
    Steps:
      1. Note current progress bar width
      2. Wait for loop to complete (may need to fast-forward via BAS.sim.reset())
      3. Assert progress bar width returns to near-0% without visible jump
    Expected Result: Smooth wrap from 100% to 0%
    Evidence: .omo/evidence/task-4-progress-wrap.png
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(shell): add loop progress indicator in topbar`
  - Files: `src/app/shell.js`, `styles/layout.css`

- [ ] 5. Favicon + index.html Cleanup

  **What to do**:
  - Add a simple SVG favicon inline in `index.html` `<head>`:
    ```html
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23080b11'/><circle cx='16' cy='16' r='8' fill='none' stroke='%2325e0cf' stroke-width='2'/><circle cx='16' cy='16' r='3' fill='%2325e0cf'/></svg>" />
    ```
  - This matches the app's accent color (#25e0cf) and dark background (#080b11)
  - Verify the favicon renders in Chrome

  **Must NOT do**:
  - Do not add external favicon files (keep it inline for file:// compatibility)
  - Do not add any other meta tags unless strictly necessary

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line addition to HTML
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `index.html:1-11` — Current `<head>` section — add favicon after the description meta tag

  **WHY Each Reference Matters**:
  - The favicon must use a data: URI to work from file:// (no external file fetch)

  **Acceptance Criteria**:
  - [ ] `<link rel="icon">` exists in `index.html` `<head>`
  - [ ] Favicon uses `data:image/svg+xml` URI (file:// compatible)
  - [ ] SVG matches app accent color (#25e0cf) and dark background (#080b11)
  - [ ] Favicon renders in Chrome browser tab

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Favicon renders in browser tab
    Tool: Playwright
    Preconditions: App loaded from file:// or static server
    Steps:
      1. Navigate to index.html
      2. Assert document.querySelector('link[rel="icon"]') exists
      3. Assert the href attribute starts with 'data:image/svg+xml'
    Expected Result: Favicon link element exists with inline SVG data URI
    Evidence: .omo/evidence/task-5-favicon.png
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(html): add inline SVG favicon for file:// compatibility`
  - Files: `index.html`

- [ ] 6. ARIA Accessibility Labels

  **What to do**:
  - In `shell.js`:
    - Add `role="tablist"` to nav rail
    - Add `role="tab"` and `aria-selected` to each nav item (update in `activate()`)
    - Add `role="tabpanel"` to content area
    - Add `aria-live="polite"` to event stream
    - Add `role="alert"` to alarm banner
    - Add `aria-label` to clock element
  - In `livefab.js`:
    - Add `aria-label="Living fab visualization showing production events driving facility load"` to canvas
  - In `widgets.js`:
    - Add `aria-valuemin`, `aria-valuemax`, `aria-valuenow` to gauge SVGs
  - In `ticker.js`:
    - Add `aria-live="polite"` to stream element (already done? verify)

  **Must NOT do**:
  - Do not add tabindex to non-interactive elements
  - Do not add focus management beyond what keyboard nav (Task 3) provides

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding attributes to existing DOM elements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Task 10 (alarm banner expansion uses role="alert")
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/shell.js:56-73` — Nav rail and content area DOM structure
  - `src/app/shell.js:49-53` — Alarm banner DOM
  - `src/ui/widgets.js:94-124` — Gauge SVG structure
  - `src/ui/livefab.js:28` — Canvas element creation

  **WHY Each Reference Matters**:
  - These are the exact DOM elements that need ARIA attributes — read them to understand the structure before adding attributes

  **Acceptance Criteria**:
  - [ ] Nav rail has `role="tablist"`, nav items have `role="tab"` and `aria-selected`
  - [ ] Content area has `role="tabpanel"`
  - [ ] Event stream has `aria-live="polite"`
  - [ ] Alarm banner has `role="alert"`
  - [ ] Clock has `aria-label`
  - [ ] Canvas has descriptive `aria-label`
  - [ ] Gauge SVGs have `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Nav items have correct ARIA roles
    Tool: Bash (grep)
    Preconditions: shell.js modified
    Steps:
      1. Search shell.js for 'role="tablist"'
      2. Search shell.js for 'role="tab"'
      3. Search shell.js for 'aria-selected'
    Expected Result: All three patterns found
    Evidence: .omo/evidence/task-6-aria-nav.txt

  Scenario: Alarm banner has alert role
    Tool: Bash (grep)
    Preconditions: shell.js modified
    Steps:
      1. Search shell.js for 'role="alert"'
    Expected Result: Found on alarm banner element
    Evidence: .omo/evidence/task-6-aria-alarm.txt

  Scenario: Gauge has value attributes
    Tool: Bash (grep)
    Preconditions: widgets.js modified
    Steps:
      1. Search widgets.js for 'aria-valuenow'
      2. Search widgets.js for 'aria-valuemin'
    Expected Result: Both found in gauge set() method
    Evidence: .omo/evidence/task-6-aria-gauge.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(a11y): add ARIA labels to interactive elements`
  - Files: `src/app/shell.js`, `src/ui/livefab.js`, `src/ui/widgets.js`

- [ ] 7. Cooling Module — Chiller Plant P&ID Schematic

  **What to do**:
  - Add an SVG schematic panel to the cooling module showing a chiller plant P&ID
  - Layout: 2-3 chiller nodes → common header → cooling tower nodes → return
  - Use `U.Schematic(container, opts)` from Task 1
  - Nodes: CHLR-01..03 (chillers), CT-01..03 (cooling towers), CHW Header, CW Header
  - Pipes: CHLR→CHW Header (chilled water), CHW Header→Process Load, CT→CW Header (condenser water)
  - Animate flow lines driven by `frame.load.chwKW` and `frame.load.chwRT`
  - Show live values on nodes: tonnage (RT), supply/return temps, kW
  - Place as a new panel at the top of the cooling module (col-12)
  - Keep existing tables below the schematic

  **Must NOT do**:
  - Do not remove existing chiller/PCW/CT tables (keep them below the schematic)
  - Do not modify engine files

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG schematic layout with visual design considerations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9)
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 1 (SVG schematic utility)

  **References**:

  **Pattern References**:
  - `src/modules/cooling.js:24-116` — Current cooling module mount function — add schematic panel BEFORE the existing KPI/table grid
  - `src/modules/cooling.js:118-198` — Update function — add schematic.update(frame) call
  - `src/ui/livefab.js:126-142` — Facility node rendering pattern (rounded rect + label + value)

  **API/Type References**:
  - `CONTRACT.md:34-38` — `frame.load` channels: `chwKW`, `chwRT`, `pcwRT`
  - `src/engine/master-data.js:80-84` — `M.facility.chillers` and `M.facility.coolingTowers` arrays

  **WHY Each Reference Matters**:
  - `cooling.js:24-116`: Shows exact DOM structure — insert schematic panel at the top of the grid
  - `cooling.js:118-198`: Shows where to call `schematic.update(frame)` — alongside existing sparkline updates
  - `master-data.js:80-84`: Equipment names and IDs for node labels

  **Acceptance Criteria**:
  - [ ] SVG schematic visible at top of Cooling module (col-12 panel)
  - [ ] Chiller nodes (CHLR-01..03) and cooling tower nodes (CT-01..03) rendered
  - [ ] Flow lines animate driven by `frame.load.chwKW` and `frame.load.chwRT`
  - [ ] Live values (RT, temps, kW) displayed on nodes
  - [ ] Existing chiller/PCW/CT tables preserved below schematic
  - [ ] SVG uses `viewBox` for responsive scaling

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Chiller plant schematic renders with equipment nodes
    Tool: Playwright
    Preconditions: Cooling module active
    Steps:
      1. Navigate to #cooling
      2. Wait 500ms for render
      3. Assert SVG element with class 'schematic' exists in the module
      4. Assert SVG contains text elements with chiller names (e.g., 'CHLR-01')
      5. Assert SVG contains text elements with cooling tower names (e.g., 'CT-01')
      6. Assert flow path elements exist (class 'flow')
    Expected Result: Schematic visible with chiller and CT nodes connected by flow paths
    Evidence: .omo/evidence/task-7-chiller-schematic.png

  Scenario: Flow animation responds to cooling load
    Tool: Playwright
    Preconditions: Cooling module active, schematic visible
    Steps:
      1. Note current stroke-dashoffset on a flow path
      2. Wait 2 seconds (load will change due to simulation)
      3. Assert stroke-dashoffset has changed (animation is running)
    Expected Result: Flow lines animate continuously
    Evidence: .omo/evidence/task-7-flow-animation.png
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(cooling): add chiller plant P&ID schematic with animated flow`
  - Files: `src/modules/cooling.js`

- [ ] 8. UPW Module — Process Flow Schematic + Near-Spec Excursions

  **What to do**:
  - Add an SVG schematic showing UPW process flow: Raw Water → RO → EDI → Polish Loop → Point-of-Use
  - Use `U.Schematic(container, opts)` from Task 1
  - Animate flow lines driven by `frame.load.upwFlow`
  - Show live values: resistivity (MΩ·cm), TOC (ppb), flow (m³/h)
  - **Near-spec excursions**: Modify the quality table build to show warn/bad badges when values approach limits:
    - Resistivity: warn below 18.15, bad below 18.10 (target 18.20)
    - TOC: warn above 0.8 ppb, bad above 1.0 ppb (spec < 1)
    - Particles: warn above 70/100, bad above 85/100 (spec < 100)
  - Use `U.band(value, warnAt, badAt, invert)` for threshold coloring
  - Keep existing gauge and train panels

  **Must NOT do**:
  - Do not add alarm events to `frame.alarms` (visual-only excursions)
  - Do not modify engine files
  - Do not change the UPW resistivity/TOC values (they're already correct from the engine)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG schematic + threshold logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 9)
  - **Parallel Group**: Wave 2 (with Tasks 7, 9, 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 1 (SVG schematic utility)

  **References**:

  **Pattern References**:
  - `src/modules/upw.js:17-101` — Current UPW module mount — add schematic panel
  - `src/modules/upw.js:172-189` — `buildRows()` function — modify for near-spec badges
  - `src/modules/upw.js:167-169` — `badge()` helper — reuse for excursion badges
  - `src/modules/cleanroom.js:146-153` — Particle count threshold pattern (near-limit coloring)

  **API/Type References**:
  - `CONTRACT.md:49-50` — `frame.kpis.upwResistivity` (~18.2) and `frame.kpis.upwTOC` (ppb)
  - `CONTRACT.md:36` — `frame.load.upwFlow` (m³/h)

  **WHY Each Reference Matters**:
  - `upw.js:172-189`: This is where quality table rows are built — modify the badge logic here
  - `cleanroom.js:146-153`: Shows how particle counts approach ISO limits with warn/bad coloring — copy this pattern for UPW
  - `CONTRACT.md:49-50`: These are the exact values to threshold against

  **Acceptance Criteria**:
  - [ ] SVG schematic shows UPW process flow: Raw Water → RO → EDI → Polish Loop → Point-of-Use
  - [ ] Flow lines animate driven by `frame.load.upwFlow`
  - [ ] Quality table shows warn badges when resistivity drops below 18.15 or TOC exceeds 0.8 ppb
  - [ ] Quality table shows bad badges when resistivity drops below 18.10 or TOC exceeds 1.0 ppb
  - [ ] Particle count shows warn above 70/100, bad above 85/100
  - [ ] Near-spec excursions are visual-only (no engine changes, no alarm injection)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: UPW schematic renders with process flow
    Tool: Playwright
    Preconditions: UPW module active
    Steps:
      1. Navigate to #upw
      2. Assert SVG schematic exists
      3. Assert nodes for RO, EDI, Polish Loop visible
      4. Assert flow paths animate with upwFlow
    Expected Result: Schematic shows water treatment process with animated flow
    Evidence: .omo/evidence/task-8-upw-schematic.png

  Scenario: Quality table shows warn badge for near-spec resistivity
    Tool: Bash (node REPL)
    Preconditions: UPW module loaded, buildRows function accessible
    Steps:
      1. Simulate frame with upwResistivity = 18.14 (below 18.15 warn threshold)
      2. Call buildRows(frame, 18.14, 0.5)
      3. Assert Resistivity row badge contains 'warn' class
    Expected Result: Warn badge appears for near-spec resistivity
    Evidence: .omo/evidence/task-8-resistivity-warn.txt

  Scenario: Quality table shows bad badge for high TOC
    Tool: Bash (node REPL)
    Preconditions: UPW module loaded
    Steps:
      1. Simulate frame with upwTOC = 1.1 (above 1.0 bad threshold)
      2. Call buildRows(frame, 18.2, 1.1)
      3. Assert TOC row badge contains 'bad' class
    Expected Result: Bad badge appears for out-of-spec TOC
    Evidence: .omo/evidence/task-8-toc-bad.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(upw): add process flow schematic and near-spec excursion badges`
  - Files: `src/modules/upw.js`

- [ ] 9. Gas Module — Gas Yard Schematic + Production Coupling

  **What to do**:
  - Add an SVG schematic showing gas yard layout: Bulk storage → Headers → Distribution → Point-of-Use
  - Use `U.Schematic(container, opts)` from Task 1
  - Nodes: N2 Tank, O2 Tank, Ar Tank, H2 Tank, Main Headers, Scrubbers, Thermal Oxidizers
  - Animate flow lines driven by `frame.load.n2Flow` and exhaust headers
  - Show live values: header pressure (bar), flow (Nm³/h), tank level (%)
  - **Production coupling**: Modify gas cabinet states to reflect production activity:
    - When Etch area has high productive fraction → SiH4, Cl2, NF3 cabinets show Online more often
    - When Diff area is busy → N2 flow increases (already in frame.load.n2Flow)
    - Use `frame.areaStates[area].Productive / frame.areaStates[area].total` for coupling
  - Keep existing tables below the schematic

  **Must NOT do**:
  - Do not modify engine files
  - Do not change the bulk gas yard data (it's already coupled via frame.load.n2Flow)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG schematic layout
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8)
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 1 (SVG schematic utility)

  **References**:

  **Pattern References**:
  - `src/modules/gas-exhaust.js:45-137` — Current gas module mount — add schematic panel
  - `src/modules/gas-exhaust.js:220-239` — Gas cabinet state logic — modify for production coupling
  - `src/modules/gas-exhaust.js:24-31` — `GASES` object — use for node labels and properties

  **API/Type References**:
  - `CONTRACT.md:37` — `frame.load.n2Flow`, `exGenCFM`, `exAcidCFM`, `exSolCFM`, `exHeatCFM`
  - `CONTRACT.md:57` — `frame.areaStates[area].Productive` for coupling

  **WHY Each Reference Matters**:
  - `gas-exhaust.js:220-239`: This is where cabinet states are set — modify to use frame.areaStates
  - `CONTRACT.md:37`: These are the load channels that drive gas/exhaust flow — use for schematic animation

  **Acceptance Criteria**:
  - [ ] SVG schematic shows gas yard layout: Bulk storage → Headers → Distribution
  - [ ] Flow lines animate driven by `frame.load.n2Flow` and exhaust headers
  - [ ] Live values (header pressure, flow, tank level) displayed on nodes
  - [ ] Gas cabinet Online/Standby states correlate with `frame.areaStates` productive fraction
  - [ ] Existing bulk gas, exhaust, scrubber, oxidizer tables preserved

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Gas yard schematic renders with bulk gas nodes
    Tool: Playwright
    Preconditions: Gas & Exhaust module active
    Steps:
      1. Navigate to #gas-exhaust
      2. Assert SVG schematic exists
      3. Assert nodes for N2, O2, Ar visible
      4. Assert flow paths animate with n2Flow
    Expected Result: Schematic shows gas yard with animated flow
    Evidence: .omo/evidence/task-9-gas-schematic.png

  Scenario: Gas cabinet states reflect production activity
    Tool: Bash (node REPL)
    Preconditions: Gas module loaded, update function accessible
    Steps:
      1. Simulate frame with high Etch productive fraction (0.9)
      2. Run cabinet state update logic
      3. Assert SiH4/Cl2 cabinets have higher Online probability than with low Etch fraction (0.2)
    Expected Result: Cabinet states correlate with production activity
    Evidence: .omo/evidence/task-9-cabinet-coupling.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(gas): add gas yard schematic and production-coupled cabinet states`
  - Files: `src/modules/gas-exhaust.js`

- [ ] 10. Alarm Banner Expansion + History

  **What to do**:
  - Make alarm banner clickable: clicking expands a dropdown panel below it
  - Dropdown shows all active alarms with: ALID, text, tool, severity badge, area
  - Each alarm row is clickable → navigates to the module containing that area (via location.hash)
  - Add alarm history: store last N alarms (ring buffer, 200 entries) with set/clear timestamps
  - Show history panel accessible via a "History" button in the expanded dropdown
  - Style alarm rows with severity coloring (MINOR=warn, MAJOR=bad, CRIT=crit)
  - Close dropdown on click outside or Escape key
  - Use `role="alert"` (already added in Task 6) and `aria-expanded` on banner

  **Must NOT do**:
  - Do not modify engine or frame contract
  - Do not store alarm history in frame (use closure-scope ring buffer)
  - Do not add alarm acknowledgment (read-only history)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: DOM expansion + ring buffer + click routing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 11, 12)
  - **Blocks**: Task 13 (cross-module navigation depends on alarm expansion)
  - **Blocked By**: Task 6 (ARIA labels, specifically role="alert")

  **References**:

  **Pattern References**:
  - `src/app/shell.js:49-53` — Alarm banner DOM structure
  - `src/app/shell.js:129-135` — Alarm update logic
  - `src/ui/widgets.js:31-78` — Ring buffer pattern from Sparkline (Float32Array + head/count)
  - `src/ui/ticker.js:61-62` — Click-outside-to-close pattern (or use document click listener)

  **API/Type References**:
  - `CONTRACT.md:55` — `frame.alarms` shape: `[{ tool, area, alid, text, sev, set, clear }]`
  - `CONTRACT.md:58` — `frame.model.alarms` for history access

  **WHY Each Reference Matters**:
  - `shell.js:49-53`: Exact DOM structure of the banner — add click handler and dropdown here
  - `widgets.js:31-78`: Copy the ring buffer pattern for alarm history (pre-allocated array + modular index)
  - `CONTRACT.md:55`: The alarm object shape — use for rendering alarm rows

  **Acceptance Criteria**:
  - [ ] Alarm banner clickable to expand dropdown panel
  - [ ] Dropdown shows all active alarms with ALID, text, tool, severity badge, area
  - [ ] Each alarm row clickable → navigates to module containing that area
  - [ ] Alarm history stored in ring buffer (200 entries) with set/clear timestamps
  - [ ] History accessible via "History" button in expanded dropdown
  - [ ] Dropdown closes on click outside or Escape key
  - [ ] Alarm rows styled with severity coloring (MINOR=warn, MAJOR=bad, CRIT=crit)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Alarm banner expands on click
    Tool: Playwright
    Preconditions: App running, at least 1 active alarm
    Steps:
      1. Wait for alarm banner to appear (not hidden)
      2. Click the alarm banner
      3. Assert dropdown panel appears below banner
      4. Assert dropdown contains alarm rows with ALID and text
      5. Assert alarm rows have severity-colored badges
    Expected Result: Dropdown shows all active alarms with details
    Evidence: .omo/evidence/task-10-alarm-expand.png

  Scenario: Clicking alarm navigates to relevant module
    Tool: Playwright
    Preconditions: Alarm dropdown open, alarm for Etch area visible
    Steps:
      1. Click the Etch alarm row
      2. Assert location.hash changes to 'production' (Production module shows all areas)
      3. Assert dropdown closes
    Expected Result: Navigation to module containing the alarm's area
    Evidence: .omo/evidence/task-10-alarm-navigate.png

  Scenario: Dropdown closes on click outside
    Tool: Playwright
    Preconditions: Alarm dropdown open
    Steps:
      1. Click outside the dropdown (on the content area)
      2. Assert dropdown is hidden or removed
    Expected Result: Dropdown closes
    Evidence: .omo/evidence/task-10-alarm-close.png
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(shell): expandable alarm banner with history and navigation`
  - Files: `src/app/shell.js`, `styles/components.css`

- [ ] 11. Event Stream Filtering

  **What to do**:
  - Add filter buttons to the event rail header (next to the rate display)
  - Filter by event class: All | Lot/Job | AMHS | FDC | Alarm
  - Each button toggles visibility of matching event rows (using CSS class `cls-*`)
  - Active filter button highlighted with accent color
  - Filter state stored in closure (not persisted)
  - When filtered, the ticker still counts all events for the rate display
  - Add `aria-pressed` to filter buttons

  **Must NOT do**:
  - Do not remove events from DOM (use CSS display:none for filtered rows)
  - Do not modify the ticker's event admission logic (filter is post-render)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple button toggle + CSS class manipulation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10, 12)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/shell.js:64-71` — Event rail DOM structure (rail-h with title + rate)
  - `src/ui/ticker.js:87-100` — Event row creation with `cls-*` classes
  - `styles/components.css:81-95` — Event row styling with `cls-*` selectors

  **WHY Each Reference Matters**:
  - `shell.js:64-71`: Add filter buttons to the rail-h header div
  - `ticker.js:87-100`: Events already have `cls-lot`, `cls-job`, `cls-amhs`, `cls-fdc`, `cls-alarm` classes — filter by toggling display
  - `components.css:81-95`: The `cls-*` selectors already exist — add `.evt.hidden { display: none }` rule

  **Acceptance Criteria**:
  - [ ] Filter buttons visible in event rail header: All | Lot/Job | AMHS | FDC | Alarm
  - [ ] Active filter button highlighted with accent color
  - [ ] Filtering uses CSS `display:none` on non-matching rows (not DOM removal)
  - [ ] Rate display continues to count all events regardless of filter
  - [ ] Filter buttons have `aria-pressed` attribute

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Filter buttons appear in event rail header
    Tool: Playwright
    Preconditions: App loaded, event rail visible
    Steps:
      1. Assert filter buttons exist in the event rail header
      2. Assert buttons labeled 'All', 'Lot/Job', 'AMHS', 'FDC', 'Alarm' exist
      3. Assert 'All' button has aria-pressed="true" (active by default)
    Expected Result: Filter buttons visible with correct labels
    Evidence: .omo/evidence/task-11-filter-buttons.png

  Scenario: Filtering hides non-matching events
    Tool: Playwright
    Preconditions: Event stream has mixed event types
    Steps:
      1. Click 'Alarm' filter button
      2. Assert events with class 'cls-alarm' are visible
      3. Assert events with class 'cls-lot' have display:none
      4. Assert rate display still shows non-zero (counts all events)
    Expected Result: Only alarm events visible, rate unchanged
    Evidence: .omo/evidence/task-11-filter-alarm.png

  Scenario: 'All' filter shows everything
    Tool: Playwright
    Preconditions: 'Alarm' filter is active
    Steps:
      1. Click 'All' filter button
      2. Assert all event rows are visible
    Expected Result: All events visible again
    Evidence: .omo/evidence/task-11-filter-all.png
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(ticker): add event stream filtering by type`
  - Files: `src/app/shell.js`, `src/ui/ticker.js`, `styles/components.css`

- [ ] 12. Header KPI Mini-Sparklines

  **What to do**:
  - Add a tiny sparkline canvas (20px tall) under each of the 5 header KPI values
  - Use `U.Sparkline(canvas, { n: 60, height: 20, color: '--accent', fill: true })`
  - Push values every frame in `shell.js` `update()`: demand, overhead, oee, moves, peak
  - Render after push (sparklines are cheap at 60 points)
  - Style: no border, minimal padding, integrated into the hdr-kpi box

  **Must NOT do**:
  - Do not add separate panels for sparklines (embed in existing header KPI boxes)
  - Do not use large buffer sizes (60 points = ~1 second of data at 60fps)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Reuse existing Sparkline widget, embed in header
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10, 11)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/shell.js:32-40` — Header KPI creation: `refs.hk[k[0]] = v` stores value spans
  - `src/app/shell.js:119-126` — Header KPI update: `refs.hk.demand.textContent = ...`
  - `src/ui/widgets.js:31-78` — `U.Sparkline(canvas, opts)` usage pattern
  - `src/modules/cleanroom.js:92-95` — Sparkline push+render every frame pattern

  **WHY Each Reference Matters**:
  - `shell.js:32-40`: Shows where KPI boxes are created — add canvas after the value span
  - `shell.js:119-126`: Shows where values are updated — add sparkline push+render here
  - `widgets.js:31-78`: The Sparkline API — use n=60, height=20, fill=true

  **Acceptance Criteria**:
  - [ ] 5 sparkline canvases (20px tall) exist inside `.hdr-kpi` elements
  - [ ] Each sparkline uses `U.Sparkline` with n=60, height=20, fill=true
  - [ ] Values pushed every frame: demand, overhead, oee, moves, peak
  - [ ] Sparklines render trend data (not blank)
  - [ ] Minimal visual footprint (integrated into existing header KPI boxes)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Header KPIs have sparkline canvases
    Tool: Playwright
    Preconditions: App loaded
    Steps:
      1. Assert 5 canvas elements exist inside .hdr-kpi elements
      2. Assert each canvas has height style (20px)
    Expected Result: Sparkline canvases visible under each header KPI
    Evidence: .omo/evidence/task-12-header-sparklines.png

  Scenario: Sparklines show trend data
    Tool: Playwright
    Preconditions: App running for 2+ seconds
    Steps:
      1. Find the demand sparkline canvas
      2. Assert canvas has non-zero pixel data (not blank)
    Expected Result: Sparkline renders trend line
    Evidence: .omo/evidence/task-12-sparkline-data.png
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(shell): add mini-sparklines to header KPIs`
  - Files: `src/app/shell.js`

- [ ] 13. Cross-Module Alarm-to-Navigate

  **What to do**:
  - Add click handlers to alarm rows in the event stream (right rail)
  - When an alarm row is clicked, navigate to the module containing that alarm's area:
    - Etch/Wet → Cleanroom (cleanroom module shows per-bay data including Etch/Wet bays)
    - LITHO/DIFF/IMPL/CMP/THIN/METRO → Production Floor
    - Any area → Production Floor as fallback
  - Update alarm banner dropdown (from Task 10) to also navigate on click
  - Add visual feedback: highlight the nav item briefly (flash accent border)
  - Use `location.hash` to trigger existing routing

  **Must NOT do**:
  - Do not create new routing logic (use existing hash-based routing)
  - Do not add complex area→module mapping (keep it simple: Production as default)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Click handler integration across multiple DOM locations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-18)
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 16, 17, 18)
  - **Blocks**: None
  - **Blocked By**: Task 10 (alarm banner expansion)

  **References**:

  **Pattern References**:
  - `src/app/shell.js:103-116` — `activate(id)` function — call this via hash change
  - `src/ui/ticker.js:64-73` — Event row creation — add click handler to row element
  - `src/app/shell.js:82-98` — Nav item click handlers — copy pattern for alarm click

  **WHY Each Reference Matters**:
  - `shell.js:103-116`: The activate function handles all module switching — just set location.hash
  - `ticker.js:64-73`: The rowEl function creates event DOM — add click handler here for alarm rows
  - `shell.js:82-98`: Shows the hash-change pattern — replicate for alarm navigation

  **Acceptance Criteria**:
  - [ ] Clicking alarm rows in event stream navigates to module containing that area
  - [ ] Clicking alarm rows in banner dropdown navigates and closes dropdown
  - [ ] Area→module mapping: Etch/Wet → Cleanroom, all others → Production
  - [ ] Visual feedback: nav item flashes briefly on alarm navigation
  - [ ] Navigation uses existing `location.hash` routing (no duplicate logic)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Clicking alarm in event stream navigates to module
    Tool: Playwright
    Preconditions: App running, alarm visible in event stream
    Steps:
      1. Find an alarm event row in the right rail (class 'cls-alarm')
      2. Click the alarm row
      3. Assert location.hash changes to a valid module ID
      4. Assert the corresponding nav item has class 'active'
    Expected Result: Navigation to module containing the alarm's area
    Evidence: .omo/evidence/task-13-alarm-navigate.png

  Scenario: Alarm banner dropdown navigates on click
    Tool: Playwright
    Preconditions: Alarm banner visible, clicked to expand
    Steps:
      1. Click an alarm row in the expanded dropdown
      2. Assert location.hash changes
      3. Assert dropdown closes
    Expected Result: Navigation triggered, dropdown closed
    Evidence: .omo/evidence/task-13-banner-navigate.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(shell): cross-module navigation from alarm clicks`
  - Files: `src/app/shell.js`, `src/ui/ticker.js`

- [ ] 14. Sustainability Targets from Simulation State

  **What to do**:
  - Replace hardcoded target strings in sustainability module with values derived from `frame.kpis`
  - Current targets: '60 % RE100', 'FY2035', '> 80 %', 'ISO 14064-1'
  - Replace with:
    - '2030 Renewable Target': Show current % + target (e.g., '28.5% → 60% RE100')
    - 'Net-Zero Scope 2 Target': Show current CO2e rate + target year (e.g., '8.2 t/h → FY2035')
    - 'Water Reuse Goal': Show current % + target (e.g., '78.4% → >80%')
    - 'Reporting Basis': Keep 'ISO 14064-1' (static)
  - Add a simple progress bar under each target showing current vs target
  - Use `frame.kpis.renewablePct`, `frame.kpis.co2eRate`, `frame.kpis.waterReusePct`

  **Must NOT do**:
  - Do not modify engine files
  - Do not change the target values themselves (60%, FY2035, >80%)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Replace static strings with dynamic values from existing frame data
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 15, 16, 17, 18)
  - **Parallel Group**: Wave 3 (with Tasks 13, 15, 16, 17, 18)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/modules/sustainability.js:114-124` — Current hardcoded targets with `statBlock` presets
  - `src/modules/sustainability.js:129-211` — Update function — add target value updates in the `fc % 8 === 0` block
  - `src/modules/sustainability.js:232-247` — `statBlock()` helper — returns stat-line elements with value spans

  **API/Type References**:
  - `CONTRACT.md:47-48` — `frame.kpis.renewablePct`, `frame.kpis.waterReusePct`, `frame.kpis.co2eRate`

  **WHY Each Reference Matters**:
  - `sustainability.js:114-124`: Shows where targets are created — modify presets to include placeholders
  - `sustainability.js:129-211`: Shows the update throttle pattern — add target updates here
  - `CONTRACT.md:47-48`: The exact KPI values to display alongside targets

  **Acceptance Criteria**:
  - [ ] Target rows show current simulation values alongside static targets
  - [ ] '2030 Renewable Target' shows current `renewablePct` + '60% RE100'
  - [ ] 'Net-Zero Scope 2 Target' shows current `co2eRate` + 'FY2035'
  - [ ] 'Water Reuse Goal' shows current `waterReusePct` + '>80%'
  - [ ] Progress bars show current vs target ratio
  - [ ] Values update in real-time with simulation (throttled to fc % 8)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Targets show current simulation values
    Tool: Playwright
    Preconditions: Sustainability module active, simulation running
    Steps:
      1. Navigate to #sustainability
      2. Find the 'Decarbonization Targets' panel
      3. Assert '2030 Renewable Target' row contains '%' (current value)
      4. Assert 'Water Reuse Goal' row contains '%' (current value)
    Expected Result: Target rows show current values alongside static targets
    Evidence: .omo/evidence/task-14-targets-dynamic.png

  Scenario: Targets update with simulation
    Tool: Playwright
    Preconditions: Sustainability module active
    Steps:
      1. Note current renewable target value
      2. Wait 3 seconds
      3. Assert the value has changed (simulation progressed)
    Expected Result: Target values update in real-time
    Evidence: .omo/evidence/task-14-targets-update.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(sustainability): derive target values from simulation state`
  - Files: `src/modules/sustainability.js`

- [ ] 15. Equipment Registry Optimization

  **What to do**:
  - In masterdata.js, optimize the equipment table update to avoid full innerHTML rebuild
  - Instead of rebuilding all ~58 rows every 12 frames, update only the E10 state badge column
  - Strategy: on first render, build full table with `data-id` attributes on rows
  - On subsequent updates, query rows by `data-id` and update only the badge cell
  - Use `querySelector` on the table body (cached in closure) for targeted updates
  - Keep the 12-frame throttle for the update loop

  **Must NOT do**:
  - Do not change the table columns or data structure
  - Do not remove the throttle (keep fc % 12)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted DOM optimization, no new features
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 16, 17, 18)
  - **Parallel Group**: Wave 3 (with Tasks 13, 14, 16, 17, 18)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/modules/masterdata.js:123-133` — Current equipment table update (full innerHTML rebuild)
  - `src/modules/masterdata.js:92-102` — Table creation with columns definition

  **WHY Each Reference Matters**:
  - `masterdata.js:123-133`: This is the code to optimize — currently does `equipTbl.set()` with all rows
  - `masterdata.js:92-102`: Shows the column structure — the badge is rendered by a custom render function

  **Acceptance Criteria**:
  - [ ] Equipment table uses `data-id` attributes on rows for targeted updates
  - [ ] First render builds full table; subsequent updates only touch badge cells
  - [ ] Cached `tbody` reference used for `querySelector` (no per-frame DOM queries)
  - [ ] 12-frame throttle preserved
  - [ ] E10 badges still update correctly with simulation state

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Equipment table updates without full rebuild
    Tool: Bash (grep)
    Preconditions: masterdata.js modified
    Steps:
      1. Search for 'equipTbl.set' in the update function
      2. Assert it is NOT called on every 12th frame (replaced with targeted update)
      3. Assert there is a cached tbody reference for targeted DOM updates
    Expected Result: No full table rebuild, only badge column updates
    Evidence: .omo/evidence/task-15-registry-opt.txt

  Scenario: E10 badges still update correctly
    Tool: Playwright
    Preconditions: Master Data module active
    Steps:
      1. Navigate to #masterdata
      2. Wait for equipment table to render
      3. Assert E10 state badges exist and have correct class names
      4. Wait 2 seconds
      5. Assert badges have updated (states changed)
    Expected Result: Badges update without full table flash
    Evidence: .omo/evidence/task-15-badges-update.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `perf(masterdata): optimize equipment table to targeted DOM updates`
  - Files: `src/modules/masterdata.js`

- [ ] 16. Data Snapshot/Export

  **What to do**:
  - Add a small "Snapshot" button in the topbar (next to the clock)
  - On click, JSON-serialize the current `frame` (key KPIs + alarm list + active jobs) and copy to clipboard
  - Format: `{ timestamp, simTime, totalMW, overheadRatio, oee, wpmh, co2e, activeAlarms, activeJobs }`
  - Show brief "Copied!" toast notification (1.5s, then fade)
  - Use `navigator.clipboard.writeText()` with fallback to `document.execCommand('copy')`
  - Style button: small, muted, SCADA-themed (use existing button patterns)

  **Must NOT do**:
  - Do not export the full frame object (too large) — only key summary KPIs
  - Do not add file download (clipboard only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single button + JSON serialization + clipboard API
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15, 17, 18)
  - **Parallel Group**: Wave 3 (with Tasks 13, 14, 15, 17, 18)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/shell.js:42-46` — Clock area in topbar — add button near clock
  - `src/app/shell.js:119-126` — Update function — read frame.kpis for snapshot

  **WHY Each Reference Matters**:
  - `shell.js:42-46`: The clock is in the topbar — add the snapshot button next to it
  - `shell.js:119-126`: Shows all the KPI fields available in frame.kpis — use for snapshot data

  **Acceptance Criteria**:
  - [ ] "Snapshot" button visible in topbar next to clock
  - [ ] Button click copies JSON summary to clipboard
  - [ ] JSON contains: timestamp, simTime, totalMW, overheadRatio, oee, wpmh, co2e, activeAlarms, activeJobs
  - [ ] "Copied!" toast appears for 1.5s then fades
  - [ ] Uses `navigator.clipboard.writeText()` with `execCommand('copy')` fallback

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Snapshot button copies KPIs to clipboard
    Tool: Playwright
    Preconditions: App loaded and running
    Steps:
      1. Find button with text 'Snapshot' or similar in topbar
      2. Click the button
      3. Read clipboard content
      4. Assert clipboard contains valid JSON
      5. Assert JSON has 'totalMW', 'oee', 'activeAlarms' fields
    Expected Result: JSON summary copied to clipboard
    Evidence: .omo/evidence/task-16-snapshot.json

  Scenario: Toast notification appears after snapshot
    Tool: Playwright
    Preconditions: Snapshot button clicked
    Steps:
      1. Click snapshot button
      2. Assert toast element appears with 'Copied' text
      3. Wait 2 seconds
      4. Assert toast has faded or been removed
    Expected Result: Brief confirmation toast visible
    Evidence: .omo/evidence/task-16-toast.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(shell): add KPI snapshot export to clipboard`
  - Files: `src/app/shell.js`, `styles/components.css`

- [ ] 17. Module Info Strips

  **What to do**:
  - Add a collapsible info strip at the top of each module (below the view-head)
  - Shows a 1-2 sentence description of what the module monitors
  - Collapsed by default, expandable via a small "?" icon or "Info" toggle
  - Use `<details>` / `<summary>` HTML elements for native collapse (no JS needed)
  - Style: muted background, smaller font, SCADA-themed
  - Content per module:
    - Production: "Live smart-factory events driving facility load. SECS/GEM collection events, E10 equipment states, AMHS moves."
    - Cleanroom: "Per-bay ISO 14644 air cleanliness monitoring. Temperature, humidity, differential pressure, ULPA FFU airflow."
    - Cooling: "Chilled water plant staging and process cooling loops. Chiller tonnage, supply/return temps, cooling tower fans."
    - UPW: "Ultrapure water quality at 18.2 MΩ·cm. Resistivity, TOC, dissolved O₂, reclaim/reuse."
    - Gas: "Bulk gas yard and specialty gas distribution. N₂/O₂/Ar headers, exhaust segregation, scrubber/oxidizer abatement."
    - Energy: "Facility demand command center. Total load, sub-metering, energy intensity, power quality."
    - Sustainability: "Carbon accounting and resource efficiency. CO₂e, renewable mix, water reuse, decarbonization targets."
    - Master Data: "Asset hierarchy and point/tag registry. Equipment lookup, live point values, BACnet/SECS addressing."

  **Must NOT do**:
  - Do not add info strips that are expanded by default (collapsed = no visual impact on demo)
  - Do not use JavaScript for collapse (use native `<details>`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple HTML/CSS addition, no JS logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15, 16, 18)
  - **Parallel Group**: Wave 3 (with Tasks 13, 14, 15, 16, 18)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/modules/production.js:13-17` — View-head pattern: `var head = el('div', 'view-head'); head.innerHTML = '...'`
  - All modules follow the same view-head pattern

  **WHY Each Reference Matters**:
  - Each module has a view-head — insert the `<details>` element right after it, before the grid

  **Acceptance Criteria**:
  - [ ] Each of the 8 modules has a `<details>` element below the view-head
  - [ ] Info strips collapsed by default (no `open` attribute)
  - [ ] Summary text contains "Info" or "?" icon
  - [ ] Expanding shows 1-2 sentence module description
  - [ ] Styled with muted background, smaller font, SCADA theme
  - [ ] No JavaScript required for collapse (native HTML `<details>`)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Info strip exists and is collapsed by default
    Tool: Playwright
    Preconditions: Any module active
    Steps:
      1. Navigate to #production
      2. Assert a <details> element exists in the module
      3. Assert the <details> element does not have 'open' attribute
      4. Assert the summary text contains 'Info' or '?'
    Expected Result: Collapsed info strip visible
    Evidence: .omo/evidence/task-17-info-collapsed.png

  Scenario: Info strip expands on click
    Tool: Playwright
    Preconditions: Info strip collapsed
    Steps:
      1. Click the <summary> element
      2. Assert the <details> element now has 'open' attribute
      3. Assert description text is visible
    Expected Result: Info strip expanded with module description
    Evidence: .omo/evidence/task-17-info-expanded.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(modules): add collapsible info strips to all modules`
  - Files: All 8 module files in `src/modules/`

- [ ] 18. Responsive Improvements (1080px+)

  **What to do**:
  - Improve layout at the 1080px breakpoint:
    - Event rail collapses to a toggleable overlay (hamburger icon in topbar)
    - Header KPIs wrap to 2 rows instead of overflowing
    - Living-fab canvas height reduces to 240px
    - Module grids switch to single column earlier
  - Add CSS media query adjustments in `layout.css`
  - Add event rail toggle button in `shell.js` (only visible at 1080px)
  - Ensure SVG schematics scale properly (use viewBox, not fixed dimensions)

  **Must NOT do**:
  - Do not target mobile (< 768px) — SCADA is desktop-only
  - Do not remove any functionality at smaller sizes (just reorganize)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS layout adjustments + responsive DOM changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15, 16, 17)
  - **Parallel Group**: Wave 3 (with Tasks 13, 14, 15, 16, 17)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `styles/layout.css:83-84` — Current responsive breakpoints: `@media (max-width: 1380px)` and `@media (max-width: 1080px)`
  - `styles/layout.css:51-76` — Body split layout (nav rail | content | event rail)
  - `src/app/shell.js:64-71` — Event rail DOM creation

  **WHY Each Reference Matters**:
  - `layout.css:83-84`: These are the existing breakpoints — extend the 1080px rules
  - `layout.css:51-76`: The flex layout needs adjustment for smaller screens
  - `shell.js:64-71`: The event rail needs a toggle mechanism at 1080px

  **Acceptance Criteria**:
  - [ ] Layout adapts at 1080px breakpoint (nav collapses, KPIs wrap, event rail toggleable)
  - [ ] Event rail toggle button visible at 1080px (hamburger icon in topbar)
  - [ ] Header KPIs wrap to 2 rows instead of overflowing
  - [ ] Living-fab canvas height reduces to 240px at 1080px
  - [ ] SVG schematics scale properly using `viewBox` (not fixed dimensions)
  - [ ] No functionality removed at smaller sizes (just reorganized)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Layout adapts at 1080px width
    Tool: Playwright
    Preconditions: App loaded
    Steps:
      1. Set viewport to 1080x800
      2. Assert nav rail is collapsed (labels hidden)
      3. Assert event rail has a toggle button visible
      4. Assert header KPIs are wrapped (not overflowing)
    Expected Result: Layout reorganized for smaller desktop
    Evidence: .omo/evidence/task-18-responsive-1080.png

  Scenario: Event rail toggles at 1080px
    Tool: Playwright
    Preconditions: Viewport at 1080px
    Steps:
      1. Click the event rail toggle button
      2. Assert event rail slides in as overlay
      3. Click toggle again
      4. Assert event rail slides out
    Expected Result: Event rail toggleable on smaller screens
    Evidence: .omo/evidence/task-18-rail-toggle.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(responsive): improve layout at 1080px breakpoint`
  - Files: `styles/layout.css`, `src/app/shell.js`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `_selftest.mjs` to verify engine unchanged. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify classic IIFE pattern used consistently. Verify no ES module syntax.
  Output: `Engine Test [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (schematics + tooltips + keyboard working together). Test edge cases: empty alarm list, rapid module switching, canvas resize. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(ui): add SVG schematic utility, canvas tooltips, keyboard nav, loop progress, favicon, ARIA labels`
- **Wave 2**: `feat(modules): add schematics to cooling/upw/gas, expand alarm banner, add event filtering, header sparklines`
- **Wave 3**: `feat(ux): cross-module alarm nav, sustainability targets, registry optimization, data export, info strips, responsive`
- **Wave 4**: No commits (verification only)

---

## Success Criteria

### Verification Commands
```bash
bun _selftest.mjs  # Expected: 22 passed, 0 failed
# Open bas-ems.html from file:// in Chrome — zero console errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `bun _selftest.mjs` passes 22/22
- [ ] `bas-ems.html` works from file://
- [ ] 60fps maintained (no frame drops in 10s trace)
- [ ] No memory growth over 30 min loop
- [ ] All SVG schematics animate with production data
- [ ] Living-fab canvas has working tooltips
- [ ] Keyboard navigation works
- [ ] Alarm banner expands and navigates
- [ ] Event filtering works
- [ ] UPW shows near-spec excursions
- [ ] Header KPIs have sparklines
- [ ] Loop progress bar works
- [ ] ARIA labels present on interactive elements

---

## /autoplan Review (2026-06-01)

Three independent Claude voices (CEO/Design/Eng) + my own read. Codex degraded to
`[codex-unavailable]` (wandered into skill files, no clean output). Auto-decisions use
the 6 principles; taste + user-challenges go to the approval gate.

### Consensus (cross-voice agreement = high signal)

| Dimension | CEO | Design | Eng | Consensus |
|---|---|---|---|---|
| `build-single.mjs` "edit" instruction | wrong (S6) | — | wrong (E1) | **CONFIRMED wrong** (also my read) |
| Task 8 UPW excursion badges functional | — | DEAD UI (F1) | DEAD UI (E8) | **CONFIRMED dead** — engine locks resistivity 18.185–18.215, TOC 0.550–0.800; warn/bad bands never reached (verified empirically) |
| Scope calibration | too broad (S3) | too big (F-scope) | too big (E-scope) | **CONFIRMED tail below the credibility line** |
| Trend/history dimension present | MISSING (S1) | — | — | single voice, high conviction → user challenge |
| Guided/demo mode present | MISSING (S2) | — | — | single voice → user challenge |
| Interaction states specified | — | NO (F2) | partial (E6) | **CONFIRMED gaps** (tooltip offscreen, alarm empty/overflow, filter no-match) |
| Schematic API frozen before Wave 2 | de-risk (S4) | — | NOT frozen (E10) | **CONFIRMED risk** |
| Determinism of NEW UI tested | — | — | NO (E9) | flagged |

### Auto-decided — MECHANICAL fixes (apply regardless; they correct bugs in the plan)

1. **Strike the `build-single.mjs` edits** (Task 1 + Concrete Deliverables). The bundler
   is index.html-driven (regex-inlines every `<script src="...">`). Instead add a
   **build-completeness assertion**: after writing `bas-ems.html`, fail if any `src=`
   remains un-inlined and assert `BAS.ui.Schematic` is present. New include MUST use the
   exact form `<script src="src/ui/schematic.js"></script>` (extra attrs/quotes are
   silently skipped → broken single-file demo). [E1/S6, conf 90]
2. **Fix Task 8 excursion bands to the engine's real envelope** (resistivity 18.185–18.215,
   TOC 0.550–0.800) so the badge actually animates, OR drive it off a clearly-labeled
   module-local visual proxy (deterministic via `U.jitter(channel, frame.tick, amp)`).
   As written the amber band never lights — a sharp process engineer notices. [F1/E8, conf 95]
3. **Alarm history from `frame.newEvents` (AlarmSet/AlarmClear), not `frame.alarms` membership.**
   `frame.alarms` is active-now; pushing it each frame fills the ring buffer with duplicates.
   Diff the transition events. [E7, conf 82]
4. **Task 4: add `position: relative` to `.topbar`** (it has none today) before
   absolute-positioning the 3px loop bar, or make it a flex child. [F6/E5, conf 92]
5. **Task 2 tooltip:** read coords as CSS px (do NOT divide by DPR), null-guard `layout`,
   and only rewrite tooltip innerHTML when the hit target changes (track `lastHitId`). [E4, conf 88]
6. **Task 9 gas coupling: deterministic + quantized.** Recompute cabinet state only inside
   the existing `fc % N` throttle, key all randomness to `frame.tick` via `U.jitter`, and
   define an explicit gas→area map (or de-scope to count-online tracking). [E3, conf 85]
7. **Task 13 alarm→module map** via `master.categoryFor(id)` (CHW→Cooling, UPW→UPW,
   GAS/EXHAUST→Gas, tool→Cleanroom/Production) instead of "all others→Production." [F8, conf 75]
8. **Task 11 + interaction states:** add no-match placeholder ("— no recent &lt;type&gt; events —")
   and an explicit States subsection to Tasks 2/10/11 (tooltip edge-clamp, alarm
   empty/overflow + max-height scroll, filter no-match). [F2/E6]
9. **Schematic animation in CSS, JS adjusts speed.** Continuous flow via a `.flow`
   keyframe (dashoffset cycle); `update()` only mutates `animation-duration`/a CSS var on
   threshold crossing, throttled `fc % 4`. Resolves the "JS dashoffset vs throttle" conflict. [E2]
10. **Determinism test for new UI helpers** (same `frame.tick` → identical output) in the
    `_selftest` style; treat Playwright as optional smoke, not the primary gate. [E9]
11. **Extend `prefers-reduced-motion`** to the new SVG flow + sparkline animations. [Design]

### Auto-decided — TASTE (recommendation shown; surfaced at gate)

- **T-A: Freeze the `U.Schematic(opts)` interface in writing before dispatching Wave 2**,
  and build **Task 1 + Task 7 (chiller P&ID) as a vertical slice first** to validate the
  utility before parallelizing 8/9. *Recommend: yes (de-risk, explicit).* [S4/E10]
- **T-B: Add schematic-node hover** (reuse Task 2's tooltip → `master.pointsForEquipment`)
  so the new SVGs aren't inert (the living-fab's original sin). *Recommend: yes (cheap, big
  credibility).* [S7]
- **T-C: Right-size accessibility (Task 6):** add a single `:focus-visible` ring token,
  change alarm banner `role=alert`→`role=status`, `aria-hidden` the decorative event
  firehose (or announce NEW alarms only), and either commit to real tab semantics
  (tabindex + roving) or drop the `role=tab` labels. *Recommend: the honest version.* [F3]
- **T-D: Schematic density budget** (5–7 primary nodes) + anti-duplication rule (schematic
  shows flow/state; tables own the numbers) + consider col-8 schematic beside col-4 summary
  rather than full-width col-12 that buries the tables. *Recommend: yes.* [F5]

### User Challenges (both/strong-single model says your chosen scope should change — YOU decide)

- **UC1 — Add a Trends/historian view.** The #1 thing a fab facilities engineer checks
  (kW/resistivity/demand over the shift, with setpoint/spec bands + min/avg/max). The
  engine already supports the full simulated hour (`model.eventsInWindow`, `load.sample`
  over a window) at zero contract risk. Header mini-sparklines (Task 12, ~1s window) are
  motion, not history. *If wrong:* you spent effort on schematics/polish but skipped the
  feature that most separates "real SCADA" from "pretty toy." [S1, conf 78]
- **UC2 — Add a guided/demo mode.** Half the objective ("usable in a sales demo") has no
  task. A deterministic auto-rotate + scripted caption pointing at the production→facility
  coupling. *If wrong:* the demo still depends on a presenter clicking and luck-of-the-sim. [S2]
- **UC3 — Trim the low-yield tail.** Demote/defer **T15** (registry micro-opt, pure code
  quality), **T16** (clipboard JSON export — an expert exports CSV trends, not one sample;
  also `navigator.clipboard` throws under `file://`); reframe **T12** (header sparklines →
  one KPI, longer window, or cut), **T17** (info strips → fold into the existing `.crumb`),
  **T18** (responsive → CSS-only reflow, drop the hamburger/overlay JS). *If wrong:* a
  "Large" budget spreads thin across 18 items instead of concentrating on the ~5 that
  convince an expert. [S3 + Design + Eng consensus]

### Decision Audit Trail

| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | Eng | Strike build-single edit; add build assertion | mechanical | P4/P5 | bundler is index.html-driven; the edit is a no-op that risks breakage |
| 2 | Design | Fix Task 8 bands to engine envelope / proxy | mechanical | P1 | feature is non-functional as specified |
| 3 | Eng | Alarm history from newEvents not frame.alarms | mechanical | P1 | prevents duplicate-filled ring buffer |
| 4 | Design | Task 4 .topbar position:relative | mechanical | P5 | plan cites a false fact |
| 5 | Eng | Tooltip DPR/null-guard/lastHitId | mechanical | P5 | correctness + zero-alloc |
| 6 | Eng | Gas coupling deterministic+quantized+map | mechanical | P5 | determinism guardrail |
| 7 | Design | Alarm→module category map | mechanical | P1 | delivers on the navigate promise |
| 8 | Design | Interaction states + filter no-match | mechanical | P1 | prevents demo-breaking empty screens |
| 9 | Eng | Schematic flow in CSS, JS speed-only | mechanical | P5 | resolves animate-vs-throttle conflict |
| 10 | Eng | Determinism test for new helpers | mechanical | P1 | guards loop-identity cheaply |
| 11 | Design | reduced-motion for new animations | mechanical | P1 | a11y completeness |
| T-A | Eng | Freeze schematic API + vertical slice | taste | P3 | de-risk 3 parallel consumers |
| T-B | CEO | Schematic node hover | taste | P2 | cheap credibility |
| T-C | Design | Right-size ARIA | taste | P5 | honesty over aspiration |
| T-D | Design | Schematic density budget | taste | P5 | glanceable hierarchy |
| UC1/2/3 | CEO | Trends / demo mode / trim tail | user-challenge | — | **ACCEPTED by user (all 3) at gate 2026-06-01** |

### Gate Decisions Applied (user accepted all 3 challenges)

**+ Task 19 — Trends / Historian view (NEW, P0 — promote above the polish tail).**
A dedicated `Trends` module that plots whole-simulated-hour curves, not 1-second sparklines.
- New file `src/modules/trends.js` (classic IIFE, `BAS.registerModule`, group Operations).
- **Precompute via `BAS.sim.load.sample(t')` ONLY — NEVER `BAS.sim.frame(t')`** (Codex P0):
  `frame()` mutates global stream state (`lastT`, `streamCursor`) and returns ONE reused object, so
  sampling it out of live order corrupts the live ticker and aliases every sample to the same object.
  `load.sample(t')` is a pure, fresh-allocating function of `t` — safe to call ~240× at any order.
- **KPI-only series compute the formula directly** (Codex P1): `load.sample` has totalKW/overheadRatio/
  channels but NOT `upwResistivity`/`upwTOC` (those are composed in `frame()`). Replicate them keyed off
  `BAS.clock.tickOf(t')` — e.g. resistivity = `18.20 + (BAS.prng.rand('upwR', tickOf)−0.5)*0.03`.
- **Precompute on FIRST MOUNT, not at module top-level** (Codex P1): module scripts run before
  `BAS.sim.init()`; `BAS.sim.load` only exists after init. Build the curves lazily in `mount()`.
- Series: Total Demand (MW), Facility Overhead ratio, UPW Resistivity (spec band), Acid-Exhaust CFM,
  CHW load (RT). Each with **min/avg/max** + **setpoint/spec bands** + a moving "now" cursor at `frame.t`.
- **Rendering: cache the static curve, redraw only the cursor** (Codex P1): do NOT reuse `U.Sparkline`
  (it `clearRect`s + reallocates `[x,y]` every render). Draw each static curve ONCE to an offscreen
  canvas (or its own canvas layer) at mount; per frame, blit the cached bitmap + draw the 1px cursor.
- `index.html` include after modules; `components.css` for `.trend-chart`. No `build-single.mjs` edit.

**+ Task 20 — Demo / Guided mode (NEW, P0 — serves the "usable in a sales demo" half).**
- Toggle via header button + keyboard `D`. When on: auto-advance modules every ~12 s, and show a bottom
  caption strip narrating the live coupling.
- **Own exactly one timer + one key listener; clear both on toggle-off (no leaks)** and disambiguate
  demo-driven `location.hash` changes from manual ones (Codex P1) — set a `demoNavigating` flag around
  the demo's own hash write so the `hashchange` handler / a manual keypress can pause auto-rotate.
- **Captions tolerate empty `newEvents`** (Codex P2): `frame()` emits nothing after large gaps/resyncs,
  so fall back to narration derived from `frame.load`/`frame.kpis` when `newEvents` is empty.
- Pauses on manual nav/keypress; resumes after idle. Respects `prefers-reduced-motion` (longer dwell, no slide).
- Files: `src/app/shell.js` (or new `src/app/demo.js`), `components.css`. View-only, deterministic.

**Codex cross-task fixes (apply to existing tasks):**
- **Task 3 keyboard + Task 20 rotation must use the SORTED nav list** (group/order), not raw registration
  order, and decide whether Trends is addressable as key `9` (Codex P2 — adding a 9th module makes `1-8` stale).
- **Task 13 needs an explicit category→module map** (Codex P2): `master.categoryFor()` returns
  `CHW|UPW|GAS|EXHAUST|POWER|tool`, not module ids — map `CHW→cooling, UPW→upw, GAS/EXHAUST→gas-exhaust,
  POWER→energy, tool→cleanroom/production-by-area`.

### Codex final pass (cross-model voice, `src/`-scoped)

Ran one tightly-scoped Codex pass on the FINAL plan, focused on the two new tasks. It found **1 P0
+ 4 P1 + 3 P2** — several missed by the three Claude voices — all folded into the T19/T20/T3/T13
specs above:
- **[P0]** T19 must not call `frame()` for precompute (mutates `lastT`/`streamCursor`, aliases the reused
  object) — use `load.sample(t')`. *(I had flagged this; Codex confirmed with line cites.)*
- **[P1]** `load.sample` lacks `upwResistivity` (compute via `tickOf(t')`); precompute on first mount not
  top-level (init lifecycle); cache static curve + redraw cursor only (don't reuse alloc-heavy `U.Sparkline`).
- **[P1]** T20 auto-rotate must own one timer/listener and disambiguate its own hash writes.
- **[P2]** keyboard `1-8` + demo rotation must use the sorted nav list and account for Trends as a 9th
  module; T13 needs a real category→module map; captions must tolerate empty `newEvents`.

Net: the Codex run paid for itself — it caught real lifecycle/aliasing/perf bugs in the brand-new
historian + demo tasks that a pure-Claude panel missed.

**Trim the tail (accepted):**
- **Task 15** (registry micro-opt) → **DEFER** (pure code quality, zero expert payoff).
- **Task 16** (clipboard JSON export) → **DEFER** (experts export CSV trends not one sample; and
  `navigator.clipboard` throws under `file://`). Superseded in spirit by the Trends view.
- **Task 12** (header mini-sparklines) → **CUT** (1-second window = motion not insight; the Trends
  view supersedes it; keep the topbar calm/authoritative).
- **Task 17** (info strips) → **REFRAME**: drop the `<details>` element; fold the one useful sentence
  into the existing `.crumb` subtitle each view-head already has.
- **Task 18** (responsive) → **REFRAME**: CSS-only graceful reflow at 1080px; drop the hamburger /
  collapsible-overlay rail JS (keeps it desktop-SCADA-honest, no new stateful chrome).

**Revised wave plan:** Wave 1 unchanged minus T5-favicon-trivial-kept. Wave 2 adds T19 (Trends) and
gains the schematic vertical-slice gate (T1+T7 first, freeze `U.Schematic` API, then T8/T9). Wave 3
adds T20 (Demo mode), drops T12/T15/T16, reframes T17/T18. Net IN-scope count ≈ 15 (was 18), but
concentrated on credibility + demo impact.
