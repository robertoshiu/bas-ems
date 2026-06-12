/* bas-ems — Energy Command Center (EMS centerpiece)
 * Classic script -> registers module 'energy'
 *
 * The densest, most authoritative EMS view: a hero demand band (signature dial
 * demand-vs-peak + specific-energy KPI strip), sub-metered load split with glow-
 * dot meters and per-bar MW labels, energy intensity & cost, per-area process
 * load with inline share meters, and power quality as a PF ring + voltage/freq/
 * THD/UPS chip cluster. Every number tracks the real frame.load / frame.kpis
 * channels so it stays consistent with every other module; sensor shimmer is
 * deterministic via BAS.ui.jitter. Overhead ratio only — never "PUE".
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;
  var T = (BAS.i18n && BAS.i18n.t) ? BAS.i18n.t : function (s) { return s; };

  // closure-scope widget refs
  var demandDial, demandSpark, demandCanvas;
  var readNum, readSub;                          // MW big-read + sub-line refs
  var hk = {};                                  // hero KPI value spans
  var ddProcess, ddFacility, ddOverhead, ddPeak;
  var subRows;                                  // custom glow-dot bar rows
  var eiPerMove, eiSpecific, eiWpmh, eiCost, eiDaily, eiCarbon;
  var areaTbl;
  var pfRing, pqChips = {};                      // PF ring + chip refs
  var pqUpsRing, pqBadge;
  var fc = 0;

  // sub-metered load row order (label + load channel key + status hue)
  var SUB = [
    { label: 'HVAC (MAU / AHU / FFU)', key: 'hvacKW', hue: '' },
    { label: 'Chilled Water Plant', key: 'chwKW', hue: '' },
    { label: 'Process Tools', key: 'processKW', hue: 'accent' },
    { label: 'Ultrapure Water', key: 'upwKW', hue: '' },
    { label: 'Bulk Gas & CDA', key: 'gasKW', hue: '' },
    { label: 'Exhaust & Abatement', key: 'exhaustKW', hue: '' },
    { label: 'Other / House', key: 'otherKW', hue: '' }
  ];

  // total installed UPS kVA across modules (critical bus)
  var UPS_KVA = M.facility.ups.reduce(function (s, u) { return s + (u.kVA || 0); }, 0);
  var BUS_KV = (M.facility.switchgear[0] && M.facility.switchgear[0].kV) || 13.8;

  BAS.registerModule({
    id: 'energy', title: 'Energy Center', group: 'EMS', order: 1, icon: 'energy',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>' + T('Energy Command Center') + '</h1>' +
        '<span class="crumb">FAB-1 · ' + T('Demand · Sub-metering · Power Quality') + '</span>' +
        '<span class="right">' + T('all totals from live facility metering') + ' &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (1) HERO: Facility Demand band ---------------------------------
      var heroP = U.panel('Facility Demand', { cls: 'col-12 hud', pill: 'LIVE' });
      var hero = el('div', 'pg-hero ens-hero');

      // signature: demand dial (% of peak) + MW big-read beside it
      var sig = el('div', 'pg-hero-sig center ens-sig');
      sig.appendChild(el('div', 'pg-hero-label', T('DEMAND / PEAK')));
      demandDial = U.dial({
        size: 176, label: 'of peak', unit: '%', max: 100, glow: true,
        thresholds: { warn: 88, bad: 96 }, fmt: function (v) { return v.toFixed(1); }
      });
      sig.appendChild(demandDial.el);
      // MW big-read under the dial
      var read = el('div', 'ens-read');
      var rNum = el('span', 'ens-read-n', '—');
      var rUnit = el('span', 'ens-read-u', 'MW');
      read.appendChild(rNum); read.appendChild(rUnit);
      sig.appendChild(read);
      var rsub = el('div', 'ens-read-sub'); rsub.textContent = '—';
      sig.appendChild(rsub);
      hero.appendChild(sig);
      readNum = rNum; readSub = rsub;

      // mid: wide demand trend sparkline
      var trend = el('div', 'ens-trend');
      trend.appendChild(el('div', 'ens-trend-lab', T('TOTAL DEMAND · 180s TREND')));
      demandCanvas = el('canvas', 'spark');
      demandCanvas.style.height = '108px'; demandCanvas.style.width = '100%';
      trend.appendChild(demandCanvas);
      hero.appendChild(trend);

      // right: KPI strip
      var kpis = el('div', 'pg-hero-kpis ens-kpis');
      [['cost', 'Cost Run-Rate', '/h', 'accent'],
       ['perMove', 'Energy / Move', 'kWh', ''],
       ['specific', 'Specific Energy', 'MWh/waf', ''],
       ['pf', 'Power Factor', 'PF', 'good']
      ].forEach(function (k) {
        var box = el('div', 'pg-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', T(k[1])));
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

      demandSpark = U.Sparkline(demandCanvas, { n: 240, height: 108, color: U.cssVar('--accent'), fill: true, slow: 9 });

      // ---- (2) Demand Detail ----------------------------------------------
      var detP = U.panel('Demand Detail', { cls: 'col-4' });
      ddProcess = statLine(detP._body, T('Process Load'));
      ddFacility = statLine(detP._body, T('Facility Load'));
      ddOverhead = statLine(detP._body, T('Facility Overhead'));
      ddPeak = statLine(detP._body, T('Peak Demand (loop)'));
      grid.appendChild(detP);

      // ---- (3) Sub-metered Load (glow-dot meters + mono MW labels) --------
      var subP = U.panel('Sub-metered Load', { cls: 'col-8', meta: 'by system', metaId: 'submeta' });
      var subWrap = el('div', 'ens-sub');
      subRows = SUB.map(function (s) {
        var row = el('div', 'ens-sub-row');
        var head2 = el('div', 'ens-sub-head');
        var lab = el('div', 'ens-sub-lab');
        var dot = el('i', 'ens-dot' + (s.hue ? ' ' + s.hue : ''));
        lab.appendChild(dot);
        lab.appendChild(el('span', null, T(s.label)));
        head2.appendChild(lab);
        var mw = el('div', 'ens-sub-mw');
        var mwN = el('span', 'ens-sub-mwn', '—');
        var mwP = el('span', 'ens-sub-mwp', '');
        mw.appendChild(mwN); mw.appendChild(mwP);
        head2.appendChild(mw);
        row.appendChild(head2);
        var meter = el('div', 'meter ens-sub-meter' + (s.hue === 'accent' ? ' good' : ''));
        var fill = el('i'); fill.style.width = '0%'; meter.appendChild(fill);
        row.appendChild(meter);
        subWrap.appendChild(row);
        return { key: s.key, mwN: mwN, mwP: mwP, dot: dot, fill: fill, lastP: -1 };
      });
      subP._body.appendChild(subWrap);
      grid.appendChild(subP);

      // ---- (4) Energy Intensity & Cost ------------------------------------
      var eiP = U.panel('Energy Intensity & Cost', { cls: 'col-5' });
      eiPerMove = statLine(eiP._body, T('Energy / Wafer-Move'));
      eiSpecific = statLine(eiP._body, T('Specific Energy (fab)'));
      eiWpmh = statLine(eiP._body, T('Wafer Moves / hr'));
      eiCost = statLine(eiP._body, T('Cost Run-Rate'));
      eiDaily = statLine(eiP._body, T('Est. Daily Energy'));
      eiCarbon = statLine(eiP._body, T('Carbon Rate'));
      grid.appendChild(eiP);

      // ---- (5) Power Quality (PF ring + chip cluster) ---------------------
      var pqP = U.panel('Power Quality', { cls: 'col-7', meta: BUS_KV.toFixed(1) + ' kV bus', metaId: 'pqmeta' });
      var pqWrap = el('div', 'ens-pq');

      // left: PF ring + UPS ring
      var ringCol = el('div', 'ens-pq-rings');
      pfRing = U.ringGauge({
        size: 138, label: 'power factor', unit: 'PF', min: 0.90, max: 1.00,
        thresholds: { warn: 0.95, bad: 0.92, invert: true }, glow: true,
        fmt: function (v) { return v.toFixed(3); }
      });
      ringCol.appendChild(pfRing.el);
      pqUpsRing = U.ringGauge({
        size: 122, label: 'ups load', unit: '%', min: 0, max: 100,
        thresholds: { warn: 70, bad: 85 },
        fmt: function (v) { return v.toFixed(0); }
      });
      ringCol.appendChild(pqUpsRing.el);
      pqWrap.appendChild(ringCol);

      // right: chip readouts (voltage / freq / THD / UPS kVA / harmonic)
      var chipCol = el('div', 'ens-pq-chips');
      [['volt', 'BUS VOLTAGE', ''], ['freq', 'FREQUENCY', ''],
       ['thd', 'VOLTAGE THD', ''], ['ups', T('UPS DRAW') + ' (' + U.group(UPS_KVA) + ' kVA)', '']
      ].forEach(function (c) {
        var chip = el('div', 'chip ens-chip');
        chip.appendChild(el('span', 'k', c[0] === 'ups' ? c[1] : T(c[1])));
        var v = el('span', 'v', '—');
        chip.appendChild(v);
        chipCol.appendChild(chip);
        pqChips[c[0]] = { chip: chip, v: v };
      });
      // harmonic-compliance chip with state badge
      var hrow = el('div', 'chip ens-chip ens-chip-badge');
      hrow.appendChild(el('span', 'k', T('HARMONIC COMPLIANCE')));
      var bspan = el('span', 'v');
      pqBadge = U.stateBadge('Productive');
      pqBadge.firstChild.nextSibling.textContent = 'IEEE 519 OK';
      bspan.appendChild(pqBadge);
      hrow.appendChild(bspan);
      chipCol.appendChild(hrow);
      pqWrap.appendChild(chipCol);

      pqP._body.appendChild(pqWrap);
      grid.appendChild(pqP);

      // ---- (6) Process Load by Area (td-meter per row) --------------------
      var areaP = U.panel('Process Load by Area', { cls: 'col-12', bodyCls: 'flush' });
      areaTbl = U.table([
        { label: 'Area', key: 'name', tdCls: 'name' },
        { label: 'Load', render: function (r) { return U.group(Math.round(r.kw)) + ' kW'; }, tdCls: 'num' },
        { label: '% Proc', render: function (r) { return r.pct.toFixed(1) + '%'; }, tdCls: 'num' },
        { label: 'Share', render: function (r) {
            var w = r.max > 0 ? Math.max(0, Math.min(100, r.pct / r.max * 100)) : 0;
            var hue = w > 82 ? ' warn' : '';
            return '<span class="td-meter' + hue + '"><i style="width:' + w.toFixed(0) + '%"></i></span>';
          } }
      ], { maxH: '260px' });
      areaP._body.appendChild(areaTbl.node);
      grid.appendChild(areaP);

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var L = frame.load, K = frame.kpis;

      // ---- hero signature: dial (% of peak) — every frame (change-gated) --
      demandDial.set(K.demandPct);

      // wide trend (push + render every frame)
      demandSpark.push(K.totalMW);
      demandSpark.render();

      // ---- hero KPI strip + MW big-read (cheap text, every frame) ---------
      hk.cost._num.textContent = U.fmt.money(K.costRate);
      hk.perMove._num.textContent = K.energyPerMove.toFixed(1);
      hk.specific._num.textContent = K.specificEnergy.toFixed(2);
      var pf = 0.970 + U.jitter('pf', frame.tick, 0.006);
      hk.pf._num.textContent = pf.toFixed(3);

      // MW big-read + sub-line (peak / overhead) under the dial
      setRead(K);

      // ---- demand detail (cheap, every frame) -----------------------------
      ddProcess.textContent = K.processMW.toFixed(1) + ' MW';
      ddFacility.textContent = K.facilityMW.toFixed(1) + ' MW';
      ddOverhead.textContent = K.overheadRatio.toFixed(2) + ' x';
      ddPeak.textContent = K.demandPeakMW.toFixed(1) + ' MW';

      // ---- energy intensity & cost (every frame; light) -------------------
      eiPerMove.textContent = K.energyPerMove.toFixed(1) + ' kWh';
      eiSpecific.textContent = K.specificEnergy.toFixed(2) + ' MWh/waf';
      eiWpmh.textContent = U.group(Math.round(K.wpmh));
      eiCost.textContent = U.fmt.money(K.costRate) + ' /h';
      eiDaily.textContent = U.group(Math.round(K.avgMW * 24)) + ' MWh';
      eiCarbon.textContent = K.co2eRate.toFixed(2) + ' tCO₂e/h';

      // ---- power quality: PF ring + UPS ring + chips ----------------------
      pfRing.set(pf);
      pqChips.volt.v.textContent = (BUS_KV + U.jitter('busV', frame.tick, 0.04)).toFixed(2) + ' kV';
      pqChips.freq.v.textContent = (60.00 + U.jitter('freq', frame.tick, 0.015)).toFixed(2) + ' Hz';
      var thd = 2.4 + U.jitter('thd', frame.tick, 0.18);
      pqChips.thd.v.textContent = thd.toFixed(1) + ' %';
      // UPS critical bus tracks a fraction of process load (deterministic).
      var critKW = L.processKW * 0.10 + 320;            // critical + controls bus
      var upsKVA = critKW / 0.95;                        // ~0.95 pf at the modules
      var upsPct = clamp(upsKVA / UPS_KVA * 100);
      pqUpsRing.set(upsPct);
      pqChips.ups.v.textContent = upsPct.toFixed(0) + ' % · ' + U.group(Math.round(upsKVA)) + ' kVA';
      var thdOk = thd < 5;
      setBadge(pqBadge, thdOk ? 'Productive' : 'Engineering', thdOk ? 'IEEE 519 OK' : 'THD HIGH');

      // ---- throttled rebuilds ---------------------------------------------
      // sub-metered load: every 4 frames (change-gated per row)
      if (fc % 4 === 0) {
        var total = L.totalKW || 1;
        for (var si = 0; si < subRows.length; si++) {
          var r = subRows[si];
          var kw = L[r.key] || 0;
          var pct = kw / total * 100;
          var pctR = Math.round(pct * 10);
          if (pctR !== r.lastP) {
            r.lastP = pctR;
            r.mwN.textContent = (kw / 1000).toFixed(2) + ' MW';
            r.mwP.textContent = pct.toFixed(0) + '%';
            r.fill.style.width = clamp(pct) + '%';
            // glow-dot intensity scales with share
            r.dot.style.opacity = (0.45 + Math.min(0.55, pct / 100 * 1.6)).toFixed(2);
          }
        }
      }

      // process load by area: every 8 frames
      if (fc % 8 === 0) {
        var procTotal = 0, i;
        for (i = 0; i < M.areas.length; i++) procTotal += L.areaKW[M.areas[i].id] || 0;
        procTotal = procTotal || 1;
        var rows = M.areas.map(function (a) {
          var kw = L.areaKW[a.id] || 0;
          return { name: T(a.name), kw: kw, pct: kw / procTotal * 100 };
        });
        rows.sort(function (x, y) { return y.kw - x.kw; });
        var maxPct = rows.length ? rows[0].pct : 1;
        for (i = 0; i < rows.length; i++) rows[i].max = maxPct;
        areaTbl.set(rows);
      }
    }
  });

  // ---- small DOM helpers -------------------------------------------------
  var _lastMW = '', _lastSub = '';
  function setRead(K) {
    var mw = K.totalMW.toFixed(1);
    if (mw !== _lastMW) { _lastMW = mw; readNum.textContent = mw; }
    var sub = K.demandPeakMW.toFixed(1) + ' MW ' + T('peak') + ' · ' + K.overheadRatio.toFixed(2) + '× ' + T('overhead');
    if (sub !== _lastSub) { _lastSub = sub; readSub.textContent = sub; }
  }
  function statLine(parent, label) { return U.statRow(parent, label); }
  function setBadge(badge, state, text) {
    badge.className = 'badge st-' + state.replace(/\s+/g, '');
    badge.firstChild.nextSibling.textContent = text;
  }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
})(window.BAS);
