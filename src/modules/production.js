/* bas-ems — Production Floor (hero): smart-factory events driving facility load
 * Classic script -> registers module 'production'
 * Reference module: shows the mount(root)/update(frame) pattern every module uses.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  var livefab, logTicker, gA, gP, gQ, gO, jobsTbl, stateWrap, counts = {}, fc = 0;

  BAS.registerModule({
    id: 'production', title: 'Production Floor', group: 'Operations', order: 1, icon: 'flow',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Production Floor</h1><span class="crumb">FAB-1 · Live SECS/GEM · MES · AMHS</span>' +
        '<span class="right">production activity drives facility load &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // hero
      var heroP = U.panel('Living Fab — Production ⟶ Facility Coupling', { cls: 'col-12', bodyCls: 'flush', pill: 'LIVE' });
      var canvas = el('canvas', 'spark'); canvas.style.height = '320px'; canvas.style.width = '100%';
      heroP._body.appendChild(canvas);
      grid.appendChild(heroP);

      // event log (firehose)
      var logP = U.panel('Live Event Log — SECS/GEM Collection Events', { cls: 'col-8', bodyCls: 'flush', meta: '— evt/s', metaId: 'evlogmeta' });
      var logStream = el('div', 'stream'); logStream.style.maxHeight = '300px'; logStream.style.overflow = 'hidden';
      logStream.title = 'Hover to pause the stream and read';
      logP._body.appendChild(logStream);
      grid.appendChild(logP);
      logTicker = U.Ticker(logStream, { showAll: true, maxRows: 16, rowsPerSec: 1 / 3, rateEl: logP._head.querySelector('.meta') }); // 3x slower again → ~3s/row

      // OEE gauges
      var oeeP = U.panel('Fab Equipment Effectiveness (E79 OEE)', { cls: 'col-4' });
      var grow = el('div'); grow.style.display = 'grid'; grow.style.gridTemplateColumns = '1fr 1fr'; grow.style.gap = '6px'; grow.style.justifyItems = 'center';
      gA = U.gauge({ label: 'Availability', unit: '%', min: 60, max: 100, size: 118, thresholds: { warn: 85, bad: 78, invert: true }, fmt: pct1 });
      gP = U.gauge({ label: 'Performance', unit: '%', min: 60, max: 100, size: 118, thresholds: { warn: 88, bad: 82, invert: true }, fmt: pct1 });
      gQ = U.gauge({ label: 'Quality', unit: '%', min: 90, max: 100, size: 118, thresholds: { warn: 97, bad: 95, invert: true }, fmt: pct1 });
      gO = U.gauge({ label: 'OEE', unit: '%', min: 50, max: 100, size: 118, color: U.cssVar('--accent'), fmt: pct1 });
      [gA, gP, gQ, gO].forEach(function (g) { grow.appendChild(g.node); });
      oeeP._body.appendChild(grow);
      grid.appendChild(oeeP);

      // active jobs
      var jobsP = U.panel('Active Process Jobs (E40 / E94)', { cls: 'col-8', bodyCls: 'flush' });
      jobsTbl = U.table([
        { label: 'Tool', key: 'tool', tdCls: 'name' },
        { label: 'Area', key: 'area' },
        { label: 'Lot', key: 'lot' },
        { label: 'Recipe', key: 'recipe' },
        { label: 'Carrier', key: 'carrier' },
        { label: 'Progress', render: function (r) { return progBar(r.prog); }, tdCls: 'num' }
      ], { maxH: '232px' });
      jobsP._body.appendChild(jobsTbl.node);
      grid.appendChild(jobsP);

      // equipment state rollup
      var stP = U.panel('Equipment State — SEMI E10', { cls: 'col-4' });
      stateWrap = el('div');
      stP._body.appendChild(stateWrap);
      var cwrap = el('div'); cwrap.style.marginTop = '10px';
      ['Lots / hr', 'Wafer moves / hr', 'Active jobs', 'Active alarms'].forEach(function (lab, i) {
        var r = el('div', 'stat-line');
        r.appendChild(el('span', 'k', lab));
        var v = el('span', 'v', '—'); r.appendChild(v); cwrap.appendChild(r);
        counts[i] = v;
      });
      stP._body.appendChild(cwrap);
      grid.appendChild(stP);

      root.appendChild(grid);
      livefab = new U.LiveFab(canvas);
    },

    update: function (frame) {
      fc++;
      livefab.update(frame);
      logTicker.push(frame.newEvents, frame.sim);

      // Engine emits a constant fleet OEE; add a small deterministic, loop-periodic
      // ripple (smooth sines over the loop) so the E79 gauges visibly breathe.
      // View-only and seam-free — each sin returns to its start at t = PERIOD.
      var oee = frame.kpis.oee;
      var ph = frame.t / BAS.clock.PERIOD * 6.2831853;
      var av = oee.availability * 100 + 1.3 * Math.sin(ph * 3);
      var pf = oee.performance  * 100 + 2.0 * Math.sin(ph * 2 + 1.1);
      var ql = oee.quality      * 100 + 0.7 * Math.sin(ph * 5 + 2.3);
      gA.set(av); gP.set(pf); gQ.set(ql); gO.set(av * pf * ql / 10000);

      if (fc % 8 === 0) {
        var jobs = frame.model.activeJobsAt(frame.t).slice(0, 14);
        jobsTbl.set(jobs.map(function (j) {
          return { tool: j.tool, area: j.area, lot: j.lotId, recipe: j.recipe, carrier: j.carrierId,
            prog: Math.max(0, Math.min(1, (frame.t - j.start) / j.dur)) };
        }));
        // state rollup bars
        var html = '';
        BAS.master.areas.forEach(function (a) {
          var s = frame.areaStates[a.id];
          var pf = s.total ? s.Productive / s.total : 0;
          html += '<div class="stat-line"><span class="k">' + a.name + '</span>' +
            '<span class="v">' + s.Productive + '/' + s.total + '</span></div>' +
            '<div class="meter good" style="margin:-2px 0 6px"><i style="width:' + (pf * 100).toFixed(0) + '%"></i></div>';
        });
        stateWrap.innerHTML = html;

        counts[0].textContent = Math.round(frame.kpis.wpmh / 25);
        counts[1].textContent = U.group(Math.round(frame.kpis.wpmh));
        counts[2].textContent = frame.model.activeJobsAt(frame.t).length;
        counts[3].textContent = frame.alarms.length;
        counts[3].style.color = frame.alarms.length ? U.cssVar('--bad') : U.cssVar('--text');
      }
    }
  });

  function pct1(v) { return v.toFixed(1); }
  function progBar(p) {
    var pct = (p * 100).toFixed(0);
    return '<div class="meter" style="width:70px;display:inline-block;vertical-align:middle"><i style="width:' + pct + '%"></i></div> ' + pct + '%';
  }
})(window.BAS);
