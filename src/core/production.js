// ============================================================
// production.js — time advancing on rooms.
//
// These two functions were previously inline inside the offline
// resolver. The live loop needs exactly the same behaviour, and a
// second implementation would drift — the same way visitor_rate
// and stranger rate drifted before they were unified. One place.
//
// Both are idempotent with respect to time: calling them twice
// with the same `toMs` does nothing the second time, because
// progress is tracked by timestamp, never by elapsed deltas.
// ============================================================

import { ROOM_BY_ID } from '../data/rooms.js';
import { TUNING } from '../data/tuning.js';

/**
 * Production speed for one supply line.
 *
 * Ministries can boost production generally (Men's Ministry) or
 * for one supply only (Women's Work boosts clothing). Both stack.
 */
export function productionSpeed(mods, supply) {
  const general = mods.production_speed ?? 1;
  const specific = mods[`production_speed:${supply}`] ?? 1;
  return general * specific;
}

/**
 * Run every production line forward to `toMs`.
 * @returns {object} supply id → amount gained
 */
export function advanceProduction(state, toMs, mods) {
  const gained = {};
  for (const room of state.rooms) {
    const def = ROOM_BY_ID[room.id];
    if (!def?.production) continue;

    const { supply, durationS, yield: amount } = def.production;
    const cycleMs = (durationS * 1000) / productionSpeed(mods, supply);
    // Default to when the save was last advanced, NOT to toMs — a
    // line seeded at the end of the window would never produce.
    room.lastProducedAt = room.lastProducedAt ?? state.lastSavedAt ?? toMs;

    // Guard against a pathological cycle length locking the loop.
    if (!(cycleMs > 0)) continue;

    while (room.lastProducedAt + cycleMs <= toMs) {
      room.lastProducedAt += cycleMs;
      const cap = TUNING.SUPPLY_CAP[supply] ?? Infinity;
      const before = state.currency.supplies[supply] || 0;
      const after = Math.min(cap, before + amount);
      state.currency.supplies[supply] = after;
      if (after > before) gained[supply] = (gained[supply] || 0) + (after - before);
    }
  }
  return gained;
}

/**
 * Complete any construction finished by `toMs`.
 * @returns {string[]} room ids that came online
 */
export function advanceConstruction(state, toMs) {
  const completed = [];
  state.construction = (state.construction || []).filter((c) => {
    if (c.startedAt + c.durationS * 1000 > toMs) return true;
    const def = ROOM_BY_ID[c.roomId];
    const room = { id: c.roomId, x: c.x, y: c.y, rot: c.rot || 0, level: 1 };
    if (def?.baseSeats) room.seats = def.baseSeats;
    if (def?.production) room.lastProducedAt = c.startedAt + c.durationS * 1000;
    state.rooms.push(room);
    completed.push(c.roomId);
    return false;
  });
  return completed;
}

/** 0..1 progress of a construction site. */
export function constructionProgress(site, atMs) {
  const total = site.durationS * 1000;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (atMs - site.startedAt) / total));
}

/** Milliseconds until a site is finished. */
export function constructionRemaining(site, atMs) {
  return Math.max(0, site.startedAt + site.durationS * 1000 - atMs);
}
