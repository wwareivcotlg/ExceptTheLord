// ============================================================
// SERMONS — what is preached. Safe to edit.
//
// Every service shows a title and a KJV passage whether or not the
// player chose the sermon. This is the most ministry-meaningful
// surface in the game and it costs no friction.
//
// FIELDS
//   durationS  real seconds the pulpit is occupied. Longer sermons
//              pay more but stack up arrivals with nowhere to sit.
//   affinity   per-head multiplier by who is in the pews. This is
//              what makes choosing a real decision: the right
//              answer changes with the congregation.
//   payout     currency steering. Longer/harder sermons carry
//              bigger numbers here — that is the length tradeoff.
//   unlock     Favor cost. The pulpit is something you invest in.
// ============================================================

export const SERMONS = [
  {
    id: 'come_unto_me',
    title: 'Come Unto Me',
    scripture: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest. — Matthew 11:28',
    theme: 'invitation',
    durationS: 180,
    affinity: { stranger: 1.45, member: 0.95, youth: 1.05 },
    payout: { offering: 1.0, favor: 1.0, xp: 1.0 },
    unlock: { favor: 0 },
  },
  {
    id: 'the_lord_is_my_shepherd',
    title: 'The Lord Is My Shepherd',
    scripture: 'The LORD is my shepherd; I shall not want. — Psalm 23:1',
    theme: 'comfort',
    durationS: 240,
    affinity: { stranger: 1.05, member: 1.25, youth: 1.0 },
    payout: { offering: 1.15, favor: 1.25, xp: 1.1 },
    unlock: { favor: 30 },
  },
  {
    id: 'study_to_shew_thyself',
    title: 'Rightly Dividing the Word',
    scripture: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed. — 2 Timothy 2:15',
    theme: 'teaching',
    durationS: 300,
    affinity: { stranger: 0.85, member: 1.5, youth: 1.1 },
    payout: { offering: 1.1, favor: 1.6, xp: 1.35 },
    unlock: { favor: 55 },
  },
  {
    id: 'let_no_man_despise',
    title: 'Let No Man Despise Thy Youth',
    scripture: 'Let no man despise thy youth; but be thou an example of the believers. — 1 Timothy 4:12',
    theme: 'youth',
    durationS: 240,
    affinity: { stranger: 1.0, member: 0.95, youth: 1.9 },
    payout: { offering: 1.1, favor: 1.3, xp: 1.5 },
    unlock: { favor: 70 },
  },
  {
    id: 'whosoever_will',
    title: 'Whosoever Will',
    scripture: 'And whosoever will, let him take the water of life freely. — Revelation 22:17',
    theme: 'invitation',
    durationS: 360,
    affinity: { stranger: 1.75, member: 1.0, youth: 1.15 },
    payout: { offering: 1.45, favor: 1.5, xp: 1.3 },
    unlock: { favor: 110 },
  },
  {
    id: 'can_these_bones_live',
    title: 'Can These Bones Live',
    scripture: 'O ye dry bones, hear the word of the LORD. — Ezekiel 37:4',
    theme: 'revival',
    durationS: 480,
    affinity: { stranger: 1.3, member: 1.35, youth: 1.25 },
    payout: { offering: 1.9, favor: 1.9, xp: 1.8 },
    unlock: { favor: 180 },
  },
];

export const SERMON_BY_ID = Object.fromEntries(SERMONS.map((s) => [s.id, s]));

/** Shown next to the recommendation so the player knows WHY. */
export const AUDIENCE_LABELS = {
  stranger: 'Mostly strangers today',
  member: 'A house of longtime members',
  youth: 'A young congregation',
  mixed: 'A mixed congregation',
};

// How long the preacher rests between services. Sabbath is shorter
// on purpose: multiple services are the point of the Lord's Day.
export const PREACHER_REST_S = 2700;
export const PREACHER_REST_SABBATH_S = 300;
