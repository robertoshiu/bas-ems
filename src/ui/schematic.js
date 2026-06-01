/* bas-ems — SVG Schematic utility module
 * Reusable animated pipe/node schematic renderer for cooling, UPW, gas schematics.
 * Classic IIFE script -> window.BAS.ui.Schematic
 *
 * Usage:
 *   var sch = BAS.ui.Schematic(container, {
 *     nodes: [{id:'A', label:'Chiller', x:50, y:50}, {id:'B', label:'Tower', x:200, y:50}],
 *     pipes: [{from:'A', to:'B', channel:'chwRT'}],
 *     width:  320,   // optional SVG viewBox width (default 300)
 *     height: 180    // optional SVG viewBox height (default 160)
 *   });
 *   sch.update(frame);  // call each render tick
 *
 * Throttles SVG attribute writes to every 4th frame (frame.tick % 4 === 0).
 * Zero per-frame heap allocations in update() — all refs captured in closure.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';
  var U = BAS.ui;

  // Node box half-dimensions
  var NODE_W = 48, NODE_H = 22;
  // Dash pattern for animated flow lines: gap length, total period
  var DASH_LEN = 8, DASH_GAP = 6, DASH_PERIOD = DASH_LEN + DASH_GAP;
  // Maximum dashoffset excursion (one full period)
  var DASH_MAX = DASH_PERIOD;
  // Scale: map channel value to animation speed (offset per frame)
  // A value of ~10000 kW/CFM/GPM moves 1 full dash period per frame; scale accordingly.
  var FLOW_SCALE = DASH_PERIOD / 10000;

  /**
   * U.Schematic(container, opts) — create and return a live schematic widget.
   *
   * @param {Element} container  DOM element to append the <svg> into.
   * @param {Object}  opts
   *   .nodes  Array of {id, label, x, y} — equipment boxes
   *   .pipes  Array of {from, to, channel} — connections driven by frame.load[channel]
   *   .width  SVG viewBox width  (default 300)
   *   .height SVG viewBox height (default 160)
   * @returns {{ update(frame) }}
   */
  U.Schematic = function (container, opts) {
    opts = opts || {};
    var nodes = opts.nodes || [];
    var pipes = opts.pipes || [];
    var vw = opts.width  || 300;
    var vh = opts.height || 160;

    // ---- Build SVG root ------------------------------------------------
    var root = U.svg('svg', {
      viewBox: '0 0 ' + vw + ' ' + vh,
      'class': 'schematic'
    });

    // ---- Build pipe background layer (static path, .pipe class) --------
    // ---- Build flow overlay layer (animated dash, .flow class) ----------
    // We store refs: pipeRefs[i] -> { bg, flow, channel, dashOffset }
    // dashOffset is a closure-scope scalar per pipe (no per-frame allocation).
    var pipeCount = pipes.length;
    var pipeRefs = [];   // pre-allocated array, filled once

    var i, p, nx1, ny1, nx2, ny2, n1, n2, dx, dy, pathD;

    // Helper: find a node by id (runs only at init time)
    function findNode(id) {
      for (var j = 0; j < nodes.length; j++) if (nodes[j].id === id) return nodes[j];
      return null;
    }

    for (i = 0; i < pipeCount; i++) {
      p = pipes[i];
      n1 = findNode(p.from);
      n2 = findNode(p.to);
      if (!n1 || !n2) {
        pipeRefs.push(null);
        continue;
      }
      nx1 = n1.x + NODE_W / 2;
      ny1 = n1.y + NODE_H / 2;
      nx2 = n2.x - NODE_W / 2;
      ny2 = n2.y + NODE_H / 2;
      // If nodes are vertically aligned, connect centre-to-centre
      if (Math.abs(nx2 - nx1) < 4) {
        nx1 = n1.x + NODE_W / 2;
        nx2 = n2.x + NODE_W / 2;
        ny1 = n1.y + NODE_H;
        ny2 = n2.y;
      }
      pathD = 'M ' + nx1 + ' ' + ny1 + ' L ' + nx2 + ' ' + ny2;

      // Background (thicker, muted colour)
      var bg = U.svg('path', {
        d: pathD,
        'class': 'pipe'
      });
      root.appendChild(bg);

      // Animated flow overlay
      var flow = U.svg('path', {
        d: pathD,
        'class': 'flow',
        'stroke-dasharray': DASH_LEN + ' ' + DASH_GAP,
        'stroke-dashoffset': '0'
      });
      root.appendChild(flow);

      // Direction arrow marker using a small polyline at the midpoint
      var mx = (nx1 + nx2) / 2, my = (ny1 + ny2) / 2;
      dx = nx2 - nx1; dy = ny2 - ny1;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len * 5, uy = dy / len * 5;
      var arrowD = 'M ' + (mx - ux - uy * 0.5).toFixed(1) + ' ' + (my - uy + ux * 0.5).toFixed(1) +
                   ' L ' + mx.toFixed(1) + ' ' + my.toFixed(1) +
                   ' L ' + (mx - ux + uy * 0.5).toFixed(1) + ' ' + (my - uy - ux * 0.5).toFixed(1);
      var arrow = U.svg('path', {
        d: arrowD,
        'class': 'flow',
        'stroke-dasharray': 'none',
        'fill': 'none'
      });
      root.appendChild(arrow);

      pipeRefs.push({ bg: bg, flow: flow, channel: p.channel, dashOffset: 0 });
    }

    // ---- Build node boxes -----------------------------------------------
    // nodeRefs[i] -> { rect, labelEl, valEl, id }
    var nodeCount = nodes.length;
    var nodeRefs = [];

    for (i = 0; i < nodeCount; i++) {
      var nd = nodes[i];
      var rect = U.svg('rect', {
        x: nd.x, y: nd.y, width: NODE_W, height: NODE_H, rx: 3,
        'class': 'node'
      });
      root.appendChild(rect);

      var labelEl = U.svg('text', {
        x: nd.x + NODE_W / 2,
        y: nd.y + NODE_H / 2 - 3,
        'text-anchor': 'middle',
        'font-size': '7'
      });
      labelEl.textContent = nd.label || nd.id;
      root.appendChild(labelEl);

      var valEl = U.svg('text', {
        x: nd.x + NODE_W / 2,
        y: nd.y + NODE_H / 2 + 8,
        'text-anchor': 'middle',
        'font-size': '8',
        'class': 'val'
      });
      valEl.textContent = '';
      root.appendChild(valEl);

      nodeRefs.push({ rect: rect, label: labelEl, val: valEl, id: nd.id });
    }

    container.appendChild(root);

    // ---- Closure-scope reuse vars (zero per-frame alloc) ----------------
    var fc = 0;          // frame counter for throttle
    var chVal = 0;       // channel value scratch
    var ref = null;      // pipe ref scratch
    var nRef = null;     // node ref scratch

    // ---- update(frame) --------------------------------------------------
    function update(frame) {
      fc = frame.tick;
      if (fc % 4 !== 0) return;   // throttle: only update every 4th tick

      // Update flow animation for each pipe
      for (var pi = 0; pi < pipeCount; pi++) {
        ref = pipeRefs[pi];
        if (!ref) continue;
        chVal = (frame.load && frame.load[ref.channel]) ? frame.load[ref.channel] : 0;
        // Accumulate dashoffset proportional to channel value; wrap within period
        ref.dashOffset = ref.dashOffset - chVal * FLOW_SCALE;
        if (ref.dashOffset < -DASH_MAX * 200) ref.dashOffset = 0; // prevent overflow
        ref.flow.setAttribute('stroke-dashoffset', ref.dashOffset.toFixed(2));
      }

      // Update node value labels — show first pipe channel value for the node's outgoing pipe
      for (var ni = 0; ni < nodeCount; ni++) {
        nRef = nodeRefs[ni];
        // Find channel for this node (first pipe where from === id)
        chVal = 0;
        for (var pj = 0; pj < pipeCount; pj++) {
          if (pipeRefs[pj] && pipes[pj].from === nRef.id) {
            chVal = (frame.load && frame.load[pipeRefs[pj].channel]) ? frame.load[pipeRefs[pj].channel] : 0;
            break;
          }
        }
        if (chVal !== 0) {
          nRef.val.textContent = chVal >= 1000
            ? (chVal / 1000).toFixed(1) + 'k'
            : Math.round(chVal) + '';
        }
      }
    }

    return { update: update, root: root };
  };

})(window.BAS);
