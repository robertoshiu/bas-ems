/* bas-ems — view-side clock source (time-machine substrate)
 * Classic script -> window.BAS.clockSource
 * Decides which t is fed to sim.frame(t): live wall-clock, paused/scrub, or replay.
 * Engine untouched. BAS.clock.now() is the wall-clock base (wraps mod 180).
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var CK = BAS.clock, P = CK.PERIOD;
  var mode = 'live', offset = 0, scrubT = 0,
      // replay state (null when inactive)
      rep = null, lastT = 0, listeners = [];

  function wrap(t) { return ((t % P) + P) % P; }
  var _wall = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000; };
  function wall() { return _wall(); }
  function emit() { for (var i = 0; i < listeners.length; i++) listeners[i](mode, lastT); }
  function toLiveAt(t) { offset = wrap(t - CK.now()); mode = 'live'; }

  function now() {
    var t;
    if (mode === 'live') { t = wrap(CK.now() + offset); }
    else if (mode === 'paused') { t = scrubT; }
    else { // replay (monotonic stopwatch via wall(), output wrapped)
      var tRaw = rep.startT + (wall() - rep.wall0) * rep.rate;
      if (tRaw >= rep.endT) {
        var endWrap = wrap(rep.endT), oe = rep.onEnd; rep = null; toLiveAt(endWrap);
        t = endWrap; lastT = t; emit(); if (oe) oe(); return t;
      }
      t = wrap(tRaw); if (rep.onTick) rep.onTick(t);
    }
    lastT = t; return t;
  }

  BAS.clockSource = {
    get mode() { return mode; },
    now: now,
    isLive: function () { return mode === 'live'; },
    scrubTo: function (t) { rep = null; scrubT = wrap(t); mode = 'paused'; lastT = scrubT; emit(); },
    resume: function () { rep = null; toLiveAt(scrubT); lastT = now(); emit(); },
    pause: function () { var t = now(); rep = null; scrubT = t; mode = 'paused'; lastT = scrubT; emit(); },
    togglePlay: function () { if (mode === 'live') this.pause(); else this.resume(); },
    step: function (d) { rep = null; scrubT = wrap(scrubT + d); mode = 'paused'; lastT = scrubT; emit(); },
    cancel: function () { if (mode === 'replay') { var t = lastT; rep = null; toLiveAt(t); emit(); } },
    // startT may be negative / endT may exceed P; replay.js passes a forward window.
    startReplay: function (startT, endT, rate, onTick, onEnd) {
      rep = { startT: startT, endT: endT, rate: rate == null ? 1.5 : rate, wall0: wall(), onTick: onTick, onEnd: onEnd };
      mode = 'replay'; emit();
    },
    onChange: function (cb) { listeners.push(cb); },
    _setWall: function (fn) { _wall = fn; }
  };
})(window.BAS);
