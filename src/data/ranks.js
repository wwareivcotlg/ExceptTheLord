// ============================================================
// RANKS — the recognition ladder. Safe to edit.
//
// Two parallel tracks, deliberately separate:
//
//   LEVEL is earned from XP on every need served. Frequent, always
//   visible, and it gates what you may build and found.
//
//   RANK is milestone-based and rare. It grants FLOOR SPACE and
//   opens higher visitor tiers. It should feel ceremonial.
//
// A rank requires both a level and evidence of ministry actually
// happening — you cannot buy your way up on material service alone.
// ============================================================

export const RANKS = [
  {
    id: 'mission',
    name: 'Mission',
    requires: { level: 1, servicesHeld: 0 },
    blurb: 'A storefront room and a handful of chairs.',
    scripture: 'Where two or three are gathered together in my name. — Matthew 18:20',
  },
  {
    id: 'local_temple',
    name: 'Local Temple',
    requires: { level: 4, servicesHeld: 3 },
    blurb: 'Recognized, named, and given a pastor.',
    scripture: 'Ye are the temple of the living God. — 2 Corinthians 6:16',
  },
  {
    id: 'district',
    name: 'District Recognition',
    requires: { level: 9, servicesHeld: 15, totalServed: 400 },
    blurb: 'The district takes notice. New faces begin to appear.',
    scripture: 'Enlarge the place of thy tent. — Isaiah 54:2',
  },
  {
    id: 'national',
    name: 'National Convention',
    requires: { level: 16, servicesHeld: 40, totalServed: 1500 },
    blurb: 'Invited to the national gathering.',
    scripture: 'From the rising of the sun unto the going down of the same. — Psalm 113:3',
  },
  {
    id: 'planting',
    name: 'Temple Planting',
    requires: { level: 25, servicesHeld: 100, totalServed: 5000 },
    blurb: 'Send out what you have built.',
    scripture: 'Go ye therefore, and teach all nations. — Matthew 28:19',
  },
];

export const RANK_BY_ID = Object.fromEntries(RANKS.map((r) => [r.id, r]));
export const RANK_ORDER = RANKS.map((r) => r.id);

/**
 * Cumulative XP needed to REACH a level.
 * Tuned so the first few levels come quickly — a new player should
 * feel movement in one sitting — then stretch out.
 */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(150 * Math.pow(level - 1, 1.8));
}

export const MAX_LEVEL = 40;
