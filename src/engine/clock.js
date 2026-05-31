/* bas-ems — virtual fab clock
 * Classic script -> window.BAS.clock
 * Loop period: exactly 180.000 s real = 60 min simulated (20x compression).
 * Time basis is wall-clock-derived so RAF throttling on a backgrounded tab
 * cannot drift the loop or cause a catch-up burst.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';

  var PERIOD = 180;        // seconds, real demo loop
  var SIM_MINUTES = 60;    // simulated minutes represented by one loop
  var TICK_HZ = 8;         // event grid frequency
  var TICKS = PERIOD * TICK_HZ; // 1440 ticks per loop
  var SHIFT_START_MIN = 6 * 60; // sim time-of-day starts at 06:00

  var t0 = null;

  function _nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  // Current loop time in seconds [0, PERIOD).
  function now() {
    var p = _nowMs();
    if (t0 === null) t0 = p;
    return ((p - t0) % (PERIOD * 1000)) / 1000;
  }

  function reset() { t0 = null; }

  // Integer tick on the 8 Hz grid [0, TICKS).
  function tickOf(t) {
    var k = Math.floor(t * TICK_HZ);
    return ((k % TICKS) + TICKS) % TICKS;
  }

  // Forward elapsed seconds from te to t on the loop circle [0, PERIOD).
  function forwardElapsed(t, te) {
    var d = t - te;
    return ((d % PERIOD) + PERIOD) % PERIOD;
  }

  // Shortest wrapped distance on the loop circle.
  function wrapDist(t, te) {
    var d = Math.abs(t - te);
    return Math.min(d, PERIOD - d);
  }

  // Simulated wall-clock for display (HH:MM:SS) + progress.
  function simClock(t) {
    var simMin = (t / PERIOD) * SIM_MINUTES;          // 0..60
    var total = SHIFT_START_MIN + simMin;             // minutes since 00:00
    var hh = Math.floor(total / 60) % 24;
    var mm = Math.floor(total) % 60;
    var ss = Math.floor((total - Math.floor(total)) * 60);
    return {
      hh: hh, mm: mm, ss: ss, simMin: simMin,
      hms: pad(hh) + ':' + pad(mm) + ':' + pad(ss),
      progress: t / PERIOD
    };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  BAS.clock = {
    PERIOD: PERIOD, SIM_MINUTES: SIM_MINUTES, TICK_HZ: TICK_HZ, TICKS: TICKS,
    now: now, reset: reset, tickOf: tickOf,
    forwardElapsed: forwardElapsed, wrapDist: wrapDist,
    simClock: simClock, pad: pad
  };
})(window.BAS);
