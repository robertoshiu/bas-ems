/* bas-ems — Sustainability & Carbon (EMS): CO2e accounting, renewable mix,
 * water reuse / balance. Tracks production via frame.kpis.* / frame.load.*.
 * Classic script -> registers module 'sustainability'. file:// + offline safe.
 *
 * Visual-impact build: hero ring-trio signature (CO2e / Renewable / Water reuse)
 * + daily CO2e big-read + carbon-intensity KPI strip; a stacked generation-mix
 * bar with legend chips; a makeup -> reuse -> net DOM/CSS water-flow strip.
 *
 * Note: never surfaces "PUE"; uses the facility/process overhead ratio in
 * fab framing as the efficiency stat instead.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, fmt = U.fmt;

  // grid emission factor used by sim.js for the Scope 2 calc (kgCO2e/kWh).
  var GRID_EF = 0.34;

  // ---- closure-scope refs (filled at mount; mutated, never reallocated) ----
  // hero ring trio + big-read + KPI strip
  var ringCO2, ringRen, ringReu;
  var heroDayNum;                 // big-read daily projection numeral
  var hk = {};                    // hero KPI value numerals
  // generation mix (stacked bar + legend chips)
  var mixSeg = {}, mixChip = {};
  // carbon accounting stat-lines
  var carbRows = {}, ovStat;
  // water balance stat-lines + flow strip + reuse trend
  var waterRows = {};
  var flowNode = {};              // makeup / reuse / net flow-strip refs
  var reuseMeter, reuseMeterVal;
  // sparklines
  var spkCO2, spkRen;
  // decarbonization target live refs
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

      // ================================================================
      // HERO — ring-trio signature + daily projection + KPI strip
      // ================================================================
      var heroP = U.panel('Sustainability Signature', { cls: 'col-12 hud', pill: 'LIVE' });
      var hero = el('div', 'pg-hero sus-hero');

      // left signature slot: three large ring gauges side-by-side
      var sig = el('div', 'pg-hero-sig sus-rings');
      var ringsWrap = el('div', 'sus-ringrow');

      ringCO2 = U.ringGauge({ size: 132, label: 'CO₂e', unit: 't/h', min: 0, max: 18,
        glow: true, color: U.cssVar('--accent'), fmt: fmt2,
        thresholds: { warn: 9, bad: 12 } });            // higher = worse
      ringsWrap.appendChild(ringCell(ringCO2.el, 'Scope 2 Rate'));

      ringRen = U.ringGauge({ size: 132, label: 'Renew', unit: '%', min: 0, max: 60,
        glow: true, color: U.cssVar('--good'), fmt: pct1,
        thresholds: { warn: 25, bad: 18, invert: true } });  // lower = worse
      ringsWrap.appendChild(ringCell(ringRen.el, 'Renewable Mix'));

      ringReu = U.ringGauge({ size: 132, label: 'Reuse', unit: '%', min: 0, max: 100,
        glow: true, color: U.cssVar('--accent'), fmt: pct1,
        thresholds: { warn: 70, bad: 60, invert: true } }); // lower = worse
      ringsWrap.appendChild(ringCell(ringReu.el, 'Water Reclaim'));

      sig.appendChild(ringsWrap);

      // daily projection big-read beneath the rings
      var dayRead = el('div', 'sus-dayread');
      dayRead.appendChild(el('div', 'pg-hero-label', 'DAILY CO₂e PROJECTION'));
      var bigr = el('div', 'pg-hero-read');
      heroDayNum = el('span'); bigr.appendChild(heroDayNum);
      var bigu = el('span', 'u', 't/day'); bigr.appendChild(bigu);
      dayRead.appendChild(bigr);
      sig.appendChild(dayRead);
      hero.appendChild(sig);

      // right KPI strip
      var kpis = el('div', 'pg-hero-kpis');
      [['intensity', 'Carbon Intensity', 'kg/kWh', 'accent'],
       ['scope2', 'Scope 2 Share', '%', ''],
       ['annual', 'Annual Run-rate', 'kt/yr', ''],
       ['intMove', 'per Wafer-Move', 'kg', 'good']
      ].forEach(function (k) {
        var box = el('div', 'pg-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', k[1]));
        var v = el('div', 'v');
        var vn = el('span'); v.appendChild(vn);
        var vu = el('span', 'u', k[2]); v.appendChild(vu);
        v._num = vn;
        box.appendChild(v);
        kpis.appendChild(box);
        hk[k[0]] = v;
      });
      hero.appendChild(kpis);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // ================================================================
      // CARBON ACCOUNTING + GENERATION MIX (col-6)
      // ================================================================
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

      // ---- Generation Mix: stacked horizontal bar + legend chips ----
      var msub = el('div'); msub.style.marginTop = '14px';
      msub.appendChild(subhead('Generation Mix — Facility Demand'));
      var stack = el('div', 'sus-mix');
      [['grid', 'sus-grid'], ['solar', 'sus-solar'], ['wind', 'sus-wind']].forEach(function (m) {
        var seg = el('div', 'sus-mixseg ' + m[1]);
        var lbl = el('span', 'mml'); seg._lbl = lbl; seg.appendChild(lbl);
        stack.appendChild(seg);
        mixSeg[m[0]] = seg;
      });
      msub.appendChild(stack);

      // legend chips (one per source, with live MW value)
      var legend = el('div', 'chip-row sus-legend');
      [['grid', 'Grid', 'sus-dot-grid'], ['solar', 'Solar PPA', 'sus-dot-solar'],
       ['wind', 'Wind PPA', 'sus-dot-wind']].forEach(function (m) {
        var chip = el('div', 'chip');
        var dot = el('span', 'sus-dot ' + m[2]); chip.appendChild(dot);
        chip.appendChild(el('span', 'k', m[1]));
        var v = el('span', 'v', '—'); chip.appendChild(v);
        legend.appendChild(chip);
        mixChip[m[0]] = v;
      });
      msub.appendChild(legend);
      caP._body.appendChild(msub);
      grid.appendChild(caP);

      // ================================================================
      // WATER BALANCE — stats + makeup->reuse->net flow strip (col-6)
      // ================================================================
      var wbP = U.panel('Water Balance — UPW Make-up & Reclaim', { cls: 'col-6', meta: '', metaId: 'wbMeta' });

      // 3-node DOM/CSS flow strip: MAKE-UP -> RECLAIM -> NET CONSUMPTIVE
      var flow = el('div', 'sus-flow');
      flow.appendChild(flowNodeEl('makeup', 'MAKE-UP', 'fresh demand', 'sus-fn-in'));
      flow.appendChild(flowArrow());
      flow.appendChild(flowNodeEl('reuse', 'RECLAIM', 'reuse return', 'sus-fn-reuse'));
      flow.appendChild(flowArrow());
      flow.appendChild(flowNodeEl('net', 'NET USE', 'consumptive', 'sus-fn-net'));
      wbP._body.appendChild(flow);

      wbP._body.appendChild(statBlock([
        ['makeup', 'UPW Make-up (fresh demand)'],
        ['reuse', 'Reclaim / Reuse Return'],
        ['city', 'City Water Intake'],
        ['waste', 'Wastewater to Treatment'],
        ['net', 'Net Consumptive Use']
      ], waterRows));

      // reuse efficiency trend meter (kept from prior build)
      var rsub = el('div'); rsub.style.marginTop = '12px';
      var rtop = el('div'); rtop.style.display = 'flex'; rtop.style.justifyContent = 'space-between';
      rtop.style.fontSize = 'var(--fs-2)';
      rtop.appendChild(el('span', 'dim', 'Reuse Efficiency'));
      reuseMeterVal = el('span', 'mono'); reuseMeterVal.textContent = '—';
      rtop.appendChild(reuseMeterVal);
      reuseMeter = el('div', 'meter good'); var ri = el('i'); ri.style.width = '0%'; reuseMeter.appendChild(ri);
      reuseMeter._fill = ri;
      rsub.appendChild(rtop); rsub.appendChild(reuseMeter);
      wbP._body.appendChild(rsub);
      grid.appendChild(wbP);

      // ================================================================
      // SPARKLINES + DECARB TARGETS
      // ================================================================
      var scP = U.panel('CO₂e Rate — Trailing', { cls: 'col-4', bodyCls: 'flush' });
      var c1 = el('canvas', 'spark'); c1.style.height = '120px';
      scP._body.appendChild(c1);
      grid.appendChild(scP);
      spkCO2 = U.Sparkline(c1, { height: 120, color: U.cssVar('--accent'), slow: 9 });

      var srP = U.panel('Renewable Mix — Trailing', { cls: 'col-4', bodyCls: 'flush' });
      var c2 = el('canvas', 'spark'); c2.style.height = '120px';
      srP._body.appendChild(c2);
      grid.appendChild(srP);
      spkRen = U.Sparkline(c2, { height: 120, color: U.cssVar('--good'), slow: 9 });

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

      // ---- hero ring trio (change-gated internally; safe every frame) ----
      ringCO2.set(co2e);
      ringRen.set(ren);
      ringReu.set(reusePct);

      // daily CO2e big-read (cheap text; change-gate)
      var dayTxt = fmt.n(co2e * 24, 1);
      if (heroDayNum.textContent !== dayTxt) heroDayNum.textContent = dayTxt;

      // hero KPI strip (cheap text; change-gate each)
      // carbon intensity per kWh actually delivered = co2e(t/h)*1000 / totalKW
      var intKWh = totalKW > 0 ? co2e * 1000 / totalKW : 0;
      setNum(hk.intensity, fmt.n(intKWh, 3));
      setNum(hk.scope2, fmt.n(100 * co2e / (co2e + 0.15 * co2e), 1));   // Scope 2 share of (S1+S2)
      setNum(hk.annual, fmt.n(co2e * 8760 / 1000, 2));
      var intMove = co2e * 1000 / k.wpmh;                     // kg/move
      setNum(hk.intMove, fmt.n(intMove, 2));

      // ---- throttled rebuilds (stat-lines / mix / flow / targets) -------
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

        // generation mix (MW + % of total facility demand) ----------------
        var gridPct = 100 - ren;
        var solarPct = 0.45 * ren;
        var windPct = 0.55 * ren;
        var gridMW = totalMW * gridPct / 100;
        var solarMW = totalMW * solarPct / 100;
        var windMW = totalMW * windPct / 100;

        // stacked bar segment widths (clamp grid so renewables always visible)
        mixSeg.grid.style.width = gridPct.toFixed(1) + '%';
        mixSeg.solar.style.width = solarPct.toFixed(1) + '%';
        mixSeg.wind.style.width = windPct.toFixed(1) + '%';
        // inline %% labels only on segments wide enough to fit
        mixSeg.grid._lbl.textContent = gridPct >= 12 ? Math.round(gridPct) + '%' : '';
        mixSeg.solar._lbl.textContent = solarPct >= 12 ? Math.round(solarPct) + '%' : '';
        mixSeg.wind._lbl.textContent = windPct >= 12 ? Math.round(windPct) + '%' : '';

        mixChip.grid.textContent = fmt.n(gridMW, 2) + ' MW';
        mixChip.solar.textContent = fmt.n(solarMW, 2) + ' MW';
        mixChip.wind.textContent = fmt.n(windMW, 2) + ' MW';

        // Water balance ---------------------------------------------------
        var upwFlow = L.upwFlow;                             // m3/h
        var makeup = upwFlow * (1 - reuse);                  // fresh make-up
        var reuseFlow = upwFlow * reuse;                     // reclaimed loop
        var roReject = makeup * 0.12;                        // ~12% RO reject
        var city = makeup + roReject;
        var waste = makeup * (1 - 0.30) + roReject;          // ~30% of make-up internally reclaimed
        var netUse = city - waste;                           // intake - discharge = consumptive

        waterRows.makeup.textContent = fmt.n(makeup, 1) + ' m³/h';
        waterRows.reuse.textContent = fmt.n(reuseFlow, 1) + ' m³/h';
        waterRows.city.textContent = fmt.n(city, 1) + ' m³/h';
        waterRows.waste.textContent = fmt.n(waste, 1) + ' m³/h';
        waterRows.net.textContent = fmt.n(netUse, 1) + ' m³/h';

        // flow strip nodes
        flowNode.makeup.textContent = fmt.n(makeup, 0) + ' m³/h';
        flowNode.reuse.textContent = fmt.n(reuseFlow, 0) + ' m³/h';
        flowNode.net.textContent = fmt.n(netUse, 0) + ' m³/h';

        var wbMeta = document.getElementById('wbMeta');
        if (wbMeta) wbMeta.textContent = 'UPW demand ' + fmt.n(upwFlow, 0) + ' m³/h';

        // reuse meter
        var st = U.band(reusePct, 70, 60, true);
        reuseMeter.className = 'meter ' + st;
        reuseMeter._fill.style.width = Math.max(0, Math.min(100, reusePct)) + '%';
        reuseMeterVal.textContent = fmt.n(reusePct, 1) + ' %';

        // ---- Decarbonization target live values -------------------------
        tgtRenVal.textContent = fmt.n(ren, 1) + '% -> 60% RE100';
        var renRatio = Math.min(1, ren / 60);
        tgtRenBar._fill.style.width = (renRatio * 100).toFixed(1) + '%';
        tgtRenBar.className = 'meter ' + U.band(ren, 40, 25, true);

        tgtCO2Val.textContent = fmt.n(co2e, 2) + ' t/h -> FY2035';

        tgtWaterVal.textContent = fmt.n(reusePct, 1) + '% -> >80%';
        var waterRatio = Math.min(1, reusePct / 80);
        tgtWaterBar._fill.style.width = (waterRatio * 100).toFixed(1) + '%';
        tgtWaterBar.className = 'meter ' + U.band(reusePct, 75, 65, true);
      }
    }
  });

  // ---- helpers -----------------------------------------------------------

  // change-gated numeral writer for hero KPI value spans
  function setNum(vEl, txt) {
    if (vEl._num.textContent !== txt) vEl._num.textContent = txt;
  }

  // a ring-gauge cell: the widget .el + a small caption beneath
  function ringCell(ringEl, caption) {
    var c = el('div', 'sus-ringcell');
    c.appendChild(ringEl);
    c.appendChild(el('div', 'sus-ringcap', caption));
    return c;
  }

  // a water-flow node: title + sub + live value (value ref stored in flowNode)
  function flowNodeEl(key, title, sub, cls) {
    var n = el('div', 'sus-fnode ' + cls);
    n.appendChild(el('div', 'sus-fn-t', title));
    var v = el('div', 'sus-fn-v', '—'); n.appendChild(v);
    n.appendChild(el('div', 'sus-fn-s', sub));
    flowNode[key] = v;
    return n;
  }

  function flowArrow() {
    var a = el('div', 'sus-farrow');
    a.innerHTML = '&#8594;';
    return a;
  }

  // Build the Decarbonization Targets panel content.
  function buildTargets() {
    var wrap = el('div');

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

    var r1 = tgtRow('2030 Renewable Target', '—% -> 60% RE100', true);
    tgtRenVal = r1.valSpan;
    tgtRenBar = r1.bar;

    var r2 = tgtRow('Net-Zero Scope 2 Target', '—.— t/h -> FY2035', false);
    tgtCO2Val = r2.valSpan;

    var r3 = tgtRow('Water Reuse Goal', '—% -> >80%', true);
    tgtWaterVal = r3.valSpan;
    tgtWaterBar = r3.bar;

    tgtRow('Reporting Basis', 'ISO 14064-1', false);

    return wrap;
  }

  function pct1(v) { return v.toFixed(1); }
  function fmt2(v) { return v.toFixed(2); }

  function subhead(text) {
    var s = el('div', 'dim', text);
    s.style.fontSize = 'var(--fs-1)'; s.style.letterSpacing = '.05em';
    s.style.textTransform = 'uppercase'; s.style.margin = '0 0 8px';
    return s;
  }

  // Build a block of stat-lines; store value spans by key into `store`.
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
