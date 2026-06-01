/* bas-ems — timeline lane data (precomputed once, cached)
 * Classic script -> window.BAS.ui.timelineData
 * Built from BAS.sim.load.sample(t') + BAS.sim.model. NEVER calls BAS.sim.frame().
 * Demand series in this task; alarms/density/e10 added in Task 5.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var cache = null;
  function build() {
    var load = BAS.sim.load, P = BAS.clock.PERIOD, N = 360;
    if (!load) throw new Error('timelineData.get() called before BAS.sim.init()');
    var demand = new Float32Array(N), peak = 0, min = 1e9;
    for (var i = 0; i < N; i++) {
      var mw = load.sample(i / N * P).totalKW / 1000;
      demand[i] = mw; if (mw > peak) peak = mw; if (mw < min) min = mw;
    }
    var model = BAS.sim.model, bins = 120;
    // alarms straight from the deterministic model
    var alarms = model.alarms.map(function (a) {
      return { alid: a.alid, area: a.area, tool: a.tool, sev: a.sev, setT: a.set, clearT: a.clear, text: a.text };
    });
    // event-density histogram
    var density = new Uint16Array(bins);
    for (var e = 0; e < model.events.length; e++) {
      var b = Math.min(bins - 1, Math.floor(model.events[e].sec / P * bins)); density[b]++;
    }
    // E10 ribbons per tool (already loop-closed segments)
    var e10 = {};
    var ids = Object.keys(model.e10);
    for (var k = 0; k < ids.length; k++) {
      e10[ids[k]] = model.e10[ids[k]].map(function (s) { return { state: s.state, startT: s.start, endT: s.end }; });
    }
    cache = { N: N, P: P, demand: demand, peakMW: peak, minMW: min,
      alarms: alarms, density: density, bins: bins, e10: e10 };
    return cache;
  }
  BAS.ui = BAS.ui || {};
  BAS.ui.timelineData = {
    get: function () { return cache || build(); },
    _reset: function () { cache = null; }
  };
})(window.BAS);
