// ============================================================
// models.js — loading Kenney .glb assets.
//
// WHAT THE FILES ACTUALLY ARE (probed, not assumed):
//   - No textures. Materials are named ("wood", "carpet") with a
//     base colour factor, so they can be recoloured to the COTLG
//     palette directly rather than through a shared atlas.
//   - Origin at the BASE, but corner-anchored: x runs 0→w and
//     z runs −d→0. Everything must be recentred in x/z or it sits
//     half a footprint off.
//   - Kenney's unit is roughly 0.4 where a tile here is 1.0.
//   - 170–372 triangles each.
//
// EVERYTHING DEGRADES. If a model is missing, slow, or malformed,
// the caller falls back to procedural geometry. A church that
// renders as boxes is far better than one that renders as nothing.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_BASE, MODELS, MATERIAL_COLORS, CHARACTER_CLIPS } from '../data/models.js';
import { PALETTE } from './palette.js';

const loader = new GLTFLoader();
const cache = new Map();      // id → THREE.Object3D prototype
const failed = new Set();
let ready = false;

export const modelsReady = () => ready;
export const hasModel = (id) => cache.has(id);

// ---- Animation clips, borrowed from the Kenney character rig ----
let clips = null;
export const hasClips = () => clips !== null;
export const getClip = (name) => clips?.[CHARACTER_CLIPS.clips[name] ?? name] ?? null;
export const clipNames = () => (clips ? Object.keys(clips) : []);

async function loadClips() {
  return new Promise((resolve) => {
    loader.load(
      CHARACTER_CLIPS.file,
      (gltf) => {
        if (!gltf.animations?.length) return resolve(null);
        clips = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));
        resolve(clips);
      },
      undefined,
      () => resolve(null)      // no clips: figures fall back to hand-rolled motion
    );
  });
}

/**
 * Load every model named in the manifest. Resolves even if some
 * (or all) fail — callers check hasModel() per piece.
 */
export async function preloadModels({ timeoutMs = 8000 } = {}) {
  const ids = Object.keys(MODELS);
  const jobs = ids.map((id) => loadOne(id).catch(() => { failed.add(id); }));
  jobs.push(loadClips());
  await Promise.race([
    Promise.all(jobs),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
  ready = true;
  return { loaded: cache.size, failed: failed.size, total: ids.length };
}

function loadOne(id) {
  const def = MODELS[id];
  if (!def) return Promise.reject(new Error(`no manifest entry: ${id}`));
  return new Promise((resolve, reject) => {
    loader.load(
      `${MODEL_BASE}${def.file}`,
      (gltf) => {
        const proto = prepare(gltf.scene, def);
        cache.set(id, proto);
        resolve(proto);
      },
      undefined,
      reject
    );
  });
}

/**
 * Normalize a freshly loaded scene once, so every instance of it
 * is already scaled, recentred and recoloured.
 */
function prepare(scene, def) {
  const root = new THREE.Group();
  root.add(scene);

  // Recolour by material NAME. Kenney reuses a small vocabulary
  // across the whole kit, which is why this works at all.
  scene.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const names = Array.isArray(child.material) ? child.material : [child.material];
    child.material = names.map((m) => {
      const key = def.materials?.[m.name] ?? MATERIAL_COLORS[m.name];
      const color = key !== undefined
        ? new THREE.Color(PALETTE[key] ?? key)
        : m.color?.clone();
      return new THREE.MeshLambertMaterial({ color: color ?? 0xcccccc });
    });
    if (child.material.length === 1) child.material = child.material[0];
  });

  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  const scale = def.scale ?? 1;
  scene.scale.setScalar(scale);

  // Base on the floor, centred in x and z.
  scene.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);

  root.userData.size = {
    w: size.x * scale,
    h: size.y * scale,
    d: size.z * scale,
  };
  // Where a person's seat lands, if this is something to sit on.
  if (def.seatLocalY !== undefined) root.userData.seatY = def.seatLocalY * scale;
  return root;
}

/** A fresh instance of a loaded model. Geometry is shared. */
export function instantiate(id) {
  const proto = cache.get(id);
  if (!proto) return null;
  const copy = proto.clone(true);
  copy.userData = { ...proto.userData };
  return copy;
}

/** Measured size of a loaded model, or null. */
export function modelSize(id) {
  return cache.get(id)?.userData.size ?? null;
}

export function loadReport() {
  return {
    loaded: [...cache.keys()],
    failed: [...failed],
    clips: clips ? Object.keys(clips).length : 0,
    ready,
  };
}
