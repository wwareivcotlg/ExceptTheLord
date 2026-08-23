// ============================================================
// ROOMS — buildable spaces. Safe to edit.
//
// footprint  [width, height] in grid tiles, at rotation 0.
// door       [x, y] local tile within the footprint, at rotation 0.
// doorFacing which way the door opens ('n','e','s','w') at rot 0.
//
// Visitors walk to the tile just outside the door — the "approach
// tile". A placement that leaves a room's approach tile unreachable
// is rejected at preview time, never committed.
// ============================================================

export const ROOMS = [
  {
    id: 'sanctuary',
    name: 'Sanctuary',
    footprint: [6, 8],
    door: [2, 7], doorFacing: 's',
    cost: { offering: 0 },        // starting room
    buildS: 0,
    baseSeats: 16,
  },
  {
    id: 'fellowship_hall',
    name: 'Fellowship Hall',
    footprint: [4, 4],
    door: [1, 3], doorFacing: 's',
    unlock: { level: 1 },
    cost: { offering: 800 },
    buildS: 1800,
    // ~6 food/hr vs ~3.6/hr ordinary demand, but BELOW the ~7.2/hr
    // of a Sabbath. The kitchen becomes the bottleneck on the big day.
    production: { supply: 'food', durationS: 1200, yield: 2 },
  },
  {
    id: 'benevolence_closet',
    name: 'Benevolence Closet',
    footprint: [3, 3],
    door: [1, 2], doorFacing: 's',
    unlock: { level: 3 },
    cost: { offering: 1400 },
    buildS: 3600,
    production: { supply: 'clothing', durationS: 2400, yield: 2 },
  },
  {
    id: 'prayer_room',
    name: 'Prayer Room',
    footprint: [2, 3],
    door: [0, 2], doorFacing: 's',
    unlock: { level: 5 },
    cost: { offering: 2200, favor: 20 },
    buildS: 5400,
  },
  {
    id: 'baptismal_pool',
    name: 'Baptismal Pool',
    footprint: [3, 4],
    door: [1, 3], doorFacing: 's',
    unlock: { level: 8 },
    cost: { offering: 5000, favor: 60 },
    buildS: 7200,
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
