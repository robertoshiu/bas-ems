// Headless test for src/ui/schematic.js. Run: bun _schematic_test.mjs
import { readFileSync } from 'fs';

// ---- minimal DOM stub ------------------------------------------------
// We need createElementNS/createElement/appendChild/setAttribute enough
// to exercise U.Schematic's construction and update() path.
const domStub = (function () {
  function makeEl(ns, tag) {
    var attrs = {};
    var children = [];
    var el = {
      _ns: ns, _tag: tag, _attrs: attrs, _children: children,
      setAttribute: function (k, v) { attrs[k] = String(v); },
      getAttribute: function (k) { return attrs[k] !== undefined ? attrs[k] : null; },
      appendChild: function (c) { children.push(c); return c; },
      textContent: '',
      style: {},
      className: ''
    };
    return el;
  }
  return {
    createElementNS: function (ns, tag) { return makeEl(ns, tag); },
    createElement: function (tag) { return makeEl('', tag); }
  };
})();

// ---- load engine (for real frame data) --------------------------------
// util.js references `document` as a free variable (not window.document),
// so we must expose it on the Node global as well.
globalThis.document = domStub;
const win = { document: domStub };
function loadFile(p) { new Function('window', readFileSync(p, 'utf8'))(win); }
['prng', 'clock', 'master-data', 'events', 'load-model', 'sim'].forEach(function (f) {
  loadFile('src/engine/' + f + '.js');
});
win.BAS.sim.init();

// ---- load ui utilities ------------------------------------------------
loadFile('src/ui/util.js');

// ---- load schematic ---------------------------------------------------
loadFile('src/ui/schematic.js');

const BAS = win.BAS;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  (cond ? pass++ : fail++);
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
}

// ---- container stub ---------------------------------------------------
var container = domStub.createElement('div');

// ---- QA Scenario A: creates SVG with 2 nodes and >=1 pipe/flow --------
var sch = BAS.ui.Schematic(container, {
  nodes: [
    { id: 'A', label: 'Node A', x: 50, y: 50 },
    { id: 'B', label: 'Node B', x: 200, y: 50 }
  ],
  pipes: [
    { from: 'A', to: 'B', channel: 'chwRT' }
  ]
});

ok('Schematic returns object', sch !== null && typeof sch === 'object');
ok('Schematic returns update function', typeof sch.update === 'function');
ok('container has children (SVG appended)', container._children.length >= 1);

// Find the SVG root
var svgRoot = container._children[0];
ok('SVG root tag is svg', svgRoot._tag === 'svg');

// Walk all children recursively and collect by class
function collectByClass(el, cls, acc) {
  acc = acc || [];
  if (el._attrs && el._attrs['class'] && el._attrs['class'].indexOf(cls) !== -1) acc.push(el);
  if (el._children) el._children.forEach(function (c) { collectByClass(c, cls, acc); });
  return acc;
}

var nodeEls = collectByClass(svgRoot, 'node');
var pipeEls = collectByClass(svgRoot, 'pipe');
var flowEls = collectByClass(svgRoot, 'flow');
var valEls  = collectByClass(svgRoot, 'val');

ok('has >= 2 node elements',  nodeEls.length >= 2, 'found=' + nodeEls.length);
ok('has >= 1 pipe element',   pipeEls.length >= 1, 'found=' + pipeEls.length);
ok('has >= 1 flow element',   flowEls.length >= 1, 'found=' + flowEls.length);
ok('has >= 1 val text element', valEls.length >= 1, 'found=' + valEls.length);

// ---- QA Scenario B: update() changes stroke-dashoffset on channel change ----
var frameA = { load: { chwRT: 100 }, tick: 4 };   // divisible by 4 -> triggers throttle
var frameB = { load: { chwRT: 9000 }, tick: 8 };  // higher value -> different dashoffset

sch.update(frameA);
var flowEl = flowEls[0];
var dashA = flowEl._attrs['stroke-dashoffset'];

sch.update(frameB);
var dashB = flowEl._attrs['stroke-dashoffset'];

ok('flow dashoffset set after update', dashA !== undefined, 'dashA=' + dashA);
ok('flow dashoffset changes with channel value', dashA !== dashB,
   'dashA=' + dashA + ' dashB=' + dashB);

// ---- QA Scenario B2: node val label updates ----------------------------
var frameC = { load: { chwRT: 5555 }, tick: 12 };
sch.update(frameC);
var anyValTextChanged = valEls.some(function (v) { return v.textContent && v.textContent !== ''; });
ok('val label has text after update', anyValTextChanged);

// ---- QA Scenario C: no per-frame allocations in update() --------------
// Static source-level check: update() must not contain new/createElement/.push(
var src = readFileSync('src/ui/schematic.js', 'utf8');

// Find the update function body. We locate the `function update(` and check
// from that point to its closing brace. We look for allocating patterns.
var updateStart = src.indexOf('function update(');
ok('update function exists in source', updateStart !== -1);

if (updateStart !== -1) {
  // Extract function body (balanced brace search)
  var depth = 0, i = updateStart, body = '';
  while (i < src.length) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { body = src.slice(updateStart, i + 1); break; } }
    i++;
  }
  ok('no "new " inside update()',        !(/\bnew\s+[A-Z]/.test(body)), 'body snippet: ' + body.slice(0, 80));
  ok('no createElement inside update()', body.indexOf('createElement') === -1);
  ok('no .push( inside update()',        body.indexOf('.push(') === -1);
}

// ---- Fix 2: per-node channel — terminal/sink node with explicit channel -------
// Node 'C' has an explicit channel but NO outgoing pipe; its val label must update.
var container2 = domStub.createElement('div');
var sch2 = BAS.ui.Schematic(container2, {
  nodes: [
    { id: 'SRC', label: 'Source', x: 20, y: 20 },
    { id: 'TANK', label: 'Tank', x: 150, y: 20, channel: 'tankLevel' }
  ],
  pipes: [
    { from: 'SRC', to: 'TANK', channel: 'flowCh' }
  ]
});
var svgRoot2 = container2._children[0];
var valEls2 = collectByClass(svgRoot2, 'val');
// TANK is index 1 in the nodes array, so valEls2[1] is its val element
var tankValEl = valEls2[1];
ok('tank val initially empty', tankValEl.textContent === '');
sch2.update({ load: { tankLevel: 750, flowCh: 100 }, tick: 4 });
ok('terminal node val label updated via node.channel', tankValEl.textContent !== '');
ok('terminal node val shows correct formatted value', tankValEl.textContent === '750');

// ---- Fix 1: change-gate — textContent only written when value changes --------
// We count writes by wrapping the val element's textContent setter with a counter.
var container3 = domStub.createElement('div');
var sch3 = BAS.ui.Schematic(container3, {
  nodes: [
    { id: 'X', label: 'X', x: 10, y: 10, channel: 'xCh' },
    { id: 'Y', label: 'Y', x: 150, y: 10 }
  ],
  pipes: [{ from: 'X', to: 'Y', channel: 'xCh' }]
});
var svgRoot3 = container3._children[0];
var valEls3 = collectByClass(svgRoot3, 'val');
var xValEl = valEls3[0];
// Instrument: replace textContent with a counted property
var writeCount = 0;
var _lastWritten = xValEl.textContent;
Object.defineProperty(xValEl, 'textContent', {
  get: function () { return _lastWritten; },
  set: function (v) { writeCount++; _lastWritten = v; }
});
// First call with value 1234 — should write once
sch3.update({ load: { xCh: 1234 }, tick: 4 });
var writesAfterFirst = writeCount;
// Second and third calls with same value 1234 — should NOT write again
sch3.update({ load: { xCh: 1234 }, tick: 8 });
sch3.update({ load: { xCh: 1234 }, tick: 12 });
var writesAfterRepeat = writeCount;
ok('val written at least once on first distinct value', writesAfterFirst >= 1);
ok('val NOT written again when value is unchanged (change-gate)', writesAfterRepeat === writesAfterFirst,
   'writes after first=' + writesAfterFirst + ' writes after 2 repeats=' + writesAfterRepeat);
// Now change the value — should write again
sch3.update({ load: { xCh: 5678 }, tick: 16 });
ok('val written again when value changes', writeCount > writesAfterRepeat);

// ---- missing channel gracefully ignored (no throw) --------------------
var threw = false;
try {
  sch.update({ load: {}, tick: 16 });
  sch.update({ load: { chwRT: 0 }, tick: 20 });
} catch (e) {
  threw = true;
}
ok('missing/zero channel does not throw', !threw);

// ---- throttle: only updates on fc % 4 == 0 ----------------------------
// tick=1 -> fc=1 -> not divisible by 4 -> dashoffset should NOT change
sch.update(frameA);                          // tick=4 -> update
var dashBefore = flowEl._attrs['stroke-dashoffset'];
sch.update({ load: { chwRT: 99999 }, tick: 5 });  // tick=5 -> fc=5 % 4 != 0 -> skip
var dashAfter = flowEl._attrs['stroke-dashoffset'];
ok('throttle skips update on non-4th frame', dashBefore === dashAfter,
   'before=' + dashBefore + ' after=' + dashAfter);

// ---- API presence checks -----------------------------------------------
ok('BAS.ui.Schematic exported', typeof BAS.ui.Schematic === 'function');
ok('Schematic returns root SVG element', sch.root !== undefined && sch.root._tag === 'svg');

// ---- Fix: seam-free wrap — dashOffset stays bounded in [-PERIOD, 0] -------
// PERIOD = DASH_LEN + DASH_GAP = 8 + 6 = 14.
// Drive 60 accepted frames (tick=4,8,...,240) with chVal=500 (step=0.7/frame).
// After many wraps the dashOffset must remain in [-14, 0] and must never be
// exactly 0 after the first frame (ruling out a hard reset-to-zero clamp).
var DASH_PERIOD_TEST = 14;
var containerW = domStub.createElement('div');
var schW = BAS.ui.Schematic(containerW, {
  nodes: [
    { id: 'P', label: 'P', x: 10, y: 10 },
    { id: 'Q', label: 'Q', x: 150, y: 10 }
  ],
  pipes: [{ from: 'P', to: 'Q', channel: 'wCh' }]
});
var svgRootW = containerW._children[0];
var flowElsW = collectByClass(svgRootW, 'flow');
var flowElW = flowElsW[0];
var wrapBounded = true, wrapNeverHardReset = true, sawWrap = false;
for (var wt = 1; wt <= 60; wt++) {
  schW.update({ load: { wCh: 500 }, tick: wt * 4 });
  var dv = flowElW._attrs['stroke-dashoffset'];
  if (dv !== undefined) {
    var dvNum = parseFloat(dv);
    if (dvNum < -DASH_PERIOD_TEST || dvNum > 0) { wrapBounded = false; }
    // After the 20th frame (enough steps to cross -14 at least once), dashOffset
    // should not have been hard-reset to exactly 0 while still advancing.
    if (wt > 20 && dvNum === 0) { wrapNeverHardReset = false; sawWrap = true; }
  }
}
ok('dashOffset stays bounded in [-PERIOD, 0] over 60 accepted frames', wrapBounded,
   'PERIOD=' + DASH_PERIOD_TEST);
ok('dashOffset never hard-resets to exactly 0 after wrap threshold crossed', wrapNeverHardReset);

// ---- Fix: zero channel value treated as real zero (not missing) --------
// A node with channel='zCh' whose frame.load['zCh'] = 0 should trigger
// the change-gate (write textContent) when going from the initial NaN state.
// A node with channel='zCh' whose frame.load has no 'zCh' key also results
// in chVal=0 — but the important guarantee is that both paths write '' and
// the write fires once on first update (NaN -> 0 transition).
var containerZ = domStub.createElement('div');
var schZ = BAS.ui.Schematic(containerZ, {
  nodes: [
    { id: 'Z', label: 'Z', x: 10, y: 10, channel: 'zCh' }
  ],
  pipes: []
});
var svgRootZ = containerZ._children[0];
var valElsZ = collectByClass(svgRootZ, 'val');
var zValEl = valElsZ[0];
var zWriteCount = 0;
var _zLast = zValEl.textContent;
Object.defineProperty(zValEl, 'textContent', {
  get: function () { return _zLast; },
  set: function (v) { zWriteCount++; _zLast = v; }
});
// First call: channel present with value 0 — should trigger a write (NaN -> 0)
schZ.update({ load: { zCh: 0 }, tick: 4 });
ok('channel value 0 triggers write (NaN -> 0 transition)', zWriteCount >= 1,
   'writes=' + zWriteCount);
// Second call: same value 0 — should NOT write again (change-gate holds)
var zWriteAfterFirst = zWriteCount;
schZ.update({ load: { zCh: 0 }, tick: 8 });
ok('channel value 0 unchanged does not re-write (change-gate)', zWriteCount === zWriteAfterFirst,
   'writes=' + zWriteCount);
// Now absent key: chVal defaults to 0, same as last — change-gate should suppress write
schZ.update({ load: {}, tick: 12 });
ok('absent channel key (defaults to 0) does not re-write when last was 0', zWriteCount === zWriteAfterFirst,
   'writes=' + zWriteCount);
// Non-zero value: triggers a write
schZ.update({ load: { zCh: 42 }, tick: 16 });
ok('channel value 42 after 0 triggers write', zWriteCount > zWriteAfterFirst,
   'writes=' + zWriteCount);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
