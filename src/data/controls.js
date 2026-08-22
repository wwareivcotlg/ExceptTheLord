// ============================================================
// CONTROLS — how the camera and taps feel. Safe to edit.
//
// Everything here is a matter of taste, so it lives in data/
// rather than buried in render/camera.js. Change a number, reload,
// judge it on a phone.
//
// PAN_INVERT is the big one. Two conventions exist and people feel
// strongly about which is correct:
//
//   PAN_INVERT: false  "drag the world"  — the floor follows your
//                      finger, like dragging a map.
//   PAN_INVERT: true   "drag the camera" — the view moves with your
//                      finger, so the floor slides the other way.
//
// Set to true. Flip it back if it ever feels wrong again.
// ============================================================

export const CONTROLS = {
  // --- Panning (one finger, or left-drag) ---
  PAN_INVERT: true,
  PAN_SPEED: 0.045,

  // --- Zoom (pinch, or wheel) ---
  ZOOM_STEP: 0.12,
  ZOOM_INVERT: false,

  // --- Turning (two-finger twist, or right-drag) ---
  ROTATE_SPEED: 0.006,
  ROTATE_INVERT: false,
  TWIST_INVERT: false,

  // --- Pitch (right-drag vertical) ---
  PITCH_SPEED: 0.004,
  PITCH_INVERT: false,
  // Never level with the floor, never straight down: you should
  // always be looking INTO the church.
  PITCH_MIN: 0.62,
  PITCH_MAX: 1.15,

  // --- Smoothing ---
  // Fraction of the remaining distance covered each frame.
  // Lower is floatier, higher is snappier. 1 disables smoothing.
  DAMPING: 0.14,

  // --- Tapping ---
  // Generous on purpose: fingers are wide and visitors are small.
  TAP_RADIUS: 52,
  // Movement beyond this many pixels is a camera pan, not a tap.
  TAP_SLOP: 12,
  TAP_MAX_MS: 600,
};

/** ±1 multiplier for an invert flag. */
export const sign = (inverted) => (inverted ? -1 : 1);
