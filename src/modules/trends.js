/* bas-ems — Trends / Historian view
 * Classic script -> registers module 'trends'
 * Group: Operations, order: 2 (right after Production order:1).
 *
 * "Historian wall": a col-12 .panel.hud header band with a per-channel .chip-row
 * (now / min / avg / max chips for all 5 channels, change-gated), then 5 trend
 * charts. Each chart has an accent gradient fill (via U.hexA), a hover crosshair
 * with a value+time readout (single shared tooltip DOM, redraw reuses the cached
 * static layer the module already blits each frame), and unified axis styling.
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
 *     the 1px now-cursor (+ optional hover crosshair). Zero per-frame allocation.
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;
  var T = (BAS.i18n && BAS.i18n.t) ? BAS.i18n.t : function (s) { return s; };

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

  // Header-band chip refs (built once, mutated change-gated in update)
  var chipRefs = [];        // [{ id, now, min, avg, max, lastNow }]
  var headerBuilt = false;

  // Shared hover tooltip DOM (single node reused across all 5 charts)
  var tip = null, tipBuilt = false;
  var tipChan = null, tipTime = null, tipVal = null;
  var hoverCh = null;       // chart currently hovered (or null)
  var hoverIdx = -1;        // sample index under the cursor (-1 = none)
  var lastTipKey = '';      // change-gate for tooltip text

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

    var PAD_T = 18, PAD_B = 34, PAD_L = 6, PAD_R = 6;
    var pw = w - PAD_L - PAD_R;
    var ph = h - PAD_T - PAD_B;

    var yLo = ch.yLo, yHi = ch.yHi;
    var yRange = yHi - yLo || 1;

    function xOf(i) { return PAD_L + (i / (N_SAMPLES - 1)) * pw; }
    function yOf(v) { return PAD_T + (1 - (v - yLo) / yRange) * ph; }

    // Background
    ctx.clearRect(0, 0, w, h);

    // Unified axis styling: faint horizontal gridlines (quartiles) + a baseline.
    // Drawn into the STATIC layer (zero per-frame cost). Subtle so the curve leads.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash(EMPTY_DASH);
    for (var gq = 1; gq <= 3; gq++) {
      var gy = PAD_T + (gq / 4) * ph;
      ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(PAD_L + pw, gy); ctx.stroke();
    }
    // x-axis baseline (slightly stronger)
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T + ph); ctx.lineTo(PAD_L + pw, PAD_T + ph); ctx.stroke();

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
      // 'peak NN' label is a crisp DOM overlay now (see buildOverlays), not Canvas text.
    }

    // Avg line (dashed, muted)
    var avgY = yOf(ch.avg);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(PAD_L, avgY); ctx.lineTo(PAD_L + pw, avgY); ctx.stroke();
    ctx.setLineDash([]);

    // Curve fill (accent gradient under the line) — colour via U.hexA per series.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(ch.vals[0]));
    for (var i = 1; i < N_SAMPLES; i++) { ctx.lineTo(xOf(i), yOf(ch.vals[i])); }
    ctx.lineTo(xOf(N_SAMPLES - 1), PAD_T + ph);
    ctx.lineTo(PAD_L, PAD_T + ph);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + ph);
    grad.addColorStop(0, U.hexA(s.color, 0.24));
    grad.addColorStop(0.55, U.hexA(s.color, 0.08));
    grad.addColorStop(1, U.hexA(s.color, 0.02));
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

    // X-axis ticks (0/15/30/45/60m) and the min/avg/max strip are crisp DOM overlays now
    // (see buildOverlays); no Canvas text is drawn for them — this fixes the sub-pixel blur.

    ch.offscreen = oc;
    ch.dpr = dpr;
    ch.drawW = w; ch.drawH = h;
    ch.PAD_L = PAD_L; ch.PAD_R = PAD_R; ch.PAD_T = PAD_T; ch.PAD_B = PAD_B;
    ch.plotW = pw; ch.plotH = ph;
  }

  // ---- Format a value for annotation ------------------------------------
  function formatVal(v, unit) {
    if (unit === 'MW' || unit === 'x' || unit === 'MΩ·cm') return v.toFixed(2);
    if (unit === 'CFM' || unit === 'RT') return Math.round(v).toString();
    return v.toFixed(2);
  }

  // Convert a sample index to an "MM:SS into the hour" time label (0..60 sim-min).
  function timeLabelOf(idx) {
    var frac = idx / (N_SAMPLES - 1);         // 0..1 across the loop
    var simMin = frac * 60;                   // 0..60 simulated minutes
    var mm = Math.floor(simMin);
    var ss = Math.floor((simMin - mm) * 60);
    return (mm < 10 ? '0' + mm : mm) + ':' + (ss < 10 ? '0' + ss : ss);
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
      head.innerHTML = '<h1>' + T('Trends / Historian') + '</h1>' +
        '<span class="crumb">FAB-1 · ' + T('Whole-Hour Curves · Setpoint Bands · Now Cursor') + '</span>' +
        '<span class="right">' + T('one loop = 60 sim-min · 240 samples') + ' &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- Header band: per-channel chip-row (now/min/avg/max) -----------
      buildHeaderBand(grid);

      // Build the shared hover tooltip once (appended to <body>, positioned fixed).
      buildTooltip();

      // Create 5 chart panels in a 2+3 layout
      var widths = ['col-6', 'col-6', 'col-4', 'col-4', 'col-4'];

      for (var ci = 0; ci < charts.length; ci++) {
        (function (ch, colCls) {
          var s = ch.series;
          var meta = buildMeta(ch);
          var p = U.panel(T(s.title) + ' — ' + s.unit, { cls: colCls, meta: meta });
          // Relative wrapper anchors the crisp DOM label overlays to the chart (not the page).
          var wrap = el('div', 'trend-chart-wrap');
          var canvas = el('canvas', 'trend-chart');
          canvas.style.height = '140px';
          canvas.style.display = 'block';
          canvas.style.width = '100%';
          wrap.appendChild(canvas);
          ch.canvas = canvas;
          // min/avg/max/peak are precomputed (static) and the x-axis ticks are constant,
          // so write them once here as DOM <div>s. No per-frame overlay work.
          buildOverlays(ch, wrap);
          // Hover crosshair wiring: stash the hovered sample index on the chart;
          // the per-frame update() reuses the cached static layer to redraw it.
          attachHover(ch, canvas);
          p._body.appendChild(wrap);
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

      // Header chips: "now" sample tracks the now-cursor (same data the curve shows).
      // Throttled + change-gated so it stays calm and allocation-free.
      if (frame.tick % 4 === 0) updateHeaderBand(xProg);

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

        var pw = w - ch.PAD_L - ch.PAD_R;
        var plotH = h - ch.PAD_T - ch.PAD_B;

        // Hover crosshair (reuses the just-blitted static layer; no new allocation).
        if (hoverCh === ch && hoverIdx >= 0 && hoverIdx < N_SAMPLES) {
          var hx = ch.PAD_L + (hoverIdx / (N_SAMPLES - 1)) * pw;
          var yRange = (ch.yHi - ch.yLo) || 1;
          var hy = ch.PAD_T + (1 - (ch.vals[hoverIdx] - ch.yLo) / yRange) * plotH;
          ctx.strokeStyle = U.hexA(ch.series.color, 0.55);
          ctx.lineWidth = 1;
          ctx.setLineDash(EMPTY_DASH);
          ctx.beginPath();
          ctx.moveTo(hx, ch.PAD_T);
          ctx.lineTo(hx, ch.PAD_T + plotH);
          ctx.stroke();
          // value dot on the curve
          ctx.fillStyle = ch.series.color;
          ctx.beginPath();
          ctx.arc(hx, hy, 3, 0, 6.2832);
          ctx.fill();
          ctx.fillStyle = U.cssVar('--bg-2') || '#0c1320';
          ctx.beginPath();
          ctx.arc(hx, hy, 1.3, 0, 6.2832);
          ctx.fill();
        }

        // Draw the now-cursor (1px wide, no allocation)
        var xCursor = ch.PAD_L + xProg * pw;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash(EMPTY_DASH);
        ctx.beginPath();
        ctx.moveTo(xCursor, ch.PAD_T);
        ctx.lineTo(xCursor, ch.PAD_T + plotH);
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

  // ---- Header band: per-channel chip-row ---------------------------------
  // One row per channel: NOW (accent, change-gated) / MIN / AVG / MAX. Built once;
  // update() rewrites only the NOW chip (the rest are precomputed constants).
  function buildHeaderBand(grid) {
    if (headerBuilt) return;
    headerBuilt = true;

    var p = U.panel('Historian Wall', { cls: 'col-12 hud', meta: '5 channels · 60 sim-min window', pill: 'LIVE' });
    var band = el('div', 'thw-band');

    for (var i = 0; i < charts.length; i++) {
      var ch = charts[i];
      var s = ch.series;
      var row = el('div', 'thw-chan');

      // Channel name + colour swatch
      var nameWrap = el('div', 'thw-name');
      var sw = el('i', 'thw-sw');
      sw.style.backgroundColor = s.color;
      sw.style.boxShadow = '0 0 6px ' + U.hexA(s.color, 0.7);
      nameWrap.appendChild(sw);
      nameWrap.appendChild(el('span', 'thw-nm', T(s.title)));
      nameWrap.appendChild(el('span', 'thw-u', s.unit));
      row.appendChild(nameWrap);

      // Chip row: now / min / avg / max
      var cr = el('div', 'chip-row');
      var ref = { id: s.id, lastNow: '' };
      ref.now = chip(cr, 'now', '—', 'accent');
      ref.min = chip(cr, 'min', formatVal(ch.min, s.unit), '');
      ref.avg = chip(cr, 'avg', formatVal(ch.avg, s.unit), '');
      ref.max = chip(cr, 'max', formatVal(ch.max, s.unit), '');
      row.appendChild(cr);

      band.appendChild(row);
      chipRefs.push(ref);
    }

    p._body.appendChild(band);
    grid.appendChild(p);
  }

  // Build one .chip; return its value span (so update can mutate textContent only).
  function chip(parent, k, vText, cls) {
    var c = el('div', 'chip' + (cls ? ' ' + cls : ''));
    c.appendChild(el('span', 'k', k));
    var v = el('span', 'v', vText);
    c.appendChild(v);
    parent.appendChild(c);
    return v;
  }

  // Update the NOW chip for every channel (change-gated text writes).
  function updateHeaderBand(xProg) {
    var idx = Math.round(xProg * (N_SAMPLES - 1));
    if (idx < 0) idx = 0; else if (idx > N_SAMPLES - 1) idx = N_SAMPLES - 1;
    for (var i = 0; i < chipRefs.length; i++) {
      var ref = chipRefs[i];
      var ch = charts[i];
      var txt = formatVal(ch.vals[idx], ch.series.unit);
      if (txt !== ref.lastNow) {
        ref.lastNow = txt;
        ref.now.textContent = txt;
      }
    }
  }

  // ---- Shared hover tooltip ----------------------------------------------
  function buildTooltip() {
    if (tipBuilt) return;
    tipBuilt = true;
    tip = el('div', 'thw-tip');
    var head = el('div', 'thw-tip-h');
    tipChan = el('span', 'thw-tip-chan', '');
    tipTime = el('span', 'thw-tip-time', '');
    head.appendChild(tipChan);
    head.appendChild(tipTime);
    tip.appendChild(head);
    tipVal = el('div', 'thw-tip-val', '');
    tip.appendChild(tipVal);
    tip.style.display = 'none';
    document.body.appendChild(tip);
  }

  // Wire pointer events on a chart canvas. We only stash the hovered sample index
  // (hoverIdx) + chart (hoverCh); the per-frame update() does the actual crosshair
  // redraw by reusing the cached static layer. Tooltip text is change-gated here.
  function attachHover(ch, canvas) {
    canvas.addEventListener('mousemove', function (ev) {
      if (!ch.offscreen) return;
      var rect = canvas.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var pw = (canvas.offsetWidth || rect.width) - ch.PAD_L - ch.PAD_R;
      if (pw <= 0) return;
      var rel = (px - ch.PAD_L) / pw;
      if (rel < 0) rel = 0; else if (rel > 1) rel = 1;
      var idx = Math.round(rel * (N_SAMPLES - 1));
      hoverCh = ch;
      hoverIdx = idx;

      var s = ch.series;
      var key = s.id + ':' + idx;
      if (key !== lastTipKey) {
        lastTipKey = key;
        tipChan.textContent = T(s.title);
        tipChan.style.color = s.color;
        tipTime.textContent = timeLabelOf(idx);
        tipVal.textContent = formatVal(ch.vals[idx], s.unit) + ' ' + s.unit;
      }
      // position the fixed tooltip near the pointer (clamped to viewport-ish)
      tip.style.display = 'block';
      var tx = ev.clientX + 14;
      var ty = ev.clientY - 10;
      var maxX = (window.innerWidth || 1200) - 160;
      if (tx > maxX) tx = ev.clientX - 150;
      tip.style.left = tx + 'px';
      tip.style.top = ty + 'px';
    });
    canvas.addEventListener('mouseleave', function () {
      if (hoverCh === ch) { hoverCh = null; hoverIdx = -1; }
      lastTipKey = '';
      if (tip) tip.style.display = 'none';
    });
  }

  // ---- Build panel meta string ------------------------------------------
  function buildMeta(ch) {
    var s = ch.series;
    if (s.bandLo !== null && s.bandHi !== null) {
      if (s.isSpec) return T('spec') + ' ' + s.bandLo.toFixed(2) + '–' + s.bandHi.toFixed(2) + ' ' + s.unit;
      return T('band') + ' ' + s.bandLo.toFixed(1) + '–' + s.bandHi.toFixed(1) + ' ' + s.unit;
    }
    if (s.peakLine && s.peakMW !== undefined) return T('peak') + ' ' + s.peakMW.toFixed(1) + ' MW';
    return '60 sim-min';
  }

  // ---- Build crisp DOM label overlays for one chart ----------------------
  // min/avg/max + peak are precomputed and constant across the loop, and the x-axis
  // ticks are fixed, so everything is written exactly once. Replaces the old sub-pixel
  // Canvas text (the "numbers too thick / blurry" complaint). Positioned via CSS against
  // the .trend-chart-wrap; pointer-events:none so the canvas stays interactive.
  function buildOverlays(ch, wrap) {
    var s = ch.series;
    var hasData = built && ch.vals;
    function ov(extraCls, attr, val, text) {
      var d = el('div', 'trend-overlay' + (extraCls ? ' ' + extraCls : ''));
      d.setAttribute(attr, val);
      d.textContent = text;
      wrap.appendChild(d);
    }
    ov('', 'data-stat', 'min', hasData ? 'min ' + formatVal(ch.min, s.unit) : 'min —');
    ov('', 'data-stat', 'avg', hasData ? 'avg ' + formatVal(ch.avg, s.unit) : 'avg —');
    ov('', 'data-stat', 'max', hasData ? 'max ' + formatVal(ch.max, s.unit) : 'max —');
    var xs = [0, 15, 30, 45, 60];
    for (var i = 0; i < xs.length; i++) ov('x-axis', 'data-x', '' + xs[i], xs[i] + 'm');
    // Peak readout (demand chart only) — DOM now, so it matches the other labels.
    if (s.peakLine && s.peakMW !== undefined) ov('', 'data-stat', 'peak', T('peak') + ' ' + s.peakMW.toFixed(1));
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
