// ============================================================
// pathfinding.js — grid A* from the entrance to each room door.
//
// A church has FEW destinations and MANY visitors, so paths are
// cached per destination and recomputed only when the layout
// changes. Twenty people walking to the Fellowship Hall share one
// computed path.
// ============================================================

import {
  DIRS,
  gridSize,
  idx,
  isWalkable,
  buildOccupancy,
  doorAndApproach,
} from '../core/grid.js';

const key = (x, y) => `${x},${y}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * A* over walkable tiles, 4-directional.
 * @returns {Array<{x,y}>|null} inclusive path, or null if unreachable
 */
export function findPath(state, occ, start, goal) {
  if (!isWalkable(state, occ, start.x, start.y)) return null;
  if (!isWalkable(state, occ, goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [start];

  const { w } = gridSize(state);
  const open = [{ ...start, f: manhattan(start, goal) }];
  const cameFrom = new Map();
  const g = new Map([[key(start.x, start.y), 0]]);
  const closed = new Set();

  while (open.length) {
    // Small maps; a linear scan beats the constant factor of a heap.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);

    if (cur.x === goal.x && cur.y === goal.y) {
      const path = [{ x: cur.x, y: cur.y }];
      let step = ck;
      while (cameFrom.has(step)) {
        const prev = cameFrom.get(step);
        path.unshift({ x: prev.x, y: prev.y });
        step = key(prev.x, prev.y);
      }
      return path;
    }

    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!isWalkable(state, occ, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const tentative = (g.get(ck) ?? Infinity) + 1;
      if (tentative < (g.get(nk) ?? Infinity)) {
        g.set(nk, tentative);
        cameFrom.set(nk, { x: cur.x, y: cur.y });
        open.push({ x: nx, y: ny, f: tentative + manhattan({ x: nx, y: ny }, goal) });
      }
    }
  }
  return null;
}

/**
 * Caches entrance→room paths. Create one per session; call
 * invalidate() whenever a room is built, moved, or removed.
 */
export class PathCache {
  constructor() {
    this.paths = new Map();
    this.occ = null;
    this.misses = 0;
    this.hits = 0;
  }

  invalidate() {
    this.paths.clear();
    this.occ = null;
  }

  occupancy(state) {
    if (!this.occ) this.occ = buildOccupancy(state);
    return this.occ;
  }

  /** Path from the church entrance to a room's approach tile. */
  toRoom(state, roomId) {
    if (this.paths.has(roomId)) { this.hits++; return this.paths.get(roomId); }
    this.misses++;
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) { this.paths.set(roomId, null); return null; }
    const { approach } = doorAndApproach(room.id, room.x, room.y, room.rot || 0);
    const path = findPath(state, this.occupancy(state), state.grid.entrance, approach);
    this.paths.set(roomId, path);
    return path;
  }

  /** Warm every destination at once — cheap, and avoids hitches mid-scene. */
  warm(state) {
    for (const r of state.rooms) this.toRoom(state, r.id);
    return this;
  }

  /** True if every built room can be walked to from the entrance. */
  allReachable(state) {
    return state.rooms.every((r) => this.toRoom(state, r.id) !== null);
  }
}

/** Walking distance in tiles, or Infinity if there's no route. */
export function distanceToRoom(state, cache, roomId) {
  const path = cache.toRoom(state, roomId);
  return path ? path.length - 1 : Infinity;
}
