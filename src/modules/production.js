/* bas-ems — Production Floor (hero): smart-factory events driving facility load
 * Classic script -> registers module 'production'
 * Reference module: shows the mount(root)/update(frame) pattern every module uses.
 *
 * Visual-impact rebuild:
 *  - LiveFab canvas wrapped as the .panel.hud signature, with an absolutely
 *    positioned overlay strip of live stats (WPMH / active lots / hottest area).
 *  - OEE block rebuilt as a ring cluster: U.ringGauge x4 (OEE largest + accent).
 *  - E10 state rollup as horizontal stacked state bars per area + shared legend.
 *  - Jobs table + event log preserved (HUD frame polish only).
 *
 * Constraints honoured: classic IIFE, file://-safe, zero per-frame allocation
 * (all refs built at mount), data from `frame` only, seam-free, reduced-motion
 * aware. Heavy DOM writes are throttled (fc % 8) and change-gated.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;

  // SEMI E10 six states, in fixed display order, with their token colours.
  var E10 = [
    { key: 'Productive', label: 'Productive', cssVar: '--good' },
    { key: 'Standby', label: 'Standby', cssVar: '--accent-2' },
    { key: 'Engineering', label: 'Engineering', cssVar: '--purple' },
    { key: 'Scheduled Down', label: 'Sched Down', cssVar: '--warn' },
    { key: 'Unscheduled Down', label: 'Unsched Down', cssVar: '--bad' },
    { key: 'Non-Scheduled', label: 'Non-Sched', cssVar: '--text-mut' }
  ];

  var livefab, logTicker, rA, rP, rQ, rO, jobsTbl, fc = 0;
  var ovWpmh, ovLots, ovHot;                 // canvas overlay chips
  var stateRows = [];                        // per-area stacked-bar refs
  var counts = {};                           // sub-fab style count readouts

  BAS.registerModule({
    id: 'production', title: 'Production Floor', group: 'Operations', order: 1, icon: 'flow',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Production Floor</h1><span class="crumb">FAB-1 · Live SECS/GEM · MES · AMHS</span>' +
        '<span class="right">production activity drives facility load &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- hero: LiveFab canvas as the HUD signature, with overlay chips ----
      var heroP = U.panel('Living Fab — Production ⟶ Facility Coupling', { cls: 'col-12 hud', bodyCls: 'flush', pill: 'LIVE' });
      var stage = el('div', 'prod-stage');
      var canvas = el('canvas', 'spark prod-canvas');
      canvas.style.height = '380px'; canvas.style.width = '100%';
      stage.appendChild(canvas);

      // overlay strip (absolute, pointer-events:none) — live floor stats
      var ov = el('div', 'prod-ov');
      ovWpmh = mkOvChip(ov, 'WAFER MOVES / HR', 'accent');
      ovLots = mkOvChip(ov, 'ACTIVE LOTS', '');
      ovHot = mkOvChip(ov, 'HOTTEST AREA', 'warn');
      stage.appendChild(ov);
      heroP._body.appendChild(stage);
      grid.appendChild(heroP);

      // ---- OEE ring cluster (E79) ----
      var oeeP = U.panel('Fab Equipment Effectiveness (E79 OEE)', { cls: 'col-4 hud', meta: 'live fleet roll-up' });
      var cluster = el('div', 'prod-rings');
      // small satellites
      rA = U.ringGauge({ size: 124, label: 'Availability', unit: '%', min: 60, max: 100,
        thresholds: { warn: 85, bad: 78, invert: true }, fmt: pct1 });
      rP = U.ringGauge({ size: 124, label: 'Performance', unit: '%', min: 60, max: 100,
        thresholds: { warn: 88, bad: 82, invert: true }, fmt: pct1 });
      rQ = U.ringGauge({ size: 124, label: 'Quality', unit: '%', min: 90, max: 100,
        thresholds: { warn: 97, bad: 95, invert: true }, fmt: pct1 });
      // hero ring: OEE, largest + accent + glow
      rO = U.ringGauge({ size: 168, label: 'OEE', unit: '%', min: 50, max: 100,
        color: U.cssVar('--accent'), glow: true, fmt: pct1 });

      var hero = el('div', 'prod-ring-hero'); hero.appendChild(rO.el);
      var sats = el('div', 'prod-ring-sats');
      [rA, rP, rQ].forEach(function (g) { var c = el('div', 'prod-ring-sat'); c.appendChild(g.el); sats.appendChild(c); });
      cluster.appendChild(hero); cluster.appendChild(sats);
      oeeP._body.appendChild(cluster);
      grid.appendChild(oeeP);

      // ---- E10 state rollup: stacked horizontal bars per area + legend ----
      var stP = U.panel('Equipment State — SEMI E10', { cls: 'col-8 hud', meta: 'productive share by area' });
      // shared legend
      var legend = el('div', 'prod-legend');
      E10.forEach(function (s) {
        var item = el('div', 'prod-leg-item');
        var sw = el('span', 'prod-leg-sw'); sw.style.background = U.cssVar(s.cssVar);
        item.appendChild(sw); item.appendChild(el('span', 'prod-leg-lab', s.label));
        legend.appendChild(item);
      });
      stP._body.appendChild(legend);

      var stWrap = el('div', 'prod-states');
      M.areas.forEach(function (a) {
        var row = el('div', 'prod-state-row');
        row.appendChild(el('div', 'prod-state-nm', a.name));
        var track = el('div', 'prod-state-track');
        var segs = [];
        E10.forEach(function (s) {
          var seg = el('i', 'prod-seg'); seg.style.background = U.cssVar(s.cssVar);
          seg.style.width = '0%';
          track.appendChild(seg); segs.push(seg);
        });
        row.appendChild(track);
        var rt = el('div', 'prod-state-rt');
        var prodCnt = el('span', 'prod-state-cnt', '0/0');
        rt.appendChild(prodCnt);
        row.appendChild(rt);
        stWrap.appendChild(row);
        stateRows.push({ id: a.id, segs: segs, cnt: prodCnt, last: '' });
      });
      stP._body.appendChild(stWrap);

      // compact floor counters under the state rollup
      var cwrap = el('div', 'prod-counters');
      [['lots', 'Lots / hr'], ['moves', 'Wafer moves / hr'], ['jobs', 'Active jobs'], ['alarms', 'Active alarms']].forEach(function (c) {
        var box = el('div', 'prod-counter');
        box.appendChild(el('div', 'lab', c[1]));
        var v = el('div', 'v', '—');
        box.appendChild(v);
        cwrap.appendChild(box);
        counts[c[0]] = { box: box, v: v };
      });
      stP._body.appendChild(cwrap);
      grid.appendChild(stP);

      // ---- active jobs table ----
      var jobsP = U.panel('Active Process Jobs (E40 / E94)', { cls: 'col-7 hud', bodyCls: 'flush' });
      jobsTbl = U.table([
        { label: 'Tool', key: 'tool', tdCls: 'name' },
        { label: 'Area', key: 'area' },
        { label: 'Lot', key: 'lot' },
        { label: 'Recipe', key: 'recipe' },
        { label: 'Carrier', key: 'carrier' },
        { label: 'Progress', render: function (r) { return progBar(r.prog); }, tdCls: 'num' }
      ], { maxH: '260px' });
      jobsP._body.appendChild(jobsTbl.node);
      grid.appendChild(jobsP);

      // ---- event log (firehose) ----
      var logP = U.panel('Live Event Log — SECS/GEM Collection Events', { cls: 'col-5 hud', bodyCls: 'flush', meta: '— evt/s', metaId: 'evlogmeta' });
      var logStream = el('div', 'stream'); logStream.style.maxHeight = '260px'; logStream.style.overflow = 'hidden';
      logStream.title = 'Hover to pause the stream and read';
      logP._body.appendChild(logStream);
      grid.appendChild(logP);
      logTicker = U.Ticker(logStream, { showAll: true, maxRows: 14, rowsPerSec: 1 / 3, rateEl: logP._head.querySelector('.meta') });

      root.appendChild(grid);
      livefab = new U.LiveFab(canvas);
    },

    update: function (frame) {
      fc++;
      livefab.update(frame);
      logTicker.push(frame.newEvents, frame.sim);

      // OEE rings — engine emits constant fleet OEE; add a deterministic,
      // loop-periodic ripple (sines that return to start at PERIOD) so the
      // E79 rings visibly breathe. View-only and seam-free.
      var oee = frame.kpis.oee;
      var ph = frame.t / BAS.clock.PERIOD * 6.2831853;
      var av = oee.availability * 100 + 1.3 * Math.sin(ph * 3);
      var pf = oee.performance * 100 + 2.0 * Math.sin(ph * 2 + 1.1);
      var ql = oee.quality * 100 + 0.7 * Math.sin(ph * 5 + 2.3);
      rA.set(av); rP.set(pf); rQ.set(ql); rO.set(av * pf * ql / 10000);

      // overlay chips (cheap text; change-gated, every 4th frame)
      if (fc % 4 === 0) {
        var wpmh = Math.round(frame.kpis.wpmh);
        setText(ovWpmh, U.group(wpmh));
        var nJobs = frame.model.activeJobsAt(frame.t).length;
        setText(ovLots, String(nJobs));
      }

      if (fc % 8 === 0) {
        // hottest process area (drives overlay + nothing else heavy)
        var hottest = '', hotKW = -1, L = frame.load;
        for (var hi = 0; hi < M.areas.length; hi++) {
          var akw = L.areaKW[M.areas[hi].id] || 0;
          if (akw > hotKW) { hotKW = akw; hottest = M.areas[hi].name; }
        }
        setText(ovHot, hottest + '  ' + (hotKW >= 1000 ? (hotKW / 1000).toFixed(1) + 'k' : Math.round(hotKW)) + ' kW');

        // active jobs table
        var jobs = frame.model.activeJobsAt(frame.t).slice(0, 14);
        jobsTbl.set(jobs.map(function (j) {
          return { tool: j.tool, area: j.area, lot: j.lotId, recipe: j.recipe, carrier: j.carrierId,
            prog: Math.max(0, Math.min(1, (frame.t - j.start) / j.dur)) };
        }));

        // E10 stacked state bars per area (change-gated per row)
        for (var ri = 0; ri < stateRows.length; ri++) {
          var row = stateRows[ri];
          var s = frame.areaStates[row.id];
          var total = (s && s.total) || 0;
          // build a signature to gate DOM writes
          var sig = '';
          for (var ei = 0; ei < E10.length; ei++) sig += (s ? (s[E10[ei].key] || 0) : 0) + ',';
          if (sig !== row.last) {
            row.last = sig;
            for (var k = 0; k < E10.length; k++) {
              var cnt = s ? (s[E10[k].key] || 0) : 0;
              var w = total ? (cnt / total * 100) : 0;
              row.segs[k].style.width = w.toFixed(2) + '%';
            }
            row.cnt.textContent = (s ? s.Productive : 0) + '/' + total;
          }
        }

        // floor counters
        var wm = Math.round(frame.kpis.wpmh);
        setText(counts.lots.v, String(Math.round(wm / 25)));
        setText(counts.moves.v, U.group(wm));
        setText(counts.jobs.v, String(frame.model.activeJobsAt(frame.t).length));
        var nAl = frame.alarms.length;
        setText(counts.alarms.v, String(nAl));
        counts.alarms.box.classList.toggle('bad', nAl > 0);
      }
    }
  });

  // ---- helpers -----------------------------------------------------------
  function mkOvChip(parent, label, tone) {
    var chip = el('div', 'prod-ov-chip' + (tone ? ' ' + tone : ''));
    chip.appendChild(el('div', 'k', label));
    var v = el('div', 'v', '—');
    chip.appendChild(v);
    parent.appendChild(chip);
    v._last = null;
    return v;
  }
  function setText(node, txt) { if (node._last !== txt) { node._last = txt; node.textContent = txt; } }
  function pct1(v) { return v.toFixed(1); }
  function progBar(p) {
    var pct = (p * 100).toFixed(0);
    return '<div class="meter" style="width:70px;display:inline-block;vertical-align:middle"><i style="width:' + pct + '%"></i></div> ' + pct + '%';
  }
})(window.BAS);
