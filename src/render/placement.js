// ============================================================
// placement.js — the ghost you drag around before you commit.
//
// Rejection must be VISIBLE and EXPLAINED before the player taps
// confirm. Letting someone commit a build and only then discover
// it walled off the prayer room is the failure mode free placement
// invites; the ghost turns red and says why, every frame.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { tileToWorld, TILE } from './layout.js';
import { rotatedSize, doorAndApproach, gridSize } from '../core/grid.js';
import { validatePlacement } from '../core/grid.js';
import { canMoveTo, suggestPlacement, canPickUp } from '../core/build.js';

const GHOST_H = 1.25;

export function createPlacementTool(sceneApi, state, { onChange } = {}) {
  const { scene, camera, renderer } = sceneApi;
  const root = new THREE.Group();
  root.name = 'placement';
  root.visible = false;
  scene.add(root);

  const bodyMat = new THREE.MeshLambertMaterial({
    color: PALETTE.valid, transparent: true, opacity: 0.45, depthWrite: false,
  });
  const padMat = new THREE.MeshBasicMaterial({
    color: PALETTE.valid, transparent: true, opacity: 0.3, depthWrite: false,
  });
  const doorMat = new THREE.MeshBasicMaterial({
    color: PALETTE.gold, transparent: true, opacity: 0.9, depthWrite: false,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1, GHOST_H, 1), bodyMat);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.08;
  const doorMark = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.7, TILE * 0.7), doorMat);
  doorMark.rotation.x = -Math.PI / 2;
  doorMark.position.y = 0.1;
  root.add(body, pad, doorMark);

  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  let session = null;   // { roomId, x, y, rot, mode }

  function tileUnderPointer(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(ground, hit)) return null;
    const { w, h } = gridSize(state);
    return {
      x: Math.round(hit.x / TILE + w / 2 - 0.5),
      y: Math.round(hit.z / TILE + h / 2 - 0.5),
    };
  }

  function check() {
    if (!session) return { valid: false };
    if (session.mode === 'move') {
      // A service can begin while the ghost is already up.
      const pickup = canPickUp(state, session.roomId);
      if (!pickup.ok) return { valid: false, reason: pickup.reason };
      return canMoveTo(state, session.roomId, session.x, session.y, session.rot);
    }
    return validatePlacement(state, session.roomId, session.x, session.y, session.rot);
  }

  function redraw() {
    if (!session) { root.visible = false; return; }
    const def = ROOM_BY_ID[session.roomId];
    const [rw, rh] = rotatedSize(def.footprint, session.rot);
    const topLeft = tileToWorld(state, session.x, session.y);
    const cx = topLeft.x + ((rw - 1) * TILE) / 2;
    const cz = topLeft.z + ((rh - 1) * TILE) / 2;

    body.scale.set(rw * TILE - 0.1, 1, rh * TILE - 0.1);
    body.position.set(cx, GHOST_H / 2, cz);
    pad.scale.set(rw * TILE, rh * TILE, 1);
    pad.position.set(cx, 0.08, cz);

    const { door } = doorAndApproach(session.roomId, session.x, session.y, session.rot);
    const dp = tileToWorld(state, door.x, door.y);
    doorMark.position.set(dp.x, 0.1, dp.z);

    const result = check();
    const color = result.valid ? PALETTE.valid : PALETTE.invalid;
    bodyMat.color.setHex(color);
    padMat.color.setHex(color);
    doorMark.visible = result.valid;

    root.visible = true;
    onChange?.({ ...session, ...result });
  }

  return {
    root,
    get active() { return session !== null; },
    get session() { return session ? { ...session } : null; },

    /** Begin placing a new room, or moving an existing one. */
    begin(roomId, mode = 'build') {
      const room = state.rooms.find((r) => r.id === roomId);
      const start = mode === 'move' && room
        ? { x: room.x, y: room.y, rot: room.rot || 0 }
        : suggestPlacement(state, roomId, 0) || { x: 0, y: 0, rot: 0 };
      session = { roomId, mode, x: start.x, y: start.y, rot: start.rot || 0 };
      redraw();
      return session;
    },

    /** Drag the ghost to whatever tile is under the finger. */
    moveTo(clientX, clientY) {
      if (!session) return;
      const tile = tileUnderPointer(clientX, clientY);
      if (!tile) return;
      // Centre the footprint under the finger rather than its corner.
      const def = ROOM_BY_ID[session.roomId];
      const [rw, rh] = rotatedSize(def.footprint, session.rot);
      const nx = tile.x - Math.floor((rw - 1) / 2);
      const ny = tile.y - Math.floor((rh - 1) / 2);
      if (nx === session.x && ny === session.y) return;
      session.x = nx;
      session.y = ny;
      redraw();
    },

    nudge(dx, dy) {
      if (!session) return;
      session.x += dx;
      session.y += dy;
      redraw();
    },

    rotate() {
      if (!session) return;
      session.rot = (session.rot + 90) % 360;
      redraw();
    },

    validity() { return check(); },

    cancel() {
      session = null;
      root.visible = false;
      onChange?.(null);
    },

    dispose() {
      scene.remove(root);
      [bodyMat, padMat, doorMat].forEach((m) => m.dispose());
      body.geometry.dispose();
      pad.geometry.dispose();
      doorMark.geometry.dispose();
    },
  };
}
