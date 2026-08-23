// ============================================================
// rhythm.js — Sabbath, Bible Study, Choir Rehearsal.
//
// THE NON-PUNITIVE RULE, enforced here rather than trusted to UI:
// ordinary days return null. There is no "1.0x" to display, no
// neutral badge, nothing. The interface should say nothing at all
// on a Tuesday and celebrate on a Sabbath. A player must never be
// shown a number that implies they are being penalised for the day
// of the week.
//
// Missing a special day costs nothing. The pews still filled, the
// queue still grew, the supplies still came in. You simply didn't
// get the multiplier.
// ============================================================

import { SCHEDULE_EVENTS, DEFAULT_SCHEDULE, eventForDay } from '../data/schedule.js';
import { TUNING } from '../data/tuning.js';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                          'Thursday', 'Friday', 'Saturday'];

/** Stable per-day key, so "once today" survives a reload. */
export function dayKey(atMs) {
  const d = new Date(atMs);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function getSchedule(state) {
  return { ...DEFAULT_SCHEDULE, ...(state.schedule || {}) };
}

/**
 * What today is, or NULL on an ordinary day.
 * Returning null rather than a neutral object is deliberate — it
 * makes "show nothing on ordinary days" the path of least
 * resistance for every caller.
 */
export function todayEvent(state, atMs) {
  const id = eventForDay(getSchedule(state), new Date(atMs).getDay());
  if (!id) return null;
  const def = SCHEDULE_EVENTS[id];
  if (!def) return null;
  return { id, label: def.label, scripture: def.scripture,
           allowMultipleServices: !!def.allowMultipleServices };
}

/** The next special day, for a quiet "coming up" line. */
export function nextSpecialDay(state, atMs) {
  const schedule = getSchedule(state);
  const today = new Date(atMs).getDay();
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = (today + ahead) % 7;
    const id = eventForDay(schedule, day);
    if (!id) continue;
    return {
      id,
      label: SCHEDULE_EVENTS[id].label,
      day: DAY_NAMES[day],
      inDays: ahead,
    };
  }
  return null;
}

/**
 * Choir rehearsal grants a buff spent on the NEXT service, rather
 * than paying out on the day. That chains Friday into Sunday and
 * makes both matter without penalising a skip.
 *
 * The buff deliberately does NOT expire at midnight — a player who
 * rehearses Friday but cannot open the app Sunday morning should
 * not lose it.
 */
export function grantRehearsalBuff(state, atMs) {
  const event = todayEvent(state, atMs);
  if (!event) return null;
  const def = SCHEDULE_EVENTS[event.id];
  if (!def?.grantsBuff) return null;

  const key = dayKey(atMs);
  state.rhythm = state.rhythm || {};
  if (state.rhythm.lastRehearsal === key) return null;   // once per day

  state.buffs = state.buffs || [];
  if (state.buffs.some((b) => b.id === def.grantsBuff.id)) {
    state.rhythm.lastRehearsal = key;
    return null;
  }

  state.buffs.push({ ...def.grantsBuff, consumeOnService: true, grantedAt: atMs });
  state.rhythm.lastRehearsal = key;
  return { ...def.grantsBuff };
}

/** Is a rehearsal buff currently banked? */
export function pendingRehearsal(state) {
  return (state.buffs || []).find((b) => b.consumeOnService) || null;
}

// ---------- Choosing your days ----------

export function canChangeSchedule(state, atMs) {
  const last = state.rhythm?.scheduleChangedAt || 0;
  const ready = last + TUNING.SCHEDULE_CHANGE_COOLDOWN_MS;
  if (atMs < ready) return { ok: false, readyAt: ready };
  return { ok: true };
}

/**
 * Set the Bible Study and Choir Rehearsal days.
 * The Sabbath is not the player's to move.
 */
export function setSchedule(state, { bible_study, choir_rehearsal }, atMs, { first = false } = {}) {
  if (!first) {
    const gate = canChangeSchedule(state, atMs);
    if (!gate.ok) return { ok: false, reason: 'too_soon', readyAt: gate.readyAt };
  }

  const sabbath = getSchedule(state).sabbath;
  const inRange = (d) => Number.isInteger(d) && d >= 0 && d <= 6;
  if (!inRange(bible_study) || !inRange(choir_rehearsal)) {
    return { ok: false, reason: 'not_a_day' };
  }
  if (bible_study === choir_rehearsal) return { ok: false, reason: 'same_day' };
  if (bible_study === sabbath || choir_rehearsal === sabbath) {
    return { ok: false, reason: 'sabbath_taken' };
  }

  state.schedule = { sabbath, bible_study, choir_rehearsal };
  state.rhythm = { ...(state.rhythm || {}), scheduleChangedAt: atMs };
  if (first) state.onboarded = true;
  return { ok: true, schedule: state.schedule };
}

export function needsOnboarding(state) {
  return !state.onboarded;
}

/** Days the player may pick from — everything but the Sabbath. */
export function selectableDays(state) {
  const sabbath = getSchedule(state).sabbath;
  return DAY_NAMES.map((name, day) => ({ day, name }))
                  .filter((d) => d.day !== sabbath);
}
