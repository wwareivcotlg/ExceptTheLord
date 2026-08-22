// ============================================================
// picking.js — screen-space hit detection.
//
// NOT raycasting. In a crowded room on a phone, raycast occlusion
// against overlapping bodies drops taps: a finger lands on a
// visitor and the ray hits a pew in front of them. Projecting each
// candidate to 2D and testing distance in pixels is both more
// forgiving and more predictable.
//
// The hit-test itself is pure, so it can be tested without a
// renderer or a camera.
// ============================================================

import { CONTROLS } from '../data/controls.js';

/**
 * Nearest candidate to a tap, within radius.
 * @param {Array<{id, x, y, depth, radius?}>} candidates screen-space
 * @param {{x, y}} tap
 * @param {number} radius default pixel radius
 * @returns {object|null}
 */
export function pickNearest(candidates, tap, radius = CONTROLS.TAP_RADIUS) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    // Behind the camera, or clipped past the far plane.
    if (c.depth === undefined || c.depth < 0 || c.depth > 1) continue;
    const r = c.radius ?? radius;
    const dx = c.x - tap.x;
    const dy = c.y - tap.y;
    const dist = Math.hypot(dx, dy);
    if (dist > r) continue;
    // Ties break toward whoever is nearer the camera.
    if (dist < bestDist || (Math.abs(dist - bestDist) < 6 && c.depth < (best?.depth ?? 1))) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Project a world point to CSS pixel coordinates.
 * Requires a THREE.Vector3 instance to avoid importing three here.
 */
export function projectPoint(camera, vec3, width, height) {
  const p = vec3.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    depth: (p.z + 1) / 2,
  };
}

/** Wire tap handling to a canvas. Returns a disposer. */
export function installTapHandler(
  canvas, getCandidates, onPick,
  { radius = CONTROLS.TAP_RADIUS, slop = CONTROLS.TAP_SLOP, maxMs = CONTROLS.TAP_MAX_MS } = {}
) {
  let down = null;

  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };

  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const held = performance.now() - down.t;
    down = null;
    // A drag is a camera pan, not a tap.
    if (moved > slop || held > maxMs) return;

    const rect = canvas.getBoundingClientRect();
    const tap = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = pickNearest(getCandidates(), tap, radius);
    if (hit) onPick(hit, tap);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
  };
}
