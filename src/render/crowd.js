// ============================================================
// crowd.js — binds VisitorSystem (grid space) to the scene.
//
// The sim owns positions; this module only draws them. Keeping
// that one-way lets the whole lifecycle stay headless-testable.
// ============================================================

import * as THREE from 'three';
import { FigurePool, buildFigure } from './characters.js';
import { createBubble, setBubbleState, createPayoutPopup, stepPopup,
         createNameplate } from './bubble.js';
import { tileToWorld, roomTransform, pewLayout, allSeatSlots, localToWorld,
         seatedPose, CHAIR_SEAT_Y, SEAT_BACK_LOCAL_Z, seatYaw } from './layout.js';
import { projectPoint } from './picking.js';
import { roundedBox } from './shapes.js';
import { castCongregant } from '../core/casting.js';
import { bucketRng } from '../core/rng.js';
import { congregationMix, baseSeats } from '../core/sanctuary.js';
import { doorAndApproach } from '../core/grid.js';

const MOVING = new Set(['walking_in', 'leaving']);

export function createCrowd(sceneApi, state, visitors, playerId = 'local', onEvent = null) {
  const { scene, camera, renderer } = sceneApi;
  const root = new THREE.Group();
  root.name = 'crowd';
  scene.add(root);

  const figures = new FigurePool(root);
  const bubbles = new Map();
  const plates = new Map();
  const popups = [];
  const _v = new THREE.Vector3();

  // The congregation is a COUNT, not a list of visitors.
  //
  // The offline resolver seats people by incrementing
  // state.sanctuary.seated — there are no visitor objects for them.
  // Drawing only live visitors left the pews visibly empty while
  // the rules considered them full, which then pushed every new
  // arrival into the vestibule to stand at the door.
  //
  // So: the pews are filled from STATE. Live seated visitors keep
  // their own faces and their own seats; every remaining seat gets
  // a stand-in cast deterministically, so the same church always
  // looks like the same congregation.
  const congregants = new Map();   // seatIndex → figure

  function congregantFor(seatIndex, mix) {
    let g = congregants.get(seatIndex);
    if (g) return g;
    const rng = bucketRng(`${playerId}:pew`, seatIndex);
    const total = mix.stranger + mix.member + mix.youth || 1;
    const roll = rng() * total;
    const person = castCongregant(state, rng);
    person.isStranger = roll < mix.stranger;
    const fig = buildFigure(person);
    congregants.set(seatIndex, fig);
    root.add(fig);
    return fig;
  }

  function releaseCongregant(seatIndex) {
    const g = congregants.get(seatIndex);
    if (!g) return;
    root.remove(g);
    congregants.delete(seatIndex);
  }

  // Pew seats, computed once. Rebuilt only if the sanctuary moves.
  // Recomputed when the sanctuary moves OR when folding chairs go
  // out and come back — chairs add seats, and a stale list leaves
  // whoever is on them invisible.
  let seating = null;
  function seats() {
    const room = state.rooms.find((r) => r.id === 'sanctuary');
    if (!room) return null;
    const tempSeats = state.sanctuary.tempSeats || 0;
    if (seating && seating.tempSeats === tempSeats) return seating;
    const t = roomTransform(state, room);
    const plan = pewLayout(t.size);
    seating = {
      transform: t,
      tempSeats,
      slots: allSeatSlots(t.size, plan, { pews: baseSeats(state), tempSeats }),
    };
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

  function plateFor(v) {
    const label = v.display || v.name;
    let p = plates.get(v.id);
    if (!p || p.userData.text !== label) {
      if (p) { root.remove(p); p.material.map?.dispose(); p.material.dispose(); }
      p = createNameplate(label);
      p.userData.text = label;
      root.add(p);
      plates.set(v.id, p);
    }
    return p;
  }

  // ---- Folding chair meshes ----
  // Chair slots are only positions. Without something to sit on,
  // anyone the deacons seated is sitting in mid-air.
  const chairMeshes = new Map();   // slot index → mesh
  const chairSeatMat = new THREE.MeshLambertMaterial({ color: 0x4a4f5c });
  const chairFrameMat = new THREE.MeshLambertMaterial({ color: 0x8f959e });

  function buildChair() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(roundedBox(0.42, 0.05, 0.42, 0.02, 1), chairSeatMat);
    seat.position.y = CHAIR_SEAT_Y - 0.025;
    // Local -z is forward, so the backrest sits at POSITIVE local
    // z — behind the sitter. Facing is applied once, by rotating
    // the chair, exactly as it is for the figure on it.
    const back = new THREE.Mesh(roundedBox(0.42, 0.42, 0.04, 0.02, 1), chairSeatMat);
    back.position.set(0, CHAIR_SEAT_Y + 0.21, SEAT_BACK_LOCAL_Z);
    const legGeo = new THREE.BoxGeometry(0.04, CHAIR_SEAT_Y, 0.04);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, chairFrameMat);
        leg.position.set(sx * 0.17, CHAIR_SEAT_Y / 2, sz * 0.17);
        leg.castShadow = true;
        g.add(leg);
      }
    }
    seat.castShadow = back.castShadow = true;
    seat.receiveShadow = true;
    g.add(seat, back);
    return g;
  }

  function syncChairs(s) {
    const wanted = new Set();
    if (s) {
      s.slots.forEach((slot, i) => { if (slot.chair) wanted.add(i); });
    }
    for (const i of wanted) {
      if (chairMeshes.has(i)) continue;
      const slot = s.slots[i];
      const mesh = buildChair();
      const w = localToWorld(s.transform, slot);
      mesh.position.set(w.x, 0.06, w.z);
      // Same turn the figure on it gets — one rule, one place.
      mesh.rotation.y = s.transform.rotationY + seatYaw(slot.facing);
      root.add(mesh);
      chairMeshes.set(i, mesh);
    }
    for (const i of [...chairMeshes.keys()]) {
      if (wanted.has(i)) continue;
      const mesh = chairMeshes.get(i);
      root.remove(mesh);
      mesh.traverse((c) => c.geometry?.dispose?.());
      chairMeshes.delete(i);
    }
  }

  function update(dt) {
    const list = visitors.visitors;
    const s = seats();
    syncChairs(s);

    for (const v of list) {
      const g = figures.acquire(v);

      // Seated visitors sit in an actual pew slot, facing the pulpit.
      if (v.phase === 'seated' && v.seatIndex !== undefined) {
        const s = seats();
        const slot = s?.slots[v.seatIndex];
        if (slot) {
          const w = localToWorld(s.transform, slot);
          // sit() sets the height itself — calling walk() here used
          // to reset position.y to 0 and stand everyone on the floor.
          const pose = g.userData.sit(slot.facing, slot.seatTop);
          g.position.x = w.x;
          g.position.z = w.z;
          g.rotation.y = s.transform.rotationY + pose.extraYaw;
          const b = bubbleFor(v);
          setBubbleState(b, false);
          b.position.set(w.x, pose.groupY + g.userData.height + 0.4, w.z);
          b.visible = true;
          g.userData.seated = true;
          continue;
        }
      }

      // Waiting in the vestibule: cluster outside the sanctuary
      // door rather than standing on the threshold.
      if (v.phase === 'vestibule' && s) {
        if (!g.userData.vestibuleSpot) {
          const room = state.rooms.find((r) => r.id === 'sanctuary');
          const { approach } = doorAndApproach(room.id, room.x, room.y, room.rot || 0);
          const base = tileToWorld(state, approach.x, approach.y);
          const rng = bucketRng(`${playerId}:vest`, v.id);
          g.userData.vestibuleSpot = {
            x: base.x + (rng() - 0.5) * 2.4,
            z: base.z + 0.6 + rng() * 1.6,
          };
        }
        if (g.userData.seated) { g.userData.stand(); g.userData.seated = false; }
        const spot = g.userData.vestibuleSpot;
        g.position.set(spot.x, 0, spot.z);
        g.rotation.y = s.transform.rotationY + Math.PI;   // looking in
        g.userData.walk(dt, false);
        const b = bubbleFor(v);
        setBubbleState(b, false);
        b.position.set(spot.x, g.userData.height + 0.5, spot.z);
        b.visible = true;
        continue;
      }

      // Anyone not seated stands normally.
      if (g.userData.seated) { g.userData.stand(); g.userData.seated = false; }

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

    // ---- Fill the pews from state ----
    if (s) {
      const mix = congregationMix(state);
      const claimed = new Set(
        list.filter((v) => v.phase === 'seated' && v.seatIndex !== undefined)
            .map((v) => v.seatIndex)
      );
      const needed = Math.max(0, (state.sanctuary.seated || 0) - claimed.size);

      const standIns = [];
      for (let i = 0; i < s.slots.length && standIns.length < needed; i++) {
        if (!claimed.has(i)) standIns.push(i);
      }

      for (const i of standIns) {
        const fig = congregantFor(i, mix);
        const slot = s.slots[i];
        const w = localToWorld(s.transform, slot);
        const pose = fig.userData.sit(slot.facing, slot.seatTop);
        fig.position.x = w.x;
        fig.position.z = w.z;
        fig.rotation.y = s.transform.rotationY + pose.extraYaw;
      }

      const wanted = new Set(standIns);
      for (const i of [...congregants.keys()]) if (!wanted.has(i)) releaseCongregant(i);
    }

    // Nameplates ride above the people who have names.
    for (const v of list) {
      if (!v.characterId || !(v.display || v.name)) continue;
      const g = figures.acquire(v);
      const plate = plateFor(v);
      plate.position.set(g.position.x, g.position.y + g.userData.height + 1.0, g.position.z);
      plate.visible = v.phase !== 'done';
    }

    figures.reconcile(list);
    const live = new Set(list.map((v) => v.id));
    for (const [id, p] of [...plates]) {
      if (live.has(id)) continue;
      root.remove(p);
      p.material.map?.dispose();
      p.material.dispose();
      plates.delete(id);
    }
    for (const [id, b] of [...bubbles]) {
      if (live.has(id)) continue;
      root.remove(b);
      b.material.dispose();
      bubbles.delete(id);
    }

    for (const e of visitors.drainEvents()) {
      if (e.type === 'conversion' && e.at) {
        const p = tileToWorld(state, e.at.x, e.at.y);
        const pop = createPayoutPopup(e.name, 0xE4B23F);
        pop.position.set(p.x, 2.6, p.z);
        pop.userData.life = -1.4;          // lingers: this is the moment
        root.add(pop);
        popups.push(pop);
        onEvent?.(e);
        continue;
      }
      if (e.type === 'greeting' || e.type === 'farewell' || e.type === 'gift') {
        onEvent?.(e);
        continue;
      }
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

  return {
    root, update, candidates,
    get figureCount() { return figures.size + congregants.size; },
    /**
     * The layout changed — recompute seats, drop stand-ins, and
     * clear cached vestibule spots. Those spots are cached on the
     * figure and would otherwise leave people huddled outside where
     * the sanctuary used to be.
     */
    resetSeating() {
      seating = null;
      for (const i of [...congregants.keys()]) releaseCongregant(i);
      for (const g of figures.active.values()) delete g.userData.vestibuleSpot;
      for (const i of [...chairMeshes.keys()]) {
        const mesh = chairMeshes.get(i);
        root.remove(mesh);
        mesh.traverse((c) => c.geometry?.dispose?.());
        chairMeshes.delete(i);
      }
    },
  };
}
