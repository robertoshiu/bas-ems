// Trends / Historian — engine-level unit tests.
// Verifies: load.sample channel existence, resistivity formula replication,
//            precompute correctness (load.sample NOT frame()), curve integrity.
// Run: bun _trends_test.mjs
import { readFileSync } from 'fs';

const files = ['prng', 'clock', 'master-data', 'events', 'load-model', 'sim']
  .map(f => `src/engine/${f}.js`);
const win = {};
for (const f of files) {
  const code = readFileSync(f, 'utf8');
  new Function('window', code)(win);
}
const BAS = win.BAS;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  (cond ? pass++ : fail++);
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
}

BAS.sim.init();
const load = BAS.sim.load;
const CK = BAS.clock;
const PERIOD = CK.PERIOD;  // 180

// ---- 1. load.sample channel existence ------------------------------------
const s = load.sample(40);
ok('channel totalKW', typeof s.totalKW === 'number' && s.totalKW > 0);
ok('channel overheadRatio', typeof s.overheadRatio === 'number' && s.overheadRatio > 0);
ok('channel exAcidCFM', typeof s.exAcidCFM === 'number' && s.exAcidCFM > 0);
ok('channel chwRT', typeof s.chwRT === 'number' && s.chwRT > 0);
ok('no upwResistivity on sample (composed in frame)', s.upwResistivity === undefined,
  'upwResistivity=' + s.upwResistivity);

// ---- 2. Resistivity replication: formula must match frame() exactly ------
// Exact formula from sim.js line 107:
//   K.upwResistivity = 18.20 + (BAS.prng.rand('upwR', tick) - 0.5) * 0.03;
// where tick = BAS.clock.tickOf(t)
const testTs = [0, 10, 22.5, 40, 90, 130, 170, 179.9];
let allRMatch = true;
for (const t of testTs) {
  const tick = CK.tickOf(t);
  const replicated = 18.20 + (BAS.prng.rand('upwR', tick) - 0.5) * 0.03;
  const fr = BAS.sim.frame(t);
  const liveR = fr.kpis.upwResistivity;
  const match = Math.abs(replicated - liveR) < 1e-9;
  if (!match) allRMatch = false;
  ok('upwR formula match @t=' + t, match,
    'replicated=' + replicated.toFixed(7) + ' live=' + liveR.toFixed(7) + ' diff=' + Math.abs(replicated - liveR));
}
ok('all resistivity formula matches exact', allRMatch);

// ---- 3. Purity: calling load.sample in non-sequential order does NOT corrupt frame() ------
// Establish a reference frame result
const refFrame = BAS.sim.frame(40);
const refTotalKW = refFrame.load.totalKW;
// Now call load.sample out of order (this is what trends precompute does)
const N = 240;
const samps = [];
for (let i = 0; i < N; i++) {
  samps.push(load.sample(i / N * PERIOD));
}
// Also call in reverse
for (let i = N - 1; i >= 0; i--) {
  load.sample(i / N * PERIOD);
}
// frame(40) must still return the same value
const afterFrame = BAS.sim.frame(40);
ok('load.sample calls do not corrupt frame()',
  Math.abs(afterFrame.load.totalKW - refTotalKW) < 1e-6,
  'ref=' + refTotalKW.toFixed(3) + ' after=' + afterFrame.load.totalKW.toFixed(3));

// ---- 4. Curve integrity: 5 channels are plausible across the whole loop --
let demandOk = true, overheadOk = true, upwROk = true, exAcidOk = true, chwRTOk = true;
for (let i = 0; i < N; i++) {
  const t2 = i / N * PERIOD;
  const samp2 = load.sample(t2);
  const tick2 = CK.tickOf(t2);
  const r = 18.20 + (BAS.prng.rand('upwR', tick2) - 0.5) * 0.03;
  if (samp2.totalKW / 1000 < 20 || samp2.totalKW / 1000 > 60) demandOk = false;
  if (samp2.overheadRatio < 1.0 || samp2.overheadRatio > 4.0) overheadOk = false;
  if (r < 18.0 || r > 18.4) upwROk = false;
  if (samp2.exAcidCFM < 80000 || samp2.exAcidCFM > 220000) exAcidOk = false;
  if (samp2.chwRT < 8000 || samp2.chwRT > 15000) chwRTOk = false;
}
ok('demand curve plausible (20-60 MW)', demandOk);
ok('overheadRatio curve plausible (1-4 x)', overheadOk);
ok('upwResistivity replicated curve plausible (18.0-18.4)', upwROk);
ok('exAcidCFM curve plausible (80k-220k)', exAcidOk);
ok('chwRT curve plausible (8k-15k)', chwRTOk);

// ---- 5. Seam check on trends channels (loop continuity) ------------------
const sA = load.sample(0.01), sB = load.sample(PERIOD - 0.01);
const seamDemand = Math.abs(sA.totalKW - sB.totalKW) / sA.totalKW;
ok('seam demand continuous (<3%)', seamDemand < 0.03, 'err=' + (seamDemand * 100).toFixed(2) + '%');
const seamAcid = Math.abs(sA.exAcidCFM - sB.exAcidCFM) / sA.exAcidCFM;
ok('seam exAcidCFM continuous (<3%)', seamAcid < 0.03, 'err=' + (seamAcid * 100).toFixed(2) + '%');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
