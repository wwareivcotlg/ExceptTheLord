// ============================================================
// ministry.js — founding a ministry.
//
// The registry, the modifier vocabulary, and the stacking maths
// all live elsewhere (data/ministries.js, core/modifiers.js).
// This is only the act of founding one, and turning a modifier
// list into words a person can read.
// ============================================================

import { MINISTRIES, MINISTRY_BY_ID } from '../data/ministries.js';
import { resolveModifiers } from './modifiers.js';

export const MINISTRY_REASONS = {
  FOUNDED: 'Already founded.',
  LEVEL: 'Not available yet.',
  REQUIRES: 'Needs another ministry first.',
  COST: 'Not enough to found it.',
  SEASON: 'Only during its season.',
};

const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** Turn one modifier into a sentence. */
export function describeModifier(mod) {
  switch (mod.type) {
    case 'service_multiplier': return `${pct(mod.value)} service offering`;
    case 'visitor_rate': return `${pct(mod.value)} arrivals`;
    case 'visitor_rate_stranger': return `${pct(mod.value)} strangers through the door`;
    case 'visitor_tier_unlock': return `${mod.value.replace('_', ' ')} visitors begin to come`;
    case 'need_unlock': return `a new need can be met`;
    case 'production_speed':
      return mod.supply ? `${pct(mod.value)} ${mod.supply} production` : `${pct(mod.value)} production`;
    case 'favor_gain': return `${pct(mod.value)} favor`;
    case 'queue_capacity': return `+${mod.value} waiting for prayer`;
    case 'overflow_seats': return `+${mod.value} folding chairs`;
    case 'chair_cooldown_cut': return `chairs ready ${pct(mod.value)} sooner`;
    case 'vestibule_multiplier': return `far more room in the vestibule`;
    case 'virtual_reach': return `${pct(mod.value)} reach to those watching online`;
    case 'offline_grace': return `longer catch-up while away`;
    default: return mod.type;
  }
}

export function describeMinistry(def) {
  return def.modifiers.map(describeModifier);
}

function seasonActive(season, atMs) {
  if (!season) return true;
  const d = new Date(atMs);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return season.start <= season.end
    ? md >= season.start && md <= season.end
    : md >= season.start || md <= season.end;
}

/** Can this ministry be founded right now, and if not, why not? */
export function ministryStatus(state, id, atMs) {
  const def = MINISTRY_BY_ID[id];
  if (!def) return { ok: false, reason: MINISTRY_REASONS.LEVEL };

  const owned = new Set((state.ministries || []).map((m) => m.id));
  if (owned.has(id)) return { ok: false, reason: MINISTRY_REASONS.FOUNDED, founded: true };
  if (!seasonActive(def.season, atMs)) return { ok: false, reason: MINISTRY_REASONS.SEASON };

  const need = def.unlock || {};
  if (need.level && (state.level || 1) < need.level) {
    return { ok: false, reason: MINISTRY_REASONS.LEVEL, unlocksAt: need.level };
  }
  const missing = (need.requires || []).filter((r) => !owned.has(r));
  if (missing.length) {
    return {
      ok: false,
      reason: MINISTRY_REASONS.REQUIRES,
      needs: missing.map((r) => MINISTRY_BY_ID[r]?.name || r),
    };
  }
  if ((state.currency.offering || 0) < (need.offering || 0) ||
      (state.currency.favor || 0) < (need.favor || 0)) {
    return { ok: false, reason: MINISTRY_REASONS.COST, cost: need };
  }
  return { ok: true, cost: need };
}

/** Everything the ministry panel needs, in one call. */
export function ministryCatalog(state, atMs) {
  return MINISTRIES
    .filter((def) => seasonActive(def.season, atMs) || (state.ministries || []).some((m) => m.id === def.id))
    .map((def) => {
      const status = ministryStatus(state, def.id, atMs);
      return {
        id: def.id,
        name: def.name,
        tree: def.tree,
        cost: def.unlock || {},
        unlocksAt: def.unlock?.level ?? null,
        requires: def.unlock?.requires ?? [],
        effects: describeMinistry(def),
        scripture: def.scripture,
        founded: !!status.founded,
        available: status.ok,
        reason: status.ok ? null : status.reason,
        needs: status.needs ?? null,
      };
    })
    .sort((a, b) => {
      if (a.founded !== b.founded) return a.founded ? 1 : -1;
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.unlocksAt ?? 0) - (b.unlocksAt ?? 0);
    });
}

/** Found a ministry. Takes nothing unless everything checks out. */
export function foundMinistry(state, id, atMs) {
  const status = ministryStatus(state, id, atMs);
  if (!status.ok) return { ok: false, reason: status.reason, needs: status.needs };

  const def = MINISTRY_BY_ID[id];
  const cost = def.unlock || {};
  state.currency.offering -= cost.offering || 0;
  state.currency.favor -= cost.favor || 0;

  state.ministries = state.ministries || [];
  state.ministries.push({ id, startedAt: atMs });

  return { ok: true, ministry: def, cost, effects: describeMinistry(def) };
}

/** A short summary of what all founded ministries add up to. */
export function ministrySummary(state, atMs) {
  const mods = resolveModifiers(state, atMs);
  return {
    count: (state.ministries || []).length,
    service: mods.service_multiplier,
    arrivals: mods.visitor_rate,
    favor: mods.favor_gain,
  };
}
