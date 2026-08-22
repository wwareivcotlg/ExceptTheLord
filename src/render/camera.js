// ============================================================
// camera.js — a constrained dollhouse camera.
//
// Deliberately NOT OrbitControls. The pitch stays in a narrow
// band so you're always looking down into the church, and the
// target is clamped to the grid so you can never lose the
// building off-screen — the two ways a free orbit camera makes a
// builder game feel broken on a phone.
//
// One finger  pan          Two fingers  pinch to zoom, twist to turn
// Mouse drag  pan          Wheel zoom, right-drag turn
// ============================================================

import { cameraFrame } from './layout.js';
import { CONTROLS, sign } from '../data/controls.js';

// Feel lives in data/controls.js so it can be tuned without
// touching this file. See PAN_INVERT there.
const { PITCH_MIN, PITCH_MAX, DAMPING: DAMP } = CONTROLS;

export function createCameraRig(sceneApi, state, canvas) {
  const { camera, key } = sceneApi;
  const frame = cameraFrame(state);

  const target = { x: 0, z: 0 };
  const desired = {
    yaw: -Math.PI / 4,
    pitch: 0.92,
    distance: frame.span * 0.85,
    x: 0,
    z: 0,
  };
  const current = { ...desired };

  const clampDistance = (d) => Math.min(frame.maxDistance, Math.max(frame.minDistance, d));
  const clampTarget = () => {
    desired.x = Math.max(-frame.bounds.x, Math.min(frame.bounds.x, desired.x));
    desired.z = Math.max(-frame.bounds.z, Math.min(frame.bounds.z, desired.z));
  };

  function apply() {
    const cp = Math.cos(current.pitch);
    camera.position.set(
      current.x + Math.sin(current.yaw) * current.distance * cp,
      Math.sin(current.pitch) * current.distance,
      current.z + Math.cos(current.yaw) * current.distance * cp
    );
    target.x = current.x;
    target.z = current.z;
    camera.lookAt(current.x, 0, current.z);

    // Keep the shadow frustum following the view.
    key.target.position.set(current.x, 0, current.z);
    key.position.set(current.x + 14, 20, current.z + 9);
  }

  sceneApi.onUpdate(() => {
    let moved = false;
    for (const k of ['yaw', 'pitch', 'distance', 'x', 'z']) {
      const delta = desired[k] - current[k];
      if (Math.abs(delta) > 0.0005) { current[k] += delta * DAMP; moved = true; }
      else current[k] = desired[k];
    }
    if (moved) apply();
  });

  // ---------- Input ----------
  const pointers = new Map();
  let pinch = null;

  const panSpeed = () => (desired.distance / frame.span) * CONTROLS.PAN_SPEED;

  function panBy(dx, dy) {
    const s = panSpeed() * sign(CONTROLS.PAN_INVERT);
    const sin = Math.sin(current.yaw), cos = Math.cos(current.yaw);
    // Screen-right and screen-forward resolved into world space, so
    // a drag behaves the same at any yaw.
    desired.x -= (dx * cos - dy * sin) * s;
    desired.z += (dx * sin + dy * cos) * s;
    clampTarget();
  }

  function onDown(e) {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        distance: desired.distance,
        yaw: desired.yaw,
      };
    }
  }

  function onMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: prev.button });

    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const ratio = CONTROLS.ZOOM_INVERT
        ? Math.max(dist, 1) / pinch.dist
        : pinch.dist / Math.max(dist, 1);
      desired.distance = clampDistance(pinch.distance * ratio);
      desired.yaw = pinch.yaw + (angle - pinch.angle) * sign(CONTROLS.TWIST_INVERT);
      return;
    }

    if (pointers.size === 1) {
      if (prev.button === 2) {
        desired.yaw -= dx * CONTROLS.ROTATE_SPEED * sign(CONTROLS.ROTATE_INVERT);
        const pitchStep = dy * CONTROLS.PITCH_SPEED * sign(CONTROLS.PITCH_INVERT);
        desired.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, desired.pitch + pitchStep));
      } else {
        panBy(dx, dy);
      }
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const dir = Math.sign(e.deltaY) * sign(CONTROLS.ZOOM_INVERT);
    desired.distance = clampDistance(desired.distance * (1 + dir * CONTROLS.ZOOM_STEP));
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  apply();

  return {
    /** Ease the view to a point of interest — used when a room completes. */
    focus(worldPoint, distance = frame.span * 0.55) {
      desired.x = worldPoint.x;
      desired.z = worldPoint.z;
      desired.distance = clampDistance(distance);
      clampTarget();
    },
    reset() {
      desired.x = 0; desired.z = 0;
      desired.yaw = -Math.PI / 4;
      desired.pitch = 0.92;
      desired.distance = frame.span * 0.85;
    },
    turn(step = Math.PI / 2) { desired.yaw += step; },
    get state() { return { ...current }; },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
