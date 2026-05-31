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
// wrap stays in [0,180)
cs.scrubTo(179.5); cs.resume(); WALL = 0 + 5; // wall jumped; just assert range
let v = cs.now(); ok('now in [0,180)', v >= 0 && v < 180, v.toFixed(3));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
