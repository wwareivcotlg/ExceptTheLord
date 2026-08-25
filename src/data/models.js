// ============================================================
// MODELS — which Kenney asset stands in for which piece.
//
// Drop .glb files into assets/models/furniture/ and name them
// here. Anything not listed, or that fails to load, falls back to
// the procedural rounded box automatically.
//
// SCALE: Kenney's furniture kit is built at roughly 0.4 units per
// module where a floor tile here is 1.0, so almost everything wants
// about 2x. `scale` is applied once at load.
//
// MATERIALS: these models carry no textures, only named materials.
// Map a name to a PALETTE key to recolour it into the COTLG scheme.
// ============================================================

export const MODEL_BASE = 'assets/models/furniture/';

/**
 * Kenney Blocky Characters — used for its ANIMATION, not its mesh.
 *
 * Probed: every body part is a 12-triangle cube, so the blocky look
 * lives entirely in the texture. Our procedural figures are already
 * more detailed than that. What the file has that we cannot hand-
 * roll is 27 clips of real animation, and because they are plain
 * rotation tracks on named nodes — root, leg-left, leg-right,
 * torso, arm-left, arm-right, head — they retarget onto any rig
 * that uses the same names and nesting.
 *
 * NOTE: the character .glb references its texture EXTERNALLY
 * (Textures/texture-a.png). We never use that texture, so the
 * folder is optional for animation purposes.
 */
export const CHARACTER_CLIPS = {
  file: 'assets/models/characters/character-a.glb',
  // Kenney's rig is about 2.4 units tall; ours is scaled to match.
  rigHeight: 2.25,
  clips: {
    idle: 'idle',
    walk: 'walk',
    sit: 'sit',
    yes: 'emote-yes',
    no: 'emote-no',
    interact: 'interact-right',
  },
};

/** Default recolouring, by Kenney's material names. */
export const MATERIAL_COLORS = {
  wood: 'pewWood',
  woodDark: 'pulpit',
  carpet: 'cushion',
  metal: 'steel',
  glass: 'mirror',
  plastic: 'counter',
};

export const MODELS = {
  // --- Seating ---
  // Measured: 0.40 x 0.47 x 0.20, seat surface at y 0.24.
  // At 2x that is a 0.80-wide bench with a 0.48 seat — two of them
  // span 1.60, which is almost exactly one pew bench (1.63).
  bench: {
    file: 'bench.glb',
    scale: 2.0,
    seatLocalY: 0.24,
    materials: { wood: 'pewWood' },
  },
  benchCushion: {
    file: 'benchCushion.glb',
    scale: 2.0,
    seatLocalY: 0.24,
    materials: { wood: 'pewWood', carpet: 'cushion' },
  },

  // --- Fellowship hall ---
  bookcaseClosed: {
    file: 'bookcaseClosed.glb',
    scale: 2.0,
    materials: { wood: 'pewWood' },
  },
};

/**
 * Which furniture piece (data/furniture.js) uses which model.
 * A piece not listed here keeps its procedural box.
 */
export const PIECE_MODELS = {
  shelves: 'bookcaseClosed',
};
