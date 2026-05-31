/* bas-ems — production -> facility load model
 * Classic script -> window.BAS.loadModel
 *
 * Precomputes per-tick facility load curves from the job schedule. Each job's
 * contribution uses forwardElapsed() on the loop circle with a decay constant
 * capped so the tail fully fades within the rest window -> curves are periodic
 * and continuous (seam-free) by construction. Baselines are periodic functions
 * of the clock. sim.js samples these curves; nothing here allocates per frame.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var CK = BAS.clock;
  var P = BAS.prng;
  var M = BAS.master;
  var TICKS = CK.TICKS, PERIOD = CK.PERIOD;
  var TWO_PI = Math.PI * 2;

  // Per-area load vectors (peak deltas + time constants). kW/RT/m3h absolute;
  // exhaust + n2 are percent deltas over baseline.
  // Exhaust / N2 deltas are PER-JOB percent modulations that sum across all
  // concurrent tools; kept small so the aggregate header swing stays realistic
  // (~+15-35% over a large steady baseline), not 5x. kW/RT/m3h deltas are absolute.
  var AREA_LOAD = {
    LITHO: { procKW: [15, 30], exGen: [0.4, 0.9], tr: 3, td: 18 },
    ETCH:  { procKW: [40, 90], exAcid: [1.2, 2.2], abate: [60, 120], tr: 6, td: 40 },
    DIFF:  { procKW: [150, 300], pcw: [20, 40], n2: [0.9, 1.8], tr: 25, td: 90 },
    IMPL:  { procKW: [80, 160], exGen: [0.5, 1.0], tr: 6, td: 30 },
    CMP:   { procKW: [10, 20], upw: [25, 50], pcw: [10, 20], exGen: [0.5, 1.0], tr: 6, td: 35 },
    WET:   { procKW: [6, 14], upw: [30, 60], exAcid: [1.0, 1.7], tr: 5, td: 30 },
    THIN:  { procKW: [30, 70], exSol: [1.0, 1.8], tr: 6, td: 35 },
    METRO: { procKW: [4, 10], tr: 3, td: 12 }
  };

  // Facility baselines (kW unless noted).
  var BASE = {
    PROCESS: 9000,        // process tools idle/connected draw
    HVAC: 11000,          // MAU/AHU/FFU fans + reheat
    CHW: 7000,            // chiller compressors at part load
    UPW: 2200, GAS: 1600, EXHAUST: 1800, OTHER: 1400,
    chwRTbase: 9000,                             // chilled-water cooling load (tons)
    pcwRT: 2600, upwFlow: 520, n2Flow: 14000,    // RT, m3/h, Nm3/h
    exGenCFM: 220000, exAcidCFM: 90000, exSolCFM: 60000, exHeatCFM: 45000
  };

  var CHANNELS = ['procKW', 'abateKW', 'pcwRT', 'upwFlow', 'n2Pct', 'exGenPct', 'exAcidPct', 'exSolPct'];

  function envelope(e, dur, tr, tdEff) {
    if (e <= dur) return Math.min(1, e / tr);
    var endVal = Math.min(1, dur / tr);
    return endVal * Math.exp(-(e - dur) / tdEff);
  }
  function band(seed, lo, hi) { return lo + P.rand(seed, 0) * (hi - lo); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function build(model) {
    var jobs = model.jobs;
    var curves = {};
    CHANNELS.forEach(function (c) { curves[c] = new Float64Array(TICKS); });
    var areaKW = {};
    M.areas.forEach(function (a) { areaKW[a.id] = new Float64Array(TICKS); });

    // Precompute each job's fixed peak draws once.
    jobs.forEach(function (job, ji) {
      var lv = AREA_LOAD[job.area]; if (!lv) return;
      var tdEff = Math.min(lv.td, (PERIOD - job.dur) / 4); // cap so tail fades in rest window
      var pk = {};
      ['procKW', 'abate', 'pcw', 'upw', 'n2', 'exGen', 'exAcid', 'exSol'].forEach(function (key) {
        if (lv[key]) pk[key] = band('pk:' + key + ':' + ji, lv[key][0], lv[key][1]);
      });
      for (var tick = 0; tick < TICKS; tick++) {
        var t = tick / CK.TICK_HZ;
        var e = CK.forwardElapsed(t, job.start);
        var env = envelope(e, job.dur, lv.tr, tdEff);
        if (env < 1e-4) continue;
        if (pk.procKW) { curves.procKW[tick] += pk.procKW * env; areaKW[job.area][tick] += pk.procKW * env; }
        if (pk.abate) curves.abateKW[tick] += pk.abate * env;
        if (pk.pcw) curves.pcwRT[tick] += pk.pcw * env;
        if (pk.upw) curves.upwFlow[tick] += pk.upw * env;
        if (pk.n2) curves.n2Pct[tick] += pk.n2 * env;
        if (pk.exGen) curves.exGenPct[tick] += pk.exGen * env;
        if (pk.exAcid) curves.exAcidPct[tick] += pk.exAcid * env;
        if (pk.exSol) curves.exSolPct[tick] += pk.exSol * env;
      }
    });

    // OEE aggregates from the E10 timelines (loop-wide).
    var oee = computeOEE(model);

    function sampleCurve(curve, t) {
      var x = t * CK.TICK_HZ;
      var i = Math.floor(x) % TICKS;
      var j = (i + 1) % TICKS;
      var f = x - Math.floor(x);
      return curve[i] * (1 - f) + curve[j] * f;
    }

    // Periodic baseline ripples (slow, continuous, seam-safe).
    function ripple(t, ampFrac, phase) {
      return 1 + ampFrac * Math.sin(TWO_PI * (t / PERIOD) + phase);
    }

    // Full facility sample at loop-time t.
    function sample(t) {
      var procActive = sampleCurve(curves.procKW, t);
      var abate = sampleCurve(curves.abateKW, t);
      var pcwExtra = sampleCurve(curves.pcwRT, t);
      var upwExtra = sampleCurve(curves.upwFlow, t);
      var n2Extra = sampleCurve(curves.n2Pct, t);
      var exGen = sampleCurve(curves.exGenPct, t);
      var exAcid = sampleCurve(curves.exAcidPct, t);
      var exSol = sampleCurve(curves.exSolPct, t);

      var processKW = BASE.PROCESS * ripple(t, 0.015, 0.5) + procActive;
      var hvacKW = BASE.HVAC * ripple(t, 0.03, 0);
      // Chilled-water COOLING load (tons): realistic fab heat load that tracks
      // process + abatement + HVAC cooling. Plant electrical derived at ~0.6 kW/RT,
      // so chwKW/chwRT is a believable all-in plant efficiency everywhere it shows.
      var chwRTload = BASE.chwRTbase * ripple(t, 0.04, 1.1) + (procActive + abate) * 0.16 + (hvacKW - BASE.HVAC) * 0.04;
      var chwEff = 0.62 - 0.03 * clamp01((chwRTload - 8000) / 6000);  // kW/RT, better at higher load
      var chwKW = chwRTload * chwEff;
      var upwKW = BASE.UPW * ripple(t, 0.02, 2.0);
      var gasKW = BASE.GAS * ripple(t, 0.02, 0.3);
      var exhaustKW = BASE.EXHAUST * ripple(t, 0.02, 1.7) + abate;
      var otherKW = BASE.OTHER * ripple(t, 0.01, 0.9);
      var facilityKW = hvacKW + chwKW + upwKW + gasKW + exhaustKW + otherKW;
      var totalKW = processKW + facilityKW;

      var pcwRT = BASE.pcwRT * ripple(t, 0.03, 0.6) + pcwExtra;
      var chwRT = chwRTload;                     // cooling tons (chwKW derived from this)
      var upwFlow = BASE.upwFlow * ripple(t, 0.02, 1.3) + upwExtra;
      var n2Flow = BASE.n2Flow * (1 + n2Extra / 100) * ripple(t, 0.01, 0.4);

      return {
        processKW: processKW, facilityKW: facilityKW, totalKW: totalKW,
        hvacKW: hvacKW, chwKW: chwKW, upwKW: upwKW, gasKW: gasKW, exhaustKW: exhaustKW,
        otherKW: otherKW, abateKW: abate,
        overheadRatio: facilityKW / processKW,
        pcwRT: pcwRT, chwRT: chwRT, upwFlow: upwFlow, n2Flow: n2Flow,
        exGenCFM: BASE.exGenCFM * (1 + exGen / 100), exAcidCFM: BASE.exAcidCFM * (1 + exAcid / 100),
        exSolCFM: BASE.exSolCFM * (1 + exSol / 100), exHeatCFM: BASE.exHeatCFM * ripple(t, 0.03, 0.8),
        procActive: procActive,
        areaKW: areaSampler(t)
      };
    }
    function areaSampler(t) {
      var out = {};
      M.areas.forEach(function (a) { out[a.id] = BASE.PROCESS / M.areas.length * 0.6 + sampleCurve(areaKW[a.id], t); });
      return out;
    }

    // Demand peak from the real sample() across the loop.
    var peakKW = 0;
    for (var pk2 = 0; pk2 < TICKS; pk2++) {
      var tt = sample(pk2 / CK.TICK_HZ).totalKW;
      if (tt > peakKW) peakKW = tt;
    }

    return {
      sample: sample, peakKW: peakKW, oee: oee, BASE: BASE,
      curves: curves, areaKW: areaKW, sampleCurve: sampleCurve
    };
  }

  function computeOEE(model) {
    var prod = 0, total = 0, down = 0;
    var ids = Object.keys(model.e10);
    ids.forEach(function (id) {
      model.e10[id].forEach(function (s) {
        var d = s.end - s.start;
        total += d;
        if (s.state === 'Productive') prod += d;
        // SEMI E10: Standby + Engineering are "up"; only Down states subtract.
        if (s.state === 'Unscheduled Down' || s.state === 'Scheduled Down' || s.state === 'Non-Scheduled') down += d;
      });
    });
    // Availability = uptime / total (down states only). Utilization = productive / total.
    var availability = total > 0 ? (total - down) / total : 0.92;
    var utilization = total > 0 ? prod / total : 0.7;
    // Performance/quality nudged by FDC/SPC density (deterministic).
    var fdc = model.events.filter(function (e) { return e.cls === 'fdc'; }).length;
    var performance = 0.95 - Math.min(0.07, fdc * 0.0006);
    var quality = 0.995 - Math.min(0.02, fdc * 0.0004);
    return {
      availability: availability, utilization: utilization,
      performance: performance, quality: quality,
      oee: availability * performance * quality
    };
  }

  BAS.loadModel = { build: build, BASE: BASE, AREA_LOAD: AREA_LOAD, CHANNELS: CHANNELS };
})(window.BAS);
