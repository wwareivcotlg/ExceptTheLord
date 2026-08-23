// ============================================================
// pastor.js — the one person always in the room.
//
// A small state machine, kept pure so the whole cycle can be
// stepped with fake time and asserted without a renderer.
//
//   seated → rising → preaching → dismissing → waving → returning
//     ↑                                                     │
//     └─────────────────────────────────────────────────────┘
//
// He is cast ONCE and stored, because a pastor whose face changes
// between services is not a pastor. Per COTLG polity the office
// may be held by a man or a woman, and casting enforces that.
// ============================================================

import { PASTOR } from '../data/characters.js';
import { castRole } from './casting.js';
import { bucketRng, hash } from './rng.js';

export const PHASES = ['seated', 'rising', 'preaching', 'dismissing', 'waving', 'returning'];

const DURATION = {
  rising: PASTOR.RISE_MS,
  dismissing: PASTOR.DISMISS_MS,
  waving: PASTOR.WAVE_MS,
  returning: PASTOR.RETURN_MS,
};

/** Cast him once and remember him. */
export function ensurePastor(state, playerId = 'local') {
  state.pastor = state.pastor || {};
  if (!state.pastor.appearance) {
    const rng = bucketRng(`${playerId}:pastor`, hash(playerId) & 0xff);
    state.pastor.appearance = castRole(state, 'pastor', rng);
    state.pastor.phase = 'seated';
    state.pastor.since = state.lastSavedAt || 0;
  }
  return state.pastor;
}

function enter(pastor, phase, atMs) {
  pastor.phase = phase;
  pastor.since = atMs;
  return phase;
}

/**
 * Advance one step. Idempotent with respect to time.
 * @returns {{phase, changed, line}}
 */
export function advancePastor(state, atMs, { serviceActive = false } = {}) {
  const p = ensurePastor(state);
  const before = p.phase;
  const elapsed = atMs - (p.since || 0);
  let line = null;

  switch (p.phase) {
    case 'seated':
      if (serviceActive) enter(p, 'rising', atMs);
      break;

    case 'rising':
      if (elapsed >= DURATION.rising) enter(p, 'preaching', atMs);
      // If the service was cancelled mid-stride, sit back down.
      else if (!serviceActive) enter(p, 'returning', atMs);
      break;

    case 'preaching':
      // The service ending is what sends him into the benediction.
      if (!serviceActive) {
        enter(p, 'dismissing', atMs);
        line = pick(PASTOR.benediction, atMs);
      }
      break;

    case 'dismissing':
      if (elapsed >= DURATION.dismissing) {
        enter(p, 'waving', atMs);
        line = pick(PASTOR.farewell, atMs);
      }
      break;

    case 'waving':
      // He stays until the room has cleared, or until time is up.
      if (elapsed >= DURATION.waving) enter(p, 'returning', atMs);
      break;

    case 'returning':
      if (elapsed >= DURATION.returning) enter(p, 'seated', atMs);
      else if (serviceActive) enter(p, 'rising', atMs);
      break;

    default:
      enter(p, 'seated', atMs);
  }

  return { phase: p.phase, changed: p.phase !== before, line };
}

function pick(lines, seed) {
  return lines[Math.floor((seed / 1000) % lines.length)];
}

/** Fraction through the current phase, 0..1. */
export function phaseProgress(state, atMs) {
  const p = state.pastor;
  if (!p) return 0;
  const total = DURATION[p.phase];
  if (!total) return 1;
  return Math.max(0, Math.min(1, (atMs - (p.since || 0)) / total));
}

/**
 * Where he is and what he is doing, in room-local space.
 *
 * @param {object} chancel from chancelLayout()
 * @returns {{x, z, facing, action, progress}}
 *   action: 'sit' | 'walk' | 'stand' | 'wave'
 */
export function pastorPose(state, chancel, atMs) {
  const p = state.pastor || { phase: 'seated' };
  const t = phaseProgress(state, atMs);
  const chair = { x: chancel.chair.x, z: chancel.chair.z };
  // He stands behind the pulpit, not on top of it.
  const stand = { x: chancel.preacher.x, z: chancel.preacher.z };
  const lerp = (a, b, f) => a + (b - a) * f;

  switch (p.phase) {
    case 'rising':
      return { ...between(chair, stand, ease(t), lerp), facing: chancel.chair.facing,
               action: 'walk', progress: t };
    case 'preaching':
      return { ...stand, facing: chancel.chair.facing, action: 'stand', progress: t };
    case 'dismissing':
      return { ...stand, facing: chancel.chair.facing, action: 'wave', progress: t };
    case 'waving':
      return { ...stand, facing: chancel.chair.facing, action: 'wave', progress: t };
    case 'returning':
      return { ...between(stand, chair, ease(t), lerp), facing: chancel.chair.facing,
               action: 'walk', progress: t };
    default:
      return { ...chair, facing: chancel.chair.facing, action: 'sit', progress: 1 };
  }
}

const ease = (t) => t * t * (3 - 2 * t);
const between = (a, b, f, lerp) => ({ x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f) });

/** Is he currently able to begin a service? Used only for display. */
export function pastorBusy(state) {
  return state.pastor && state.pastor.phase !== 'seated';
}
