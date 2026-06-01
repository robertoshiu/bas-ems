// Measure real engine ranges for UPW quality KPIs.
// Run: bun _upw_measure.mjs
import { readFileSync } from 'fs';

const win = {};
function loadFile(p) { new Function('window', readFileSync(p, 'utf8'))(win); }
['prng', 'clock', 'master-data', 'events', 'load-model', 'sim'].forEach(function (f) {
  loadFile('src/engine/' + f + '.js');
});
win.BAS.sim.init();
const BAS = win.BAS;
const P = BAS.clock.PERIOD; // 180 seconds

var resMin = 1e9, resMax = -1e9, resSum = 0;
var tocMin = 1e9, tocMax = -1e9, tocSum = 0;
// particles: computed in buildRows as: Math.round(38 + jitter('upwpc', tick, 9))
// jitter = (rand - 0.5) * 2 * amp -> range 38 +/- 9 -> [29, 47]
// But we need to check actual tick values
var partMin = 1e9, partMax = -1e9, partSum = 0;
var N = 0;

for (var t = 0; t < P; t += 0.5) {
  var frame = BAS.sim.frame(t);
  var res = frame.kpis.upwResistivity;
  var toc = frame.kpis.upwTOC;
  // particle count as computed in buildRows (same jitter channel + tick)
  var part = Math.round(38 + (BAS.prng.rand('upwpc', frame.tick) - 0.5) * 2 * 9);

  resMin = Math.min(resMin, res);
  resMax = Math.max(resMax, res);
  resSum += res;

  tocMin = Math.min(tocMin, toc);
  tocMax = Math.max(tocMax, toc);
  tocSum += toc;

  partMin = Math.min(partMin, part);
  partMax = Math.max(partMax, part);
  partSum += part;

  N++;
}

console.log('Samples: ' + N);
console.log('');
console.log('upwResistivity:');
console.log('  min:  ' + resMin.toFixed(4));
console.log('  max:  ' + resMax.toFixed(4));
console.log('  mean: ' + (resSum / N).toFixed(4));
console.log('');
console.log('upwTOC (ppb):');
console.log('  min:  ' + tocMin.toFixed(4));
console.log('  max:  ' + tocMax.toFixed(4));
console.log('  mean: ' + (tocSum / N).toFixed(4));
console.log('');
console.log('Particles >50nm /mL (buildRows formula: 38 + jitter(upwpc, tick, 9)):');
console.log('  min:  ' + partMin);
console.log('  max:  ' + partMax);
console.log('  mean: ' + (partSum / N).toFixed(1));
console.log('');

// Also check the distribution to calibrate thresholds
// For resistivity (lower is worse / invert=true): warn/bad are LOWER bounds
// For TOC (higher is worse): warn/bad are UPPER bounds
// For particles (higher is worse): warn/bad are UPPER bounds

// Compute percentiles by sorting
var resList = [], tocList = [], partList = [];
for (var t2 = 0; t2 < P; t2 += 0.5) {
  var frame2 = BAS.sim.frame(t2);
  resList.push(frame2.kpis.upwResistivity);
  tocList.push(frame2.kpis.upwTOC);
  var part2 = Math.round(38 + (BAS.prng.rand('upwpc', frame2.tick) - 0.5) * 2 * 9);
  partList.push(part2);
}
resList.sort(function(a, b) { return a - b; });
tocList.sort(function(a, b) { return a - b; });
partList.sort(function(a, b) { return a - b; });

var n = resList.length;
// For resistivity: want warn at ~15-30% from bottom (lower is worse)
// So warn = bottom 20th percentile, bad = bottom 5th percentile
var resWarnIdx = Math.floor(n * 0.20);
var resBadIdx  = Math.floor(n * 0.05);
console.log('Resistivity thresholds (lower is worse, warn=lower bound at p20, bad at p5):');
console.log('  p5  (bad):  ' + resList[resBadIdx].toFixed(4));
console.log('  p20 (warn): ' + resList[resWarnIdx].toFixed(4));
console.log('  => warn fires for bottom 20% = ~20% of ticks');
console.log('  => bad  fires for bottom 5%  = ~5%  of ticks');
console.log('');

// For TOC: want warn at top 20%, bad at top 5% (higher is worse)
var tocWarnIdx = Math.floor(n * 0.80);
var tocBadIdx  = Math.floor(n * 0.93);
console.log('TOC thresholds (higher is worse, warn=upper bound at p80, bad at p93):');
console.log('  p80 (warn): ' + tocList[tocWarnIdx].toFixed(4));
console.log('  p93 (bad):  ' + tocList[tocBadIdx].toFixed(4));
console.log('  => warn fires for top 20% = ~20% of ticks');
console.log('  => bad  fires for top 7%  = ~7%  of ticks');
console.log('');

// For particles: same direction
var partWarnIdx = Math.floor(n * 0.80);
var partBadIdx  = Math.floor(n * 0.93);
console.log('Particle thresholds (higher is worse, warn=upper bound at p80, bad at p93):');
console.log('  p80 (warn): ' + partList[partWarnIdx]);
console.log('  p93 (bad):  ' + partList[partBadIdx]);
console.log('');

// Count actual hits at those thresholds
var resWarnAt = resList[resWarnIdx];
var resBadAt  = resList[resBadIdx];
var tocWarnAt = tocList[tocWarnIdx];
var tocBadAt  = tocList[tocBadIdx];
var partWarnAt = partList[partWarnIdx];
var partBadAt  = partList[partBadIdx];

var resWarnCount = 0, resBadCount = 0;
var tocWarnCount = 0, tocBadCount = 0;
var partWarnCount = 0, partBadCount = 0;

for (var t3 = 0; t3 < P; t3 += 0.5) {
  var frame3 = BAS.sim.frame(t3);
  var r3 = frame3.kpis.upwResistivity;
  var tc3 = frame3.kpis.upwTOC;
  var p3 = Math.round(38 + (BAS.prng.rand('upwpc', frame3.tick) - 0.5) * 2 * 9);

  // resistivity: invert — bad if <= badAt, warn if <= warnAt
  if (r3 <= resBadAt) resBadCount++;
  else if (r3 <= resWarnAt) resWarnCount++;

  // TOC: bad if >= badAt, warn if >= warnAt
  if (tc3 >= tocBadAt) tocBadCount++;
  else if (tc3 >= tocWarnAt) tocWarnCount++;

  // particles: bad if >= badAt, warn if >= warnAt
  if (p3 >= partBadAt) partBadCount++;
  else if (p3 >= partWarnAt) partWarnCount++;
}

console.log('Resistivity hit rates with thresholds warn=' + resWarnAt.toFixed(4) + ' bad=' + resBadAt.toFixed(4) + ':');
console.log('  bad:  ' + resBadCount  + '/' + N + ' = ' + (resBadCount  / N * 100).toFixed(1) + '%');
console.log('  warn: ' + resWarnCount + '/' + N + ' = ' + (resWarnCount / N * 100).toFixed(1) + '%');
console.log('  good: ' + (N - resBadCount - resWarnCount) + '/' + N + ' = ' + ((N - resBadCount - resWarnCount) / N * 100).toFixed(1) + '%');
console.log('');
console.log('TOC hit rates with thresholds warn=' + tocWarnAt.toFixed(4) + ' bad=' + tocBadAt.toFixed(4) + ':');
console.log('  bad:  ' + tocBadCount  + '/' + N + ' = ' + (tocBadCount  / N * 100).toFixed(1) + '%');
console.log('  warn: ' + tocWarnCount + '/' + N + ' = ' + (tocWarnCount / N * 100).toFixed(1) + '%');
console.log('  good: ' + (N - tocBadCount - tocWarnCount) + '/' + N + ' = ' + ((N - tocBadCount - tocWarnCount) / N * 100).toFixed(1) + '%');
console.log('');
console.log('Particle hit rates with thresholds warn=' + partWarnAt + ' bad=' + partBadAt + ':');
console.log('  bad:  ' + partBadCount  + '/' + N + ' = ' + (partBadCount  / N * 100).toFixed(1) + '%');
console.log('  warn: ' + partWarnCount + '/' + N + ' = ' + (partWarnCount / N * 100).toFixed(1) + '%');
console.log('  good: ' + (N - partBadCount - partWarnCount) + '/' + N + ' = ' + ((N - partBadCount - partWarnCount) / N * 100).toFixed(1) + '%');
