/* bas-ems — Ultrapure Water (UPW): make-up, polish loop, quality & reclaim
 * Classic script -> registers module 'upw'
 * UPW target 18.2 MΩ·cm @25°C; TOC sub-ppb; reclaim/reuse loop.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, fmt = U.fmt;

  var gRes, gToc, sFlow, sRes,
      flowV, reuseV, reuseMeter,
      qualTbl, trainRows = [], fc = 0,
      upwSch;

  // analog readout from a steady setpoint + deterministic shimmer
  function analog(channel, frame, base, amp) { return base + U.jitter(channel, frame.tick, amp); }

  // ---- Near-spec excursion thresholds ----------------------------------------
  // EMPIRICALLY CALIBRATED from 360 samples (t=0..179.5 step 0.5) of the real engine:
  //   upwResistivity: min=18.1851, max=18.2150, mean=18.1994
  //   upwTOC (ppb):   min=0.5507,  max=0.7981,  mean=0.6774
  //   particles /mL:  min=29,      max=47,       mean=37.9
  //
  // Resistivity — lower is worse (invert=true); thresholds are LOWER bounds.
  //   warn = p20 of measured distribution: fires ~15% of ticks
  //   bad  = p5  of measured distribution: fires ~5%  of ticks
  var RES_WARN = 18.1899;   // below this => Near-spec (measured p20)
  var RES_BAD  = 18.1863;   // below this => Excursion  (measured p5)

  // TOC — higher is worse; thresholds are UPPER bounds.
  //   warn = p80 of measured distribution: fires ~13% of ticks
  //   bad  = p93 of measured distribution: fires ~7%  of ticks
  var TOC_WARN = 0.7486;    // at or above => Near-spec (measured p80)
  var TOC_BAD  = 0.7810;    // at or above => Excursion  (measured p93)

  // Particles >50nm /mL — higher is worse; thresholds are UPPER bounds.
  //   warn = p80 of measured distribution: fires ~11% of ticks
  //   bad  = p93 of measured distribution: fires ~9%  of ticks
  var PART_WARN = 44;       // at or above => Near-spec (measured p80)
  var PART_BAD  = 46;       // at or above => Excursion  (measured p93)

  BAS.registerModule({
    id: 'upw', title: 'Ultrapure Water', group: 'BAS', order: 3, icon: 'water',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Ultrapure Water (UPW)</h1>' +
        '<span class="crumb">FAB-1 · 18.2 MΩ·cm · TOC · Reclaim</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- (1) Process-flow schematic (col-12) ----------------------------
      var schP = U.panel('UPW Process Flow — Make-up to Point-of-Use', { cls: 'col-12' });
      schP._body.style.padding = '8px 14px 12px';
      upwSch = U.Schematic(schP._body, {
        nodes: [
          { id: 'raw',   label: 'Raw Water',    x: 10,  y: 30, channel: 'upwFlow' },
          { id: 'ro',    label: 'RO Unit',       x: 90,  y: 30, channel: 'upwFlow' },
          { id: 'edi',   label: 'EDI',           x: 170, y: 30, channel: 'upwFlow' },
          { id: 'polish',label: 'Polish Loop',   x: 250, y: 30, channel: 'upwFlow' },
          { id: 'pou',   label: 'Pt-of-Use',     x: 330, y: 30, channel: 'upwFlow' }
        ],
        pipes: [
          { from: 'raw',    to: 'ro',     channel: 'upwFlow' },
          { from: 'ro',     to: 'edi',    channel: 'upwFlow' },
          { from: 'edi',    to: 'polish', channel: 'upwFlow' },
          { from: 'polish', to: 'pou',    channel: 'upwFlow' }
        ],
        width: 396, height: 70
      });
      grid.appendChild(schP);

      // ---- (2) Quality gauges + stat-lines -----------------------------
      var qP = U.panel('Quality', { cls: 'col-4' });
      var grow = el('div');
      grow.style.display = 'grid';
      grow.style.gridTemplateColumns = '1fr 1fr';
      grow.style.gap = '6px';
      grow.style.justifyItems = 'center';
      gRes = U.gauge({
        label: 'Resistivity', unit: 'MΩ·cm', min: 18.0, max: 18.25, size: 124,
        thresholds: { warn: 18.1, bad: 18.05, invert: true }, fmt: function (v) { return v.toFixed(2); }
      });
      gToc = U.gauge({
        label: 'TOC', unit: 'ppb', min: 0, max: 2, size: 124,
        thresholds: { warn: 1, bad: 1.5 }, fmt: function (v) { return v.toFixed(2); }
      });
      grow.appendChild(gRes.node); grow.appendChild(gToc.node);
      qP._body.appendChild(grow);

      var stats = el('div'); stats.style.marginTop = '12px';
      flowV = statLine(stats, 'Total Flow');
      reuseV = statLine(stats, 'Reclaim / Reuse');
      qP._body.appendChild(stats);
      reuseMeter = el('div', 'meter good');
      reuseMeter.style.margin = '2px 0 2px';
      reuseMeter.appendChild(el('i'));
      qP._body.appendChild(reuseMeter);
      grid.appendChild(qP);

      // ---- (3) Water-quality parameter table ---------------------------
      var wqP = U.panel('UPW Water Quality', { cls: 'col-8', bodyCls: 'flush', meta: '8 parameters · all in-spec', metaId: 'upwwqmeta' });
      qualTbl = U.table([
        { label: 'Parameter', key: 'param', tdCls: 'name' },
        { label: 'Value', key: 'value', tdCls: 'num' },
        { label: 'Spec', key: 'spec', tdCls: 'dim' },
        { label: 'Status', render: function (r) { return r.badge; }, tdCls: 'num' }
      ], { maxH: '300px' });
      wqP._body.appendChild(qualTbl.node);
      grid.appendChild(wqP);

      // ---- (4) UPW Trains ---------------------------------------------
      var trP = U.panel('UPW Trains — Make-up & Polish', { cls: 'col-4', bodyCls: 'flush' });
      var trWrap = el('div'); trWrap.style.padding = '10px 14px';
      BAS.master.facility.upwTrains.forEach(function (tr, i) {
        var card = el('div');
        card.style.margin = i === 0 ? '0 0 12px' : '0';
        if (i > 0) { card.style.borderTop = '1px solid var(--bg-3)'; card.style.paddingTop = '10px'; }
        var hd = el('div', 'stat-line');
        var nm = el('span', 'k'); nm.innerHTML = '<strong>' + tr.name + '</strong>';
        var badge = el('span', 'v');
        hd.appendChild(nm); hd.appendChild(badge); card.appendChild(hd);
        var mk = statLine(card, 'Make-up Flow');
        var pk = statLine(card, 'Polish Pump');
        var lvlRow = el('div', 'stat-line');
        lvlRow.appendChild(el('span', 'k', 'Storage Tank'));
        var lvlV = el('span', 'v'); lvlRow.appendChild(lvlV); card.appendChild(lvlRow);
        var lvlM = el('div', 'meter good'); lvlM.style.margin = '0 0 2px';
        lvlM.appendChild(el('i')); card.appendChild(lvlM);
        trWrap.appendChild(card);
        trainRows.push({ badge: badge, makeup: mk, pump: pk, level: lvlV, levelFill: lvlM.querySelector('i') });
      });
      trP._body.appendChild(trWrap);
      grid.appendChild(trP);

      // ---- (5) Sparklines ---------------------------------------------
      var spP = U.panel('Trends — Flow & Resistivity', { cls: 'col-4', bodyCls: 'flush' });
      var spWrap = el('div'); spWrap.style.padding = '12px 14px';
      var cFlow = trendBlock(spWrap, 'UPW Flow', 'm³/h');
      var cRes = trendBlock(spWrap, 'Resistivity', 'MΩ·cm');
      spP._body.appendChild(spWrap);
      grid.appendChild(spP);

      root.appendChild(grid);

      sFlow = U.Sparkline(cFlow, { height: 60, color: U.cssVar('--accent') });
      sRes = U.Sparkline(cRes, { height: 60, color: U.cssVar('--good'), min: 18.16, max: 18.24 });
    },

    update: function (frame) {
      fc++;
      var k = frame.kpis, load = frame.load;

      var res = k.upwResistivity;       // ~18.2, engine already adds tiny jitter
      var toc = k.upwTOC;               // ppb, sub-ppb
      var flow = load.upwFlow;          // m3/h, rises with wet/CMP
      var reuse = k.waterReusePct;

      // schematic
      upwSch.update(frame);

      // gauges
      gRes.set(res);
      gToc.set(toc);

      // quality stat-lines
      flowV.textContent = fmt.int(flow) + ' m³/h';
      reuseV.textContent = fmt.n(reuse, 1) + ' %';
      reuseMeter.firstChild.style.width = Math.max(0, Math.min(100, reuse)).toFixed(0) + '%';

      // sparklines — push + render every frame
      sFlow.push(flow); sFlow.render();
      sRes.push(res); sRes.render();

      // trains: split make-up flow across 2 trains (slight asymmetry, lead/lag)
      var nTr = trainRows.length || 1;
      for (var i = 0; i < trainRows.length; i++) {
        var t = trainRows[i];
        var bias = 1 + (i === 0 ? 0.04 : -0.04);           // lead train carries a touch more
        var mkFlow = (flow / nTr) * bias + U.jitter('upwmk' + i, frame.tick, 2.2);
        var pumpKW = analog('upwpk' + i, frame, 132 + (flow - 520) * 0.05, 1.4);
        var level = analog('upwlvl' + i, frame, i === 0 ? 84 : 81, 0.6);
        t.makeup.textContent = fmt.int(mkFlow) + ' m³/h';
        t.pump.textContent = fmt.int(pumpKW) + ' kW';
        t.level.textContent = level.toFixed(1) + ' %';
        t.levelFill.style.width = level.toFixed(0) + '%';
      }

      // throttle table + train badges (innerHTML rebuilds)
      if (fc % 8 === 1) {
        // both polish loops online while resistivity holds spec
        for (var j = 0; j < trainRows.length; j++) {
          trainRows[j].badge.innerHTML = badgeHtml('Productive', 'Polish · Online');
        }
        qualTbl.set(buildRows(frame, res, toc));
      }
    }
  });

  // ---- helpers ---------------------------------------------------------
  function statLine(parent, label) { return U.statRow(parent, label); }

  function trendBlock(parent, label, unit) {
    var lab = el('div');
    lab.style.display = 'flex'; lab.style.justifyContent = 'space-between';
    lab.style.fontSize = 'var(--fs-2)'; lab.style.margin = '0 0 4px';
    lab.appendChild(el('span', 'dim', label));
    lab.appendChild(el('span', 'mono dim', unit));
    parent.appendChild(lab);
    var c = el('canvas', 'spark');
    c.style.height = '60px'; c.style.width = '100%';
    c.style.marginBottom = '14px';
    parent.appendChild(c);
    return c;
  }

  function badgeHtml(state, text) {
    return '<span class="badge st-' + state + '"><i class="b-dot"></i>' + text + '</span>';
  }

  // Map a U.band result ('good'|'warn'|'bad') to a badge HTML string for UPW quality rows.
  // SCADA 3-level convention: good=green (Productive), warn=amber (NearSpec), bad=red (UnscheduledDown).
  // warn uses st-NearSpec (amber) NOT st-Standby (blue) — blue reads as "offline/standby" to an operator.
  function qualBadge(bandResult) {
    if (bandResult === 'bad')  return badgeHtml('UnscheduledDown', 'Excursion');
    if (bandResult === 'warn') return badgeHtml('NearSpec',        'Near-spec');
    return badgeHtml('Productive', 'In-spec');
  }

  // buildRows — parameterized so it can be called with explicit synthetic values
  // in headless tests.  Thresholds calibrated to real engine distribution — see
  // RES_WARN/RES_BAD/TOC_WARN/TOC_BAD/PART_WARN/PART_BAD constants above.
  function buildRows(frame, res, toc) {
    var do2  = (0.5  + U.jitter('upwdo2',  frame.tick, 0.12)).toFixed(2);    // <1 ppb
    var sio2 = (0.28 + U.jitter('upwsio2', frame.tick, 0.06)).toFixed(2);    // <0.5 ppb
    var boron = (0.018 + U.jitter('upwb',  frame.tick, 0.006)).toFixed(3);   // <0.05 ppb
    var part = Math.round(38 + U.jitter('upwpc', frame.tick, 9));             // <100 /mL
    var bact = (0.2 + U.jitter('upwbact',  frame.tick, 0.15)).toFixed(2);    // <1 CFU/mL
    var temp = (23.5 + U.jitter('upwtmp',  frame.tick, 0.12)).toFixed(1);    // ~23.5 C

    // Near-spec excursion classification via calibrated thresholds
    // Resistivity: lower is worse -> invert=true
    var resBand  = U.band(res,  RES_WARN,  RES_BAD,  true);
    // TOC: higher is worse -> invert=false
    var tocBand  = U.band(toc,  TOC_WARN,  TOC_BAD,  false);
    // Particles: higher is worse -> invert=false
    var partBand = U.band(part, PART_WARN, PART_BAD, false);

    return [
      { param: 'Resistivity',      value: res.toFixed(2) + ' MΩ·cm',  spec: '≥ 18.1',    badge: qualBadge(resBand) },
      { param: 'TOC',              value: toc.toFixed(2) + ' ppb',     spec: '< 1',        badge: qualBadge(tocBand) },
      { param: 'Dissolved O₂',     value: do2 + ' ppb',                spec: '< 1',        badge: qualBadge('good') },
      { param: 'Silica',           value: sio2 + ' ppb',               spec: '< 0.5',      badge: qualBadge('good') },
      { param: 'Boron',            value: boron + ' ppb',              spec: '< 0.05',     badge: qualBadge('good') },
      { param: 'Particles > 50 nm',value: part + ' /mL',              spec: '< 100',      badge: qualBadge(partBand) },
      { param: 'Bacteria',         value: bact + ' CFU/mL',            spec: '< 1',        badge: qualBadge('good') },
      { param: 'Temperature',      value: temp + ' °C',                spec: '23.5 ± 1',   badge: qualBadge('good') }
    ];
  }
})(window.BAS);
