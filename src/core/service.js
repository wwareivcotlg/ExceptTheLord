// ============================================================
// service.js — the sanctuary service.
//
// The largest payout in the game, and the one moment that must be
// worth opening the app for. Everything the ministry tree builds
// toward lands here as `service_multiplier`.
//
// THE SMART DEFAULT: the game pre-selects the best-fit sermon and
// says WHY ("Mostly strangers today"). One tap accepts it. A second
// tap opens the list. Casual players never face a decision;
// engaged players get a real one, because the right answer changes
// with who is actually in the pews.
// ============================================================

import { SERMONS, SERMON_BY_ID, AUDIENCE_LABELS,
         PREACHER_REST_S, PREACHER_REST_SABBATH_S } from '../data/sermons.js';
import { NEED_BY_ID } from '../data/needs.js';
import { resolveModifiers } from './modifiers.js';
import { congregationMix, completeService as clearAndRefill } from './sanctuary.js';

export const SERVICE_REASONS = {
  EMPTY: 'Nobody is seated yet.',
  IN_PROGRESS: 'Service is already underway.',
  RESTING: 'The preacher is resting.',
  LOCKED: 'That sermon is not prepared yet.',
};

/** Sermons the player has unlocked, plus what the rest would cost. */
export function sermonLibrary(state) {
  const owned = new Set(state.sermons || ['come_unto_me']);
  return SERMONS.map((s) => ({
    ...s,
    unlocked: owned.has(s.id) || (s.unlock?.favor ?? 0) === 0,
    affordable: (state.currency.favor || 0) >= (s.unlock?.favor ?? 0),
  }));
}

export function unlockSermon(state, sermonId) {
  const def = SERMON_BY_ID[sermonId];
  if (!def) return { ok: false, reason: SERVICE_REASONS.LOCKED };
  state.sermons = state.sermons || ['come_unto_me'];
  if (state.sermons.includes(sermonId)) return { ok: false, reason: 'already_prepared' };
  const cost = def.unlock?.favor ?? 0;
  if ((state.currency.favor || 0) < cost) return { ok: false, reason: 'not_enough_favor' };
  state.currency.favor -= cost;
  state.sermons.push(sermonId);
  return { ok: true, cost };
}

/** Who is in the pews, and which group dominates. */
export function audienceProfile(state) {
  const mix = congregationMix(state);
  const total = mix.stranger + mix.member + mix.youth;
  if (total === 0) return { ...mix, total: 0, dominant: 'mixed' };

  const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const [topName, topCount] = entries[0];
  // "Dominant" needs a real majority, otherwise the room is mixed
  // and the recommendation should say so rather than overclaim.
  const dominant = topCount / total >= 0.5 ? topName : 'mixed';
  return { ...mix, total, dominant };
}

/** Expected payout for preaching this sermon to this room, right now. */
export function sermonPayout(state, sermonId, atMs) {
  const def = SERMON_BY_ID[sermonId];
  const mix = congregationMix(state);
  const mods = resolveModifiers(state, atMs);
  const base = NEED_BY_ID.word;

  let offering = 0, favor = 0, xp = 0;
  for (const [category, count] of Object.entries(mix)) {
    if (!count) continue;
    const fit = def.affinity[category] ?? 1;
    offering += count * base.offering * def.payout.offering * fit;
    favor += count * base.favor * def.payout.favor * fit;
    xp += count * base.xp * def.payout.xp * fit;
  }

  const multiplier = mods.service_multiplier;
  return {
    offering: Math.round(offering * multiplier),
    favor: Math.round(favor * multiplier * mods.favor_gain),
    xp: Math.round(xp * multiplier),
    multiplier,
    congregation: mix.stranger + mix.member + mix.youth,
  };
}

/**
 * The best-fit sermon for the room as it stands, and a plain
 * sentence explaining the choice.
 *
 * RANKED BY OFFERING PER MINUTE, not by total. Ranking on total
 * makes the longest sermon win every room — its payout multiplier
 * swamps every affinity difference, the recommendation stops
 * changing, and the choice stops being a choice. Per-minute keeps
 * affinity decisive while leaving the long sermons genuinely
 * better for a player who is about to put the phone down. The
 * sheet shows total and duration so that trade stays visible.
 */
export function recommendSermon(state, atMs) {
  const profile = audienceProfile(state);
  const available = sermonLibrary(state).filter((s) => s.unlocked);
  if (!available.length) return null;

  let best = available[0];
  let bestRate = -Infinity;
  for (const sermon of available) {
    const rate = sermonPayout(state, sermon.id, atMs).offering / sermon.durationS;
    if (rate > bestRate) { bestRate = rate; best = sermon; }
  }

  return {
    sermonId: best.id,
    title: best.title,
    scripture: best.scripture,
    reason: AUDIENCE_LABELS[profile.dominant],
    profile,
    durationS: best.durationS,
    payout: sermonPayout(state, best.id, atMs),
    perMinute: Math.round(bestRate * 60),
  };
}

// ---------- Lifecycle ----------

export function preacherRestMs(state, atMs) {
  const mods = resolveModifiers(state, atMs);
  const seconds = mods.activeEvent === 'sabbath' ? PREACHER_REST_SABBATH_S : PREACHER_REST_S;
  return seconds * 1000;
}

export function canHoldService(state, atMs) {
  if (state.sanctuary.service) return { ok: false, reason: SERVICE_REASONS.IN_PROGRESS };
  if ((state.sanctuary.seated || 0) === 0) return { ok: false, reason: SERVICE_REASONS.EMPTY };
  const restUntil = state.sanctuary.preacherRestUntil || 0;
  if (atMs < restUntil) {
    return { ok: false, reason: SERVICE_REASONS.RESTING, readyAt: restUntil };
  }
  return { ok: true };
}

export function startService(state, sermonId, atMs) {
  const check = canHoldService(state, atMs);
  if (!check.ok) return check;

  const owned = new Set(state.sermons || ['come_unto_me']);
  if (!owned.has(sermonId) && (SERMON_BY_ID[sermonId]?.unlock?.favor ?? 1) !== 0) {
    return { ok: false, reason: SERVICE_REASONS.LOCKED };
  }

  const def = SERMON_BY_ID[sermonId];
  if (!def) return { ok: false, reason: SERVICE_REASONS.LOCKED };

  state.sanctuary.service = {
    sermonId,
    startedAt: atMs,
    durationS: def.durationS,
    // Snapshot the room: latecomers shouldn't dilute or inflate the
    // payout the player was shown when they chose.
    mix: congregationMix(state),
  };
  return { ok: true, service: state.sanctuary.service, sermon: def };
}

export function serviceProgress(state, atMs) {
  const svc = state.sanctuary.service;
  if (!svc) return null;
  const total = svc.durationS * 1000;
  return {
    progress: Math.max(0, Math.min(1, (atMs - svc.startedAt) / total)),
    remainingMs: Math.max(0, svc.startedAt + total - atMs),
    sermon: SERMON_BY_ID[svc.sermonId],
  };
}

export function isServiceFinished(state, atMs) {
  const svc = state.sanctuary.service;
  return !!svc && atMs >= svc.startedAt + svc.durationS * 1000;
}

/**
 * Conclude the service: pay the whole congregation at once, fold
 * the chairs, consume the choir rehearsal buff, rest the preacher,
 * and let the vestibule file in for next time.
 */
export function finishService(state, atMs, { gradual = false } = {}) {
  const svc = state.sanctuary.service;
  if (!svc) return { ok: false, reason: 'no_service' };

  const payout = sermonPayout(state, svc.sermonId, atMs);
  state.currency.offering += payout.offering;
  state.currency.favor += payout.favor;
  state.xp = (state.xp || 0) + payout.xp;

  const cleared = clearAndRefill(state, { refill: !gradual });
  state.stats.totalServed = (state.stats.totalServed || 0) + cleared.congregation;

  // Choir rehearsal buffs exist to be spent on a service.
  state.buffs = (state.buffs || []).filter((b) => !b.consumeOnService);

  state.sanctuary.service = null;
  state.sanctuary.preacherRestUntil = atMs + preacherRestMs(state, atMs);

  return {
    ok: true,
    sermon: SERMON_BY_ID[svc.sermonId],
    ...payout,
    congregation: cleared.congregation,
    chairsUsed: cleared.chairsUsed,
    refilled: cleared.refilled,
    restUntil: state.sanctuary.preacherRestUntil,
  };
}
