// ============================================================
// casting.js — composes who appears, deterministically.
//
// Returns a COMPOSITION, not a model id:
//   { group, base, skinTone, hair, outfit, outfitColor }
//
// Uses the same seeded RNG as visitor generation, so a given
// person looks the same every time an absence is recomputed.
// ============================================================

import {
  BASE_MODELS,
  SKIN_TONES,
  TONE_RANGE_BY_GROUP,
  HAIRSTYLES,
  OUTFITS,
  OUTFIT_COLORS,
  CONGREGATION_BY_RANK,
  REACH_SHIFT_PER_MINISTRY,
  MAX_REACH_SHIFT,
  FIXED_LEADERSHIP_ROLES,
  LEADERSHIP_APPEARANCE,
  CLERGY_OUTFIT_BY_ROLE,
  ROLE_GENDER,
  SERVING_OUTFIT_BY_ROLE,
} from '../data/casting.js';
import { weightedPick } from './rng.js';

const OUTFIT_BY_ID = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
const pickFrom = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** How far this church's reach has widened, 0..MAX_REACH_SHIFT. */
export function reachShift(state) {
  let shift = 0;
  for (const owned of state.ministries || []) {
    shift += REACH_SHIFT_PER_MINISTRY[owned.id] || 0;
  }
  return Math.min(shift, MAX_REACH_SHIFT);
}

/**
 * Congregation weights for this church right now: the rank
 * baseline, nudged by outreach reach. Black remains the plurality
 * at every stage — reach widens the church, never replaces it.
 */
export function congregationWeights(state) {
  const base = CONGREGATION_BY_RANK[state.rank] || CONGREGATION_BY_RANK.mission;
  const shift = reachShift(state);
  if (shift === 0) return { ...base };

  const out = {};
  const nonBlackTotal = Object.entries(base)
    .filter(([k]) => k !== 'black')
    .reduce((sum, [, v]) => sum + v, 0);

  const moved = base.black * shift;
  out.black = base.black - moved;
  for (const [k, v] of Object.entries(base)) {
    if (k === 'black') continue;
    out[k] = v + (nonBlackTotal ? (v / nonBlackTotal) * moved : 0);
  }
  return out;
}

// ---------- Part pickers ----------

export function pickGroup(state, rng) {
  const weights = congregationWeights(state);
  const groups = Object.keys(weights).filter((g) => TONE_RANGE_BY_GROUP[g]);
  return weightedPick(rng, groups, (g) => weights[g]);
}

export function pickSkinTone(group, rng) {
  const [lo, hi] = TONE_RANGE_BY_GROUP[group] || TONE_RANGE_BY_GROUP.other;
  return SKIN_TONES[lo + Math.floor(rng() * (hi - lo + 1))];
}

export function hairFor(group, gender = null) {
  return HAIRSTYLES.filter(
    (h) =>
      (h.groups === null || h.groups.includes(group)) &&
      (gender === null || h.gender === null || h.gender === gender)
  );
}

export function outfitsFor(set, gender) {
  return OUTFITS.filter((o) => o.set === set && (o.gender === null || o.gender === gender));
}

// ---------- Composition ----------

/** Cast an ordinary member or visitor of the congregation. */
export function castCongregant(state, rng) {
  const group = pickGroup(state, rng);
  const base = weightedPick(rng, BASE_MODELS);
  const tone = pickSkinTone(group, rng);
  const hair = weightedPick(rng, hairFor(group, base.gender));
  const outfit = weightedPick(rng, outfitsFor('congregation', base.gender));
  return {
    group,
    base: base.id,
    skinTone: tone.id,
    skinHex: tone.hex,
    hair: hair.id,
    outfit: outfit.id,
    outfitColor: pickFrom(rng, OUTFIT_COLORS),
    fixed: false,
  };
}

/**
 * Cast anyone holding an office or serving role.
 *
 * Leadership is NOT sampled. Pastors, overseers, bishops, the Vice
 * Chief Bishop and the Chief Bishop are African-American, true to
 * COTLG, and wear clergy dress. Serving roles draw from the full
 * congregation pools in serving dress.
 */
export function castRole(state, role, rng) {
  if (FIXED_LEADERSHIP_ROLES.includes(role)) {
    const group = LEADERSHIP_APPEARANCE;
    const allowed = ROLE_GENDER[role] ?? null;
    const bases = BASE_MODELS.filter(
      (b) => b.band !== 'teen' && (allowed === null || b.gender === allowed)
    );
    const base = weightedPick(rng, bases);
    const tone = pickSkinTone(group, rng);
    const hair = weightedPick(rng, hairFor(group, base.gender));
    return {
      group,
      base: base.id,
      skinTone: tone.id,
      skinHex: tone.hex,
      hair: hair.id,
      outfit: clergyOutfit(role, base.gender),
      outfitColor: pickFrom(rng, OUTFIT_COLORS),
      fixed: true,
    };
  }

  const person = castCongregant(state, rng);
  const serving = SERVING_OUTFIT_BY_ROLE[role];
  return serving ? { ...person, outfit: serving } : person;
}

/** Vesture for an office, resolving gendered variants. */
export function clergyOutfit(role, gender) {
  const entry = CLERGY_OUTFIT_BY_ROLE[role];
  return typeof entry === 'string' ? entry : entry[gender];
}

/** Models that must be built rather than sourced CC0. */
export function bespokeAssets() {
  return OUTFITS.filter((o) => o.bespoke).map((o) => o.id);
}

export { OUTFIT_BY_ID };
