// ============================================================
// sanctuary.js — seating, the vestibule, and folding chairs.
//
// THE VESTIBULE: Word visitors beyond seating capacity do not
// leave. They wait outside. This turns "turned away" from a loss
// into a reason to call the deacons.
//
// FOLDING CHAIRS: deacons and trustees set out extra seating.
// Costs Offering, has a cooldown, and lasts exactly ONE service.
// Deploying immediately pulls waiting people in from the vestibule.
// ============================================================

import { TUNING } from '../data/tuning.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { resolveModifiers } from './modifiers.js';

/** Permanent seats from the sanctuary room itself. */
export function baseSeats(state) {
  const sanctuary = state.rooms.find((r) => r.id === 'sanctuary');
  return sanctuary?.seats ?? ROOM_BY_ID.sanctuary.baseSeats;
}

/** Permanent seats + any folding chairs currently out. */
export function seatCapacity(state) {
  return baseSeats(state) + (state.sanctuary.tempSeats || 0);
}

/**
 * How many can wait outside before anyone genuinely leaves.
 * The Trustee Board widens this — they make room outside while the
 * player is away, without spending Offering or burning the cooldown.
 */
export function vestibuleCapacity(state, atMs = state.lastSavedAt) {
  const mods = resolveModifiers(state, atMs);
  const mult = TUNING.VESTIBULE_MULTIPLIER + (mods.vestibule_multiplier || 0);
  return Math.round(baseSeats(state) * mult);
}

// ---------- Who is in the pews ----------
//
// A count is not enough: sermon choice depends on the mix, so the
// congregation is tracked by category. Categories are mutually
// exclusive and always sum to `seated`.

const EMPTY_MIX = () => ({ stranger: 0, member: 0, youth: 0 });

export function congregationMix(state) {
  const mix = state.sanctuary.mix || EMPTY_MIX();
  return { ...EMPTY_MIX(), ...mix };
}

/** Which category a person counts as. Youth wins over stranger. */
export function categoryOf({ isStranger = false, appearance = null, isYouth = null } = {}) {
  const youth = isYouth ?? (appearance?.base?.startsWith('teen') || false);
  if (youth) return 'youth';
  return isStranger ? 'stranger' : 'member';
}

/** Seat one person and record their category. */
export function seatPerson(state, person = {}) {
  state.sanctuary.mix = state.sanctuary.mix || EMPTY_MIX();
  const cat = categoryOf(person);
  state.sanctuary.mix[cat] = (state.sanctuary.mix[cat] || 0) + 1;
  state.sanctuary.seated += 1;
  return cat;
}

/** Remove one person from the pews, keeping the mix consistent. */
export function unseatPerson(state, category = null) {
  if (state.sanctuary.seated <= 0) return;
  const mix = state.sanctuary.mix || EMPTY_MIX();
  const cat = category && mix[category] > 0
    ? category
    : Object.keys(mix).find((k) => mix[k] > 0);
  if (cat) mix[cat] -= 1;
  state.sanctuary.mix = mix;
  state.sanctuary.seated = Math.max(0, state.sanctuary.seated - 1);
}

export function clearSeats(state) {
  state.sanctuary.seated = 0;
  state.sanctuary.mix = EMPTY_MIX();
}

/**
 * Move ONE person from the vestibule to a pew, no faster than the
 * refill interval. This is what makes the changeover visible.
 * @returns {boolean} whether anyone moved
 */
export function refillStep(state, atMs) {
  if (!(state.sanctuary.vestibule > 0)) return false;
  if (state.sanctuary.seated >= seatCapacity(state)) return false;
  const last = state.sanctuary.lastRefillAt || 0;
  if (atMs - last < TUNING.REFILL_INTERVAL_MS) return false;
  state.sanctuary.lastRefillAt = atMs;
  seatPerson(state, { isStranger: false });
  state.sanctuary.vestibule -= 1;
  return true;
}

/** Move people from the vestibule into any open seat. Returns count moved. */
export function seatFromVestibule(state, rng = null) {
  const open = seatCapacity(state) - state.sanctuary.seated;
  const moved = Math.min(Math.max(0, open), state.sanctuary.vestibule || 0);
  for (let i = 0; i < moved; i++) {
    // Nobody tracked who was waiting outside, so assume the same
    // mix as the room. Members are the safe default.
    seatPerson(state, { isStranger: rng ? rng() < 0.3 : false });
  }
  state.sanctuary.vestibule -= moved;
  return moved;
}

/** How many chairs the deacons can set out, given ministries. */
export function chairCount(state, atMs) {
  const mods = resolveModifiers(state, atMs);
  return TUNING.FOLDING_CHAIRS_BASE + (mods.overflow_seats || 0);
}

export function chairCooldownMs(state, atMs) {
  const mods = resolveModifiers(state, atMs);
  // chair_cooldown_cut resolves as a multiplier (1.5 = 50% faster setup).
  return TUNING.FOLDING_CHAIR_COOLDOWN_MS / (mods.chair_cooldown_cut || 1);
}

export function chairStatus(state, atMs) {
  const count = chairCount(state, atMs);
  const cost = count * TUNING.FOLDING_CHAIR_COST;
  const readyAt = state.sanctuary.chairsReadyAt || 0;
  const alreadyOut = (state.sanctuary.tempSeats || 0) > 0;
  const waiting = state.sanctuary.vestibule || 0;

  let reason = null;
  if (alreadyOut) reason = 'already_out';
  else if (atMs < readyAt) reason = 'cooldown';
  else if (state.currency.offering < cost) reason = 'cannot_afford';
  else if (waiting === 0 && state.sanctuary.seated < baseSeats(state)) reason = 'not_needed';

  return {
    count,
    cost,
    canDeploy: reason === null,
    reason,
    cooldownRemainingMs: Math.max(0, readyAt - atMs),
    waiting,
  };
}

/**
 * Deacons bring out the folding chairs.
 * @returns {{ok: boolean, reason?: string, seated?: number, chairs?: number, cost?: number}}
 */
export function deployFoldingChairs(state, atMs) {
  const status = chairStatus(state, atMs);
  if (!status.canDeploy) return { ok: false, reason: status.reason };

  state.currency.offering -= status.cost;
  state.sanctuary.tempSeats = status.count;
  state.sanctuary.chairsReadyAt = atMs + chairCooldownMs(state, atMs);

  const seated = seatFromVestibule(state);
  return { ok: true, chairs: status.count, cost: status.cost, seated };
}

/**
 * Called when a service completes. Folding chairs are put away —
 * they last exactly one service — and the next wave files in from
 * the vestibule to fill the permanent pews.
 */
/**
 * @param {object} state
 * @param {object} [opts]
 * @param {boolean} [opts.refill] fill the pews again immediately.
 *   True while nobody is watching (offline). False in the live
 *   loop, where the vestibule files in one at a time so the
 *   changeover is something you can actually see.
 */
export function completeService(state, { refill = true } = {}) {
  const congregation = state.sanctuary.seated;
  const mix = congregationMix(state);
  const chairsUsed = state.sanctuary.tempSeats || 0;

  clearSeats(state);
  state.sanctuary.tempSeats = 0;          // chairs folded up and stored
  const refilled = refill ? seatFromVestibule(state) : 0;

  state.stats.servicesHeld = (state.stats.servicesHeld || 0) + 1;
  return { congregation, mix, chairsUsed, refilled };
}
