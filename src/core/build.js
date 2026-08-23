// ============================================================
// build.js — turning Offering into rooms.
//
// Every rule about what you may build, where, and what it costs
// lives here. No rendering: the placement UI asks these questions
// and draws the answers.
//
// REFUND POLICY: cancelling a build refunds in full, and moving a
// room costs Offering but never Favor. There is no monetization
// and nothing competitive here — punishing a player for changing
// their mind about a floor plan buys nothing.
// ============================================================

import { ROOMS, ROOM_BY_ID } from '../data/rooms.js';
import { TUNING } from '../data/tuning.js';
import { validatePlacement, legalPlacements } from './grid.js';

export const MOVE_REASONS = {
  DURING_SERVICE: 'Not while service is going on.',
  NOT_BUILT: 'That room is not built.',
};

export const BUILD_REASONS = {
  ALREADY_BUILT: 'You already have one.',
  UNDER_CONSTRUCTION: 'Already being built.',
  LOCKED: 'Not available yet.',
  CANNOT_AFFORD: 'Not enough offering.',
  NO_ROOM_ON_GRID: 'No space left for it.',
};

export function canAfford(state, cost = {}) {
  return (
    (state.currency.offering || 0) >= (cost.offering || 0) &&
    (state.currency.favor || 0) >= (cost.favor || 0)
  );
}

function pay(state, cost = {}) {
  state.currency.offering -= cost.offering || 0;
  state.currency.favor -= cost.favor || 0;
}

function refund(state, cost = {}) {
  state.currency.offering += cost.offering || 0;
  state.currency.favor += cost.favor || 0;
}

/** Is this room available to build right now, and if not, why not? */
export function buildStatus(state, roomId) {
  const def = ROOM_BY_ID[roomId];
  if (!def) return { ok: false, reason: BUILD_REASONS.LOCKED };

  if (state.rooms.some((r) => r.id === roomId)) {
    return { ok: false, reason: BUILD_REASONS.ALREADY_BUILT };
  }
  if ((state.construction || []).some((c) => c.roomId === roomId)) {
    return { ok: false, reason: BUILD_REASONS.UNDER_CONSTRUCTION };
  }
  if (def.unlock?.level && (state.level || 1) < def.unlock.level) {
    return { ok: false, reason: BUILD_REASONS.LOCKED, unlocksAt: def.unlock.level };
  }
  if (!canAfford(state, def.cost)) {
    return { ok: false, reason: BUILD_REASONS.CANNOT_AFFORD, cost: def.cost };
  }
  return { ok: true, cost: def.cost };
}

/**
 * Everything the build menu needs to render, in one call.
 * Rooms already built are omitted; locked ones are shown greyed so
 * the player can see what's coming.
 */
export function buildCatalog(state) {
  return ROOMS
    .filter((def) => def.cost && (def.cost.offering || def.cost.favor))
    .map((def) => {
      const status = buildStatus(state, def.id);
      return {
        id: def.id,
        name: def.name,
        footprint: def.footprint,
        cost: def.cost,
        buildS: def.buildS,
        produces: def.production?.supply ?? null,
        unlocksAt: def.unlock?.level ?? null,
        available: status.ok,
        reason: status.ok ? null : status.reason,
        built: state.rooms.some((r) => r.id === def.id),
      };
    })
    .filter((entry) => !entry.built);
}

/**
 * Begin construction. Validates money AND placement before taking
 * anything — a half-committed build is the worst possible outcome.
 */
export function startConstruction(state, roomId, x, y, rot, atMs) {
  const status = buildStatus(state, roomId);
  if (!status.ok) return { ok: false, reason: status.reason };

  const placement = validatePlacement(state, roomId, x, y, rot);
  if (!placement.valid) {
    return { ok: false, reason: placement.reason, strands: placement.strands };
  }

  const def = ROOM_BY_ID[roomId];
  pay(state, def.cost);

  const site = { roomId, x, y, rot: rot || 0, startedAt: atMs, durationS: def.buildS };
  state.construction = state.construction || [];
  state.construction.push(site);

  return { ok: true, site, cost: def.cost };
}

/** Cancel a site and refund it in full. */
export function cancelConstruction(state, roomId) {
  const idx = (state.construction || []).findIndex((c) => c.roomId === roomId);
  if (idx === -1) return { ok: false, reason: 'not_building' };
  const [site] = state.construction.splice(idx, 1);
  const def = ROOM_BY_ID[site.roomId];
  refund(state, def.cost);
  return { ok: true, refunded: def.cost };
}

/** Cost to reposition an existing room. Offering only, never Favor. */
export function moveCost() {
  return { offering: TUNING.MOVE_ROOM_COST };
}

export function canMoveTo(state, roomId, x, y, rot) {
  return validatePlacement(state, roomId, x, y, rot, { ignoreRoom: roomId });
}

/**
 * Can this room be picked up right now?
 *
 * The sanctuary CAN be moved — it is a room like any other, and
 * repath() keeps everyone routed when it goes. What must not happen
 * is moving it mid-service: that would teleport the pastor out of
 * the pulpit and a seated congregation along with him.
 */
export function canPickUp(state, roomId) {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false, reason: MOVE_REASONS.NOT_BUILT };
  if (roomId === 'sanctuary' && state.sanctuary?.service) {
    return { ok: false, reason: MOVE_REASONS.DURING_SERVICE };
  }
  return { ok: true };
}

/** Reposition a built room. */
export function moveRoom(state, roomId, x, y, rot) {
  const pickup = canPickUp(state, roomId);
  if (!pickup.ok) return { ok: false, reason: pickup.reason };
  const room = state.rooms.find((r) => r.id === roomId);

  const cost = moveCost();
  if (!canAfford(state, cost)) return { ok: false, reason: BUILD_REASONS.CANNOT_AFFORD, cost };

  const check = canMoveTo(state, roomId, x, y, rot);
  if (!check.valid) return { ok: false, reason: check.reason, strands: check.strands };

  pay(state, cost);
  room.x = x;
  room.y = y;
  room.rot = rot || 0;
  return { ok: true, cost };
}

/**
 * A sensible opening position for the placement ghost: the first
 * legal spot, so the player never starts on an invalid tile.
 */
export function suggestPlacement(state, roomId, rot = 0) {
  const spots = legalPlacements(state, roomId, rot);
  if (!spots.length) return null;
  const entrance = state.grid.entrance;
  // Closest to the front door — people should not have to walk far.
  return spots.reduce((best, s) => {
    const d = Math.abs(s.x - entrance.x) + Math.abs(s.y - entrance.y);
    return d < best.d ? { ...s, d } : best;
  }, { ...spots[0], d: Infinity });
}

/** True if a room could be placed anywhere at all right now. */
export function hasSpaceFor(state, roomId) {
  for (const rot of [0, 90, 180, 270]) {
    if (legalPlacements(state, roomId, rot).length) return true;
  }
  return false;
}
