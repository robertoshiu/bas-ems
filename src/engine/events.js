/* bas-ems — smart-factory event engine
 * Classic script -> window.BAS.events
 *
 * Builds a deterministic, loop-CLOSED schedule for the whole 180 s loop:
 *   - per-tool process jobs placed in non-overlapping slots that tile the circle
 *     (=> fully periodic, no seam, no wrap math needed for jobs)
 *   - SECS/GEM collection events (CEID via S6F11) per job
 *   - SEMI E10 equipment-state timeline per tool (every state entered also exits
 *     within the loop)
 *   - AMHS/OHT carrier-move events, APC/FDC excursions
 *   - S5F1/S5F2 alarms (every AlarmSet has a matching AlarmClear before t=180)
 *
 * Production tools and process areas are the source of truth; load-model.js
 * derives facility load from the jobs this module schedules.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var P = BAS.prng;
  var CK = BAS.clock;
  var M = BAS.master;
  var PERIOD = CK.PERIOD;

  // Collection Event IDs (numbers reported via S6F11) — distinct from labels.
  var CEID = {
    CarrierIn: 11, LoadPortDock: 12, LotStart: 21, ControlJobStart: 22, ProcessJobStart: 23,
    RecipeSelected: 24, ProcessStart: 25, SubstrateProcessed: 26, ProcessComplete: 27,
    ProcessJobEnd: 28, ControlJobComplete: 29, LotComplete: 30, CarrierOut: 31, LoadPortUndock: 32,
    ControlStateChange: 40, OHTDispatch: 51, OHTArrived: 52, StockerStore: 53, StockerRetrieve: 54,
    FDCExcursion: 61, SPCOutOfControl: 62, R2RAdjust: 63
  };

  // Alarm catalog (ALID -> ALCD text/severity), S5F1 reports.
  var ALARMS = [
    { alid: 1101, text: 'Chamber pressure deviation', sev: 'MINOR' },
    { alid: 1102, text: 'RF reflected power high', sev: 'MAJOR' },
    { alid: 1203, text: 'Process gas flow out of range', sev: 'MINOR' },
    { alid: 1310, text: 'Wafer present sensor mismatch', sev: 'MAJOR' },
    { alid: 1422, text: 'Temperature ramp rate exceeded', sev: 'MINOR' },
    { alid: 1505, text: 'Exhaust pressure low', sev: 'MAJOR' },
    { alid: 1610, text: 'FDC model excursion', sev: 'MINOR' },
    { alid: 1777, text: 'Load port handoff timeout (E84)', sev: 'MAJOR' },
    { alid: 1820, text: 'SPC out-of-control — CD trend', sev: 'MINOR' }
  ];

  // Per-area job duration band (compressed seconds) and jobs-per-loop band.
  var AREA_PROFILE = {
    LITHO: { dur: [9, 15], jobs: [7, 10] },
    ETCH:  { dur: [7, 12], jobs: [8, 12] },
    DIFF:  { dur: [16, 26], jobs: [4, 6] },
    IMPL:  { dur: [8, 13], jobs: [6, 9] },
    CMP:   { dur: [7, 11], jobs: [8, 11] },
    WET:   { dur: [6, 10], jobs: [9, 13] },
    THIN:  { dur: [9, 14], jobs: [6, 9] },
    METRO: { dur: [4, 7], jobs: [10, 14] }
  };

  var E10 = { PRODUCTIVE: 'Productive', STANDBY: 'Standby', ENGINEERING: 'Engineering',
    SCH_DOWN: 'Scheduled Down', UNSCH_DOWN: 'Unscheduled Down', NON_SCHED: 'Non-Scheduled' };

  function lotId(seed) { return 'LOT' + String(100000 + Math.floor(P.rand('lot:' + seed, 3) * 899999)); }
  function carrierId(seed) { return 'FOUP' + String(1000 + Math.floor(P.rand('car:' + seed, 5) * 8999)); }

  function build() {
    var jobs = [];
    var events = [];
    var e10 = {};       // toolId -> [{state, start, end}]
    var alarms = [];
    var seq = 0;

    M.tools.forEach(function (tool, ti) {
      var prof = AREA_PROFILE[tool.area] || AREA_PROFILE.METRO;
      var nJobs = P.randInt('njobs:' + tool.id, ti, prof.jobs[0], prof.jobs[1]);
      var slot = PERIOD / nJobs;
      var segs = [];
      var lastEnd = 0;

      for (var k = 0; k < nJobs; k++) {
        var slotStart = k * slot;
        var ch = tool.id + ':slot:' + k;
        // ~6% of slots are a downtime/engineering window instead of a job.
        var roll = P.rand('down:' + ch, k);
        var busyFrac = P.randRange('busy:' + ch, k, 0.62, 0.86);
        var dur = Math.max(3, slot * busyFrac);
        var pad = Math.max(0, slot - dur);
        var offset = P.randRange('off:' + ch, k, 0, pad);
        var start = slotStart + offset;
        var end = start + dur;

        if (roll < 0.06) {
          // Downtime / engineering slot (closed within the slot).
          var dstate = P.pickWeighted('dstate:' + ch, k,
            [E10.UNSCH_DOWN, E10.SCH_DOWN, E10.ENGINEERING], [0.4, 0.3, 0.3]);
          if (lastEnd < start) segs.push({ state: E10.STANDBY, start: lastEnd, end: start });
          segs.push({ state: dstate, start: start, end: end });
          lastEnd = end;
          // A down event + (for unscheduled) an alarm pair within the window.
          events.push(mkEvent(seq++, start, 'ControlStateChange', CEID.ControlStateChange, tool, null, 'state',
            dstate === E10.UNSCH_DOWN ? 'MAJOR' : 'INFO', { e10: dstate }));
          if (dstate === E10.UNSCH_DOWN) {
            var al = P.pick('al:' + ch, k, ALARMS);
            alarms.push({ tool: tool.id, area: tool.area, alid: al.alid, text: al.text, sev: al.sev,
              set: start + 0.4, clear: Math.min(end - 0.3, start + 0.4 + dur * 0.7) });
          }
          continue;
        }

        // Normal process job.
        var recipe = P.pick('rcp:' + ch, k, M.recipes(tool.area));
        var lot = lotId(tool.id + k), foup = carrierId(tool.id + k);
        var wafers = 25;
        var job = { tool: tool.id, area: tool.area, areaName: tool.areaName, kind: tool.kind,
          recipe: recipe, lotId: lot, carrierId: foup, start: start, end: end, dur: dur, wafers: wafers };
        jobs.push(job);

        if (lastEnd < start) segs.push({ state: E10.STANDBY, start: lastEnd, end: start });
        segs.push({ state: E10.PRODUCTIVE, start: start, end: end });
        lastEnd = end;

        // --- SECS/GEM event sequence across the job window ---
        var lead = Math.min(0.8, dur * 0.12);
        var tail = Math.min(0.8, dur * 0.12);
        var base = { area: tool.area, recipe: recipe, lotId: lot, carrierId: foup };
        push(events, seq, start, 'CarrierIn', CEID.CarrierIn, tool, 'amhs', 'INFO', base); seq++;
        push(events, seq, start + 0.05, 'LoadPortDock', CEID.LoadPortDock, tool, 'amhs', 'INFO', base); seq++;
        push(events, seq, start + lead * 0.4, 'LotStart', CEID.LotStart, tool, 'lot', 'INFO', base); seq++;
        push(events, seq, start + lead * 0.5, 'RecipeSelected', CEID.RecipeSelected, tool, 'job', 'INFO', base); seq++;
        push(events, seq, start + lead * 0.6, 'ControlJobStart', CEID.ControlJobStart, tool, 'job', 'INFO', base); seq++;
        push(events, seq, start + lead, 'ProcessJobStart', CEID.ProcessJobStart, tool, 'job', 'INFO', base); seq++;
        push(events, seq, start + lead + 0.1, 'ProcessStart', CEID.ProcessStart, tool, 'job', 'INFO', base); seq++;

        // SubstrateProcessed across the run (a readable handful representing the lot).
        var nSub = 4 + P.randInt('nsub:' + ch, k, 0, 3);
        for (var s = 0; s < nSub; s++) {
          var st = start + lead + (dur - lead - tail) * ((s + 1) / (nSub + 1));
          var wnum = Math.round((s + 1) / (nSub + 1) * wafers);
          push(events, seq, st, 'SubstrateProcessed', CEID.SubstrateProcessed, tool, 'wafer', 'INFO',
            mix(base, { wafer: wnum + '/' + wafers })); seq++;
        }
        // Occasional FDC/SPC excursion mid-run.
        if (P.rand('fdc:' + ch, k) < 0.14) {
          var fst = start + lead + (dur - lead - tail) * 0.5;
          var kind2 = P.rand('fk:' + ch, k) < 0.5 ? 'FDCExcursion' : 'SPCOutOfControl';
          push(events, seq, fst, kind2, CEID[kind2], tool, 'fdc', 'MINOR', base); seq++;
          if (P.rand('r2r:' + ch, k) < 0.6) {
            push(events, seq, fst + 0.3, 'R2RAdjust', CEID.R2RAdjust, tool, 'fdc', 'INFO', base); seq++;
          }
          // Some excursions raise a short alarm pair.
          if (P.rand('fal:' + ch, k) < 0.4) {
            alarms.push({ tool: tool.id, area: tool.area, alid: 1610, text: 'FDC model excursion', sev: 'MINOR',
              set: fst, clear: Math.min(end - tail, fst + 1.2) });
          }
        }

        push(events, seq, end - tail, 'ProcessComplete', CEID.ProcessComplete, tool, 'job', 'INFO', base); seq++;
        push(events, seq, end - tail * 0.6, 'ProcessJobEnd', CEID.ProcessJobEnd, tool, 'job', 'INFO', base); seq++;
        push(events, seq, end - tail * 0.5, 'ControlJobComplete', CEID.ControlJobComplete, tool, 'job', 'INFO', base); seq++;
        push(events, seq, end - tail * 0.3, 'LotComplete', CEID.LotComplete, tool, 'lot', 'INFO', base); seq++;
        push(events, seq, end - 0.05, 'CarrierOut', CEID.CarrierOut, tool, 'amhs', 'INFO', base); seq++;
        push(events, seq, end, 'LoadPortUndock', CEID.LoadPortUndock, tool, 'amhs', 'INFO', base); seq++;
        // OHT moves the FOUP onward.
        push(events, seq, end + Math.min(0.3, slot - dur - offset > 0 ? 0.3 : 0.05), 'OHTDispatch', CEID.OHTDispatch,
          tool, 'amhs', 'INFO', mix(base, { vehicle: 'OHT-' + String(P.randInt('oht:' + ch, k, 1, 120)).padStart(3, '0') })); seq++;
      }
      // Close the timeline: trailing standby to the seam.
      if (lastEnd < PERIOD) segs.push({ state: E10.STANDBY, start: lastEnd, end: PERIOD });
      e10[tool.id] = mergeSegs(segs);
    });

    // Sort events by time; assign tick.
    events.sort(function (a, b) { return a.sec - b.sec || a.seq - b.seq; });
    events.forEach(function (e) { e.tick = CK.tickOf(e.sec); });

    // Alarm-derived S5F1/S5F2 events on the stream (set + clear).
    alarms.forEach(function (a, i) {
      events.push(alarmEvent(10000 + i * 2, a.set, 'AlarmSet', a, 'alarm', a.sev));
      events.push(alarmEvent(10000 + i * 2 + 1, a.clear, 'AlarmClear', a, 'alarm', 'INFO'));
    });
    events.sort(function (a, b) { return a.sec - b.sec || a.seq - b.seq; });
    events.forEach(function (e) { e.tick = CK.tickOf(e.sec); });

    var model = {
      jobs: jobs, events: events, e10: e10, alarms: alarms, CEID: CEID, E10: E10,
      count: events.length
    };
    model.activeJobsAt = function (t) {
      var out = [];
      for (var i = 0; i < jobs.length; i++) { if (jobs[i].start <= t && t < jobs[i].end) out.push(jobs[i]); }
      return out;
    };
    model.e10StateAt = function (toolId, t) {
      var segs = e10[toolId]; if (!segs) return E10.STANDBY;
      for (var i = 0; i < segs.length; i++) { if (segs[i].start <= t && t < segs[i].end) return segs[i].state; }
      return E10.STANDBY;
    };
    model.alarmsActiveAt = function (t) {
      var out = [];
      for (var i = 0; i < alarms.length; i++) { if (alarms[i].set <= t && t < alarms[i].clear) out.push(alarms[i]); }
      return out;
    };
    // Events strictly within (a, b] on the loop, handling wrap.
    model.eventsInWindow = function (a, b) {
      var out = [];
      if (a <= b) {
        for (var i = 0; i < events.length; i++) { if (events[i].sec > a && events[i].sec <= b) out.push(events[i]); }
      } else {
        for (var j = 0; j < events.length; j++) { if (events[j].sec > a || events[j].sec <= b) out.push(events[j]); }
      }
      return out;
    };
    return model;
  }

  // ---- helpers ----
  function mkEvent(seq, sec, type, ceid, tool, cls, sev, extra) {
    var e = { seq: seq, sec: ((sec % PERIOD) + PERIOD) % PERIOD, type: type, ceid: ceid,
      tool: tool.id, area: tool.area, cls: cls, sev: sev };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) e[k] = extra[k];
    return e;
  }
  function push(arr, seq, sec, type, ceid, tool, cls, sev, extra) {
    arr.push(mkEvent(seq, sec, type, ceid, tool, cls, sev, extra));
  }
  function alarmEvent(seq, sec, type, a, cls, sev) {
    return { seq: seq, sec: ((sec % PERIOD) + PERIOD) % PERIOD, type: type, alid: a.alid, alcd: type === 'AlarmSet' ? 1 : 0,
      text: a.text, tool: a.tool, area: a.area, cls: cls, sev: sev, tick: CK.tickOf(sec) };
  }
  function mix(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in b) o[j] = b[j]; return o; }
  function mergeSegs(segs) {
    if (!segs.length) return segs;
    var out = [segs[0]];
    for (var i = 1; i < segs.length; i++) {
      var last = out[out.length - 1];
      if (segs[i].state === last.state && Math.abs(segs[i].start - last.end) < 1e-6) last.end = segs[i].end;
      else out.push(segs[i]);
    }
    return out;
  }

  BAS.events = { build: build, CEID: CEID, ALARMS: ALARMS, E10: E10 };
})(window.BAS);
