// ============================================================
// away.js — the While You Were Away report.
//
// The offline resolver already produces every number. This turns
// them into something a person wants to read, and keeps a short
// ledger so the church has a memory of its own week.
//
// FRAMING RULE: an unmet need is described as a NEED, not a loss.
// "5 came seeking baptism" says exactly what "5 turned away" says
// — it still tells you to build the pool — but it describes people
// arriving rather than the player failing. Nothing in this card
// may read as a penalty.
// ============================================================

import { NEED_BY_ID } from '../data/needs.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { TUNING } from '../data/tuning.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Notable things bypass the time threshold entirely.
 * A finished room is worth announcing after eight minutes.
 */
export function isNotable(summary) {
  return !!(
    summary &&
    ((summary.completedRooms || []).length > 0 || summary.rehearsed === true)
  );
}

/** Did enough happen to be worth a card? */
export function shouldShowAway(summary) {
  if (!summary) return false;
  if (isNotable(summary)) return true;
  if ((summary.elapsedMs || 0) < TUNING.AWAY_MIN_MS) return false;
  const served = Object.values(summary.served || {}).reduce((a, b) => a + b, 0);
  return served > 0 || (summary.offering || 0) > 0 || (summary.seated || 0) > 0;
}

/** Total souls attended to, however they were met. */
export function soulsServed(summary) {
  return Object.values(summary.served || {}).reduce((a, b) => a + b, 0);
}

function describeAbsence(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${plural(mins, 'minute')} away`;
  const hours = ms / 3600000;
  if (hours < 24) return `${plural(Math.round(hours), 'hour')} away`;
  return `${plural(Math.round(hours / 24), 'day')} away`;
}

/**
 * Build the readable report.
 * @param {object} summary from resolveOffline
 * @param {object} state   post-resolution state
 * @param {Array}  history previous entries, newest first
 */
export function buildAwayReport(summary, state, history = []) {
  const served = [];
  for (const [needId, count] of Object.entries(summary.served || {})) {
    if (!count) continue;
    const need = NEED_BY_ID[needId];
    served.push({ needId, count, text: `${count} ${need?.served || 'were served'}` });
  }
  served.sort((a, b) => b.count - a.count);

  // Unmet needs. Framed as arrivals, never as losses.
  const seeking = [];
  for (const [needId, count] of Object.entries(summary.turnedAway || {})) {
    if (!count) continue;
    const need = NEED_BY_ID[needId];
    const roomBuilt = state.rooms.some((r) => r.id === need?.room);
    const room = roomBuilt ? null : ROOM_BY_ID[need?.room]?.name || null;
    seeking.push({
      needId,
      count,
      text: `${count} ${need?.seeking || 'came with a need'}`,
      // What would meet it, if anything is missing. The sentence is
      // built here rather than in the UI so the copy has one home.
      suggests: room,
      suggestion: room ? `a ${room} would meet this need` : null,
    });
  }
  seeking.sort((a, b) => b.count - a.count);

  const waiting = [];
  if (state.sanctuary.seated) waiting.push(`${plural(state.sanctuary.seated, 'soul')} in the pews`);
  if (state.sanctuary.vestibule) waiting.push(`${state.sanctuary.vestibule} waiting in the vestibule`);
  if (state.queue.length) waiting.push(`${plural(state.queue.length, 'soul')} awaiting prayer`);

  const supplies = Object.entries(summary.supplies || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`);

  const rooms = (summary.completedRooms || []).map((id) => ROOM_BY_ID[id]?.name || id);

  // The people who come back by name deserve their own line.
  const visitors = (summary.visitors || []).map((v) =>
    v.served ? `${v.name} came by` : `${v.name} came, and you were out of what they needed`);

  const report = {
    at: state.lastSavedAt,
    elapsedMs: summary.elapsedMs || 0,
    absence: describeAbsence(summary.elapsedMs || 0),
    capped: !!summary.wasCapped,
    offering: summary.offering || 0,
    favor: summary.favor || 0,
    xp: summary.xp || 0,
    souls: soulsServed(summary),
    served,
    seeking,
    waiting,
    supplies,
    rooms,
    rehearsed: !!summary.rehearsed,
    visitors,
    conversion: summary.conversion || null,
    headline: null,
  };

  report.headline = headlineFor(report, history);
  return report;
}

/**
 * One line of context drawn from the ledger. This is why keeping a
 * history is worth it: "your best night this week" teaches the
 * weekly rhythm better than any tutorial.
 */
export function headlineFor(report, history = []) {
  // Nothing outranks a soul being saved.
  if (report.conversion) return `${report.conversion.name} was baptized.`;
  if (report.rooms.length) return `${report.rooms[0]} is finished.`;
  if (!report.souls && !report.waiting.length) return 'A quiet stretch.';

  const past = history.filter((h) => h && typeof h.souls === 'number');
  if (past.length >= 2) {
    const best = Math.max(...past.map((h) => h.souls));
    if (report.souls > best) return 'Your busiest stretch this week.';
    const avg = past.reduce((a, h) => a + h.souls, 0) / past.length;
    if (report.souls > avg * 1.4) return 'Busier than usual.';
    if (report.souls > 0 && report.souls < avg * 0.6) return 'A quieter stretch than usual.';
  }

  if (report.rehearsed) return 'The choir rehearsed while you were out.';
  if (report.capped) return 'The church was full to what it could hold.';
  return null;
}

/** Newest first, capped. */
export function pushAwayHistory(state, report) {
  state.awayLog = [report, ...(state.awayLog || [])].slice(0, TUNING.AWAY_HISTORY);
  return state.awayLog;
}

export function awayHistory(state) {
  return state.awayLog || [];
}
