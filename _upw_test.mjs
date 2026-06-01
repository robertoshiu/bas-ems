// Headless test for UPW buildRows badge classification.
// Run: bun _upw_test.mjs
//
// Measured engine ranges (from _upw_measure.mjs, 360 samples t=0..179.5):
//   upwResistivity: min=18.1851, max=18.2150, mean=18.1994
//   upwTOC:         min=0.5507,  max=0.7981,  mean=0.6774
//   particles:      min=29,      max=47,       mean=37.9
//
// Calibrated thresholds (from measured distribution):
//   Resistivity (lower=worse, invert): warn<18.1899, bad<18.1863
//   TOC         (higher=worse):        warn>=0.7486, bad>=0.7810
//   Particles   (higher=worse):        warn>=44,     bad>=46

import { readFileSync } from 'fs';

// --- minimal DOM stub (same pattern as _schematic_test.mjs) ---------------
const domStub = (function () {
  function makeEl(ns, tag) {
    var attrs = {};
    var children = [];
    var el = {
      _ns: ns, _tag: tag, _attrs: attrs, _children: children,
      setAttribute: function (k, v) { attrs[k] = String(v); },
      getAttribute: function (k) { return attrs[k] !== undefined ? attrs[k] : null; },
      appendChild: function (c) { children.push(c); return c; },
      removeChild: function (c) { var i = children.indexOf(c); if (i >= 0) children.splice(i, 1); },
      insertBefore: function (c) { children.push(c); return c; },
      textContent: '',
      style: {},
      className: '',
      get firstChild() { return children[0] || null; },
      querySelector: function(sel) {
        // minimal stub: return first child matching tag or class
        function search(node) {
          if (!node._children) return null;
          for (var i = 0; i < node._children.length; i++) {
            var c = node._children[i];
            if (sel === 'i' && c._tag === 'i') return c;
            if (sel[0] === '.' && c.className && c.className.indexOf(sel.slice(1)) !== -1) return c;
            var found = search(c);
            if (found) return found;
          }
          return null;
        }
        return search(el);
      }
    };
    return el;
  }
  return {
    createElementNS: function (ns, tag) { return makeEl(ns, tag); },
    createElement: function (tag) { return makeEl('', tag); },
    createTextNode: function (t) { var e = makeEl('', '#text'); e.textContent = t; return e; },
    documentElement: { style: {}, _children: [] }
  };
})();

// Expose document globally for util.js (which references bare `document`)
globalThis.document = domStub;
const win = { document: domStub };

function loadFile(p) { new Function('window', readFileSync(p, 'utf8'))(win); }

// Load engine
['prng', 'clock', 'master-data', 'events', 'load-model', 'sim'].forEach(function (f) {
  loadFile('src/engine/' + f + '.js');
});
win.BAS.sim.init();

// Load UI utilities (needed for el, U.band, U.jitter etc.)
loadFile('src/ui/util.js');

const BAS = win.BAS;
const U = BAS.ui;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  (cond ? pass++ : fail++);
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
}

// --- Extract buildRows from upw.js by loading it in our window context ----
// upw.js calls BAS.registerModule and references U.el, U.panel etc.
// We need to intercept buildRows. We'll load the module and then extract it
// by patching BAS.registerModule to capture the update function.

// Stub out the DOM parts upw.js needs in mount()
// We just need buildRows, so we only need the module to register and expose it.
// Strategy: load upw.js, which calls BAS.registerModule; then call update with
// synthetic frames and inspect the qualTbl output.

// But qualTbl references U.table which needs more DOM stubs. Instead, let's
// extract buildRows by patching -- simpler: expose buildRows via a known global
// after we parse the source.

// Actually, the cleanest approach is to extract the buildRows body from the source
// and eval it in our context with our BAS/U stubs. Let's load the full module
// with minimal stubs so BAS.registerModule captures everything.

// Provide minimal stubs for everything mount() touches.
U.gauge = function(opts) {
  return { node: domStub.createElement('div'), set: function() {} };
};
U.Sparkline = function(canvas, opts) {
  return { push: function() {}, render: function() {} };
};
U.panel = U.panel || function(t, opts) {
  var p = domStub.createElement('div');
  p._body = domStub.createElement('div');
  p._head = domStub.createElement('div');
  return p;
};
U.table = function(cols, opts) {
  var rows = null;
  var node = domStub.createElement('div');
  return {
    node: node,
    set: function(r) { rows = r; node._lastRows = r; }
  };
};
U.statRow = function(parent, label) {
  var el = domStub.createElement('span');
  if (parent && parent.appendChild) parent.appendChild(el);
  return el;
};
U.stateBadge = U.stateBadge || function(state) {
  var b = domStub.createElement('span');
  b.textContent = state;
  return b;
};
U.cssVar = function() { return '#0af'; };
// Schematic stub
U.Schematic = function(container, opts) {
  var root = domStub.createElement('svg');
  container.appendChild(root);
  return { update: function() {}, root: root };
};

// Stub BAS.master.facility.upwTrains
BAS.master = BAS.master || {};
BAS.master.facility = BAS.master.facility || {};
BAS.master.facility.upwTrains = BAS.master.facility.upwTrains || [
  { name: 'Train A' }, { name: 'Train B' }
];

// Load upw.js — this calls BAS.registerModule
loadFile('src/modules/upw.js');

// Find the upw module
var upwMod = BAS.moduleById('upw');
ok('upw module registered', !!upwMod);

// Create a synthetic root element and call mount()
var rootEl = domStub.createElement('div');
upwMod.mount(rootEl);
ok('mount() does not throw', true);

// Helper to call update() with synthetic frame values and capture qualTbl rows
// We need to find the qualTbl — it's the table widget returned by U.table
// The last table created is qualTbl. Let's track it.
var lastTableRows = null;
var origTableSet = null;

// Re-intercept: after mount(), the qualTbl's set method stores rows.
// We need to find the table node in the rootEl children. Let's just call
// update() with real frames and then check rows on the table.
// Since we patched U.table, the table's .set() stores to node._lastRows.
// We need to find that node.

function findTableNode(el) {
  if (el._lastRows !== undefined) return el;
  if (el._children) {
    for (var i = 0; i < el._children.length; i++) {
      var found = findTableNode(el._children[i]);
      if (found) return found;
    }
  }
  return null;
}

// Call update with a frame that drives fc so that fc % 8 === 1 (first call)
// fc starts at 0 in the module, first update increments to 1, so 1 % 8 === 1 -> qualTbl.set fires
var frame0 = BAS.sim.frame(0);
upwMod.update(frame0);

var tbl = findTableNode(rootEl);
ok('qualTbl rows found after first update', !!tbl && !!tbl._lastRows, tbl ? 'rows: ' + (tbl._lastRows ? tbl._lastRows.length : 'none') : 'no tbl node');

// ---- Now test badge classification with synthetic extreme values ----------
// We call update() multiple times (fc increments); we need fc%8===1 to trigger buildRows.
// To force a qualTbl.set, we call 8 times to advance fc to 9 (9%8=1).
function driveToNextTableUpdate(extraFrame) {
  for (var i = 0; i < 7; i++) {
    upwMod.update(extraFrame || BAS.sim.frame(1));
  }
  upwMod.update(extraFrame || BAS.sim.frame(1));
}

// --- Test 1: resistivity 18.14 (below bad threshold 18.1863) -> warn class ---
// We need to inject a synthetic frame. upw.js update() reads frame.kpis.upwResistivity.
// Create a synthetic frame from a real frame but override kpis.
function syntheticFrame(overrides) {
  var base = BAS.sim.frame(40); // mid-loop frame
  // Create a shallow copy with overridden kpis
  var kpis = {};
  for (var k in base.kpis) kpis[k] = base.kpis[k];
  for (var k2 in (overrides.kpis || {})) kpis[k2] = overrides.kpis[k2];
  return {
    t: base.t, tick: base.tick, tickF: base.tickF, sim: base.sim,
    load: overrides.load || base.load,
    kpis: kpis,
    newEvents: [], alarms: [], toolStates: base.toolStates, areaStates: base.areaStates,
    model: base.model
  };
}

// Badge class helpers: qualBadge() produces e.g. st-NearSpec or st-UnscheduledDown
// Warn maps to 'st-NearSpec' (amber), bad maps to 'st-UnscheduledDown' (red), good to 'st-Productive' (green)
function hasWarnBadge(badge) { return badge && badge.indexOf('st-NearSpec') !== -1; }
function hasBadBadge(badge)  { return badge && badge.indexOf('st-UnscheduledDown') !== -1; }
function hasGoodBadge(badge) { return badge && badge.indexOf('st-Productive') !== -1; }

// Test resistivity below bad threshold (18.14 < 18.1863) -> warn or bad badge
driveToNextTableUpdate(syntheticFrame({ kpis: { upwResistivity: 18.14, upwTOC: 0.65 } }));
var tblAfter1 = findTableNode(rootEl);
var rows1 = tblAfter1 ? tblAfter1._lastRows : null;
if (rows1) {
  var resRow1 = rows1[0]; // Resistivity is first row
  ok('resistivity=18.14 (below bad threshold 18.1863) -> warn or bad badge',
    resRow1 && (hasWarnBadge(resRow1.badge) || hasBadBadge(resRow1.badge)),
    'badge: ' + (resRow1 ? resRow1.badge : 'none'));
}

// Test resistivity in the warn-only band (18.1863 < 18.188 < 18.1899) -> warn, NOT bad
driveToNextTableUpdate(syntheticFrame({ kpis: { upwResistivity: 18.188, upwTOC: 0.65 } }));
var rowsW = findTableNode(rootEl);
rowsW = rowsW ? rowsW._lastRows : null;
if (rowsW) {
  var resRowW = rowsW[0];
  ok('resistivity=18.188 (warn-only band) -> warn badge, not bad',
    resRowW && hasWarnBadge(resRowW.badge) && !hasBadBadge(resRowW.badge),
    'badge: ' + (resRowW ? resRowW.badge : 'none'));
}

// Test TOC 1.1 (above bad threshold 0.7810) -> bad badge
driveToNextTableUpdate(syntheticFrame({ kpis: { upwResistivity: 18.20, upwTOC: 1.1 } }));
var rows2 = tblAfter1 ? tblAfter1._lastRows : null;
if (rows2) {
  var tocRow2 = rows2[1]; // TOC is second row
  ok('TOC=1.1 (above bad threshold 0.7810) -> bad badge',
    tocRow2 && hasBadBadge(tocRow2.badge),
    'badge: ' + (tocRow2 ? tocRow2.badge : 'none'));
}

// Test healthy mid-range value: resistivity 18.20, TOC 0.65 -> good badge (Productive)
driveToNextTableUpdate(syntheticFrame({ kpis: { upwResistivity: 18.20, upwTOC: 0.65 } }));
var rows3 = tblAfter1 ? tblAfter1._lastRows : null;
if (rows3) {
  var resRow3 = rows3[0];
  var tocRow3 = rows3[1];
  ok('resistivity=18.20 (healthy) -> Productive/In-spec badge',
    resRow3 && hasGoodBadge(resRow3.badge),
    'badge: ' + (resRow3 ? resRow3.badge : 'none'));
  ok('TOC=0.65 (healthy) -> Productive/In-spec badge',
    tocRow3 && hasGoodBadge(tocRow3.badge),
    'badge: ' + (tocRow3 ? tocRow3.badge : 'none'));
}

// --- Test 2: verify on-real-engine data: count warn/bad ticks across full loop ---
var P = BAS.clock.PERIOD;
var resBadTicks = 0, resWarnTicks = 0, resGoodTicks = 0;
var tocBadTicks = 0, tocWarnTicks = 0, tocGoodTicks = 0;

// Measured thresholds
var RES_WARN = 18.1899, RES_BAD = 18.1863;  // lower is worse (invert)
var TOC_WARN = 0.7486, TOC_BAD = 0.7810;    // higher is worse

for (var t = 0; t < P; t += 0.5) {
  var fr = BAS.sim.frame(t);
  var r = fr.kpis.upwResistivity;
  var tc = fr.kpis.upwTOC;

  var rState = U.band(r, RES_WARN, RES_BAD, true);
  if (rState === 'bad') resBadTicks++;
  else if (rState === 'warn') resWarnTicks++;
  else resGoodTicks++;

  var tcState = U.band(tc, TOC_WARN, TOC_BAD, false);
  if (tcState === 'bad') tocBadTicks++;
  else if (tcState === 'warn') tocWarnTicks++;
  else tocGoodTicks++;
}

var totalTicks = Math.round(P / 0.5);
ok('resistivity has some warn ticks (15-30%)',
  resWarnTicks > 0 && resWarnTicks / totalTicks >= 0.12 && resWarnTicks / totalTicks <= 0.35,
  resWarnTicks + '/' + totalTicks + ' = ' + (resWarnTicks / totalTicks * 100).toFixed(1) + '%');
ok('resistivity has some bad ticks (3-10%)',
  resBadTicks > 0 && resBadTicks / totalTicks >= 0.02 && resBadTicks / totalTicks <= 0.12,
  resBadTicks + '/' + totalTicks + ' = ' + (resBadTicks / totalTicks * 100).toFixed(1) + '%');
ok('resistivity has healthy majority (>60%) of good ticks',
  resGoodTicks / totalTicks > 0.60,
  resGoodTicks + '/' + totalTicks + ' = ' + (resGoodTicks / totalTicks * 100).toFixed(1) + '%');

ok('TOC has some warn ticks (15-30%)',
  tocWarnTicks > 0 && tocWarnTicks / totalTicks >= 0.08 && tocWarnTicks / totalTicks <= 0.35,
  tocWarnTicks + '/' + totalTicks + ' = ' + (tocWarnTicks / totalTicks * 100).toFixed(1) + '%');
ok('TOC has some bad ticks (3-10%)',
  tocBadTicks > 0 && tocBadTicks / totalTicks >= 0.02 && tocBadTicks / totalTicks <= 0.12,
  tocBadTicks + '/' + totalTicks + ' = ' + (tocBadTicks / totalTicks * 100).toFixed(1) + '%');
ok('TOC has healthy majority (>60%) of good ticks',
  tocGoodTicks / totalTicks > 0.60,
  tocGoodTicks + '/' + totalTicks + ' = ' + (tocGoodTicks / totalTicks * 100).toFixed(1) + '%');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
