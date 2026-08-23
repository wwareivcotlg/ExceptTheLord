// ============================================================
// FURNITURE — what stands inside each room. Safe to edit.
//
// Positions and footprints are NORMALIZED to the room: x and z run
// -0.5 to 0.5 across the room's width and depth, and w/d are
// fractions of those. Heights are in world units.
//
// Normalizing means a piece stays where it belongs when the room
// is rotated or resized — nothing has to be re-measured by hand.
//
// material picks a colour from render/palette.js FURNITURE.
// ============================================================

export const FURNITURE = {
  fellowship_hall: [
    // Cook line along the back wall.
    { id: 'range', x: -0.22, z: -0.36, w: 0.42, d: 0.16, h: 0.9, material: 'steel' },
    { id: 'hood', x: -0.22, z: -0.42, w: 0.42, d: 0.06, h: 0.35, y: 1.35, material: 'steel' },
    { id: 'counter', x: 0.26, z: -0.36, w: 0.36, d: 0.16, h: 0.85, material: 'counter' },
    { id: 'sink', x: 0.26, z: -0.36, w: 0.16, d: 0.10, h: 0.06, y: 0.86, material: 'steel' },
    { id: 'shelves', x: 0.44, z: 0.02, w: 0.10, d: 0.40, h: 1.5, material: 'wood' },
    // Fellowship tables, where people actually eat.
    { id: 'table_a', x: -0.12, z: 0.18, w: 0.52, d: 0.16, h: 0.72, material: 'wood' },
    { id: 'bench_a1', x: -0.12, z: 0.06, w: 0.52, d: 0.07, h: 0.42, material: 'wood' },
    { id: 'bench_a2', x: -0.12, z: 0.30, w: 0.52, d: 0.07, h: 0.42, material: 'wood' },
    { id: 'urn', x: 0.40, z: 0.34, w: 0.10, d: 0.10, h: 0.5, material: 'steel' },
  ],

  benevolence_closet: [
    // Rails of clothing down both sides.
    { id: 'rail_l', x: -0.34, z: 0, w: 0.06, d: 0.7, h: 0.06, y: 1.5, material: 'steel' },
    { id: 'clothes_l', x: -0.34, z: 0, w: 0.16, d: 0.66, h: 0.85, y: 0.6, material: 'cloth' },
    { id: 'rail_r', x: 0.34, z: -0.08, w: 0.06, d: 0.5, h: 0.06, y: 1.5, material: 'steel' },
    { id: 'clothes_r', x: 0.34, z: -0.08, w: 0.16, d: 0.46, h: 0.85, y: 0.6, material: 'clothAlt' },
    // Folded stock and a sorting table.
    { id: 'table', x: 0, z: 0.3, w: 0.5, d: 0.16, h: 0.75, material: 'wood' },
    { id: 'stack_a', x: -0.1, z: 0.3, w: 0.14, d: 0.12, h: 0.22, y: 0.76, material: 'cloth' },
    { id: 'stack_b', x: 0.12, z: 0.3, w: 0.14, d: 0.12, h: 0.16, y: 0.76, material: 'clothAlt' },
    { id: 'mirror', x: 0, z: -0.44, w: 0.22, d: 0.04, h: 1.1, y: 0.5, material: 'mirror' },
  ],

  prayer_room: [
    // A kneeler facing a small altar, and two chairs.
    { id: 'altar', x: 0, z: -0.3, w: 0.5, d: 0.18, h: 0.8, material: 'wood' },
    { id: 'cloth', x: 0, z: -0.3, w: 0.52, d: 0.2, h: 0.03, y: 0.81, material: 'linen' },
    { id: 'lamp_l', x: -0.16, z: -0.3, w: 0.07, d: 0.07, h: 0.28, y: 0.84, material: 'brass' },
    { id: 'lamp_r', x: 0.16, z: -0.3, w: 0.07, d: 0.07, h: 0.28, y: 0.84, material: 'brass' },
    { id: 'kneeler', x: 0, z: -0.05, w: 0.44, d: 0.14, h: 0.22, material: 'wood' },
    { id: 'pad', x: 0, z: -0.05, w: 0.42, d: 0.13, h: 0.06, y: 0.23, material: 'cushion' },
    { id: 'chair_l', x: -0.22, z: 0.3, w: 0.18, d: 0.18, h: 0.45, material: 'wood' },
    { id: 'chair_r', x: 0.22, z: 0.3, w: 0.18, d: 0.18, h: 0.45, material: 'wood' },
  ],

  baptismal_pool: [
    // The pool itself, recessed, with a step down into it.
    { id: 'surround', x: 0, z: -0.12, w: 0.78, d: 0.6, h: 0.55, material: 'tile' },
    { id: 'water', x: 0, z: -0.12, w: 0.66, d: 0.48, h: 0.06, y: 0.44, material: 'water' },
    { id: 'step', x: 0, z: 0.24, w: 0.34, d: 0.14, h: 0.28, material: 'tile' },
    { id: 'rail_l', x: -0.2, z: 0.24, w: 0.05, d: 0.05, h: 0.9, material: 'brass' },
    { id: 'rail_r', x: 0.2, z: 0.24, w: 0.05, d: 0.05, h: 0.9, material: 'brass' },
    { id: 'towels', x: 0.42, z: 0.36, w: 0.14, d: 0.14, h: 0.3, y: 0.5, material: 'linen' },
    { id: 'towel_stand', x: 0.42, z: 0.36, w: 0.1, d: 0.1, h: 0.5, material: 'wood' },
  ],
};

/** Rooms with nothing in them yet — useful as a to-do list. */
export function unfurnished(roomIds) {
  return roomIds.filter((id) => !FURNITURE[id] || FURNITURE[id].length === 0);
}
