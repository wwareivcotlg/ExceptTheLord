// ============================================================
// layout.js — grid space to world space. NO Three.js here.
//
// Kept pure so placement, rotation, and path geometry can be
// tested headless. render/church.js consumes these numbers.
//
// AXES: grid x → world x, grid y → world z. Grid rotation is
// clockwise viewed from above; in a y-up world that is negative
// rotation about Y.
// ============================================================

import { ROOM_BY_ID } from '../data/rooms.js';
import { rotatedSize, doorAndApproach, gridSize } from '../core/grid.js';

export const TILE = 1;

/** Centre of a grid tile, in world units, with the church centred on origin. */
export function tileToWorld(state, x, y) {
  const { w, h } = gridSize(state);
  return {
    x: (x - w / 2 + 0.5) * TILE,
    z: (y - h / 2 + 0.5) * TILE,
  };
}

/** World extent of the whole floor. */
export function floorExtent(state) {
  const { w, h } = gridSize(state);
  return { width: w * TILE, depth: h * TILE };
}

/**
 * Everything render/church.js needs to place one room mesh.
 * @returns {{center, size, rotationY, door, approach}}
 */
export function roomTransform(state, room) {
  const def = ROOM_BY_ID[room.id];
  const rot = room.rot || 0;
  const [rw, rh] = rotatedSize(def.footprint, rot);

  // The footprint's world-space centre: origin is its top-left tile.
  const topLeft = tileToWorld(state, room.x, room.y);
  const center = {
    x: topLeft.x + ((rw - 1) * TILE) / 2,
    z: topLeft.z + ((rh - 1) * TILE) / 2,
  };

  const { door, approach } = doorAndApproach(room.id, room.x, room.y, rot);
  return {
    center,
    size: { w: rw * TILE, d: rh * TILE },
    rotationY: (-rot * Math.PI) / 180,
    door: tileToWorld(state, door.x, door.y),
    approach: tileToWorld(state, approach.x, approach.y),
  };
}

/** A grid path as world points, ready to lerp a walker along. */
export function pathToWorld(state, path) {
  return (path || []).map((t) => tileToWorld(state, t.x, t.y));
}

/**
 * Camera framing for the current grid: where to look, and how far
 * out the camera must sit to see the whole floor.
 */
export function cameraFrame(state) {
  const { width, depth } = floorExtent(state);
  return {
    target: { x: 0, y: 0, z: 0 },
    span: Math.max(width, depth),
    minDistance: Math.max(width, depth) * 0.35,
    maxDistance: Math.max(width, depth) * 1.6,
    bounds: { x: width / 2, z: depth / 2 },
  };
}

/**
 * Row/aisle plan for procedural pews inside a sanctuary footprint.
 *
 * sideMargin is not decoration: it's where the deacons set out the
 * folding chairs. Pews that span the full width leave the overflow
 * seating mechanic nowhere to go.
 */
export function pewLayout(
  size,
  { aisle = 1.5, rowGap = 1.15, front = 3.2, back = 0.8, sideMargin = 0.62,
    backOffset = 0.2 } = {}
) {
  const usableDepth = size.d - front - back;
  const rows = Math.max(1, Math.floor(usableDepth / rowGap));
  const halfWidth = (size.w - aisle - sideMargin * 2) / 2;

  // The chancel is at the far (negative z) end. Everything about
  // seating orients to it: sitters look toward -z, so the backrest
  // must sit BEHIND them at +z. Put the backrest on the chancel
  // side and the whole congregation faces the back wall.
  const chancelZ = -size.d / 2 + 1.35;
  const facing = -1;

  const benches = [];
  for (let i = 0; i < rows; i++) {
    const z = -size.d / 2 + front + i * rowGap;
    const common = { z, width: halfWidth, facing, backZ: z - facing * backOffset };
    benches.push(
      { ...common, x: -(aisle / 2 + halfWidth / 2), side: 'left' },
      { ...common, x: aisle / 2 + halfWidth / 2, side: 'right' }
    );
  }
  return { rows, benches, aisle, sideMargin, chancelZ, facing, backOffset };
}

/**
 * Where folding chairs stand when the deacons bring them out —
 * the side margins pewLayout reserved, one chair per row per side.
 */
export function chairSlots(size, plan, count) {
  const x = size.w / 2 - plan.sideMargin / 2;
  const slots = [];
  for (let i = 0; i < plan.rows && slots.length < count; i++) {
    const z = -size.d / 2 + 3.2 + i * plan.rowGap ?? 0;
    const rowZ = plan.benches[i * 2]?.z ?? z;
    slots.push({ x: -x, z: rowZ, side: 'left' });
    if (slots.length < count) slots.push({ x, z: rowZ, side: 'right' });
  }
  return slots;
}
