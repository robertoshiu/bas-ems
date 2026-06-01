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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
