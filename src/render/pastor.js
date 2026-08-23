// ============================================================
// pastor.js (render) — puts the pastor on the platform.
//
// The sim owns his phase and position; this only draws them.
// He is built once from the appearance stored in state, so he is
// the same person every service.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildFigure } from './characters.js';
import { roomTransform, pewLayout, chancelLayout, localToWorld } from './layout.js';
import { ensurePastor, pastorPose } from '../core/pastor.js';

export function createPastor(sceneApi, state, playerId = 'local') {
  const { scene } = sceneApi;
  const root = new THREE.Group();
  root.name = 'pastor';
  scene.add(root);

  let figure = null;
  let chairMesh = null;
  let placement = null;   // { transform, chancel }

  function chancelFor() {
    if (placement) return placement;
    const room = state.rooms.find((r) => r.id === 'sanctuary');
    if (!room) return null;
    const transform = roomTransform(state, room);
    const plan = pewLayout(transform.size);
    placement = { transform, chancel: chancelLayout(transform.size, plan) };
    return placement;
  }

  function ensureBuilt() {
    const p = chancelFor();
    if (!p) return null;

    if (!chairMesh) {
      const c = p.chancel.chair;
      chairMesh = new THREE.Group();
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(c.w, 0.1, c.d),
        new THREE.MeshLambertMaterial({ color: PALETTE.pewWood })
      );
      seat.position.y = c.seatY;
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(c.w, 0.62, 0.08),
        new THREE.MeshLambertMaterial({ color: PALETTE.pulpit })
      );
      // Backrest behind him — he faces the people, like the pews.
      back.position.set(0, c.seatY + 0.31, -c.facing * (c.d / 2));
      seat.castShadow = back.castShadow = true;
      chairMesh.add(seat, back);
      const w = localToWorld(p.transform, { x: c.x, z: c.z });
      chairMesh.position.set(w.x, 0, w.z);
      chairMesh.rotation.y = p.transform.rotationY;
      root.add(chairMesh);
    }

    if (!figure) {
      const pastor = ensurePastor(state, playerId);
      figure = buildFigure(pastor.appearance);
      root.add(figure);
    }
    return p;
  }

  return {
    root,
    update(dt, atMs) {
      const p = ensureBuilt();
      if (!p) return;

      const pose = pastorPose(state, p.chancel, atMs);
      const w = localToWorld(p.transform, { x: pose.x, z: pose.z });
      let extraYaw = pose.facing < 0 ? 0 : Math.PI;

      switch (pose.action) {
        case 'sit': {
          // Seated on the chair, which stands on the platform.
          const lift = p.chancel.chair.seatY;
          const sit = figure.userData.sit(pose.facing);
          // Take the turn from the pose itself — recomputing the
          // rule in a second place is how it drifted before.
          extraYaw = sit.extraYaw;
          figure.position.set(w.x, sit.groupY + lift, w.z);
          break;
        }
        case 'walk':
          figure.userData.stand();
          figure.userData.walk(dt, true);
          figure.position.x = w.x;
          figure.position.z = w.z;
          figure.position.y += p.chancel.platform.h;
          break;
        case 'wave':
          figure.userData.stand();
          figure.userData.wave(dt);
          figure.position.set(w.x, p.chancel.platform.h, w.z);
          break;
        default:
          figure.userData.stand();
          figure.position.set(w.x, p.chancel.platform.h, w.z);
      }

      figure.rotation.y = p.transform.rotationY + extraYaw;
    },
    /** The sanctuary moved. */
    reset() {
      placement = null;
      if (chairMesh) { root.remove(chairMesh); chairMesh = null; }
    },
    get phase() { return state.pastor?.phase; },
  };
}
