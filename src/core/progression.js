// ============================================================
// progression.js — levels and the recognition ladder.
//
// Called every frame and after every offline resolution, so it
// must be cheap and idempotent: running it twice in a row must
// never grant anything twice.
// ============================================================

import { RANKS, RANK_ORDER, RANK_BY_ID, xpForLevel, MAX_LEVEL } from '../data/ranks.js';
import { TUNING } from '../data/tuning.js';
import { buildOccupancy, idx, gridSize } from './grid.js';

/** Highest level fully paid for by this much XP. */
export function levelForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

/** Progress toward the next level, for a bar. */
export function levelProgress(state) {
  const level = state.level || 1;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const xp = state.xp || 0;
  return {
    level,
    into: xp - floor,
    needed: Math.max(1, ceil - floor),
    fraction: level >= MAX_LEVEL ? 1 : Math.min(1, (xp - floor) / Math.max(1, ceil - floor)),
    atMax: level >= MAX_LEVEL,
  };
}

export function rankIndex(state) {
  const i = RANK_ORDER.indexOf(state.rank);
  return i === -1 ? 0 : i;
}

export function nextRank(state) {
  return RANKS[rankIndex(state) + 1] || null;
}

/** Have the requirements for the next rank been met? */
export function rankReady(state) {
  const next = nextRank(state);
  if (!next) return { ready: false, next: null };
  const req = next.requires;
  const have = {
    level: state.level || 1,
    servicesHeld: state.stats?.servicesHeld || 0,
    totalServed: state.stats?.totalServed || 0,
  };
  const missing = Object.entries(req)
    .filter(([k, v]) => (have[k] ?? 0) < v)
    .map(([k, v]) => ({ what: k, need: v, have: have[k] ?? 0 }));
  return { ready: missing.length === 0, next, missing, have };
}

/**
 * Grow the floor for a new rank.
 *
 * The grid only ever GROWS, and rooms keep their coordinates, so
 * nothing can be stranded by expansion. The entrance moves to the
 * new bottom edge — and if a room already stands there, we walk
 * along the row to find open floor rather than burying the door.
 */
export function expandGrid(state, rankId) {
  const target = TUNING.GRID_BY_RANK[rankId];
  if (!target) return null;
  const current = gridSize(state);
  const w = Math.max(current.w, target.w);
  const h = Math.max(current.h, target.h);
  if (w === current.w && h === current.h) return null;

  const before = { w: current.w, h: current.h };
  state.grid = { ...state.grid, w, h };

  // Re-seat the entrance on the new bottom row.
  const occ = buildOccupancy(state);
  const row = h - 1;
  const centre = Math.floor(w / 2);
  let placed = null;
  for (let step = 0; step < w && placed === null; step++) {
    for (const x of [centre + step, centre - step]) {
      if (x < 0 || x >= w) continue;
      if (occ[idx(x, row, w)] === 0) { placed = { x, y: row }; break; }
    }
  }
  state.grid.entrance = placed || state.grid.entrance;
  return { from: before, to: { w, h }, entrance: state.grid.entrance };
}

/**
 * Apply any level-ups and rank advancement earned since last call.
 * Idempotent: safe to call every frame.
 *
 * @returns {{levels: number[], rank: object|null, grid: object|null}}
 */
export function applyProgress(state) {
  const result = { levels: [], rank: null, grid: null };

  const earned = levelForXp(state.xp || 0);
  const current = state.level || 1;
  if (earned > current) {
    for (let l = current + 1; l <= earned; l++) result.levels.push(l);
    state.level = earned;
  }

  // One rank per call: advancement should be an event, not a blur.
  const check = rankReady(state);
  if (check.ready && check.next) {
    state.rank = check.next.id;
    result.rank = check.next;
    result.grid = expandGrid(state, check.next.id);
  }

  return result;
}
