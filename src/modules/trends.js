/* bas-ems — Trends / Historian view
 * Classic script -> registers module 'trends'
 * Group: Operations, order: 2 (right after Production order:1).
 *
 * Plots 5 whole-shift-hour curves over the 180s loop (x = simulated minutes 0-60):
 *   1. Total Demand (MW)
 *   2. Facility Overhead Ratio
 *   3. UPW Resistivity (MΩ·cm) — replicated from frame()'s exact formula
 *   4. Acid-Exhaust CFM
 *   5. CHW Load (RT)
 *
 * Perf contract:
 *   - Precompute ONCE in mount() via load.sample(t') only (pure, never frame()).
 *   - Each chart: static layer (curve + bands + min/avg/max) drawn ONCE into an
 *     offscreen canvas; update(frame) blits the offscreen canvas then draws only
 *     the 1px now-cursor. Zero per-frame allocation.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  // Constants (resolved lazily in mount, after BAS.sim.init())
  var PERIOD = 180;    // real seconds per loop (= BAS.clock.PERIOD)
  var N_SAMPLES = 240; // grid points across [0, PERIOD)
  var EMPTY_DASH = []; // shared "solid line" dash, reused in update() (no per-frame alloc)

  // Series definitions — order matters for layout
  var SERIES = [
    {
      id: 'demand',
      title: 'Total Demand',
      unit: 'MW',
      color: '#25e0cf',    // --accent
      bandLo: null, bandHi: null,  // computed after precompute
      peakLine: true       // draw a horizontal peak line instead of band
    },
    {
      id: 'overhead',
      title: 'Facility Overhead',
      unit: 'x',
      color: '#3a9dff',    // --accent-2
      bandLo: 1.5, bandHi: 2.5,   // typical fab overhead band
      peakLine: false
    },
    {
      id: 'upwR',
      title: 'UPW Resistivity',
      unit: 'MΩ·cm',
      color: '#9a7bff',    // --purple
      bandLo: 18.10, bandHi: 18.25,  // UPW spec band (18.2 MΩ·cm nominal ±0.10)
      peakLine: false,
      isSpec: true
    },
    {
      id: 'exAcid',
      title: 'Acid-Exhaust',
      unit: 'CFM',
      color: '#f5b73d',    // --warn
      bandLo: null, bandHi: null,
      peakLine: false
    },
    {
      id: 'chw',
      title: 'CHW Load',
      unit: 'RT',
      color: '#34d399',    // --good
      bandLo: null, bandHi: null,
      peakLine: false
    }
  ];

  // Closure-scope widget state
  var built = false;
  var charts = [];   // [{canvas, offscreen, vals, min, avg, max, yLo, yHi, series}]

  // ---- Precompute --------------------------------------------------------
  // Called once from mount() after BAS.sim.init(). Uses load.sample only.
  function precompute() {
    if (built) return;
    built = true;

    var load = BAS.sim.load;
    var CK = BAS.clock;
    PERIOD = CK.PERIOD;

    charts = SERIES.map(function (s) {
      return { series: s, vals: new Float64Array(N_SAMPLES), min: 0, avg: 0, max: 0, yLo: 0, yHi: 0, canvas: null, offscreen: null };
    });

    // Sample the loop
    for (var i = 0; i < N_SAMPLES; i++) {
      var t = i / N_SAMPLES * PERIOD;
      var samp = load.sample(t);
      // UPW resistivity: EXACT replica of sim.js frame() (search 'upwResistivity' in
      // src/engine/sim.js — the source of truth). load.sample does NOT expose it.
      // _trends_test.mjs asserts diff=0 vs frame(), so an engine formula change fails
      // the test instead of silently drifting this curve.
      var tick = CK.tickOf(t);
      var upwR = 18.20 + (BAS.prng.rand('upwR', tick) - 0.5) * 0.03;

      charts[0].vals[i] = samp.totalKW / 1000;          // MW
      charts[1].vals[i] = samp.overheadRatio;
      charts[2].vals[i] = upwR;
      charts[3].vals[i] = samp.exAcidCFM;
      charts[4].vals[i] = samp.chwRT;
    }

    // Compute min/avg/max and y-range for each chart
    for (var ci = 0; ci < charts.length; ci++) {
      var ch = charts[ci];
      var mn = ch.vals[0], mx = ch.vals[0], sum = 0;
      for (var j = 0; j < N_SAMPLES; j++) {
        var v = ch.vals[j];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v;
      }
      ch.min = mn; ch.max = mx; ch.avg = sum / N_SAMPLES;

      // y axis: pad a little beyond min/max; always include band if present
      var lo = mn, hi = mx;
      var pad = (hi - lo) * 0.12 || Math.abs(lo) * 0.05 || 0.05;
      lo -= pad; hi += pad;
      if (ch.series.bandLo !== null && ch.series.bandLo < lo) lo = ch.series.bandLo - pad * 0.5;
      if (ch.series.bandHi !== null && ch.series.bandHi > hi) hi = ch.series.bandHi + pad * 0.5;
      ch.yLo = lo; ch.yHi = hi;

      // For demand: store peak MW so drawStatic can draw the peak line
      if (ch.series.id === 'demand') {
        ch.series.peakMW = load.peakKW / 1000;
      }
    }
  }

  // ---- Draw one static layer into an offscreen canvas --------------------
  function drawStatic(ch, w, h) {
    var dpr = window.devicePixelRatio || 1;
    var PW = Math.round(w * dpr);
    var PH = Math.round(h * dpr);

    var oc = document.createElement('canvas');
    oc.width = PW; oc.height = PH;
    var ctx = oc.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD_T = 18, PAD_B = 26, PAD_L = 6, PAD_R = 6;
    var pw = w - PAD_L - PAD_R;
    var ph = h - PAD_T - PAD_B;

    var yLo = ch.yLo, yHi = ch.yHi;
    var yRange = yHi - yLo || 1;

    function xOf(i) { return PAD_L + (i / (N_SAMPLES - 1)) * pw; }
    function yOf(v) { return PAD_T + (1 - (v - yLo) / yRange) * ph; }

    // Background
    ctx.clearRect(0, 0, w, h);

    // Spec/setpoint band (shaded region)
    var s = ch.series;
    if (s.bandLo !== null && s.bandHi !== null) {
      var bandColor = s.isSpec ? 'rgba(154,123,255,0.13)' : 'rgba(37,224,207,0.08)';
      var bandBorder = s.isSpec ? 'rgba(154,123,255,0.35)' : 'rgba(37,224,207,0.20)';
      ctx.fillStyle = bandColor;
      var bY1 = yOf(s.bandHi), bY2 = yOf(s.bandLo);
      ctx.fillRect(PAD_L, bY1, pw, bY2 - bY1);
      ctx.strokeStyle = bandBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(PAD_L, bY1); ctx.lineTo(PAD_L + pw, bY1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD_L, bY2); ctx.lineTo(PAD_L + pw, bY2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Peak line (demand only)
    if (s.peakLine && s.peakMW !== undefined) {
      var pyv = yOf(s.peakMW);
      ctx.strokeStyle = 'rgba(255,93,108,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(PAD_L, pyv); ctx.lineTo(PAD_L + pw, pyv); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,93,108,0.75)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('peak ' + s.peakMW.toFixed(1), PAD_L + pw - 2, pyv - 3);
    }

    // Avg line (dashed, muted)
    var avgY = yOf(ch.avg);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(PAD_L, avgY); ctx.lineTo(PAD_L + pw, avgY); ctx.stroke();
    ctx.setLineDash([]);

    // Curve fill (gradient under the line)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(ch.vals[0]));
    for (var i = 1; i < N_SAMPLES; i++) { ctx.lineTo(xOf(i), yOf(ch.vals[i])); }
    ctx.lineTo(xOf(N_SAMPLES - 1), PAD_T + ph);
    ctx.lineTo(PAD_L, PAD_T + ph);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + ph);
    // Parse hex color to rgba
    var hex = s.color.replace('#', '');
    var rr = parseInt(hex.substring(0, 2), 16);
    var gg = parseInt(hex.substring(2, 4), 16);
    var bb = parseInt(hex.substring(4, 6), 16);
    grad.addColorStop(0, 'rgba(' + rr + ',' + gg + ',' + bb + ',0.22)');
    grad.addColorStop(1, 'rgba(' + rr + ',' + gg + ',' + bb + ',0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Curve line
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(ch.vals[0]));
    for (var k = 1; k < N_SAMPLES; k++) { ctx.lineTo(xOf(k), yOf(ch.vals[k])); }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Min / Avg / Max annotations (bottom strip)
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    var fmt = formatVal(ch.min, s.unit);
    ctx.fillText('min ' + fmt, PAD_L, h - 5);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('avg ' + formatVal(ch.avg, s.unit), PAD_L + pw * 0.5, h - 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('max ' + formatVal(ch.max, s.unit), PAD_L + pw, h - 5);

    // X-axis tick labels: 0, 15, 30, 45, 60 min
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.font = '8px monospace';
    var xLabels = [0, 15, 30, 45, 60];
    for (var xi = 0; xi < xLabels.length; xi++) {
      var xprog = xLabels[xi] / 60;
      var xpos = PAD_L + xprog * pw;
      ctx.textAlign = xi === 0 ? 'left' : xi === xLabels.length - 1 ? 'right' : 'center';
      ctx.fillText(xLabels[xi] + 'm', xpos, PAD_T + ph + 14);
    }

    ch.offscreen = oc;
    ch.dpr = dpr;
    ch.drawW = w; ch.drawH = h;
    ch.PAD_L = PAD_L; ch.PAD_R = PAD_R; ch.PAD_T = PAD_T; ch.PAD_B = PAD_B;
  }

  // ---- Format a value for annotation ------------------------------------
  function formatVal(v, unit) {
    if (unit === 'MW' || unit === 'x' || unit === 'MΩ·cm') return v.toFixed(2);
    if (unit === 'CFM' || unit === 'RT') return Math.round(v).toString();
    return v.toFixed(2);
  }

  // ---- Module registration -----------------------------------------------
  BAS.registerModule({
    id: 'trends',
    title: 'Trends / Historian',
    group: 'Operations',
    order: 2,
    icon: 'chart',

    mount: function (root) {
      // Guard: precompute only once (mount may be called on tab switch)
      precompute();

      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Trends / Historian</h1>' +
        '<span class="crumb">FAB-1 · Whole-Hour Curves · Setpoint Bands · Now Cursor</span>' +
        '<span class="right">one loop = 60 sim-min · 240 samples &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // Create 5 chart panels in a 2+3 layout
      var widths = ['col-6', 'col-6', 'col-4', 'col-4', 'col-4'];

      for (var ci = 0; ci < charts.length; ci++) {
        (function (ch, colCls) {
          var s = ch.series;
          var meta = buildMeta(ch);
          var p = U.panel(s.title + ' — ' + s.unit, { cls: colCls, meta: meta });
          var canvas = el('canvas', 'trend-chart');
          canvas.style.height = '140px';
          canvas.style.display = 'block';
          canvas.style.width = '100%';
          p._body.appendChild(canvas);
          ch.canvas = canvas;
          // Draw static layer as soon as the element exists with a known size
          // (use a short setTimeout so the DOM is laid out and offsetWidth is real)
          setTimeout(function () { rebuildStatic(ch); }, 0);
          grid.appendChild(p);
        })(charts[ci], widths[ci]);
      }

      root.appendChild(grid);
    },

    update: function (frame) {
      if (!built) return;
      var CK = BAS.clock;
      var t = frame.t;
      var xProg = t / CK.PERIOD;   // 0..1

      for (var ci = 0; ci < charts.length; ci++) {
        var ch = charts[ci];
        if (!ch.canvas || !ch.offscreen) continue;

        var canvas = ch.canvas;
        var w = canvas.offsetWidth || 300;
        var h = canvas.offsetHeight || 140;

        // Resize backing store if needed (lazy, no per-frame allocation on stable size)
        var dpr = window.devicePixelRatio || 1;
        var PW = Math.round(w * dpr);
        var PH = Math.round(h * dpr);
        if (canvas.width !== PW || canvas.height !== PH) {
          canvas.width = PW; canvas.height = PH;
          rebuildStatic(ch);
          if (!ch.offscreen) continue;
        }

        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Blit the cached static layer
        ctx.drawImage(ch.offscreen, 0, 0, w, h);

        // Draw the now-cursor (1px wide, no allocation)
        var pw = w - ch.PAD_L - ch.PAD_R;
        var xCursor = ch.PAD_L + xProg * pw;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash(EMPTY_DASH);
        ctx.beginPath();
        ctx.moveTo(xCursor, ch.PAD_T);
        ctx.lineTo(xCursor, ch.PAD_T + (h - ch.PAD_T - ch.PAD_B));
        ctx.stroke();

        // Small triangle marker at top of cursor
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.moveTo(xCursor - 3, ch.PAD_T - 1);
        ctx.lineTo(xCursor + 3, ch.PAD_T - 1);
        ctx.lineTo(xCursor, ch.PAD_T + 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  });

  // ---- Build panel meta string ------------------------------------------
  function buildMeta(ch) {
    var s = ch.series;
    if (s.bandLo !== null && s.bandHi !== null) {
      if (s.isSpec) return 'spec ' + s.bandLo.toFixed(2) + '–' + s.bandHi.toFixed(2) + ' ' + s.unit;
      return 'band ' + s.bandLo.toFixed(1) + '–' + s.bandHi.toFixed(1) + ' ' + s.unit;
    }
    if (s.peakLine && s.peakMW !== undefined) return 'peak ' + s.peakMW.toFixed(1) + ' MW';
    return '60 sim-min';
  }

  // ---- Rebuild the offscreen static layer for one chart -----------------
  function rebuildStatic(ch) {
    var canvas = ch.canvas;
    if (!canvas) return;
    var w = canvas.offsetWidth || 300;
    var h = canvas.offsetHeight || 140;
    if (w < 10 || h < 10) return;
    drawStatic(ch, w, h);
  }

})(window.BAS);
