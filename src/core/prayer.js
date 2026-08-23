// ============================================================
// prayer.js — the counseling queue.
//
// The queue cap was briefly lowered to spare the player twenty
// taps on return. That was the wrong fix: the burden was the taps,
// not the people. An Elder holds ONE prayer meeting and everyone
// waiting is served together, so the cap can stay generous.
// ============================================================

import { NEED_BY_ID } from '../data/needs.js';
import { TUNING } from '../data/tuning.js';
import { resolveModifiers } from './modifiers.js';

/**
 * One prayer meeting serves the whole queue.
 * Later arrivals earn slightly less — the first ones waited longest
 * and get the fuller attention — but nobody is left unserved.
 */
export function holdPrayerMeeting(state, atMs, { falloff = 0.06, floor = 0.5 } = {}) {
  const waiting = state.queue.length;
  if (waiting === 0) return { ok: false, reason: 'nobody_waiting' };

  const mods = resolveModifiers(state, atMs);
  const need = NEED_BY_ID.counseling;
  let offering = 0, favor = 0, xp = 0;

  state.queue.forEach((_, i) => {
    const share = Math.max(floor, 1 - i * falloff);
    offering += Math.round(need.offering * share);
    favor += Math.round(need.favor * share * mods.favor_gain);
    xp += Math.round(need.xp * share);
  });

  state.currency.offering += offering;
  state.currency.favor += favor;
  state.xp += xp;
  state.stats.totalServed = (state.stats.totalServed || 0) + waiting;
  state.queue = [];

  return { ok: true, served: waiting, offering, favor, xp };
}

export function queueCapacity(state, atMs) {
  return TUNING.COUNSEL_QUEUE_CAP + (resolveModifiers(state, atMs).queue_capacity || 0);
}
