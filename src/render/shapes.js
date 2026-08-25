// ============================================================
// shapes.js — the vocabulary everything is built from.
//
// Hard-edged boxes read as unfinished. Rounded, beveled forms read
// as INTENDED — the difference between a grey-box prototype and a
// stylized toy. Every geometry here is built once and shared, so
// softening the whole church costs almost nothing at runtime.
// ============================================================

import * as THREE from 'three';

const cache = new Map();
const key = (...a) => a.map((n) => (typeof n === 'number' ? n.toFixed(3) : n)).join(':');

/**
 * A box with rounded edges, built by extruding a rounded rectangle.
 * `r` is the corner radius; keep it well under half the smallest
 * dimension or the shape collapses.
 */
export function roundedBox(w, h, d, r = 0.06, bevelSegments = 2) {
  const k = key('rb', w, h, d, r, bevelSegments);
  if (cache.has(k)) return cache.get(k);

  const radius = Math.min(r, Math.min(w, h, d) * 0.32);
  const shape = new THREE.Shape();
  const x = w / 2 - radius;
  const y = h / 2 - radius;
  shape.moveTo(-x, -h / 2);
  shape.lineTo(x, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  shape.lineTo(w / 2, y);
  shape.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  shape.lineTo(-x, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  shape.lineTo(-w / 2, -y);
  shape.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);

  const depth = Math.max(0.001, d - radius * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: radius,
    bevelSize: radius,
    bevelSegments,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  cache.set(k, geo);
  return geo;
}

/** A soft capsule-ish form for limbs. Cheaper than a real capsule. */
export function limbGeometry(radius = 0.5, length = 1) {
  const k = key('limb', radius, length);
  if (cache.has(k)) return cache.get(k);
  const geo = new THREE.CylinderGeometry(radius, radius * 0.92, length, 8, 1);
  cache.set(k, geo);
  return geo;
}

/** A low-poly head: rounder than a box, still faceted. */
export function headGeometry(size = 1) {
  const k = key('head', size);
  if (cache.has(k)) return cache.get(k);
  const geo = new THREE.SphereGeometry(size * 0.5, 10, 8);
  geo.scale(1, 1.08, 0.94);
  cache.set(k, geo);
  return geo;
}

/** A squat dome, for hair and hats. */
export function domeGeometry(radius = 0.5, squash = 0.7) {
  const k = key('dome', radius, squash);
  if (cache.has(k)) return cache.get(k);
  const geo = new THREE.SphereGeometry(radius, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
  geo.scale(1, squash, 1);
  cache.set(k, geo);
  return geo;
}

/**
 * A cheap cartoon outline: the same mesh, inflated slightly and
 * drawn inside-out in a dark colour. This is what makes low-poly
 * look deliberate rather than unfinished, and it costs one extra
 * draw call per figure.
 */
export function outlineMaterial(color = 0x1a1526) {
  const k = key('outline', color);
  if (cache.has(k)) return cache.get(k);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  cache.set(k, mat);
  return mat;
}

export function addOutline(mesh, thickness = 0.03) {
  const shell = new THREE.Mesh(mesh.geometry, outlineMaterial());
  const s = mesh.scale;
  // Inflate proportionally so thin parts don't vanish.
  shell.scale.set(
    s.x + thickness / Math.max(0.05, s.x),
    s.y + thickness / Math.max(0.05, s.y),
    s.z + thickness / Math.max(0.05, s.z)
  );
  shell.position.copy(mesh.position);
  shell.rotation.copy(mesh.rotation);
  shell.renderOrder = -1;
  return shell;
}

/** A soft blob shadow, for grounding figures without a shadow map. */
export function contactShadow(radius = 0.35) {
  const k = key('shadow', radius);
  if (!cache.has(k)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(20,14,34,.5)');
    g.addColorStop(1, 'rgba(20,14,34,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    cache.set(k, new THREE.CanvasTexture(canvas));
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: cache.get(k), transparent: true, depthWrite: false, opacity: 0.85,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  return mesh;
}

export function disposeShapeCache() {
  for (const v of cache.values()) v.dispose?.();
  cache.clear();
}
