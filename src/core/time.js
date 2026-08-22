// ============================================================
// time.js — server-authoritative clock.
//
// Device clocks can be rolled forward to skip build timers. All
// simulation uses serverNow(). A failed sync NEVER blocks play.
// ============================================================

let clockOffset = 0;
let synced = false;

export function serverNow() {
  return Date.now() + clockOffset;
}

export function isClockSynced() {
  return synced;
}

/**
 * Sync against Supabase's server_time() RPC once per session.
 * @param {Function} rpc async (name) => ISO string or epoch ms
 */
export async function syncClock(rpc) {
  try {
    const t0 = Date.now();
    const raw = await rpc('server_time');
    const rtt = Date.now() - t0;
    const serverMs = typeof raw === 'number' ? raw : Date.parse(raw);
    if (!Number.isFinite(serverMs)) throw new Error('bad server time');
    clockOffset = serverMs + rtt / 2 - Date.now();
    synced = true;
  } catch (err) {
    // Offline launch: fall back to device time, flag for reconciliation.
    clockOffset = 0;
    synced = false;
    console.warn('[time] clock sync failed, using device time', err);
  }
  return { clockOffset, synced };
}

/** Test hook — lets the headless harness drive time directly. */
export function __setClockOffset(ms) {
  clockOffset = ms;
  synced = true;
}

export const dayOfWeek = (ms) => new Date(ms).getDay(); // 0 = Sunday
