/* bas-ems — Timeline Cockpit (canvas multi-lane time machine)
 * Classic script -> window.BAS.ui.TimelineCockpit(container) -> { update(frame), setTool(id), destroy() }
 * Task 6: demand lane + alarms + density heat + E10 ribbon (4 stacked lanes in cached static layer)
 *         + tool selector. Playhead-only per frame. Lanes 2-4 added in Task 6.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  BAS.ui.TimelineCockpit = function (container) {
    var CS = BAS.clockSource;
    var data = U.timelineData.get();
    var collapsed = false, hoverX = -1;

    // ---- lane constants ---------------------------------------------------
    var LANES = ['demand', 'alarms', 'density', 'e10'];
    var selTool = BAS.master.tools[0].id;

    // ---- DOM: transport row + canvas ----
    var root = el('div', 'cockpit-inner');
    var bar = el('div', 'tl-transport');
    var playBtn = el('button', 'tl-btn', '❚❚');          // shows pause glyph while live
    var clock = el('span', 'tl-clock', '00:00:00');
    var pill = el('span', 'tl-pill live', 'LIVE');
    // tool selector for E10 ribbon lane
    var toolSel = el('select', 'tl-select');
    BAS.master.tools.forEach(function (t) { var o = el('option'); o.value = t.id; o.textContent = t.id; toolSel.appendChild(o); });
    toolSel.value = selTool;
    toolSel.addEventListener('change', function () { selTool = toolSel.value; staticW = -1; });
    var spacer = el('span', 'tl-spacer');
    var chevron = el('button', 'tl-btn', '▾');
    bar.appendChild(playBtn); bar.appendChild(clock); bar.appendChild(pill);
    bar.appendChild(toolSel); bar.appendChild(spacer); bar.appendChild(chevron);
    var canvas = el('canvas', 'tl-canvas');
    root.appendChild(bar); root.appendChild(canvas);
    container.appendChild(root);

    // ---- cached static layer (lanes drawn once) ----
    var staticC = document.createElement('canvas'), staticW = 0, staticH = 0, dpr = 1;
    var COL_ACCENT = U.cssVar('--accent'), COL_WARN = U.cssVar('--warn');
    function xToT(px) { return Math.max(0, Math.min(data.P - 0.001, (px / canvas._w) * data.P)); }
    function tToX(t) { return (t / data.P) * canvas._w; }

    // demand area chart helper — draws into the supplied context clipped to (x0,y0,w,hh)
    function drawDemand(s, x0, y0, w, hh) {
      var range = (data.peakMW - data.minMW) || 1, N = data.demand.length;
      s.save(); s.beginPath(); s.rect(x0, y0, w, hh); s.clip();
      s.beginPath();
      for (var i = 0; i < N; i++) {
        var x = x0 + i / (N - 1) * w;
        var y = y0 + hh - ((data.demand[i] - data.minMW) / range) * hh;
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
      s.lineTo(x0 + w, y0 + hh); s.lineTo(x0, y0 + hh); s.closePath();
      s.fillStyle = U.hexA(U.cssVar('--accent'), .14); s.fill();
      s.beginPath();
      for (var j = 0; j < N; j++) {
        var x2 = x0 + j / (N - 1) * w;
        var y2 = y0 + hh - ((data.demand[j] - data.minMW) / range) * hh;
        if (j === 0) s.moveTo(x2, y2); else s.lineTo(x2, y2);
      }
      s.strokeStyle = U.cssVar('--accent'); s.lineWidth = 1; s.stroke(); s.restore();
    }

    function rebuildStatic() {
      var ctx = U.fitCanvas(canvas, collapsed ? 24 : 92);   // sets canvas._w/_h + DPR transform
      var w = canvas._w, h = canvas._h; dpr = canvas._dpr;
      staticC.width = canvas.width; staticC.height = canvas.height;
      var s = staticC.getContext('2d'); s.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.clearRect(0, 0, w, h);

      if (collapsed) {
        // collapsed: just the demand line full-height
        drawDemand(s, 0, 0, w, h);
      } else {
        // 4 stacked lanes
        var laneH = Math.floor((h - 4) / LANES.length), pad = 2;
        function laneY(i) { return 2 + i * laneH; }

        // lane 0: demand area chart
        drawDemand(s, 0, laneY(0), w, laneH - pad);

        // lane 1: alarm spans
        for (var ai = 0; ai < data.alarms.length; ai++) {
          var a = data.alarms[ai];
          var ax = a.setT / data.P * w;
          var aw = Math.max(2, (a.clearT - a.setT) / data.P * w);
          s.fillStyle = a.sev === 'MAJOR' ? U.cssVar('--bad') : U.cssVar('--warn');
          s.fillRect(ax, laneY(1) + 2, aw, laneH - pad - 4);
        }

        // lane 2: event-density heat strip
        var dmax = 1;
        for (var d0 = 0; d0 < data.density.length; d0++) { if (data.density[d0] > dmax) dmax = data.density[d0]; }
        var bw = w / data.density.length;
        for (var d = 0; d < data.density.length; d++) {
          s.fillStyle = U.hexA(U.cssVar('--accent'), 0.12 + 0.6 * (data.density[d] / dmax));
          s.fillRect(d * bw, laneY(2) + 1, bw + 0.5, laneH - pad - 2);
        }

        // lane 3: E10 ribbon for selected tool
        var segs = data.e10[selTool] || [];
        var stcol = {
          'Productive': '#34d399', 'Standby': '#3a9dff', 'Engineering': '#9a7bff',
          'Scheduled Down': '#f5b73d', 'Unscheduled Down': '#ff5d6c', 'Non-Scheduled': '#5c6981'
        };
        for (var sg = 0; sg < segs.length; sg++) {
          var sx = segs[sg].startT / data.P * w;
          var sw = (segs[sg].endT - segs[sg].startT) / data.P * w;
          s.fillStyle = stcol[segs[sg].state] || '#5c6981';
          s.fillRect(sx, laneY(3) + 1, sw, laneH - pad - 2);
        }
      }

      staticW = w; staticH = h;
    }

    function render(frame) {
      if (canvas._w !== staticW || canvas._h !== staticH) rebuildStatic();
      var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var w = canvas._w, h = canvas._h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(staticC, 0, 0, w, h);
      // playhead
      var headX = tToX(frame.t);
      ctx.strokeStyle = CS.isLive() ? COL_ACCENT : COL_WARN;
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(headX, 0); ctx.lineTo(headX, h); ctx.stroke();
      // hover crosshair
      if (hoverX >= 0) { ctx.strokeStyle = 'rgba(180,200,230,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hoverX, 0); ctx.lineTo(hoverX, h); ctx.stroke(); }
    }

    // ---- input ----
    var dragging = false;
    function getPx(e) { var r = canvas.getBoundingClientRect(); return e.clientX - r.left; }
    function onMove(e) { if (dragging) CS.scrubTo(xToT(getPx(e))); }
    function onUp() { if (dragging) { dragging = false; CS.resume(); } }
    canvas.addEventListener('mousedown', function (e) { dragging = true; CS.scrubTo(xToT(getPx(e))); });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mousemove', function (e) { hoverX = getPx(e); });
    canvas.addEventListener('mouseleave', function () { hoverX = -1; });
    playBtn.addEventListener('click', function () { CS.togglePlay(); });
    chevron.addEventListener('click', function () { collapsed = !collapsed; chevron.textContent = collapsed ? '▴' : '▾'; staticW = -1; });

    var offChange = CS.onChange(function (mode) {
      pill.className = 'tl-pill ' + mode; pill.textContent = mode.toUpperCase();
      playBtn.textContent = (mode === 'live') ? '❚❚' : '▶';
    });

    return {
      update: function (frame) { clock.textContent = frame.sim.hms; render(frame); },
      setTool: function (id) { selTool = id; toolSel.value = id; staticW = -1; },
      destroy: function () {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        offChange();
        container.removeChild(root);
      }
    };
  };
})(window.BAS);
