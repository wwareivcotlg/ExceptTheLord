// ============================================================
// characters.js — procedural figures on Kenney's rig.
//
// ART DIRECTION: rounded, slightly chunky, readable at a distance.
//
// THE RIG IS BORROWED. Kenney's Blocky Characters ship 27 animation
// clips — idle, walk, sit, emotes — as plain ROTATION tracks on
// named nodes:
//
//     root → leg-left, leg-right, torso → arm-left, arm-right, head
//
// Nothing is skinned. So if our figures use the same names, the
// same nesting, and the same joint pivots, those clips play on OUR
// geometry. That matters because every Kenney body part is a
// 12-triangle cube — the blocky look is entirely in the texture,
// and our rounded figures with shoes, hands and shaped hair are
// already more detailed than the meshes the clips were made for.
//
// Everything is built at Kenney's scale (~2.4 units tall) inside a
// scaling group, so the clips' root translation — the walk bob —
// arrives in the right units instead of being applied raw.
//
// If the clip file is missing, hand-rolled motion takes over.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { seatedPose } from './layout.js';
import { roundedBox, limbGeometry, headGeometry, domeGeometry,
         contactShadow, addOutline } from './shapes.js';
import { hasClips, getClip } from './models.js';
import { CHARACTER_CLIPS } from '../data/models.js';

// Kenney's pivots, measured from character-a.glb.
const RIG = {
  height: CHARACTER_CLIPS.rigHeight,        // 2.4
  hipY: 1.0, hipX: 0.2, legLen: 1.0,
  torsoY: 0.7, torsoLen: 1.15,
  shoulder: { x: 0.4, y: 1.1, z: -0.1 },    // relative to torso
  armLen: 0.95,
  headY: 1.2, headSize: 0.92,               // relative to torso
};

const BANDS = {
  adult: { height: 1.72, girth: 0.82, head: 1.0 },
  elder: { height: 1.62, girth: 0.86, head: 1.0 },
  teen:  { height: 1.44, girth: 0.72, head: 1.05 },
};

const bandOf = (id) =>
  id.startsWith('elder') ? 'elder' : id.startsWith('teen') ? 'teen' : 'adult';

const HAIR = {
  afro:            { kind: 'dome', r: 0.72, squash: 0.95, y: 0.30 },
  twist_out:       { kind: 'dome', r: 0.66, squash: 0.92, y: 0.28 },
  locs:            { kind: 'strands', r: 0.56, len: 0.42, n: 9 },
  braids:          { kind: 'strands', r: 0.54, len: 0.34, n: 7 },
  cornrows:        { kind: 'dome', r: 0.54, squash: 0.42, y: 0.34 },
  fade:            { kind: 'dome', r: 0.53, squash: 0.34, y: 0.36 },
  bald:            null,
  short_crop:      { kind: 'dome', r: 0.54, squash: 0.40, y: 0.34 },
  bun:             { kind: 'dome', r: 0.55, squash: 0.44, y: 0.33, bun: true },
  ponytail:        { kind: 'dome', r: 0.55, squash: 0.45, y: 0.33, tail: true },
  shoulder_length: { kind: 'strands', r: 0.57, len: 0.5, n: 8 },
  straight_long:   { kind: 'strands', r: 0.56, len: 0.62, n: 8 },
  wavy_mid:        { kind: 'strands', r: 0.58, len: 0.44, n: 8 },
  church_hat:      { kind: 'hat', brim: 1.5, crown: 0.6 },
};

const HAIR_COLOR = {
  black: 0x1b1410, latino: 0x2a1c14, white: 0x6b5238,
  asian: 0x1c1410, other: 0x33241a,
};
const SHOE = 0x241c18;

export function buildFigure(composition, { outline = false } = {}) {
  const band = BANDS[bandOf(composition.base)];
  const group = new THREE.Group();

  const rigScale = band.height / RIG.height;
  const rig = new THREE.Group();
  rig.scale.setScalar(rigScale);
  group.add(rig);

  const root = new THREE.Group();
  root.name = 'root';
  rig.add(root);

  // ---- Materials ----
  const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(composition.skinHex) });
  const cloth = new THREE.MeshLambertMaterial({ color: new THREE.Color(composition.outfitColor) });
  const lower = new THREE.MeshLambertMaterial({
    color: new THREE.Color(composition.outfitColor).multiplyScalar(0.78),
  });
  const hairMat = new THREE.MeshLambertMaterial({
    color: composition.hair === 'church_hat'
      ? new THREE.Color(composition.outfitColor).multiplyScalar(1.12)
      : new THREE.Color(HAIR_COLOR[composition.group] ?? HAIR_COLOR.other),
  });
  const shoeMat = new THREE.MeshLambertMaterial({ color: SHOE });
  const shell = [];

  // ---- Legs: pivot at the HIP, geometry hanging below ----
  const legs = [];
  const legGeo = limbGeometry(band.girth * 0.19, RIG.legLen * 0.92);
  for (const [name, side] of [['leg-left', 1], ['leg-right', -1]]) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(side * RIG.hipX, RIG.hipY, 0);

    const shin = new THREE.Mesh(legGeo, lower);
    shin.position.y = -RIG.legLen * 0.46;
    shin.castShadow = true;
    const shoe = new THREE.Mesh(roundedBox(0.34, 0.16, 0.5, 0.06, 1), shoeMat);
    shoe.position.set(0, -RIG.legLen + 0.08, -0.08);
    shoe.castShadow = true;
    leg.add(shin, shoe);
    root.add(leg);
    legs.push(leg);
    if (outline) shell.push(addOutline(shin, 0.03));
  }

  // ---- Torso ----
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, RIG.torsoY, 0);
  root.add(torso);

  const chest = new THREE.Mesh(
    roundedBox(band.girth, RIG.torsoLen, band.girth * 0.62, 0.16), cloth
  );
  chest.position.y = RIG.torsoLen * 0.5;
  chest.castShadow = true;
  torso.add(chest);
  if (outline) shell.push(addOutline(chest, 0.04));

  const shoulders = new THREE.Mesh(
    roundedBox(band.girth * 1.04, RIG.torsoLen * 0.26, band.girth * 0.64, 0.16), cloth
  );
  shoulders.position.y = RIG.torsoLen * 0.94;
  shoulders.castShadow = true;
  torso.add(shoulders);

  // ---- Arms: pivot at the SHOULDER ----
  const arms = [];
  const armGeo = limbGeometry(band.girth * 0.13, RIG.armLen * 0.9);
  for (const [name, side] of [['arm-left', 1], ['arm-right', -1]]) {
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(side * RIG.shoulder.x, RIG.shoulder.y, RIG.shoulder.z);

    const sleeve = new THREE.Mesh(armGeo, cloth);
    sleeve.position.y = -RIG.armLen * 0.45;
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(headGeometry(band.head * 0.34), skin);
    hand.position.y = -RIG.armLen * 0.92;
    arm.add(sleeve, hand);
    torso.add(arm);
    arms.push(arm);
  }

  // ---- Head ----
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, RIG.headY, 0);
  torso.add(head);

  const skull = new THREE.Mesh(headGeometry(band.head * RIG.headSize * 1.9), skin);
  skull.castShadow = true;
  head.add(skull);
  if (outline) shell.push(addOutline(skull, 0.04));

  const neck = new THREE.Mesh(limbGeometry(band.head * 0.2, 0.18), skin);
  neck.position.y = -RIG.headY * 0.22;
  head.add(neck);

  const style = HAIR[composition.hair];
  if (style) {
    const r = band.head * RIG.headSize * 0.95;
    if (style.kind === 'hat') {
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(r * style.brim, r * style.brim, 0.06, 14), hairMat
      );
      brim.position.y = r * 0.34;
      const crown = new THREE.Mesh(domeGeometry(r * style.crown, 1.0), hairMat);
      crown.position.y = r * 0.34;
      brim.castShadow = crown.castShadow = true;
      head.add(brim, crown);
    } else if (style.kind === 'dome') {
      const cap = new THREE.Mesh(domeGeometry(r * style.r, style.squash), hairMat);
      cap.position.y = r * style.y * 0.5;
      cap.castShadow = true;
      head.add(cap);
      if (style.bun) {
        const bun = new THREE.Mesh(headGeometry(r * 0.4), hairMat);
        bun.position.set(0, r * 0.2, r * 0.55);
        head.add(bun);
      }
      if (style.tail) {
        const tail = new THREE.Mesh(limbGeometry(r * 0.16, r * 0.9), hairMat);
        tail.position.set(0, r * 0.05, r * 0.6);
        head.add(tail);
      }
    } else {
      const cap = new THREE.Mesh(domeGeometry(r * style.r, 0.8), hairMat);
      cap.position.y = r * 0.16;
      head.add(cap);
      const strandGeo = limbGeometry(r * 0.1, style.len);
      for (let i = 0; i < style.n; i++) {
        const a = (i / style.n) * Math.PI * 2;
        const st = new THREE.Mesh(strandGeo, hairMat);
        st.position.set(
          Math.sin(a) * r * style.r * 0.82,
          r * 0.1 - style.len / 2,
          Math.cos(a) * r * style.r * 0.82
        );
        head.add(st);
      }
    }
  }

  for (const s of shell) torso.add(s);

  // ---- Grounding ----
  const blob = contactShadow(band.girth * 0.62);
  group.add(blob);

  const legHeightWorld = RIG.hipY * rigScale;
  group.userData.height = band.height;
  group.userData.legHeight = legHeightWorld;

  // ---- Motion: Kenney clips when available, hand-rolled when not ----
  let mixer = null;
  let actions = null;
  if (hasClips()) {
    mixer = new THREE.AnimationMixer(rig);
    const idle = getClip('idle');
    const walk = getClip('walk');
    if (idle && walk) {
      actions = {
        idle: mixer.clipAction(idle),
        walk: mixer.clipAction(walk),
      };
      actions.idle.play();
      actions.walk.play();
      actions.walk.setEffectiveWeight(0);
      // Vary the phase so a crowd doesn't move in lockstep.
      actions.idle.time = Math.random() * 2;
      actions.walk.time = Math.random() * 2;
    } else {
      mixer = null;
    }
  }

  let phase = Math.random() * Math.PI * 2;
  let breathe = Math.random() * Math.PI * 2;
  let blend = 0;

  const resetPose = () => {
    for (const l of legs) { l.rotation.set(0, 0, 0); }
    for (const a of arms) { a.rotation.set(0, 0, 0); }
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);
  };

  group.userData.walk = (dt, moving) => {
    blob.visible = true;
    if (mixer && actions) {
      // Crossfade rather than snap, so stopping looks deliberate.
      blend += ((moving ? 1 : 0) - blend) * Math.min(1, dt * 8);
      actions.walk.setEffectiveWeight(blend);
      actions.idle.setEffectiveWeight(1 - blend);
      mixer.update(dt);
      group.position.y = 0;
      return;
    }
    if (!moving) {
      breathe += dt * 1.6;
      const b = Math.sin(breathe) * 0.012;
      chest.scale.set(1 + b, 1 - b * 0.5, 1 + b);
      resetPose();
      group.position.y = 0;
      return;
    }
    phase += dt * 8.5;
    const swing = Math.sin(phase) * 0.55;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.75;
    arms[1].rotation.x = swing * 0.75;
    group.position.y = Math.abs(Math.sin(phase)) * 0.04;
  };

  /**
   * Sit: hips to the seat, thighs forward. Deliberately NOT the
   * Kenney sit clip — that lands wherever its own rig puts it, and
   * a person has to meet an actual pew at an actual height.
   */
  group.userData.sit = (facing = -1, seatTop = undefined) => {
    if (mixer && actions) {
      actions.walk.setEffectiveWeight(0);
      actions.idle.setEffectiveWeight(0);
      blend = 0;
    }
    const pose = seatedPose(legHeightWorld, facing, seatTop);
    resetPose();
    for (const leg of legs) {
      leg.rotation.x = pose.legRotX;
      leg.position.z = -RIG.legLen * 0.42;
    }
    group.position.y = pose.groupY;
    blob.visible = false;
    return pose;
  };

  group.userData.stand = () => {
    resetPose();
    for (const [i, leg] of legs.entries()) {
      leg.position.set((i === 0 ? 1 : -1) * RIG.hipX, RIG.hipY, 0);
    }
    if (mixer && actions) actions.idle.setEffectiveWeight(1);
    group.position.y = 0;
    blob.visible = true;
  };

  let wavePhase = 0;
  group.userData.wave = (dt) => {
    if (mixer && actions) {
      actions.walk.setEffectiveWeight(0);
      actions.idle.setEffectiveWeight(0.35);
      mixer.update(dt);
    }
    wavePhase += dt * 4.5;
    for (const l of legs) l.rotation.x = 0;
    arms[1].rotation.z = -2.1 + Math.sin(wavePhase) * 0.24;
    arms[1].rotation.x = -0.25;
    arms[0].rotation.set(0, 0, 0);
    group.position.y = 0;
    blob.visible = true;
  };

  group.userData.animated = !!mixer;
  return group;
}

/**
 * Reuses figure Groups across visitors. Churn is high — people
 * arrive and leave constantly — and rebuilding meshes every time
 * causes GC hitches mid-service.
 */
export class FigurePool {
  constructor(parent) {
    this.parent = parent;
    this.active = new Map();
  }

  acquire(visitor) {
    let g = this.active.get(visitor.id);
    if (g) return g;
    g = buildFigure(visitor.appearance);
    this.parent.add(g);
    this.active.set(visitor.id, g);
    return g;
  }

  release(visitorId) {
    const g = this.active.get(visitorId);
    if (!g) return;
    this.active.delete(visitorId);
    this.parent.remove(g);
    disposeFigure(g);
  }

  reconcile(visitors) {
    const live = new Set(visitors.map((v) => v.id));
    for (const id of [...this.active.keys()]) if (!live.has(id)) this.release(id);
  }

  get size() { return this.active.size; }
}

function disposeFigure(group) {
  group.traverse?.((c) => {
    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
    else c.material?.dispose?.();
    // Geometries are shared and cached — never dispose them here.
  });
}
