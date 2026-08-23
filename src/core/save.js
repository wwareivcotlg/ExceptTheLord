// ============================================================
// save.js — localStorage is the source of truth DURING a session.
// Supabase is the sync target.
//
// THE 201 RULE: Supabase inserts return HTTP 201 on success.
// This helper is the only place a raw fetch to Supabase should
// ever live, so 201 is handled correctly exactly once.
// ============================================================

import { TUNING } from '../data/tuning.js';
import { migrate } from './state.js';

const LOCAL_KEY = 'etl.save.v1';
const LOCAL_ID_KEY = 'etl.playerId';

let saveTimer = null;
let pending = null;

// ---------- Supabase ----------

export function makeSupabase(url, anonKey) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };

  async function write(path, body, method = 'POST', extraHeaders = {}) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { ...headers, ...extraHeaders },
      body: JSON.stringify(body),
    });
    // 200 OK, 201 Created, 204 No Content are ALL success.
    if (res.status === 200 || res.status === 201 || res.status === 204) {
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }

  async function read(path) {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
    return res.json();
  }

  async function rpc(name, args = {}) {
    return write(`rpc/${name}`, args);
  }

  return { write, read, rpc };
}

// ---------- Local ----------

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { state: migrate(parsed.state), counter: parsed.counter || 0 };
  } catch {
    return null;
  }
}

export function writeLocal(state, counter) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ state, counter }));
  } catch (err) {
    console.warn('[save] local write failed', err);
  }
}

export function getOrCreatePlayerId() {
  let id = localStorage.getItem(LOCAL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL_ID_KEY, id);
  }
  return id;
}

// ---------- Sync ----------

/** Higher save_counter wins. Simple, sufficient — no leaderboard, no stakes. */
export function pickNewer(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  return remote.counter > local.counter ? remote : local;
}

export async function pushRemote(sb, playerId, state, counter) {
  return sb.write(
    'player_saves',
    { player_id: playerId, state, save_version: state.v, save_counter: counter, updated_at: new Date().toISOString() },
    'POST',
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );
}

export async function pullRemote(sb, playerId) {
  const rows = await sb.read(`player_saves?player_id=eq.${playerId}&select=state,save_counter`);
  if (!rows?.length) return null;
  return { state: migrate(rows[0].state), counter: rows[0].save_counter };
}

/**
 * Debounced push, plus a flush on visibilitychange/pagehide.
 *
 * This is the single most important function in the project.
 * Subsplash web views get killed by the OS without warning. Save on
 * a timer alone and players lose progress you can never reproduce.
 */
export function installAutosave(sb, playerId, getState, getCounter) {
  const flush = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const state = getState();
    const counter = getCounter();
    writeLocal(state, counter);
    pushRemote(sb, playerId, state, counter).catch((e) => console.warn('[save] push failed', e));
  };

  const schedule = () => {
    writeLocal(getState(), getCounter()); // local is always immediate
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; flush(); }, TUNING.SAVE_DEBOUNCE_MS);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  return { schedule, flush };
}
