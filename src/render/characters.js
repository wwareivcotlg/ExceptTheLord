// ============================================================
// characters.js — procedural figures from a casting composition.
//
// Deliberately built from boxes rather than sourced .glb: the
// pack decision is still open, and this keeps the poly budget
// honest (~110 triangles a figure against a 2,500 ceiling).
//
// Skin is a MATERIAL TINT from casting's skinHex, which is why we
// don't need Quaternius's paid tone shaders.
// ============================================================

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { seatedPose } from './layout.js';

const BANDS = {
  adult: { height: 1.72, girth: 0.34, head: 0.23 },
  elder: { height: 1.62, girth: 0.36, head: 0.23 },
  teen: { height: 1.44, girth: 0.28, head: 0.21 },
};

// Shared geometries — one allocation for every figure in the church.
const GEO = {
  torso: new THREE.BoxGeometry(1, 1, 1),
  head: new THREE.BoxGeometry(1, 1, 1),
  limb: new THREE.BoxGeometry(1, 1, 1),
  hair: new THREE.BoxGeometry(1, 1, 1),
};

const bandOf = (baseId) => (baseId.startsWith('elder') ? 'elder' : baseId.startsWith('teen') ? 'teen' : 'adult');

const HAIR_SHAPE = {
  afro: { w: 1.5, h: 1.1, d: 1.5, y: 0.62 },
  locs: { w: 1.25, h: 1.5, d: 1.25, y: 0.42 },
  braids: { w: 1.2, h: 1.35, d: 1.2, y: 0.46 },
  cornrows: { w: 1.08, h: 0.5, d: 1.12, y: 0.72 },
  twist_out: { w: 1.4, h: 1.0, d: 1.4, y: 0.6 },
  fade: { w: 1.06, h: 0.36, d: 1.08, y: 0.78 },
  bald: null,
  short_crop: { w: 1.08, h: 0.42, d: 1.1, y: 0.76 },
  bun: { w: 1.05, h: 0.5, d: 1.2, y: 0.7 },
  ponytail: { w: 1.05, h: 0.6, d: 1.35, y: 0.66 },
  shoulder_length: { w: 1.15, h: 1.0, d: 1.2, y: 0.5 },
  straight_long: { w: 1.12, h: 1.2, d: 1.15, y: 0.44 },
  wavy_mid: { w: 1.2, h: 0.95, d: 1.2, y: 0.54 },
  church_hat: { w: 1.9, h: 0.34, d: 1.9, y: 0.92 },
};

const HAIR_COLOR = { black: 0x1b1410, latino: 0x2a1c14, white: 0x6b5238, asian: 0x1c1410, other: 0x33241a };

/** Build one figure. Returns a Group with an update(dt) for walking. */
export function buildFigure(composition) {
  const band = BANDS[bandOf(composition.base)];
  const group = new THREE.Group();

  const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(composition.skinHex) });
  const cloth = new THREE.MeshLambertMaterial({ color: new THREE.Color(composition.outfitColor) });
  const hairMat = new THREE.MeshLambertMaterial({
    color: composition.hair === 'church_hat'
      ? new THREE.Color(composition.outfitColor)
      : new THREE.Color(HAIR_COLOR[composition.group] ?? HAIR_COLOR.other),
  });

  const legH = band.height * 0.44;
  const torsoH = band.height * 0.34;

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(GEO.limb, cloth);
    leg.scale.set(band.girth * 0.4, legH, band.girth * 0.42);
    leg.position.set(side * band.girth * 0.24, legH / 2, 0);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  const torso = new THREE.Mesh(GEO.torso, cloth);
  torso.scale.set(band.girth, torsoH, band.girth * 0.62);
  torso.position.y = legH + torsoH / 2;
  torso.castShadow = true;
  group.add(torso);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(GEO.limb, skin);
    arm.scale.set(band.girth * 0.2, torsoH * 0.92, band.girth * 0.22);
    arm.position.set(side * (band.girth * 0.58), legH + torsoH * 0.52, 0);
    arm.castShadow = true;
    group.add(arm);
    arms.push(arm);
  }

  const neckY = legH + torsoH;
  const head = new THREE.Mesh(GEO.head, skin);
  head.scale.set(band.head, band.head * 1.12, band.head);
  head.position.y = neckY + band.head * 0.62;
  head.castShadow = true;
  group.add(head);

  const shape = HAIR_SHAPE[composition.hair];
  if (shape) {
    const hair = new THREE.Mesh(GEO.hair, hairMat);
    hair.scale.set(band.head * shape.w, band.head * shape.h, band.head * shape.d);
    hair.position.y = head.position.y + band.head * shape.y * 0.62;
    hair.castShadow = true;
    group.add(hair);
  }

  group.userData.height = band.height;
  group.userData.legHeight = legH;

  // Remember the standing pose so sitting can be undone.
  const standing = legs.map((l) => ({ y: l.position.y, z: l.position.z }));

  /** Sit on a pew: hips to the seat, thighs forward. */
  group.userData.sit = (facing = -1) => {
    const pose = seatedPose(legH, facing);
    legs.forEach((leg, i) => {
      leg.rotation.x = pose.legRotX;
      leg.position.y = pose.legY;
      leg.position.z = pose.legZ;
    });
    arms[0].rotation.x = arms[1].rotation.x = 0;
    group.position.y = pose.groupY;
    return pose;
  };

  /** Raised hand, held up and swaying — benediction and farewell. */
  let wavePhase = 0;
  group.userData.wave = (dt) => {
    wavePhase += dt * 4.5;
    legs[0].rotation.x = legs[1].rotation.x = 0;
    // Right arm up and out; left stays at the side.
    arms[1].rotation.z = -2.1 + Math.sin(wavePhase) * 0.22;
    arms[1].rotation.x = -0.25;
    arms[0].rotation.z = 0;
    arms[0].rotation.x = 0;
    group.position.y = 0;
  };

  group.userData.stand = () => {
    legs.forEach((leg, i) => {
      leg.rotation.x = 0;
      leg.position.y = standing[i].y;
      leg.position.z = standing[i].z;
    });
    arms.forEach((a) => { a.rotation.x = 0; a.rotation.z = 0; });
    group.position.y = 0;
  };

  let phase = Math.random() * Math.PI * 2;
  group.userData.walk = (dt, moving) => {
    if (!moving) {
      legs[0].rotation.x = legs[1].rotation.x = 0;
      arms[0].rotation.x = arms[1].rotation.x = 0;
      group.position.y = 0;
      return;
    }
    phase += dt * 9;
    const swing = Math.sin(phase) * 0.5;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.7;
    arms[1].rotation.x = swing * 0.7;
    group.position.y = Math.abs(Math.sin(phase)) * 0.035;
  };

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
    this.active = new Map();   // visitorId → group
    this.free = [];
  }

  acquire(visitor) {
    let g = this.active.get(visitor.id);
    if (g) return g;
    g = this.free.pop();
    if (g) {
      disposeFigure(g);
      this.parent.remove(g);
    }
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

  /** Drop anyone no longer in the live list. */
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
    // Geometries are shared — never dispose them here.
  });
}
