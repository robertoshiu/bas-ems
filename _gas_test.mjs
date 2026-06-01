// Headless tests for gas-exhaust.js cabinet coupling logic. Run: bun _gas_test.mjs
// Tests Part B: production-coupled, deterministic cabinet states.
import { readFileSync } from 'fs';

// ---- minimal DOM stub (same pattern as _schematic_test.mjs) ------------------
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
      get firstChild() { return children[0] || null; },
      textContent: '',
      style: {},
      className: '',
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      get children() { return children; },
      get childNodes() { return children; },
      innerHTML: ''
    };
    return el;
  }
  return {
    createElementNS: function (ns, tag) { return makeEl(ns, tag); },
    createElement: function (tag) { return makeEl('', tag); },
    querySelector: function () { return null; },
    createTextNode: function (text) {
      var n = makeEl('', '#text');
      n.textContent = text;
      return n;
    }
  };
})();

// util.js references `document` as a free variable (not window.document),
// so expose it on globalThis as well (mirrors _schematic_test.mjs pattern).
globalThis.document = domStub;
const win = { document: domStub };

function loadFile(p) { new Function('window', readFileSync(p, 'utf8'))(win); }

['prng', 'clock', 'master-data', 'events', 'load-model', 'sim'].forEach(function (f) {
  loadFile('src/engine/' + f + '.js');
});
win.BAS.sim.init();

loadFile('src/ui/util.js');
loadFile('src/ui/widgets.js');
loadFile('src/ui/schematic.js');

const BAS = win.BAS;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  (cond ? pass++ : fail++);
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
}

// ---- Capture all U.table() instances to access cabinet table rows -----------
const allTables = [];
const origTable = BAS.ui.table.bind(BAS.ui);
BAS.ui.table = function (cols, opts) {
  var t = origTable(cols, opts);
  var origSet = t.set.bind(t);
  t._lastRows = [];
  t.set = function (rows) { t._lastRows = rows; origSet(rows); };
  allTables.push(t);
  return t;
};

// ---- Stub U.Sparkline (needs canvas) ----------------------------------------
var origSparkline = BAS.ui.Sparkline;
BAS.ui.Sparkline = function (canvas, opts) {
  return { push: function () {}, render: function () {} };
};

// Also stub cssVar since we don't have CSS
BAS.ui.cssVar = function () { return '#aaa'; };

// ---- Load the gas-exhaust module -------------------------------------------
loadFile('src/modules/gas-exhaust.js');

const gasModule = BAS.modules.find(function (m) { return m.id === 'gas-exhaust'; });
ok('gas-exhaust module registered', !!gasModule);

// ---- Mount the module -------------------------------------------------------
var container = domStub.createElement('div');
gasModule.mount(container);

// allTables order: [0]=bulk, [1]=exHdr, [2]=scrub, [3]=ox, [4]=cab
ok('5 tables registered (bulk/exHdr/scrub/ox/cab)', allTables.length === 5,
  'count=' + allTables.length);

var cabTable = allTables[4]; // specialty gas cabinets table

// ---- Helper: get cabinet state array for a given t -------------------------
function getCabStatesForT(t) {
  var frame = BAS.sim.frame(t);
  // Drive 8 update calls to pass the fc % 8 throttle
  for (var i = 0; i < 8; i++) { gasModule.update(frame); }
  return cabTable._lastRows.map(function (r) { return r.state; });
}

// ---- Test A: cabinet table has correct number of rows ----------------------
getCabStatesForT(40);
ok('cabinet table has 10 rows', cabTable._lastRows.length === 10,
  'rows=' + cabTable._lastRows.length);

// ---- Test B: Determinism — same frame t, repeated calls => identical states -
var statesT40_a = getCabStatesForT(40);
var statesT40_b = getCabStatesForT(40);
var statesT40_c = getCabStatesForT(40);
ok('deterministic: t=40 call1 === call2',
  JSON.stringify(statesT40_a) === JSON.stringify(statesT40_b),
  'a=' + statesT40_a.join(',') + '  b=' + statesT40_b.join(','));
ok('deterministic: t=40 call2 === call3',
  JSON.stringify(statesT40_b) === JSON.stringify(statesT40_c));

// ---- Test C: Scrub-back determinism (t=50 -> t=120 -> t=50 => identical) ---
var statesT50_first = getCabStatesForT(50);
getCabStatesForT(120);   // advance to t=120
var statesT50_again = getCabStatesForT(50); // scrub back
ok('scrub-back deterministic: t=50 after scrubbing to t=120 and back',
  JSON.stringify(statesT50_first) === JSON.stringify(statesT50_again),
  'first=' + statesT50_first.join(',') + '  again=' + statesT50_again.join(','));

// ---- Test D: No Math.random or wall-clock calls in gas-exhaust.js -----------
// Strip single-line comments before checking to allow "No Math.random" in docs.
var src = readFileSync('src/modules/gas-exhaust.js', 'utf8');
var srcNoComments = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('no Math.random() call in gas-exhaust.js code', !(/Math\.random\s*\(/).test(srcNoComments));
ok('no new Date() in gas-exhaust.js code', !(/new\s+Date\s*\(/).test(srcNoComments));
ok('no Date.now() in gas-exhaust.js code', !(/Date\.now\s*\(/).test(srcNoComments));

// ---- Test E: Production coupling (two sub-tests) ---------------------------
// E1: States VARY across different t values (coupling exists — not frozen at tick=0)
// Collect cabinet states at 6 different t values; they should not all be identical.
var tSamples = [0, 30, 60, 90, 120, 150];
var sampleStates = tSamples.map(function (st) { return getCabStatesForT(st).join(','); });
var uniqueSampleSets = {};
sampleStates.forEach(function (s) { uniqueSampleSets[s] = true; });
ok('cabinet states vary across different t values (coupling exists)',
  Object.keys(uniqueSampleSets).length > 1,
  'distinct state-sets=' + Object.keys(uniqueSampleSets).length);

// E2: Monotonic-ish coupling — high ETCH productive fraction => >= Online cabinets than low
// Scan t values to find high vs low ETCH productive fraction
var highT = 0, lowT = 0, highFrac = 0, lowFrac = 1;
for (var t = 0; t < 180; t += 5) {
  var frame = BAS.sim.frame(t);
  var as = frame.areaStates['ETCH'];
  var frac = as.Productive / as.total;
  if (frac > highFrac) { highFrac = frac; highT = t; }
  if (frac < lowFrac) { lowFrac = frac; lowT = t; }
}
ok('found distinct high/low ETCH fraction frames', highFrac > lowFrac,
  'highT=' + highT + '(' + highFrac.toFixed(2) + ') lowT=' + lowT + '(' + lowFrac.toFixed(2) + ')');

var statesHigh = getCabStatesForT(highT);
var statesLow  = getCabStatesForT(lowT);
var onlineHigh = statesHigh.filter(function (s) { return s === 'Productive'; }).length;
var onlineLow  = statesLow.filter(function (s) { return s === 'Productive'; }).length;
ok('production-coupled: high ETCH fraction => >= Online cabinets than low',
  onlineHigh >= onlineLow,
  'high(' + highFrac.toFixed(2) + ')=' + onlineHigh + ' low(' + lowFrac.toFixed(2) + ')=' + onlineLow);

// ---- Test F: All states are valid E10-mapped badge names -------------------
var validStates = ['Productive', 'Engineering', 'Standby', 'Scheduled Down', 'Unscheduled Down', 'Non-Scheduled'];
var allValid = statesT40_a.every(function (s) { return validStates.indexOf(s) >= 0; });
ok('all cabinet states are valid badge names', allValid, 'states=' + statesT40_a.join(','));

// ---- Test G: Schematic SVG present after mount (Part A) --------------------
function countByClass(el, cls) {
  var count = 0;
  function walk(n) {
    if (n._attrs && n._attrs['class'] && n._attrs['class'].indexOf(cls) !== -1) count++;
    if (n._children) n._children.forEach(walk);
  }
  walk(el);
  return count;
}
var schCount = countByClass(container, 'schematic');
ok('gas yard schematic element present in container', schCount >= 1, 'count=' + schCount);

// ---- Test H: Per-cabinet variation — not all cabinets same state at t=40 ---
// With production coupling + per-cabinet hash variation, states should not be all identical
var uniqueStates = {};
statesT40_a.forEach(function (s) { uniqueStates[s] = true; });
var uniqueCount = Object.keys(uniqueStates).length;
ok('cabinet states have at least 2 distinct values (not all same)', uniqueCount >= 2,
  'distinct=' + uniqueCount + ' states=' + statesT40_a.join(','));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
