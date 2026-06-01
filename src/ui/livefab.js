/* bas-ems — "living fab" hero canvas (production -> facility coupling, visible)
 * Classic script -> window.BAS.ui.LiveFab
 * Canvas-2D primitives only (file://-safe: no image readback). Particle pool is
 * pre-allocated (zero per-frame allocation). Process events spawn particles that
 * travel from the originating process bay up to the facility system they load,
 * pulsing that system on arrival.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, M = BAS.master;
  var NODES = [
    { id: 'POWER', label: 'POWER', key: 'totalKW', unit: 'MW', scale: 1 / 1000 },
    { id: 'EXHAUST', label: 'EXHAUST / ABATE', key: 'exAcidCFM', unit: 'kCFM', scale: 1 / 1000 },
    { id: 'PCW', label: 'PROCESS COOLING', key: 'pcwRT', unit: 'RT', scale: 1 },
    { id: 'UPW', label: 'UPW', key: 'upwFlow', unit: 'm³/h', scale: 1 },
    { id: 'GAS', label: 'BULK GAS', key: 'n2Flow', unit: 'kNm³/h', scale: 1 / 1000 }
  ];
  // area -> [primary node idx, secondary node idx]
  var AREA_TARGET = {
    LITHO: [0], ETCH: [1, 0], DIFF: [2, 4], IMPL: [0], CMP: [3, 2], WET: [3, 1], THIN: [1, 0], METRO: [0]
  };
  var STATE_COLOR = {
    'Productive': '#34d399', 'Standby': '#3a9dff', 'Engineering': '#9a7bff',
    'Scheduled Down': '#f5b73d', 'Unscheduled Down': '#ff5d6c', 'Non-Scheduled': '#5c6981'
  };

  BAS.ui.LiveFab = function (canvas) {
    canvas.setAttribute('aria-label', 'Living fab visualization showing production events driving facility load');
    var POOL = 460;
    var px = new Float32Array(POOL), py = new Float32Array(POOL), pp = new Float32Array(POOL),
      psp = new Float32Array(POOL), ptx = new Float32Array(POOL), pty = new Float32Array(POOL),
      psx = new Float32Array(POOL), psy = new Float32Array(POOL), pnode = new Int16Array(POOL),
      pact = new Uint8Array(POOL), pbig = new Uint8Array(POOL);
    var pcolor = new Array(POOL);
    var lastMs = null, layout = null, lw = 0, lh = 0;
    var nodePulse = [0, 0, 0, 0, 0];
    var areas = M.areas;
    var areaTools = {};
    areas.forEach(function (a) { areaTools[a.id] = M.toolsInArea(a.id).slice(0, 12); });

    // --- Tooltip (created once, reused) ---
    var tooltip = null;     // single reused element (production single-mounts; no destroy path needed)
    var lastFrame = null;
    var lastHitId = null;   // gate: rebuild innerHTML only when the hovered target/values change

    function ensureTooltip() {
      if (tooltip) return;
      tooltip = document.createElement('div');
      tooltip.className = 'livefab-tooltip';
      tooltip.style.display = 'none';
      document.body.appendChild(tooltip);
    }

    function hideTooltip() {
      if (tooltip) tooltip.style.display = 'none';
      lastHitId = null;
    }

    // Position near cursor (nudged off the pointer), clamped/flipped to the viewport.
    // Cheap — runs every mousemove; the expensive innerHTML build is gated by lastHitId.
    function positionTooltip(clientX, clientY) {
      var tx = clientX + 14, ty = clientY - 10;
      var tw = tooltip.offsetWidth || 200, th = tooltip.offsetHeight || 80;
      if (tx + tw > window.innerWidth - 8)  tx = clientX - tw - 10;
      if (ty + th > window.innerHeight - 8) ty = clientY - th - 10;
      tooltip.style.left = tx + 'px';
      tooltip.style.top  = ty + 'px';
    }

    function onMouseMove(ev) {
      if (!layout) { hideTooltip(); return; }
      // Map client coords -> layout coordinate space (CSS pixels that match layout.w/h)
      var rect = canvas.getBoundingClientRect();
      var mx = (ev.clientX - rect.left) * (layout.w / rect.width);
      var my = (ev.clientY - rect.top)  * (layout.h / rect.height);
      var frame = lastFrame;

      // Hit-test bays first (larger targets)
      var hitBay = null;
      for (var bi = 0; bi < layout.bays.length; bi++) {
        var b = layout.bays[bi];
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          hitBay = b; break;
        }
      }
      if (hitBay) {
        var areaId = hitBay.area.id;
        var areaName = hitBay.area.name;
        var active = 0, total = 0, areaKW = 0;
        if (frame && frame.areaStates && frame.areaStates[areaId]) {
          var st = frame.areaStates[areaId];
          active = st.Productive != null ? st.Productive : 0;
          total  = st.total != null ? st.total : 0;
        }
        if (frame && frame.load && frame.load.areaKW && frame.load.areaKW[areaId] != null) {
          areaKW = frame.load.areaKW[areaId];
        }
        // Cheap signature; rebuild HTML (incl. toLocaleString) only when target/values change.
        var hitId = 'b:' + areaId + ':' + active + ':' + total + ':' + Math.round(areaKW);
        ensureTooltip();
        if (hitId !== lastHitId) {
          lastHitId = hitId;
          tooltip.innerHTML = '<div class="lft-title">' + areaName + '</div>' +
            '<div class="lft-row"><span class="lft-k">Area</span><span class="lft-v">' + areaId + '</span></div>' +
            '<div class="lft-row"><span class="lft-k">Active / Total</span><span class="lft-v">' + active + ' / ' + total + '</span></div>' +
            '<div class="lft-row"><span class="lft-k">Process Load</span><span class="lft-v">' + Math.round(areaKW).toLocaleString() + ' kW</span></div>';
        }
        tooltip.style.display = 'block';
        positionTooltip(ev.clientX, ev.clientY);
        return;
      }

      // Hit-test facility nodes (drawn at nd.x - nd.w/2, nd.y - 14, nd.w, 32)
      var hitNode = null, hitNodeIdx = -1;
      for (var ni = 0; ni < layout.nodes.length; ni++) {
        var nd = layout.nodes[ni];
        var nx1 = nd.x - nd.w / 2, nx2 = nd.x + nd.w / 2;
        var ny1 = nd.y - 14,       ny2 = nd.y - 14 + 32;
        if (mx >= nx1 && mx <= nx2 && my >= ny1 && my <= ny2) {
          hitNode = nd; hitNodeIdx = ni; break;
        }
      }
      if (hitNode) {
        var meta = NODES[hitNodeIdx];
        var rawVal = 0;
        if (frame && frame.load && frame.load[meta.key] != null) {
          rawVal = frame.load[meta.key] * meta.scale;
        }
        var valStr = (rawVal >= 100 ? Math.round(rawVal) : rawVal.toFixed(1)) + ' ' + meta.unit;
        var hitId2 = 'n:' + hitNodeIdx + ':' + valStr;
        ensureTooltip();
        if (hitId2 !== lastHitId) {
          lastHitId = hitId2;
          tooltip.innerHTML = '<div class="lft-title">' + meta.label + '</div>' +
            '<div class="lft-row"><span class="lft-k">Value</span><span class="lft-v">' + valStr + '</span></div>';
        }
        tooltip.style.display = 'block';
        positionTooltip(ev.clientX, ev.clientY);
        return;
      }

      hideTooltip();
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', function () { hideTooltip(); });

    function computeLayout(w, h) {
      var nodeY = 46, nodeW = Math.min(150, (w - 40) / NODES.length - 14);
      var nodes = NODES.map(function (nd, i) {
        var cx = (w / (NODES.length + 1)) * (i + 1);
        return { x: cx, y: nodeY, w: nodeW };
      });
      var cols = w < 760 ? 4 : 8, rows = Math.ceil(areas.length / cols);
      var top = 104, gapx = 14, gapy = 14;
      var bw = (w - 24 - gapx * (cols - 1)) / cols;
      var bh = Math.min(190, (h - top - 14 - gapy * (rows - 1)) / rows);
      var bays = areas.map(function (a, i) {
        var r = Math.floor(i / cols), c = i % cols;
        return { area: a, x: 12 + c * (bw + gapx), y: top + r * (bh + gapy), w: bw, h: bh };
      });
      return { nodes: nodes, bays: bays, busY: top - 24, w: w, h: h };
    }

    function spawn(bay, nodeIdx, color, big) {
      for (var i = 0; i < POOL; i++) {
        if (!pact[i]) {
          pact[i] = 1; pp[i] = 0; pbig[i] = big ? 1 : 0; pnode[i] = nodeIdx; pcolor[i] = color;
          psx[i] = bay.x + bay.w / 2; psy[i] = bay.y;
          var nd = layout.nodes[nodeIdx];
          ptx[i] = nd.x; pty[i] = nd.y + 14;
          psp[i] = big ? 0.9 : 1.3; // big = alarm, travels slower
          return;
        }
      }
    }

    function targetsFor(e) {
      var t = AREA_TARGET[e.area] || [0];
      return t;
    }

    function update(frame) {
      lastFrame = frame;
      var w = canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 760;
      var h = canvas.clientHeight || 440;
      if (!layout || lw !== w || lh !== h) { layout = computeLayout(w, h); lw = w; lh = h; }
      var ctx = U.fitCanvas(canvas, h);
      var nowMs = (performance && performance.now) ? performance.now() : Date.now();
      var dt = lastMs == null ? 0.016 : Math.min(0.05, (nowMs - lastMs) / 1000);
      lastMs = nowMs;

      // spawn from new events (curated to keep particle rate readable)
      var bayByArea = {}; layout.bays.forEach(function (b) { bayByArea[b.area.id] = b; });
      var ne = frame.newEvents;
      for (var k = 0; k < ne.length; k++) {
        var e = ne[k]; var bay = bayByArea[e.area]; if (!bay) continue;
        if (e.type === 'ProcessJobStart') {
          var tg = targetsFor(e);
          for (var ti = 0; ti < tg.length; ti++) spawn(bay, tg[ti], U.cssVar('--c-job'), false);
        } else if (e.type === 'SubstrateProcessed' && (e.seq % 3 === 0)) {
          spawn(bay, 0, U.cssVar('--c-wafer'), false);
        } else if (e.type === 'AlarmSet') {
          spawn(bay, AREA_TARGET[e.area] ? AREA_TARGET[e.area][0] : 0, U.cssVar('--bad'), true);
        }
      }

      // advance
      for (var i = 0; i < POOL; i++) {
        if (!pact[i]) continue;
        pp[i] += psp[i] * dt;
        if (pp[i] >= 1) { pact[i] = 0; nodePulse[pnode[i]] = Math.min(1.6, nodePulse[pnode[i]] + (pbig[i] ? 0.9 : 0.35)); }
      }
      for (var n = 0; n < nodePulse.length; n++) nodePulse[n] = Math.max(0, nodePulse[n] - dt * 1.6);

      render(ctx, frame);
    }

    function render(ctx, frame) {
      var w = layout.w, h = layout.h;
      ctx.clearRect(0, 0, w, h);

      // connectors: bays -> bus -> nodes (faint)
      ctx.strokeStyle = 'rgba(120,150,190,.10)'; ctx.lineWidth = 1;
      layout.bays.forEach(function (b) {
        ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, layout.busY); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(12, layout.busY); ctx.lineTo(w - 12, layout.busY); ctx.stroke();
      layout.nodes.forEach(function (nd) {
        ctx.beginPath(); ctx.moveTo(nd.x, nd.y + 14); ctx.lineTo(nd.x, layout.busY); ctx.stroke();
      });

      // facility nodes
      layout.nodes.forEach(function (nd, i) {
        var meta = NODES[i];
        var val = frame.load[meta.key] * meta.scale;
        var pulse = nodePulse[i];
        var glow = 6 + pulse * 18;
        ctx.save();
        ctx.shadowColor = pulse > 0.05 ? U.hexA(U.cssVar('--accent'), 0.6) : 'transparent';
        ctx.shadowBlur = glow;
        roundRect(ctx, nd.x - nd.w / 2, nd.y - 14, nd.w, 32, 6);
        ctx.fillStyle = '#111826'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = pulse > 0.05 ? U.cssVar('--accent') : U.cssVar('--line-2'); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = U.cssVar('--text-mut'); ctx.font = '8px ' + U.cssVar('--mono'); ctx.textAlign = 'center';
        ctx.fillText(meta.label, nd.x, nd.y - 3);
        ctx.fillStyle = U.cssVar('--accent'); ctx.font = '13px ' + U.cssVar('--mono');
        ctx.fillText(fmtVal(val) + ' ' + meta.unit, nd.x, nd.y + 11);
      });

      // bays
      var anyAlarmArea = {};
      frame.alarms.forEach(function (a) { anyAlarmArea[a.area] = 1; });
      layout.bays.forEach(function (b) {
        var st = frame.areaStates[b.area.id];
        var alarmed = anyAlarmArea[b.area.id];
        ctx.save();
        roundRect(ctx, b.x, b.y, b.w, b.h, 6);
        ctx.fillStyle = '#0e131c';
        ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = alarmed ? U.cssVar('--bad') : U.cssVar('--line'); ctx.stroke();
        ctx.restore();
        // title
        ctx.fillStyle = U.cssVar('--text-dim'); ctx.font = '10px ' + U.cssVar('--sans'); ctx.textAlign = 'left';
        ctx.fillText(b.area.name, b.x + 8, b.y + 15);
        ctx.fillStyle = U.cssVar('--text-faint'); ctx.font = '8px ' + U.cssVar('--mono');
        ctx.fillText(st.Productive + '/' + st.total + ' run', b.x + 8, b.y + 27);
        // tool dots
        var tools = areaTools[b.area.id];
        var dotsPerRow = Math.max(4, Math.floor((b.w - 16) / 11));
        for (var ti = 0; ti < tools.length; ti++) {
          var state = frame.toolStates[tools[ti].id];
          var dr = Math.floor(ti / dotsPerRow), dc = ti % dotsPerRow;
          var dx = b.x + 9 + dc * 11, dy = b.y + 36 + dr * 11;
          ctx.beginPath(); ctx.arc(dx, dy, 3, 0, 6.2832);
          ctx.fillStyle = STATE_COLOR[state] || '#5c6981'; ctx.fill();
        }
        // area process-load readout (gives each bay a clear data point) + bar
        var areaKW = frame.load.areaKW[b.area.id] || 0;
        ctx.textAlign = 'left';
        ctx.fillStyle = U.cssVar('--accent'); ctx.font = '13px ' + U.cssVar('--mono');
        ctx.fillText(Math.round(areaKW).toLocaleString() + ' kW', b.x + 8, b.y + b.h - 24);
        ctx.fillStyle = U.cssVar('--text-faint'); ctx.font = '8px ' + U.cssVar('--mono');
        ctx.fillText('PROCESS LOAD', b.x + 8, b.y + b.h - 14);
        var frac = Math.max(0.04, Math.min(1, areaKW / 1600));
        var barY = b.y + b.h - 8, barW = b.w - 16;
        ctx.fillStyle = '#18212f'; roundRect(ctx, b.x + 8, barY, barW, 4, 2); ctx.fill();
        ctx.fillStyle = U.cssVar('--accent'); roundRect(ctx, b.x + 8, barY, barW * frac, 4, 2); ctx.fill();
      });

      // particles
      for (var i = 0; i < POOL; i++) {
        if (!pact[i]) continue;
        var t = ease(pp[i]);
        var midY = layout.busY;
        // path: source -> bus (vertical) -> node (vertical), bus segment lateral
        var x, y;
        if (t < 0.42) { var u = t / 0.42; x = psx[i]; y = psy[i] + (midY - psy[i]) * u; }
        else if (t < 0.58) { var u2 = (t - 0.42) / 0.16; x = psx[i] + (ptx[i] - psx[i]) * u2; y = midY; }
        else { var u3 = (t - 0.58) / 0.42; x = ptx[i]; y = midY + (pty[i] - midY) * u3; }
        var r = pbig[i] ? 3.2 : 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
        ctx.fillStyle = pcolor[i]; ctx.shadowColor = pcolor[i]; ctx.shadowBlur = 8; ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function fmtVal(v) { return v >= 100 ? Math.round(v) : v.toFixed(1); }
    function ease(t) { return t; }
    function roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    return { update: update };
  };
})(window.BAS);
