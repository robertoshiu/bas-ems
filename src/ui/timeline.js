/* bas-ems — Timeline Cockpit (canvas multi-lane time machine)
 * Classic script -> window.BAS.ui.TimelineCockpit(container) -> { update(frame), setTool(id), destroy() }
 * Slice 1: demand lane + playhead + transport + drag-scrub. Lanes 2-4 added in Task 6.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el, CS = null;

  BAS.ui.TimelineCockpit = function (container) {
    CS = BAS.clockSource;
    var data = U.timelineData.get();
    var collapsed = false, hoverX = -1;

    // ---- DOM: transport row + canvas ----
    var root = el('div', 'cockpit-inner');
    var bar = el('div', 'tl-transport');
    var playBtn = el('button', 'tl-btn', '❚❚');          // shows pause glyph while live
    var clock = el('span', 'tl-clock', '00:00:00');
    var pill = el('span', 'tl-pill live', 'LIVE');
    var spacer = el('span', 'tl-spacer');
    var chevron = el('button', 'tl-btn', '▾');
    bar.appendChild(playBtn); bar.appendChild(clock); bar.appendChild(pill);
    bar.appendChild(spacer); bar.appendChild(chevron);
    var canvas = el('canvas', 'tl-canvas');
    root.appendChild(bar); root.appendChild(canvas);
    container.appendChild(root);

    // ---- cached static layer (lanes drawn once) ----
    var staticC = document.createElement('canvas'), staticW = 0, staticH = 0, dpr = 1;
    function laneRect() { return { x: 0, y: 0, w: canvas._w, h: canvas._h }; }
    function xToT(px) { return Math.max(0, Math.min(data.P - 0.001, (px / canvas._w) * data.P)); }
    function tToX(t) { return (t / data.P) * canvas._w; }

    function rebuildStatic() {
      var ctx = U.fitCanvas(canvas, collapsed ? 24 : 92);   // sets canvas._w/_h + DPR transform
      var w = canvas._w, h = canvas._h; dpr = canvas._dpr;
      staticC.width = canvas.width; staticC.height = canvas.height;
      var s = staticC.getContext('2d'); s.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.clearRect(0, 0, w, h);
      // demand area chart across the whole loop
      var range = (data.peakMW - data.minMW) || 1, N = data.demand.length;
      s.beginPath();
      for (var i = 0; i < N; i++) {
        var x = i / (N - 1) * w, y = h - 4 - ((data.demand[i] - data.minMW) / range) * (h - 10);
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
      s.lineTo(w, h); s.lineTo(0, h); s.closePath();
      s.fillStyle = U.hexA(U.cssVar('--accent'), .14); s.fill();
      s.beginPath();
      for (var j = 0; j < N; j++) { var x2 = j / (N - 1) * w, y2 = h - 4 - ((data.demand[j] - data.minMW) / range) * (h - 10); if (j === 0) s.moveTo(x2, y2); else s.lineTo(x2, y2); }
      s.strokeStyle = U.cssVar('--accent'); s.lineWidth = 1; s.stroke();
      staticW = w; staticH = h;
    }

    function render(frame) {
      if (canvas._w !== staticW || canvas._h !== staticH) rebuildStatic();
      var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var w = canvas._w, h = canvas._h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(staticC, 0, 0, w, h);
      // playhead
      var px = tToX(frame.t);
      ctx.strokeStyle = CS.isLive() ? U.cssVar('--accent') : U.cssVar('--warn');
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      // hover crosshair
      if (hoverX >= 0) { ctx.strokeStyle = 'rgba(180,200,230,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hoverX, 0); ctx.lineTo(hoverX, h); ctx.stroke(); }
    }

    // ---- input ----
    var dragging = false;
    function px(e) { var r = canvas.getBoundingClientRect(); return e.clientX - r.left; }
    canvas.addEventListener('mousedown', function (e) { dragging = true; CS.scrubTo(xToT(px(e))); });
    window.addEventListener('mousemove', function (e) { if (dragging) CS.scrubTo(xToT(px(e))); });
    window.addEventListener('mouseup', function () { if (dragging) { dragging = false; CS.resume(); } });
    canvas.addEventListener('mousemove', function (e) { hoverX = px(e); });
    canvas.addEventListener('mouseleave', function () { hoverX = -1; });
    playBtn.addEventListener('click', function () { CS.togglePlay(); });
    chevron.addEventListener('click', function () { collapsed = !collapsed; chevron.textContent = collapsed ? '▴' : '▾'; staticW = -1; });

    CS.onChange(function (mode) {
      pill.className = 'tl-pill ' + mode; pill.textContent = mode.toUpperCase();
      playBtn.textContent = (mode === 'live') ? '❚❚' : '▶';
    });

    return {
      update: function (frame) { clock.textContent = frame.sim.hms; render(frame); },
      setTool: function () {},     // Task 6
      destroy: function () { container.removeChild(root); }
    };
  };
})(window.BAS);
