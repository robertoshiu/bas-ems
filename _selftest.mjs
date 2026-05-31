// Headless engine self-test. Run: bun _selftest.mjs  (delete after)
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
function ok(name, cond, extra) { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); }

BAS.sim.init();
const model = BAS.sim.model, load = BAS.sim.load;

ok('events built', model.events.length > 200, 'count=' + model.events.length);
ok('jobs built', model.jobs.length > 100, 'jobs=' + model.jobs.length);
ok('tools', BAS.master.tools.length > 40, 'tools=' + BAS.master.tools.length);

// Determinism
const m2 = BAS.events.build();
ok('deterministic count', m2.events.length === model.events.length);
ok('deterministic first event', JSON.stringify(m2.events[0]) === JSON.stringify(model.events[0]));

// Seam continuity (load curves periodic)
const P = BAS.clock.PERIOD;
const a = load.sample(0.01), b = load.sample(P - 0.01);
const seamErr = Math.abs(a.totalKW - b.totalKW) / a.totalKW;
ok('seam totalKW continuous', seamErr < 0.03, 'err=' + (seamErr * 100).toFixed(2) + '% (' + a.totalKW.toFixed(0) + ' vs ' + b.totalKW.toFixed(0) + ')');
const exact = load.sample(0), exactP = load.sample(P);
ok('sample(0)==sample(180)', Math.abs(exact.totalKW - exactP.totalKW) < 1e-6);

// Per-channel seam check
['processKW', 'pcwRT', 'upwFlow', 'exAcidCFM', 'abateKW'].forEach(ch => {
  const e = Math.abs(load.sample(0.02)[ch] - load.sample(P - 0.02)[ch]) / (Math.abs(load.sample(0.02)[ch]) + 1);
  ok('seam ' + ch, e < 0.05, 'err=' + (e * 100).toFixed(2) + '%');
});

// E10 closed timelines
let e10ok = true, badTool = '';
for (const t of BAS.master.tools) {
  const segs = model.e10[t.id];
  if (!segs || Math.abs(segs[0].start) > 1e-6 || Math.abs(segs[segs.length - 1].end - P) > 1e-6) { e10ok = false; badTool = t.id; break; }
  for (let i = 1; i < segs.length; i++) if (Math.abs(segs[i].start - segs[i - 1].end) > 1e-6) { e10ok = false; badTool = t.id + '@gap'; break; }
}
ok('E10 timelines cover [0,180] with no gaps', e10ok, badTool);

// Alarms closed within loop
let alOk = model.alarms.every(al => al.set >= 0 && al.clear <= P && al.set < al.clear);
ok('alarms set<clear within loop', alOk, 'alarms=' + model.alarms.length);

// Event coverage by stepping a full loop
let seen = 0; let lt = 0;
for (let t = 0; t <= P + 0.001; t += 0.05) { seen += model.eventsInWindow(lt, t).length; lt = t; }
ok('event window coverage ~= count', Math.abs(seen - model.events.length) < model.events.length * 0.02, 'seen=' + seen + ' count=' + model.events.length);

// KPI sanity across the loop
let nan = false, mwMin = 1e9, mwMax = -1e9, ohMin = 1e9, ohMax = -1e9;
for (let i = 0; i < 200; i++) {
  const fr = BAS.sim.frame(i / 200 * P);
  for (const k in fr.kpis) { const v = fr.kpis[k]; if (typeof v === 'number' && (isNaN(v) || !isFinite(v))) nan = true; }
  mwMin = Math.min(mwMin, fr.kpis.totalMW); mwMax = Math.max(mwMax, fr.kpis.totalMW);
  ohMin = Math.min(ohMin, fr.kpis.overheadRatio); ohMax = Math.max(ohMax, fr.kpis.overheadRatio);
}
ok('no NaN/Inf in KPIs', !nan);
ok('totalMW in plausible band 20-50', mwMin > 20 && mwMax < 50, mwMin.toFixed(1) + '..' + mwMax.toFixed(1) + ' MW');
ok('overheadRatio 1-3', ohMin > 0.8 && ohMax < 3.5, ohMin.toFixed(2) + '..' + ohMax.toFixed(2));
const f0 = BAS.sim.frame(40);
ok('UPW resistivity ~18.2', Math.abs(f0.kpis.upwResistivity - 18.2) < 0.1, f0.kpis.upwResistivity.toFixed(3));
ok('OEE 0.5-0.98', f0.kpis.oee.oee > 0.5 && f0.kpis.oee.oee < 0.98, (f0.kpis.oee.oee * 100).toFixed(1) + '%');
ok('energyPerMove plausible 0.5-12 kWh', f0.kpis.energyPerMove > 0.5 && f0.kpis.energyPerMove < 12, f0.kpis.energyPerMove.toFixed(2) + ' kWh');
ok('wafer moves/hr', f0.kpis.wpmh > 1000, f0.kpis.wpmh + ' wph');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('sample KPIs @t=40: ' + JSON.stringify({
  totalMW: f0.kpis.totalMW.toFixed(1), processMW: f0.kpis.processMW.toFixed(1),
  facilityMW: f0.kpis.facilityMW.toFixed(1), overhead: f0.kpis.overheadRatio.toFixed(2),
  peakMW: f0.kpis.demandPeakMW.toFixed(1), oee: (f0.kpis.oee.oee * 100).toFixed(1) + '%',
  wph: f0.kpis.wpmh, kWhPerMove: f0.kpis.energyPerMove.toFixed(2),
  co2: f0.kpis.co2eRate.toFixed(2) + 't/h', cost: '$' + f0.kpis.costRate.toFixed(0) + '/h'
}));
process.exit(fail > 0 ? 1 : 0);
