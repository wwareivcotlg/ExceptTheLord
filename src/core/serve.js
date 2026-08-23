// ============================================================
// serve.js — what a served need is worth.
//
// One place for payout math so the live loop and the offline
// resolver can never drift apart.
//
// THE TAP BONUS: tapping a waiting visitor serves them instantly
// and pays a little extra. Crucially it is a BONUS, not a
// requirement — material needs still auto-serve on their own
// after a moment, which is what makes an absence harmless.
// ============================================================

import { NEED_BY_ID } from '../data/needs.js';
import { resolveModifiers } from './modifiers.js';

export const TAP_BONUS = 0.25;

export function canServe(state, needId) {
  const need = NEED_BY_ID[needId];
  if (!need) return { ok: false, reason: 'unknown_need' };
  if (!state.rooms.some((r) => r.id === need.room)) {
    return { ok: false, reason: 'no_room' };
  }
  if (need.supply && (state.currency.supplies[need.supply] || 0) < need.supplyCost) {
    return { ok: false, reason: 'no_supply' };
  }
  return { ok: true };
}

/**
 * Apply a served need to state.
 * @returns {{ok, offering?, favor?, xp?, reason?}}
 */
export function serveNeed(state, needId, atMs, { tapped = false } = {}) {
  const check = canServe(state, needId);
  if (!check.ok) return { ok: false, reason: check.reason };

  const need = NEED_BY_ID[needId];
  const mods = resolveModifiers(state, atMs);
  const bonus = tapped ? 1 + TAP_BONUS : 1;

  if (need.supply) {
    state.currency.supplies[need.supply] -= need.supplyCost;
  }

  const offering = Math.round(need.offering * bonus);
  const favor = Math.round(need.favor * bonus * mods.favor_gain);
  const xp = Math.round(need.xp * bonus);

  state.currency.offering += offering;
  state.currency.favor += favor;
  state.xp += xp;
  state.stats.totalServed = (state.stats.totalServed || 0) + 1;

  return { ok: true, offering, favor, xp, tapped };
}
