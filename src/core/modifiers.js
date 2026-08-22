// ============================================================
// modifiers.js — collapses ministries + weekly rhythm + buffs
// into one resolved set of numbers.
//
// STACKING RULE (design doc 6.2):
//   additive within a tree, multiplicative across trees.
// Purely multiplicative stacking goes exponential by mid-game
// and the economy stops meaning anything.
// ============================================================

import { MINISTRY_BY_ID } from '../data/ministries.js';
import { SCHEDULE_EVENTS, eventForDay } from '../data/schedule.js';
import { TUNING } from '../data/tuning.js';
import { dayOfWeek } from './time.js';

const MULTIPLIER_TYPES = new Set([
  'service_multiplier',
  'visitor_rate',
  'visitor_rate_stranger',
  'favor_gain',
  'production_speed',
  'virtual_reach',
  'chair_cooldown_cut',
]);

const FLAT_TYPES = new Set([
  'queue_capacity', 'offline_grace', 'overflow_seats', 'vestibule_multiplier',
]);

function seasonActive(season, atMs) {
  if (!season) return true;
  const d = new Date(atMs);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return season.start <= season.end
    ? md >= season.start && md <= season.end
    : md >= season.start || md <= season.end; // wraps the year
}

/**
 * Arrivals per unit time, relative to base.
 *
 * Outreach raises `visitor_rate_stranger`, which lifts the stranger
 * portion of footfall — so the ministry actually puts more people
 * through the door instead of only relabelling who they are.
 * Shared by the live loop and the offline resolver so the two can
 * never disagree about how busy the church is.
 */
export function effectiveVisitorRate(mods) {
  const strangerLift = Math.max(0, (mods.visitor_rate_stranger - 1) * TUNING.STRANGER_SHARE);
  return mods.visitor_rate * (1 + strangerLift);
}

/** How likely any given arrival is a stranger rather than a member. */
export function strangerShare(mods) {
  return Math.min(0.8, TUNING.STRANGER_SHARE * mods.visitor_rate_stranger);
}

/**
 * @param {object} state  player state blob
 * @param {number} atMs   the moment being simulated (per bucket!)
 * @returns {object} resolved modifiers
 */
export function resolveModifiers(state, atMs) {
  // trees[type][treeName] = summed value  → additive within tree
  const trees = {};
  const flat = {};
  const unlocked = new Set();

  const add = (type, tree, value) => {
    if (FLAT_TYPES.has(type)) {
      flat[type] = (flat[type] || 0) + value;
      return;
    }
    trees[type] = trees[type] || {};
    trees[type][tree] = (trees[type][tree] || 0) + value;
  };

  // --- Ministries ---
  for (const owned of state.ministries || []) {
    const def = MINISTRY_BY_ID[owned.id];
    if (!def) continue;
    const active = seasonActive(def.season, atMs);
    const scale = active ? 1 : (def.residual || 0); // seasonal residual
    if (scale === 0) continue;
    for (const mod of def.modifiers) {
      if (mod.type === 'visitor_tier_unlock' || mod.type === 'need_unlock') {
        if (active) unlocked.add(mod.value);
        continue;
      }
      add(mod.type, def.tree || def.id, mod.value * scale);
    }
  }

  // --- Weekly rhythm (resolved per bucket, using THAT bucket's day) ---
  const schedule = state.schedule || {};
  const eventId = eventForDay(schedule, dayOfWeek(atMs));
  const event = eventId ? SCHEDULE_EVENTS[eventId] : null;
  if (event?.modifiers) {
    for (const mod of event.modifiers) add(mod.type, 'schedule', mod.value);
  }

  // --- Persistent buffs (choir rehearsal; consumed by next service) ---
  for (const buff of state.buffs || []) {
    add(buff.type, 'buff', buff.value);
  }

  // Collapse: (1 + sum_of_tree) multiplied across trees.
  const out = { activeEvent: eventId, unlocked };
  for (const type of MULTIPLIER_TYPES) {
    let product = 1;
    for (const value of Object.values(trees[type] || {})) product *= 1 + value;
    out[type] = product;
  }
  for (const type of FLAT_TYPES) out[type] = flat[type] || 0;

  // Ceilings
  out.service_multiplier = Math.min(out.service_multiplier, TUNING.MAX_SERVICE_MULTIPLIER);
  out.virtual_reach = Math.min(out.virtual_reach - 1, TUNING.VIRTUAL_REACH_CAP);

  return out;
}
