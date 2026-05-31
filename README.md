# bas-ems

A **purely static, client-side** web app that simulates a semiconductor fab's
**Building Automation System (BAS)** and **Energy Management System (EMS)** — the
facilities brain of the plant — in the visual/functional language of industrial
SCADA platforms. No backend, no auth, no server state, no network calls, no build
step, no dependencies.

> **Simulation · Synthetic Data.** Everything shown is generated client-side from a
> hash-seeded pseudo-random model. It is not connected to any real fab.

## Run it

- **Folder:** open `index.html` directly (`file://`) in Chrome or Firefox, or serve
  the folder from any static host.
- **Single file:** open `bas-ems.html` — the entire app inlined into one emailable
  HTML file. Regenerate it with `bun build-single.mjs` (or `node build-single.mjs`).

No install, no server required. Works fully offline.

## What it shows

A connected fab where **production drives facility load**. Real smart-factory events
(SECS/GEM collection events via S6F11, SEMI E10 equipment states, AMHS/OHT moves,
APC/FDC excursions, S5F1 alarms) stream nonstop and visibly push HVAC, chilled water,
UPW, exhaust/abatement, gas, and power.

Modules:
- **Production Floor** — the living-fab hero: process events rippling into facility
  systems, live event log, E79 OEE, active process jobs, E10 equipment states.
- **Cleanroom** — per-bay ISO 14644 class, temp/RH, ΔP cascade, ULPA FFU airflow.
- **Cooling / CHW** — chiller plant staging, PCW loops, cooling towers.
- **Ultrapure Water** — 18.2 MΩ·cm resistivity, TOC, reclaim, train status.
- **Gas & Exhaust** — bulk gas yard, specialty gas cabinets, segregated exhaust +
  wet scrubbers + thermal oxidizers.
- **Energy Command Center** — total demand, sub-metering, intensity, power quality.
- **Sustainability** — CO₂e, renewable mix, water reuse, decarbonization targets.
- **Master Data** — asset hierarchy + lazy point/tag registry.

## How it works

- **One virtual clock, one hash-seeded PRNG.** A 180 s loop represents 60 simulated
  minutes (20× compression). All data derives from `hash(channel + ':' + tick)` on an
  exact 8 Hz × 1440-tick grid, so the entire run is reproducible and **loop-identical**.
- **Seam-free loop by construction.** `facilityLoad(t)` is a periodic sum over the
  whole-loop event set using wrapped time distance; every E10 state and alarm is
  closed within the loop. No visible reset at the wrap.
- **Zero dependencies, `file://`-safe.** Classic `<script>` tags on `window.BAS`
  (not ES modules — those are blocked from `file://`), no `fetch`, system fonts only.

## Layout

```
index.html            ordered <script>/<link> includes
bas-ems.html          single-file build (generated)
styles/               tokens.css, layout.css, components.css
src/engine/           prng, clock, master-data, events, load-model, sim  (the frozen contract)
src/ui/               util, widgets, ticker, livefab
src/modules/          production + cleanroom, cooling, upw, gas-exhaust, energy, sustainability, masterdata
src/app/              shell (top bar/nav/event rail/routing), main (boot + RAF loop)
CONTRACT.md           the module build contract (frame shape + UI primitive APIs)
_selftest.mjs         headless engine test (bun _selftest.mjs) — 22 checks
build-single.mjs      inlines everything into bas-ems.html
```

## Roadmap

The living-fab hero is Canvas-2D today. A documented future upgrade swaps it for a
WebGL 2.5D fab floor (OHT vehicles on tracks, flowing pipe networks, bays illuminating
on process events) without touching the engine or data modules.
