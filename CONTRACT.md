# bas-ems — Module Build Contract (FROZEN)

Read this fully before implementing any module. The engine and UI are done and
verified. Your job is to implement ONE module file against this contract.
`src/modules/production.js` is the canonical reference module — read it.

## Hard rules (file:// + offline safe)
- Plain **classic script** IIFE. NO `import`/`export`, NO `fetch`, NO web fonts, NO external libs.
- Wrap everything: `(function (BAS) { 'use strict'; ... })(window.BAS);`
- All data comes from the `frame` and `BAS.master`. Never invent a data source.
- Derive analog readouts from setpoints + coupling + `BAS.ui.jitter(channel, frame.tick, amp)` so they shimmer deterministically (loop-identical). Use `frame.tick` as the tick.
- No per-frame allocation in hot paths. Sparklines: `push()` + `render()` every frame. Throttle table/innerHTML rebuilds with a frame counter (`if (fc++ % 8 === 0)`).

## Module registration
```js
BAS.registerModule({
  id: 'cooling', title: 'Cooling / CHW',
  group: 'BAS' | 'EMS' | 'Master Data' | 'Operations',
  order: 2, icon: 'cleanroom'|'cooling'|'water'|'gas'|'energy'|'leaf'|'flow'|'db'|'grid',
  mount: function (root) { /* build DOM ONCE into root; store widget refs in closure vars */ },
  update: function (frame) { /* called every animation frame while this view is active */ }
});
```
The module is a singleton; `mount` is called once, `update` many times. Keep refs in closure-scope vars declared at the top of the IIFE.

## `frame` (the sim(t) contract) — what update() receives
```
frame.t        // loop seconds 0..180
frame.tick     // integer 0..1439 (use for jitter determinism)
frame.sim      // { hh, mm, ss, hms:'HH:MM:SS', progress:0..1, simMin:0..60 }
frame.load     // {
  totalKW, processKW, facilityKW, hvacKW, chwKW, upwKW, gasKW, exhaustKW, otherKW, abateKW,
  overheadRatio,                 // facility / process
  pcwRT, chwRT,                  // process-cooling + chilled-water tons
  upwFlow,                       // m3/h
  n2Flow,                        // Nm3/h
  exGenCFM, exAcidCFM, exSolCFM, exHeatCFM,   // exhaust header flows (CFM)
  procActive,                    // active process delta kW
  areaKW: { LITHO, ETCH, DIFF, IMPL, CMP, WET, THIN, METRO }   // per-area process kW
}
frame.kpis     // {
  totalMW, processMW, facilityMW, overheadRatio, demandPeakMW, demandPct,
  wpmh,                          // wafer moves / hour
  energyPerMove,                 // kWh per wafer-move
  specificEnergy,                // MWh per wafer-out (fab KPI, slow)
  co2eRate,                      // tCO2e / hour
  renewablePct, waterReusePct,
  costRate,                      // $/hour
  upwResistivity,                // ~18.2 MΩ·cm
  upwTOC,                        // ppb
  oee: { availability, utilization, performance, quality, oee },   // all 0..1
  avgMW
}
frame.newEvents  // events that fired since last frame (array; may be empty)
frame.alarms     // active alarms now: [{ tool, area, alid, text, sev, set, clear }]
frame.toolStates // { toolId: 'Productive'|'Standby'|'Engineering'|'Scheduled Down'|'Unscheduled Down'|'Non-Scheduled' }
frame.areaStates // { AREAID: { Productive, Standby, Engineering, 'Scheduled Down', 'Unscheduled Down', 'Non-Scheduled', total } }
frame.model      // { jobs, events, e10, alarms, activeJobsAt(t), e10StateAt(id,t), alarmsActiveAt(t), eventsInWindow(a,b), CEID, E10 }
```
An event object: `{ seq, sec, tick, type, ceid|alid, area, tool, cls, sev, lotId?, recipe?, carrierId?, wafer?, vehicle?, e10?, text? }`.
`cls` ∈ lot|job|wafer|amhs|fdc|alarm|state. `sev` ∈ INFO|MINOR|MAJOR|CRIT.

## `BAS.master`
```
master.SITE                       // 'FAB-1'
master.areas                      // [{id,name,kinds,count,baseKW,exhaust}]  (8 areas)
master.recipes(areaId) -> [names]
master.tools                      // [{id,name,area,areaName,kind,baseKW,exhaust,loadPorts}] (~58)
master.toolById(id) / master.toolsInArea(areaId)
master.facility = {
  chillers:[{id,name,ratingRT:1500,stages:4}], coolingTowers, chwPumps, pcwLoops:[{id,name,setpointC:20}],
  mau:[{id,name,cfm:80000}], ahu, upwTrains, bulkGas:[{id,name,gas,unit}], gasCabinets,
  scrubbers, oxidizers, switchgear:[{id,name,kV:13.8}], ups:[{id,name,kVA:800}], generators:[{id,name,kW:2500}]
}
master.bays                       // [{id,name,area,iso,ffuCount,tempSetC:21.5,rhSet:43}] (8 bays)
master.hierarchy                  // {id,name,type,children:[...]}  recursive tree
master.pointsForEquipment(id)     // lazy: [{tag,desc,unit,bus,addr,nominal}]
master.categoryFor(id)            // 'tool'|'CHW'|'HVAC'|'UPW'|'GAS'|'EXHAUST'|'POWER'
```

## `BAS.ui`
```
el(tag, cls?, html?) -> element
clear(node)
panel(title, {cls?, bodyCls?:'flush'|'tight', meta?, metaId?, pill?}) -> panel   // panel._body, panel._head
fmt = { n(v,d), int(v), kw(v), mw(v,d), pct(v,d), money(v), delta(v,d,unit) }
band(v, warnAt, badAt, invert) -> 'good'|'warn'|'bad'
jitter(channel, tick, amp) -> deterministic ±amp
fitCanvas(canvas, cssH) -> ctx2d   // DPR-aware
svg(tag, attrs), SVGNS
stateBadge('Productive') -> span.badge
cssVar('--accent'), group(12345)->'12,345', icon('cooling')->'<svg…>'

kpi({label, unit?, accent?, showDelta?}) -> { node, set(value, {unit?, delta?, dir?:'up'|'down'|'flat', state?:'good'|'warn'|'bad'}) }
Sparkline(canvas, {n?:120, color?, fill?:true, min?, max?, height?:44}) -> { push(v), render() }
gauge({min, max, unit, label, size?:120, color?, thresholds?:{warn,bad,invert}, fmt?}) -> { node, set(v, label?) }
table(columns, {maxH?}) -> { node, set(rows) }     // columns: [{label, key?, render?(row), tdCls?, thCls?}]
barList(items) -> { node, set(vals) }              // items:[{label}], vals:[{text, pct, cls?:'good'|'warn'|'bad'}]
Ticker(streamEl, {showAll?, maxRows?, rateEl?, filterCls?}) -> { push(events, sim) }
LiveFab(canvas) -> { update(frame) }
```

## Layout conventions
- Top of view: `var head = el('div','view-head'); head.innerHTML = '<h1>Title</h1><span class="crumb">FAB-1 · …</span>'; root.appendChild(head);`
- Then a `el('div','grid')` containing `U.panel(title,{cls:'col-8'})` etc. Columns: `col-12 col-9 col-8 col-7 col-6 col-5 col-4 col-3`.
- Put a `<canvas class="spark">` inside a panel body for sparklines; give it `style.height`.
- Use `stat-line` rows (`<div class="stat-line"><span class="k">…</span><span class="v">…</span></div>`) for key/value lists.
- Use `meter` bars: `<div class="meter good"><i style="width:NN%"></i></div>`.

## Determinism helper pattern (believable analog readouts)
```js
function analog(channel, frame, base, amp) { return base + BAS.ui.jitter(channel, frame.tick, amp); }
// e.g. supplyTemp = analog('chws', frame, 6.5, 0.15);
```
Use the loosely-coupled `frame.load.*` channels for anything that should track production; use jitter for sensor shimmer on otherwise-steady setpoints.

## Domain accuracy must-haves (an expert will check)
- UPW resistivity target **18.2 MΩ·cm @25°C**; TOC in **ppb** (sub-ppb good).
- Cleanroom: tool bays **ISO 3–5**; particle counts ≥0.5µm/m³ must match class (ISO3≈35, ISO4≈352, ISO5≈3520) and read **below** the class limit when in-spec. Δpressure **positive**, cleaner zone = higher (Pa). FFU face velocity ~**0.45 m/s**. Use **ULPA** (not HEPA).
- CHW supply ~**6.5°C**, return ~**13.5°C**; PCW ~**20°C**. Chiller plant ~**3.2 kW/RT**. Stage chillers by load.
- **Never surface "PUE"** — use the facility/process overhead ratio in fab framing.
- SECS/GEM **CEID** = integer via S6F11; **alarms** = S5F1 with ALID/ALCD (distinct). E10 six states exactly as listed.
- Exhaust segregation: general / heat / acid / solvent / pyrophoric. Abatement = wet scrubbers + thermal oxidizers, destruction efficiency %.
