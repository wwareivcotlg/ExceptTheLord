// ============================================================
// rng.js — deterministic pseudo-random generation.
//
// The same absence, recomputed twice, MUST produce the same result.
// Never call Math.random() anywhere in simulation code.
// ============================================================

/** Fast 32-bit string hash (FNV-1a variant). */
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough distribution for game sim. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One generator per (player, bucket). Reproducible across sessions. */
export function bucketRng(playerId, bucketIndex) {
  return mulberry32(hash(playerId) ^ (bucketIndex * 0x9e3779b1));
}

/** Weighted pick from [{ weight, ... }]. */
export function weightedPick(rng, items, weightOf = (i) => i.weight) {
  const total = items.reduce((s, i) => s + weightOf(i), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}
