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
    cache = { N: N, P: P, demand: demand, peakMW: peak, minMW: min,
      alarms: [], density: new Uint16Array(120), bins: 120, e10: {} };
    return cache;
  }
  BAS.ui = BAS.ui || {};
  BAS.ui.timelineData = {
    get: function () { return cache || build(); },
    _reset: function () { cache = null; }
  };
})(window.BAS);
