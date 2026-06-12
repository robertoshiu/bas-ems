/* bas-ems — Command Center (Operations flagship / default landing)
 * Classic script -> registers module 'overview'
 *
 * The cinematic mission-control view: a hero facility-demand band, an isometric
 * fab cutaway (ROOF / FAB / SUB-FAB) built once as inline SVG, an energy-flow
 * Sankey on a DPR-aware canvas with a pre-allocated particle pool, an area load
 * matrix, and an alarm/event pulse panel.
 *
 * Constraints honoured: classic IIFE, file://-safe (inline SVG + canvas only),
 * zero per-frame allocation (all refs/geometry/particles built at mount), all
 * data from `frame` (no Date.now/Math.random — visual randomness via BAS.prng),
 * seam-free, reduced-motion aware (static flows).
 */
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, M = BAS.master;
  var REDUCED = (typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // 8 process areas in a fixed 2x4 fab-level layout order.
  var AREAS = M.areas;
  // short tile labels
  var AREA_SHORT = {
    LITHO: 'LITHO', ETCH: 'ETCH', DIFF: 'DIFF', IMPL: 'IMPL',
    CMP: 'CMP', WET: 'WET', THIN: 'THIN', METRO: 'METRO'
  };
  // per-area nominal max process kW for glow normalisation (from base + peak deltas)
  var AREA_MAX = {
    LITHO: 1050, ETCH: 1500, DIFF: 1500, IMPL: 1100,
    CMP: 900, WET: 900, THIN: 1150, METRO: 800
  };

  // ---- closure-scope refs (filled at mount; mutated, never reallocated) ----
  var heroVal, heroFill, heroSub;
  var hk = {};                 // hero KPI value spans
  var iso = null;              // isometric cutaway controller
  var sankey = null;           // sankey canvas controller
  var areaRows = [];           // area matrix row refs
  var sevN = {};               // alarm severity count spans
  var evtRateEl, evtSpark, evtRing, evtHead = 0, evtCount = 0;
  var fc = 0;

  BAS.registerModule({
    id: 'overview', title: 'Command Center', group: 'Operations', order: 0, icon: 'hub',
    mount: function (root) {
      var head = el('div', 'view-head');
      head.innerHTML = '<h1>Command Center</h1>' +
        '<span class="crumb">FAB-1 · Facility demand · Fab cutaway · Energy flow</span>' +
        '<span class="right">live mission overview &#8595;</span>';
      root.appendChild(head);

      var grid = el('div', 'grid');

      // ---- Row 1: hero demand band (col-12, hud) -------------------------
      var heroP = U.panel('Facility Demand', { cls: 'col-12 hud', pill: 'LIVE' });
      var hero = el('div', 'cc-hero');

      var main = el('div', 'cc-hero-main');
      main.appendChild(el('div', 'cc-hero-label', 'FACILITY DEMAND'));
      heroVal = el('div', 'cc-hero-val');
      var num = el('span'); heroVal.appendChild(num);
      var u = el('span', 'u', 'MW'); heroVal.appendChild(u);
      heroVal._num = num;
      main.appendChild(heroVal);
      var meter = el('div', 'cc-hero-meter'); heroFill = el('i'); heroFill.style.width = '0%';
      meter.appendChild(heroFill); main.appendChild(meter);
      heroSub = el('div', 'cc-hero-sub'); heroSub.textContent = '—';
      main.appendChild(heroSub);
      hero.appendChild(main);

      var kpis = el('div', 'cc-hero-kpis');
      [['demand', 'Demand / Peak', '%', 'accent'], ['renew', 'Renewable', '%', 'good'],
       ['co2', 'CO₂e', 't/h', ''], ['oee', 'Fleet OEE', '%', ''], ['wpmh', 'Wafer Moves', '/h', '']
      ].forEach(function (k) {
        var box = el('div', 'cc-hk' + (k[3] ? ' ' + k[3] : ''));
        box.appendChild(el('div', 'lab', k[1]));
        var v = el('div', 'v');
        var vn = el('span'); v.appendChild(vn);
        var vu = el('span', 'u', k[2]); v.appendChild(vu);
        v._num = vn;
        box.appendChild(v);
        kpis.appendChild(box);
        hk[k[0]] = v;
      });
      hero.appendChild(kpis);
      heroP._body.appendChild(hero);
      grid.appendChild(heroP);

      // ---- Row 2 left: isometric fab cutaway (col-7, hud) ---------------
      var isoP = U.panel('Fab Cutaway', { cls: 'col-7 hud', meta: 'ROOF · FAB · SUB-FAB', metaId: 'cc-iso-meta' });
      iso = buildIso(isoP._body);
      grid.appendChild(isoP);

      // ---- Row 2 right: energy flow sankey (col-5, hud) -----------------
      var skP = U.panel('Energy Flow', { cls: 'col-5 hud', pill: REDUCED ? 'STATIC' : 'FLOW' });
      var skCanvas = el('canvas', 'cc-sankey');
      skCanvas.style.width = '100%'; skCanvas.style.height = '420px';
      skCanvas.setAttribute('aria-label', 'Energy flow Sankey: grid and renewable sources into facility loads');
      skP._body.appendChild(skCanvas);
      sankey = buildSankey(skCanvas);
      grid.appendChild(skP);

      // ---- Row 3 left: area load matrix (col-8) -------------------------
      var amP = U.panel('Area Load Matrix', { cls: 'col-8', meta: 'process kW · E10 productive' });
      var amWrap = el('div', 'cc-areas');
      for (var ai = 0; ai < AREAS.length; ai++) {
        var a = AREAS[ai];
        var row = el('div', 'cc-area-row');
        row.appendChild(el('div', 'nm', a.name));
        var bar = el('div', 'bar'); var fill = el('i'); fill.style.width = '0%'; bar.appendChild(fill);
        row.appendChild(bar);
        var rt = el('div', 'rt');
        var kw = el('span', 'kw', '—');
        var e10 = el('span', 'e10', '0/0');
        rt.appendChild(kw); rt.appendChild(e10);
        row.appendChild(rt);
        amWrap.appendChild(row);
        areaRows.push({ id: a.id, row: row, fill: fill, kw: kw, e10: e10 });
      }
      amP._body.appendChild(amWrap);
      grid.appendChild(amP);

      // ---- Row 3 right: alarm & event pulse (col-4) ---------------------
      var puP = U.panel('Alarm & Event Pulse', { cls: 'col-4' });
      var sevWrap = el('div', 'cc-pulse-sev');
      [['crit', 'Crit'], ['major', 'Major'], ['minor', 'Minor']].forEach(function (s) {
        var box = el('div', 'cc-sev ' + s[0]);
        var n = el('div', 'n', '0');
        box.appendChild(n);
        box.appendChild(el('div', 'l', s[1]));
        sevWrap.appendChild(box);
        sevN[s[0]] = n;
      });
      puP._body.appendChild(sevWrap);

      var evtWrap = el('div', 'cc-pulse-evt');
      var lab = el('div', 'lab');
      lab.innerHTML = '<span>EVENT RATE</span><b id="cc-evtrate">0 evt/s</b>';
      evtRateEl = lab.querySelector('#cc-evtrate');
      evtWrap.appendChild(lab);
      var evtCanvas = el('canvas', 'spark');
      evtCanvas.style.height = '60px'; evtCanvas.style.width = '100%';
      evtWrap.appendChild(evtCanvas);
      puP._body.appendChild(evtWrap);
      evtSpark = U.Sparkline(evtCanvas, { n: 120, height: 60, color: U.cssVar('--accent'), fill: true, slow: 1, min: 0 });
      grid.appendChild(puP);

      root.appendChild(grid);

      // event-rate ring buffer (events/sec smoothed) — closure-scope, not in frame
      evtRing = new Float32Array(8);
    },

    update: function (frame) {
      fc++;
      var L = frame.load, K = frame.kpis;

      // ---- hero (every frame; cheap text + width writes) ----------------
      var mw = K.totalMW;
      heroVal._num.textContent = mw.toFixed(2);
      var demandPct = K.demandPct;
      heroFill.style.width = Math.max(2, Math.min(100, demandPct)).toFixed(1) + '%';
      heroSub.textContent = K.demandPeakMW.toFixed(2) + ' MW peak · ' + K.overheadRatio.toFixed(2) + '× overhead';

      hk.demand._num.textContent = demandPct.toFixed(1);
      hk.renew._num.textContent = K.renewablePct.toFixed(1);
      hk.co2._num.textContent = K.co2eRate.toFixed(2);
      hk.oee._num.textContent = (K.oee.oee * 100).toFixed(1);
      hk.wpmh._num.textContent = U.group(Math.round(K.wpmh));

      // ---- isometric cutaway (internally throttled) ---------------------
      iso.update(frame);

      // ---- sankey (every frame: particle advance + ribbon glow) ---------
      sankey.update(frame);

      // ---- area matrix (throttled every 8 frames) -----------------------
      if (fc % 8 === 0) {
        var hottest = '', hotKW = -1;
        var i;
        for (i = 0; i < areaRows.length; i++) {
          var kw = L.areaKW[areaRows[i].id] || 0;
          if (kw > hotKW) { hotKW = kw; hottest = areaRows[i].id; }
        }
        for (i = 0; i < areaRows.length; i++) {
          var r = areaRows[i];
          var akw = L.areaKW[r.id] || 0;
          var max = AREA_MAX[r.id] || 1200;
          r.fill.style.width = Math.max(3, Math.min(100, akw / max * 100)).toFixed(0) + '%';
          r.kw.textContent = U.group(Math.round(akw)) + ' kW';
          var st = frame.areaStates[r.id];
          r.e10.textContent = (st ? st.Productive : 0) + '/' + (st ? st.total : 0);
          r.row.classList.toggle('hot', r.id === hottest);
        }
      }

      // ---- alarm & event pulse ------------------------------------------
      if (fc % 4 === 0) {
        var crit = 0, major = 0, minor = 0;
        var al = frame.alarms;
        for (var ai = 0; ai < al.length; ai++) {
          var sev = al[ai].sev;
          if (sev === 'CRIT') crit++;
          else if (sev === 'MAJOR') major++;
          else if (sev === 'MINOR') minor++;
        }
        sevN.crit.textContent = crit;
        sevN.major.textContent = major;
        sevN.minor.textContent = minor;
      }

      // event rate: smoothed events/sec from newEvents count over an 8-slot ring.
      // frame runs ~30-60Hz; newEvents holds events since the last frame.
      evtRing[evtHead] = frame.newEvents.length;
      evtHead = (evtHead + 1) % evtRing.length;
      if (evtCount < evtRing.length) evtCount++;
      var sum = 0;
      for (var e = 0; e < evtCount; e++) sum += evtRing[e];
      // newEvents are emitted at sim rate; the stream is ~real seconds. Approximate
      // rate = events-per-frame * effective frame rate. Use a stable display scalar.
      var rate = sum / evtCount * 30;   // ~30 composited frames/sec
      evtSpark.push(rate);
      if (fc % 4 === 0) {
        evtSpark.render();
        evtRateEl.textContent = rate.toFixed(1) + ' evt/s';
      }
    }
  });

  // ======================================================================
  // Isometric fab cutaway
  // 2:1 isometric projection. Built once; update() only rewrites cached refs,
  // throttled. Top faces lighter, side faces darker for depth.
  // ======================================================================
  function buildIso(parent) {
    var VW = 800, VH = 520;
    var svg = U.svg('svg', { viewBox: '0 0 ' + VW + ' ' + VH, 'class': 'cc-iso' });
    svg.setAttribute('aria-label', 'Isometric fab cutaway: roof systems, fab level, sub-fab utilities');

    // --- defs: 2 reusable blur filters + gradients (sparingly) ---
    var defs = U.svg('defs');
    defs.appendChild(makeBlur('ccGlowS', 2.2));
    defs.appendChild(makeBlur('ccGlowL', 5));
    svg.appendChild(defs);

    // iso projection: world (x,y on a slab plane, z = vertical level offset)
    // 2:1 iso — screen.x = ox + (x - y)*c, screen.y = oy + (x + y)*c*0.5 - z
    var C = 1;
    function iso(ox, oy, x, y, z) {
      return [ox + (x - y) * C, oy + (x + y) * C * 0.5 - (z || 0)];
    }
    // draw a flat iso tile (top face) as a rhombus given center, half-w, half-d
    function tilePath(ox, oy, cx, cy, hw, hd, z) {
      var a = iso(ox, oy, cx - hw, cy - hd, z);
      var b = iso(ox, oy, cx + hw, cy - hd, z);
      var c = iso(ox, oy, cx + hw, cy + hd, z);
      var d = iso(ox, oy, cx - hw, cy + hd, z);
      return 'M' + f(a) + 'L' + f(b) + 'L' + f(c) + 'L' + f(d) + 'Z';
    }
    function f(p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }

    // --- level origins (screen) ---
    var ROOF = { ox: 400, oy: 150 };
    var FAB = { ox: 400, oy: 300 };
    var SUB = { ox: 400, oy: 430 };

    // --- level slab backdrops (drawn first, behind contents) ---
    function slab(level, label) {
      // big iso platform rhombus
      var p = U.svg('path', {
        d: tilePath(level.ox, level.oy, 0, 0, 150, 150, 0),
        fill: 'rgba(18,28,44,.55)', stroke: 'var(--line-2)', 'stroke-width': 1
      });
      svg.appendChild(p);
      var t = U.svg('text', {
        x: level.ox - 152, y: level.oy - 4, 'text-anchor': 'start',
        'font-size': 9, fill: 'var(--text-mut)', 'letter-spacing': '0.12em'
      });
      t.textContent = label;
      svg.appendChild(t);
    }
    slab(ROOF, 'ROOF');
    slab(FAB, 'FAB LEVEL');
    slab(SUB, 'SUB-FAB');

    // --- vertical risers between levels (animated dash-offset) ---
    var risers = [];
    [[-90, -90], [90, -90], [90, 90], [-90, 90], [0, 0]].forEach(function (g) {
      var top = iso(FAB.ox, FAB.oy, g[0], g[1], 0);
      var bot = iso(SUB.ox, SUB.oy, g[0], g[1], 0);
      var topR = iso(ROOF.ox, ROOF.oy, g[0], g[1], 0);
      var line1 = U.svg('path', { d: 'M' + f(topR) + 'L' + f(top), 'class': 'cc-riser' });
      var line2 = U.svg('path', { d: 'M' + f(top) + 'L' + f(bot), 'class': 'cc-riser' });
      svg.appendChild(line1); svg.appendChild(line2);
      risers.push(line1, line2);
    });

    // --- ROOF: 3 cooling towers, exhaust stacks, solar strip ---
    var roofRefs = { towers: [], plumes: [], solar: null };
    var towerPos = [[-90, -40], [-90, 40], [-90, 120]];
    towerPos.forEach(function (tp, i) {
      var box = isoBox(svg, ROOF.ox, ROOF.oy, tp[0], tp[1], 22, 22, 26, 'rgba(40,60,86,1)', 'rgba(28,42,62,1)', 'rgba(22,34,50,1)');
      // fan disc on top (blur pulse by chwRT)
      var top = iso(ROOF.ox, ROOF.oy, tp[0], tp[1], 26);
      var fan = U.svg('circle', { cx: top[0].toFixed(1), cy: top[1].toFixed(1), r: 9,
        fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': 1.4, opacity: 0.6, filter: 'url(#ccGlowS)' });
      svg.appendChild(fan);
      roofRefs.towers.push(fan);
    });
    // exhaust stacks (right-back), plume opacity by exhaust CFM
    var stackPos = [[40, -120], [90, -120], [140, -120]];
    stackPos.forEach(function (sp, i) {
      isoBox(svg, ROOF.ox, ROOF.oy, sp[0], sp[1], 9, 9, 34, 'rgba(46,62,86,1)', 'rgba(30,42,60,1)', 'rgba(24,34,50,1)');
      var top = iso(ROOF.ox, ROOF.oy, sp[0], sp[1], 34);
      var plume = U.svg('ellipse', { cx: top[0].toFixed(1), cy: (top[1] - 10).toFixed(1), rx: 8, ry: 14,
        fill: 'rgba(160,190,220,.18)', filter: 'url(#ccGlowL)' });
      svg.appendChild(plume);
      roofRefs.plumes.push(plume);
    });
    // solar array strip (front-left), brightness by renewablePct
    var solar = U.svg('path', {
      d: tilePath(ROOF.ox, ROOF.oy, 70, 90, 60, 36, 2),
      fill: 'rgba(58,157,255,.22)', stroke: 'var(--accent-2)', 'stroke-width': 1
    });
    svg.appendChild(solar);
    roofRefs.solar = solar;
    isoLabel(svg, ROOF.ox, ROOF.oy, 70, 90, 4, 'SOLAR', null);

    // --- FAB LEVEL: 8 area tiles in 2x4 ---
    var fabRefs = [];
    // lay 2 rows x 4 cols within the slab plane (x:-120..120, y:-120..120)
    var COLS = 4, ROWS = 2, hwT = 28, hdT = 28;
    for (var ai = 0; ai < AREAS.length; ai++) {
      var col = ai % COLS, rowI = Math.floor(ai / COLS);
      var wx = -120 + col * 80 + 40;
      var wy = -90 + rowI * 90 + 45;
      var a = AREAS[ai];
      var tile = U.svg('path', {
        d: tilePath(FAB.ox, FAB.oy, wx, wy, hwT, hdT, 4),
        fill: 'rgba(37,224,207,.10)', stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-opacity': 0.4
      });
      svg.appendChild(tile);
      var lblPos = iso(FAB.ox, FAB.oy, wx, wy, 4);
      var nameT = U.svg('text', { x: lblPos[0].toFixed(1), y: (lblPos[1] - 1).toFixed(1),
        'text-anchor': 'middle', 'font-size': 8.5, fill: 'var(--text-dim)', 'letter-spacing': '0.04em' });
      nameT.textContent = AREA_SHORT[a.id] || a.id;
      svg.appendChild(nameT);
      var kwT = U.svg('text', { x: lblPos[0].toFixed(1), y: (lblPos[1] + 9).toFixed(1),
        'text-anchor': 'middle', 'font-size': 8, fill: 'var(--accent)', 'font-family': 'var(--mono)' });
      kwT.textContent = '—';
      svg.appendChild(kwT);
      fabRefs.push({ id: a.id, tile: tile, kw: kwT, lastKW: -1, lastHot: false });
    }

    // --- SUB-FAB: equipment blocks (CHW, UPW, GAS, ABATE) ---
    var subDefs = [
      { id: 'CHW', label: 'CHW PLANT', wx: -90, wy: -60, key: 'chwRT', unit: 'RT' },
      { id: 'UPW', label: 'UPW', wx: 0, wy: -60, key: 'upwFlow', unit: 'm³/h' },
      { id: 'GAS', label: 'BULK GAS', wx: -90, wy: 60, key: 'n2Flow', unit: 'Nm³/h' },
      { id: 'ABATE', label: 'ABATEMENT', wx: 0, wy: 60, key: 'exhaustKW', unit: 'kW' }
    ];
    var subRefs = [];
    subDefs.forEach(function (s) {
      var box = isoBox(svg, SUB.ox, SUB.oy, s.wx, s.wy, 34, 22, 18,
        'rgba(34,50,72,1)', 'rgba(24,36,54,1)', 'rgba(18,28,42,1)');
      var top = iso(SUB.ox, SUB.oy, s.wx, s.wy, 18);
      var glow = U.svg('path', {
        d: tilePath(SUB.ox, SUB.oy, s.wx, s.wy, 34, 22, 18),
        fill: 'rgba(37,224,207,.06)', stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-opacity': 0.25
      });
      svg.appendChild(glow);
      var nameT = U.svg('text', { x: top[0].toFixed(1), y: (top[1] - 2).toFixed(1),
        'text-anchor': 'middle', 'font-size': 8, fill: 'var(--text-mut)', 'letter-spacing': '0.05em' });
      nameT.textContent = s.label;
      svg.appendChild(nameT);
      var valT = U.svg('text', { x: top[0].toFixed(1), y: (top[1] + 8).toFixed(1),
        'text-anchor': 'middle', 'font-size': 8.5, fill: 'var(--accent)', 'font-family': 'var(--mono)' });
      valT.textContent = '—';
      svg.appendChild(valT);
      subRefs.push({ key: s.key, unit: s.unit, glow: glow, val: valT, lastV: -1 });
    });

    parent.appendChild(svg);

    // riser dash animation state (closure scalar; no alloc)
    var riserOffset = 0;

    function update(frame) {
      var L = frame.load, K = frame.kpis;

      // risers: animate dash-offset every 4th frame (skip under reduced motion)
      if (!REDUCED && frame.tick % 4 === 0) {
        riserOffset = (riserOffset - 2) % 16;
        var off = riserOffset.toFixed(0);
        for (var ri = 0; ri < risers.length; ri++) risers[ri].setAttribute('stroke-dashoffset', off);
      }

      // ROOF (throttle every 4th frame): fan glow by chwRT, plumes by exhaust, solar by renewable
      if (frame.tick % 4 === 0) {
        var chwLoad = Math.max(0, Math.min(1, (L.chwRT - 7000) / 6000));
        var fanOp = (0.4 + chwLoad * 0.5).toFixed(2);
        for (var t = 0; t < roofRefs.towers.length; t++) roofRefs.towers[t].setAttribute('opacity', fanOp);
        var exNorm = Math.max(0, Math.min(1, (L.exAcidCFM - 80000) / 60000));
        var plumeOp = (0.10 + exNorm * 0.30).toFixed(2);
        for (var pl = 0; pl < roofRefs.plumes.length; pl++) roofRefs.plumes[pl].setAttribute('opacity', plumeOp);
        var rn = Math.max(0, Math.min(1, (K.renewablePct - 20) / 16));
        roofRefs.solar.setAttribute('fill', 'rgba(58,157,255,' + (0.16 + rn * 0.28).toFixed(3) + ')');
      }

      // FAB tiles (throttle every 2nd frame): glow + kW label, change-gated
      if (frame.tick % 2 === 0) {
        var hottest = '', hotKW = -1, i;
        for (i = 0; i < fabRefs.length; i++) {
          var kw0 = L.areaKW[fabRefs[i].id] || 0;
          if (kw0 > hotKW) { hotKW = kw0; hottest = fabRefs[i].id; }
        }
        for (i = 0; i < fabRefs.length; i++) {
          var r = fabRefs[i];
          var kw = L.areaKW[r.id] || 0;
          var max = AREA_MAX[r.id] || 1200;
          var inten = Math.max(0.06, Math.min(0.85, kw / max));
          var rk = Math.round(kw);
          if (rk !== r.lastKW) {
            r.lastKW = rk;
            r.tile.setAttribute('fill', 'rgba(37,224,207,' + inten.toFixed(3) + ')');
            r.kw.textContent = rk >= 1000 ? (rk / 1000).toFixed(1) + 'k' : rk + '';
          }
          var hot = (r.id === hottest);
          if (hot !== r.lastHot) {
            r.lastHot = hot;
            r.tile.setAttribute('stroke', hot ? '#6cf3e6' : 'var(--accent)');
            r.tile.setAttribute('stroke-opacity', hot ? '0.95' : '0.4');
            r.tile.setAttribute('stroke-width', hot ? '1.6' : '1');
          }
        }
      }

      // SUB-FAB readouts (throttle every 4th frame), change-gated
      if (frame.tick % 4 === 0) {
        for (var s = 0; s < subRefs.length; s++) {
          var sr = subRefs[s];
          var raw = L[sr.key] != null ? L[sr.key] : 0;
          var disp = raw >= 1000 ? Math.round(raw / 100) / 10 : Math.round(raw);
          if (disp !== sr.lastV) {
            sr.lastV = disp;
            var txt = raw >= 1000 ? (raw / 1000).toFixed(1) + 'k' : Math.round(raw) + '';
            sr.val.textContent = txt;
            var g = Math.max(0.04, Math.min(0.22, raw / (sr.key === 'n2Flow' ? 16000 : sr.key === 'chwRT' ? 14000 : 4000)));
            sr.glow.setAttribute('fill', 'rgba(37,224,207,' + g.toFixed(3) + ')');
          }
        }
      }
    }

    return { update: update };

    // ---- iso primitives (defined here so they capture iso()/f()) ----
    function isoBox(svgEl, ox, oy, cx, cy, hw, hd, h, topFill, leftFill, rightFill) {
      // top face
      var top = U.svg('path', { d: tilePath(ox, oy, cx, cy, hw, hd, h), fill: topFill, stroke: 'var(--line)', 'stroke-width': 0.6 });
      // left face (front-left): from front corners down
      var fl = iso(ox, oy, cx - hw, cy + hd, h);
      var flb = iso(ox, oy, cx - hw, cy + hd, 0);
      var fr = iso(ox, oy, cx + hw, cy + hd, h);
      var frb = iso(ox, oy, cx + hw, cy + hd, 0);
      var bl = iso(ox, oy, cx - hw, cy - hd, h);
      var blb = iso(ox, oy, cx - hw, cy - hd, 0);
      var leftFace = U.svg('path', {
        d: 'M' + f(bl) + 'L' + f(fl) + 'L' + f(flb) + 'L' + f(blb) + 'Z',
        fill: leftFill, stroke: 'var(--line)', 'stroke-width': 0.5
      });
      var rightFace = U.svg('path', {
        d: 'M' + f(fl) + 'L' + f(fr) + 'L' + f(frb) + 'L' + f(flb) + 'Z',
        fill: rightFill, stroke: 'var(--line)', 'stroke-width': 0.5
      });
      svgEl.appendChild(leftFace); svgEl.appendChild(rightFace); svgEl.appendChild(top);
      return top;
    }
    function isoLabel(svgEl, ox, oy, cx, cy, z, txt) {
      var p = iso(ox, oy, cx, cy, z);
      var t = U.svg('text', { x: p[0].toFixed(1), y: p[1].toFixed(1), 'text-anchor': 'middle',
        'font-size': 8, fill: 'var(--text-mut)', 'letter-spacing': '0.05em' });
      t.textContent = txt;
      svgEl.appendChild(t);
    }
  }

  function makeBlur(id, dev) {
    var fil = U.svg('filter', { id: id, x: '-60%', y: '-60%', width: '220%', height: '220%' });
    fil.appendChild(U.svg('feGaussianBlur', { 'stdDeviation': dev }));
    return fil;
  }

  // ======================================================================
  // Energy flow Sankey (canvas, DPR-aware, pre-allocated particle pool)
  // Sources GRID + RENEWABLE -> center TOTAL -> sinks (Process, HVAC, CHW,
  // UPW, Exhaust, Gas, Other). Ribbon widths ∝ kW. Particles flow along
  // ribbons (cyan grid / green renewable). Static when reduced-motion.
  // ======================================================================
  function buildSankey(canvas) {
    // sinks: verified frame.load keys (no separate abateKW sink — abate folds into exhaustKW)
    var SINKS = [
      { label: 'Process', key: 'processKW' },
      { label: 'HVAC', key: 'hvacKW' },
      { label: 'CHW Plant', key: 'chwKW' },
      { label: 'UPW', key: 'upwKW' },
      { label: 'Exhaust', key: 'exhaustKW' },
      { label: 'Bulk Gas', key: 'gasKW' },
      { label: 'Other', key: 'otherKW' }
    ];
    var NS = SINKS.length;

    // geometry (in CSS px, recomputed only on resize)
    var lay = null, lw = 0, lh = 0;

    // particle pool (pre-allocated; zero alloc per frame)
    var POOL = REDUCED ? 0 : 280;
    var pp = new Float32Array(POOL);        // progress 0..1 along ribbon
    var psp = new Float32Array(POOL);       // speed
    var psink = new Int16Array(POOL);       // which sink ribbon
    var pact = new Uint8Array(POOL);
    var pren = new Uint8Array(POOL);        // 1 = renewable (green), 0 = grid (cyan)
    var lastMs = null;
    var spawnAcc = 0;

    function computeLayout(w, h) {
      var srcX = 18, totX = w * 0.46, sinkX = w - 16;
      var totW = 16;
      var totTop = 60, totBot = h - 60;
      return {
        w: w, h: h, srcX: srcX, totX: totX, sinkX: sinkX, totW: totW,
        totTop: totTop, totBot: totBot, totMidY: (totTop + totBot) / 2,
        gridY: h * 0.30, renY: h * 0.66
      };
    }

    // cubic ribbon centerline sampler: samples the SAME bezier drawRibbon() draws,
    // control points (cx,y0) and (cx,y1) for a horizontal-tangent S-curve.
    function ribbonXY(x0, y0, x1, y1, u, out) {
      var cx = (x0 + x1) / 2;
      var mt = 1 - u;
      var b0 = mt * mt * mt, b1 = 3 * mt * mt * u, b2 = 3 * mt * u * u, b3 = u * u * u;
      out[0] = b0 * x0 + b1 * cx + b2 * cx + b3 * x1;
      out[1] = b0 * y0 + b1 * y0 + b2 * y1 + b3 * y1;
    }

    function drawRibbon(ctx, x0, y0, x1, y1, width, color, alpha) {
      var cx = (x0 + x1) / 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - width / 2);
      ctx.bezierCurveTo(cx, y0 - width / 2, cx, y1 - width / 2, x1, y1 - width / 2);
      ctx.lineTo(x1, y1 + width / 2);
      ctx.bezierCurveTo(cx, y1 + width / 2, cx, y0 + width / 2, x0, y0 + width / 2);
      ctx.closePath();
      ctx.fillStyle = U.hexA(color, alpha);
      ctx.fill();
    }

    var scratch = [0, 0];

    function spawn(sinkIdx, ren) {
      for (var i = 0; i < POOL; i++) {
        if (!pact[i]) {
          pact[i] = 1; pp[i] = 0; psink[i] = sinkIdx; pren[i] = ren ? 1 : 0;
          psp[i] = 0.5 + BAS.prng.rand('skSp', i) * 0.4;
          return;
        }
      }
    }

    function update(frame) {
      var w = canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 360;
      var h = 420;
      if (!lay || lw !== w || lh !== h) { lay = computeLayout(w, h); lw = w; lh = h; }
      var ctx = U.fitCanvas(canvas, h);
      var L = frame.load, K = frame.kpis;

      // accumulate sink kW + total
      var total = L.totalKW || 1;
      var renFrac = Math.max(0, Math.min(1, K.renewablePct / 100));

      ctx.clearRect(0, 0, w, h);

      // --- center TOTAL node ---
      var t = lay;
      ctx.save();
      ctx.shadowColor = U.hexA(U.cssVar('--accent'), 0.5); ctx.shadowBlur = 14;
      ctx.fillStyle = U.cssVar('--bg-3');
      roundRect(ctx, t.totX - t.totW / 2, t.totTop, t.totW, t.totBot - t.totTop, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = U.cssVar('--accent'); ctx.lineWidth = 1.2;
      roundRect(ctx, t.totX - t.totW / 2, t.totTop, t.totW, t.totBot - t.totTop, 5); ctx.stroke();
      ctx.restore();

      // --- source ribbons (grid + renewable) into the total node ---
      var maxSrcW = (t.totBot - t.totTop) * 0.42;
      var gridW = maxSrcW * (1 - renFrac) + 4;
      var renW = maxSrcW * renFrac + 2;
      drawRibbon(ctx, t.srcX, t.gridY, t.totX - t.totW / 2, t.totMidY - maxSrcW * 0.25, gridW, U.cssVar('--accent'), 0.16);
      drawRibbon(ctx, t.srcX, t.renY, t.totX - t.totW / 2, t.totMidY + maxSrcW * 0.30, renW, U.cssVar('--good'), 0.16);

      // --- sink ribbons fanning right ---
      // precompute each sink's screen y + width; stack by share of total
      var sinkTop = 26, sinkBot = h - 26, sinkGap = (sinkBot - sinkTop) / NS;
      var maxW = sinkGap * 0.78;
      for (var s = 0; s < NS; s++) {
        var kw = L[SINKS[s].key] || 0;
        var share = kw / total;
        var rw = Math.max(2, share * maxW * NS * 0.5);
        if (rw > maxW) rw = maxW;
        var sy = sinkTop + sinkGap * (s + 0.5);
        SINKS[s]._y = sy; SINKS[s]._w = rw; SINKS[s]._kw = kw;
        // ribbon from total node edge to sink
        var startY = t.totTop + (t.totBot - t.totTop) * ((s + 0.5) / NS);
        SINKS[s]._sy = startY;
        drawRibbon(ctx, t.totX + t.totW / 2, startY, t.sinkX - 2, sy, rw, U.cssVar('--accent'), 0.12);
      }

      // --- particles ---
      if (POOL > 0) {
        var nowMs = (performance && performance.now) ? performance.now() : 0;
        var dt = lastMs == null ? 0.016 : Math.min(0.05, (nowMs - lastMs) / 1000);
        lastMs = nowMs;
        // spawn rate ∝ load; bias renewable share
        spawnAcc += dt * (8 + total / 1400);
        var spawnSeq = 0;
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          spawnSeq++;
          // pick a sink weighted by its kW share of the total
          var pick = BAS.prng.rand('skPick', frame.tick * 13 + spawnSeq) * total;
          var acc = 0, si = NS - 1;
          for (var k = 0; k < NS; k++) { acc += (L[SINKS[k].key] || 0); if (pick <= acc) { si = k; break; } }
          var ren = BAS.prng.rand('skRen', frame.tick * 5 + spawnSeq) < renFrac;
          spawn(si, ren);
        }
        // advance + draw
        for (var i = 0; i < POOL; i++) {
          if (!pact[i]) continue;
          pp[i] += psp[i] * dt * (0.4 + total / 14000);
          if (pp[i] >= 1) { pact[i] = 0; continue; }
          var sk = SINKS[psink[i]];
          // two-leg path: source->total (u 0..0.4), total->sink (u 0.4..1)
          var u = pp[i], x, y;
          if (u < 0.4) {
            var u1 = u / 0.4;
            var sy0 = pren[i] ? t.renY : t.gridY;
            ribbonXY(t.srcX, sy0, t.totX, t.totMidY, u1, scratch);
            x = scratch[0]; y = scratch[1];
          } else {
            var u2 = (u - 0.4) / 0.6;
            ribbonXY(t.totX, sk._sy, t.sinkX - 2, sk._y, u2, scratch);
            x = scratch[0]; y = scratch[1];
          }
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, 6.2832);
          ctx.fillStyle = pren[i] ? U.cssVar('--good') : U.cssVar('--accent');
          ctx.fill();
        }
      }

      // --- labels (source + sinks) ---
      ctx.textAlign = 'left';
      ctx.font = '8px ' + U.cssVar('--mono');
      ctx.fillStyle = U.cssVar('--accent');
      ctx.fillText('GRID', t.srcX, t.gridY - 8);
      ctx.fillStyle = U.cssVar('--good');
      ctx.fillText('RENEWABLE', t.srcX, t.renY + 14);
      // total node label
      ctx.textAlign = 'center';
      ctx.fillStyle = U.cssVar('--text-dim');
      ctx.fillText('TOTAL', t.totX, t.totTop - 6);
      ctx.fillStyle = U.cssVar('--accent'); ctx.font = '10px ' + U.cssVar('--mono');
      ctx.fillText(K.totalMW.toFixed(1) + ' MW', t.totX, t.totBot + 14);
      // sink labels + values
      ctx.textAlign = 'right'; ctx.font = '8px ' + U.cssVar('--mono');
      for (var ls = 0; ls < NS; ls++) {
        var sk2 = SINKS[ls];
        ctx.fillStyle = U.cssVar('--text-dim');
        ctx.fillText(sk2.label, t.sinkX, sk2._y - 4);
        ctx.fillStyle = U.cssVar('--accent');
        ctx.fillText((sk2._kw / 1000).toFixed(2) + ' MW', t.sinkX, sk2._y + 7);
      }
    }

    function roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    return { update: update };
  }
})(window.BAS);
