// Headless tests for the Timeline Cockpit logic modules. Run: bun _timeline_test.mjs
import { readFileSync } from 'fs';
const win = {};
function load(p){ new Function('window', readFileSync(p,'utf8'))(win); }
['prng','clock','master-data','events','load-model','sim'].forEach(f => load(`src/engine/${f}.js`));
load('src/app/clock-source.js');
const BAS = win.BAS;
let pass=0, fail=0;
const ok=(n,c,x)=>{(c?pass++:fail++);console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};

// Deterministically stub the wall clock so 'live' time is controllable.
let WALL = 0;                       // seconds, 0..180
BAS.clock.now = () => WALL;

const cs = BAS.clockSource;
// live mode passes wall-clock through (offset 0)
WALL = 12.0; ok('live now == wall', Math.abs(cs.now() - 12.0) < 1e-9, cs.now().toFixed(3));
// scrubTo freezes at the scrubbed t regardless of wall advancing
cs.scrubTo(90); WALL = 30;
ok('paused holds scrubT', Math.abs(cs.now() - 90) < 1e-9 && cs.mode === 'paused');
// resume() plays-from-here: now() continues from 90 as wall advances
cs.resume(); WALL = 30;  ok('resume base == scrubT', Math.abs(cs.now() - 90) < 1e-6);
WALL = 35;               ok('resume advances', Math.abs(cs.now() - 95) < 1e-6, cs.now().toFixed(3));

// wrap crosses seam: scrub to 179.5 while WALL=170, resume, then advance WALL to 175.
// offset = wrap(179.5 - 170) = 9.5; now = wrap(175 + 9.5) = wrap(184.5) = 4.5
WALL = 170; cs.scrubTo(179.5); cs.resume(); WALL = 175;
let v = cs.now();
ok('wrap crosses seam', Math.abs(v - 4.5) < 1e-6, v.toFixed(3));
ok('now in [0,180)', v >= 0 && v < 180, v.toFixed(3));

// ---- Replay tests ----
// Restore live state, then stub the wall clock for replay via _setWall.
WALL = 0; cs.resume();

let FAKE = 100;           // fake absolute wall seconds
cs._setWall(() => FAKE);

let onTickCalls = 0, onEndCalled = false;
const onTickSpy = () => { onTickCalls++; };
const onEndSpy  = () => { onEndCalled = true; };

// startReplay(startT=10, endT=20, rate=2, onTick, onEnd)
// At FAKE=100 (wall0=100): tRaw = 10 + (FAKE-100)*2
cs.startReplay(10, 20, 2, onTickSpy, onEndSpy);
ok('replay mode active', cs.mode === 'replay');

// Advance FAKE by 2s: tRaw = 10 + 2*2 = 14 -> t=14, still in window
FAKE = 102;
let t1 = cs.now();
ok('replay t advances', Math.abs(t1 - 14) < 1e-6, t1.toFixed(3));
ok('onTick fired mid-window', onTickCalls >= 1);

// Advance FAKE past end: tRaw = 10 + 6*2 = 22 >= 20 -> window ends, reverts to live
FAKE = 106;
let t2 = cs.now();
ok('replay ends -> live', cs.isLive(), 'mode=' + cs.mode);
ok('onEnd callback fired', onEndCalled);
// After replay ends, now() should return wrap(endT)=20 (or near it as live catches up)
ok('post-replay t near endT', Math.abs(t2 - 20) < 1e-6, t2.toFixed(3));

// Restore real wall clock
cs._setWall(function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000; });

load('src/ui/timeline-data.js');
BAS.sim.init();
const td1 = BAS.ui.timelineData.get();
ok('demand length 360', td1.demand.length === 360, String(td1.demand.length));
ok('peakMW plausible 20-50', td1.peakMW > 20 && td1.peakMW < 50, td1.peakMW.toFixed(1));
ok('demand[0] finite', Number.isFinite(td1.demand[0]));
// determinism: a fresh build equals the cached one element-for-element
BAS.ui.timelineData._reset();
const td2 = BAS.ui.timelineData.get();
let identical = td1.demand.length === td2.demand.length;
for (let i = 0; i < td1.demand.length && identical; i++) if (td1.demand[i] !== td2.demand[i]) identical = false;
ok('demand precompute deterministic', identical);

// ---- Task 5: alarms, density, e10 ----
BAS.ui.timelineData._reset();
const td = BAS.ui.timelineData.get();
ok('alarms populated', td.alarms.length > 0, String(td.alarms.length));
ok('alarm has setT<clearT', td.alarms.every(a => a.setT >= 0 && a.clearT <= 180 && a.setT < a.clearT));
ok('density 120 bins', td.density.length === 120);
ok('density nonzero somewhere', Array.from(td.density).some(v => v > 0));
const firstTool = BAS.master.tools[0].id;
ok('e10 ribbon for a tool', Array.isArray(td.e10[firstTool]) && td.e10[firstTool].length > 0);

// ---- Task 7: replay caption builder (pure) ----
load('src/app/replay.js');
const al = BAS.ui.timelineData.get().alarms[0];
const w = BAS.replay._window(al);
ok('replay window brackets the alarm', w.startT <= al.setT && w.endT >= al.clearT && w.endT > w.startT);
const caps = BAS.replay._captions(al);
ok('captions non-empty', caps.length >= 2, String(caps.length));
ok('captions sorted by t', caps.every((c, i) => i === 0 || c.t >= caps[i - 1].t));
ok('a caption mentions ALARM', caps.some(c => /ALARM|ALID/.test(c.text)));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
