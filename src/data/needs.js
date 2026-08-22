// ============================================================
// NEEDS — what visitors want. Safe to edit.
//
// kind: 'auto'   = served while the player is away, if room + supply exist
//       'queue'  = waits in a queue for the player (counseling)
//       'seat'   = takes a pew and waits indefinitely (the Word)
// weight: relative likelihood of this need appearing
// ============================================================

export const NEEDS = [
  {
    id: 'food',
    label: 'Hungry',
    kind: 'auto',
    room: 'fellowship_hall',
    supply: 'food',
    supplyCost: 1,
    offering: 12,
    favor: 1,
    xp: 3,
    weight: 30,
  },
  {
    id: 'clothing',
    label: 'In need of clothing',
    kind: 'auto',
    room: 'benevolence_closet',
    supply: 'clothing',
    supplyCost: 1,
    offering: 18,
    favor: 1,
    xp: 4,
    weight: 18,
  },
  {
    id: 'baptism',
    label: 'Seeking baptism',
    kind: 'auto',
    room: 'baptismal_pool',
    supply: null,
    supplyCost: 0,
    offering: 25,
    favor: 8,
    xp: 20,
    weight: 6,
  },
  {
    id: 'counseling',
    label: 'Needs prayer',
    kind: 'queue',
    room: 'prayer_room',
    supply: null,
    supplyCost: 0,
    offering: 30,
    favor: 12,
    xp: 15,
    weight: 16,
  },
  {
    id: 'word',
    label: 'Come to hear the Word',
    kind: 'seat',
    room: 'sanctuary',
    supply: null,
    supplyCost: 0,
    offering: 40,
    favor: 15,
    xp: 25,
    weight: 30,
  },
];

export const NEED_BY_ID = Object.fromEntries(NEEDS.map((n) => [n.id, n]));
