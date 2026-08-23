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
    grid: { ...TUNING.GRID_BY_RANK.mission, entrance: { x: 7, y: 11 } },
    rooms: [
      { id: 'sanctuary', x: 4, y: 0, rot: 0, level: 1, seats: ROOM_BY_ID.sanctuary.baseSeats },
    ],
    ministries: [],
    buffs: [],
    construction: [],
    workers: [],
    sanctuary: { seated: 0, vestibule: 0, tempSeats: 0, chairsReadyAt: 0,
                 mix: { stranger: 0, member: 0, youth: 0 },
                 service: null, preacherRestUntil: 0 },
    queue: [],
    sermons: ['come_unto_me'],
    onboarded: false,
    rhythm: { lastRehearsal: null, scheduleChangedAt: 0 },
    awayLog: [],
    characters: {},
    stats: { totalServed: 0, servicesHeld: 0 },
  };
}

// ------------------------------------------------------------
// MIGRATIONS — forward only. NEVER delete an old one: a player
// returning after eight months needs the whole chain.
// ------------------------------------------------------------
const MIGRATIONS = {
  // v4 introduced the weekly rhythm as a player choice. Existing
  // saves keep the default days and are treated as onboarded —
  // interrupting a returning player to ask would be rude.
  4: (s) => ({
    ...s,
    awayLog: s.awayLog ?? [],
    onboarded: s.onboarded ?? true,
    rhythm: s.rhythm ?? { lastRehearsal: null, scheduleChangedAt: 0 },
    schedule: s.schedule ?? { ...DEFAULT_SCHEDULE },
  }),

  // v3 introduced the sanctuary service: a sermon library, the
  // congregation mix, and the preacher's rest.
  3: (s) => ({
    ...s,
    sermons: s.sermons ?? ['come_unto_me'],
    sanctuary: {
      ...s.sanctuary,
      mix: s.sanctuary?.mix ?? { stranger: 0, member: Math.max(0, s.sanctuary?.seated || 0), youth: 0 },
      service: s.sanctuary?.service ?? null,
      preacherRestUntil: s.sanctuary?.preacherRestUntil ?? 0,
    },
  }),

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
