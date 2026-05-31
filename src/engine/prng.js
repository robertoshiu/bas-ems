/* bas-ems — deterministic PRNG
 * Zero dependencies. Classic script -> window.BAS.prng
 * xmur3 (string -> 32-bit seed) + mulberry32 (seed -> uniform[0,1)).
 * All synthetic data derives from hash(channel + ':' + tick), so the entire
 * simulation is reproducible and loop-identical.
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A fresh uniform generator seeded from an arbitrary string.
  function rngFromString(str) {
    var seed = xmur3(String(str));
    return mulberry32(seed());
  }

  // Single deterministic uniform for (channel, tick).
  function rand(channel, tick) {
    return rngFromString(channel + ':' + tick)();
  }
  function randInt(channel, tick, min, max) {
    return min + Math.floor(rand(channel, tick) * (max - min + 1));
  }
  function randRange(channel, tick, min, max) {
    return min + rand(channel, tick) * (max - min);
  }
  function pick(channel, tick, arr) {
    return arr[Math.floor(rand(channel, tick) * arr.length)];
  }
  // Weighted pick: weights parallel to arr.
  function pickWeighted(channel, tick, arr, weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    var r = rand(channel, tick) * total;
    for (i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  BAS.prng = {
    xmur3: xmur3,
    mulberry32: mulberry32,
    rngFromString: rngFromString,
    rand: rand,
    randInt: randInt,
    randRange: randRange,
    pick: pick,
    pickWeighted: pickWeighted
  };
})(window.BAS);
