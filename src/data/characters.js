// ============================================================
// CHARACTERS — the people who come back. Safe to edit.
//
// Cheap to add, disproportionate for warmth. Everything about a
// named character is data: when they come, what they need, what
// they say, and what they bring with them.
//
// APPEARANCE is fixed, not sampled. Mother Hayes must look like
// Mother Hayes every single time or she isn't a person, she's a
// coincidence.
//
// ARRIVAL RULES
//   every_day        once each day
//   on_days [0..6]   once on each listed weekday
//   on_events [id]   once on Sabbath / Bible Study / Choir Rehearsal
//   every_n_days n   roughly every n days
// ============================================================

export const CHARACTERS = [
  {
    id: 'mother_hayes',
    name: 'Mother Hayes',
    title: 'Mother',
    arrival: { on_events: ['sabbath', 'bible_study'] },
    needs: ['word', 'counseling'],
    appearance: {
      group: 'black', base: 'elder_f', skinTone: 'tone_03', skinHex: '#5C3A27',
      hair: 'church_hat', outfit: 'sunday_dress', outfitColor: '#D9D3C7',
    },
    // She never comes empty-handed.
    gift: { favor: 12 },
    greeting: [
      'Good morning, baby. The Lord is good.',
      'I been praying for this house.',
      'I brought my Bible and my burden.',
    ],
    farewell: [
      'The Lord bless you and keep you.',
      "Don't you worry. He's working it out.",
      "I'll see you Sunday, if the Lord say the same.",
    ],
  },
  {
    id: 'deacon_pruitt',
    name: 'Deacon Pruitt',
    title: 'Deacon',
    arrival: { every_day: true },
    needs: ['food'],
    appearance: {
      group: 'black', base: 'adult_m', skinTone: 'tone_02', skinHex: '#4A2E1F',
      hair: 'fade', outfit: 'sunday_suit', outfitColor: '#1B1B22',
    },
    // Quietly makes everyone work a little better while he's around.
    grantsBuff: { id: 'deacon_pruitt', type: 'production_speed', value: 0.15, durationS: 1800 },
    greeting: [
      'Doors on time this morning.',
      "I'll get the lights. You see to the people.",
      'Everything in its place.',
    ],
    farewell: [
      "I'll lock up behind you.",
      'Same time tomorrow.',
      'Good work today.',
    ],
  },
  {
    id: 'the_stranger',
    name: 'A stranger',
    title: null,
    arrival: { every_n_days: 2 },
    // The whole point: the need changes each time they come.
    needs: ['food', 'clothing', 'counseling', 'word'],
    appearance: {
      group: 'black', base: 'adult_m', skinTone: 'tone_05', skinHex: '#845C3E',
      hair: 'short_crop', outfit: 'work_clothes_m', outfitColor: '#6B6250',
    },
    arc: {
      // Times they must be served before they ask for baptism.
      visitsBeforeBaptism: 5,
      // Names they might take. Chosen deterministically per player.
      names: ['Brother Andre', 'Brother Curtis', 'Brother Malik',
              'Brother Terrence', 'Brother Elijah'],
      converted: {
        title: 'Brother',
        outfit: 'sunday_suit',
        outfitColor: '#2A2F45',
        gift: { favor: 8 },
        greeting: [
          'I never thought I would be standing here.',
          'I brought somebody with me this time.',
          'Same seat as always.',
        ],
      },
    },
    greeting: [
      "I didn't mean to come in. The door was open.",
      "I'm not here for all that. I just need a little help.",
      'I used to go to church. Long time ago.',
      'You all still feed people?',
      "I'll just sit in the back.",
    ],
    farewell: [
      'Thank you. Nobody had to do that.',
      "I might come back. I'm not saying I will.",
      "Alright. Alright then.",
    ],
  },
];

export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/**
 * THE PASTOR — the one figure always in the room.
 *
 * He sits on the platform between services, rises to the pulpit
 * when service begins, gives the benediction when it ends, sees
 * the people out, and sits back down. Timings in milliseconds.
 */
export const PASTOR = {
  RISE_MS: 1600,        // chair → pulpit
  DISMISS_MS: 2600,     // hand raised in benediction
  WAVE_MS: 7000,        // seeing the congregation out
  RETURN_MS: 1600,      // pulpit → chair
  benediction: [
    'The Lord bless thee, and keep thee. — Numbers 6:24',
    'Go in peace.',
    'The grace of our Lord Jesus Christ be with you all.',
  ],
  farewell: [
    'God bless you.',
    'See you Sunday.',
    'Travel safe now.',
  ],
};

/** Lines for the moment the stranger is baptized and takes a name. */
export const CONVERSION_LINES = {
  before: 'I want what you all have.',
  after: 'My name is {name}.',
  scripture: 'Therefore if any man be in Christ, he is a new creature. — 2 Corinthians 5:17',
};
