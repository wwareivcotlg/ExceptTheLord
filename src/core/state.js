// ============================================================
// state.js — the save blob shape and its migration chain.
// ============================================================

import { TUNING } from '../data/tuning.js';
import { DEFAULT_SCHEDULE } from '../data/schedule.js';
import { ROOM_BY_ID } from '../data/rooms.js';

export function newState(nowMs, schedule = DEFAULT_SCHEDULE) {
  return {
    v: TUNING.CURRENT_VERSION,
    lastSavedAt: nowMs,
    level: 1,
    xp: 0,
    rank: 'mission',
    schedule: { ...schedule },
    currency: { offering: 200, favor: 0, supplies: { food: 8, clothing: 4 } },
    grid: { ...TUNING.GRID_BY_RANK.mission, entrance: { x: 6, y: 10 } },
    rooms: [
      { id: 'sanctuary', x: 4, y: 0, rot: 0, level: 1, seats: ROOM_BY_ID.sanctuary.baseSeats },
    ],
    ministries: [],
    buffs: [],
    construction: [],
    workers: [],
    sanctuary: { seated: 0, vestibule: 0, tempSeats: 0, chairsReadyAt: 0 },
    queue: [],
    characters: {},
    stats: { totalServed: 0, servicesHeld: 0 },
  };
}

// ------------------------------------------------------------
// MIGRATIONS — forward only. NEVER delete an old one: a player
// returning after eight months needs the whole chain.
// ------------------------------------------------------------
const MIGRATIONS = {
  // v2 introduced free placement: the grid gained an entrance tile
  // and rooms gained rotation. Saves from v1 had neither.
  2: (s) => ({
    ...s,
    grid: {
      ...TUNING.GRID_BY_RANK.mission,
      ...s.grid,
      entrance: s.grid?.entrance ?? { x: Math.floor((s.grid?.w ?? 12) / 2), y: (s.grid?.h ?? 10) - 1 },
    },
    rooms: (s.rooms || []).map((r) => ({ ...r, rot: r.rot ?? 0 })),
  }),
};

export function migrate(state) {
  let s = structuredClone(state);
  while (s.v < TUNING.CURRENT_VERSION) {
    const next = MIGRATIONS[s.v + 1];
    if (!next) { s.v = TUNING.CURRENT_VERSION; break; }
    s = next(s);
    s.v += 1;
  }
  return s;
}
