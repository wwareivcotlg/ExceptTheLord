// ============================================================
// characters.js — who comes back, and what becomes of them.
//
// Arrivals are scheduled BY DAY, not by dice, so the same rules
// work identically in the live loop and the offline resolver:
// "has Mother Hayes come today?" has one answer either way.
//
// The stranger's arc is the emotional payoff of the whole game.
// It gets a real moment (see conversionMoment) rather than a
// silent flag flip.
// ============================================================

import { CHARACTERS, CHARACTER_BY_ID, CONVERSION_LINES } from '../data/characters.js';
import { todayEvent, dayKey } from './rhythm.js';
import { bucketRng, hash, weightedPick } from './rng.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How a name is shown.
 *
 * A title is only prepended when the name does not already carry
 * it. "Mother Hayes" and "Brother Terrence" both already include
 * their title, and blindly prefixing produced "Mother Mother
 * Hayes". One helper, used everywhere a name is displayed.
 */
export function displayName(name, title) {
  if (!title) return name;
  return name.startsWith(title) ? name : `${title} ${name}`;
}

export function characterState(state, id) {
  state.characters = state.characters || {};
  state.characters[id] = state.characters[id] || {
    visits: 0, servedCount: 0, lastVisit: null, converted: false, name: null,
  };
  return state.characters[id];
}

/** Has this character already come today? */
function cameToday(state, id, atMs) {
  return characterState(state, id).lastVisit === dayKey(atMs);
}

/** Does the arrival rule fire on this day? */
function ruleFires(state, def, atMs) {
  const rule = def.arrival || {};
  if (rule.every_day) return true;

  if (rule.on_events) {
    const event = todayEvent(state, atMs);
    if (event && rule.on_events.includes(event.id)) return true;
  }
  if (rule.on_days) {
    if (rule.on_days.includes(new Date(atMs).getDay())) return true;
  }
  if (rule.every_n_days) {
    const since = characterState(state, def.id).lastVisitAt;
    if (!since) return true;
    return atMs - since >= rule.every_n_days * DAY_MS;
  }
  return false;
}

/** Everyone due to arrive right now who hasn't yet today. */
export function dueCharacters(state, atMs) {
  return CHARACTERS
    .filter((def) => !cameToday(state, def.id, atMs) && ruleFires(state, def, atMs))
    .map((def) => def.id);
}

/** The need this character brings on this particular visit. */
export function needForVisit(state, id, atMs) {
  const def = CHARACTER_BY_ID[id];
  const cs = characterState(state, id);

  // The stranger asks for baptism once he has been served enough.
  if (def.arc && !cs.converted && cs.servedCount >= def.arc.visitsBeforeBaptism) {
    return 'baptism';
  }
  const rng = bucketRng(`${id}:need`, cs.visits);
  return def.needs[Math.floor(rng() * def.needs.length)];
}

/** Everything needed to put this person in the church. */
export function makeArrival(state, id, atMs) {
  const def = CHARACTER_BY_ID[id];
  const cs = characterState(state, id);
  const converted = cs.converted;

  const appearance = { ...def.appearance };
  if (converted && def.arc?.converted) {
    appearance.outfit = def.arc.converted.outfit;
    appearance.outfitColor = def.arc.converted.outfitColor;
  }

  const lines = converted && def.arc?.converted?.greeting
    ? def.arc.converted.greeting
    : def.greeting;
  const rng = bucketRng(`${id}:line`, cs.visits);

  const askingBaptism = !!def.arc && !converted &&
    cs.servedCount >= def.arc.visitsBeforeBaptism;

  const name = cs.name || def.name;
  const title = converted ? def.arc?.converted?.title : def.title;

  return {
    characterId: id,
    name,
    title,
    display: displayName(name, title),
    appearance,
    needId: needForVisit(state, id, atMs),
    greeting: askingBaptism ? CONVERSION_LINES.before : lines[Math.floor(rng() * lines.length)],
    gift: converted ? def.arc?.converted?.gift : def.gift,
    grantsBuff: def.grantsBuff || null,
    askingBaptism,
  };
}

/** Record that they showed up. */
export function markArrived(state, id, atMs) {
  const cs = characterState(state, id);
  cs.visits += 1;
  cs.lastVisit = dayKey(atMs);
  cs.lastVisitAt = atMs;
  return cs;
}

/**
 * The moment the stranger takes a name.
 * Returns null unless this service actually converted him.
 */
export function conversionMoment(state, id, atMs) {
  const def = CHARACTER_BY_ID[id];
  const cs = characterState(state, id);
  if (!def.arc || cs.converted) return null;
  if (cs.servedCount < def.arc.visitsBeforeBaptism) return null;

  const rng = bucketRng(`${id}:name`, hash(String(state.grid?.entrance?.x ?? 0)));
  const name = def.arc.names[Math.floor(rng() * def.arc.names.length)];
  cs.converted = true;
  cs.name = name;
  cs.convertedAt = atMs;

  return {
    characterId: id,
    name,
    line: CONVERSION_LINES.after.replace('{name}', name),
    scripture: CONVERSION_LINES.scripture,
  };
}

/**
 * Called when a named character's need is met.
 * @returns {{gift, buff, conversion, farewell}}
 */
export function onServed(state, id, atMs, { needId } = {}) {
  const def = CHARACTER_BY_ID[id];
  const cs = characterState(state, id);
  cs.servedCount += 1;

  const result = { gift: null, buff: null, conversion: null, farewell: null };

  const gift = cs.converted ? def.arc?.converted?.gift : def.gift;
  if (gift) {
    state.currency.favor += gift.favor || 0;
    state.currency.offering += gift.offering || 0;
    result.gift = gift;
  }

  if (def.grantsBuff) {
    state.buffs = state.buffs || [];
    const existing = state.buffs.find((b) => b.id === def.grantsBuff.id);
    const expiresAt = atMs + def.grantsBuff.durationS * 1000;
    if (existing) existing.expiresAt = expiresAt;
    else state.buffs.push({ ...def.grantsBuff, expiresAt });
    result.buff = def.grantsBuff;
  }

  // Baptism is what completes the arc.
  if (needId === 'baptism') {
    result.conversion = conversionMoment(state, id, atMs);
  }

  const lines = cs.converted && def.arc?.converted?.greeting ? def.farewell : def.farewell;
  const rng = bucketRng(`${id}:bye`, cs.servedCount);
  result.farewell = lines[Math.floor(rng() * lines.length)];

  return result;
}

/** Progress through the arc, for a quiet line in the ministry panel. */
export function arcProgress(state, id = 'the_stranger') {
  const def = CHARACTER_BY_ID[id];
  if (!def?.arc) return null;
  const cs = characterState(state, id);
  return {
    converted: cs.converted,
    name: cs.name,
    served: cs.servedCount,
    needed: def.arc.visitsBeforeBaptism,
    visits: cs.visits,
  };
}
