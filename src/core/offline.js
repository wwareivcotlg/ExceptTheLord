// ============================================================
// offline.js — resolves everything that happened while away.
//
// CRITICAL: process in chronological buckets, NOT in aggregate.
// "Total production minus total consumption" gives wrong answers:
// a kitchen that runs dry at hour 3 cannot serve at hour 4 even
// if it restocks at hour 6.
// ============================================================

import { TUNING } from '../data/tuning.js';
import { NEEDS, NEED_BY_ID } from '../data/needs.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { bucketRng, weightedPick } from './rng.js';
import { resolveModifiers, effectiveVisitorRate, strangerShare } from './modifiers.js';
import { baseSeats, seatCapacity, vestibuleCapacity } from './sanctuary.js';

const emptySummary = () => ({
  elapsedMs: 0,
  cappedMs: 0,
  wasCapped: false,
  served: {},
  offering: 0,
  favor: 0,
  xp: 0,
  supplies: {},
  seated: 0,
  vestibule: 0,
  queued: 0,
  turnedAway: {},
  completedRooms: [],
});

/**
 * @param {object} state    player state (not mutated)
 * @param {number} nowMs    serverNow()
 * @param {string} playerId used for deterministic seeding
 * @returns {{state: object, summary: object}}
 */
export function resolveOffline(state, nowMs, playerId) {
  const s = structuredClone(state);
  const summary = emptySummary();

  const rawElapsed = Math.max(0, nowMs - s.lastSavedAt);
  const cap = TUNING.OFFLINE_CAP_MS + (resolveModifiers(s, s.lastSavedAt).offline_grace || 0);
  const elapsed = Math.min(rawElapsed, cap);

  summary.elapsedMs = rawElapsed;
  summary.cappedMs = elapsed;
  summary.wasCapped = rawElapsed > cap;

  const buckets = Math.floor(elapsed / TUNING.BUCKET_MS);
  const roomsBuilt = new Set(s.rooms.map((r) => r.id));
  let visitorCarry = 0;

  for (let i = 0; i < buckets; i++) {
    const t = s.lastSavedAt + i * TUNING.BUCKET_MS;
    const rng = bucketRng(playerId, i);
    const mods = resolveModifiers(s, t); // per-bucket: picks up Sabbath correctly

    // 1. Complete construction
    s.construction = (s.construction || []).filter((c) => {
      if (c.startedAt + c.durationS * 1000 <= t) {
        s.rooms.push({ id: c.roomId, x: c.x, y: c.y, rot: c.rot, level: 1 });
        roomsBuilt.add(c.roomId);
        summary.completedRooms.push(c.roomId);
        return false;
      }
      return true;
    });

    // 2. Production — repeating lines, respecting storage cap
    for (const room of s.rooms) {
      const def = ROOM_BY_ID[room.id];
      if (!def?.production) continue;
      const { supply, durationS, yield: amount } = def.production;
      const cycleMs = (durationS * 1000) / mods.production_speed;
      room.lastProducedAt = room.lastProducedAt ?? s.lastSavedAt;
      while (room.lastProducedAt + cycleMs <= t) {
        room.lastProducedAt += cycleMs;
        const capFor = TUNING.SUPPLY_CAP[supply] ?? Infinity;
        const before = s.currency.supplies[supply] || 0;
        const after = Math.min(capFor, before + amount);
        s.currency.supplies[supply] = after;
        summary.supplies[supply] = (summary.supplies[supply] || 0) + (after - before);
      }
    }

    // 3. Generate visitors for this bucket
    const perBucket =
      TUNING.BASE_VISITORS_PER_HOUR *
      (TUNING.BUCKET_MS / 3600000) *
      effectiveVisitorRate(mods);
    visitorCarry += perBucket;
    let count = Math.floor(visitorCarry);
    visitorCarry -= count;
    if (rng() < visitorCarry) { count += 1; visitorCarry -= 1; }

    // 4. Serve, seat, queue, or turn away
    for (let v = 0; v < count; v++) {
      const need = weightedPick(rng, NEEDS);
      if (!need) continue;

      if (!roomsBuilt.has(need.room)) {
        summary.turnedAway[need.id] = (summary.turnedAway[need.id] || 0) + 1;
        continue;
      }

      if (need.kind === 'auto') {
        const have = s.currency.supplies[need.supply] || 0;
        if (need.supply && have < need.supplyCost) {
          summary.turnedAway[need.id] = (summary.turnedAway[need.id] || 0) + 1;
          continue;
        }
        if (need.supply) s.currency.supplies[need.supply] = have - need.supplyCost;
        const offering = Math.round(need.offering);
        const favor = Math.round(need.favor * mods.favor_gain);
        s.currency.offering += offering;
        s.currency.favor += favor;
        s.xp += need.xp;
        summary.offering += offering;
        summary.favor += favor;
        summary.xp += need.xp;
        summary.served[need.id] = (summary.served[need.id] || 0) + 1;
        continue;
      }

      if (need.kind === 'seat') {
        if (s.sanctuary.seated < seatCapacity(s)) {
          s.sanctuary.seated += 1;
          summary.seated += 1;
        } else if ((s.sanctuary.vestibule || 0) < vestibuleCapacity(s, t)) {
          // No pew free — they wait outside rather than leave.
          s.sanctuary.vestibule = (s.sanctuary.vestibule || 0) + 1;
          summary.vestibule += 1;
        } else {
          summary.turnedAway[need.id] = (summary.turnedAway[need.id] || 0) + 1;
        }
        continue;
      }

      if (need.kind === 'queue') {
        const qCap = TUNING.COUNSEL_QUEUE_CAP + mods.queue_capacity;
        if (s.queue.length < qCap) {
          s.queue.push({ needId: need.id, arrivedAt: t });
          summary.queued += 1;
        } else {
          summary.turnedAway[need.id] = (summary.turnedAway[need.id] || 0) + 1;
        }
      }
    }
  }

  // 5. Sanctuary is EXEMPT from the offline cap — pews and vestibule
  //    keep filling no matter how long the player was gone.
  if (summary.wasCapped) {
    const openSeats = seatCapacity(s) - s.sanctuary.seated;
    if (openSeats > 0) { s.sanctuary.seated += openSeats; summary.seated += openSeats; }
    const vestCap = vestibuleCapacity(s, nowMs);
    const openVest = vestCap - (s.sanctuary.vestibule || 0);
    if (openVest > 0) { s.sanctuary.vestibule = vestCap; summary.vestibule += openVest; }
  }

  s.lastSavedAt = nowMs;
  return { state: s, summary };
}

export { seatCapacity, baseSeats, vestibuleCapacity } from './sanctuary.js';
