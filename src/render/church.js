// ============================================================
// church.js — builds the church from state. All procedural.
//
// No .glb dependencies yet: the sourcing decision is still open,
// and everything here is boxes, so it stays honest about the poly
// budget while the art direction settles.
//
// DOLLHOUSE RULE: room walls are cut to WALL_H (well below a real
// wall) so you always look down into the rooms. The sanctuary is
// the only interior that gets furniture at this stage.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { roomTransform, tileToWorld, floorExtent, pewLayout, chancelLayout, TILE } from './layout.js';
import { buildInterior } from './interiors.js';

const WALL_H = 1.25;
const WALL_T = 0.12;

const mat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, ...opts });

export function buildChurch(sceneApi, state) {
  const { scene } = sceneApi;
  const root = new THREE.Group();
  root.name = 'church';
  scene.add(root);

  root.add(buildGround(state));
  root.add(buildFloor(state));
  root.add(buildEntrance(state));

  const rooms = new THREE.Group();
  rooms.name = 'rooms';
  for (const room of state.rooms) rooms.add(buildRoom(state, room));
  root.add(rooms);

  return {
    root,
    rooms,
    /** Rebuild room meshes after a build or move. */
    refresh(nextState) {
      while (rooms.children.length) {
        const child = rooms.children.pop();
        disposeTree(child);
        rooms.remove(child);
      }
      for (const room of nextState.rooms) rooms.add(buildRoom(nextState, room));
    },
    dispose() { disposeTree(root); scene.remove(root); },
  };
}

// ---------- Ground & floor ----------

function buildGround(state) {
  const { width, depth } = floorExtent(state);
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 4, depth * 4),
    mat(PALETTE.ground)
  );
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.06;
  g.receiveShadow = true;
  return g;
}

/**
 * Oak floorboards. Alternating plank tone per grid row gives the
 * floor a readable grain without a texture file.
 */
function buildFloor(state) {
  const group = new THREE.Group();
  const { width, depth } = floorExtent(state);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.1, depth),
    mat(PALETTE.floorOak)
  );
  slab.position.y = -0.05;
  slab.receiveShadow = true;
  group.add(slab);

  const { h } = state.grid;
  const plank = new THREE.BoxGeometry(width, 0.02, TILE * 0.9);
  const plankMat = mat(PALETTE.floorOakDark);
  const planks = new THREE.InstancedMesh(plank, plankMat, Math.ceil(h / 2));
  planks.receiveShadow = true;
  const m = new THREE.Matrix4();
  let i = 0;
  for (let y = 0; y < h; y += 2) {
    const p = tileToWorld(state, 0, y);
    m.makeTranslation(0, 0.001, p.z);
    planks.setMatrixAt(i++, m);
  }
  planks.count = i;
  group.add(planks);

  return group;
}

function buildEntrance(state) {
  const group = new THREE.Group();
  const e = state.grid.entrance;
  const p = tileToWorld(state, e.x, e.y);

  // A gold threshold — gold appears ONLY at doors and the pulpit.
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(TILE * 1.1, 0.06, TILE * 0.3),
    mat(PALETTE.gold)
  );
  sill.position.set(p.x, 0.03, p.z);
  group.add(sill);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 1.6, 0.18),
      mat(PALETTE.trim)
    );
    post.position.set(p.x + side * TILE * 0.55, 0.8, p.z);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

// ---------- Rooms ----------

function buildRoom(state, room) {
  const def = ROOM_BY_ID[room.id];
  const t = roomTransform(state, room);
  const group = new THREE.Group();
  group.name = room.id;
  group.position.set(t.center.x, 0, t.center.z);

  const { w, d } = t.size;

  // Plaster floor pad, slightly proud of the oak.
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.05, 0.06, d - 0.05),
    mat(room.id === 'sanctuary' ? PALETTE.plasterShade : PALETTE.plaster)
  );
  pad.position.y = 0.03;
  pad.receiveShadow = true;
  group.add(pad);

  // Cut-down walls, with a gap where the door is.
  const wallMat = mat(PALETTE.plaster);
  const doorLocal = {
    x: t.door.x - t.center.x,
    z: t.door.z - t.center.z,
  };
  for (const seg of wallSegments(w, d, doorLocal)) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(seg.w, WALL_H, seg.d),
      wallMat
    );
    wall.position.set(seg.x, WALL_H / 2, seg.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }

  // Gold door marker.
  const doorMark = new THREE.Mesh(
    new THREE.BoxGeometry(TILE * 0.7, 0.05, TILE * 0.7),
    mat(PALETTE.gold)
  );
  doorMark.position.set(doorLocal.x, 0.07, doorLocal.z);
  group.add(doorMark);

  if (room.id === 'sanctuary') buildSanctuaryInterior(group, t.size, room);
  else buildInterior(group, room.id, t.size);

  group.userData = { roomId: room.id, transform: t, def };
  return group;
}

/** Four walls minus the tile the door sits on. */
function wallSegments(w, d, door) {
  const segs = [];
  const near = (a, b) => Math.abs(a - b) < TILE * 0.6;
  const half = { w: w / 2, d: d / 2 };

  // North and south runs
  for (const z of [-half.d + WALL_T / 2, half.d - WALL_T / 2]) {
    if (near(door.z, z) && Math.abs(door.x) < half.w) {
      const leftW = door.x - TILE / 2 + half.w;
      const rightW = half.w - (door.x + TILE / 2);
      if (leftW > 0.05) segs.push({ x: -half.w + leftW / 2, z, w: leftW, d: WALL_T });
      if (rightW > 0.05) segs.push({ x: half.w - rightW / 2, z, w: rightW, d: WALL_T });
    } else {
      segs.push({ x: 0, z, w, d: WALL_T });
    }
  }
  // East and west runs
  for (const x of [-half.w + WALL_T / 2, half.w - WALL_T / 2]) {
    if (near(door.x, x) && Math.abs(door.z) < half.d) {
      const topD = door.z - TILE / 2 + half.d;
      const botD = half.d - (door.z + TILE / 2);
      if (topD > 0.05) segs.push({ x, z: -half.d + topD / 2, w: WALL_T, d: topD });
      if (botD > 0.05) segs.push({ x, z: half.d - botD / 2, w: WALL_T, d: botD });
    } else {
      segs.push({ x, z: 0, w: WALL_T, d });
    }
  }
  return segs;
}

// ---------- The sanctuary ----------

function buildSanctuaryInterior(group, size, room) {
  const plan = pewLayout(size);
  const chancel = chancelLayout(size, plan);

  // Purple runner down the centre aisle. It runs from the front of
  // the chancel platform to the back door — NOT across the platform,
  // which it used to overlap.
  const platformFront = chancel.platformFront;
  const runnerBack = size.d / 2 - 0.4;
  const runnerLen = runnerBack - platformFront;
  const runner = new THREE.Mesh(
    new THREE.BoxGeometry(plan.aisle * 0.8, 0.02, runnerLen),
    mat(PALETTE.runner)
  );
  runner.position.set(0, 0.07, platformFront + runnerLen / 2);
  runner.receiveShadow = true;
  group.add(runner);

  // Pews, instanced: one seat mesh and one back mesh for all rows.
  const seatGeo = new THREE.BoxGeometry(1, 0.12, 0.42);
  const backGeo = new THREE.BoxGeometry(1, 0.55, 0.1);
  const woodMat = mat(PALETTE.pewWood);
  const cushionMat = mat(PALETTE.pewCushion);

  const n = plan.benches.length;
  const seats = new THREE.InstancedMesh(seatGeo, cushionMat, n);
  const backs = new THREE.InstancedMesh(backGeo, woodMat, n);
  seats.castShadow = backs.castShadow = true;
  seats.receiveShadow = backs.receiveShadow = true;

  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();

  plan.benches.forEach((b, i) => {
    s.set(b.width * 0.88, 1, 1);
    p.set(b.x, 0.52, b.z);
    m.compose(p, q, s);
    seats.setMatrixAt(i, m);

    // backZ is behind the sitter, away from the chancel — so the
    // congregation faces the pulpit, not the back wall.
    p.set(b.x, 0.82, b.backZ);
    m.compose(p, q, s);
    backs.setMatrixAt(i, m);
  });
  group.add(seats, backs);

  // Chancel platform.
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(chancel.platform.w, chancel.platform.h, chancel.platform.d),
    mat(PALETTE.plasterShade)
  );
  platform.position.set(chancel.platform.x, 0.13, chancel.platform.z);
  platform.receiveShadow = true;
  platform.castShadow = true;
  group.add(platform);

  // The pulpit — the one place gold belongs inside the room.
  const pulpit = new THREE.Mesh(
    new THREE.BoxGeometry(chancel.pulpit.w, chancel.pulpit.h, chancel.pulpit.d),
    mat(PALETTE.pulpit)
  );
  pulpit.position.set(chancel.pulpit.x, 0.71, chancel.pulpit.z);
  pulpit.castShadow = true;
  group.add(pulpit);

  // Gold face toward the people, not the back wall.
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(chancel.pulpitFace.w, chancel.pulpitFace.h, 0.04),
    mat(PALETTE.gold)
  );
  face.position.set(chancel.pulpitFace.x, 0.78, chancel.pulpitFace.z);
  group.add(face);

  // Communion table, set below the platform.
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(chancel.table.w, chancel.table.h, chancel.table.d),
    mat(PALETTE.pewWood)
  );
  table.position.set(chancel.table.x, 0.31, chancel.table.z);
  table.castShadow = true;
  group.add(table);

  room.__seatPlan = plan.rows;
}

// ---------- Cleanup ----------

function disposeTree(obj) {
  obj.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  });
}
