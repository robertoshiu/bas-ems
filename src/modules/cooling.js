/* bas-ems — Process & Chilled Water: CHW plant, PCW loops, cooling towers
 * Classic script -> registers module 'cooling'
 * Cooling load tracks production via frame.load.chwRT / chwKW / pcwRT; chillers
 * stage by load; per-equipment shimmer is deterministic off frame.tick.
 *
 * Visual upgrade: a hero band (col-12 .panel.hud .pg-hero) with a signature
 * plant-efficiency dial (kW/RT, lower=better -> inverted thresholds), a big-read
 * plant-kW numeral and a KPI strip (total RT, CHWS/CHWR, tower status, PCW load).
 * The P&ID schematic keeps its panel (now hud-framed). The chiller table gains
 * inline .td-meter load bars and state-coloured status dots; PCW/tower tables and
 * the trend sparklines + plant facts are preserved.
 *
 * Constraints honoured: classic IIFE, file://-safe (inline SVG / DOM only), zero
 * per-frame allocation (refs built at mount, mutated in update, change-gated +
 * throttled), all data from `frame` / BAS.master, reduced-motion aware.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, fmt = U.fmt, M = BAS.master;

  var effDial;                                 // hero signature: plant efficiency kW/RT
  var heroKW, heroSub;                         // hero big-read plant kW + sub-line
  var hk = {};                                 // hero KPI value spans
  var chillerTbl, pcwTbl, ctTbl;               // tables
  var sLoad, sPower;                           // sparklines
  var schematic;                               // P&ID schematic widget
  var fc = 0;

  var CHWS_SET = 6.5, CHWR_SET = 13.5;         // CHW supply/return setpoints (°C)
  var PCW_SET = 20;                            // PCW supply setpoint (°C)
  var RATING_RT = (M.facility.chillers[0] && M.facility.chillers[0].ratingRT) || 2500;
  var DESIGN_RT = M.facility.chillers.reduce(function (s, c) { return s + (c.ratingRT || RATING_RT); }, 0);
  var STAGE_RT = RATING_RT * 0.85;             // RT per chiller before staging another

  BAS.registerModule({
    id: 'cooling', title: 'Cooling / CHW', group: 'BAS', order: 2, icon: 'cooling',

    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Process &amp; Chilled Water</h1>' +
        '<span class="crumb">FAB-1 · CHW Plant · PCW Loops · Cooling Towers</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- Row 1: hero band (col-12, hud) ------------------------------
      // Signature dial = plant efficiency (kW/RT). Lower is better, so thresholds
      // are inverted: green below ~0.62, amber to ~0.72, red above. Big-read shows
      // live plant kW; the KPI strip carries the headline plant figures.
      var heroP = U.panel('Cooling Plant', { cls: 'col-12 hud', pill: 'LIVE' });
      var hero = el('div', 'pg-hero cw-hero');

      var sig = el('div', 'pg-hero-sig center');
      sig.appendChild(el('div', 'pg-hero-label', 'PLANT EFFICIENCY'));
      effDial = U.dial({
        size: 168, label: 'kW / RT', unit: 'kW/RT', min: 0, max: 1.0, glow: true,
        fmt: function (v) { return v.toFixed(3); },
        thresholds: { warn: 0.62, bad: 0.72, invert: true }   // lower = better
      });
      sig.appendChild(effDial.el);
      // big-read plant kW under the dial
      var read = el('div', 'pg-hero-read cw-hero-read');
      var rn = el('span'); read.appendChild(rn);
      read.appendChild(el('span', 'u', 'kW'));
      read._num = rn; heroKW = read;
      sig.appendChild(read);
      heroSub = el('div', 'pg-hero-sub'); heroSub.textContent = '—';
      sig.appendChild(heroSub);
      hero.appendChild(sig);

      // right KPI strip — preserves the four headline figures the page showed.
      var kpis = el('div', 'pg-hero-kpis');
      [['load', 'Total Cooling', 'RT', 'accent'],
       ['temps', 'CHWS / CHWR', '°C', ''],
       ['towers', 'Towers', 'on', 'good'],
       ['pcw', 'PCW Load', 'RT', ''],
       ['stage', 'Chillers Staged', '', '']
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
      hero.appendChild(kpis);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // ---- Chiller Plant P&ID Schematic (col-12, hud) -------------------
      // Real frame.load channels used:
      //   chwKW  (~6490 kW)  — chiller plant kW → drives flow on CHW pipes
      //   chwRT  (~10701 RT) — total cooling tons → drives flow on CT pipes
      //   pcwRT  (~3170 RT)  — process cooling tons → CW header node live value
      var schP = U.panel('Chiller Plant P&ID — Schematic Overview', {
        cls: 'col-12 hud',
        meta: 'CHW · CW · PCW',
        metaId: 'schematic-meta'
      });

      // Node coordinates for a 560×200 viewBox (chillers → CHW header → process
      // load; cooling towers → CW header). Each node shows cooling tons for a
      // consistent unit; pipe flow speed is driven by chwKW (electrical proxy).
      schematic = U.Schematic(schP._body, {
        width: 560,
        height: 200,
        nodes: [
          // Chillers (left bank, two columns of 3)
          { id: 'CHLR-01', label: 'CHLR-01', x: 10,  y: 18,  channel: 'chwRT' },
          { id: 'CHLR-02', label: 'CHLR-02', x: 10,  y: 68,  channel: 'chwRT' },
          { id: 'CHLR-03', label: 'CHLR-03', x: 10,  y: 118, channel: 'chwRT' },
          { id: 'CHLR-04', label: 'CHLR-04', x: 80,  y: 18,  channel: 'chwRT' },
          { id: 'CHLR-05', label: 'CHLR-05', x: 80,  y: 68,  channel: 'chwRT' },
          { id: 'CHLR-06', label: 'CHLR-06', x: 80,  y: 118, channel: 'chwRT' },
          // CHW Header (centre-left)
          { id: 'CHW-HDR', label: 'CHW Hdr',  x: 168, y: 68,  channel: 'chwRT' },
          // Process Load (centre)
          { id: 'PROC',    label: 'Proc Load', x: 270, y: 68,  channel: 'pcwRT' },
          // Cooling Towers (right column)
          { id: 'CT-01',   label: 'CT-01',    x: 370, y: 10,  channel: 'chwRT' },
          { id: 'CT-02',   label: 'CT-02',    x: 370, y: 68,  channel: 'chwRT' },
          { id: 'CT-03',   label: 'CT-03',    x: 370, y: 126, channel: 'chwRT' },
          // CW Header (bottom right, condenser water return)
          { id: 'CW-HDR',  label: 'CW Hdr',   x: 465, y: 68,  channel: 'chwRT' }
        ],
        pipes: [
          // Chiller bank 1 → CHW Header (chilled water supply — animated by chwKW)
          { from: 'CHLR-01', to: 'CHW-HDR', channel: 'chwKW' },
          { from: 'CHLR-02', to: 'CHW-HDR', channel: 'chwKW' },
          { from: 'CHLR-03', to: 'CHW-HDR', channel: 'chwKW' },
          // Chiller bank 2 → CHW Header
          { from: 'CHLR-04', to: 'CHW-HDR', channel: 'chwKW' },
          { from: 'CHLR-05', to: 'CHW-HDR', channel: 'chwKW' },
          { from: 'CHLR-06', to: 'CHW-HDR', channel: 'chwKW' },
          // CHW Header → Process Load (chilled water distribution)
          { from: 'CHW-HDR', to: 'PROC',    channel: 'chwKW' },
          // Cooling Towers → CW Header (condenser water return — animated by chwRT)
          { from: 'CT-01',   to: 'CW-HDR',  channel: 'chwRT' },
          { from: 'CT-02',   to: 'CW-HDR',  channel: 'chwRT' },
          { from: 'CT-03',   to: 'CW-HDR',  channel: 'chwRT' }
        ]
      });

      grid.appendChild(schP);

      // ---- chiller plant + supporting systems (col-8) ------------------
      var leftP = U.panel('Chiller Plant — Central Utility Building', { cls: 'col-8', bodyCls: 'tight', meta: M.facility.chillers.length + ' × ' + RATING_RT + ' RT Centrifugal', metaId: 'chwmeta' });

      chillerTbl = U.table([
        { label: 'Chiller', key: 'name', tdCls: 'name' },
        { label: 'Status', render: function (r) { return statusCell(r.state); } },
        { label: 'Load', render: function (r) { return tdMeterCell(r.loadPct, r.on); }, tdCls: 'num' },
        { label: 'Tonnage', render: function (r) { return r.on ? fmt.int(r.rt) + ' RT' : '—'; }, tdCls: 'num' },
        { label: 'kW', render: function (r) { return r.on ? fmt.int(r.kw) : '—'; }, tdCls: 'num' },
        { label: 'CHWS', render: function (r) { return r.on ? r.chws.toFixed(1) + '°' : '—'; }, tdCls: 'num' },
        { label: 'CHWR', render: function (r) { return r.on ? r.chwr.toFixed(1) + '°' : '—'; }, tdCls: 'num' },
        { label: 'Approach', render: function (r) { return r.on ? r.approach.toFixed(2) + '°' : '—'; }, tdCls: 'num' }
      ], { maxH: '210px' });
      leftP._body.appendChild(chillerTbl.node);

      // PCW loops
      var pcwHd = el('div', 'dim cw-subhd');
      pcwHd.textContent = 'Process Cooling Water Loops  ·  20 °C Setpoint';
      leftP._body.appendChild(pcwHd);
      pcwTbl = U.table([
        { label: 'Loop', key: 'name', tdCls: 'name' },
        { label: 'Supply', render: function (r) { return r.supply.toFixed(1) + '°'; }, tdCls: 'num' },
        { label: 'Return', render: function (r) { return r.ret.toFixed(1) + '°'; }, tdCls: 'num' },
        { label: 'ΔT', render: function (r) { return r.dt.toFixed(1) + '°'; }, tdCls: 'num' },
        { label: 'Flow', render: function (r) { return fmt.int(r.flow) + ' m³/h'; }, tdCls: 'num' },
        { label: 'Load', render: function (r) { return fmt.int(r.rt) + ' RT'; }, tdCls: 'num' }
      ]);
      leftP._body.appendChild(pcwTbl.node);

      // Cooling towers
      var ctHd = el('div', 'dim cw-subhd');
      ctHd.textContent = 'Cooling Towers  ·  Condenser-Water Heat Rejection';
      leftP._body.appendChild(ctHd);
      ctTbl = U.table([
        { label: 'Tower', key: 'name', tdCls: 'name' },
        { label: 'Cells', key: 'cells', tdCls: 'num' },
        { label: 'Basin', render: function (r) { return r.basin.toFixed(1) + '°'; }, tdCls: 'num' },
        { label: 'Range', render: function (r) { return r.range.toFixed(1) + '°'; }, tdCls: 'num' },
        { label: 'Fan VFD', render: function (r) { return tdMeterCell(r.vfd, true); }, tdCls: 'num' }
      ]);
      leftP._body.appendChild(ctTbl.node);

      grid.appendChild(leftP);

      // ---- trends (col-4) ----------------------------------------------
      var rightP = U.panel('Plant Trends', { cls: 'col-4', meta: '180 s loop', metaId: 'trendmeta' });

      var t1 = el('div', 'dim'); t1.textContent = 'Cooling Load — RT'; t1.style.fontSize = 'var(--fs-1)';
      rightP._body.appendChild(t1);
      var c1 = el('canvas', 'spark'); c1.style.height = '92px';
      rightP._body.appendChild(c1);
      sLoad = U.Sparkline(c1, { color: U.cssVar('--accent'), height: 92 });

      var t2 = el('div', 'dim'); t2.textContent = 'Plant Power — MW'; t2.style.fontSize = 'var(--fs-1)';
      t2.style.marginTop = '14px';
      rightP._body.appendChild(t2);
      var c2 = el('canvas', 'spark'); c2.style.height = '92px';
      rightP._body.appendChild(c2);
      sPower = U.Sparkline(c2, { color: U.cssVar('--accent-2') || U.cssVar('--accent'), height: 92 });

      // quick plant facts
      var facts = el('div'); facts.style.marginTop = '14px';
      facts.appendChild(statLine('Design Capacity', DESIGN_RT.toLocaleString() + ' RT'));
      facts.appendChild(statLine('CHW Setpoint', CHWS_SET.toFixed(1) + ' / ' + CHWR_SET.toFixed(1) + ' °C'));
      facts.appendChild(statLine('Distribution', M.facility.chwPumps.length + ' CHW pumps · VPF'));
      facts.appendChild(statLine('Condenser Water', M.facility.coolingTowers.length + ' towers'));
      rightP._body.appendChild(facts);

      grid.appendChild(rightP);

      root.appendChild(grid);
    },

    update: function (frame) {
      fc++;
      var L = frame.load, tick = frame.tick;

      // ---- P&ID schematic (throttled internally by tick % 4) ------------
      schematic.update(frame);

      // ---- plant-level channels (track production) ----------------------
      var chwRT = L.chwRT;                                   // total CHW cooling tons
      var chwKW = L.chwKW;                                   // chiller plant kW (all-in ~0.6 kW/RT)
      var pcwRT = L.pcwRT;                                   // process-cooling tons
      var loadFrac = Math.min(1.3, chwRT / (DESIGN_RT * 0.6));

      // Plant efficiency = plant kW / cooling tons. The load model keeps this a
      // believable all-in ~0.6 kW/RT, consistent with Plant Power and per-chiller kW.
      var effKWRT = chwKW / Math.max(1, chwRT);

      // CHW supply/return shimmer on setpoint; return widens slightly with load.
      var chws = CHWS_SET + U.jitter('chws', tick, 0.12);
      var chwr = CHWR_SET + (loadFrac - 1) * 0.7 + U.jitter('chwr', tick, 0.18);

      // chiller staging (also drives the hero "staged" KPI + table)
      var nChillers = M.facility.chillers.length;
      var running = Math.max(1, Math.min(nChillers, Math.ceil(chwRT / STAGE_RT)));

      // ---- hero (cheap; dial + big-read + KPI strip change-gated) -------
      effDial.set(effKWRT);
      heroKW._num.textContent = fmt.int(chwKW);
      hk.load._num.textContent = fmt.int(chwRT);
      hk.temps._num.textContent = chws.toFixed(1) + ' / ' + chwr.toFixed(1);
      hk.towers._num.textContent = M.facility.coolingTowers.length + '';
      hk.pcw._num.textContent = fmt.int(pcwRT);
      hk.stage._num.textContent = running + ' / ' + nChillers;
      if (fc % 4 === 0) {
        heroSub.textContent = (chwKW / 1000).toFixed(2) + ' MW · ' +
          effKWRT.toFixed(3) + ' kW/RT · ' + running + '/' + nChillers + ' staged';
      }

      // ---- sparklines (push + render EVERY frame) -----------------------
      sLoad.push(chwRT);  sLoad.render();
      sPower.push(chwKW / 1000); sPower.render();

      if (fc % 8 !== 0) return;

      // ---- staging: per-chiller load for the current demand -------------
      var rtEach = chwRT / running;

      var meta = document.getElementById('chwmeta');
      if (meta) meta.textContent = running + ' / ' + nChillers + ' staged · ' + fmt.int(chwRT) + ' RT';

      chillerTbl.set(M.facility.chillers.map(function (c, i) {
        var on = i < running;
        var rt = on ? rtEach + U.jitter('cr:' + c.id, tick, 22) : 0;
        var loadPct = on ? Math.min(100, rt / c.ratingRT * 100) : 0;
        // ~0.6 kW/RT at the compressor (condenser/pumps carry the rest of the plant figure)
        var kw = on ? rt * (0.60 + U.jitter('ck:' + c.id, tick, 0.02)) : 0;
        return {
          name: c.name,
          on: on,
          state: on ? 'Productive' : 'Standby',
          loadPct: loadPct,
          rt: rt,
          kw: kw,
          chws: CHWS_SET + U.jitter('cs:' + c.id, tick, 0.12),
          chwr: CHWR_SET + (loadPct / 100 - 0.6) * 0.6 + U.jitter('cw:' + c.id, tick, 0.16),
          approach: 0.5 + (loadPct / 100) * 0.9 + U.jitter('ca:' + c.id, tick, 0.12)
        };
      }));

      // ---- PCW loops (split process-cooling tons across loops) ----------
      var nPcw = M.facility.pcwLoops.length;
      pcwTbl.set(M.facility.pcwLoops.map(function (p, i) {
        var rt = pcwRT / nPcw + U.jitter('pr:' + p.id, tick, 18);
        var dt = 4.6 + U.jitter('pd:' + p.id, tick, 0.5);                  // ~4-6 °C delta-T
        var supply = (p.setpointC || PCW_SET) + U.jitter('ps:' + p.id, tick, 0.12);
        // m3/h from tons & deltaT: Q[kW]=RT*3.517; flow = Q/(1.163*dt)
        var flow = (rt * 3.517) / (1.163 * dt);
        return { name: p.name, supply: supply, ret: supply + dt, dt: dt, flow: flow, rt: rt };
      }));

      // ---- cooling towers ----------------------------------------------
      ctTbl.set(M.facility.coolingTowers.map(function (t, i) {
        // fan VFD tracks heat-rejection demand (chwRT) with per-tower shimmer
        var vfd = Math.max(35, Math.min(100, 55 + (loadFrac - 1) * 70 + U.jitter('cv:' + t.id, tick, 4)));
        return {
          name: t.name,
          cells: t.cells,
          basin: 24 + (loadFrac - 1) * 1.5 + U.jitter('cb:' + t.id, tick, 0.25),  // ~24 °C basin
          range: 4.5 + (loadFrac - 1) * 1.2 + U.jitter('cg:' + t.id, tick, 0.3),
          vfd: vfd
        };
      }));
    }
  });

  // ---- helpers ------------------------------------------------------------
  function statLine(k, v) { return U.statLine(k, v); }

  // status cell: state-coloured dot + label (Productive = good, Standby = muted)
  function statusCell(state) {
    var cls = state === 'Productive' ? 'good' : 'idle';
    return '<span class="cw-dot ' + cls + '"></span><span class="cw-st">' + state + '</span>';
  }

  // inline .td-meter load bar (upgrade-kit class) + numeric readout
  function tdMeterCell(pct, on) {
    if (!on) return '<span class="cw-st">—</span>';
    var p = Math.max(0, Math.min(100, pct));
    var hue = p >= 92 ? ' bad' : (p >= 80 ? ' warn' : ' good');
    return '<span class="td-meter' + hue + '"><i style="width:' + p.toFixed(0) + '%"></i></span>' +
      '<span class="cw-mval">' + p.toFixed(0) + '%</span>';
  }
})(window.BAS);
