// ============================================================
// MINISTRIES — the extensibility layer. Safe to edit.
//
// Adding a ministry (including a seasonal one) requires NO code
// changes. Add an entry here using the modifier vocabulary below.
//
// MODIFIER TYPES:
//   service_multiplier    multiplies sanctuary service payout
//   visitor_rate          increases overall arrivals
//   visitor_rate_stranger increases stranger arrivals
//   visitor_tier_unlock   makes a new visitor category appear
//   need_unlock           adds a new servable need
//   production_speed      speeds supply lines
//   favor_gain            multiplies Favor earned
//   queue_capacity        expands counseling queue / pews
//   virtual_reach         adds online viewers (capped, see tuning)
//   offline_grace         extends the offline cap
//
// STACKING: additive within a `tree`, multiplicative across trees.
//
// season: null, or { start: 'MM-DD', end: 'MM-DD' }
// residual: fraction of modifiers kept permanently after a season ends
// ============================================================

export const MINISTRIES = [
  {
    id: 'women_work', name: "Women's Work", tree: 'service_support',
    unlock: { level: 7, offering: 3000, favor: 30 },
    modifiers: [
      { type: 'production_speed', value: 0.20, supply: 'clothing' },
      { type: 'favor_gain', value: 0.05 },
    ],
    scripture: 'She stretcheth out her hand to the poor. — Proverbs 31:20',
    season: null, pack: 'core',
  },
  {
    id: 'choir', name: 'Choir', tree: 'music',
    unlock: { level: 6, offering: 2500, favor: 25 },
    modifiers: [{ type: 'service_multiplier', value: 0.20 }],
    scripture: 'O sing unto the LORD a new song. — Psalm 96:1',
    season: null, pack: 'core',
  },
  {
    id: 'yppu', name: "Y.P.P.U.", tree: 'youth',
    unlock: { level: 8, offering: 3500, favor: 40 },
    modifiers: [
      { type: 'visitor_tier_unlock', value: 'youth' },
      { type: 'favor_gain', value: 0.10 },
    ],
    scripture: 'Let no man despise thy youth. — 1 Timothy 4:12',
    season: null, pack: 'core',
  },
  {
    id: 'outreach', name: 'Outreach Ministry', tree: 'outreach',
    unlock: { level: 9, offering: 4200, favor: 45 },
    // Strangers are ~30% of arrivals, so a 0.35 lift moved total
    // footfall only 10% — not worth 4,200 offering. More than
    // doubling the stranger stream makes the ministry felt.
    modifiers: [{ type: 'visitor_rate_stranger', value: 1.20 }],
    scripture: 'Go out into the highways and hedges. — Luke 14:23',
    season: null, pack: 'core',
  },
  {
    id: 'yam', name: 'Young Adult Ministry', tree: 'youth',
    unlock: { level: 10, offering: 5000, favor: 50, requires: ['yppu'] },
    modifiers: [
      { type: 'visitor_tier_unlock', value: 'young_adult' },
      { type: 'visitor_rate_stranger', value: 0.35 },
    ],
    scripture: 'Remember now thy Creator in the days of thy youth. — Ecclesiastes 12:1',
    season: null, pack: 'core',
  },
  {
    id: 'mens_ministry', name: "Men's Ministry", tree: 'service_support',
    unlock: { level: 11, offering: 5500, favor: 50 },
    modifiers: [
      { type: 'production_speed', value: 0.15 },
      { type: 'queue_capacity', value: 3 },
      { type: 'chair_cooldown_cut', value: 0.25 },   // deacons set up faster
    ],
    scripture: 'Quit you like men, be strong. — 1 Corinthians 16:13',
    season: null, pack: 'core',
  },
  {
    id: 'trustee_board', name: 'Trustee Board', tree: 'service_support',
    unlock: { level: 5, offering: 1800, favor: 15 },
    modifiers: [
      { type: 'overflow_seats', value: 4 },          // more folding chairs on hand
      { type: 'chair_cooldown_cut', value: 0.20 },
      // Trustees make room OUTSIDE while the player is away: 2x seating
      // becomes 3x. No Offering spent, no cooldown burned, and the
      // decision to set out chairs still belongs to the player.
      { type: 'vestibule_multiplier', value: 1 },
    ],
    scripture: 'Let all things be done decently and in order. — 1 Corinthians 14:40',
    season: null, pack: 'core',
  },
  {
    id: 'creative_arts', name: 'Creative Arts Ministry', tree: 'music',
    unlock: { level: 12, offering: 15000, favor: 60, requires: ['choir'] },
    modifiers: [{ type: 'service_multiplier', value: 0.15 }],
    scripture: 'Praise him with the timbrel and dance. — Psalm 150:4',
    season: null, pack: 'core',
  },
  {
    id: 'praise_worship', name: 'Praise & Worship Team', tree: 'music',
    unlock: { level: 14, offering: 18000, favor: 70, requires: ['creative_arts'] },
    modifiers: [{ type: 'service_multiplier', value: 0.15 }],
    scripture: 'Enter into his gates with thanksgiving. — Psalm 100:4',
    season: null, pack: 'core',
  },
  {
    id: 'media_tech', name: 'Media / Tech Ministry', tree: 'outreach',
    unlock: { level: 15, offering: 20000, favor: 75 },
    modifiers: [{ type: 'virtual_reach', value: 0.25 }],
    scripture: 'Write the vision, and make it plain. — Habakkuk 2:2',
    season: null, pack: 'core',
  },
  {
    id: 'praise_dance', name: 'Praise Dance', tree: 'music',
    unlock: { level: 16, offering: 22000, favor: 80, requires: ['creative_arts'] },
    modifiers: [{ type: 'service_multiplier', value: 0.12 }],
    scripture: 'Let them praise his name in the dance. — Psalm 149:3',
    season: null, pack: 'core',
  },
  {
    id: 'drama', name: 'Drama Ministry', tree: 'music',
    unlock: { level: 18, offering: 26000, favor: 90, requires: ['creative_arts'] },
    modifiers: [{ type: 'service_multiplier', value: 0.12 }],
    scripture: 'We are made a spectacle unto the world. — 1 Corinthians 4:9',
    season: null, pack: 'core',
  },
];

export const MINISTRY_BY_ID = Object.fromEntries(MINISTRIES.map((m) => [m.id, m]));
