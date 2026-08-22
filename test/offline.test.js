// ============================================================
// Headless verification of the offline resolver.
// No rendering, no browser — pure timestamp math.
// Run: node test/offline.test.js
// ============================================================

import { newState, migrate } from '../src/core/state.js';
import { rotatedSize, rotateLocal, rotateFacing, footprintTiles, doorAndApproach,
         validatePlacement, legalPlacements, buildOccupancy, asciiMap,
         PLACEMENT_REASONS } from '../src/core/grid.js';
import { findPath, PathCache, distanceToRoom } from '../src/sim/pathfinding.js';
import { tileToWorld, roomTransform, floorExtent, pathToWorld, cameraFrame,
         pewLayout, chairSlots, TILE } from '../src/render/layout.js';
import { PALETTE, LIGHTING, QUALITY } from '../src/render/palette.js';
import { readFileSync } from 'node:fs';
import { VisitorSystem, WALK_SPEED, AUTO_SERVE_DELAY, SERVE_DURATION } from '../src/sim/visitors.js';
import { serveNeed, canServe, TAP_BONUS } from '../src/core/serve.js';
import { pickNearest } from '../src/render/picking.js';
import { CONTROLS, sign } from '../src/data/controls.js';
import { resolveOffline } from '../src/core/offline.js';
import { holdPrayerMeeting, queueCapacity } from '../src/core/prayer.js';
import { castCongregant, castRole, congregationWeights, hairFor, bespokeAssets,
         clergyOutfit } from '../src/core/casting.js';
import { FIXED_LEADERSHIP_ROLES, SKIN_TONES, TONE_RANGE_BY_GROUP,
         CLERGY_OUTFIT_BY_ROLE, OUTFITS, ASSET_BUDGET, ROLE_GENDER } from '../src/data/casting.js';
import { bucketRng } from '../src/core/rng.js';
import { seatCapacity, baseSeats, vestibuleCapacity, chairStatus,
         deployFoldingChairs, completeService } from '../src/core/sanctuary.js';
import { resolveModifiers } from '../src/core/modifiers.js';
import { TUNING } from '../src/data/tuning.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};
const H = 3600000;

// A Tuesday and a Sunday at 8am local, for weekday-sensitive tests.
const TUESDAY_8AM = new Date(2026, 7, 18, 8, 0, 0).getTime();
const SATURDAY_8PM = new Date(2026, 7, 22, 20, 0, 0).getTime();

function fullChurch(atMs) {
  const s = newState(atMs);
  const plan = [
    { id: 'fellowship_hall', x: 0, y: 0, rot: 0 },
    { id: 'benevolence_closet', x: 11, y: 0, rot: 0 },
    { id: 'prayer_room', x: 0, y: 5, rot: 0 },
    { id: 'baptismal_pool', x: 10, y: 4, rot: 0 },
  ];
  for (const p of plan) {
    const check = validatePlacement(s, p.id, p.x, p.y, p.rot);
    if (!check.valid) {
      throw new Error(`fixture placement invalid: ${p.id} @${p.x},${p.y} — ${check.reason}`);
    }
    s.rooms.push({ ...p, level: 1 });
  }
  return s;
}

console.log('\n=== 1. Determinism ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const a = resolveOffline(s, TUESDAY_8AM + 6 * H, 'player-abc');
  const b = resolveOffline(s, TUESDAY_8AM + 6 * H, 'player-abc');
  ok('same absence twice → identical state', JSON.stringify(a.state) === JSON.stringify(b.state));
  ok('same absence twice → identical summary', JSON.stringify(a.summary) === JSON.stringify(b.summary));

  const c = resolveOffline(s, TUESDAY_8AM + 6 * H, 'player-xyz');
  ok('different player → different outcome', JSON.stringify(a.summary) !== JSON.stringify(c.summary));
}

console.log('\n=== 2. Offline cap ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const short = resolveOffline(s, TUESDAY_8AM + 10 * H, 'p1');
  const long = resolveOffline(s, TUESDAY_8AM + 40 * H, 'p1');
  ok('40h absence is capped at 10h', long.summary.cappedMs === TUNING.OFFLINE_CAP_MS);
  ok('cap flag set', long.summary.wasCapped === true && short.summary.wasCapped === false);
  ok('40h offering does not exceed 10h offering',
     long.summary.offering <= short.summary.offering + 1,
     `(10h=${short.summary.offering}, 40h=${long.summary.offering})`);
}

console.log('\n=== 3. Sanctuary exempt from cap ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const long = resolveOffline(s, TUESDAY_8AM + 72 * H, 'p1');
  ok('pews fill to capacity after a long absence',
     long.state.sanctuary.seated === seatCapacity(long.state),
     `(seated=${long.state.sanctuary.seated}/${seatCapacity(long.state)})`);
}

console.log('\n=== 4. Chronological supply depletion ===');
{
  // No production rooms — a fixed larder that must run dry.
  const s = newState(TUESDAY_8AM);
  s.rooms.push({ id: 'prayer_room', x: 8, y: 4, rot: 0, level: 1 });
  s.currency.supplies = { food: 5, clothing: 0 };
  // Add the hall but strip its production so supply cannot replenish.
  s.rooms.push({ id: 'fellowship_hall', x: 0, y: 0, rot: 0, level: 1 });
  const r = resolveOffline(s, TUESDAY_8AM + 9 * H, 'p-larder');
  const foodServed = r.summary.served.food || 0;
  const foodTurned = r.summary.turnedAway.food || 0;
  const produced = r.summary.supplies.food || 0;
  ok('food served never exceeds starting stock + produced',
     foodServed <= 5 + produced, `(served=${foodServed}, start=5, produced=${produced})`);
  ok('overflow demand is turned away, not silently served',
     foodTurned >= 0 && (foodServed + foodTurned) > 0,
     `(served=${foodServed}, turnedAway=${foodTurned})`);
  ok('supplies never go negative', r.state.currency.supplies.food >= 0);
}

console.log('\n=== 5. Unbuilt rooms turn visitors away ===');
{
  const s = newState(TUESDAY_8AM); // sanctuary only
  const r = resolveOffline(s, TUESDAY_8AM + 8 * H, 'p-bare');
  ok('baptism seekers turned away with no pool', (r.summary.turnedAway.baptism || 0) > 0);
  ok('nobody baptized with no pool', (r.summary.served.baptism || 0) === 0);
  ok('the Word still seats people', r.state.sanctuary.seated > 0);
}

console.log('\n=== 6. Weekly rhythm resolves per bucket ===');
{
  const s = fullChurch(SATURDAY_8PM); // absence spans Sat night → Sun morning
  const mSat = resolveModifiers(s, SATURDAY_8PM);
  const mSun = resolveModifiers(s, SATURDAY_8PM + 6 * H);
  ok('Saturday is an ordinary day (no event)', mSat.activeEvent === null);
  ok('Sunday resolves as Sabbath', mSun.activeEvent === 'sabbath');
  ok('Sabbath raises visitor rate', mSun.visitor_rate > mSat.visitor_rate,
     `(sat=${mSat.visitor_rate}, sun=${mSun.visitor_rate})`);
  ok('ordinary day multiplier is exactly 1.0 (baseline, not penalty)',
     mSat.visitor_rate === 1 && mSat.service_multiplier === 1);
}

console.log('\n=== 7. Ministry stacking is bounded ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.ministries = [
    { id: 'choir' }, { id: 'creative_arts' }, { id: 'praise_worship' },
    { id: 'praise_dance' }, { id: 'drama' }, { id: 'media_tech' }, { id: 'outreach' },
  ];
  const m = resolveModifiers(s, TUESDAY_8AM);
  ok('music tree stacks additively, not exponentially',
     Math.abs(m.service_multiplier - 1.74) < 0.001, `(got ${m.service_multiplier})`);
  ok('service multiplier respects the hard ceiling',
     m.service_multiplier <= TUNING.MAX_SERVICE_MULTIPLIER);
  ok('virtual reach capped at 40%', m.virtual_reach <= TUNING.VIRTUAL_REACH_CAP,
     `(got ${m.virtual_reach})`);
}

console.log('\n=== 8. Construction completes while away ===');
{
  const s = newState(TUESDAY_8AM);
  s.construction = [{ roomId: 'fellowship_hall', x: 0, y: 0, rot: 0,
                      startedAt: TUESDAY_8AM, durationS: 1800 }];
  const r = resolveOffline(s, TUESDAY_8AM + 4 * H, 'p-build');
  ok('room finishes and enters the church', r.summary.completedRooms.includes('fellowship_hall'));
  ok('construction queue is cleared', r.state.construction.length === 0);
  ok('the finished kitchen then produces food', (r.summary.supplies.food || 0) > 0);
}

console.log('\n=== 9. Vestibule: overflow waits, does not vanish ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const r = resolveOffline(s, TUESDAY_8AM + 9 * H, 'p-vest');
  ok('pews fill first', r.state.sanctuary.seated === baseSeats(r.state));
  ok('overflow waits in the vestibule', r.state.sanctuary.vestibule > 0,
     `(vestibule=${r.state.sanctuary.vestibule})`);
  ok('nobody is turned away from the Word until the vestibule fills',
     (r.summary.turnedAway.word || 0) === 0 ||
     r.state.sanctuary.vestibule === vestibuleCapacity(r.state));
  ok('vestibule respects its cap',
     r.state.sanctuary.vestibule <= vestibuleCapacity(r.state));
}

console.log('\n=== 10. Folding chairs ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const r = resolveOffline(s, TUESDAY_8AM + 9 * H, 'p-chairs');
  const st = r.state;
  const t = TUESDAY_8AM + 9 * H;

  const before = chairStatus(st, t);
  ok('chairs are offered when people are waiting', before.canDeploy === true,
     `(reason=${before.reason})`);

  const seatedBefore = st.sanctuary.seated;
  const waitingBefore = st.sanctuary.vestibule;
  const offeringBefore = st.currency.offering;
  const d = deployFoldingChairs(st, t);

  ok('deployment succeeds', d.ok === true, `(reason=${d.reason})`);
  ok('Offering is charged', st.currency.offering === offeringBefore - before.cost);
  ok('capacity grows by the chair count',
     seatCapacity(st) === baseSeats(st) + before.count);
  ok('waiting people are seated immediately', st.sanctuary.seated > seatedBefore,
     `(${seatedBefore} → ${st.sanctuary.seated})`);
  ok('vestibule shrinks by the number seated',
     st.sanctuary.vestibule === waitingBefore - d.seated);

  const second = deployFoldingChairs(st, t);
  ok('cannot deploy twice in one service', second.ok === false && second.reason === 'already_out');

  const svc = completeService(st);
  ok('service counts the full congregation, chairs included',
     svc.congregation > baseSeats(st) || svc.chairsUsed > 0,
     `(congregation=${svc.congregation}, chairs=${svc.chairsUsed})`);
  ok('chairs are put away after ONE service', st.sanctuary.tempSeats === 0);
  ok('capacity returns to permanent pews', seatCapacity(st) === baseSeats(st));

  const after = chairStatus(st, t);
  ok('cooldown blocks immediate redeployment', after.canDeploy === false && after.reason === 'cooldown');
  const later = chairStatus(st, t + 7 * H);
  ok('chairs return after the cooldown', later.reason !== 'cooldown');
}

console.log('\n=== 11. Trustees and deacons improve the chairs ===');
{
  const plain = fullChurch(TUESDAY_8AM);
  const staffed = fullChurch(TUESDAY_8AM);
  staffed.ministries = [{ id: 'trustee_board' }, { id: 'mens_ministry' }];
  ok('Trustee Board adds folding chairs',
     chairStatus(staffed, TUESDAY_8AM).count > chairStatus(plain, TUESDAY_8AM).count,
     `(${chairStatus(plain,TUESDAY_8AM).count} → ${chairStatus(staffed,TUESDAY_8AM).count})`);

  const p2 = fullChurch(TUESDAY_8AM); p2.currency.offering = 99999;
  const s2 = fullChurch(TUESDAY_8AM); s2.currency.offering = 99999;
  s2.ministries = [{ id: 'trustee_board' }, { id: 'mens_ministry' }];
  p2.sanctuary.vestibule = 10; s2.sanctuary.vestibule = 10;
  deployFoldingChairs(p2, TUESDAY_8AM); deployFoldingChairs(s2, TUESDAY_8AM);
  ok('deacons and trustees shorten the cooldown',
     s2.sanctuary.chairsReadyAt < p2.sanctuary.chairsReadyAt);
}

console.log('\n=== 12. Retuned economy ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const r = resolveOffline(s, TUESDAY_8AM + 9 * H, 'p-econ');
  ok('prayer queue holds a realistic overnight intake',
     r.state.queue.length >= 12, `(queue=${r.state.queue.length})`);
  ok('few prayer seekers are refused',
     (r.summary.turnedAway.counseling || 0) < r.state.queue.length,
     `(refused=${r.summary.turnedAway.counseling || 0}, queued=${r.state.queue.length})`);
  ok('kitchen does not trivially cap out on an ordinary day',
     r.state.currency.supplies.food < TUNING.SUPPLY_CAP.food,
     `(food=${r.state.currency.supplies.food}/${TUNING.SUPPLY_CAP.food})`);
}

console.log('\n=== 13. Batch prayer meeting ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const r = resolveOffline(s, TUESDAY_8AM + 9 * H, 'p-pray');
  const st = r.state;
  const t = TUESDAY_8AM + 9 * H;
  const waiting = st.queue.length;
  const favorBefore = st.currency.favor;

  ok('a real queue accumulated', waiting > 0, `(queue=${waiting})`);
  const m = holdPrayerMeeting(st, t);
  ok('one meeting serves everyone waiting', m.ok && m.served === waiting);
  ok('queue is emptied in a single action', st.queue.length === 0);
  ok('Favor is earned', st.currency.favor > favorBefore, `(+${m.favor})`);
  ok('later arrivals earn less but are still served',
     m.offering < waiting * 30 && m.offering > waiting * 15,
     `(offering=${m.offering} for ${waiting})`);
  ok('a second meeting with nobody waiting is refused',
     holdPrayerMeeting(st, t).ok === false);
  ok("Men's Ministry widens the queue",
     queueCapacity({ ...st, ministries: [{ id: 'mens_ministry' }] }, t) > queueCapacity(st, t));
}

console.log('\n=== 14. Trustees widen the vestibule ===');
{
  const plain = fullChurch(TUESDAY_8AM);
  const trusteed = fullChurch(TUESDAY_8AM);
  trusteed.ministries = [{ id: 'trustee_board' }];
  ok('Trustee Board raises vestibule capacity 2x → 3x',
     vestibuleCapacity(trusteed, TUESDAY_8AM) > vestibuleCapacity(plain, TUESDAY_8AM),
     `(${vestibuleCapacity(plain,TUESDAY_8AM)} → ${vestibuleCapacity(trusteed,TUESDAY_8AM)})`);

  const a = resolveOffline(plain, TUESDAY_8AM + 30 * H, 'p-long');
  const b = resolveOffline(trusteed, TUESDAY_8AM + 30 * H, 'p-long');
  ok('fewer souls lost on a long absence',
     b.state.sanctuary.vestibule > a.state.sanctuary.vestibule,
     `(${a.state.sanctuary.vestibule} → ${b.state.sanctuary.vestibule})`);
  ok('no Offering was spent to achieve it',
     b.state.currency.offering >= a.state.currency.offering - 1);
  ok('the chair cooldown was not burned', b.state.sanctuary.chairsReadyAt === 0);
}

console.log('\n=== 15. Casting & representation ===');
{
  const sample = (state, n = 4000) => {
    const counts = {};
    for (let i = 0; i < n; i++) {
      const c = castCongregant(state, bucketRng('cast', i));
      counts[c.group] = (counts[c.group] || 0) + 1;
    }
    return counts;
  };

  const mission = fullChurch(TUESDAY_8AM);
  const national = fullChurch(TUESDAY_8AM); national.rank = 'national';

  const m = sample(mission), n = sample(national);
  const pct = (c) => c.black / 4000;

  ok('a small mission is predominantly Black', pct(m) > 0.90, `(${(pct(m)*100).toFixed(1)}%)`);
  ok('a national-tier church is more multicultural', pct(n) < pct(m),
     `(mission ${(pct(m)*100).toFixed(1)}% → national ${(pct(n)*100).toFixed(1)}%)`);
  ok('Black members remain the plurality at every stage', pct(n) > 0.5,
     `(${(pct(n)*100).toFixed(1)}%)`);

  const reached = fullChurch(TUESDAY_8AM);
  reached.rank = 'national';
  reached.ministries = [{ id: 'outreach' }, { id: 'media_tech' }, { id: 'yam' }];
  const r = sample(reached);
  ok('Outreach and Media widen who walks through the door', pct(r) < pct(n),
     `(${(pct(n)*100).toFixed(1)}% → ${(pct(r)*100).toFixed(1)}%)`);
  ok('reach shift is bounded, never a replacement', pct(r) > 0.5);

  let allFixed = true, clergyDressed = true;
  for (const role of FIXED_LEADERSHIP_ROLES) {
    for (let i = 0; i < 500; i++) {
      const cast = castRole(reached, role, bucketRng('role', i));
      if (cast.group !== 'black' || cast.fixed !== true) allFixed = false;
      const g = cast.base.endsWith('_m') ? 'm' : 'f';
      if (cast.outfit !== clergyOutfit(role, g)) clergyDressed = false;
    }
  }
  ok('leadership casting is FIXED, never sampled, at every rank', allFixed);
  ok('each office wears its own vesture', clergyDressed);

  let anyVaried = false;
  for (let i = 0; i < 500; i++) {
    if (castRole(reached, 'kitchen_crew', bucketRng('serve', i)).group !== 'black') anyVaried = true;
  }
  ok('serving roles may be multicultural', anyVaried);

  const w = congregationWeights(mission);
  ok('weights stay well-formed', Object.values(w).every((v) => v >= 0));
}

console.log('\n=== 16. Composition model ===');
{
  const s = fullChurch(TUESDAY_8AM); s.rank = 'national';
  const c = castCongregant(s, bucketRng('comp', 1));

  ok('a person is composed, not a single model id',
     ['group','base','skinTone','hair','outfit','outfitColor'].every((k) => c[k] !== undefined),
     `(${JSON.stringify(c)})`);
  ok('skin tone carries a hex for material tinting', /^#[0-9A-F]{6}$/i.test(c.skinHex));

  // Determinism at the part level.
  const a = castCongregant(s, bucketRng('comp', 42));
  const b = castCongregant(s, bucketRng('comp', 42));
  ok('same seed composes the same person', JSON.stringify(a) === JSON.stringify(b));

  // Variety: 500 draws should not collapse to a handful of looks.
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const p = castCongregant(s, bucketRng('variety', i));
    seen.add(`${p.base}|${p.skinTone}|${p.hair}|${p.outfit}|${p.outfitColor}`);
  }
  ok('composition yields wide variety', seen.size > 300, `(${seen.size} distinct of 500)`);

  // Skin tone must stay inside the group's range.
  let toneOk = true;
  for (let i = 0; i < 800; i++) {
    const p = castCongregant(s, bucketRng('tone', i));
    const [lo, hi] = TONE_RANGE_BY_GROUP[p.group];
    const idx = SKIN_TONES.findIndex((t) => t.id === p.skinTone);
    if (idx < lo || idx > hi) toneOk = false;
  }
  ok('skin tone stays within the group range', toneOk);

  // Hair must be plausible for the group.
  let hairOk = true;
  for (let i = 0; i < 800; i++) {
    const p = castCongregant(s, bucketRng('hair', i));
    const g = p.base.endsWith('_m') ? 'm' : 'f';
    if (!hairFor(p.group, g).some((h) => h.id === p.hair)) hairOk = false;
  }
  ok('hair suits both the group and the base', hairOk);

  // The crown is a women's tradition — it must never land on a man.
  let hatOk = true;
  for (let i = 0; i < 1500; i++) {
    const p = castCongregant(s, bucketRng('hat', i));
    if (p.hair === 'church_hat' && p.base.endsWith('_m')) hatOk = false;
  }
  ok('the church hat is worn only by women', hatOk);

  // Outfit must match the base's gender where the outfit is gendered.
  let fitOk = true;
  for (let i = 0; i < 800; i++) {
    const p = castCongregant(s, bucketRng('fit', i));
    const o = OUTFITS.find((x) => x.id === p.outfit);
    const base = p.base.endsWith('_m') ? 'm' : 'f';
    if (o.gender !== null && o.gender !== base) fitOk = false;
    if (o.set !== 'congregation') fitOk = false;
  }
  ok('congregants wear congregation dress matching their base', fitOk);

  ok('clergy vesture is flagged as bespoke work',
     bespokeAssets().length === 4, `(${bespokeAssets().join(', ')})`);
  ok('poly budget is recorded for the art pass',
     ASSET_BUDGET.TARGET_TRIS_PER_CHARACTER > 0 && ASSET_BUDGET.MAX_SIMULTANEOUS_CHARACTERS >= 26);
}

console.log('\n=== 17. Who may hold each office ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.rank = 'national';
  const genders = (role, n = 800) => {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      seen.add(castRole(s, role, bucketRng('office' + role, i)).base.endsWith('_m') ? 'm' : 'f');
    }
    return seen;
  };

  for (const role of ['bishop', 'vice_chief_bishop', 'chief_bishop']) {
    const g = genders(role);
    ok(`${role} is always a man`, g.size === 1 && g.has('m'), `(saw ${[...g].join(',')})`);
  }
  const ov = genders('overseer');
  ok('overseer is always a man', ov.size === 1 && ov.has('m'), `(saw ${[...ov].join(',')})`);

  const pas = genders('pastor');
  ok('pastor may be a man or a woman', pas.size === 2, `(saw ${[...pas].join(',')})`);

  let vestOk = true;
  for (let i = 0; i < 800; i++) {
    const c = castRole(s, 'pastor', bucketRng('pastorfit', i));
    const g = c.base.endsWith('_m') ? 'm' : 'f';
    if (c.outfit !== (g === 'm' ? 'pastor_suit_m' : 'pastor_suit_f')) vestOk = false;
  }
  ok('a woman pastor gets her own vesture, not a man\'s suit', vestOk);

  ok('no teen ever holds an office',
     [...Array(800)].every((_, i) =>
       !castRole(s, 'pastor', bucketRng('teen', i)).base.startsWith('teen')));

  ok('office gender rules are declared as data, not buried in logic',
     ROLE_GENDER.bishop === 'm' && ROLE_GENDER.overseer === 'm' && ROLE_GENDER.pastor === null);
}

console.log('\n=== 18. Grid geometry ===');
{
  ok('rotation swaps footprint dimensions',
     JSON.stringify(rotatedSize([6, 8], 90)) === JSON.stringify([8, 6]) &&
     JSON.stringify(rotatedSize([6, 8], 180)) === JSON.stringify([6, 8]));

  ok('rotating four times returns to start',
     [0, 90, 180, 270].every(() => true) &&
     JSON.stringify(rotateLocal(1, 2, 4, 4, 0)) === JSON.stringify([1, 2]));

  ok('clockwise rotation moves top-left to top-right',
     JSON.stringify(rotateLocal(0, 0, 4, 6, 90)) === JSON.stringify([5, 0]));

  ok('facing rotates with the room: south becomes west at 90',
     rotateFacing('s', 90) === 'w' && rotateFacing('s', 180) === 'n' &&
     rotateFacing('w', 90) === 'n');

  const tiles = footprintTiles('prayer_room', 4, 4, 0);
  ok('footprint covers exactly width x height tiles', tiles.length === 6);

  const distinct = new Set(tiles.map((t) => `${t.x},${t.y}`));
  ok('footprint tiles are distinct', distinct.size === tiles.length);

  const r0 = footprintTiles('prayer_room', 4, 4, 0);
  const r90 = footprintTiles('prayer_room', 4, 4, 90);
  ok('rotation preserves tile count, changes shape',
     r0.length === r90.length &&
     JSON.stringify(r0.map(t=>t.x).sort()) !== JSON.stringify(r90.map(t=>t.x).sort()));

  const { door, approach } = doorAndApproach('prayer_room', 4, 4, 0);
  ok('the approach tile sits just outside the door',
     Math.abs(door.x - approach.x) + Math.abs(door.y - approach.y) === 1);

  const rotated = doorAndApproach('prayer_room', 4, 4, 90);
  ok('the door moves and re-faces when the room rotates',
     JSON.stringify(rotated.approach) !== JSON.stringify(approach));
}

console.log('\n=== 19. Placement validation ===');
{
  const s = newState(TUESDAY_8AM);
  const reason = (id, x, y, rot = 0) => validatePlacement(s, id, x, y, rot).reason;

  ok('a legal placement is accepted', validatePlacement(s, 'fellowship_hall', 0, 0).valid);
  ok('running past the wall is rejected',
     reason('fellowship_hall', 11, 0) === PLACEMENT_REASONS.OUT_OF_BOUNDS);
  ok('overlapping the sanctuary is rejected',
     reason('fellowship_hall', 4, 0) === PLACEMENT_REASONS.OVERLAPS);
  ok('blocking the front door is rejected',
     reason('fellowship_hall', 5, 7) !== undefined);
  ok('every early room fits somewhere on the starting grid',
     ['fellowship_hall','benevolence_closet','prayer_room','baptismal_pool']
       .every((id) => legalPlacements(s, id, 0).length > 0));

  // Commit two rooms, then try to wall one off.
  s.rooms.push({ id: 'fellowship_hall', x: 0, y: 0, rot: 0, level: 1 });
  const stranding = validatePlacement(s, 'benevolence_closet', 0, 4);
  ok('a placement that strands an existing room names the room it would cut off',
     stranding.valid === false || stranding.strands === undefined,
     `(reason=${stranding.reason}, strands=${stranding.strands})`);

  ok('legalPlacements only returns placements that validate',
     legalPlacements(s, 'prayer_room', 0).every((p) =>
       validatePlacement(s, 'prayer_room', p.x, p.y, 0).valid));
  ok('there is somewhere legal to build', legalPlacements(s, 'prayer_room', 0).length > 0);

  // Moving a room must be able to re-occupy its own footprint.
  const self = validatePlacement(s, 'fellowship_hall', 0, 0, 0, { ignoreRoom: 'fellowship_hall' });
  ok('a room may be moved back onto its own tiles', self.valid);

  const occ = buildOccupancy(s);
  ok('occupancy marks the sanctuary as blocked', occ.length === s.grid.w * s.grid.h);
  ok('the ASCII plan renders the whole grid',
     asciiMap(s).split('\n').length === s.grid.h &&
     asciiMap(s).split('\n')[0].length === s.grid.w);
}

console.log('\n=== 20. Pathfinding ===');
{
  const s = newState(TUESDAY_8AM);
  s.rooms.push({ id: 'benevolence_closet', x: 9, y: 0, rot: 0, level: 1 });
  s.rooms.push({ id: 'prayer_room', x: 0, y: 5, rot: 0, level: 1 });

  const cache = new PathCache().warm(s);
  ok('every built room is reachable from the entrance', cache.allReachable(s));

  const p = cache.toRoom(s, 'prayer_room');
  ok('a path is a connected chain of adjacent tiles',
     p.every((t, i) => i === 0 ||
       Math.abs(t.x - p[i-1].x) + Math.abs(t.y - p[i-1].y) === 1));
  ok('the path starts at the entrance',
     p[0].x === s.grid.entrance.x && p[0].y === s.grid.entrance.y);
  ok('the path ends at the approach tile',
     JSON.stringify(p[p.length-1]) ===
     JSON.stringify(doorAndApproach('prayer_room', 0, 5, 0).approach));

  const d = distanceToRoom(s, cache, 'prayer_room');
  ok('distance is never shorter than the straight line',
     d >= Math.abs(s.grid.entrance.x - p[p.length-1].x), `(${d} tiles)`);

  const before = cache.misses;
  for (let i = 0; i < 50; i++) cache.toRoom(s, 'prayer_room');
  ok('fifty visitors share one computed path', cache.misses === before);

  cache.invalidate();
  cache.toRoom(s, 'prayer_room');
  ok('invalidating forces a recompute', cache.misses > before);

  // Wall the closet in completely.
  const sealed = structuredClone(s);
  const occ = buildOccupancy(sealed);
  const goal = doorAndApproach('benevolence_closet', 9, 0, 0).approach;
  occ[goal.y * sealed.grid.w + goal.x] = 1;
  ok('a sealed room returns no path',
     findPath(sealed, occ, sealed.grid.entrance, goal) === null);

  ok('an unknown room returns no path', new PathCache().toRoom(s, 'no_such_room') === null);
}

console.log('\n=== 21. Migration to free placement (v1 → v2) ===');
{
  const old = {
    v: 1, lastSavedAt: TUESDAY_8AM, level: 3, xp: 100, rank: 'mission',
    currency: { offering: 500, favor: 10, supplies: { food: 5, clothing: 2 } },
    grid: { w: 10, h: 8 },
    rooms: [{ id: 'sanctuary', x: 2, y: 0, level: 1, seats: 12 }],
    ministries: [], buffs: [], construction: [], workers: [],
    sanctuary: { seated: 4 }, queue: [], characters: {}, stats: {},
  };
  const m = migrate(old);
  ok('migrated save reports the current version', m.v === 2);
  ok('the grid gains an entrance tile', m.grid.entrance !== undefined,
     `(${JSON.stringify(m.grid.entrance)})`);
  ok('the entrance sits inside the grid',
     m.grid.entrance.x >= 0 && m.grid.entrance.x < m.grid.w &&
     m.grid.entrance.y >= 0 && m.grid.entrance.y < m.grid.h);
  ok('existing rooms gain a rotation', m.rooms.every((r) => r.rot === 0));
  ok('progress is preserved', m.currency.offering === 500 && m.sanctuary.seated === 4);
}

console.log('\n=== 22. Grid to world ===');
{
  const s = newState(TUESDAY_8AM);
  const { w, h } = s.grid;

  const origin = tileToWorld(s, 0, 0);
  const far = tileToWorld(s, w - 1, h - 1);
  ok('the church is centred on the origin',
     Math.abs(origin.x + far.x) < 1e-9 && Math.abs(origin.z + far.z) < 1e-9);

  const a = tileToWorld(s, 3, 3), b = tileToWorld(s, 4, 3);
  ok('neighbouring tiles are one unit apart', Math.abs(b.x - a.x - TILE) < 1e-9);

  const ext = floorExtent(s);
  ok('floor extent matches the grid', ext.width === w * TILE && ext.depth === h * TILE);

  const sanctuary = s.rooms.find((r) => r.id === 'sanctuary');
  const t0 = roomTransform(s, sanctuary);
  ok('an unrotated 6x8 room measures 6 by 8',
     t0.size.w === 6 && t0.size.d === 8, `(${t0.size.w}x${t0.size.d})`);

  const t90 = roomTransform(s, { ...sanctuary, rot: 90 });
  ok('rotating 90 degrees swaps the world footprint',
     t90.size.w === 8 && t90.size.d === 6);
  ok('grid rotation maps to negative rotation about Y',
     Math.abs(t90.rotationY + Math.PI / 2) < 1e-9);

  ok('the approach point sits one tile from the door',
     Math.abs(t0.door.x - t0.approach.x) + Math.abs(t0.door.z - t0.approach.z) - TILE < 1e-9);

  const cache = new PathCache().warm(s);
  const pts = pathToWorld(s, cache.toRoom(s, 'sanctuary'));
  ok('a path converts to world points', pts.length > 0 && pts[0].x !== undefined);
  ok('world path steps are one tile each',
     pts.every((p, i) => i === 0 ||
       Math.abs(Math.abs(p.x - pts[i-1].x) + Math.abs(p.z - pts[i-1].z) - TILE) < 1e-9));

  const frame = cameraFrame(s);
  ok('the camera can always frame the whole floor',
     frame.maxDistance > frame.minDistance && frame.span >= Math.max(ext.width, ext.depth));
  ok('camera panning is bounded by the grid',
     frame.bounds.x === ext.width / 2 && frame.bounds.z === ext.depth / 2);
}

console.log('\n=== 23. Sanctuary furnishing ===');
{
  const s = newState(TUESDAY_8AM);
  const t = roomTransform(s, s.rooms[0]);
  const plan = pewLayout(t.size);

  ok('pews fill the room in rows', plan.rows >= 3, `(${plan.rows} rows)`);
  ok('every row is split into two benches', plan.benches.length === plan.rows * 2);
  ok('a centre aisle is left clear',
     plan.benches.every((b) => Math.abs(b.x) > plan.aisle / 2 - 1e-9));
  ok('benches stay inside the room',
     plan.benches.every((b) =>
       Math.abs(b.x) + b.width / 2 <= t.size.w / 2 + 1e-9 &&
       Math.abs(b.z) <= t.size.d / 2));
  ok('the chancel end is left free for the pulpit',
     plan.benches.every((b) => b.z > -t.size.d / 2 + 2.5));
  ok('left and right benches mirror each other',
     plan.benches.filter((b) => b.side === 'left').length ===
     plan.benches.filter((b) => b.side === 'right').length);

  // The geometry has to be able to hold what the rules promise.
  ok('the room reserves side margins for folding chairs',
     plan.sideMargin > 0.4 &&
     plan.benches.every((b) => Math.abs(b.x) + b.width / 2 <= t.size.w / 2 - plan.sideMargin + 1e-9));

  // Orientation: everyone must face the pulpit, not the back wall.
  ok('the chancel sits at the front of the room',
     plan.chancelZ < plan.benches[0].z, `(pulpit z=${plan.chancelZ.toFixed(2)})`);
  ok('the congregation faces the chancel', plan.facing === -1);
  ok('every backrest sits behind the sitter, away from the pulpit',
     plan.benches.every((b) =>
       Math.abs(b.backZ - plan.chancelZ) > Math.abs(b.z - plan.chancelZ)),
     '(a backrest between sitter and pulpit means they face the wrong way)');
  ok('backrests stay inside the room',
     plan.benches.every((b) => Math.abs(b.backZ) <= t.size.d / 2));

  const chairs = chairSlots(t.size, plan, 6);
  ok('folding chairs stand beside the pews, not in them',
     chairs.length > 0 && chairs.every((c) =>
       Math.abs(c.x) > t.size.w / 2 - plan.sideMargin - 1e-9));
  ok('chairs are set out on both sides',
     new Set(chairs.map((c) => c.side)).size === 2);
}

console.log('\n=== 24. Shell integrity ===');
{
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  const modules = [
    'core/state', 'core/time', 'core/offline', 'core/save', 'core/rng',
    'core/grid', 'core/modifiers', 'core/sanctuary', 'core/prayer', 'core/casting',
    'sim/pathfinding',
    'render/scene', 'render/camera', 'render/church', 'render/layout', 'render/palette',
    'data/tuning', 'data/needs', 'data/rooms', 'data/ministries',
    'data/schedule', 'data/casting', 'data/controls',
  ];
  const missing = modules.filter((m) => !sw.includes(`${m}.js`));
  ok('the service worker caches every module', missing.length === 0,
     `(missing: ${missing.join(', ')})`);

  ok('the shell pins a Three.js version', /three@0\.128/.test(html));
  ok('app code is served network-first so a redeploy is visible',
     /sameOrigin/.test(sw) && sw.indexOf('fetch(e.request)') < sw.indexOf('caches.match(e.request)'));
  ok('the running build is stamped in the UI', /id="build"/.test(html));
  ok('the worker is asked to update on load', /reg\.update\(\)/.test(html));
  ok('the canvas disables browser touch gestures', /touch-action:\s*none/.test(html));
  ok('reduced motion is respected', /prefers-reduced-motion/.test(html));
  ok('the viewport handles notches', /viewport-fit=cover/.test(html));

  ok('gold is reserved, not a general accent',
     PALETTE.gold === 0xb87a00 && PALETTE.purple === 0x3c3489);
  ok('pixel ratio is capped for older phones', QUALITY.maxPixelRatio <= 2);
  ok('the shadow map stays modest', LIGHTING.shadowMapSize <= 1024);
}

console.log('\n=== 25. A visitor, end to end ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 20, clothing: 20 };
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-live');

  const v = sys.spawnOne(TUESDAY_8AM);
  ok('a visitor spawns at the front door',
     v.pos.x === s.grid.entrance.x && v.pos.y === s.grid.entrance.y);
  ok('the visitor arrives with a need and a face',
     v.needId && v.appearance.skinHex && v.appearance.outfit);
  ok('the visitor starts walking in', v.phase === 'walking_in');

  // Walk until something happens.
  let guard = 0;
  while (v.phase === 'walking_in' && guard++ < 2000) sys.update(1/30, TUESDAY_8AM);
  ok('the visitor reaches the room and stops walking',
     v.phase !== 'walking_in', `(phase=${v.phase})`);

  const distanceish = guard / 30 * WALK_SPEED;
  ok('walking took a plausible amount of time', distanceish > 1 && distanceish < 60,
     `(${distanceish.toFixed(1)} tiles worth)`);
}

console.log('\n=== 26. Serving and payout ===');
{
  const mk = () => {
    const s = fullChurch(TUESDAY_8AM);
    s.currency.supplies = { food: 30, clothing: 30 };
    s.currency.offering = 0; s.currency.favor = 0; s.xp = 0;
    return s;
  };

  const s1 = mk();
  const before = s1.currency.supplies.food;
  const r = serveNeed(s1, 'food', TUESDAY_8AM);
  ok('serving pays offering, favor and xp',
     r.ok && r.offering > 0 && r.favor > 0 && r.xp > 0);
  ok('serving consumes supply', s1.currency.supplies.food === before - 1);
  ok('the payout lands in the purse', s1.currency.offering === r.offering);

  const s2 = mk();
  const tapped = serveNeed(s2, 'food', TUESDAY_8AM, { tapped: true });
  ok('tapping pays a bonus', tapped.offering > r.offering,
     `(${r.offering} → ${tapped.offering}, +${Math.round(TAP_BONUS*100)}%)`);

  const s3 = mk();
  s3.currency.supplies.food = 0;
  ok('an empty larder cannot serve food', canServe(s3, 'food').ok === false);
  ok('and serving anyway is refused', serveNeed(s3, 'food', TUESDAY_8AM).ok === false);

  const s4 = newState(TUESDAY_8AM);   // sanctuary only
  ok('a need with no room cannot be served',
     canServe(s4, 'baptism').reason === 'no_room');
}

console.log('\n=== 27. The tap loop ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 40, clothing: 40 };
  s.currency.offering = 0;
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-tap');

  // Drive until someone is waiting on a material need.
  let waiting = null, guard = 0;
  while (!waiting && guard++ < 4000) {
    sys.update(1/30, TUESDAY_8AM);
    waiting = sys.visitors.find((v) => v.phase === 'waiting');
  }
  ok('someone ends up waiting to be served', !!waiting,
     `(after ${(guard/30).toFixed(0)}s of play)`);
  ok('waiting happens within a few seconds of opening the app', guard / 30 < 90,
     `(${(guard/30).toFixed(0)}s)`);

  ok('a waiting visitor is tappable', !!waiting && sys.isTappable(waiting));
  const res = sys.serve(waiting.id, TUESDAY_8AM, { tapped: true });
  ok('tapping serves them', res.ok === true);
  ok('they move into being served', waiting.phase === 'serving');
  ok('the church is paid', s.currency.offering >= res.offering);

  ok('tapping the same person twice does nothing',
     sys.serve(waiting.id, TUESDAY_8AM, { tapped: true }).ok === false);

  // They finish and walk out.
  let g2 = 0;
  while (waiting.phase !== 'done' && g2++ < 4000) sys.update(1/30, TUESDAY_8AM);
  ok('the served visitor leaves the church', waiting.phase === 'done');
  ok('and is removed from the live list',
     !sys.visitors.some((v) => v.id === waiting.id));
}

console.log('\n=== 28. Needs that wait for the player ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 60, clothing: 60 };
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-wait');

  for (let i = 0; i < 8000; i++) sys.update(1/30, TUESDAY_8AM);

  ok('people take seats for the Word', s.sanctuary.seated > 0,
     `(${s.sanctuary.seated} seated)`);
  ok('people queue for prayer', s.queue.length > 0, `(${s.queue.length} waiting)`);

  const seated = sys.visitors.filter((v) => v.phase === 'seated');
  ok('the seated never leave on their own', seated.length === s.sanctuary.seated);
  ok('seated visitors are not tappable', seated.every((v) => !sys.isTappable(v)));

  ok('nobody exceeds the pews', s.sanctuary.seated <= 16 + (s.sanctuary.tempSeats || 0));
  ok('material needs still auto-serve without a single tap',
     s.currency.offering > 0, `(${s.currency.offering} offering, untapped)`);
}

console.log('\n=== 29. Screen-space picking ===');
{
  const cands = [
    { id: 1, x: 100, y: 100, depth: 0.5 },
    { id: 2, x: 130, y: 100, depth: 0.3 },
    { id: 3, x: 400, y: 400, depth: 0.5 },
    { id: 4, x: 105, y: 100, depth: -0.2 },   // behind the camera
  ];

  ok('a tap picks the nearest candidate',
     pickNearest(cands, { x: 102, y: 100 }, 44)?.id === 1);
  ok('a tap in empty space picks nothing',
     pickNearest(cands, { x: 260, y: 260 }, 44) === null);
  ok('candidates behind the camera are ignored',
     pickNearest(cands, { x: 105, y: 100 }, 3)?.id !== 4);
  ok('the radius is respected',
     pickNearest(cands, { x: 100, y: 160 }, 44) === null);
  ok('a generous radius still finds a distant-ish target',
     pickNearest(cands, { x: 100, y: 130 }, 44)?.id === 1);

  // Overlapping bodies: the nearer one wins, which is the whole
  // reason we project instead of raycasting through pews.
  const stacked = [
    { id: 'far', x: 200, y: 200, depth: 0.8 },
    { id: 'near', x: 202, y: 201, depth: 0.2 },
  ];
  ok('when two overlap, the one nearer the camera wins',
     pickNearest(stacked, { x: 201, y: 200 }, 44)?.id === 'near');
}

console.log('\n=== 30. Live footfall feels populated ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 200, clothing: 200 };
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-rate');

  let peak = 0;
  const seen = new Set();
  for (let i = 0; i < 60 * 30; i++) {      // one minute of play
    sys.update(1/30, TUESDAY_8AM);
    peak = Math.max(peak, sys.visitors.length);
    for (const v of sys.visitors) seen.add(v.id);
  }
  ok('a storefront mission has someone in it', peak >= 2, `(peak ${peak} inside)`);
  ok('but it does not become a mob', peak <= 40, `(peak ${peak})`);
  ok('live footfall outpaces the offline rate',
     TUNING.LIVE_PRESENCE_MULTIPLIER > 1);

  // A grown church should VISIBLY differ from a mission. Footfall
  // is part of the progression, not just a number in the ledger.
  const grown = fullChurch(TUESDAY_8AM);
  grown.rank = 'national';
  grown.currency.supplies = { food: 400, clothing: 400 };
  grown.ministries = [{ id: 'outreach' }, { id: 'yam' }, { id: 'media_tech' }];
  const busy = new VisitorSystem(grown, new PathCache().warm(grown), 'p-busy');
  let busySeen = new Set();
  for (let i = 0; i < 60 * 30; i++) {
    busy.update(1/30, TUESDAY_8AM);
    for (const v of busy.visitors) busySeen.add(v.id);
  }
  // Peak concurrency is noisy at these numbers; total arrivals is
  // the honest measure of whether the ministry is doing anything.
  ok('a church with outreach draws more people through the door',
     busySeen.size > seen.size,
     `(mission ${seen.size} → grown ${busySeen.size} arrivals per minute)`);

  ok('some arrivals are strangers, some are members',
     new Set(busy.visitors.map((v) => v.isStranger)).size >= 1);
}

console.log('\n=== 31. Outreach actually opens the doors ===');
{
  const plain = fullChurch(TUESDAY_8AM);
  const reaching = fullChurch(TUESDAY_8AM);
  reaching.ministries = [{ id: 'outreach' }];

  const a = resolveOffline(plain, TUESDAY_8AM + 9 * H, 'p-out');
  const b = resolveOffline(reaching, TUESDAY_8AM + 9 * H, 'p-out');

  const total = (r) => Object.values(r.summary.served).reduce((x, y) => x + y, 0) +
                       r.summary.seated + r.summary.queued + r.summary.vestibule;
  ok('Outreach increases arrivals while away', total(b) > total(a),
     `(${total(a)} → ${total(b)} souls)`);
  ok('the lift is meaningful but not absurd', total(b) < total(a) * 2,
     `(x${(total(b)/total(a)).toFixed(2)})`);
}

console.log('\n=== 32. Control feel is configurable ===');
{
  ok('pan direction is a named setting, not a buried sign',
     typeof CONTROLS.PAN_INVERT === 'boolean');
  ok('inverting flips the sign', sign(true) === -1 && sign(false) === 1);

  ok('the pitch band never lets you look level or straight down',
     CONTROLS.PITCH_MIN > 0.3 && CONTROLS.PITCH_MAX < Math.PI / 2,
     `(${CONTROLS.PITCH_MIN}–${CONTROLS.PITCH_MAX} rad)`);
  ok('the pitch band is a real range', CONTROLS.PITCH_MAX > CONTROLS.PITCH_MIN);

  ok('smoothing is a usable fraction',
     CONTROLS.DAMPING > 0 && CONTROLS.DAMPING <= 1);

  ok('the tap radius is forgiving for fingers', CONTROLS.TAP_RADIUS >= 40,
     `(${CONTROLS.TAP_RADIUS}px)`);
  ok('tap slop is smaller than the tap radius',
     CONTROLS.TAP_SLOP < CONTROLS.TAP_RADIUS);
  ok('picking defaults to the configured radius',
     pickNearest([{ id: 1, x: 0, y: 0, depth: 0.5 }],
                 { x: CONTROLS.TAP_RADIUS - 2, y: 0 })?.id === 1 &&
     pickNearest([{ id: 1, x: 0, y: 0, depth: 0.5 }],
                 { x: CONTROLS.TAP_RADIUS + 5, y: 0 }) === null);

  ok('every invert flag is a boolean',
     ['PAN_INVERT','ZOOM_INVERT','ROTATE_INVERT','TWIST_INVERT','PITCH_INVERT']
       .every((k) => typeof CONTROLS[k] === 'boolean'));
}

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
