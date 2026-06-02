/* bas-ems — live event ticker / stream
 * Classic script -> window.BAS.ui.Ticker
 * DOM list capped at maxRows. Default filter hides high-frequency sub-events
 * for readability; pass showAll:true for the full firehose.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  // Curated set shown on the always-on rail (readable rate).
  var RAIL_TYPES = {
    LotStart: 1, LotComplete: 1, ProcessJobStart: 1, ProcessJobEnd: 1,
    CarrierIn: 1, CarrierOut: 1, OHTDispatch: 1, ControlStateChange: 1,
    FDCExcursion: 1, SPCOutOfControl: 1, R2RAdjust: 1, AlarmSet: 1, AlarmClear: 1
  };
  var FRIENDLY = {
    ProcessJobStart: 'Process Job Start', ProcessJobEnd: 'Process Job End',
    LotStart: 'Lot Start', LotComplete: 'Lot Complete', CarrierIn: 'Carrier In', CarrierOut: 'Carrier Out',
    OHTDispatch: 'OHT Dispatch', OHTArrived: 'OHT Arrived', ControlStateChange: 'E10 State Change',
    FDCExcursion: 'FDC Excursion', SPCOutOfControl: 'SPC Out-of-Control', R2RAdjust: 'R2R Adjust',
    AlarmSet: 'ALARM', AlarmClear: 'Alarm Clear', SubstrateProcessed: 'Substrate Processed',
    RecipeSelected: 'Recipe Selected', ProcessStart: 'Process Start', ProcessComplete: 'Process Complete',
    ControlJobStart: 'Control Job Start', ControlJobComplete: 'Control Job Complete',
    LoadPortDock: 'Load Port Dock', LoadPortUndock: 'Load Port Undock'
  };

  function meta(e) {
    var bits = [e.tool];
    if (e.type === 'AlarmSet' || e.type === 'AlarmClear') { bits.push('ALID ' + e.alid); if (e.text) bits.push(e.text); }
    else {
      if (e.lotId) bits.push(e.lotId);
      if (e.recipe) bits.push(e.recipe);
      if (e.wafer) bits.push('wfr ' + e.wafer);
      if (e.vehicle) bits.push(e.vehicle);
      if (e.e10) bits.push('→ ' + e.e10);
      if (e.ceid) bits.push('CEID ' + e.ceid);
    }
    return bits.join(' · ');
  }

  // Layered display rhythm. tier-1 alarms are loudest: they bypass hover-pause for
  // situational awareness but are still capped to 1/sec so an alarm flood can't carpet
  // the rail. tier-2 E10 state changes pace at 4s. tier-3 (everything else: lots, jobs,
  // AMHS, FDC) uses the caller's own rowsPerSec, so each rail keeps its tuned cadence.
  // The evt/s counter still reports the true ~54/s, so the firehose still reads as a number.
  function tierOf(e) {
    if (e.type === 'AlarmSet') return 1;
    if (e.type === 'ControlStateChange') return 2;
    return 3;
  }

  BAS.ui.Ticker = function (streamEl, opts) {
    opts = opts || {};
    var maxRows = opts.maxRows || 24;
    var showAll = !!opts.showAll;
    var filterCls = opts.filterCls || null; // optional class filter (function or null)
    var rateEl = opts.rateEl || null;
    // Decouple DISPLAY cadence from the true event rate: routine events are
    // released at most rowsPerSec; alarms/FDC always show; the counter keeps
    // reporting the real (high) throughput so it still reads as "nonstop".
    var minGapMs = 1000 / (opts.rowsPerSec || 3);   // tier-3 (routine) per-caller cadence
    var TIER1_GAP = 1000;   // tier-1 (AlarmSet): at most 1 row/sec, even while hover-paused
    var TIER2_GAP = 4000;   // tier-2 (ControlStateChange / E10): at most 1 row/4s
    var emaRate = 0, lastMs = null, paused = false, lastRateMs = -1e9;
    // Last-shown timestamp per tier — created once in closure scope (zero per-frame alloc).
    var lastTierMs = { 1: -1e9, 2: -1e9, 3: -1e9 };

    // Pause-on-hover so a reader can stop the stream and actually read a row.
    streamEl.addEventListener('mouseenter', function () { paused = true; });
    streamEl.addEventListener('mouseleave', function () { paused = false; });

    function rowEl(e, hms) {
      var row = el('div', 'evt enter cls-' + e.cls);
      var tm = el('div', 'tm', hms.slice(-5));
      var bd = el('div', 'bd');
      var ty = el('div', 'ty'); ty.textContent = FRIENDLY[e.type] || e.type;
      var mt = el('div', 'mt'); mt.textContent = meta(e);
      bd.appendChild(ty); bd.appendChild(mt);
      row.appendChild(tm); row.appendChild(bd);
      // Alarm rows are clickable when an onAlarmClick callback is provided and the event
      // carries an area (guard avoids a silent navigate-to-default on a malformed event).
      if (e.cls === 'alarm' && opts.onAlarmClick && e.area) {
        row.classList.add('clickable-alarm');   // cursor:pointer via CSS
        (function (area) {
          row.addEventListener('click', function () { opts.onAlarmClick(area); });
        })(e.area);
      }
      return row;
    }

    return {
      push: function (events, sim) {
        var nowMs = (performance && performance.now) ? performance.now() : Date.now();
        if (lastMs != null) {
          var dt = (nowMs - lastMs) / 1000;
          if (dt > 0) { var inst = events.length / dt; emaRate = emaRate ? emaRate * 0.9 + inst * 0.1 : inst; }
        }
        lastMs = nowMs;
        // Rate readout: show the paused indicator while hover-paused, otherwise throttle the
        // evt/s number to ~1s (the EMA still tracks every frame; only display cadence slows).
        if (paused) {
          if (rateEl) rateEl.textContent = '❚❚ paused';
        } else if (rateEl && nowMs - lastRateMs > 1000) {
          lastRateMs = nowMs;
          rateEl.textContent = (emaRate ? emaRate.toFixed(0) : '0') + ' evt/s';
        }

        var hms = sim ? sim.hms : '00:00:00';
        // At most one row per tier per frame; per-tier min-gap enforces the layered rhythm.
        var admitted1 = false, admitted2 = false, admitted3 = false;
        for (var i = 0; i < events.length; i++) {
          var e = events[i];
          if (!showAll && !RAIL_TYPES[e.type]) continue;
          if (filterCls && !filterCls(e)) continue;
          var tier = tierOf(e);
          // Hover-pause: tier-1 alarms still post (situational awareness); tier-2/3 are
          // dropped and the stream simply resumes live on mouseleave (no stale backlog).
          if (paused && tier !== 1) continue;
          if (tier === 1) {
            if (admitted1 || (nowMs - lastTierMs[1]) < TIER1_GAP) continue;
            streamEl.insertBefore(rowEl(e, hms), streamEl.firstChild);
            lastTierMs[1] = nowMs; admitted1 = true;
          } else if (tier === 2) {
            if (admitted2 || (nowMs - lastTierMs[2]) < TIER2_GAP) continue;
            streamEl.insertBefore(rowEl(e, hms), streamEl.firstChild);
            lastTierMs[2] = nowMs; admitted2 = true;
          } else {
            if (admitted3 || (nowMs - lastTierMs[3]) < minGapMs) continue;
            streamEl.insertBefore(rowEl(e, hms), streamEl.firstChild);
            lastTierMs[3] = nowMs; admitted3 = true;
          }
        }
        while (streamEl.childNodes.length > maxRows) streamEl.removeChild(streamEl.lastChild);
      },
      setRate: function (r) { if (rateEl) rateEl.textContent = r; }
    };
  };
  BAS.ui.eventMeta = meta; BAS.ui.eventFriendly = FRIENDLY;
})(window.BAS);
