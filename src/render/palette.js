// ============================================================
// PALETTE — the church's material vocabulary. Safe to edit.
//
// Grounded in the building, not in game-UI convention:
// oak underfoot, cream plaster on the walls, a deep purple runner
// down the centre aisle, and gold reserved ENTIRELY for the
// pulpit and the doors. If gold starts appearing elsewhere,
// the sanctuary stops being the thing your eye goes to.
// ============================================================

export const PALETTE = {
  // Identity
  purple: 0x3c3489,
  gold: 0xb87a00,

  // Structure
  floorOak: 0x9c6f43,
  floorOakDark: 0x7d572f,
  plaster: 0xefe7d8,
  plasterShade: 0xd9cdb8,
  trim: 0x5a4632,

  // Sanctuary
  pewWood: 0x6b4425,
  pewCushion: 0x3c3489,
  runner: 0x2e2870,
  pulpit: 0x4a3018,

  // Ground & sky
  ground: 0x5f6b52,
  skyTop: 0xd8e2ee,
  skyBottom: 0xb9a88f,

  // Interaction feedback
  valid: 0x5fa86b,
  invalid: 0xb4463c,
  hover: 0xf0d68a,
};

export const LIGHTING = {
  // Warm key from high and to one side, the way clerestory
  // windows throw light across a sanctuary mid-morning.
  keyColor: 0xfff1d6,
  keyIntensity: 1.15,
  keyPosition: { x: 14, y: 20, z: 9 },

  fillColor: 0xa8bcd8,
  fillIntensity: 0.35,

  hemiSky: 0xdfe8f5,
  hemiGround: 0x6a5a45,
  hemiIntensity: 0.55,

  shadowMapSize: 1024,
  shadowBounds: 22,
};

export const QUALITY = {
  // Older phones in a Subsplash web view are the target floor.
  maxPixelRatio: 2,
  shadows: true,
  antialias: true,
};
