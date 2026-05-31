/* bas-ems — Energy Command Center (EMS centerpiece)
 * Classic script -> registers module 'energy'
 *
 * The densest, most authoritative EMS view: facility demand + wide trend,
 * demand detail vs peak, sub-metered load split, energy intensity & cost,
 * per-area process load, and power quality (switchgear / UPS). Every number
 * tracks the real frame.load / frame.kpis channels so it stays consistent with
 * every other module; sensor shimmer is deterministic via BAS.ui.jitter.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;

  // closure-scope widget refs
  var bigRead, demandSpark, demandCanvas;
  var ddProcess, ddFacility, ddOverhead, ddPeak, ddPct, ddPctMeter;
  var subBars;
  var eiPerMove, eiSpecific, eiWpmh, eiCost, eiDaily, eiCarbon;
  var areaTbl;
  var pfGauge, pqVolt, pqFreq, pqThd, pqUps, pqUpsMeter, pqBadge;
  var fc = 0;

  // sub-metered load row order (label + load channel key)
  var SUB = [
    { label: 'HVAC (MAU / AHU / FFU)', key: 'hvacKW' },
    { label: 'Chilled Water Plant', key: 'chwKW' },
    { label: 'Process Tools', key: 'processKW' },
    { label: 'Ultrapure Water', key: 'upwKW' },
    { label: 'Bulk Gas & CDA', key: 'gasKW' },
    { label: 'Exhaust & Abatement', key: 'exhaustKW' },
    { label: 'Other / House', key: 'otherKW' }
  ];

  // total installed UPS kVA across modules (critical bus)
  var UPS_KVA = M.facility.ups.reduce(function (s, u) { return s + (u.kVA || 0); }, 0);
  var BUS_KV = (M.facility.switchgear[0] && M.facility.switchgear[0].kV) || 13.8;

  BAS.registerModule({
    id: 'energy', title: 'Energy Center', group: 'EMS', order: 1, icon: 'energy',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Energy Command Center</h1>' +
        '<span class="crumb">FAB-1 · Demand · Sub-metering · Power Quality</span>' +
        '<span class="right">all totals from live facility metering &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (2a) Hero: Facility Demand --------------------------------------
      var demandP = U.panel('Facility Demand', { cls: 'col-8', pill: 'LIVE' });
      var hero = el('div'); hero.style.marginBottom = '8px';
      var rlab = el('div', 'dim'); rlab.style.fontSize = 'var(--fs-1)';
      rlab.style.letterSpacing = '.6px'; rlab.textContent = 'TOTAL DEMAND';
      bigRead = el('div', 'big-read'); bigRead.textContent = '—';
      var unit = el('span'); unit.style.fontSize = 'var(--fs-3)'; unit.style.color = 'var(--text-mut)';
      unit.style.marginLeft = '8px'; unit.style.fontFamily = 'var(--mono)'; unit.textContent = 'MW';
      bigRead.appendChild(unit);
      hero.appendChild(rlab); hero.appendChild(bigRead);
      demandP._body.appendChild(hero);

      demandCanvas = el('canvas', 'spark');
      demandCanvas.style.height = '96px'; demandCanvas.style.width = '100%';
      demandP._body.appendChild(demandCanvas);
      grid.appendChild(demandP);
      demandSpark = U.Sparkline(demandCanvas, { n: 240, height: 96, color: U.cssVar('--accent'), fill: true });

      // ---- (2b) Demand Detail ----------------------------------------------
      var detP = U.panel('Demand Detail', { cls: 'col-4' });
      ddProcess = statLine(detP._body, 'Process Load');
      ddFacility = statLine(detP._body, 'Facility Load');
      ddOverhead = statLine(detP._body, 'Facility Overhead');
      ddPeak = statLine(detP._body, 'Peak Demand (loop)');
      ddPct = statLine(detP._body, 'Demand vs Peak');
      ddPctMeter = meterBar(detP._body, 'good');
      grid.appendChild(detP);

      // ---- (3) Sub-metered Load --------------------------------------------
      var subP = U.panel('Sub-metered Load', { cls: 'col-6', meta: 'by system', metaId: 'submeta' });
      subBars = U.barList(SUB.map(function (s) { return { label: s.label }; }));
      subP._body.appendChild(subBars.node);
      grid.appendChild(subP);

      // ---- (4) Energy Intensity & Cost -------------------------------------
      var eiP = U.panel('Energy Intensity & Cost', { cls: 'col-6' });
      eiPerMove = statLine(eiP._body, 'Energy / Wafer-Move');
      eiSpecific = statLine(eiP._body, 'Specific Energy (fab)');
      eiWpmh = statLine(eiP._body, 'Wafer Moves / hr');
      eiCost = statLine(eiP._body, 'Cost Run-Rate');
      eiDaily = statLine(eiP._body, 'Est. Daily Energy');
      eiCarbon = statLine(eiP._body, 'Carbon Rate');
      grid.appendChild(eiP);

      // ---- (5) Process Load by Area ----------------------------------------
      var areaP = U.panel('Process Load by Area', { cls: 'col-7', bodyCls: 'flush' });
      areaTbl = U.table([
        { label: 'Area', key: 'name', tdCls: 'name' },
        { label: 'Load', render: function (r) { return U.group(Math.round(r.kw)) + ' kW'; }, tdCls: 'num' },
        { label: '% Proc', render: function (r) { return r.pct.toFixed(1) + '%'; }, tdCls: 'num' },
        { label: 'Share', render: function (r) { return shareBar(r.pct, r.max); }, tdCls: 'num' }
      ], { maxH: '300px' });
      areaP._body.appendChild(areaTbl.node);
      grid.appendChild(areaP);

      // ---- (6) Power Quality -----------------------------------------------
      var pqP = U.panel('Power Quality', { cls: 'col-5', meta: BUS_KV.toFixed(1) + ' kV bus', metaId: 'pqmeta' });
      var gwrap = el('div'); gwrap.style.display = 'flex'; gwrap.style.justifyContent = 'center';
      gwrap.style.marginBottom = '6px';
      pfGauge = U.gauge({
        label: 'Power Factor', unit: 'PF', min: 0.90, max: 1.00, size: 150,
        thresholds: { warn: 0.95, bad: 0.92, invert: true }, fmt: function (v) { return v.toFixed(3); }
      });
      gwrap.appendChild(pfGauge.node);
      pqP._body.appendChild(gwrap);

      pqVolt = statLine(pqP._body, 'Bus Voltage');
      pqFreq = statLine(pqP._body, 'Frequency');
      pqThd = statLine(pqP._body, 'Voltage THD');
      pqUps = statLine(pqP._body, 'UPS Load (' + U.group(UPS_KVA) + ' kVA)');
      pqUpsMeter = meterBar(pqP._body, 'good');
      var brow = el('div', 'stat-line'); brow.style.borderBottom = 'none';
      brow.appendChild(el('span', 'k', 'Harmonic Compliance'));
      var bspan = el('span', 'v'); pqBadge = U.stateBadge('Productive');
      pqBadge.firstChild.nextSibling.textContent = 'IEEE 519 OK';
      bspan.appendChild(pqBadge); brow.appendChild(bspan);
      pqP._body.appendChild(brow);
      grid.appendChild(pqP);

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var L = frame.load, K = frame.kpis;

      // ---- hero: total demand + wide trend (push + render every frame) -----
      bigRead.firstChild.textContent = K.totalMW.toFixed(1);
      demandSpark.push(K.totalMW);
      demandSpark.render();

      // ---- demand detail (cheap, every frame) ------------------------------
      ddProcess.textContent = K.processMW.toFixed(1) + ' MW';
      ddFacility.textContent = K.facilityMW.toFixed(1) + ' MW';
      ddOverhead.textContent = K.overheadRatio.toFixed(2) + ' x';
      ddPeak.textContent = K.demandPeakMW.toFixed(1) + ' MW';
      ddPct.textContent = K.demandPct.toFixed(1) + ' %';
      var pctState = U.band(K.demandPct, 88, 96, false);
      ddPctMeter.fill.style.width = clamp(K.demandPct) + '%';
      ddPctMeter.meter.className = 'meter ' + pctState;

      // ---- energy intensity & cost (every frame; light) --------------------
      eiPerMove.textContent = K.energyPerMove.toFixed(1) + ' kWh';
      eiSpecific.textContent = K.specificEnergy.toFixed(2) + ' MWh/waf';
      eiWpmh.textContent = U.group(Math.round(K.wpmh));
      eiCost.textContent = U.fmt.money(K.costRate) + ' /h';
      eiDaily.textContent = U.group(Math.round(K.avgMW * 24)) + ' MWh';
      eiCarbon.textContent = K.co2eRate.toFixed(2) + ' tCO₂e/h';

      // ---- power quality (analog shimmer off frame.tick) -------------------
      var pf = 0.970 + U.jitter('pf', frame.tick, 0.006);
      pfGauge.set(pf);
      pqVolt.textContent = (BUS_KV + U.jitter('busV', frame.tick, 0.04)).toFixed(2) + ' kV';
      pqFreq.textContent = (60.00 + U.jitter('freq', frame.tick, 0.015)).toFixed(2) + ' Hz';
      var thd = 2.4 + U.jitter('thd', frame.tick, 0.18);
      pqThd.textContent = thd.toFixed(1) + ' %';
      // UPS critical bus tracks a fraction of process load (deterministic).
      var critKW = L.processKW * 0.10 + 320;            // critical + controls bus
      var upsKVA = critKW / 0.95;                        // ~0.95 pf at the modules
      var upsPct = clamp(upsKVA / UPS_KVA * 100);
      pqUps.textContent = upsPct.toFixed(0) + ' % · ' + U.group(Math.round(upsKVA)) + ' kVA';
      var upsState = U.band(upsPct, 70, 85, false);
      pqUpsMeter.fill.style.width = upsPct + '%';
      pqUpsMeter.meter.className = 'meter ' + upsState;
      var thdOk = thd < 5;
      setBadge(pqBadge, thdOk ? 'Productive' : 'Engineering', thdOk ? 'IEEE 519 OK' : 'THD HIGH');

      // ---- throttled rebuilds ---------------------------------------------
      // sub-metered load: every 4 frames
      if (fc % 4 === 0) {
        var total = L.totalKW || 1;
        subBars.set(SUB.map(function (s) {
          var kw = L[s.key];
          var pct = kw / total * 100;
          return {
            text: (kw / 1000).toFixed(1) + ' MW · ' + pct.toFixed(0) + '%',
            pct: pct,
            cls: s.key === 'processKW' ? 'good' : null
          };
        }));
      }

      // process load by area: every 8 frames
      if (fc % 8 === 0) {
        var procTotal = 0, i;
        for (i = 0; i < M.areas.length; i++) procTotal += L.areaKW[M.areas[i].id] || 0;
        procTotal = procTotal || 1;
        var rows = M.areas.map(function (a) {
          var kw = L.areaKW[a.id] || 0;
          return { name: a.name, kw: kw, pct: kw / procTotal * 100 };
        });
        rows.sort(function (x, y) { return y.kw - x.kw; });
        var maxPct = rows.length ? rows[0].pct : 1;
        for (i = 0; i < rows.length; i++) rows[i].max = maxPct;
        areaTbl.set(rows);
      }
    }
  });

  // ---- small DOM helpers -------------------------------------------------
  function statLine(parent, label) { return U.statRow(parent, label); }
  function meterBar(parent, cls) {
    var m = el('div', 'meter ' + (cls || ''));
    m.style.margin = '-2px 0 8px';
    var i = el('i'); i.style.width = '0%'; m.appendChild(i);
    parent.appendChild(m);
    return { meter: m, fill: i };
  }
  function shareBar(pct, maxPct) {
    var w = maxPct > 0 ? Math.min(100, pct / maxPct * 100) : 0;
    return '<div class="meter" style="width:64px;display:inline-block;vertical-align:middle">' +
      '<i style="width:' + w.toFixed(0) + '%"></i></div>';
  }
  function setBadge(badge, state, text) {
    badge.className = 'badge st-' + state.replace(/\s+/g, '');
    badge.firstChild.nextSibling.textContent = text;
  }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
})(window.BAS);
