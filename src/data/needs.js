// ============================================================
// NEEDS — what visitors want. Safe to edit.
//
// `served` and `seeking` are the words the While You Were Away
// card uses. Note the framing: an unmet need reads as a need
// ("5 came seeking baptism"), never as a failure ("5 turned
// away"). Same number, and it still nudges you to build the room,
// but it describes people rather than losses.
//
// kind: 'auto'   = served while the player is away, if room + supply exist
//       'queue'  = waits in a queue for the player (counseling)
//       'seat'   = takes a pew and waits indefinitely (the Word)
// weight: relative likelihood of this need appearing
// ============================================================

export const NEEDS = [
  {
    id: 'food',
    served: 'were fed',
    seeking: 'came hungry',
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
    served: 'were clothed',
    seeking: 'came needing clothing',
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
    served: 'were baptized',
    seeking: 'came seeking baptism',
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
    served: 'were prayed for',
    seeking: 'came seeking prayer',
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
    served: 'heard the Word',
    seeking: 'came to hear the Word',
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
