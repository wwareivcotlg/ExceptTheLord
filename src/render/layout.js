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

/**
 * Convert a point expressed in a room's local space into world
 * space, honouring the room's rotation.
 */
export function localToWorld(transform, local) {
  const c = Math.cos(transform.rotationY);
  const s = Math.sin(transform.rotationY);
  return {
    x: transform.center.x + local.x * c + local.z * s,
    z: transform.center.z - local.x * s + local.z * c,
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
 * The chancel end: platform, pulpit, communion table, and where a
 * preacher stands.
 *
 * ORIENTATION IS THE WHOLE POINT, and it runs BOTH WAYS.
 *
 * The congregation sits toward +z looking at the chancel (-z).
 * Everyone ON the chancel — the preacher at the pulpit, the pastor
 * in his chair — looks the OTHER way, back at the people. Their
 * facing is the opposite sign of the congregation's, never the
 * same. Copying `plan.facing` onto the chancel is what turns the
 * pastor's back to the pews.
 *
 * Also: the preacher stands BEHIND the pulpit (more negative z),
 * and the pulpit's decorated face points at the people (+z).
 */
export function chancelLayout(size, plan, { platformDepth = 2.2 } = {}) {
  const platformZ = -size.d / 2 + 1.5;
  const pulpitZ = plan.chancelZ;
  const towardCongregation = -plan.facing;   // +1
  // One value, used by everything that stands on the chancel.
  const facesCongregation = towardCongregation;

  return {
    facesCongregation,
    platform: { x: 0, z: platformZ, w: size.w - 0.6, d: platformDepth, h: 0.22 },
    platformFront: platformZ + platformDepth / 2,
    pulpit: { x: 0, z: pulpitZ, w: 1.0, h: 0.95, d: 0.55 },
    // Decorated face, offset toward the people.
    pulpitFace: { x: 0, z: pulpitZ + towardCongregation * 0.29, w: 0.62, h: 0.34 },
    // Where the preacher stands: behind the pulpit, looking OUT at
    // the people — the opposite way from the congregation.
    preacher: { x: 0, z: pulpitZ - towardCongregation * 0.55, facing: facesCongregation },
    table: { x: 0, z: -size.d / 2 + 3.0, w: 1.6, d: 0.6, h: 0.5 },
    // The pastor's chair, set to one side of the platform and
    // facing the people — he watches the service from here.
    chair: {
      x: -(size.w / 2) + 1.1,
      z: platformZ,
      w: 0.7, d: 0.6, h: 0.9,
      seatY: 0.22 + 0.36,          // platform top + seat height
      // He watches the service FROM here, so he faces the people —
      // not the same way they do.
      facing: facesCongregation,
    },
    towardCongregation,
  };
}

/**
 * Individual seats along the pews, front rows filled first.
 *
 * A congregation fills a church from the front on the Sabbath and
 * from the back otherwise, but front-first reads better: the
 * sanctuary looks occupied rather than scattered.
 *
 * seatPitch is deliberately tight (0.45 against a ~0.34 body).
 * Church pews ARE tight, and the geometry must be able to hold
 * what the rules promise — a test asserts slots >= baseSeats.
 */
export function seatSlots(size, plan, capacity, { seatPitch = 0.45 } = {}) {
  const slots = [];
  const perBench = Math.max(1, Math.floor(plan.benches[0].width / seatPitch));

  // Rows front-to-back; within a row, left bench then right bench.
  const rows = [];
  for (let i = 0; i < plan.rows; i++) {
    rows.push(plan.benches.filter((b, j) => Math.floor(j / 2) === i));
  }

  for (const row of rows) {
    for (const bench of row) {
      for (let k = 0; k < perBench && slots.length < capacity; k++) {
        const spread = (k - (perBench - 1) / 2) * seatPitch;
        slots.push({
          x: bench.x + spread,
          z: bench.z,
          facing: plan.facing,      // everyone looks toward the chancel
          side: bench.side,
        });
      }
    }
    if (slots.length >= capacity) break;
  }
  return slots;
}

// Top surface of a pew seat, in room-local units. Derived from the
// pew mesh in render/church.js — if that changes, change this.
export const SEAT_TOP_Y = 0.58;

/**
 * How a figure is posed when sitting.
 *
 * Two things this must get right, both of which were wrong first
 * time: the body has to LOWER so the hips meet the seat, and the
 * legs have to fold FORWARD — toward the chancel, the same way the
 * person is looking. Legs folding backward reads as kneeling on
 * the pew.
 *
 * @param {number} legHeight  the figure's leg length
 * @param {number} facing     -1 when the congregation looks toward -z
 */
export function seatedPose(legHeight, facing = -1, seatTop = SEAT_TOP_Y) {
  return {
    // Drop the whole figure until its hips rest on the seat.
    groupY: seatTop - legHeight,
    // Thighs run horizontally out from the hip, in the facing direction.
    legRotX: -Math.PI / 2,
    legY: legHeight * 0.95,
    legZ: facing * legHeight * 0.42,
    // The figure's own forward is -z, so a congregation facing -z
    // needs NO extra half turn. Adding one aims them at the back wall.
    extraYaw: facing < 0 ? 0 : Math.PI,
  };
}

/**
 * Where folding chairs stand when the deacons bring them out —
 * the side margins pewLayout reserved, one chair per row per side.
 */
export function chairSlots(size, plan, count, { chairPitch = 0.55 } = {}) {
  const x = size.w / 2 - plan.sideMargin / 2;
  const slots = [];

  // Chairs run the length of the side margin, not one per pew row.
  // Tying them to rows capped the aisles at six chairs, while the
  // Trustee Board can put out ten.
  const zStart = plan.benches[0].z;
  const zEnd = size.d / 2 - 0.8;
  const perSide = Math.max(1, Math.floor((zEnd - zStart) / chairPitch) + 1);

  for (let i = 0; i < perSide && slots.length < count; i++) {
    const z = zStart + i * chairPitch;
    slots.push({ x: -x, z, side: 'left', facing: plan.facing, chair: true });
    if (slots.length < count) {
      slots.push({ x, z, side: 'right', facing: plan.facing, chair: true });
    }
  }
  return slots;
}

/**
 * Every place a person can sit right now: the pews first, then any
 * folding chairs the deacons have set out.
 *
 * seatCapacity() counts pews PLUS folding chairs, so a renderer
 * that only knows about pews leaves everyone on a chair invisible.
 * One list, in the same order seats are claimed.
 */
export function allSeatSlots(size, plan, { pews, tempSeats = 0 } = {}) {
  const seats = seatSlots(size, plan, pews);
  if (tempSeats > 0) seats.push(...chairSlots(size, plan, tempSeats));
  return seats;
}
