/* bas-ems — Cleanroom Environmental (HVAC / FFU / ISO 14644)
 * Classic script -> registers module 'cleanroom'
 *
 * Signature: a bay floor-plan heat-grid hero (col-12 .panel.hud) — the 8 bays
 * as a 2x4 tile wall, each tile glowing by its ≥0.5µm/m³ particle band
 * (good/warn/bad via U.band), reading bay id, ISO class, particle count and
 * differential pressure; a tile pulses .bad when it drops out of spec. A hero
 * KPI strip carries avg temp, avg RH, FFU fan power, FFU units online, mean and
 * worst-bay dP. The bay table + 3 environmental sparklines sit below.
 *
 * Per-bay temp / RH / dP / face-velocity / particle counts derived from each
 * bay's setpoint + ISO class, shimmered deterministically off frame.tick, and
 * coupled to production: FFU fan power tracks frame.load.hvacKW and particle
 * burden rises with per-area Productive load (frame.areaStates). Counts stay
 * BELOW the ISO 14644 >=0.5µm/m³ class limit when in-spec; litho/etch bays hold
 * the tightest differential pressure. ULPA filtration (not HEPA).
 *
 * Constraints honoured: classic IIFE, file://-safe, zero per-frame allocation
 * (all refs built at mount), all data from `frame` (visual shimmer via
 * BAS.ui.wobble -> BAS.prng), seam-free, reduced-motion aware.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;
  var T = (BAS.i18n && BAS.i18n.t) ? BAS.i18n.t : function (s) { return s; };

  // ---- closure-scope refs (filled at mount; mutated, never reallocated) ----
  var hk = {};                  // hero KPI value spans (by key)
  var tiles = [];               // per-bay heat-tile refs
  var bayTbl;                   // bay table
  var trDP, trFlow, trPart;     // trend controllers (sparkline + min/avg/max ring)
  var fc = 0;

  // ISO 14644-1 >=0.5µm/m³ class concentration limits (the cap we stay under).
  var ISO_LIMIT = { 3: 35, 4: 352, 5: 3520 };
  // Differential-pressure setpoint by ISO class — cleaner (lower ISO) bays are
  // pressurized higher to cascade air outward toward dirtier zones (Pa).
  var DP_SET = { 3: 17.5, 4: 13.0, 5: 9.5 };

  // short tile labels by area id (the bay's area)
  var AREA_SHORT = {
    LITHO: 'LITHO', ETCH: 'ETCH', DIFF: 'DIFF', IMPL: 'IMPL',
    CMP: 'CMP', WET: 'WET', THIN: 'THIN', METRO: 'METRO'
  };

  BAS.registerModule({
    id: 'cleanroom', title: 'Cleanroom', group: 'BAS', order: 1, icon: 'cleanroom',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>' + T('Cleanroom Environmental') + '</h1>' +
        '<span class="crumb">FAB-1 · HVAC · FFU · ISO 14644 · ULPA</span>' +
        '<span class="right">' + T('FFU fan power tracks HVAC load') + ' &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- Row 1: bay floor-plan heat-grid hero (col-12, hud) -----------
      var heroP = U.panel('Cleanroom Floor Plan — ISO 14644 Air Cleanliness',
        { cls: 'col-12 hud', pill: 'LIVE', meta: '8 bays · ULPA FFU · particle band', metaId: 'crHeroMeta' });
      var hero = el('div', 'pg-hero cr-hero');

      // left signature: the 2x4 bay tile wall
      var sig = el('div', 'cr-floor-sig');
      sig.appendChild(el('div', 'pg-hero-label', T('BAY FLOOR PLAN — ≥0.5µm/m³ vs ISO LIMIT')));
      var floor = el('div', 'heat-grid cr-floor');
      for (var bi = 0; bi < M.bays.length; bi++) {
        var bay = M.bays[bi];
        var tile = el('div', 'heat-tile');
        var glow = el('i', 'glow');
        tile.appendChild(glow);                                   // glow MUST be first child
        var lab = el('div', 'lab');
        lab.textContent = (AREA_SHORT[bay.area] || bay.area) + ' · ISO ' + bay.iso;
        tile.appendChild(lab);
        var v = el('div', 'v', '—');                              // particle count
        tile.appendChild(v);
        var sub = el('div', 'cr-tile-sub');
        var dpEl = el('span', 'cr-tile-dp', '—');                 // dP read
        var idEl = el('span', 'cr-tile-id', shortId(bay.id));     // BAY-0N
        sub.appendChild(idEl); sub.appendChild(dpEl);
        tile.appendChild(sub);
        floor.appendChild(tile);
        tiles.push({
          id: bay.id, tile: tile, glow: glow, v: v, dp: dpEl,
          lastState: '', lastV: -1, lastDp: -1, lastSpec: -1
        });
      }
      sig.appendChild(floor);
      hero.appendChild(sig);

      // right KPI strip
      var kpis = el('div', 'pg-hero-kpis cr-kpis');
      [['temp', 'Avg Temp', '°C', ''],
       ['rh', 'Avg RH', '%', ''],
       ['ffuKW', 'FFU Fan Power', 'MW', 'accent'],
       ['ffuOn', 'FFU Online', '', ''],
       ['dp', 'Mean dP', 'Pa', ''],
       ['worst', 'Worst Bay dP', 'Pa', '']
      ].forEach(function (k) {
        var box = el('div', 'pg-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', T(k[1])));
        var vv = el('div', 'v');
        var vn = el('span'); vv.appendChild(vn);
        if (k[2]) { var vu = el('span', 'u', k[2]); vv.appendChild(vu); }
        vv._num = vn;
        box.appendChild(vv);
        kpis.appendChild(box);
        hk[k[0]] = box;          // keep box so we can recolour worst-dP cell
        hk[k[0]]._num = vn;
      });
      hero.appendChild(kpis);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // ---- Row 2 left: cleanroom bays table (col-8) ---------------------
      var bayP = U.panel('Bay Detail — Temp · RH · dP · FFU · Particles',
        { cls: 'col-8', bodyCls: 'flush', meta: '8 bays · ULPA FFU', metaId: 'crBayMeta' });
      bayTbl = U.table([
        { label: 'Bay', key: 'bay', tdCls: 'name' },
        { label: 'Area', key: 'area' },
        { label: 'ISO', render: function (r) { return 'ISO ' + r.iso; } },
        { label: 'Temp °C', key: 'temp', tdCls: 'num' },
        { label: 'RH %', key: 'rh', tdCls: 'num' },
        { label: 'dP Pa', render: dpCell, tdCls: 'num' },
        { label: 'FFU online', render: ffuCell },
        { label: 'Airflow m/s', key: 'flow', tdCls: 'num' },
        { label: '≥0.5µm /m³', render: partCell, tdCls: 'num' },
        { label: 'Status', render: function (r) { return r.badge; } }
      ], { maxH: '360px' });
      bayP._body.appendChild(bayTbl.node);
      grid.appendChild(bayP);

      // ---- Row 2 right: environmental trends (3 sparklines) -------------
      var trendP = U.panel('Environmental Trends', { cls: 'col-4' });
      trDP = trendRow(trendP._body, 'Mean Differential Pressure', 'Pa', U.cssVar('--accent'), 1, false);
      trFlow = trendRow(trendP._body, 'FFU Face Velocity', 'm/s', U.cssVar('--accent-2'), 3, false);
      trPart = trendRow(trendP._body, 'Particles ≥0.5µm', '/m³', U.cssVar('--purple'), 0, true);
      grid.appendChild(trendP);

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var tick = frame.tick;

      // FFU fan power couples to total HVAC fan load (MAU + AHU + FFU); FFU
      // banks are ~35% of HVAC kW. Shimmer the reading lightly.
      var ffuKW = frame.load.hvacKW * 0.35 + U.jitter('cr:ffu', tick, 60);

      // Aggregate the 8 bays for the hero KPIs, the heat-grid, and trends.
      var sumT = 0, sumRH = 0, sumDP = 0, sumFlow = 0, sumPart = 0;
      var ffuOnline = 0, ffuTotal = 0;
      var worstDp = 1e9, worstName = '';
      var rows = (fc % 8 === 1) ? [] : null;
      // throttle the heat-grid glow/text rewrites (change-gated within)
      var paintTiles = (fc % 4 === 0);

      for (var i = 0; i < M.bays.length; i++) {
        var bay = M.bays[i];
        var s = sampleBay(bay, frame);
        sumT += s.tempN; sumRH += s.rhN; sumDP += s.dpN; sumFlow += s.flowN; sumPart += s.partN;
        ffuOnline += s.row.ffuOn; ffuTotal += s.row.ffu;
        if (s.dpN < worstDp) { worstDp = s.dpN; worstName = T(bay.name); }
        if (rows) rows.push(s.row);
        if (paintTiles) paintTile(tiles[i], s);
      }
      var nb = M.bays.length;
      var avgT = sumT / nb, avgRH = sumRH / nb, avgDP = sumDP / nb;
      var avgFlow = sumFlow / nb, avgPart = sumPart / nb;

      // Sparklines: push every frame, render + chips on a throttle.
      trDP.push(avgDP);
      trFlow.push(avgFlow);
      trPart.push(avgPart);
      if (fc % 8 === 0) { trDP.chips(); trFlow.chips(); trPart.chips(); }

      // ---- hero KPI strip (cheap text writes; change-gated by textContent) ----
      hk.temp._num.textContent = avgT.toFixed(2);
      hk.rh._num.textContent = avgRH.toFixed(1);
      hk.ffuKW._num.textContent = (ffuKW / 1000).toFixed(2);
      hk.ffuOn._num.textContent = ffuOnline + ' / ' + ffuTotal;
      hk.dp._num.textContent = '+' + avgDP.toFixed(1);
      hk.worst._num.textContent = '+' + worstDp.toFixed(1);
      // recolour the worst-bay cell by its dP band (low dP = bad cascade)
      var ws = U.band(worstDp, 6, 4, true);
      var wcls = ws === 'bad' ? 'bad' : ws === 'warn' ? 'warn' : 'good';
      if (hk.worst._cls !== wcls) {
        hk.worst._cls = wcls;
        hk.worst.classList.remove('good', 'warn', 'bad');
        hk.worst.classList.add(wcls);
      }
      if (fc % 16 === 0) {
        var meta = document.getElementById('crHeroMeta');
        if (meta) meta.textContent = worstName + ' ' + T('lowest') + ' · ' + ffuOnline + '/' + ffuTotal + ' FFU ' + T('online');
      }

      // Heavy table rebuild throttled to every 8 frames.
      if (rows) bayTbl.set(rows);
    }
  });

  // ---- heat-tile painter (change-gated; called on a throttle) ----------
  function paintTile(t, s) {
    var st = s.row.partState;                                     // good/warn/bad
    var cls = st === 'bad' ? 'bad' : st === 'warn' ? 'warn' : 'ok';
    if (cls !== t.lastState) {
      t.lastState = cls;
      t.tile.classList.remove('ok', 'warn', 'bad');
      t.tile.classList.add(cls);
    }
    // out-of-spec = dP cascade failed OR particles in bad band -> pulse the tile
    var spec = (s.row.dpState === 'bad' || st === 'bad') ? 1 : 0;
    if (spec !== t.lastSpec) {
      t.lastSpec = spec;
      t.tile.classList.toggle('cr-oos', !!spec);
    }
    // glow intensity by particle fraction of the class limit (0.10..0.55)
    var op = 0.10 + Math.max(0, Math.min(1, s.frac)) * 0.45;
    t.glow.style.opacity = op.toFixed(2);
    if (s.row.part !== t.lastV) {
      t.lastV = s.row.part;
      t.v.textContent = U.group(s.row.part);
    }
    var dpR = Math.round(s.dpN * 10);
    if (dpR !== t.lastDp) {
      t.lastDp = dpR;
      t.dp.textContent = '+' + s.dpN.toFixed(1) + ' Pa';
    }
  }

  // ---- per-bay analog model -------------------------------------------
  function sampleBay(bay, frame) {
    var tf = frame.tickF, ch = 'cr:' + bay.id + ':';
    var iso = bay.iso;

    // Busy fraction for this bay's area (Productive tools / total) couples the
    // particle burden and nudges temp/RH/dP control effort.
    var as = frame.areaStates[bay.area];
    var busy = as && as.total ? as.Productive / as.total : 0;

    // Smooth (interpolated) shimmer so the trend traces flow instead of stepping.
    // Temperature: tight ±0.2°C control around the 21.5°C setpoint, a touch
    // warmer when the bay is loaded (tool heat) before reheat trims it.
    var temp = bay.tempSetC + U.wobble(ch + 't', tf, 0.2) + busy * 0.12;
    // RH: ±0.2-scaled around the 43% setpoint with a slow seasonal wander.
    var rh = bay.rhSet + U.wobble(ch + 'rh', tf, 0.9) - busy * 0.5;

    // Differential pressure: positive cascade, setpoint by ISO class. Litho/etch
    // (lowest ISO) hold tightest — smaller band on the cleaner bays.
    var dpBand = iso <= 3 ? 0.4 : iso <= 4 ? 0.7 : 1.0;
    var dp = DP_SET[iso] + U.wobble(ch + 'dp', tf, dpBand) + busy * 0.6;

    // FFU face velocity: ULPA design point ~0.45 m/s, gentle shimmer; ramps
    // marginally with HVAC fan load to defend pressure under burden.
    var hvacScale = 1 + (frame.load.hvacKW - 11000) / 11000 * 0.04;
    var flow = (0.45 * hvacScale) + U.wobble(ch + 'fv', tf, 0.012);

    // FFU units online: nearly all of the bay's ULPA banks run; a handful sit in
    // standby, shrinking under HVAC fan burden (more units commanded on).
    var offFrac = 0.05 - (hvacScale - 1) * 0.4 + U.wobble(ch + 'ffu', tf, 0.015);
    if (offFrac < 0) offFrac = 0; if (offFrac > 0.12) offFrac = 0.12;
    var ffuOn = Math.max(1, Math.round(bay.ffuCount * (1 - offFrac)));
    var ffuPct = ffuOn / bay.ffuCount * 100;

    // Particle count ≥0.5µm/m³: base 40-70% of the ISO class limit, scaled up
    // with this area's Productive load but always held below the class cap.
    var limit = ISO_LIMIT[iso] || 3520;
    // 0..1 fraction (±0.5 → 0..1), shaped to the 40-70% band.
    var unit01 = 0.5 + U.wobble(ch + 'pf', tf, 0.5);
    var baseFrac = 0.40 + unit01 * 0.30;                         // 40-70%
    var frac = baseFrac + busy * 0.12;                            // load adder
    if (frac > 0.92) frac = 0.92;                                 // never breach
    var part = limit * frac;

    var dpState = U.band(dp, 6, 4, true);                         // low dP = bad
    var partState = U.band(frac, 0.75, 0.88);                     // near limit = warn
    var rowState = (dpState === 'bad' || partState === 'bad') ? 'Unscheduled Down'
      : (partState === 'warn' || dpState === 'warn') ? 'Standby' : 'Productive';

    return {
      tempN: temp, rhN: rh, dpN: dp, flowN: flow, partN: part, frac: frac,
      row: {
        bay: T(bay.name), area: bay.area, iso: iso,
        temp: temp.toFixed(2), rh: rh.toFixed(1),
        dp: dp, dpState: dpState,
        ffu: bay.ffuCount, ffuOn: ffuOn, ffuPct: ffuPct,
        flow: flow.toFixed(3),
        part: Math.round(part), limit: limit, frac: frac, partState: partState,
        badge: U.stateBadge(rowState).outerHTML
      }
    };
  }

  // ---- cell renderers --------------------------------------------------
  function dpCell(r) {
    var c = r.dpState === 'bad' ? 'var(--bad)' : r.dpState === 'warn' ? 'var(--warn)' : 'var(--good)';
    return '<span style="color:' + c + '">+' + r.dp.toFixed(1) + '</span>';
  }
  function ffuCell(r) {
    var cls = r.ffuPct >= 97 ? 'good' : r.ffuPct >= 92 ? 'warn' : 'bad';
    var pct = Math.max(0, Math.min(100, r.ffuPct));
    return '<span class="cr-ffu">' +
      '<span class="td-meter ' + cls + '"><i style="width:' + pct.toFixed(0) + '%"></i></span>' +
      '<span class="cr-ffu-n">' + r.ffuOn + '/' + r.ffu + '</span></span>';
  }
  function partCell(r) {
    var c = r.partState === 'bad' ? 'var(--bad)' : r.partState === 'warn' ? 'var(--warn)' : 'var(--text)';
    return '<span style="color:' + c + '">' + U.group(r.part) + '</span>' +
      '<span class="dim" style="font-size:var(--fs-0)"> / ' + U.group(r.limit) + '</span>';
  }

  // ---- small builders --------------------------------------------------
  // Builds a labelled sparkline + a min/avg/max chip row, and returns a
  // controller {push, chips}. We mirror the Sparkline's own decimation (slow:15)
  // into a pre-allocated stat ring so the chips reflect exactly what is drawn,
  // with zero per-frame allocation.
  function trendRow(body, label, unit, color, dec, group) {
    var wrap = el('div'); wrap.style.margin = '0 0 12px';
    var top = el('div');
    top.style.display = 'flex'; top.style.justifyContent = 'space-between';
    top.style.alignItems = 'baseline'; top.style.marginBottom = '4px';
    top.appendChild(el('span', 'dim', T(label)));
    var u = el('span', 'mono', unit);
    u.style.fontSize = 'var(--fs-0)'; u.style.color = 'var(--text-mut)';
    top.appendChild(u);
    wrap.appendChild(top);
    var c = el('canvas', 'spark'); c.style.height = '46px';
    wrap.appendChild(c);
    // min/avg/max chip row under the trace
    var refs = {};
    var chipsEl = el('div', 'chip-row cr-chips');
    [['MIN', 'min'], ['AVG', 'avg'], ['MAX', 'max']].forEach(function (k) {
      var chip = el('div', 'chip');
      chip.appendChild(el('span', 'k', k[0]));
      var cv = el('span', 'v', '—'); chip.appendChild(cv);
      chipsEl.appendChild(chip);
      refs[k[1]] = cv;
    });
    wrap.appendChild(chipsEl);
    body.appendChild(wrap);

    var SLOW = 15;
    var sp = U.Sparkline(c, { color: color, height: 46, fill: true, slow: SLOW }); // ~5x slower than the global 3x
    // pre-allocated stat ring mirroring the sparkline's recorded samples
    var N = 120, ring = new Float32Array(N), head = 0, cnt = 0, pc = 0;

    function push(v) {
      sp.push(v); sp.render();
      // record only on the same cadence the sparkline keeps a sample
      pc++; if (pc % SLOW !== 0) return;
      ring[head] = v; head = (head + 1) % N; if (cnt < N) cnt++;
    }
    function chips() {
      if (cnt < 1) return;
      var mn = Infinity, mx = -Infinity, sum = 0;
      for (var i = 0; i < cnt; i++) { var x = ring[i]; if (x < mn) mn = x; if (x > mx) mx = x; sum += x; }
      var avg = sum / cnt;
      refs.min.textContent = fmtN(mn); refs.avg.textContent = fmtN(avg); refs.max.textContent = fmtN(mx);
    }
    function fmtN(x) { return group ? U.group(Math.round(x)) : x.toFixed(dec); }
    return { push: push, chips: chips };
  }

  // ---- helpers ---------------------------------------------------------
  function shortId(id) { return id.replace('BAY-', 'B'); }       // BAY-01 -> B01
})(window.BAS);
