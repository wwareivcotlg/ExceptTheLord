// ============================================================
// crowd.js — binds VisitorSystem (grid space) to the scene.
//
// The sim owns positions; this module only draws them. Keeping
// that one-way lets the whole lifecycle stay headless-testable.
// ============================================================

import * as THREE from 'three';
import { FigurePool } from './characters.js';
import { createBubble, setBubbleState, createPayoutPopup, stepPopup } from './bubble.js';
import { tileToWorld, roomTransform, pewLayout, seatSlots, localToWorld } from './layout.js';
import { projectPoint } from './picking.js';

const MOVING = new Set(['walking_in', 'leaving']);

export function createCrowd(sceneApi, state, visitors) {
  const { scene, camera, renderer } = sceneApi;
  const root = new THREE.Group();
  root.name = 'crowd';
  scene.add(root);

  const figures = new FigurePool(root);
  const bubbles = new Map();
  const popups = [];
  const _v = new THREE.Vector3();

  // Pew seats, computed once. Rebuilt only if the sanctuary moves.
  let seating = null;
  function seats() {
    if (seating) return seating;
    const room = state.rooms.find((r) => r.id === 'sanctuary');
    if (!room) return null;
    const t = roomTransform(state, room);
    const plan = pewLayout(t.size);
    seating = { transform: t, slots: seatSlots(t.size, plan, 40) };
    return seating;
  }

  function bubbleFor(v) {
    let b = bubbles.get(v.id);
    if (!b) {
      b = createBubble(v.needId, visitors.isTappable(v));
      root.add(b);
      bubbles.set(v.id, b);
    }
    return b;
  }

  function update(dt) {
    const list = visitors.visitors;

    for (const v of list) {
      const g = figures.acquire(v);

      // Seated visitors sit in an actual pew slot, facing the pulpit.
      if (v.phase === 'seated' && v.seatIndex !== undefined) {
        const s = seats();
        const slot = s?.slots[v.seatIndex];
        if (slot) {
          const w = localToWorld(s.transform, slot);
          g.position.set(w.x, 0.5, w.z);        // sitting height
          g.rotation.y = s.transform.rotationY + (slot.facing < 0 ? Math.PI : 0);
          g.userData.walk(dt, false);
          const b = bubbleFor(v);
          setBubbleState(b, false);
          b.position.set(w.x, 0.5 + g.userData.height + 0.4, w.z);
          b.visible = true;
          continue;
        }
      }

      const p = tileToWorld(state, v.pos.x, v.pos.y);
      g.position.x = p.x;
      g.position.z = p.z;

      const moving = MOVING.has(v.phase);
      g.userData.walk(dt, moving);

      // Face the direction of travel.
      if (moving && v.path && v.path[v.leg + 1]) {
        const to = v.path[v.leg + 1];
        const tp = tileToWorld(state, to.x, to.y);
        const angle = Math.atan2(tp.x - p.x, tp.z - p.z);
        g.rotation.y += ((angle - g.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 0.2;
      }

      // Bubbles show only while there's an unmet need.
      const wantsBubble = v.phase === 'waiting' || v.phase === 'queued' ||
                          v.phase === 'seated' || v.phase === 'walking_in';
      if (wantsBubble) {
        const b = bubbleFor(v);
        setBubbleState(b, visitors.isTappable(v));
        b.position.set(p.x, g.userData.height + 0.5, p.z);
        b.visible = true;
      } else if (bubbles.has(v.id)) {
        bubbles.get(v.id).visible = false;
      }
    }

    figures.reconcile(list);
    const live = new Set(list.map((v) => v.id));
    for (const [id, b] of [...bubbles]) {
      if (live.has(id)) continue;
      root.remove(b);
      b.material.dispose();
      bubbles.delete(id);
    }

    for (const e of visitors.drainEvents()) {
      if (e.type !== 'served' || !e.at) continue;
      const p = tileToWorld(state, e.at.x, e.at.y);
      const pop = createPayoutPopup(`+${e.offering}`);
      pop.position.set(p.x, 2.1, p.z);
      root.add(pop);
      popups.push(pop);
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      if (!stepPopup(popups[i], dt)) {
        root.remove(popups[i]);
        popups[i].material.map?.dispose();
        popups[i].material.dispose();
        popups.splice(i, 1);
      }
    }
  }

  /** Screen-space candidates for the tap handler. */
  function candidates() {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    const out = [];
    for (const v of visitors.visitors) {
      if (!visitors.isTappable(v)) continue;
      const p = tileToWorld(state, v.pos.x, v.pos.y);
      _v.set(p.x, 1.1, p.z);
      const s = projectPoint(camera, _v, w, h);
      out.push({ id: v.id, x: s.x, y: s.y, depth: s.depth, radius: 52 });
    }
    return out;
  }

  return { root, update, candidates, get figureCount() { return figures.size; } };
}
