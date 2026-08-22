// ============================================================
// WEEKLY RHYTHM — Safe to edit.
//
// NON-PUNITIVE RULE: ordinary days are the baseline, not a penalty.
// There is no entry for an ordinary day and the UI shows nothing.
// Special days are strictly additive.
// ============================================================

export const SCHEDULE_EVENTS = {
  sabbath: {
    label: 'Sabbath',
    modifiers: [
      { type: 'visitor_rate', value: 1.00 },        // double arrivals
      { type: 'service_multiplier', value: 1.00 },  // double service payout
      { type: 'favor_gain', value: 0.50 },
    ],
    allowMultipleServices: true,
    scripture: 'This is the day which the LORD hath made. — Psalm 118:24',
  },
  bible_study: {
    label: 'Bible Study',
    modifiers: [
      { type: 'favor_gain', value: 0.35 },
      { type: 'visitor_rate', value: 0.20 },
    ],
    scripture: 'Study to shew thyself approved unto God. — 2 Timothy 2:15',
  },
  choir_rehearsal: {
    label: 'Choir Rehearsal',
    // Grants a buff consumed by the NEXT service rather than paying out.
    // Persists until a service is held — it does NOT expire at midnight.
    grantsBuff: { id: 'choir_rehearsal', type: 'service_multiplier', value: 0.30 },
    scripture: 'Sing unto him a new song; play skilfully. — Psalm 33:3',
  },
};

// Default day assignments (0 = Sunday). Player sets these at onboarding.
export const DEFAULT_SCHEDULE = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };

/** Which special event, if any, falls on this weekday for this player. */
export function eventForDay(schedule, dayOfWeek) {
  for (const [eventId, day] of Object.entries(schedule)) {
    if (day === dayOfWeek) return eventId;
  }
  return null;
}
