// Deterministic LCG so every level lays out the same way each time.
export function makeRNG(seed) {
  let s = (seed * 2654435761) >>> 0;
  const r = function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(r.range(a, b + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}
