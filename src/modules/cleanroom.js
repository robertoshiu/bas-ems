/* bas-ems — Cleanroom Environmental (HVAC / FFU / ISO 14644)
 * Classic script -> registers module 'cleanroom'
 * Per-bay temp / RH / dP / face-velocity / particle counts derived from each
 * bay's setpoint + ISO class, shimmered deterministically off frame.tick, and
 * coupled to production: FFU fan power tracks frame.load.hvacKW and particle
 * burden rises with per-area Productive load (frame.areaStates). Counts stay
 * BELOW the ISO 14644 ≥0.5µm/m³ class limit when in-spec; litho/etch bays hold
 * the tightest differential pressure. ULPA filtration (not HEPA).
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;

  // top-row KPIs
  var kTemp, kRH, kFFU, kDP;
  // bay table + trend sparklines
  var bayTbl, spDP, spFlow, spPart;
  var fc = 0;

  // ISO 14644-1 ≥0.5µm/m³ class concentration limits (the cap we stay under).
  var ISO_LIMIT = { 3: 35, 4: 352, 5: 3520 };
  // Differential-pressure setpoint by ISO class — cleaner (lower ISO) bays are
  // pressurized higher to cascade air outward toward dirtier zones (Pa).
  var DP_SET = { 3: 17.5, 4: 13.0, 5: 9.5 };

  BAS.registerModule({
    id: 'cleanroom', title: 'Cleanroom', group: 'BAS', order: 1, icon: 'cleanroom',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Cleanroom Environmental</h1>' +
        '<span class="crumb">FAB-1 · HVAC · FFU · ISO 14644 · ULPA</span>' +
        '<span class="right">FFU fan power tracks HVAC load &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (2) top row: 4 KPI tiles -----------------------------------
      kTemp = kpiPanel(grid, 'Avg Bay Temperature', U.kpi({ label: 'Mean — all bays', unit: '°C', showDelta: true }));
      kRH = kpiPanel(grid, 'Avg Relative Humidity', U.kpi({ label: 'Mean — all bays', unit: '%', showDelta: true }));
      kFFU = kpiPanel(grid, 'Total FFU Fan Power', U.kpi({ label: 'ULPA fan-filter units', unit: 'MW', accent: true, showDelta: true }));
      kDP = kpiPanel(grid, 'Mean Differential Pressure', U.kpi({ label: 'Bay → sub-fab cascade', unit: 'Pa', showDelta: true }));

      // ---- (3) cleanroom bays table -----------------------------------
      var bayP = U.panel('Cleanroom Bays — ISO 14644 Air Cleanliness', { cls: 'col-8', bodyCls: 'flush', meta: '8 bays · ULPA FFU', metaId: 'crBayMeta' });
      bayTbl = U.table([
        { label: 'Bay', key: 'bay', tdCls: 'name' },
        { label: 'Area', key: 'area' },
        { label: 'ISO', render: function (r) { return 'ISO ' + r.iso; } },
        { label: 'Temp °C', key: 'temp', tdCls: 'num' },
        { label: 'RH %', key: 'rh', tdCls: 'num' },
        { label: 'dP Pa', render: dpCell, tdCls: 'num' },
        { label: 'FFU', key: 'ffu', tdCls: 'num' },
        { label: 'Airflow m/s', key: 'flow', tdCls: 'num' },
        { label: '≥0.5µm /m³', render: partCell, tdCls: 'num' },
        { label: 'Status', render: function (r) { return r.badge; } }
      ], { maxH: '340px' });
      bayP._body.appendChild(bayTbl.node);
      grid.appendChild(bayP);

      // ---- (4) environmental trends (3 sparklines) --------------------
      var trendP = U.panel('Environmental Trends', { cls: 'col-4' });
      spDP = trendRow(trendP._body, 'Mean Differential Pressure', 'Pa', U.cssVar('--accent'));
      spFlow = trendRow(trendP._body, 'FFU Face Velocity', 'm/s', U.cssVar('--accent-2'));
      spPart = trendRow(trendP._body, 'Particles ≥0.5µm', '/m³', U.cssVar('--purple'));
      grid.appendChild(trendP);

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var tick = frame.tick;

      // FFU fan power couples to total HVAC fan load (MAU + AHU + FFU); FFU
      // banks are ~35% of HVAC kW. Shimmer the reading lightly.
      var ffuKW = frame.load.hvacKW * 0.35 + U.jitter('cr:ffu', tick, 60);

      // Aggregate the 8 bays for the top KPIs and the trend buffers.
      var sumT = 0, sumRH = 0, sumDP = 0, sumFlow = 0, sumPart = 0;
      var rows = (fc % 8 === 1) ? [] : null;

      for (var i = 0; i < M.bays.length; i++) {
        var bay = M.bays[i];
        var s = sampleBay(bay, frame);
        sumT += s.tempN; sumRH += s.rhN; sumDP += s.dpN; sumFlow += s.flowN; sumPart += s.partN;
        if (rows) rows.push(s.row);
      }
      var nb = M.bays.length;
      var avgT = sumT / nb, avgRH = sumRH / nb, avgDP = sumDP / nb;
      var avgFlow = sumFlow / nb, avgPart = sumPart / nb;

      // Sparklines: push + render every frame.
      spDP.push(avgDP); spDP.render();
      spFlow.push(avgFlow); spFlow.render();
      spPart.push(avgPart); spPart.render();

      // Top KPIs (cheap enough to set each frame; values are pre-jittered).
      kTemp.set(avgT.toFixed(2), {
        delta: U.fmt.delta(avgT - 21.5, 2), dir: dir(avgT - 21.5, 0.15),
        state: U.band(Math.abs(avgT - 21.5), 0.3, 0.6)
      });
      kRH.set(avgRH.toFixed(1), {
        delta: U.fmt.delta(avgRH - 43, 1), dir: dir(avgRH - 43, 0.4),
        state: U.band(Math.abs(avgRH - 43), 1.5, 3)
      });
      kFFU.set((ffuKW / 1000).toFixed(2), {
        delta: U.fmt.kw(ffuKW), dir: 'flat'
      });
      kDP.set('+' + avgDP.toFixed(1), {
        delta: U.fmt.delta(avgDP - 12, 1), dir: dir(avgDP - 12, 0.5),
        state: avgDP >= 5 ? 'good' : 'warn'
      });

      // Heavy table rebuild throttled to every 8 frames.
      if (rows) bayTbl.set(rows);
    }
  });

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

    // Particle count ≥0.5µm/m³: base 40-80% of the ISO class limit, scaled up
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
      tempN: temp, rhN: rh, dpN: dp, flowN: flow, partN: part,
      row: {
        bay: bay.name, area: bay.area, iso: iso,
        temp: temp.toFixed(2), rh: rh.toFixed(1),
        dp: dp, dpState: dpState,
        ffu: bay.ffuCount, flow: flow.toFixed(3),
        part: Math.round(part), limit: limit, partState: partState,
        badge: U.stateBadge(rowState).outerHTML
      }
    };
  }

  // ---- cell renderers --------------------------------------------------
  function dpCell(r) {
    var c = r.dpState === 'bad' ? 'var(--bad)' : r.dpState === 'warn' ? 'var(--warn)' : 'var(--good)';
    return '<span style="color:' + c + '">+' + r.dp.toFixed(1) + '</span>';
  }
  function partCell(r) {
    var c = r.partState === 'bad' ? 'var(--bad)' : r.partState === 'warn' ? 'var(--warn)' : 'var(--text)';
    return '<span style="color:' + c + '">' + U.group(r.part) + '</span>' +
      '<span class="dim" style="font-size:var(--fs-0)"> / ' + U.group(r.limit) + '</span>';
  }

  // ---- small builders --------------------------------------------------
  function kpiPanel(grid, title, kpi) { grid.appendChild(U.kpiPanel(title, kpi)); return kpi; }
  function trendRow(body, label, unit, color) {
    var wrap = el('div'); wrap.style.margin = '0 0 10px';
    var top = el('div');
    top.style.display = 'flex'; top.style.justifyContent = 'space-between';
    top.style.alignItems = 'baseline'; top.style.marginBottom = '3px';
    top.appendChild(el('span', 'dim', label));
    var u = el('span', 'mono', unit);
    u.style.fontSize = 'var(--fs-0)'; u.style.color = 'var(--text-mut)';
    top.appendChild(u);
    wrap.appendChild(top);
    var c = el('canvas', 'spark'); c.style.height = '46px';
    wrap.appendChild(c);
    body.appendChild(wrap);
    return U.Sparkline(c, { color: color, height: 46, fill: true, slow: 15 }); // ~5x slower than the global 3x
  }

  // ---- helpers ---------------------------------------------------------
  function dir(d, tol) { return d > tol ? 'up' : d < -tol ? 'down' : 'flat'; }
})(window.BAS);
