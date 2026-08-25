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

  // Structure — warmer and a touch more saturated than realism.
  // A church interior lit for a game should feel golden, not beige.
  floorOak: 0xb07a44,
  floorOakDark: 0x8d5c2e,
  plaster: 0xf6efe0,
  plasterShade: 0xe2d5bd,
  trim: 0x6b5238,

  // Sanctuary
  pewWood: 0x6b4425,
  pewCushion: 0x3c3489,
  runner: 0x2e2870,
  pulpit: 0x4a3018,

  // Ground & sky
  ground: 0x74895e,
  groundEdge: 0x60734e,
  skyTop: 0x8fb6de,
  skyBottom: 0xf2dcc0,

  // Furniture. Kept muted so the sanctuary keeps the eye.
  steel: 0x9aa3ad,
  counter: 0xcfc4ae,
  wood: 0x7a5734,
  cloth: 0x6f7fa8,
  clothAlt: 0x8c6f8f,
  linen: 0xe8dfcb,
  cushion: 0x3c3489,
  brass: 0xb87a00,
  mirror: 0xc8d6e2,
  tile: 0xdcd6c6,
  water: 0x4f8fb5,

  // Interaction feedback
  valid: 0x5fa86b,
  invalid: 0xb4463c,
  hover: 0xf0d68a,
};

export const LIGHTING = {
  // Warm key from high and to one side, the way clerestory windows
  // throw light across a sanctuary mid-morning. The warm/cool split
  // between key and fill is what stops flat-shaded geometry looking
  // like plastic.
  keyColor: 0xfff0cf,
  keyIntensity: 1.5,
  keyPosition: { x: 14, y: 20, z: 9 },

  fillColor: 0x93b4dd,
  fillIntensity: 0.5,

  // A low, cool backlight to separate figures from the floor.
  rimColor: 0xbcd6f5,
  rimIntensity: 0.42,
  rimPosition: { x: -10, y: 5, z: -14 },

  hemiSky: 0xcfe2f7,
  hemiGround: 0x8a7050,
  hemiIntensity: 0.62,

  shadowMapSize: 1024,
  shadowBounds: 22,

  exposure: 1.06,
};

export const QUALITY = {
  // Older phones in a Subsplash web view are the target floor.
  maxPixelRatio: 2,
  shadows: true,
  antialias: true,
};
