/* bas-ems — frame composer (the sim(t) contract)
 * Classic script -> window.BAS.sim
 *
 * THE CONTRACT every module consumes. After BAS.sim.init():
 *   frame = BAS.sim.frame(t) -> {
 *     t, tick, sim:{hh,mm,ss,hms,progress,simMin},
 *     load:{ totalKW, processKW, facilityKW, hvacKW, chwKW, upwKW, gasKW,
 *            exhaustKW, abateKW, overheadRatio, pcwRT, chwRT, upwFlow, n2Flow,
 *            exGenCFM, exAcidCFM, exSolCFM, exHeatCFM, areaKW{} },
 *     kpis:{ totalMW, processMW, facilityMW, overheadRatio, demandPeakMW,
 *            wpmh (wafer moves/hr), energyPerMove (kWh), specificEnergy (MWh/wafer-out),
 *            co2eRate (t/h), renewablePct, waterReusePct, costRate ($/h),
 *            upwResistivity, upwTOC, oee:{availability,performance,quality,oee} },
 *     newEvents:[...since last frame], alarms:[...active now],
 *     toolStates:{id:E10}, areaStates:{areaId:{Productive,Standby,...,total}},
 *     model  // ref to the events model (jobs, events, queries)
 *   }
 * Modules render from `frame` only. UI sparklines keep their own ring buffers.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var CK = BAS.clock;
  var M = BAS.master;

  var model = null, load = null, lastT = null;
  var lotsPerLoop = 0, avgKW = 0, gridCO2 = 0.34; // kgCO2e/kWh
  // Reused per-frame scratch (no per-frame allocation) + monotonic event cursor.
  var streamCursor = 0, toolStates = null, areaStates = null, KPIS = null, FRAME = null, newBuf = null;

  function init() {
    model = BAS.events.build();
    load = BAS.loadModel.build(model);
    lotsPerLoop = model.events.filter(function (e) { return e.type === 'LotComplete'; }).length || 1;
    // Average total power across the loop (for stable intensity KPIs).
    var n = 90, sum = 0;
    for (var i = 0; i < n; i++) { sum += load.sample(i / n * CK.PERIOD).totalKW; }
    avgKW = sum / n;
    lastT = null; streamCursor = 0;
    // Allocate the reused scratch once; frame() mutates these in place.
    toolStates = {}; KPIS = {}; FRAME = {}; newBuf = [];
    areaStates = {};
    M.areas.forEach(function (a) {
      areaStates[a.id] = { Productive: 0, Standby: 0, Engineering: 0, 'Scheduled Down': 0, 'Unscheduled Down': 0, 'Non-Scheduled': 0, total: 0 };
    });
    BAS.sim.model = model;
    BAS.sim.load = load;
    return { model: model, load: load };
  }

  function frame(t) {
    if (!model) init();
    var tick = CK.tickOf(t);
    var L = load.sample(t);
    var simc = CK.simClock(t);

    // --- Streaming events via an O(1) monotonic cursor over the sorted event
    // list (resets on the 180s loop wrap). Replaces the old O(events)/frame scan. ---
    var ev = model.events, n = ev.length;
    newBuf.length = 0;
    if (lastT === null) {
      streamCursor = 0;
      while (streamCursor < n && ev[streamCursor].sec <= t) streamCursor++; // skip to "now", emit nothing
    } else {
      var dt = t - lastT;
      if (dt >= 0 && dt < 1.0) {
        while (streamCursor < n && ev[streamCursor].sec <= t) newBuf.push(ev[streamCursor++]);
      } else if (dt < 0 && -dt > CK.PERIOD * 0.5) {
        // loop wrap: flush the remainder of this lap, then re-emit from 0..t
        while (streamCursor < n) newBuf.push(ev[streamCursor++]);
        streamCursor = 0;
        while (streamCursor < n && ev[streamCursor].sec <= t) newBuf.push(ev[streamCursor++]);
      } else {
        // gap (backgrounded-tab resume or seek): resync cursor, emit nothing (no burst)
        streamCursor = 0;
        while (streamCursor < n && ev[streamCursor].sec <= t) streamCursor++;
      }
    }
    lastT = t;

    // --- E10 rollup into reused scratch (zero per-frame allocation) ---
    for (var ai = 0; ai < M.areas.length; ai++) {
      var z = areaStates[M.areas[ai].id];
      z.Productive = z.Standby = z.Engineering = z['Scheduled Down'] = z['Unscheduled Down'] = z['Non-Scheduled'] = z.total = 0;
    }
    for (var ti = 0; ti < M.tools.length; ti++) {
      var tool = M.tools[ti];
      var s = model.e10StateAt(tool.id, t);
      toolStates[tool.id] = s;
      var as = areaStates[tool.area];
      if (as[s] === undefined) as[s] = 0;
      as[s]++; as.total++;
    }

    // --- KPIs into the reused object ---
    var movesPerHr = lotsPerLoop * 25;                  // loop == 60 sim-min == 1 hr
    var K = KPIS, tau = 2 * Math.PI * (t / CK.PERIOD);
    K.totalMW = L.totalKW / 1000; K.processMW = L.processKW / 1000; K.facilityMW = L.facilityKW / 1000;
    K.overheadRatio = L.overheadRatio; K.demandPeakMW = load.peakKW / 1000;
    K.demandPct = L.totalKW / load.peakKW * 100;
    K.wpmh = movesPerHr; K.energyPerMove = L.totalKW / movesPerHr;
    K.renewablePct = 28 + 6 * Math.sin(tau + 0.7);
    K.specificEnergy = 1.30 + 0.10 * Math.sin(tau + 1.9);   // MWh/wafer-out
    K.waterReusePct = 78 + 4 * Math.sin(tau + 2.4);
    K.co2eRate = L.totalKW * gridCO2 * (1 - K.renewablePct / 100) / 1000; // t/h
    K.costRate = L.totalKW * 0.082;                          // $/h
    K.upwResistivity = 18.20 + (BAS.prng.rand('upwR', tick) - 0.5) * 0.03;
    K.upwTOC = 0.55 + BAS.prng.rand('upwT', tick) * 0.25;
    K.oee = load.oee; K.avgMW = avgKW / 1000;

    // --- frame into the reused object ---
    var F = FRAME;
    F.t = t; F.tick = tick; F.tickF = t * CK.TICK_HZ; F.sim = simc; F.load = L;
    F.kpis = K; F.newEvents = newBuf; F.alarms = model.alarmsActiveAt(t);
    F.toolStates = toolStates; F.areaStates = areaStates; F.model = model;
    return F;
  }

  BAS.sim = { init: init, frame: frame, reset: function () { lastT = null; streamCursor = 0; CK.reset(); }, model: null, load: null };
})(window.BAS);
