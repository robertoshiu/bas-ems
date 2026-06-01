/* bas-ems — Sustainability & Carbon (EMS): CO2e accounting, renewable mix,
 * water reuse / balance. Tracks production via frame.kpis.* / frame.load.*.
 * Classic script -> registers module 'sustainability'. file:// + offline safe.
 *
 * Note: never surfaces "PUE"; uses the facility/process overhead ratio in
 * fab framing as the efficiency stat instead.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, fmt = U.fmt;

  // grid emission factor used by sim.js for the Scope 2 calc (kgCO2e/kWh).
  var GRID_EF = 0.34;

  // gauges + KPIs
  var kCO2, gRen, gReu, kInt;
  // carbon accounting
  var carbRows = {}, renBars, ovStat;
  // water balance
  var waterRows = {}, reuseMeter, reuseMeterVal;
  // sparklines
  var spkCO2, spkRen;
  // decarbonization target live refs (cached at mount)
  var tgtRenVal, tgtRenBar;
  var tgtCO2Val;
  var tgtWaterVal, tgtWaterBar;
  var fc = 0;

  BAS.registerModule({
    id: 'sustainability', title: 'Sustainability', group: 'EMS', order: 2, icon: 'leaf',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Sustainability &amp; Carbon</h1>' +
        '<span class="crumb">FAB-1 · CO₂e · Renewable · Water Reuse</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (2) top KPI / gauge row -------------------------------------
      var co2P = U.panel('CO₂e Rate', { cls: 'col-3' });
      kCO2 = U.kpi({ label: 'Scope 2 — Grid', unit: 't/h', accent: true, showDelta: true });
      co2P._body.appendChild(kCO2.node);
      grid.appendChild(co2P);

      var renP = U.panel('Renewable Mix', { cls: 'col-3' });
      gRen = U.gauge({ label: 'Renewable', unit: '%', min: 0, max: 60, size: 130,
        thresholds: { warn: 25, bad: 18, invert: true }, fmt: pct1 });
      renP._body.appendChild(centered(gRen.node));
      grid.appendChild(renP);

      var reuP = U.panel('Water Reuse', { cls: 'col-3' });
      gReu = U.gauge({ label: 'Reclaim', unit: '%', min: 0, max: 100, size: 130,
        thresholds: { warn: 70, bad: 60, invert: true }, fmt: pct1 });
      reuP._body.appendChild(centered(gReu.node));
      grid.appendChild(reuP);

      var intP = U.panel('Carbon Intensity', { cls: 'col-3' });
      kInt = U.kpi({ label: 'per Wafer-Move', unit: 'kg/move', showDelta: true });
      intP._body.appendChild(kInt.node);
      grid.appendChild(intP);

      // ---- (3) Carbon Accounting --------------------------------------
      var caP = U.panel('Carbon Accounting — GHG Protocol', { cls: 'col-6', meta: 'EF 0.34 kgCO₂e/kWh', metaId: 'caMeta' });
      caP._body.appendChild(statBlock([
        ['s2', 'Scope 2 — Grid (electricity)'],
        ['s1', 'Scope 1 — Direct (combustion / process)'],
        ['day', 'Daily Projection'],
        ['yr', 'Annual Run-rate'],
        ['ef', 'Grid Emission Factor'],
        ['ov', 'Facility Overhead (facility / process)']
      ], carbRows));
      ovStat = carbRows.ov;

      var rsub = el('div'); rsub.style.marginTop = '12px';
      rsub.appendChild(subhead('Generation Mix'));
      renBars = U.barList([
        { label: 'Grid Power' }, { label: 'Solar PPA' }, { label: 'Wind PPA' }
      ]);
      rsub.appendChild(renBars.node);
      caP._body.appendChild(rsub);
      grid.appendChild(caP);

      // ---- (4) Water Balance ------------------------------------------
      var wbP = U.panel('Water Balance — UPW Make-up & Reclaim', { cls: 'col-6', meta: '', metaId: 'wbMeta' });
      wbP._body.appendChild(statBlock([
        ['makeup', 'UPW Make-up (fresh demand)'],
        ['reuse', 'Reclaim / Reuse Return'],
        ['city', 'City Water Intake'],
        ['waste', 'Wastewater to Treatment'],
        ['net', 'Net Consumptive Use']
      ], waterRows));

      var msub = el('div'); msub.style.marginTop = '12px';
      var mtop = el('div'); mtop.style.display = 'flex'; mtop.style.justifyContent = 'space-between';
      mtop.style.fontSize = 'var(--fs-2)';
      mtop.appendChild(el('span', 'dim', 'Reuse Efficiency'));
      reuseMeterVal = el('span', 'mono'); reuseMeterVal.textContent = '—';
      mtop.appendChild(reuseMeterVal);
      reuseMeter = el('div', 'meter good'); var ri = el('i'); ri.style.width = '0%'; reuseMeter.appendChild(ri);
      reuseMeter._fill = ri;
      msub.appendChild(mtop); msub.appendChild(reuseMeter);
      wbP._body.appendChild(msub);
      grid.appendChild(wbP);

      // ---- (5) Sparklines ---------------------------------------------
      var scP = U.panel('CO₂e Rate — Trailing', { cls: 'col-4', bodyCls: 'flush' });
      var c1 = el('canvas', 'spark'); c1.style.height = '120px';
      scP._body.appendChild(c1);
      grid.appendChild(scP);
      spkCO2 = U.Sparkline(c1, { height: 120, color: U.cssVar('--accent'), slow: 9 }); // 3x slower than the global 3x

      var srP = U.panel('Renewable Mix — Trailing', { cls: 'col-4', bodyCls: 'flush' });
      var c2 = el('canvas', 'spark'); c2.style.height = '120px';
      srP._body.appendChild(c2);
      grid.appendChild(srP);
      spkRen = U.Sparkline(c2, { height: 120, color: U.cssVar('--good'), slow: 9 }); // 3x slower than the global 3x

      // ---- targets / context panel ------------------------------------
      var tgP = U.panel('Decarbonization Targets', { cls: 'col-4' });
      tgP._body.appendChild(buildTargets());
      grid.appendChild(tgP);

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var k = frame.kpis, L = frame.load, tick = frame.tick;

      // base channels (loop-identical; sensor shimmer via jitter on tick)
      var co2e = k.co2eRate;                                  // t/h, Scope 2
      var ren = k.renewablePct;                              // %
      var reusePct = k.waterReusePct;                         // %
      var reuse = reusePct / 100;
      var totalKW = L.totalKW;
      var totalMW = totalKW / 1000;

      // sparklines: push + render EVERY frame
      spkCO2.push(co2e); spkCO2.render();
      spkRen.push(ren); spkRen.render();

      // ---- top KPIs / gauges (cheap, every frame) ----------------------
      kCO2.set(fmt.n(co2e, 2), { delta: fmt.delta(U.jitter('co2d', tick, 0.12), 2, ' t/h'),
        dir: 'flat', state: U.band(co2e, 9, 12) });

      gRen.set(ren);
      gReu.set(reusePct);

      // carbon intensity: kg CO2e per wafer-move
      var intensity = co2e * 1000 / k.wpmh;                  // kg/move
      kInt.set(fmt.n(intensity, 2), { delta: fmt.delta(U.jitter('intd', tick, 0.04), 2, ' kg'),
        dir: 'flat', state: U.band(intensity, 7, 9) });

      // ---- throttled rebuilds (stat-lines / barlists) -----------------
      if (fc % 8 === 0) {
        // Carbon accounting -----------------------------------------------
        var scope1 = 0.15 * co2e;                            // direct ~ 15% of grid
        carbRows.s2.textContent = fmt.n(co2e, 2) + ' t/h';
        carbRows.s1.textContent = fmt.n(scope1, 2) + ' t/h';
        carbRows.day.textContent = fmt.n(co2e * 24, 1) + ' t/day';
        carbRows.yr.textContent = fmt.n(co2e * 8760 / 1000, 2) + ' ktCO₂e/yr';
        carbRows.ef.textContent = GRID_EF.toFixed(2) + ' kgCO₂e/kWh';

        // facility/process overhead ratio framed as efficiency (NOT PUE)
        var ov = k.overheadRatio;
        ovStat.textContent = fmt.n(ov, 3) + ' : 1';
        ovStat.style.color = U.cssVar('--' + U.band(ov, 0.85, 1.0));

        // generation mix (MW of total facility demand) -------------------
        var gridPct = 100 - ren;
        var solarPct = 0.45 * ren;
        var windPct = 0.55 * ren;
        var gridMW = totalMW * gridPct / 100;
        var solarMW = totalMW * solarPct / 100;
        var windMW = totalMW * windPct / 100;
        renBars.set([
          { text: fmt.n(gridMW, 2) + ' MW', pct: gridPct, cls: 'warn' },
          { text: fmt.n(solarMW, 2) + ' MW', pct: solarPct, cls: 'good' },
          { text: fmt.n(windMW, 2) + ' MW', pct: windPct, cls: 'good' }
        ]);

        // Water balance ---------------------------------------------------
        // upwFlow (m3/h) is total UPW demand; reuse fraction is reclaimed.
        var upwFlow = L.upwFlow;                             // m3/h
        var makeup = upwFlow * (1 - reuse);                  // fresh make-up
        var reuseFlow = upwFlow * reuse;                     // reclaimed loop
        // City intake feeds make-up plus pretreatment reject (~12% RO reject).
        var roReject = makeup * 0.12;
        var city = makeup + roReject;
        // Wastewater = make-up that exits the loop + reject (not reclaimed).
        var waste = makeup * (1 - 0.30) + roReject;          // ~30% of make-up internally reclaimed
        var netUse = city - waste;                           // intake minus discharge = consumptive

        waterRows.makeup.textContent = fmt.n(makeup, 1) + ' m³/h';
        waterRows.reuse.textContent = fmt.n(reuseFlow, 1) + ' m³/h';
        waterRows.city.textContent = fmt.n(city, 1) + ' m³/h';
        waterRows.waste.textContent = fmt.n(waste, 1) + ' m³/h';
        waterRows.net.textContent = fmt.n(netUse, 1) + ' m³/h';

        var wbMeta = document.getElementById('wbMeta');
        if (wbMeta) wbMeta.textContent = 'UPW demand ' + fmt.n(upwFlow, 0) + ' m³/h';

        // reuse meter
        var st = U.band(reusePct, 70, 60, true);
        reuseMeter.className = 'meter ' + st;
        reuseMeter._fill.style.width = Math.max(0, Math.min(100, reusePct)) + '%';
        reuseMeterVal.textContent = fmt.n(reusePct, 1) + ' %';

        // ---- Decarbonization target live values -------------------------
        // 2030 Renewable Target: current renewablePct -> 60% RE100
        tgtRenVal.textContent = fmt.n(ren, 1) + '% -> 60% RE100';
        var renRatio = Math.min(1, ren / 60);
        tgtRenBar._fill.style.width = (renRatio * 100).toFixed(1) + '%';
        tgtRenBar.className = 'meter ' + U.band(ren, 40, 25, true);

        // Net-Zero Scope 2 Target: current co2eRate -> FY2035 (no % bar — year target)
        tgtCO2Val.textContent = fmt.n(co2e, 2) + ' t/h -> FY2035';

        // Water Reuse Goal: current waterReusePct -> >80%
        tgtWaterVal.textContent = fmt.n(reusePct, 1) + '% -> >80%';
        var waterRatio = Math.min(1, reusePct / 80);
        tgtWaterBar._fill.style.width = (waterRatio * 100).toFixed(1) + '%';
        tgtWaterBar.className = 'meter ' + U.band(reusePct, 75, 65, true);
      }
    }
  });

  // ---- helpers -----------------------------------------------------------

  // Build the Decarbonization Targets panel content.
  // Caches live value spans + meter fills into module-scope refs for throttled updates.
  function buildTargets() {
    var wrap = el('div');

    // Row helper: label + value span, optional progress meter below
    function tgtRow(label, initVal, withMeter) {
      var r = el('div', 'stat-line');
      r.appendChild(el('span', 'k', label));
      var v = el('span', 'v', initVal);
      r.appendChild(v);
      wrap.appendChild(r);
      var barRef = null;
      if (withMeter) {
        var m = el('div', 'meter');
        var fill = el('i'); fill.style.width = '0%'; m.appendChild(fill);
        m._fill = fill;
        m.style.marginBottom = '6px';
        wrap.appendChild(m);
        barRef = m;
      }
      return { valSpan: v, bar: barRef };
    }

    // 2030 Renewable Target — live current% + static target; progress bar
    var r1 = tgtRow('2030 Renewable Target', '—% -> 60% RE100', true);
    tgtRenVal = r1.valSpan;
    tgtRenBar = r1.bar;

    // Net-Zero Scope 2 Target — live co2eRate + FY2035; no numeric % bar (year target)
    var r2 = tgtRow('Net-Zero Scope 2 Target', '—.— t/h -> FY2035', false);
    tgtCO2Val = r2.valSpan;

    // Water Reuse Goal — live current% + static target; progress bar
    var r3 = tgtRow('Water Reuse Goal', '—% -> >80%', true);
    tgtWaterVal = r3.valSpan;
    tgtWaterBar = r3.bar;

    // Reporting Basis — fully static
    tgtRow('Reporting Basis', 'ISO 14064-1', false);

    return wrap;
  }

  function pct1(v) { return v.toFixed(1); }

  function centered(node) {
    var w = el('div');
    w.style.display = 'flex'; w.style.justifyContent = 'center'; w.style.padding = '6px 0 2px';
    w.appendChild(node);
    return w;
  }

  function subhead(text) {
    var s = el('div', 'dim', text);
    s.style.fontSize = 'var(--fs-1)'; s.style.letterSpacing = '.05em';
    s.style.textTransform = 'uppercase'; s.style.margin = '0 0 8px';
    return s;
  }

  // Build a block of stat-lines; store value spans by key into `store`.
  // Optional `presets` map sets static initial text for keys.
  function statBlock(defs, store, presets) {
    var wrap = el('div');
    defs.forEach(function (d) {
      var key = d[0], label = d[1];
      var r = el('div', 'stat-line');
      r.appendChild(el('span', 'k', label));
      var v = el('span', 'v', '—');
      if (presets && presets[key] != null) v.textContent = presets[key];
      r.appendChild(v);
      wrap.appendChild(r);
      store[key] = v;
    });
    return wrap;
  }
})(window.BAS);
