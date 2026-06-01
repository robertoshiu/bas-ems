/* bas-ems — Incident Replay (drive the clock through an alarm's cause-chain)
 * Classic script -> window.BAS.replay
 * Caption builder reads BAS.sim.model (deterministic), not the live stream.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var P = BAS.clock.PERIOD, active = false, stripEl = null, caps = [], capIdx = 0;

  function fwd(a, b) { var d = b - a; return ((d % P) + P) % P; } // forward span a->b

  function _window(al) {
    var startT = al.setT - 8;                          // may be negative (kept linear)
    var dur = fwd(al.setT, al.clearT) + 13;            // 8s lead + span + 5s tail
    return { startT: startT, endT: startT + dur };
  }

  function _captions(al) {
    var model = BAS.sim.model, lo = ((al.setT - 8) % P + P) % P, hi = ((al.clearT + 5) % P + P) % P;
    function inWin(sec) { return lo <= hi ? (sec >= lo && sec <= hi) : (sec >= lo || sec <= hi); }
    var out = [];
    var ev = model.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.area !== al.area || !inWin(e.sec)) continue;
      if (e.type === 'ProcessJobStart') out.push({ t: e.sec, text: e.tool + ' Process Job Start' });
      else if (e.type === 'FDCExcursion') out.push({ t: e.sec, text: 'FDC excursion @ ' + e.tool });
      else if (e.type === 'SPCOutOfControl') out.push({ t: e.sec, text: 'SPC out-of-control @ ' + e.tool });
    }
    out.push({ t: al.setT, text: 'ALARM ' + al.alid + ' — ' + al.text + ' @ ' + al.tool });
    out.push({ t: al.clearT, text: 'Alarm cleared' });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function start(al) {
    if (active) stop();
    var w = _window(al); caps = _captions(al); capIdx = 0; active = true;
    ensureStrip(); stripEl.style.display = 'flex'; stripEl.textContent = 'Incident Replay — ALID ' + al.alid;
    if (BAS.ui._timelineHighlight) BAS.ui._timelineHighlight(al);
    BAS.clockSource.startReplay(w.startT, w.endT, 1.5, onTick, onEnd);
  }
  function onTick(t) {
    // advance captions whose time has passed (wrapped compare via forward distance is fine for short windows)
    while (capIdx < caps.length && nearOrPast(caps[capIdx].t, t)) { stripEl.textContent = caps[capIdx].text; capIdx++; }
  }
  function nearOrPast(capT, t) { return fwd(capT, t) < 1.0 || fwd(t, capT) > P - 1.0; }
  function onEnd() { stop(); }
  function stop() {
    active = false; if (stripEl) stripEl.style.display = 'none';
    if (BAS.ui._timelineHighlight) BAS.ui._timelineHighlight(null);
    if (BAS.clockSource.cancel) BAS.clockSource.cancel();   // exit replay -> live (no-op if already live)
  }
  function ensureStrip() {
    if (stripEl) return;
    stripEl = BAS.ui.el('div', 'replay-strip'); stripEl.style.display = 'none';
    document.body.appendChild(stripEl);
  }

  // If the clock leaves replay by any path (user scrub / play-pause / step / natural end),
  // tear down the replay UI so a stale caption + highlight can't linger over a live timeline.
  BAS.clockSource.onChange(function (m) { if (active && m !== 'replay') stop(); });

  BAS.replay = { start: start, stop: stop, get active() { return active; }, _window: _window, _captions: _captions };
})(window.BAS);
