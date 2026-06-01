/* bas-ems — SVG Schematic utility module
 * Reusable animated pipe/node schematic renderer for cooling, UPW, gas schematics.
 * Classic IIFE script -> window.BAS.ui.Schematic
 *
 * Usage:
 *   var sch = BAS.ui.Schematic(container, {
 *     nodes: [{id:'A', label:'Chiller', x:50, y:50, channel:'chwRT'}, {id:'B', label:'Tower', x:200, y:50}],
 *       // node.channel: string → live value from frame.load[channel]; false → no value (identity box);
 *       //               omitted/null → falls back to the node's first outgoing pipe channel
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

  // Node box dimensions
  var NODE_W = 54, NODE_H = 22;
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
   * @returns {{ update(frame), root: SVGSVGElement }}
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
      // Connect boxes edge-to-edge in the dominant direction so the pipe spans the
      // full visible gap (no overlap into the box, no inset before the target).
      if (Math.abs(n2.x - n1.x) < 4) {
        // vertical column: bottom edge of upper box -> top edge of lower box
        nx1 = n1.x + NODE_W / 2; nx2 = n2.x + NODE_W / 2;
        if (n2.y >= n1.y) { ny1 = n1.y + NODE_H; ny2 = n2.y; }
        else              { ny1 = n1.y;          ny2 = n2.y + NODE_H; }
      } else if (n2.x > n1.x) {
        // left -> right: source right edge -> target left edge
        nx1 = n1.x + NODE_W; ny1 = n1.y + NODE_H / 2;
        nx2 = n2.x;          ny2 = n2.y + NODE_H / 2;
      } else {
        // right -> left: source left edge -> target right edge
        nx1 = n1.x;          ny1 = n1.y + NODE_H / 2;
        nx2 = n2.x + NODE_W; ny2 = n2.y + NODE_H / 2;
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

      pipeRefs.push({ bg: bg, flow: flow, channel: p.channel, dashOffset: 0, lastDashInt: 0 });
    }

    // ---- Build node boxes -----------------------------------------------
    // nodeRefs[i] -> { rect, labelEl, valEl, id, channel, lastVal }
    // channel: explicit per-node channel (optional); lastVal: cached last numeric value
    // for the no-alloc gate — only write textContent when value changes.
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
        'font-size': '6.5'
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

      // lastVal initialised to NaN so first real value always triggers a write.
      // channel: a string selects frame.load[channel]; `false` suppresses the value
      // entirely (identity-only box); null/undefined falls back to the first outgoing pipe.
      nodeRefs.push({ rect: rect, label: labelEl, val: valEl, id: nd.id,
                      channel: (typeof nd.channel === 'string' ? nd.channel : null),
                      noVal: nd.channel === false, lastVal: NaN });
    }

    container.appendChild(root);

    // ---- Closure-scope reuse vars (zero per-frame alloc) ----------------
    var fc = 0;          // frame counter for throttle
    var chVal = 0;       // channel value scratch
    var ref = null;      // pipe ref scratch
    var nRef = null;     // node ref scratch
    var fmtVal = '';     // formatted string scratch (only written when value changes)
    var newDashInt = 0;  // scratch for integer dashoffset comparison

    // ---- update(frame) --------------------------------------------------
    function update(frame) {
      fc = frame.tick;
      if (fc % 4 !== 0) return;   // throttle: only update every 4th tick

      // Update flow animation for each pipe
      for (var pi = 0; pi < pipeCount; pi++) {
        ref = pipeRefs[pi];
        if (!ref) continue;
        chVal = (frame.load && frame.load[ref.channel] != null) ? frame.load[ref.channel] : 0;
        // Accumulate dashoffset proportional to channel value; seam-free modulo wrap
        ref.dashOffset = ref.dashOffset - chVal * FLOW_SCALE;
        if (ref.dashOffset < -DASH_PERIOD) ref.dashOffset += DASH_PERIOD;
        // Change-gate: only call toFixed+setAttribute when integer dashoffset changes
        newDashInt = ref.dashOffset | 0;
        if (newDashInt !== ref.lastDashInt) {
          ref.lastDashInt = newDashInt;
          ref.flow.setAttribute('stroke-dashoffset', ref.dashOffset.toFixed(2));
        }
      }

      // Update node value labels.
      // Channel priority: (1) node.channel === false → no value (identity box, skip);
      // (2) explicit node.channel string; (3) first outgoing pipe channel.
      // Change-gate: only write textContent (and format the string) when the raw value
      // differs from the cached lastVal — eliminates per-frame string allocation in steady state.
      for (var ni = 0; ni < nodeCount; ni++) {
        nRef = nodeRefs[ni];
        if (nRef.noVal) continue;   // identity-only node: leave the value label blank
        chVal = 0;
        if (nRef.channel) {
          // Fix 2: per-node explicit channel — supports terminal/sink nodes with no outgoing pipe
          chVal = (frame.load && frame.load[nRef.channel] != null) ? frame.load[nRef.channel] : 0;
        } else {
          // Fallback: first pipe where this node is the source
          for (var pj = 0; pj < pipeCount; pj++) {
            if (pipeRefs[pj] && pipes[pj].from === nRef.id) {
              chVal = (frame.load && frame.load[pipeRefs[pj].channel] != null) ? frame.load[pipeRefs[pj].channel] : 0;
              break;
            }
          }
        }
        // Fix 1: change-gate — only format+write when value differs from cached last
        if (chVal !== nRef.lastVal) {
          nRef.lastVal = chVal;
          if (chVal !== 0) {
            fmtVal = chVal >= 1000
              ? (chVal / 1000).toFixed(1) + 'k'
              : Math.round(chVal) + '';
          } else {
            fmtVal = '';
          }
          nRef.val.textContent = fmtVal;
        }
      }
    }

    return { update: update, root: root };
  };

})(window.BAS);
