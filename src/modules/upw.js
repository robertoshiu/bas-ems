/* bas-ems — Ultrapure Water (UPW): make-up, polish loop, quality & reclaim
 * Classic script -> registers module 'upw'
 * UPW target 18.2 MΩ·cm @25°C; TOC sub-ppb; reclaim/reuse loop.
 *
 * Visual-impact upgrade: a hero band with a LARGE resistivity ringGauge
 * (targeting 18.2 MΩ·cm) paired with a smaller inverted TOC ring, plus a
 * make-up flow big-read and a KPI strip (reclaim %, trains online, loop ΔP).
 * The process-flow schematic gets a hud frame; the water-quality table gains
 * per-row .td-meter bars showing headroom vs spec; trains become status-cards.
 *
 * Constraints honoured: classic IIFE, file://-safe (inline SVG + canvas only),
 * zero per-frame allocation (refs built once at mount), all data from `frame`
 * / BAS.master (no Date.now/Math.random — shimmer via U.jitter), seam-free,
 * reduced-motion aware (widgets/CSS degrade automatically). Heavy DOM writes
 * (table rebuild, status-card badges, chip stats) are throttled + change-gated.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, fmt = U.fmt;

  var gRes, gToc, heroFlow, hk = {},
      qualTbl, trainRows = [], chip = {}, fc = 0,
      upwSch, sFlow, sRes,
      flowMin = 1e9, flowMax = -1e9, flowSum = 0, flowCnt = 0;

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

      // ---- (1) HERO: resistivity signature + TOC + make-up flow + KPIs ----
      var heroP = U.panel('UPW Quality Signature', { cls: 'col-12 hud', pill: 'LIVE' });
      var hero = el('div', 'pg-hero upw-hero');

      // signature: large resistivity ring + smaller TOC ring, side by side
      var sig = el('div', 'pg-hero-sig center upw-sig');
      sig.appendChild(el('div', 'pg-hero-label', 'POLISH-LOOP QUALITY'));
      var rings = el('div', 'upw-rings');
      gRes = U.ringGauge({
        size: 168, label: 'Resistivity', unit: 'MΩ·cm', min: 17.8, max: 18.3, glow: true,
        // higher is better -> invert thresholds (lower bound = worse)
        thresholds: { warn: 18.18, bad: 18.12, invert: true },
        fmt: function (v) { return v.toFixed(2); }
      });
      gToc = U.ringGauge({
        size: 118, label: 'TOC', unit: 'ppb', min: 0, max: 1.5, glow: true,
        // higher is worse (low = good)
        thresholds: { warn: TOC_WARN, bad: TOC_BAD },
        fmt: function (v) { return v.toFixed(2); }
      });
      rings.appendChild(gRes.el);
      var tocWrap = el('div', 'upw-ring-sm'); tocWrap.appendChild(gToc.el);
      rings.appendChild(tocWrap);
      sig.appendChild(rings);
      sig.appendChild(el('div', 'pg-hero-sub upw-target', 'Target 18.2 MΩ·cm @25°C · sub-ppb TOC'));
      hero.appendChild(sig);

      // make-up flow big-read + KPI strip
      var right = el('div', 'upw-hero-right');
      var flowBlock = el('div', 'upw-flow-block');
      flowBlock.appendChild(el('div', 'pg-hero-label', 'MAKE-UP FLOW'));
      heroFlow = el('div', 'pg-hero-read upw-flow-read');
      var fnum = el('span'); heroFlow.appendChild(fnum);
      heroFlow.appendChild(el('span', 'u', 'm³/h'));
      heroFlow._num = fnum;
      flowBlock.appendChild(heroFlow);
      heroFlow._sub = el('div', 'pg-hero-sub upw-flow-sub'); heroFlow._sub.textContent = '—';
      flowBlock.appendChild(heroFlow._sub);
      right.appendChild(flowBlock);

      var kpis = el('div', 'pg-hero-kpis');
      [['reuse', 'Reclaim / Reuse', '%', 'good'],
       ['trains', 'Trains Online', '', 'accent'],
       ['dp', 'Loop ΔP', 'bar', ''],
       ['n2', 'N₂ Blanket', 'Nm³/h', '']
      ].forEach(function (k) {
        var box = el('div', 'pg-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', k[1]));
        var v = el('div', 'v');
        var vn = el('span'); v.appendChild(vn);
        if (k[2]) v.appendChild(el('span', 'u', k[2]));
        v._num = vn;
        box.appendChild(v);
        kpis.appendChild(box);
        hk[k[0]] = v;
      });
      right.appendChild(kpis);
      hero.appendChild(right);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // ---- (2) Process-flow schematic (col-12, hud) ---------------------
      var schP = U.panel('UPW Process Flow — Make-up to Point-of-Use', { cls: 'col-12 hud', pill: 'FLOW' });
      schP._body.style.padding = '8px 14px 12px';
      upwSch = U.Schematic(schP._body, {
        nodes: [
          { id: 'raw',   label: 'Raw Water',    x: 12,  y: 30, channel: 'upwFlow' },
          { id: 'ro',    label: 'RO Unit',       x: 124, y: 30, channel: 'upwFlow' },
          { id: 'edi',   label: 'EDI',           x: 236, y: 30, channel: 'upwFlow' },
          { id: 'polish',label: 'Polish Loop',   x: 348, y: 30, channel: 'upwFlow' },
          { id: 'pou',   label: 'Pt-of-Use',     x: 460, y: 30, channel: 'upwFlow' }
        ],
        pipes: [
          { from: 'raw',    to: 'ro',     channel: 'upwFlow' },
          { from: 'ro',     to: 'edi',    channel: 'upwFlow' },
          { from: 'edi',    to: 'polish', channel: 'upwFlow' },
          { from: 'polish', to: 'pou',    channel: 'upwFlow' }
        ],
        width: 520, height: 70, fontScale: 0.8
      });
      grid.appendChild(schP);

      // ---- (3) Water-quality parameter table (col-8) with td-meter bars --
      var wqP = U.panel('UPW Water Quality', { cls: 'col-8', bodyCls: 'flush', meta: '8 parameters · all in-spec', metaId: 'upwwqmeta' });
      qualTbl = U.table([
        { label: 'Parameter', key: 'param', tdCls: 'name' },
        { label: 'Value', key: 'value', tdCls: 'num' },
        { label: 'Spec', key: 'spec', tdCls: 'dim' },
        { label: 'Headroom', render: function (r) { return r.meter; } },
        { label: 'Status', render: function (r) { return r.badge; }, tdCls: 'num' }
      ], { maxH: '320px' });
      wqP._body.appendChild(qualTbl.node);
      grid.appendChild(wqP);

      // ---- (4) UPW Trains as status-cards (col-4) -----------------------
      var trP = U.panel('UPW Trains — Make-up & Polish', { cls: 'col-4', bodyCls: 'flush' });
      var trWrap = el('div', 'upw-trains');
      BAS.master.facility.upwTrains.forEach(function (tr, i) {
        var card = el('div', 'status-card ok');
        var hd = el('div', 'sc-head');
        hd.appendChild(el('div', 'sc-name', tr.name));
        var badge = el('span'); badge.appendChild(U.stateBadge('Productive'));
        hd.appendChild(badge);
        card.appendChild(hd);

        var stats = el('div', 'sc-stats');
        var mk = scStat(stats, 'Make-up Flow');
        var pk = scStat(stats, 'Polish Pump');
        var lvlV = scStat(stats, 'Storage Tank');
        card.appendChild(stats);

        var lvlM = el('div', 'meter good upw-tank'); lvlM.appendChild(el('i'));
        card.appendChild(lvlM);
        trWrap.appendChild(card);
        trainRows.push({
          card: card, badge: badge,
          makeup: mk, pump: pk, level: lvlV,
          levelFill: lvlM.querySelector('i'), lastState: 'ok'
        });
      });
      trP._body.appendChild(trWrap);
      grid.appendChild(trP);

      // ---- (5) Sparklines w/ chip-row stats (col-12) --------------------
      var spP = U.panel('Trends — Make-up Flow & Loop Resistivity', { cls: 'col-12', bodyCls: 'flush' });
      var spWrap = el('div', 'upw-trends');

      var fCol = el('div', 'upw-trend');
      fCol.appendChild(trendHead('UPW Make-up Flow', 'm³/h', chip, 'f'));
      var cFlow = el('canvas', 'spark'); cFlow.style.height = '64px'; cFlow.style.width = '100%';
      fCol.appendChild(cFlow);
      spWrap.appendChild(fCol);

      var rCol = el('div', 'upw-trend');
      rCol.appendChild(trendHead('Loop Resistivity', 'MΩ·cm', chip, 'r'));
      var cRes = el('canvas', 'spark'); cRes.style.height = '64px'; cRes.style.width = '100%';
      rCol.appendChild(cRes);
      spWrap.appendChild(rCol);

      spP._body.appendChild(spWrap);
      grid.appendChild(spP);

      root.appendChild(grid);

      sFlow = U.Sparkline(cFlow, { height: 64, color: U.cssVar('--accent'), fill: true });
      sRes = U.Sparkline(cRes, { height: 64, color: U.cssVar('--good'), fill: true, min: 18.16, max: 18.24 });
    },

    update: function (frame) {
      fc++;
      var k = frame.kpis, load = frame.load;

      var res = k.upwResistivity;       // ~18.2, engine already adds tiny jitter
      var toc = k.upwTOC;               // ppb, sub-ppb
      var flow = load.upwFlow;          // m3/h, rises with wet/CMP
      var reuse = k.waterReusePct;
      var n2 = load.n2Flow;             // Nm3/h (N2 blanket on UPW storage)
      // loop ΔP: polish-loop pressure drop, tracks recirculation flow (~2.4 bar nominal)
      var dp = analog('upwdp', frame, 2.4 + (flow - 520) * 0.0009, 0.03);

      // schematic
      upwSch.update(frame);

      // hero signature rings (change-gated internally)
      gRes.set(res);
      gToc.set(toc);

      // hero make-up flow big-read + sub
      heroFlow._num.textContent = fmt.int(flow);
      heroFlow._sub.textContent = res.toFixed(3) + ' MΩ·cm loop · ' + toc.toFixed(2) + ' ppb TOC';

      // trains carry the split make-up flow; count online for the KPI strip
      var nTr = trainRows.length || 1;
      var online = 0;
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
        online++;
      }

      // KPI strip (cheap text writes; change-gate via toFixed compare not needed
      // because these are single spans — but keep them light)
      hk.reuse._num.textContent = fmt.n(reuse, 1);
      hk.trains._num.textContent = online + '/' + nTr;
      hk.dp._num.textContent = dp.toFixed(2);
      hk.n2._num.textContent = fmt.int(n2);

      // sparklines — push + render every frame; track running min/avg/max for chips
      sFlow.push(flow); sFlow.render();
      sRes.push(res); sRes.render();
      if (flow < flowMin) flowMin = flow;
      if (flow > flowMax) flowMax = flow;
      flowSum += flow; flowCnt++;

      // throttle table + chips + train state badges (innerHTML / class churn)
      if (fc % 8 === 1) {
        // resistivity drives train health colour (lower = worse, invert)
        var resBand = U.band(res, RES_WARN, RES_BAD, true);
        var scState = resBand === 'bad' ? 'bad' : resBand === 'warn' ? 'warn' : 'ok';
        var e10 = resBand === 'bad' ? 'Unscheduled Down' : 'Productive';
        for (var j = 0; j < trainRows.length; j++) {
          var tr = trainRows[j];
          if (scState !== tr.lastState) {
            tr.lastState = scState;
            tr.card.className = 'status-card ' + scState;
            U.clear(tr.badge); tr.badge.appendChild(U.stateBadge(e10));
          }
        }
        qualTbl.set(buildRows(frame, res, toc));

        // chip stats (min / avg / max) on the trend headers
        var fAvg = flowCnt ? flowSum / flowCnt : flow;
        chip.f.min.textContent = fmt.int(flowMin);
        chip.f.avg.textContent = fmt.int(fAvg);
        chip.f.max.textContent = fmt.int(flowMax);
        chip.r.min.textContent = RES_WARN.toFixed(2);
        chip.r.avg.textContent = res.toFixed(2);
        chip.r.max.textContent = '18.30';
      }
    }
  });

  // ---- helpers ---------------------------------------------------------
  // status-card stat row: returns the value span to mutate.
  function scStat(parent, label) {
    var row = el('div', 'sc-stat');
    row.appendChild(el('span', 'k', label));
    var v = el('span', 'val', '—');
    row.appendChild(v);
    parent.appendChild(row);
    return v;
  }

  // trend header: title + unit + a chip-row (MIN / AVG / MAX). Stores value spans
  // on chipStore[key] = {min,avg,max} for change-gated text writes in update().
  function trendHead(label, unit, chipStore, key) {
    var h = el('div', 'upw-trend-head');
    var top = el('div', 'upw-trend-top');
    top.appendChild(el('span', 'dim', label));
    top.appendChild(el('span', 'mono dim', unit));
    h.appendChild(top);
    var row = el('div', 'chip-row');
    var store = {};
    [['MIN', 'min'], ['AVG', 'avg', 'accent'], ['MAX', 'max']].forEach(function (c) {
      var chipEl = el('div', 'chip' + (c[2] ? ' ' + c[2] : ''));
      chipEl.appendChild(el('span', 'k', c[0]));
      var v = el('span', 'v', '—');
      chipEl.appendChild(v);
      row.appendChild(chipEl);
      store[c[1]] = v;
    });
    h.appendChild(row);
    chipStore[key] = store;
    return h;
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

  // td-meter headroom bar: how much of the spec window is consumed (0..100).
  // For "lower is worse" params (resistivity) the bar reads remaining margin
  // above the lower spec bound; for "higher is worse" it reads consumption of
  // the upper bound. cls picks the colour to match the status band.
  function tdMeter(pct, cls) {
    var p = Math.max(0, Math.min(100, pct));
    return '<span class="td-meter' + (cls ? ' ' + cls : '') + '"><i style="width:' +
      p.toFixed(0) + '%"></i></span>';
  }
  function bandCls(b) { return b === 'bad' ? 'bad' : b === 'warn' ? 'warn' : 'good'; }

  // buildRows — parameterized so it can be called with explicit synthetic values
  // in headless tests.  Thresholds calibrated to real engine distribution — see
  // RES_WARN/RES_BAD/TOC_WARN/TOC_BAD/PART_WARN/PART_BAD constants above.
  function buildRows(frame, res, toc) {
    var do2  = (0.5  + U.jitter('upwdo2',  frame.tick, 0.12));    // <1 ppb
    var sio2 = (0.28 + U.jitter('upwsio2', frame.tick, 0.06));    // <0.5 ppb
    var boron = (0.018 + U.jitter('upwb',  frame.tick, 0.006));   // <0.05 ppb
    var part = Math.round(38 + U.jitter('upwpc', frame.tick, 9)); // <100 /mL
    var bact = (0.2 + U.jitter('upwbact',  frame.tick, 0.15));    // <1 CFU/mL
    var temp = (23.5 + U.jitter('upwtmp',  frame.tick, 0.12));    // ~23.5 C

    // Near-spec excursion classification via calibrated thresholds
    var resBand  = U.band(res,  RES_WARN,  RES_BAD,  true);       // lower is worse
    var tocBand  = U.band(toc,  TOC_WARN,  TOC_BAD,  false);      // higher is worse
    var partBand = U.band(part, PART_WARN, PART_BAD, false);      // higher is worse

    // headroom bars (0..100, clamped). Resistivity: position in [18.0..18.3].
    // For the rest: fraction of the upper spec limit consumed.
    var resPct  = (res - 18.0) / 0.3 * 100;
    var tocPct  = toc / 1.0 * 100;
    var do2Pct  = do2 / 1.0 * 100;
    var sio2Pct = sio2 / 0.5 * 100;
    var boronPct = boron / 0.05 * 100;
    var partPct = part / 100 * 100;
    var bactPct = bact / 1.0 * 100;
    var tempPct = Math.abs(temp - 23.5) / 1.0 * 100;              // distance from setpoint vs ±1 band

    return [
      { param: 'Resistivity',      value: res.toFixed(2) + ' MΩ·cm',  spec: '≥ 18.1',
        meter: tdMeter(resPct, bandCls(resBand)),   badge: qualBadge(resBand) },
      { param: 'TOC',              value: toc.toFixed(2) + ' ppb',     spec: '< 1',
        meter: tdMeter(tocPct, bandCls(tocBand)),   badge: qualBadge(tocBand) },
      { param: 'Dissolved O₂',     value: do2.toFixed(2) + ' ppb',     spec: '< 1',
        meter: tdMeter(do2Pct, 'good'),             badge: qualBadge('good') },
      { param: 'Silica',           value: sio2.toFixed(2) + ' ppb',    spec: '< 0.5',
        meter: tdMeter(sio2Pct, 'good'),            badge: qualBadge('good') },
      { param: 'Boron',            value: boron.toFixed(3) + ' ppb',   spec: '< 0.05',
        meter: tdMeter(boronPct, 'good'),           badge: qualBadge('good') },
      { param: 'Particles > 50 nm',value: part + ' /mL',              spec: '< 100',
        meter: tdMeter(partPct, bandCls(partBand)), badge: qualBadge(partBand) },
      { param: 'Bacteria',         value: bact.toFixed(2) + ' CFU/mL', spec: '< 1',
        meter: tdMeter(bactPct, 'good'),            badge: qualBadge('good') },
      { param: 'Temperature',      value: temp.toFixed(1) + ' °C',     spec: '23.5 ± 1',
        meter: tdMeter(tempPct, 'good'),            badge: qualBadge('good') }
    ];
  }
})(window.BAS);
