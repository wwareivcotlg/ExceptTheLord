// ============================================================
// CASTING — who appears in the church. Safe to edit.
//
// GROUNDING: this game depicts the Church of the Living God
// C.W.F.F., a historically African-American denomination. The
// casting below is not decoration; it is accuracy.
//
// TWO RULES, both enforced in core/casting.js:
//
//   1. The congregation begins predominantly Black and becomes
//      more multicultural as the church grows. Black members
//      remain the plurality at every stage — reach widens the
//      church, it does not replace it.
//
//   2. LEADERSHIP IS FIXED. Pastors, overseers, bishops, the Vice
//      Chief Bishop, and the Chief Bishop are African-American.
//      Not a weighted pool. Must not be randomized.
//
// ------------------------------------------------------------
// COMPOSITION MODEL
//
// A character is NOT a single model id. Free CC0 character packs
// (Quaternius, Kenney/KayKit) are built as a base mesh plus
// swappable parts, so a person here is composed:
//
//     base  x  skinTone  x  hair  x  outfit  x  outfitColor
//
// Skin tone is applied by tinting the material in Three.js, not
// by shipping a texture per tone. Quaternius ships tone shaders
// only in its paid Source tier — we do our own, which is cheaper
// and keeps the ramp below fully data-driven.
//
// POLY BUDGET: a Sabbath sanctuary can hold 26 with folding
// chairs out. Quaternius bases average ~13k tris (~340k for a
// full house), too heavy for an older phone in a Subsplash web
// view. Kenney Blocky/Mini are the prototype target.
// ============================================================

export const ASSET_BUDGET = {
  TARGET_TRIS_PER_CHARACTER: 2500,
  MAX_SIMULTANEOUS_CHARACTERS: 30,
};

// ---------- Bases ----------
export const BASE_MODELS = [
  { id: 'adult_m', gender: 'm', band: 'adult', weight: 34 },
  { id: 'adult_f', gender: 'f', band: 'adult', weight: 38 },
  { id: 'elder_m', gender: 'm', band: 'elder', weight: 8 },
  { id: 'elder_f', gender: 'f', band: 'elder', weight: 10 },
  { id: 'teen_m', gender: 'm', band: 'teen', weight: 5 },
  { id: 'teen_f', gender: 'f', band: 'teen', weight: 5 },
];

// ---------- Skin tones ----------
// One ordered palette, deepest to lightest. Groups draw from
// ranges within it rather than owning separate palettes, so the
// ramp stays smooth instead of switching between hard buckets.
export const SKIN_TONES = [
  { id: 'tone_01', hex: '#3A2318' },
  { id: 'tone_02', hex: '#4A2E1F' },
  { id: 'tone_03', hex: '#5C3A27' },
  { id: 'tone_04', hex: '#6E4A31' },
  { id: 'tone_05', hex: '#845C3E' },
  { id: 'tone_06', hex: '#9B7150' },
  { id: 'tone_07', hex: '#B08A66' },
  { id: 'tone_08', hex: '#C4A17E' },
  { id: 'tone_09', hex: '#D8B996' },
  { id: 'tone_10', hex: '#E8CFB2' },
];

// Inclusive index ranges into SKIN_TONES.
export const TONE_RANGE_BY_GROUP = {
  black: [0, 6],
  latino: [3, 8],
  white: [7, 9],
  asian: [5, 8],
  other: [2, 9],
};

// ---------- Hair ----------
// groups: null = reads well on anyone. Otherwise restricted.
// gender: null = worn by anyone. Otherwise restricted.
//
// The church hat is deliberately women-only: the crown is a
// women's tradition in the Black church, not a generic head prop.
export const HAIRSTYLES = [
  { id: 'locs', groups: ['black'], gender: null, weight: 10 },
  { id: 'afro', groups: ['black'], gender: null, weight: 10 },
  { id: 'braids', groups: ['black'], gender: null, weight: 10 },
  { id: 'cornrows', groups: ['black'], gender: null, weight: 8 },
  { id: 'twist_out', groups: ['black'], gender: 'f', weight: 10 },
  { id: 'fade', groups: ['black'], gender: 'm', weight: 16 },
  { id: 'bald', groups: null, gender: 'm', weight: 10 },
  { id: 'short_crop', groups: null, gender: null, weight: 10 },
  { id: 'bun', groups: null, gender: 'f', weight: 10 },
  { id: 'ponytail', groups: null, gender: 'f', weight: 10 },
  { id: 'shoulder_length', groups: null, gender: 'f', weight: 8 },
  { id: 'church_hat', groups: null, gender: 'f', weight: 12 },
  { id: 'straight_long', groups: ['white', 'asian', 'latino', 'other'], gender: 'f', weight: 12 },
  { id: 'wavy_mid', groups: ['white', 'latino', 'other'], gender: null, weight: 8 },
];

// ---------- Outfits ----------
// Sunday best is the default register for this congregation.
export const OUTFITS = [
  { id: 'sunday_suit', set: 'congregation', gender: 'm', weight: 30 },
  { id: 'sunday_dress', set: 'congregation', gender: 'f', weight: 30 },
  { id: 'sunday_skirt_set', set: 'congregation', gender: 'f', weight: 18 },
  { id: 'smart_casual_m', set: 'congregation', gender: 'm', weight: 16 },
  { id: 'smart_casual_f', set: 'congregation', gender: 'f', weight: 16 },
  { id: 'work_clothes_m', set: 'congregation', gender: 'm', weight: 10 },
  { id: 'work_clothes_f', set: 'congregation', gender: 'f', weight: 10 },
  { id: 'youth_casual', set: 'congregation', gender: null, weight: 12 },

  { id: 'usher_uniform', set: 'serving', gender: null, weight: 1 },
  { id: 'kitchen_apron', set: 'serving', gender: null, weight: 1 },
  { id: 'choir_robe', set: 'serving', gender: null, weight: 1 },
  { id: 'praise_dance_garment', set: 'serving', gender: null, weight: 1 },
  { id: 'trustee_suit', set: 'serving', gender: null, weight: 1 },

  // Clergy. COTLG dress is tailored suits, robes and clerical
  // collars — NOT Catholic cassocks or fantasy cleric robes.
  // Nothing suitable exists CC0; these are bespoke models.
  { id: 'pastor_suit_m', set: 'clergy', gender: 'm', weight: 1, bespoke: true },
  { id: 'pastor_suit_f', set: 'clergy', gender: 'f', weight: 1, bespoke: true },
  { id: 'bishop_robe', set: 'clergy', gender: 'm', weight: 1, bespoke: true },
  { id: 'chief_bishop_robe', set: 'clergy', gender: 'm', weight: 1, bespoke: true },
];

export const OUTFIT_COLORS = [
  '#1B1B22', '#2A2F45', '#3C3489', '#5A2436',
  '#6B6250', '#8A8FA3', '#B87A00', '#D9D3C7', '#FFFFFF',
];

// ---------- Congregation ramp ----------
export const CONGREGATION_BY_RANK = {
  mission:      { black: 94, latino: 3, white: 2, asian: 0, other: 1 },
  local_temple: { black: 88, latino: 5, white: 4, asian: 1, other: 2 },
  district:     { black: 80, latino: 8, white: 6, asian: 3, other: 3 },
  national:     { black: 70, latino: 12, white: 9, asian: 6, other: 3 },
  planting:     { black: 68, latino: 13, white: 9, asian: 6, other: 4 },
};

export const REACH_SHIFT_PER_MINISTRY = {
  outreach: 0.10,
  media_tech: 0.08,
  yam: 0.04,
};
export const MAX_REACH_SHIFT = 0.25;

// ---------- Roles ----------
export const FIXED_LEADERSHIP_ROLES = [
  'pastor', 'overseer', 'bishop', 'vice_chief_bishop', 'chief_bishop',
];

export const LEADERSHIP_APPEARANCE = 'black';

/**
 * Who may hold each office, per COTLG polity.
 *   'm'  = men only
 *   null = may be male or female
 *
 * Bishops (including the Vice Chief and Chief Bishop) and overseers
 * are men. Pastors may be men or women.
 */
export const ROLE_GENDER = {
  pastor: null,
  overseer: 'm',
  bishop: 'm',
  vice_chief_bishop: 'm',
  chief_bishop: 'm',
};

/**
 * Which vesture each office wears. A value may be a single outfit
 * id, or a map by gender where the office admits both.
 */
export const CLERGY_OUTFIT_BY_ROLE = {
  pastor: { m: 'pastor_suit_m', f: 'pastor_suit_f' },
  overseer: 'pastor_suit_m',
  bishop: 'bishop_robe',
  vice_chief_bishop: 'bishop_robe',
  chief_bishop: 'chief_bishop_robe',
};

/** Serving roles — cast from any group, in serving dress. */
export const SERVING_OUTFIT_BY_ROLE = {
  kitchen_crew: 'kitchen_apron',
  volunteer: 'kitchen_apron',
  usher: 'usher_uniform',
  choir_member: 'choir_robe',
  praise_dancer: 'praise_dance_garment',
  media_tech: 'smart_casual_m',
  trustee: 'trustee_suit',
  deacon: 'sunday_suit',
};

export const MULTICULTURAL_ROLES = Object.keys(SERVING_OUTFIT_BY_ROLE);
