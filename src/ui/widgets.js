/* bas-ems — widgets: KPI, Sparkline (ring buffer), Gauge (SVG arc), Table, BarList
 * Classic script -> window.BAS.ui.*
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui, el = U.el;

  // ---- KPI tile ---------------------------------------------------------
  U.kpi = function (opts) {
    opts = opts || {};
    var node = el('div', 'kpi' + (opts.accent ? ' accent' : ''));
    var lab = el('div', 'label', opts.label || '');
    var val = el('div', 'val');
    var num = el('span'); val.appendChild(num);
    var u = el('span', 'u', opts.unit || ''); val.appendChild(u);
    var delta = el('div', 'delta flat', opts.delta || '');
    node.appendChild(lab); node.appendChild(val); if (opts.showDelta !== false) node.appendChild(delta);
    return {
      node: node,
      set: function (v, o) {
        o = o || {};
        num.textContent = v;
        if (o.unit != null) u.textContent = o.unit;
        if (o.delta != null) { delta.textContent = o.delta; delta.className = 'delta ' + (o.dir || 'flat'); }
        if (o.state) { val.style.color = U.cssVar('--' + (o.state === 'good' ? 'good' : o.state === 'bad' ? 'bad' : o.state === 'warn' ? 'warn' : 'text')); }
      }
    };
  };

  // ---- Sparkline (canvas, ring buffer, zero per-frame alloc) ------------
  U.Sparkline = function (canvas, opts) {
    opts = opts || {};
    var n = opts.n || 120;
    var buf = new Float32Array(n);
    var head = 0, count = 0;
    var color = opts.color || U.cssVar('--accent');
    var fill = opts.fill !== false;
    var fixedMin = opts.min, fixedMax = opts.max;
    var height = opts.height || 44;
    var slow = opts.slow || 3;   // record 1 of every `slow` pushes -> trend scrolls ~3x slower
    var pushFc = 0;
    return {
      push: function (v) { pushFc++; if (pushFc % slow !== 0) return; buf[head] = v; head = (head + 1) % n; if (count < n) count++; },
      render: function () {
        var ctx = U.fitCanvas(canvas, height);
        var w = canvas._w, h = canvas._h;
        ctx.clearRect(0, 0, w, h);
        if (count < 2) return;
        var mn = fixedMin, mx = fixedMax;
        if (mn == null || mx == null) {
          mn = Infinity; mx = -Infinity;
          for (var i = 0; i < count; i++) { var vv = buf[(head - count + i + n) % n]; if (vv < mn) mn = vv; if (vv > mx) mx = vv; }
          var pad = (mx - mn) * 0.12 || 1; mn -= pad; mx += pad;
        }
        var range = (mx - mn) || 1;
        var step = w / (n - 1);
        function xy(i) {
          var v = buf[(head - count + i + n) % n];
          var x = (n - count + i) * step;
          var y = h - 4 - ((v - mn) / range) * (h - 8);
          return [x, y];
        }
        ctx.beginPath();
        for (var k = 0; k < count; k++) { var p = xy(k); if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
        if (fill) {
          var last = xy(count - 1), first = xy(0);
          ctx.lineTo(last[0], h); ctx.lineTo(first[0], h); ctx.closePath();
          var g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, hexA(color, .28)); g.addColorStop(1, hexA(color, 0));
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.beginPath();
        for (var j = 0; j < count; j++) { var q = xy(j); if (j === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
        var lp = xy(count - 1);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(lp[0], lp[1], 2.2, 0, 6.29); ctx.fill();
      }
    };
  };
  function hexA(hex, a) {
    hex = (hex || '#25e0cf').trim();
    if (hex[0] !== '#' || hex.length < 7) return 'rgba(37,224,207,' + a + ')';
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  U.hexA = hexA;

  // ---- Gauge (SVG 270deg arc) ------------------------------------------
  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arcPath(cx, cy, r, a0, a1) {
    var s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a0);
    var large = (a1 - a0) <= 180 ? 0 : 1;
    return 'M ' + s[0].toFixed(2) + ' ' + s[1].toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 0 ' + e[0].toFixed(2) + ' ' + e[1].toFixed(2);
  }
  U.gauge = function (opts) {
    opts = opts || {};
    var min = opts.min || 0, max = opts.max == null ? 100 : opts.max;
    var A0 = -135, A1 = 135, span = A1 - A0;
    var size = opts.size || 120;
    var node = el('div', 'gauge');
    node.style.width = size + 'px';
    var s = U.svg('svg', { viewBox: '0 0 100 100', width: size, height: size });
    // role="meter" is required for aria-value* to be exposed to assistive tech;
    // give it an accessible name from the gauge's own label/unit.
    s.setAttribute('role', 'meter');
    s.setAttribute('aria-label', (opts.label || 'gauge') + (opts.unit ? ' (' + opts.unit + ')' : ''));
    s.setAttribute('aria-valuemin', String(min));
    s.setAttribute('aria-valuemax', String(max));
    s.setAttribute('aria-valuenow', String(min));
    s.appendChild(U.svg('path', { d: arcPath(50, 50, 40, A0, A1), fill: 'none', stroke: U.cssVar('--bg-3'), 'stroke-width': 9, 'stroke-linecap': 'round' }));
    var valArc = U.svg('path', { d: arcPath(50, 50, 40, A0, A0 + 0.1), fill: 'none', stroke: opts.color || U.cssVar('--accent'), 'stroke-width': 9, 'stroke-linecap': 'round' });
    s.appendChild(valArc);
    var t1 = U.svg('text', { x: 50, y: 52, 'text-anchor': 'middle', fill: U.cssVar('--text'), 'font-size': 17, 'font-family': U.cssVar('--mono') });
    var t2 = U.svg('text', { x: 50, y: 65, 'text-anchor': 'middle', fill: U.cssVar('--text-mut'), 'font-size': 8 });
    t2.textContent = opts.unit || '';
    var t3 = U.svg('text', { x: 50, y: 86, 'text-anchor': 'middle', fill: U.cssVar('--text-mut'), 'font-size': 7.5 });
    t3.textContent = (opts.label || '').toUpperCase();
    s.appendChild(t1); s.appendChild(t2); s.appendChild(t3);
    node.appendChild(s);
    var lastNow = min;
    return {
      node: node,
      set: function (v, label) {
        var f = Math.max(0, Math.min(1, (v - min) / (max - min)));
        valArc.setAttribute('d', arcPath(50, 50, 40, A0, A0 + Math.max(0.1, f * span)));
        t1.textContent = label != null ? label : (opts.fmt ? opts.fmt(v) : Math.round(v));
        if (opts.thresholds) {
          var st = U.band(v, opts.thresholds.warn, opts.thresholds.bad, opts.thresholds.invert);
          valArc.setAttribute('stroke', U.cssVar('--' + (st === 'good' ? 'good' : st)));
        }
        var rounded = Math.round(Math.max(min, Math.min(max, v)));  // keep min <= valuenow <= max
        if (rounded !== lastNow) { lastNow = rounded; s.setAttribute('aria-valuenow', String(rounded)); }
      }
    };
  };

  // ---- Table ------------------------------------------------------------
  U.table = function (columns, opts) {
    opts = opts || {};
    var wrap = el('div'); wrap.style.overflow = 'auto'; if (opts.maxH) wrap.style.maxHeight = opts.maxH;
    var t = el('table', 'tbl');
    var thead = el('thead'); var htr = el('tr');
    columns.forEach(function (c) { var th = el('th', c.thCls || ''); th.textContent = c.label; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = el('tbody'); t.appendChild(tb); wrap.appendChild(t);
    return {
      node: wrap,
      set: function (rows) {
        var html = '';
        for (var i = 0; i < rows.length; i++) {
          html += '<tr>';
          for (var c = 0; c < columns.length; c++) {
            var col = columns[c]; var cell = col.render ? col.render(rows[i]) : rows[i][col.key];
            html += '<td class="' + (col.tdCls || '') + '">' + (cell == null ? '' : cell) + '</td>';
          }
          html += '</tr>';
        }
        tb.innerHTML = html;
      }
    };
  };

  // ---- BarList (sub-metered loads etc.) --------------------------------
  U.barList = function (items) {
    var node = el('div', 'barlist');
    var rows = items.map(function (it) {
      var r = el('div'); r.style.margin = '0 0 9px';
      var top = el('div'); top.style.display = 'flex'; top.style.justifyContent = 'space-between'; top.style.fontSize = 'var(--fs-2)';
      var k = el('span', 'dim', it.label); var v = el('span', 'mono'); v.textContent = '';
      top.appendChild(k); top.appendChild(v);
      var m = el('div', 'meter'); var fillEl = el('i'); m.appendChild(fillEl);
      r.appendChild(top); r.appendChild(m); node.appendChild(r);
      return { v: v, fill: fillEl, meter: m };
    });
    return {
      node: node,
      set: function (vals) {
        for (var i = 0; i < rows.length && i < vals.length; i++) {
          rows[i].v.textContent = vals[i].text;
          rows[i].fill.style.width = Math.max(0, Math.min(100, vals[i].pct)) + '%';
          if (vals[i].cls) rows[i].meter.className = 'meter ' + vals[i].cls;
        }
      }
    };
  };

  // ---- shared layout helpers (canonical; modules shim to these) ---------
  U.statLine = function (label, value) {
    var r = el('div', 'stat-line');
    r.appendChild(el('span', 'k', label));
    var v = el('span', 'v'); v.textContent = (value == null ? '—' : value);
    r.appendChild(v); r._val = v;
    return r;
  };
  U.statRow = function (parent, label) {
    var r = U.statLine(label, null); parent.appendChild(r); return r._val;
  };
  U.kpiPanel = function (title, kpi, cls) {
    var p = U.panel(title, { cls: cls || 'col-3' });
    p._body.appendChild(kpi.node);
    return p;
  };

  U.arcPath = arcPath; U.polar = polar;
})(window.BAS);
