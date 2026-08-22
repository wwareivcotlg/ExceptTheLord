// ============================================================
// TUNING — every global constant. Safe to edit. No logic here.
// ============================================================

export const TUNING = {
  // --- Offline progression ---
  OFFLINE_CAP_MS: 10 * 60 * 60 * 1000,   // 10 hours
  BUCKET_MS: 5 * 60 * 1000,              // 5-minute simulation buckets

  // --- Visitor flow ---
  // The base rate governs OFFLINE accrual: 12/hr against a 10-hour
  // cap is ~120 souls for a night away, which is the right size for
  // a "while you were away" card.
  BASE_VISITORS_PER_HOUR: 12,

  // Live play needs a different rate. At 12/hr a watching player
  // sees one person every five minutes and the church reads as
  // abandoned. Presence multiplies footfall — the doors are open
  // and someone is there to meet people. An hour of active play
  // lands near a full offline cycle, so being present is rewarded
  // without absence being punished.
  LIVE_PRESENCE_MULTIPLIER: 20,

  // Fraction of arrivals who are strangers rather than members.
  // Outreach lifts this, and lifts total footfall with it.
  STRANGER_SHARE: 0.30,

  // --- Storage ---
  // Tuned so the kitchen is a real bottleneck on Sabbath: production
  // runs slightly ahead of ordinary demand, and behind doubled demand.
  SUPPLY_CAP: { food: 30, clothing: 20 },

  // --- Capacity ---
  // Generous on purpose: one batch prayer meeting serves the whole
  // queue in a single tap, so a long queue is a reward, not a chore.
  COUNSEL_QUEUE_CAP: 24,

  // Word visitors beyond seating wait in the vestibule instead of
  // leaving. Cap is a multiple of seat capacity.
  VESTIBULE_MULTIPLIER: 2,

  // --- Folding chairs (deacons & trustees) ---
  FOLDING_CHAIRS_BASE: 6,                    // extra seats per deployment
  FOLDING_CHAIR_COST: 45,                    // Offering per chair
  FOLDING_CHAIR_COOLDOWN_MS: 6 * 60 * 60 * 1000,

  // --- Ceilings (see design doc 6.2) ---
  MAX_SERVICE_MULTIPLIER: 5.0,
  VIRTUAL_REACH_CAP: 0.4,

  // --- Grid ---
  // Footprint grows with recognition rank. Too much at once and the
  // church feels empty; too little and free placement stops feeling free.
  // Sized so the widest early room (Fellowship Hall, 4 tiles) fits
  // in the margin beside a 6-wide sanctuary with an aisle to spare.
  // A grid that can't fit the first buildable room is a dead start.
  GRID_BY_RANK: {
    mission:      { w: 14, h: 11 },
    local_temple: { w: 18, h: 14 },
    district:     { w: 22, h: 17 },
    national:     { w: 26, h: 20 },
    planting:     { w: 26, h: 20 },
  },
  MOVE_ROOM_COST: 60,   // Offering. Never charge Favor to rearrange.

  // --- Save ---
  SAVE_DEBOUNCE_MS: 5000,
  CURRENT_VERSION: 2,
};
