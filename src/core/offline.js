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
import { advanceProduction, advanceConstruction } from './production.js';
import { bucketRng, weightedPick } from './rng.js';
import { resolveModifiers, effectiveVisitorRate, strangerShare } from './modifiers.js';
import { grantRehearsalBuff, pruneBuffs } from './rhythm.js';
import { dueCharacters, makeArrival, markArrived, onServed } from './characters.js';
import { canServe } from './serve.js';
import { baseSeats, seatCapacity, vestibuleCapacity, seatPerson } from './sanctuary.js';

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

    // 0. Choir rehearsal happens whether or not anyone is watching.
    if (grantRehearsalBuff(s, t)) summary.rehearsed = true;
    pruneBuffs(s, t);

    // 0b. So do the people who come every week. Mother Hayes does
    //     not wait for the pastor to open the app.
    for (const id of dueCharacters(s, t)) {
      const arrival = makeArrival(s, id, t);
      markArrived(s, id, t);
      summary.visitors = summary.visitors || [];
      // They are only SERVED if the church can meet what they came
      // for — otherwise they came, and went, like anyone else.
      if (canServe(s, arrival.needId).ok) {
        const need = NEED_BY_ID[arrival.needId];
        if (need.supply) s.currency.supplies[need.supply] -= need.supplyCost;
        s.currency.offering += need.offering;
        summary.offering += need.offering;
        const extra = onServed(s, id, t, { needId: arrival.needId });
        summary.visitors.push({ id, name: extra.conversion?.name || arrival.display,
                                served: true, conversion: extra.conversion || null });
        if (extra.conversion) summary.conversion = extra.conversion;
      } else {
        summary.visitors.push({ id, name: arrival.display, served: false });
        summary.turnedAway[arrival.needId] = (summary.turnedAway[arrival.needId] || 0) + 1;
      }
    }

    // 1. Complete construction (shared with the live loop)
    for (const roomId of advanceConstruction(s, t)) {
      roomsBuilt.add(roomId);
      summary.completedRooms.push(roomId);
    }

    // 2. Production (shared with the live loop)
    for (const [supply, amount] of Object.entries(advanceProduction(s, t, mods))) {
      summary.supplies[supply] = (summary.supplies[supply] || 0) + amount;
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
          seatPerson(s, {
            isStranger: rng() < strangerShare(mods),
            isYouth: rng() < 0.12,
          });
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
    for (let i = 0; i < openSeats; i++) {
      seatPerson(s, { isStranger: i % 3 === 0 });
      summary.seated += 1;
    }
    const vestCap = vestibuleCapacity(s, nowMs);
    const openVest = vestCap - (s.sanctuary.vestibule || 0);
    if (openVest > 0) { s.sanctuary.vestibule = vestCap; summary.vestibule += openVest; }
  }

  s.lastSavedAt = nowMs;
  return { state: s, summary };
}

export { seatCapacity, baseSeats, vestibuleCapacity } from './sanctuary.js';
