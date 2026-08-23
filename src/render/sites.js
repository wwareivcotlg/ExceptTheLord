// ============================================================
// sites.js — construction in progress.
//
// A site must read as "being built", not as a room that exists.
// Scaffold posts plus a filling progress bar, so the player can
// tell at a glance what's coming and how long is left.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { tileToWorld, TILE } from './layout.js';
import { rotatedSize } from '../core/grid.js';
import { constructionProgress } from '../core/production.js';

export function createSites(sceneApi, state) {
  const { scene } = sceneApi;
  const root = new THREE.Group();
  root.name = 'sites';
  scene.add(root);

  const groups = new Map();   // roomId → { group, fill, width }

  const scaffoldMat = new THREE.MeshLambertMaterial({ color: PALETTE.trim });
  const padMat = new THREE.MeshBasicMaterial({
    color: PALETTE.plasterShade, transparent: true, opacity: 0.55,
  });
  const barBackMat = new THREE.MeshBasicMaterial({ color: 0x241f5c });
  const barFillMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });

  function build(site) {
    const def = ROOM_BY_ID[site.roomId];
    const [rw, rh] = rotatedSize(def.footprint, site.rot || 0);
    const topLeft = tileToWorld(state, site.x, site.y);
    const cx = topLeft.x + ((rw - 1) * TILE) / 2;
    const cz = topLeft.z + ((rh - 1) * TILE) / 2;

    const g = new THREE.Group();
    g.position.set(cx, 0, cz);

    const pad = new THREE.Mesh(new THREE.PlaneGeometry(rw * TILE - 0.1, rh * TILE - 0.1), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.05;
    g.add(pad);

    // Corner posts.
    const post = new THREE.BoxGeometry(0.14, 1.1, 0.14);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(post, scaffoldMat);
        p.position.set(sx * (rw * TILE / 2 - 0.25), 0.55, sz * (rh * TILE / 2 - 0.25));
        p.castShadow = true;
        g.add(p);
      }
    }

    // Progress bar, floating above the site.
    const width = Math.min(rw, rh) * TILE * 0.9;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.16), barBackMat);
    back.position.set(0, 1.6, 0);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.16), barFillMat);
    fill.position.set(0, 1.601, 0);
    for (const m of [back, fill]) { m.renderOrder = 9; m.material.depthTest = false; }
    g.add(back, fill);

    root.add(g);
    groups.set(site.roomId, { group: g, fill, width, back });
  }

  function clear(roomId) {
    const entry = groups.get(roomId);
    if (!entry) return;
    root.remove(entry.group);
    entry.group.traverse((c) => c.geometry?.dispose?.());
    groups.delete(roomId);
  }

  return {
    root,
    /** Sync meshes to state, and advance the progress bars. */
    update(atMs, cameraRig) {
      const live = new Set();
      for (const site of state.construction || []) {
        live.add(site.roomId);
        if (!groups.has(site.roomId)) build(site);
        const entry = groups.get(site.roomId);
        const p = constructionProgress(site, atMs);
        entry.fill.scale.x = Math.max(0.001, p);
        // Scale from the left edge rather than the centre.
        entry.fill.position.x = -entry.width * (1 - p) / 2;
        // Bars always face the viewer.
        const yaw = cameraRig?.state?.yaw ?? 0;
        entry.back.rotation.y = entry.fill.rotation.y = yaw;
      }
      for (const id of [...groups.keys()]) if (!live.has(id)) clear(id);
    },
    dispose() {
      for (const id of [...groups.keys()]) clear(id);
      scene.remove(root);
    },
  };
}
