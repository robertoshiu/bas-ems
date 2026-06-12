/* bas-ems — UI utilities, module registry, formatters, small helpers
 * Classic script -> window.BAS.ui (+ BAS.modules registry)
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';

  // ---- module registry --------------------------------------------------
  BAS.modules = [];
  BAS.registerModule = function (def) { BAS.modules.push(def); return def; };
  BAS.moduleById = function (id) {
    for (var i = 0; i < BAS.modules.length; i++) if (BAS.modules[i].id === id) return BAS.modules[i];
    return null;
  };

  // ---- DOM helpers ------------------------------------------------------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function panel(title, opts) {
    opts = opts || {};
    var p = el('div', 'panel' + (opts.cls ? ' ' + opts.cls : ''));
    var h = el('div', 'panel-h');
    h.appendChild(el('span', 't', title));
    if (opts.meta) { var m = el('span', 'meta'); m.id = opts.metaId || ''; m.textContent = opts.meta; h.appendChild(m); }
    if (opts.pill) h.appendChild(el('span', 'pill', opts.pill));
    var b = el('div', 'panel-b' + (opts.bodyCls ? ' ' + opts.bodyCls : ''));
    p.appendChild(h); p.appendChild(b);
    p._body = b; p._head = h;
    return p;
  }

  // ---- formatters -------------------------------------------------------
  function group(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var fmt = {
    n: function (v, d) { d = d == null ? 1 : d; return Number(v).toFixed(d); },
    int: function (v) { return group(Math.round(v)); },
    kw: function (v) { return v >= 1000 ? (v / 1000).toFixed(2) + ' MW' : Math.round(v) + ' kW'; },
    mw: function (v, d) { return Number(v).toFixed(d == null ? 1 : d); },
    pct: function (v, d) { return Number(v).toFixed(d == null ? 1 : d) + '%'; },
    money: function (v) { return '$' + group(Math.round(v)); },
    delta: function (v, d, unit) {
      d = d == null ? 1 : d; var s = v >= 0 ? '+' : '';
      return s + Number(v).toFixed(d) + (unit || '');
    }
  };

  // ---- color / threshold helpers ---------------------------------------
  // status: returns 'good' | 'warn' | 'bad' based on value vs bands.
  function band(v, warnAt, badAt, invert) {
    if (invert) { if (v <= badAt) return 'bad'; if (v <= warnAt) return 'warn'; return 'good'; }
    if (v >= badAt) return 'bad'; if (v >= warnAt) return 'warn'; return 'good';
  }
  // deterministic small jitter for analog readouts (so values shimmer believably)
  function jitter(channel, tick, amp) { return (BAS.prng.rand(channel, tick) - 0.5) * 2 * amp; }
  // smooth (interpolated) variant: pass a continuous tick (frame.tickF) for a
  // flowing trace instead of the per-tick stair-step jitter() produces.
  function wobble(channel, tickF, amp) {
    var i = Math.floor(tickF), f = tickF - i;
    var a = BAS.prng.rand(channel, i) - 0.5, b = BAS.prng.rand(channel, i + 1) - 0.5;
    var s = f * f * (3 - 2 * f); // smoothstep
    return (a * (1 - s) + b * s) * 2 * amp;
  }

  // ---- DPR-aware canvas sizing -----------------------------------------
  function fitCanvas(canvas, cssH) {
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var w = canvas.clientWidth || canvas.parentNode.clientWidth || 240;
    var h = cssH || canvas.clientHeight || 60;
    if (canvas._w === w && canvas._h === h && canvas._dpr === dpr) return canvas.getContext('2d');
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    canvas._w = w; canvas._h = h; canvas._dpr = dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // ---- SVG helpers ------------------------------------------------------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---- E10 badge --------------------------------------------------------
  function stateBadge(state) {
    var cls = 'st-' + state.replace(/\s+/g, '');
    var b = el('span', 'badge ' + cls);
    b.appendChild(el('i', 'b-dot'));
    b.appendChild(document.createTextNode(state));
    return b;
  }
  var CSS_VAR = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };

  // ---- nav icons (inline svg path strings) ------------------------------
  var ICONS = {
    cleanroom: '<path d="M2 13h12M3 13V5l5-3 5 3v8M6 13v-3h4v3" />',
    cooling: '<path d="M8 2v12M3 5l10 6M13 5L3 11M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2" />',
    water: '<path d="M8 2s4 4.5 4 8a4 4 0 11-8 0c0-3.5 4-8 4-8z" />',
    gas: '<path d="M6 14h4M7 14V8a1 1 0 011-1 1 1 0 011 1v6M5.5 7.5l5-3M8 2v2" />',
    energy: '<path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" />',
    leaf: '<path d="M13 3C7 3 4 6 4 11c0 0 1-4 9-5 0 0-6 2-7 7 5 0 9-3 9-10z" />',
    flow: '<path d="M2 8h9m-3-3l3 3-3 3M13 4v8" />',
    db: '<path d="M8 2c3 0 5 1 5 2v8c0 1-2 2-5 2s-5-1-5-2V4c0-1 2-2 5-2zM3 7c0 1 2 2 5 2s5-1 5-2" />',
    grid: '<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" />',
    hub: '<circle cx="8" cy="8" r="6.2" /><circle cx="8" cy="8" r="2" /><path d="M8 8l4.4-4.4M8 8l-4.4 4.4" /><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2" />'
  };
  function icon(name) {
    return '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.grid) + '</svg>';
  }

  BAS.ui = {
    el: el, clear: clear, panel: panel, fmt: fmt, band: band, jitter: jitter, wobble: wobble,
    fitCanvas: fitCanvas, svg: svg, SVGNS: SVGNS, stateBadge: stateBadge, cssVar: CSS_VAR,
    icon: icon, ICONS: ICONS, group: group
  };
})(window.BAS);
