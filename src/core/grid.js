// ============================================================
// grid.js — the church floor: rotation, occupancy, placement.
//
// Free placement is more fun than a fixed floorplan, and the cost
// is that visitors must PATH to rooms the player positioned
// arbitrarily. Everything here exists to guarantee that a
// committed placement is always reachable.
//
// Rotation is clockwise, in 90-degree steps.
// ============================================================

import { ROOM_BY_ID } from '../data/rooms.js';
import { TUNING } from '../data/tuning.js';

export const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const DIR_ORDER = ['n', 'e', 's', 'w'];

/** Footprint dimensions after rotation. */
export function rotatedSize([w, h], rot) {
  return rot === 90 || rot === 270 ? [h, w] : [w, h];
}

/** Map a local tile inside a w×h footprint to its rotated position. */
export function rotateLocal(lx, ly, w, h, rot) {
  switch (rot) {
    case 90: return [h - 1 - ly, lx];
    case 180: return [w - 1 - lx, h - 1 - ly];
    case 270: return [ly, w - 1 - lx];
    default: return [lx, ly];
  }
}

/** Rotate a facing direction clockwise. */
export function rotateFacing(facing, rot) {
  const i = DIR_ORDER.indexOf(facing);
  return DIR_ORDER[(i + rot / 90) % 4];
}

/** Every world tile a placement would occupy. */
export function footprintTiles(roomId, x, y, rot) {
  const def = ROOM_BY_ID[roomId];
  const [w, h] = def.footprint;
  const tiles = [];
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const [rx, ry] = rotateLocal(lx, ly, w, h, rot);
      tiles.push({ x: x + rx, y: y + ry });
    }
  }
  return tiles;
}

/** The door tile itself (inside the footprint) and the tile outside it. */
export function doorAndApproach(roomId, x, y, rot) {
  const def = ROOM_BY_ID[roomId];
  const [w, h] = def.footprint;
  const [dlx, dly] = def.door;
  const [rx, ry] = rotateLocal(dlx, dly, w, h, rot);
  const door = { x: x + rx, y: y + ry };
  const [dx, dy] = DIRS[rotateFacing(def.doorFacing, rot)];
  return { door, approach: { x: door.x + dx, y: door.y + dy } };
}

// ---------- Occupancy ----------

export function gridSize(state) {
  return state.grid || TUNING.GRID_BY_RANK.mission;
}

export const idx = (x, y, w) => y * w + x;

export function inBounds(state, x, y) {
  const { w, h } = gridSize(state);
  return x >= 0 && y >= 0 && x < w && y < h;
}

/**
 * Blocked-tile map. 1 = a room stands here, 0 = walkable floor.
 * @param {object} state
 * @param {object} [extra] optional pending placement to include
 */
export function buildOccupancy(state, extra = null) {
  const { w, h } = gridSize(state);
  const occ = new Uint8Array(w * h);
  const mark = (roomId, x, y, rot) => {
    for (const t of footprintTiles(roomId, x, y, rot)) {
      if (t.x >= 0 && t.y >= 0 && t.x < w && t.y < h) occ[idx(t.x, t.y, w)] = 1;
    }
  };
  for (const r of state.rooms) mark(r.id, r.x, r.y, r.rot || 0);
  for (const c of state.construction || []) mark(c.roomId, c.x, c.y, c.rot || 0);
  if (extra) mark(extra.roomId, extra.x, extra.y, extra.rot || 0);
  return occ;
}

export function isWalkable(state, occ, x, y) {
  return inBounds(state, x, y) && occ[idx(x, y, gridSize(state).w)] === 0;
}

/** Flood fill from a tile; returns the set of reachable tile keys. */
export function reachableFrom(state, occ, start) {
  const { w } = gridSize(state);
  const seen = new Set();
  if (!isWalkable(state, occ, start.x, start.y)) return seen;
  const queue = [start];
  seen.add(`${start.x},${start.y}`);
  while (queue.length) {
    const cur = queue.pop();
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !isWalkable(state, occ, nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// ---------- Placement ----------

export const PLACEMENT_REASONS = {
  OUT_OF_BOUNDS: 'That would reach past the church walls.',
  OVERLAPS: 'Another room already stands there.',
  BLOCKS_ENTRANCE: 'That would block the front door.',
  DOOR_BLOCKED: "The room's own door would be walled in.",
  UNREACHABLE: 'No one could reach that room from the entrance.',
  STRANDS_ROOM: 'That would cut off another room.',
};

/**
 * Can this room go here? Called on every preview frame, so it must
 * be cheap and must explain itself when it says no.
 * @returns {{valid: boolean, reason?: string, strands?: string}}
 */
export function validatePlacement(state, roomId, x, y, rot = 0, { ignoreRoom = null } = {}) {
  const { w, h } = gridSize(state);
  const tiles = footprintTiles(roomId, x, y, rot);

  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= h) {
      return { valid: false, reason: PLACEMENT_REASONS.OUT_OF_BOUNDS };
    }
  }

  const entrance = state.grid.entrance;
  if (tiles.some((t) => t.x === entrance.x && t.y === entrance.y)) {
    return { valid: false, reason: PLACEMENT_REASONS.BLOCKS_ENTRANCE };
  }

  // Occupancy of everything EXCEPT the room being moved.
  const others = {
    ...state,
    rooms: state.rooms.filter((r) => r.id !== ignoreRoom),
  };
  const existing = buildOccupancy(others);
  for (const t of tiles) {
    if (existing[idx(t.x, t.y, w)] === 1) {
      return { valid: false, reason: PLACEMENT_REASONS.OVERLAPS };
    }
  }

  // With the room in place, can people still get where they need to go?
  const occ = buildOccupancy(others, { roomId, x, y, rot });
  const reach = reachableFrom(state, occ, entrance);

  const { approach } = doorAndApproach(roomId, x, y, rot);
  if (!isWalkable(state, occ, approach.x, approach.y)) {
    return { valid: false, reason: PLACEMENT_REASONS.DOOR_BLOCKED };
  }
  if (!reach.has(`${approach.x},${approach.y}`)) {
    return { valid: false, reason: PLACEMENT_REASONS.UNREACHABLE };
  }

  // And does it strand anything already standing?
  for (const r of others.rooms) {
    const a = doorAndApproach(r.id, r.x, r.y, r.rot || 0).approach;
    if (!reach.has(`${a.x},${a.y}`)) {
      return { valid: false, reason: PLACEMENT_REASONS.STRANDS_ROOM, strands: r.id };
    }
  }

  return { valid: true };
}

/** Every legal (x, y) for a room at a given rotation. For build hints. */
export function legalPlacements(state, roomId, rot = 0) {
  const { w, h } = gridSize(state);
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (validatePlacement(state, roomId, x, y, rot).valid) out.push({ x, y, rot });
    }
  }
  return out;
}

// ---------- Debug ----------

/**
 * ASCII floor plan. Lets step 2 be validated with no renderer:
 *   .  walkable   #  room   D  door   +  approach   E  entrance
 */
export function asciiMap(state) {
  const { w, h } = gridSize(state);
  const occ = buildOccupancy(state);
  const chars = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(occ[idx(x, y, w)] ? '#' : '.');
    chars.push(row);
  }
  for (const r of state.rooms) {
    const { door, approach } = doorAndApproach(r.id, r.x, r.y, r.rot || 0);
    if (inBounds(state, door.x, door.y)) chars[door.y][door.x] = 'D';
    if (inBounds(state, approach.x, approach.y)) chars[approach.y][approach.x] = '+';
  }
  const e = state.grid.entrance;
  if (inBounds(state, e.x, e.y)) chars[e.y][e.x] = 'E';
  return chars.map((r) => r.join('')).join('\n');
}
