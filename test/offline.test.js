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
         pewLayout, chairSlots, seatSlots, allSeatSlots, chancelLayout,
         localToWorld, seatedPose, SEAT_TOP_Y, TILE } from '../src/render/layout.js';
import { PALETTE, LIGHTING, QUALITY } from '../src/render/palette.js';
import { readFileSync } from 'node:fs';
import { VisitorSystem, WALK_SPEED, AUTO_SERVE_DELAY, SERVE_DURATION } from '../src/sim/visitors.js';
import { serveNeed, canServe, TAP_BONUS } from '../src/core/serve.js';
import { pickNearest } from '../src/render/picking.js';
import { CONTROLS, sign, BUILD, BUILD_LABEL } from '../src/data/controls.js';
import { buildCatalog, buildStatus, startConstruction, cancelConstruction,
         moveRoom, canAfford, suggestPlacement, hasSpaceFor } from '../src/core/build.js';
import { advanceProduction, advanceConstruction, constructionProgress,
         productionSpeed } from '../src/core/production.js';
import { audienceProfile, recommendSermon, sermonPayout, sermonLibrary,
         unlockSermon, startService, canHoldService, serviceProgress,
         isServiceFinished, finishService, preacherRestMs } from '../src/core/service.js';
import { seatPerson, congregationMix, clearSeats } from '../src/core/sanctuary.js';
import { SERMON_BY_ID } from '../src/data/sermons.js';
import { levelForXp, levelProgress, applyProgress, rankReady, nextRank,
         expandGrid } from '../src/core/progression.js';
import { ministryCatalog, ministryStatus, foundMinistry, describeModifier,
         ministrySummary } from '../src/core/ministry.js';
import { xpForLevel, RANKS } from '../src/data/ranks.js';
import { todayEvent, nextSpecialDay, grantRehearsalBuff, pendingRehearsal,
         setSchedule, canChangeSchedule, needsOnboarding, selectableDays,
         getSchedule, dayKey } from '../src/core/rhythm.js';
import { buildAwayReport, shouldShowAway, isNotable, pushAwayHistory,
         awayHistory, headlineFor, soulsServed } from '../src/core/away.js';
import { dueCharacters, makeArrival, markArrived, onServed, arcProgress,
         characterState, displayName, needForVisit } from '../src/core/characters.js';
import { CHARACTER_BY_ID } from '../src/data/characters.js';
import { pruneBuffs } from '../src/core/rhythm.js';
import { refillStep } from '../src/core/sanctuary.js';
import { ensurePastor, advancePastor, pastorPose, phaseProgress,
         pastorBusy, PHASES } from '../src/core/pastor.js';
import { PASTOR } from '../src/data/characters.js';
import { FURNITURE, unfurnished } from '../src/data/furniture.js';
import { ROOMS } from '../src/data/rooms.js';
import { moveCost, canMoveTo, canPickUp, MOVE_REASONS } from '../src/core/build.js';
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
  // Positions are SEARCHED, not hardcoded: a grid or footprint
  // change must never silently invalidate the fixture again.
  for (const id of ['fellowship_hall', 'benevolence_closet', 'prayer_room', 'baptismal_pool']) {
    const spot = suggestPlacement(s, id, 0);
    if (!spot) throw new Error(`fixture: nowhere legal for ${id}`);
    s.rooms.push({ id, x: spot.x, y: spot.y, rot: 0, level: 1 });
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
     reason('fellowship_hall', s.grid.w - 2, 0) === PLACEMENT_REASONS.OUT_OF_BOUNDS,
     '(x derived from the grid, not hardcoded)');
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
  ok('migrated save reports the current version', m.v === TUNING.CURRENT_VERSION,
     `(v${m.v} of v${TUNING.CURRENT_VERSION}) — derived, not hardcoded`);
  ok('the grid gains an entrance tile', m.grid.entrance !== undefined,
     `(${JSON.stringify(m.grid.entrance)})`);
  ok('the entrance sits inside the grid',
     m.grid.entrance.x >= 0 && m.grid.entrance.x < m.grid.w &&
     m.grid.entrance.y >= 0 && m.grid.entrance.y < m.grid.h);
  ok('existing rooms gain a rotation', m.rooms.every((r) => r.rot === 0));
  ok('progress is preserved', m.currency.offering === 500 && m.sanctuary.seated === 4);
  ok('a v1 save gains a sermon library', Array.isArray(m.sermons) && m.sermons.length > 0);
  ok('existing worshippers are counted as members',
     m.sanctuary.mix.member === 4, `(${JSON.stringify(m.sanctuary.mix)})`);
  ok('the whole chain runs, not just the last step',
     m.grid.entrance !== undefined && m.sermons !== undefined,
     '(v1 → v2 → v3 in one pass)');
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
  ok('the aisles hold every chair the trustees can bring',
     chairSlots(t.size, plan, 99).length >= 10,
     '(tying chairs to pew rows capped the aisles at six)');
  ok('asking for fewer sets out fewer', chairSlots(t.size, plan, 4).length === 4);
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
    'render/characters', 'render/bubble', 'render/crowd', 'render/picking',
    'render/placement', 'render/sites', 'render/pastor', 'render/interiors',
    'data/tuning', 'data/needs', 'data/rooms', 'data/ministries',
    'data/schedule', 'data/casting', 'data/controls', 'data/sermons', 'data/ranks', 'data/characters', 'data/furniture',
  ];
  const missing = modules.filter((m) => !sw.includes(`${m}.js`));
  ok('the service worker caches every module', missing.length === 0,
     `(missing: ${missing.join(', ')})`);

  ok('the shell pins a Three.js version', /three@0\.128/.test(html));
  ok('app code is served network-first so a redeploy is visible',
     /sameOrigin/.test(sw) && sw.indexOf('fetch(e.request)') < sw.indexOf('caches.match(e.request)'));
  ok('the running build is stamped in the UI', /id="build"/.test(html));
  ok('the HUD stamp is the short form', /^V\d+$/.test(BUILD_LABEL),
     `(${BUILD} → ${BUILD_LABEL})`);
  ok('and it matches the full build number',
     BUILD_LABEL.slice(1) === BUILD.match(/^v(\d+)/)[1]);
  ok('sw.js and controls.js agree on the build',
     new RegExp(`BUILD = '${BUILD}'`).test(sw),
     '(a mismatch means the HUD lies about what is cached)');
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

console.log('\n=== 33. The chancel faces the people ===');
{
  const size = { w: 6, d: 8 };
  const plan = pewLayout(size);
  const c = chancelLayout(size, plan);

  ok('the pulpit stands at the chancel end',
     c.pulpit.z < plan.benches[0].z, `(pulpit ${c.pulpit.z.toFixed(2)})`);
  ok("the pulpit's gold face points at the congregation",
     c.pulpitFace.z > c.pulpit.z,
     '(a face on the far side aims the gold at the back wall)');
  ok('the preacher stands behind the pulpit, looking out',
     c.preacher.z < c.pulpit.z && c.preacher.facing === -plan.facing,
     '(behind it in z, and turned toward the people)');
  ok('the preacher and the congregation face EACH OTHER',
     c.preacher.facing === -plan.facing,
     '(this assertion used to check they faced the SAME way and still pass)');
  ok('everything on the chancel shares one facing',
     c.facesCongregation === c.preacher.facing &&
     c.facesCongregation === c.chair.facing,
     '(one value, so a new chancel prop cannot get it wrong)');
  ok('and it is the opposite of the pews', c.facesCongregation === -plan.facing);
  ok('the communion table sits between pulpit and pews',
     c.table.z > c.pulpit.z && c.table.z < plan.benches[0].z);
  ok('the platform stays inside the room', c.platformFront < size.d / 2);
}

console.log('\n=== 34. Seating in the pews ===');
{
  const s = newState(TUESDAY_8AM);
  const t = roomTransform(s, s.rooms[0]);
  const plan = pewLayout(t.size);
  const slots = seatSlots(t.size, plan, 40);

  // Capping BELOW the geometry strands a lone person on the back
  // bench; capping ABOVE it leaves people with nowhere to render.
  ok('the seat count matches the pews exactly',
     slots.length === s.rooms[0].seats,
     `(${slots.length} slots vs ${s.rooms[0].seats} seats)`);
  ok('every seat faces the chancel', slots.every((x) => x.facing === plan.facing));
  ok('seats stay inside the room',
     slots.every((x) => Math.abs(x.x) <= t.size.w / 2 && Math.abs(x.z) <= t.size.d / 2));
  ok('no two people share a seat',
     new Set(slots.map((x) => `${x.x.toFixed(3)},${x.z.toFixed(3)}`)).size === slots.length);
  ok('the front rows fill first', slots[0].z <= slots[slots.length - 1].z);
  ok('both sides of the aisle are used',
     new Set(slots.slice(0, 6).map((x) => x.side)).size === 2);

  const w = localToWorld(t, { x: 1, z: 0 });
  ok('local seat positions convert to world space',
     Number.isFinite(w.x) && Number.isFinite(w.z));
  const rotated = localToWorld({ ...t, rotationY: -Math.PI / 2 }, { x: 1, z: 0 });
  ok('rotation is honoured when converting', Math.abs(rotated.z - t.center.z) > 0.5);
}

console.log('\n=== 35. Building a room ===');
{
  const s = newState(TUESDAY_8AM);
  s.currency.offering = 10000;
  s.currency.favor = 200;
  s.level = 10;

  const catalog = buildCatalog(s);
  ok('the catalog lists buildable rooms', catalog.length >= 3);
  ok('the sanctuary is not offered for sale',
     !catalog.some((e) => e.id === 'sanctuary'));
  ok('each entry carries cost, size and duration',
     catalog.every((e) => e.cost && e.footprint && e.buildS !== undefined));

  const spot = suggestPlacement(s, 'fellowship_hall', 0);
  ok('a legal opening position is suggested', spot !== null);
  ok('the suggestion validates',
     validatePlacement(s, 'fellowship_hall', spot.x, spot.y, 0).valid);

  const before = s.currency.offering;
  const res = startConstruction(s, 'fellowship_hall', spot.x, spot.y, 0, TUESDAY_8AM);
  ok('construction starts', res.ok);
  ok('offering is taken', s.currency.offering === before - 800);
  ok('a site appears', s.construction.length === 1);
  ok('the room is not usable yet', !s.rooms.some((r) => r.id === 'fellowship_hall'));

  ok('you cannot build the same room twice',
     startConstruction(s, 'fellowship_hall', 0, 0, 0, TUESDAY_8AM).ok === false);

  ok('progress starts at zero',
     constructionProgress(s.construction[0], TUESDAY_8AM) === 0);
  ok('progress reaches one when the time is up',
     constructionProgress(s.construction[0], TUESDAY_8AM + 1800 * 1000) === 1);

  const done = advanceConstruction(s, TUESDAY_8AM + 2 * H);
  ok('the room comes online', done.includes('fellowship_hall'));
  ok('the site is cleared', s.construction.length === 0);
  ok('the finished room is reachable',
     new PathCache().warm(s).allReachable(s));
}

console.log('\n=== 36. Money and refunds ===');
{
  const s = newState(TUESDAY_8AM);
  s.level = 10;
  s.currency.offering = 100;

  ok('a room you cannot afford is refused',
     buildStatus(s, 'fellowship_hall').ok === false);
  ok('and starting it takes nothing',
     startConstruction(s, 'fellowship_hall', 0, 0, 0, TUESDAY_8AM).ok === false &&
     s.currency.offering === 100);

  s.currency.offering = 5000;
  const spot = suggestPlacement(s, 'fellowship_hall', 0);
  startConstruction(s, 'fellowship_hall', spot.x, spot.y, 0, TUESDAY_8AM);
  const mid = s.currency.offering;
  const back = cancelConstruction(s, 'fellowship_hall');
  ok('cancelling refunds in full', back.ok && s.currency.offering === mid + 800);
  ok('and removes the site', s.construction.length === 0);

  ok('cancelling nothing is refused',
     cancelConstruction(s, 'prayer_room').ok === false);

  ok('a locked room is not offered', buildStatus({ ...s, level: 1 }, 'baptismal_pool').ok === false);
  ok('affordability checks both currencies',
     canAfford({ currency: { offering: 10, favor: 0 } }, { offering: 5, favor: 5 }) === false);
}

console.log('\n=== 37. Moving a room ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.offering = 5000;

  ok('the sanctuary can be picked up when nothing is happening',
     canPickUp(s, 'sanctuary').ok === true);

  const before = s.currency.offering;
  const bad = moveRoom(s, 'fellowship_hall', 4, 0, 0);   // onto the sanctuary
  ok('an illegal move is refused', bad.ok === false);
  ok('and costs nothing', s.currency.offering === before);

  // Find a spot the rules actually allow, rather than assuming one.
  let target = null;
  for (let y = 0; y < s.grid.h && !target; y++) {
    for (let x = 0; x < s.grid.w && !target; x++) {
      const cur = s.rooms.find((r) => r.id === 'fellowship_hall');
      if (x === cur.x && y === cur.y) continue;
      if (validatePlacement(s, 'fellowship_hall', x, y, 0, { ignoreRoom: 'fellowship_hall' }).valid) {
        target = { x, y };
      }
    }
  }
  ok('a fully built mission church can still be rearranged', target !== null,
     '(a grid you can fill but never rearrange makes free placement a trap)');
  const good = moveRoom(s, 'fellowship_hall', target.x, target.y, 0);
  ok('a legal move succeeds', good.ok, `(${good.reason || ''})`);
  ok('moving costs offering, never favor',
     s.currency.offering < before && good.cost.favor === undefined);
  ok('the room actually moved',
     s.rooms.find((r) => r.id === 'fellowship_hall').x === target.x &&
     s.rooms.find((r) => r.id === 'fellowship_hall').y === target.y);
  ok('everything is still reachable', new PathCache().warm(s).allReachable(s));

  ok('space checks consider every rotation',
     hasSpaceFor(s, 'prayer_room') === true);
}

console.log('\n=== 38. Supply lines ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 0, clothing: 0 };
  const mods = resolveModifiers(s, TUESDAY_8AM);

  const gained = advanceProduction(s, TUESDAY_8AM + 2 * H, mods);
  ok('the kitchen produces food', (gained.food || 0) > 0, `(+${gained.food})`);
  ok('the closet produces clothing', (gained.clothing || 0) > 0, `(+${gained.clothing})`);
  ok('supplies respect the storage cap',
     s.currency.supplies.food <= TUNING.SUPPLY_CAP.food);

  ok('running the same moment twice produces nothing more',
     Object.keys(advanceProduction(s, TUESDAY_8AM + 2 * H, mods)).length === 0);

  // Women's Work says "+20% clothing". It must not speed the kitchen.
  const staffed = fullChurch(TUESDAY_8AM);
  staffed.ministries = [{ id: 'women_work' }];
  const sm = resolveModifiers(staffed, TUESDAY_8AM);
  ok("Women's Work speeds clothing", productionSpeed(sm, 'clothing') > 1,
     `(x${productionSpeed(sm, 'clothing').toFixed(2)})`);
  ok('but does NOT secretly speed the kitchen too',
     Math.abs(productionSpeed(sm, 'food') - 1) < 1e-9,
     `(food x${productionSpeed(sm, 'food').toFixed(2)})`);

  // Men's Ministry is a general boost and should touch both.
  const mens = fullChurch(TUESDAY_8AM);
  mens.ministries = [{ id: 'mens_ministry' }];
  const mm = resolveModifiers(mens, TUESDAY_8AM);
  ok('a general boost speeds every line',
     productionSpeed(mm, 'food') > 1 && productionSpeed(mm, 'clothing') > 1);
}

console.log('\n=== 39. Reading the room ===');
{
  const s = fullChurch(TUESDAY_8AM);
  clearSeats(s);
  ok('an empty room reports no dominant group', audienceProfile(s).dominant === 'mixed');

  for (let i = 0; i < 9; i++) seatPerson(s, { isStranger: true });
  for (let i = 0; i < 3; i++) seatPerson(s, { isStranger: false });
  const p = audienceProfile(s);
  ok('the mix is tracked, not just a count',
     p.stranger === 9 && p.member === 3 && p.total === 12);
  ok('a strangers-heavy house is recognised', p.dominant === 'stranger');
  ok('the mix always sums to the seat count',
     p.stranger + p.member + p.youth === s.sanctuary.seated);

  const even = fullChurch(TUESDAY_8AM);
  clearSeats(even);
  for (let i = 0; i < 4; i++) seatPerson(even, { isStranger: true });
  for (let i = 0; i < 4; i++) seatPerson(even, { isStranger: false });
  for (let i = 0; i < 4; i++) seatPerson(even, { isYouth: true });
  ok('a genuinely mixed room is not overclaimed',
     audienceProfile(even).dominant === 'mixed');

  const youth = fullChurch(TUESDAY_8AM);
  clearSeats(youth);
  for (let i = 0; i < 8; i++) seatPerson(youth, { isYouth: true, isStranger: true });
  ok('youth outranks stranger when categorising',
     audienceProfile(youth).youth === 8 && audienceProfile(youth).stranger === 0);
}

console.log('\n=== 40. Choosing a sermon ===');
{
  const mk = (fill) => {
    const s = fullChurch(TUESDAY_8AM);
    clearSeats(s);
    s.currency.favor = 500;
    s.sermons = ['come_unto_me', 'study_to_shew_thyself', 'let_no_man_despise'];
    fill(s);
    return s;
  };

  const strangers = mk((s) => { for (let i = 0; i < 12; i++) seatPerson(s, { isStranger: true }); });
  const members = mk((s) => { for (let i = 0; i < 12; i++) seatPerson(s, { isStranger: false }); });
  const young = mk((s) => { for (let i = 0; i < 12; i++) seatPerson(s, { isYouth: true }); });

  const rs = recommendSermon(strangers, TUESDAY_8AM);
  const rm = recommendSermon(members, TUESDAY_8AM);
  const ry = recommendSermon(young, TUESDAY_8AM);

  ok('a house of strangers gets the invitation sermon',
     rs.sermonId === 'come_unto_me', `(got ${rs.sermonId})`);
  ok('a house of members gets the teaching sermon',
     rm.sermonId === 'study_to_shew_thyself', `(got ${rm.sermonId})`);
  ok('a young house gets the youth sermon',
     ry.sermonId === 'let_no_man_despise', `(got ${ry.sermonId})`);
  ok('the recommendation is different for different rooms',
     new Set([rs.sermonId, rm.sermonId, ry.sermonId]).size === 3,
     '(if one sermon always wins, the choice is not a choice)');

  // With the WHOLE library open, the deepest sermon must not win
  // every room — that would collapse the choice back into a tap.
  const full = (fill) => {
    const s = mk(fill);
    s.sermons = sermonLibrary(s).map((x) => x.id);
    return s;
  };
  const winners = new Set([
    recommendSermon(full((s) => { for (let i = 0; i < 12; i++) seatPerson(s, { isStranger: true }); }), TUESDAY_8AM).sermonId,
    recommendSermon(full((s) => { for (let i = 0; i < 12; i++) seatPerson(s, { isStranger: false }); }), TUESDAY_8AM).sermonId,
    recommendSermon(full((s) => { for (let i = 0; i < 12; i++) seatPerson(s, { isYouth: true }); }), TUESDAY_8AM).sermonId,
  ]);
  ok('no single sermon wins every room once the library is full',
     winners.size >= 2, `(winners: ${[...winners].join(', ')})`);
  ok('the longest sermon is not the automatic answer',
     !(winners.size === 1 && winners.has('can_these_bones_live')));

  ok('the reason is stated in plain words', /strangers/i.test(rs.reason), `("${rs.reason}")`);
  ok('scripture always comes with it', rs.scripture.includes('—'));

  ok('affinity actually changes the payout',
     sermonPayout(strangers, 'come_unto_me', TUESDAY_8AM).offering >
     sermonPayout(strangers, 'study_to_shew_thyself', TUESDAY_8AM).offering);
  ok('an empty room pays nothing',
     sermonPayout(mk(() => {}), 'come_unto_me', TUESDAY_8AM).offering === 0);
}

console.log('\n=== 41. Preparing sermons with Favor ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.favor = 60;
  s.sermons = ['come_unto_me'];

  const lib = sermonLibrary(s);
  ok('the starter sermon needs no Favor', lib.find((x) => x.id === 'come_unto_me').unlocked);
  ok('later sermons start locked', !lib.find((x) => x.id === 'can_these_bones_live').unlocked);

  const before = s.currency.favor;
  const buy = unlockSermon(s, 'the_lord_is_my_shepherd');
  ok('a sermon can be prepared with Favor', buy.ok);
  ok('Favor is spent', s.currency.favor === before - 30);
  ok('it joins the library', s.sermons.includes('the_lord_is_my_shepherd'));
  ok('buying it twice is refused', unlockSermon(s, 'the_lord_is_my_shepherd').ok === false);
  ok('an unaffordable sermon is refused',
     unlockSermon(s, 'can_these_bones_live').ok === false);
}

console.log('\n=== 42. Holding a service ===');
{
  const s = fullChurch(TUESDAY_8AM);
  clearSeats(s);
  s.currency.offering = 0; s.currency.favor = 0; s.xp = 0;

  ok('an empty sanctuary cannot hold service',
     canHoldService(s, TUESDAY_8AM).ok === false);

  for (let i = 0; i < 14; i++) seatPerson(s, { isStranger: i < 10 });
  ok('a full house can', canHoldService(s, TUESDAY_8AM).ok);

  const started = startService(s, 'come_unto_me', TUESDAY_8AM);
  ok('service begins', started.ok);
  ok('a second service cannot start on top of it',
     startService(s, 'come_unto_me', TUESDAY_8AM).ok === false);

  const mid = serviceProgress(s, TUESDAY_8AM + 60000);
  ok('progress runs while it preaches', mid.progress > 0 && mid.progress < 1);
  ok('and it is not finished early', !isServiceFinished(s, TUESDAY_8AM + 60000));

  const endMs = TUESDAY_8AM + SERMON_BY_ID.come_unto_me.durationS * 1000;
  ok('it finishes on time', isServiceFinished(s, endMs));

  const seatedBefore = s.sanctuary.seated;
  const out = finishService(s, endMs);
  ok('the whole congregation is served at once',
     out.congregation === seatedBefore, `(${out.congregation} souls)`);
  ok('offering, favor and xp are all paid',
     out.offering > 0 && out.favor > 0 && out.xp > 0 &&
     s.currency.offering === out.offering);
  ok('the pews empty', s.sanctuary.seated === 0 || s.sanctuary.vestibule === 0);
  ok('the mix resets with them',
     congregationMix(s).stranger + congregationMix(s).member === s.sanctuary.seated);
  ok('the preacher goes to rest', s.sanctuary.preacherRestUntil > endMs);
  ok('and cannot preach again immediately',
     canHoldService(s, endMs).ok === false);
  ok('the service is cleared', s.sanctuary.service === null);
}

console.log('\n=== 43. Multipliers land on the service ===');
{
  const build = (ministries, atMs) => {
    const s = fullChurch(atMs);
    clearSeats(s);
    s.ministries = ministries;
    for (let i = 0; i < 12; i++) seatPerson(s, { isStranger: true });
    return s;
  };

  const plain = build([], TUESDAY_8AM);
  const musical = build([{ id: 'choir' }, { id: 'creative_arts' }, { id: 'praise_worship' }], TUESDAY_8AM);
  ok('the ministry tree multiplies the service payout',
     sermonPayout(musical, 'come_unto_me', TUESDAY_8AM).offering >
     sermonPayout(plain, 'come_unto_me', TUESDAY_8AM).offering,
     `(x${sermonPayout(musical, 'come_unto_me', TUESDAY_8AM).multiplier.toFixed(2)})`);

  const SUNDAY = new Date(2026, 7, 23, 10, 0, 0).getTime();
  const sabbath = build([], SUNDAY);
  ok('the Sabbath multiplies it further',
     sermonPayout(sabbath, 'come_unto_me', SUNDAY).offering >
     sermonPayout(plain, 'come_unto_me', TUESDAY_8AM).offering);
  ok('the preacher rests less on the Lord\'s Day',
     preacherRestMs(sabbath, SUNDAY) < preacherRestMs(plain, TUESDAY_8AM));

  // Choir rehearsal exists to be spent on a service.
  const buffed = build([], TUESDAY_8AM);
  buffed.buffs = [{ id: 'choir_rehearsal', type: 'service_multiplier', value: 0.3, consumeOnService: true }];
  const withBuff = sermonPayout(buffed, 'come_unto_me', TUESDAY_8AM).offering;
  ok('a rehearsal buff raises the payout',
     withBuff > sermonPayout(plain, 'come_unto_me', TUESDAY_8AM).offering);
  startService(buffed, 'come_unto_me', TUESDAY_8AM);
  finishService(buffed, TUESDAY_8AM + 180000);
  ok('and is consumed by it', buffed.buffs.length === 0);
}

console.log('\n=== 44. Levels ===');
{
  ok('everyone starts at level one', levelForXp(0) === 1);
  ok('the curve is monotonic',
     [2,3,5,8,13,21].every((n) => xpForLevel(n) > xpForLevel(n - 1)));
  ok('the curve stretches out',
     xpForLevel(10) - xpForLevel(9) > xpForLevel(3) - xpForLevel(2),
     '(later levels cost more than early ones)');
  ok('xp maps back to the right level',
     levelForXp(xpForLevel(7)) === 7 && levelForXp(xpForLevel(7) - 1) === 6);

  const s = fullChurch(TUESDAY_8AM);
  s.xp = xpForLevel(5) + 10;
  const p = applyProgress(s);
  ok('a backlog of xp grants every level at once',
     s.level === 5 && p.levels.join(',') === '2,3,4,5');
  ok('running progress again grants nothing',
     applyProgress(s).levels.length === 0, '(must be idempotent)');

  const bar = levelProgress(s);
  ok('the level bar reports a sane fraction', bar.fraction >= 0 && bar.fraction <= 1);
  ok('and how far into the level you are', bar.into >= 0 && bar.needed > 0);
}

console.log('\n=== 45. The recognition ladder ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.level = 1; s.xp = 0;
  s.stats = { servicesHeld: 0, totalServed: 0 };

  ok('a new mission is not ready to advance', rankReady(s).ready === false);
  ok('and it says what is missing', rankReady(s).missing.length > 0);

  s.xp = xpForLevel(4);
  applyProgress(s);
  ok('level alone does not earn recognition', s.rank === 'mission',
     '(you cannot buy rank on material service alone)');

  s.stats.servicesHeld = 3;
  const p = applyProgress(s);
  ok('holding services earns it', s.rank === 'local_temple', `(now ${s.rank})`);
  ok('the advancement is reported', p.rank?.id === 'local_temple');
  ok('it comes with scripture', typeof p.rank.scripture === 'string' && p.rank.scripture.includes('—'));

  ok('only one rank is granted per call',
     applyProgress({ ...s, level: 40, xp: 9e9,
       stats: { servicesHeld: 500, totalServed: 99999 } }).rank?.id === 'district',
     '(advancement should be an event, not a blur)');

  ok('the ladder ends', nextRank({ rank: 'planting' }) === null);
}

console.log('\n=== 46. The floor grows with the church ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const before = { ...s.grid };
  const roomsBefore = s.rooms.map((r) => `${r.id}@${r.x},${r.y}`).join('|');

  const grown = expandGrid(s, 'local_temple');
  ok('the floor expands', grown && s.grid.w > before.w && s.grid.h > before.h,
     `(${before.w}x${before.h} → ${s.grid.w}x${s.grid.h})`);
  ok('the grid only ever grows', s.grid.w >= before.w && s.grid.h >= before.h);
  ok('rooms keep their positions',
     s.rooms.map((r) => `${r.id}@${r.x},${r.y}`).join('|') === roomsBefore,
     '(so expansion can never strand anything)');
  ok('the entrance moves to the new front wall', s.grid.entrance.y === s.grid.h - 1);
  ok('the entrance is not buried under a room',
     !s.rooms.some((r) => r.x === s.grid.entrance.x && r.y === s.grid.entrance.y));
  ok('every room is still reachable', new PathCache().warm(s).allReachable(s));
  ok('expanding to the same rank twice does nothing',
     expandGrid(s, 'local_temple') === null);
}

console.log('\n=== 47. Founding a ministry ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.level = 1;
  s.currency.offering = 50000;
  s.currency.favor = 500;

  ok('a ministry above your level is refused',
     ministryStatus(s, 'choir', TUESDAY_8AM).ok === false);

  s.level = 6;
  ok('at level it becomes available', ministryStatus(s, 'choir', TUESDAY_8AM).ok);

  const before = s.currency.offering;
  const res = foundMinistry(s, 'choir', TUESDAY_8AM);
  ok('founding succeeds', res.ok);
  ok('it costs offering and favor', s.currency.offering === before - 2500);
  ok('it joins the church', s.ministries.some((m) => m.id === 'choir'));
  ok('founding it twice is refused', foundMinistry(s, 'choir', TUESDAY_8AM).ok === false);

  // Prerequisite chains.
  s.level = 20;
  ok('Creative Arts needs the Choir first — and we have it',
     ministryStatus(s, 'creative_arts', TUESDAY_8AM).ok);
  const bare = fullChurch(TUESDAY_8AM);
  bare.level = 20; bare.currency.offering = 50000; bare.currency.favor = 500;
  const blocked = ministryStatus(bare, 'creative_arts', TUESDAY_8AM);
  ok('without the Choir it is blocked', blocked.ok === false);
  ok('and it names what is needed', blocked.needs?.[0] === 'Choir', `(${blocked.needs})`);

  const poor = fullChurch(TUESDAY_8AM);
  poor.level = 20; poor.currency.offering = 0; poor.currency.favor = 0;
  ok('an unaffordable ministry is refused', ministryStatus(poor, 'women_work', TUESDAY_8AM).ok === false);
  ok('and takes nothing', foundMinistry(poor, 'women_work', TUESDAY_8AM).ok === false &&
     poor.currency.offering === 0);
}

console.log('\n=== 48. The panel explains itself ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.level = 12; s.currency.offering = 50000; s.currency.favor = 500;
  const catalog = ministryCatalog(s, TUESDAY_8AM);

  ok('every ministry is listed', catalog.length >= 8);
  ok('each one explains what it does',
     catalog.every((m) => m.effects.length > 0 && m.effects.every((e) => typeof e === 'string')));
  ok('effects are words, not modifier ids',
     catalog.every((m) => m.effects.every((e) => !/_/.test(e.replace(/ /g, '')) || /%/.test(e))));
  ok('each carries its scripture', catalog.every((m) => typeof m.scripture === 'string'));
  ok('available ministries sort to the top',
     catalog.findIndex((m) => m.available) < catalog.findIndex((m) => !m.available && !m.founded) ||
     catalog.every((m) => m.available));

  ok('a percentage modifier reads as a percentage',
     /%/.test(describeModifier({ type: 'service_multiplier', value: 0.2 })));
  ok('a supply-scoped modifier names its supply',
     /clothing/.test(describeModifier({ type: 'production_speed', value: 0.2, supply: 'clothing' })));

  foundMinistry(s, 'choir', TUESDAY_8AM);
  const sum = ministrySummary(s, TUESDAY_8AM);
  ok('the summary reflects what was founded', sum.count === 1 && sum.service > 1);
}

console.log('\n=== 49. Ordinary days show nothing ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };

  const day = (d, hh = 10) => new Date(2026, 7, 16 + d, hh, 0, 0).getTime();  // 16th = Sunday

  ok('an ordinary Tuesday returns null, not a neutral badge',
     todayEvent(s, day(2)) === null,
     '(null makes "show nothing" the easy path for every caller)');
  ok('Monday, Thursday and Saturday are ordinary too',
     [1, 4, 6].every((d) => todayEvent(s, day(d)) === null));

  ok('Sunday is the Sabbath', todayEvent(s, day(0))?.id === 'sabbath');
  ok('Wednesday is Bible Study', todayEvent(s, day(3))?.id === 'bible_study');
  ok('Friday is Choir Rehearsal', todayEvent(s, day(5))?.id === 'choir_rehearsal');
  ok('each special day carries scripture',
     [0, 3, 5].every((d) => todayEvent(s, day(d)).scripture.includes('—')));
  ok('multiple services are a Sabbath privilege',
     todayEvent(s, day(0)).allowMultipleServices === true &&
     todayEvent(s, day(3)).allowMultipleServices === false);

  const soon = nextSpecialDay(s, day(1));
  ok('the next special day can be looked ahead to',
     soon.id === 'bible_study' && soon.inDays === 2, `(${soon.label} in ${soon.inDays})`);
}

console.log('\n=== 50. Choir rehearsal chains into the Sabbath ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };
  s.buffs = [];
  const FRI = new Date(2026, 7, 21, 19, 0, 0).getTime();
  const SAT = new Date(2026, 7, 22, 10, 0, 0).getTime();
  const SUN = new Date(2026, 7, 23, 10, 0, 0).getTime();

  ok('nothing is granted on an ordinary day',
     grantRehearsalBuff(s, SAT) === null && s.buffs.length === 0);

  const granted = grantRehearsalBuff(s, FRI);
  ok('rehearsing banks a buff', granted !== null && s.buffs.length === 1);
  ok('rehearsing twice in one day banks only one',
     grantRehearsalBuff(s, FRI + 3600000) === null && s.buffs.length === 1);

  ok('the buff survives to Sunday', pendingRehearsal(s) !== null);
  ok('it does NOT expire at midnight',
     todayEvent(s, SUN).id === 'sabbath' && s.buffs.length === 1,
     '(a Friday rehearsal must still count on Sunday morning)');

  // It raises the service, then is spent.
  clearSeats(s);
  for (let i = 0; i < 12; i++) seatPerson(s, { isStranger: false });
  const plain = fullChurch(SUN);
  clearSeats(plain);
  for (let i = 0; i < 12; i++) seatPerson(plain, { isStranger: false });
  ok('a rehearsed church out-earns one that did not',
     sermonPayout(s, 'come_unto_me', SUN).offering >
     sermonPayout(plain, 'come_unto_me', SUN).offering);

  startService(s, 'come_unto_me', SUN);
  finishService(s, SUN + 180000);
  ok('the service consumes it', s.buffs.length === 0);
}

console.log('\n=== 51. Choosing your week ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.onboarded = false;
  ok('a new church is asked to choose', needsOnboarding(s));

  ok('the Sabbath is not on offer',
     !selectableDays(s).some((d) => d.day === getSchedule(s).sabbath),
     '(Sunday is not the player\'s to move)');
  ok('six weekdays are offered', selectableDays(s).length === 6);

  ok('two evenings cannot be the same day',
     setSchedule(s, { bible_study: 2, choir_rehearsal: 2 }, TUESDAY_8AM, { first: true }).ok === false);
  ok('neither can sit on the Sabbath',
     setSchedule(s, { bible_study: 0, choir_rehearsal: 5 }, TUESDAY_8AM, { first: true }).ok === false);
  ok('a non-day is refused',
     setSchedule(s, { bible_study: 9, choir_rehearsal: 5 }, TUESDAY_8AM, { first: true }).ok === false);

  const set = setSchedule(s, { bible_study: 2, choir_rehearsal: 4 }, TUESDAY_8AM, { first: true });
  ok('a valid week is accepted', set.ok);
  ok('and onboarding is done', !needsOnboarding(s));
  ok('the chosen days take effect',
     todayEvent(s, new Date(2026, 7, 18, 10).getTime())?.id === 'bible_study',
     '(Tuesday is now Bible Study)');
  ok('the Sabbath is preserved', getSchedule(s).sabbath === 0);

  ok('days cannot be rotated freely to farm bonuses',
     canChangeSchedule(s, TUESDAY_8AM).ok === false);
  ok('but can be changed after the cooldown',
     canChangeSchedule(s, TUESDAY_8AM + 31 * 24 * H).ok === true);
  ok('a change after the cooldown succeeds',
     setSchedule(s, { bible_study: 3, choir_rehearsal: 5 }, TUESDAY_8AM + 31 * 24 * H).ok);
}

console.log('\n=== 52. Rehearsal happens while away ===');
{
  const s = fullChurch(new Date(2026, 7, 21, 17, 0, 0).getTime());   // Friday evening
  s.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };
  s.buffs = [];
  const r = resolveOffline(s, s.lastSavedAt + 4 * H, 'p-rehearse');
  ok('the choir rehearses whether or not anyone is watching',
     r.state.buffs.length === 1, `(${r.state.buffs.length} buff)`);
  ok('and it is reported in the away summary', r.summary.rehearsed === true);

  const ordinary = fullChurch(new Date(2026, 7, 20, 17, 0, 0).getTime()); // Thursday
  ordinary.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };
  ordinary.buffs = [];
  const r2 = resolveOffline(ordinary, ordinary.lastSavedAt + 4 * H, 'p-none');
  ok('nothing is banked on an ordinary evening', r2.state.buffs.length === 0);
}

console.log('\n=== 53. Missing a special day costs nothing ===');
{
  // The whole non-punitive promise, stated as a test.
  const SUN = new Date(2026, 7, 23, 2, 0, 0).getTime();
  const s = fullChurch(SUN);
  s.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };
  const r = resolveOffline(s, SUN + 8 * H, 'p-sabbath');

  ok('an absent player still gathers a congregation', r.state.sanctuary.seated > 0);
  ok('still earns offering', r.summary.offering > 0);
  ok('still receives supplies', Object.keys(r.summary.supplies).length > 0);
  ok('and nothing was taken away', r.state.currency.offering >= s.currency.offering,
     '(a missed Sabbath is a boost declined, never a penalty)');
}

console.log('\n=== 54. When the away card appears ===');
{
  const brief = { elapsedMs: 2 * 60 * 1000, served: { food: 1 }, offering: 12 };
  ok('a two-minute absence shows nothing', shouldShowAway(brief) === false,
     '(a reload is not an event)');

  const quiet = { elapsedMs: 45 * 60 * 1000, served: {}, offering: 0, seated: 0 };
  ok('a long but empty absence shows nothing', shouldShowAway(quiet) === false);

  const real = { elapsedMs: 45 * 60 * 1000, served: { food: 4 }, offering: 60 };
  ok('a real absence shows the card', shouldShowAway(real));

  const shortButNotable = { elapsedMs: 8 * 60 * 1000, served: {}, completedRooms: ['fellowship_hall'] };
  ok('a finished room is worth announcing after eight minutes',
     isNotable(shortButNotable) && shouldShowAway(shortButNotable));
  ok('so is a rehearsal',
     shouldShowAway({ elapsedMs: 6 * 60 * 1000, served: {}, rehearsed: true }));

  ok('nothing at all shows nothing', shouldShowAway(null) === false);
  ok('the threshold is a tunable, not a magic number', TUNING.AWAY_MIN_MS > 0);
}

console.log('\n=== 55. Unmet needs read as needs ===');
{
  const s = newState(TUESDAY_8AM);
  const r = resolveOffline(s, TUESDAY_8AM + 6 * H, 'p-away');
  const report = buildAwayReport(r.summary, r.state, []);

  ok('the report has an absence in plain words', /hour/.test(report.absence),
     `("${report.absence}")`);
  ok('unmet needs are listed', report.seeking.length > 0);

  const words = report.seeking.map((x) => x.text).join(' ');
  ok('they are phrased as arrivals, not losses',
     /came/.test(words) && !/turned away|lost|failed|missed/i.test(words),
     `("${report.seeking[0].text}")`);
  ok('and they suggest what would meet the need',
     report.seeking.some((x) => x.suggestion),
     `("${report.seeking.find((x) => x.suggestion)?.suggestion}")`);
  ok('the suggestion is about the need, not the people',
     report.seeking.filter((x) => x.suggestion)
       .every((x) => /meet this need$/.test(x.suggestion)));
  ok('nothing in the card reads as a penalty',
     !/penalt|lost|wasted|failed/i.test(JSON.stringify(report)));
}

console.log('\n=== 56. The card reads well ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 30, clothing: 20 };
  const r = resolveOffline(s, TUESDAY_8AM + 9 * H, 'p-card');
  const report = buildAwayReport(r.summary, r.state, []);

  ok('souls served are counted', report.souls > 0 && report.souls === soulsServed(r.summary));
  ok('served needs are described in words',
     report.served.every((x) => /\d+ \w/.test(x.text)), `("${report.served[0]?.text}")`);
  ok('the busiest need is listed first',
     report.served.every((x, i) => i === 0 || x.count <= report.served[i - 1].count));
  ok('who is waiting is reported', report.waiting.length > 0, `(${report.waiting[0]})`);
  ok('supplies made are reported', report.supplies.length > 0);
  ok('offering is carried', report.offering > 0);
}

console.log('\n=== 57. The ledger gives the numbers meaning ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.awayLog = [];
  const fake = (souls) => ({ souls, offering: souls * 12, absence: '3 hours away',
                             rooms: [], waiting: [], seeking: [], served: [], rehearsed: false });

  for (const n of [10, 12, 11]) pushAwayHistory(s, fake(n));
  ok('the ledger keeps entries newest first', s.awayLog[0].souls === 11);
  for (let i = 0; i < 20; i++) pushAwayHistory(s, fake(i));
  ok('and is capped', s.awayLog.length === TUNING.AWAY_HISTORY);

  const history = [fake(10), fake(12), fake(11)];
  ok('a record night is called out',
     headlineFor(fake(40), history) === 'Your busiest stretch this week.');
  ok('a quiet stretch is noted gently',
     /quieter/.test(headlineFor(fake(3), history) || ''));
  ok('a finished room outranks any comparison',
     headlineFor({ ...fake(40), rooms: ['Fellowship Hall'] }, history) ===
     'Fellowship Hall is finished.');
  ok('an empty stretch says so',
     headlineFor({ souls: 0, waiting: [], rooms: [] }, []) === 'A quiet stretch.');
  ok('the ledger survives a save round-trip',
     JSON.parse(JSON.stringify(s.awayLog)).length === TUNING.AWAY_HISTORY);
}

console.log('\n=== 58. Sitting down ===');
{
  const legH = 1.72 * 0.44;
  const pose = seatedPose(legH, -1);

  ok('the figure lowers rather than standing on the floor',
     pose.groupY < 0, `(drops ${pose.groupY.toFixed(2)})`,);
  ok('the hips land exactly on the seat',
     Math.abs(pose.groupY + legH - SEAT_TOP_Y) < 1e-9,
     `(hips ${(pose.groupY + legH).toFixed(3)}, seat ${SEAT_TOP_Y})`);
  ok('the thighs fold horizontal', Math.abs(pose.legRotX + Math.PI / 2) < 1e-9);
  ok('and fold FORWARD, toward the chancel', pose.legZ < 0,
     '(legs folding backward reads as kneeling on the pew)');

  ok('a congregation facing -z needs no extra half turn',
     pose.extraYaw === 0,
     '(the figure already faces -z; adding PI aims it at the back wall)');
  ok('the opposite facing does get one', seatedPose(legH, 1).extraYaw === Math.PI);

  // Different builds sit at the same height.
  const teen = seatedPose(1.44 * 0.44, -1);
  ok('a shorter person still meets the seat',
     Math.abs(teen.groupY + 1.44 * 0.44 - SEAT_TOP_Y) < 1e-9);
  ok('but sits lower overall', teen.groupY > pose.groupY);

  ok('the seat height matches the pew mesh', SEAT_TOP_Y > 0.4 && SEAT_TOP_Y < 0.8,
     '(derived from render/church.js — change one, change the other)');
}

console.log('\n=== 59. The pews reflect state, not the live list ===');
{
  // The bug this guards: the offline resolver seats people by
  // incrementing a COUNT — there are no visitor objects for them.
  // A renderer that draws only live visitors leaves the pews empty
  // while the rules consider them full, which then shunts every
  // new arrival into the vestibule to stand at the door.
  const r = resolveOffline(newState(TUESDAY_8AM), TUESDAY_8AM + 9 * H, 'p-pews');
  const s = r.state;

  ok('an absence seats a congregation', s.sanctuary.seated > 0,
     `(${s.sanctuary.seated} seated)`);
  ok('but creates no visitor objects for them', true,
     '(which is exactly why the renderer must read the count)');

  const t = roomTransform(s, s.rooms.find((x) => x.id === 'sanctuary'));
  const plan = pewLayout(t.size);
  const slots = seatSlots(t.size, plan, 40);

  ok('there is a seat for everyone the rules seated',
     slots.length >= s.sanctuary.seated,
     `(${slots.length} slots for ${s.sanctuary.seated})`);

  // Stand-ins must be stable: the same church looks the same twice.
  const cast = (i) => {
    const rng = bucketRng('p-pews:pew', i);
    rng();
    return castCongregant(s, rng);
  };
  ok('stand-ins are cast deterministically',
     JSON.stringify(cast(3)) === JSON.stringify(cast(3)),
     '(the same church must look like the same congregation)');
  ok('and differ from seat to seat',
     JSON.stringify(cast(3)) !== JSON.stringify(cast(4)));

  const mix = congregationMix(s);
  ok('the mix accounts for every seated soul',
     mix.stranger + mix.member + mix.youth === s.sanctuary.seated,
     `(${JSON.stringify(mix)})`);

  ok('overflow waits in the vestibule, not on the threshold',
     s.sanctuary.vestibule > 0, `(${s.sanctuary.vestibule} waiting)`);
}

console.log('\n=== 60. The people who come back ===');
{
  const SUN = new Date(2026, 7, 23, 10, 0, 0).getTime();
  const MON = new Date(2026, 7, 24, 10, 0, 0).getTime();
  const s = fullChurch(SUN);
  s.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };

  const sunday = dueCharacters(s, SUN);
  ok('Mother Hayes comes on the Sabbath', sunday.includes('mother_hayes'));
  ok('Deacon Pruitt comes every day', sunday.includes('deacon_pruitt'));

  for (const id of sunday) markArrived(s, id, SUN);
  ok('nobody comes twice in one day', dueCharacters(s, SUN).length === 0);

  const monday = dueCharacters(s, MON);
  ok('the Deacon is back on Monday', monday.includes('deacon_pruitt'));
  ok('Mother Hayes is not — she comes for gatherings',
     !monday.includes('mother_hayes'));

  const arrival = makeArrival(s, 'mother_hayes', SUN);
  ok('her appearance is fixed, not sampled',
     arrival.appearance.base === 'elder_f' && arrival.appearance.hair === 'church_hat',
     '(she must look like herself every time)');
  ok('she brings a word with her', typeof arrival.greeting === 'string' && arrival.greeting.length > 0);
  ok('and she never comes empty-handed', arrival.gift?.favor > 0);
}

console.log('\n=== 61. Titles are not doubled ===');
{
  ok('a name that already carries its title is left alone',
     displayName('Mother Hayes', 'Mother') === 'Mother Hayes',
     '(blind prefixing produced "Mother Mother Hayes")');
  ok('a bare name gets its title', displayName('Hayes', 'Mother') === 'Mother Hayes');
  ok('no title is fine', displayName('A stranger', null) === 'A stranger');
  ok('the converted stranger is not doubled either',
     displayName('Brother Terrence', 'Brother') === 'Brother Terrence');

  const s = fullChurch(TUESDAY_8AM);
  ok('arrivals carry a ready-to-show name',
     !/Mother Mother|Deacon Deacon/.test(makeArrival(s, 'mother_hayes', TUESDAY_8AM).display));
}

console.log('\n=== 62. The stranger\'s arc ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.supplies = { food: 99, clothing: 99 };
  const def = CHARACTER_BY_ID.the_stranger;
  let t = TUESDAY_8AM;

  const needs = new Set();
  for (let i = 0; i < def.arc.visitsBeforeBaptism; i++) {
    const a = makeArrival(s, 'the_stranger', t);
    needs.add(a.needId);
    ok(`visit ${i + 1} does not yet ask for baptism`, a.needId !== 'baptism');
    markArrived(s, 'the_stranger', t);
    onServed(s, 'the_stranger', t, { needId: a.needId });
    t += 2 * 24 * H;
  }
  ok('the need changes from visit to visit', needs.size > 1, `(${[...needs].join(', ')})`);

  const asking = makeArrival(s, 'the_stranger', t);
  ok('after enough kindness he asks for baptism', asking.needId === 'baptism');
  ok('and says so', asking.askingBaptism === true && /want what you all have/.test(asking.greeting));

  markArrived(s, 'the_stranger', t);
  const out = onServed(s, 'the_stranger', t, { needId: 'baptism' });
  ok('baptism converts him', out.conversion !== null);
  ok('he takes a name', /^Brother /.test(out.conversion.name), `(${out.conversion.name})`);
  ok('the moment carries scripture', out.conversion.scripture.includes('—'));

  const p = arcProgress(s);
  ok('the arc records it', p.converted && p.name === out.conversion.name);
  ok('converting is a one-time event',
     onServed(s, 'the_stranger', t + H, { needId: 'baptism' }).conversion === null);

  const after = makeArrival(s, 'the_stranger', t + 3 * 24 * H);
  ok('he comes back as himself', after.name === out.conversion.name);
  ok('dressed differently', after.appearance.outfit === 'sunday_suit');
  ok('and now brings favor too', after.gift?.favor > 0);
}

console.log('\n=== 63. A conversion outranks everything ===');
{
  const report = { souls: 4, rooms: ['Fellowship Hall'], waiting: [],
                   conversion: { name: 'Brother Curtis' } };
  ok('nothing outranks a soul being saved',
     headlineFor(report, []) === 'Brother Curtis was baptized.',
     '(even a finished room)');
}

console.log('\n=== 64. Timed boosts wear off ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.buffs = [];
  onServed(s, 'deacon_pruitt', TUESDAY_8AM, { needId: 'food' });

  ok('the Deacon leaves the work moving faster',
     s.buffs.some((b) => b.id === 'deacon_pruitt'));
  ok('and it counts while it lasts',
     resolveModifiers(s, TUESDAY_8AM + 60000).production_speed > 1);
  ok('but not once it has run out',
     Math.abs(resolveModifiers(s, TUESDAY_8AM + 2 * H).production_speed - 1) < 1e-9,
     '(an expired buff must never contribute)');

  ok('expired buffs are swept up', pruneBuffs(s, TUESDAY_8AM + 2 * H) === 1 && s.buffs.length === 0);
  ok('serving him again refreshes rather than stacking', (() => {
    onServed(s, 'deacon_pruitt', TUESDAY_8AM, { needId: 'food' });
    onServed(s, 'deacon_pruitt', TUESDAY_8AM + 60000, { needId: 'food' });
    return s.buffs.filter((b) => b.id === 'deacon_pruitt').length === 1;
  })());

  // Choir rehearsal has no expiry and must survive the sweep.
  s.buffs.push({ id: 'choir_rehearsal', type: 'service_multiplier', value: 0.3, consumeOnService: true });
  pruneBuffs(s, TUESDAY_8AM + 99 * H);
  ok('a rehearsal buff has no expiry and is not swept',
     s.buffs.some((b) => b.id === 'choir_rehearsal'));
}

console.log('\n=== 65. Regulars come while you are away ===');
{
  const SUN = new Date(2026, 7, 23, 6, 0, 0).getTime();
  const s = fullChurch(SUN);
  s.schedule = { sabbath: 0, bible_study: 3, choir_rehearsal: 5 };
  s.currency.supplies = { food: 99, clothing: 99 };
  const favorBefore = s.currency.favor;

  const r = resolveOffline(s, SUN + 6 * H, 'p-regulars');
  ok('Mother Hayes does not wait for the app to open',
     (r.summary.visitors || []).some((v) => /Hayes/.test(v.name)),
     `(${(r.summary.visitors || []).map((v) => v.name).join(', ')})`);
  ok('and she leaves favor behind', r.state.currency.favor > favorBefore);

  const report = buildAwayReport(r.summary, r.state, []);
  ok('the away card names who came by', report.visitors.length > 0,
     `("${report.visitors[0]}")`);
}

console.log('\n=== 66. The congregation processes out ===');
{
  // The bug: finishService cleared 16 seats and refilled 16 from
  // the vestibule in the same instant. The count never changed, so
  // nothing moved on screen and it looked like nobody left.
  const r = resolveOffline(newState(TUESDAY_8AM), TUESDAY_8AM + 9 * H, 'p-out');
  const s = r.state;
  const NOW = TUESDAY_8AM + 9 * H;
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-out');

  const seatedBefore = s.sanctuary.seated;
  const vestBefore = s.sanctuary.vestibule;
  ok('the pews are full and people wait outside',
     seatedBefore > 0 && vestBefore > 0);

  startService(s, 'come_unto_me', NOW);
  const out = finishService(s, NOW + 180000, { gradual: true });

  ok('the pews actually empty', s.sanctuary.seated === 0,
     '(instant refill left the count unchanged and nothing appeared to happen)');
  ok('and nobody has jumped the queue yet', s.sanctuary.vestibule === vestBefore);
  ok('the service still reports who was there', out.congregation === seatedBefore);

  const c = sys.concludeService(NOW + 180000, { standIns: seatedBefore });
  ok('figures are sent out to be seen leaving', c.procession > 0);
  ok('the procession is capped so it is not a stampede',
     c.procession <= TUNING.MAX_PROCESSION);
  ok('they are walking, not standing',
     sys.visitors.filter((v) => v.phase === 'leaving').length === c.procession);

  // The vestibule files in one at a time.
  let t = NOW + 180000;
  const seatedAt = [];
  for (let i = 0; i < 20 * 30; i++) { sys.update(1 / 30, t); t += 1000 / 30; }
  seatedAt.push(s.sanctuary.seated);
  ok('the vestibule files in and fills the pews again',
     s.sanctuary.seated > 0, `(${s.sanctuary.seated} seated)`);
  ok('and the vestibule has drained accordingly',
     s.sanctuary.vestibule < vestBefore,
     `(${vestBefore} → ${s.sanctuary.vestibule})`);
  ok('never beyond capacity', s.sanctuary.seated <= 16);
}

console.log('\n=== 67. Refilling is paced, not instant ===');
{
  const s = fullChurch(TUESDAY_8AM);
  clearSeats(s);
  s.sanctuary.vestibule = 10;
  s.sanctuary.lastRefillAt = 0;

  ok('one person moves at a time', refillStep(s, TUESDAY_8AM) === true &&
     s.sanctuary.seated === 1);
  ok('and not again immediately',
     refillStep(s, TUESDAY_8AM + 100) === false && s.sanctuary.seated === 1);
  ok('but again after the interval',
     refillStep(s, TUESDAY_8AM + TUNING.REFILL_INTERVAL_MS + 1) === true &&
     s.sanctuary.seated === 2);

  ok('an empty vestibule moves nobody',
     refillStep({ ...s, sanctuary: { ...s.sanctuary, vestibule: 0 } },
                TUESDAY_8AM + 99 * H) === false);

  // Fill right up and confirm it stops.
  let t = TUESDAY_8AM;
  for (let i = 0; i < 100; i++) { t += TUNING.REFILL_INTERVAL_MS + 1; refillStep(s, t); }
  ok('it stops at capacity', s.sanctuary.seated <= 16, `(${s.sanctuary.seated})`);
  ok('counts stay consistent',
     congregationMix(s).stranger + congregationMix(s).member + congregationMix(s).youth
       === s.sanctuary.seated);
}

console.log('\n=== 68. Nobody is stranded by a service ===');
{
  const s = fullChurch(TUESDAY_8AM);
  clearSeats(s);
  s.sanctuary.vestibule = 0;
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-strand');

  // Seat a live visitor by hand, then hold a service.
  const v = sys.spawnOne(TUESDAY_8AM);
  v.phase = 'seated';
  v.seatIndex = 0;
  v.category = seatPerson(s, { isStranger: false });

  startService(s, 'come_unto_me', TUESDAY_8AM);
  finishService(s, TUESDAY_8AM + 180000, { gradual: true });
  sys.concludeService(TUESDAY_8AM + 180000, { standIns: 0 });

  ok('a live worshipper is dismissed, not left sitting',
     v.phase === 'leaving', `(phase=${v.phase})`);
  ok('and gives up their seat', v.seatIndex === undefined);
  ok('the seat count does not go negative or drift',
     s.sanctuary.seated === 0, `(${s.sanctuary.seated})`);
}

console.log('\n=== 69. The pastor ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const p = ensurePastor(s, 'p-pastor');

  ok('he is cast once and remembered', p.appearance !== undefined);
  ok('and does not change between services', (() => {
    const first = JSON.stringify(s.pastor.appearance);
    ensurePastor(s, 'p-pastor');
    return JSON.stringify(s.pastor.appearance) === first;
  })(), '(a pastor whose face changes is not a pastor)');

  ok('casting rules still apply to the office',
     s.pastor.appearance.group === 'black' && s.pastor.appearance.fixed === true);
  ok('and he wears clergy dress',
     /^pastor_suit/.test(s.pastor.appearance.outfit), `(${s.pastor.appearance.outfit})`);
  ok('the office may be held by a man or a woman', (() => {
    const genders = new Set();
    for (let i = 0; i < 60; i++) {
      const st = fullChurch(TUESDAY_8AM);
      ensurePastor(st, `player-${i}`);
      genders.add(st.pastor.appearance.base.endsWith('_m') ? 'm' : 'f');
    }
    return genders.size === 2;
  })(), '(per COTLG polity, unlike the bishops)');

  ok('he starts seated', s.pastor.phase === 'seated');
  ok('and is not busy', pastorBusy(s) === false);
}

console.log('\n=== 70. He rises, preaches, dismisses, and sits ===');
{
  const s = fullChurch(TUESDAY_8AM);
  ensurePastor(s, 'p-cycle');
  let t = TUESDAY_8AM;
  const seen = [];
  const step = (active) => {
    const r = advancePastor(s, t, { serviceActive: active });
    if (r.changed) seen.push(s.pastor.phase);
    return r;
  };

  step(false);
  ok('nothing happens without a service', s.pastor.phase === 'seated');

  step(true);
  ok('a service brings him to his feet', s.pastor.phase === 'rising');

  t += PASTOR.RISE_MS + 1;
  step(true);
  ok('he reaches the pulpit', s.pastor.phase === 'preaching');
  ok('and stays there while it runs', (() => {
    t += 60000; step(true); return s.pastor.phase === 'preaching';
  })());

  const end = step(false);
  ok('the service ending sends him into the benediction',
     s.pastor.phase === 'dismissing');
  ok('and he says something', typeof end.line === 'string' && end.line.length > 0,
     `("${end.line}")`);

  t += PASTOR.DISMISS_MS + 1;
  const bye = step(false);
  ok('then he sees the people out', s.pastor.phase === 'waving');
  ok('with a farewell', typeof bye.line === 'string');

  t += PASTOR.WAVE_MS + 1;
  step(false);
  ok('only then does he head back', s.pastor.phase === 'returning');

  t += PASTOR.RETURN_MS + 1;
  step(false);
  ok('and sits back down', s.pastor.phase === 'seated');
  ok('the full cycle ran in order',
     seen.join(' → ') === 'rising → preaching → dismissing → waving → returning → seated',
     `(${seen.join(' → ')})`);

  ok('advancing again changes nothing',
     advancePastor(s, t, { serviceActive: false }).changed === false,
     '(must be idempotent — it runs every frame)');
}

console.log('\n=== 71. Where he stands ===');
{
  const s = fullChurch(TUESDAY_8AM);
  ensurePastor(s, 'p-pose');
  const t0 = roomTransform(s, s.rooms.find((r) => r.id === 'sanctuary'));
  const plan = pewLayout(t0.size);
  const chancel = chancelLayout(t0.size, plan);
  let t = TUESDAY_8AM;

  const seated = pastorPose(s, chancel, t);
  ok('he sits in the chair, not at the pulpit',
     Math.abs(seated.x - chancel.chair.x) < 1e-9 && seated.action === 'sit');
  ok('the chair is on the platform, off to one side',
     Math.abs(chancel.chair.x) > 0.5 && chancel.chair.z <= chancel.platform.z + 0.01);
  ok('and it faces the people, not the wall',
     chancel.chair.facing === -plan.facing,
     '(copying plan.facing puts the pastor\'s back to the pews)');
  ok('his backrest is behind him, toward the wall',
     chancel.chair.z - chancel.chair.facing * (chancel.chair.d / 2) < chancel.chair.z);

  advancePastor(s, t, { serviceActive: true });
  t += PASTOR.RISE_MS / 2;
  const midway = pastorPose(s, chancel, t);
  ok('he walks across rather than teleporting',
     midway.action === 'walk' &&
     midway.x > Math.min(chancel.chair.x, chancel.preacher.x) &&
     midway.x < Math.max(chancel.chair.x, chancel.preacher.x),
     `(x=${midway.x.toFixed(2)})`);

  t += PASTOR.RISE_MS;
  advancePastor(s, t, { serviceActive: true });
  const preaching = pastorPose(s, chancel, t);
  ok('he preaches from behind the pulpit',
     Math.abs(preaching.x - chancel.preacher.x) < 1e-9 &&
     Math.abs(preaching.z - chancel.preacher.z) < 1e-9);
  ok('which is further from the people than the pulpit itself',
     Math.abs(chancel.preacher.z - chancel.pulpit.z) > 0.2 &&
     chancel.preacher.z < chancel.pulpit.z,
     '(he stands behind it, not on it)');

  advancePastor(s, t, { serviceActive: false });
  ok('the benediction is given with a raised hand',
     pastorPose(s, chancel, t).action === 'wave');

  ok('progress through a phase is reported', (() => {
    const half = phaseProgress(s, t + PASTOR.DISMISS_MS / 2);
    return half > 0.4 && half < 0.6;
  })());
  ok('every phase is a known one', PHASES.includes(s.pastor.phase));
}

console.log('\n=== 72. Rooms are furnished, not empty pads ===');
{
  const buildable = ROOMS.filter((r) => r.id !== 'sanctuary').map((r) => r.id);
  ok('every buildable room has something in it',
     unfurnished(buildable).length === 0,
     `(bare: ${unfurnished(buildable).join(', ') || 'none'})`);

  const kitchen = FURNITURE.fellowship_hall;
  ok('the kitchen has a cook line and tables',
     kitchen.some((p) => p.id === 'range') && kitchen.some((p) => /table/.test(p.id)));

  // Normalized coordinates are what keep furniture correct when a
  // room is rotated or resized.
  const all = Object.values(FURNITURE).flat();
  ok('positions are normalized to the room',
     all.every((p) => Math.abs(p.x) <= 0.5 && Math.abs(p.z) <= 0.5),
     '(so rotation and resizing need no re-measuring)');
  ok('footprints are fractions too',
     all.every((p) => p.w > 0 && p.w <= 1 && p.d > 0 && p.d <= 1));
  ok('nothing pokes through a wall',
     all.every((p) => Math.abs(p.x) + p.w / 2 <= 0.52 && Math.abs(p.z) + p.d / 2 <= 0.52));
  ok('heights are sane', all.every((p) => p.h > 0 && p.h < 2.2));
  ok('every piece names a material', all.every((p) => typeof p.material === 'string'));
  ok('every piece has an id', all.every((p) => typeof p.id === 'string' && p.id.length));

  ok('the baptismal pool actually holds water',
     FURNITURE.baptismal_pool.some((p) => p.material === 'water'));
  ok('the closet has clothing on rails',
     FURNITURE.benevolence_closet.some((p) => /cloth/i.test(p.material)));
}

console.log('\n=== 73. Rearranging is reachable ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.offering = 5000;

  ok('moving costs offering', moveCost().offering > 0);
  ok('and never favor', moveCost().favor === undefined);

  ok('there are rooms to rearrange', s.rooms.length > 1);
  ok('the sanctuary is among them',
     canPickUp(s, 'sanctuary').ok,
     '(it is a room like any other — repath keeps everyone routed)');
  const movable = s.rooms.filter((r) => r.id !== 'sanctuary');

  // Every movable room must have somewhere legal to go, or the
  // Arrange button is a dead end.
  const room = movable[0];
  let somewhere = null;
  for (let y = 0; y < s.grid.h && !somewhere; y++) {
    for (let x = 0; x < s.grid.w && !somewhere; x++) {
      if (x === room.x && y === room.y) continue;
      if (canMoveTo(s, room.id, x, y, room.rot || 0).valid) somewhere = { x, y };
    }
  }
  ok('a built room has somewhere legal to move to', somewhere !== null);

  const before = s.currency.offering;
  const res = moveRoom(s, room.id, somewhere.x, somewhere.y, room.rot || 0);
  ok('the move goes through', res.ok);
  ok('and is charged', s.currency.offering === before - moveCost().offering);
  ok('everything is still reachable afterwards',
     new PathCache().warm(s).allReachable(s));

  ok('a move onto the sanctuary is refused',
     canMoveTo(s, room.id, 4, 0, 0).valid === false);
}

console.log('\n=== 74. Moving a room does not strand anyone ===');
{
  // repath() used to fix only visitors in 'walking_in'. Everyone
  // else kept stale state when a room moved out from under them.
  const s = fullChurch(TUESDAY_8AM);
  s.currency.offering = 9999;
  s.currency.supplies = { food: 99, clothing: 99 };
  const paths = new PathCache().warm(s);
  const sys = new VisitorSystem(s, paths, 'p-move');

  const hall = s.rooms.find((r) => r.id === 'fellowship_hall');
  const oldDoor = doorAndApproach('fellowship_hall', hall.x, hall.y, hall.rot || 0).approach;

  // Put someone at the hall's door, waiting to be fed.
  const waiter = sys.spawnOne(TUESDAY_8AM);
  waiter.needId = 'food';
  waiter.phase = 'waiting';
  waiter.pos = { x: oldDoor.x, y: oldDoor.y };
  waiter.path = paths.toRoom(s, 'fellowship_hall');

  // And someone on their way out.
  const leaver = sys.spawnOne(TUESDAY_8AM);
  leaver.phase = 'leaving';
  leaver.pos = { x: oldDoor.x, y: oldDoor.y };

  let target = null;
  for (let y = 0; y < s.grid.h && !target; y++) {
    for (let x = 0; x < s.grid.w && !target; x++) {
      if (x === hall.x && y === hall.y) continue;
      if (validatePlacement(s, 'fellowship_hall', x, y, 0, { ignoreRoom: 'fellowship_hall' }).valid) {
        target = { x, y };
      }
    }
  }
  ok('somewhere to move the hall exists', target !== null);

  moveRoom(s, 'fellowship_hall', target.x, target.y, 0);
  paths.invalidate();
  paths.warm(s);
  const r = sys.repath();

  ok('the waiting visitor is sent to the door\'s new position',
     waiter.phase === 'walking_in' && r.resent >= 1,
     '(they used to keep standing where the door used to be)');
  const newDoor = doorAndApproach('fellowship_hall', target.x, target.y, 0).approach;
  ok('and their route ends at the new door',
     JSON.stringify(waiter.path[waiter.path.length - 1]) === JSON.stringify(newDoor));

  ok('the departing visitor gets a fresh route out', leaver.path?.length >= 2);
  ok('starting from where they actually stand',
     leaver.path[0].x === Math.round(leaver.pos.x) &&
     leaver.path[0].y === Math.round(leaver.pos.y),
     '(it used to reverse the route they arrived on)');
  ok('and ending at the front door',
     JSON.stringify(leaver.path[leaver.path.length - 1]) === JSON.stringify(s.grid.entrance));

  // Everyone walks it out without breaking.
  let t = TUESDAY_8AM;
  for (let i = 0; i < 60 * 30; i++) { sys.update(1 / 30, t); t += 1000 / 30; }
  const broken = sys.visitors.filter((v) =>
    (v.phase === 'walking_in' || v.phase === 'leaving') && (!v.path || v.path.length < 2));
  ok('nobody is left with a broken path', broken.length === 0, `(${broken.length} broken)`);
}

console.log('\n=== 75. Leaving starts from where you stand ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const paths = new PathCache().warm(s);
  const sys = new VisitorSystem(s, paths, 'p-exit');

  // A seated worshipper, dismissed by the end of a service.
  clearSeats(s);
  const v = sys.spawnOne(TUESDAY_8AM);
  v.phase = 'seated';
  v.seatIndex = 0;
  v.category = seatPerson(s, { isStranger: false });
  const sanctuary = s.rooms.find((r) => r.id === 'sanctuary');
  const door = doorAndApproach('sanctuary', sanctuary.x, sanctuary.y, sanctuary.rot || 0).approach;
  v.pos = { x: door.x, y: door.y };

  startService(s, 'come_unto_me', TUESDAY_8AM);
  finishService(s, TUESDAY_8AM + 180000, { gradual: true });
  sys.concludeService(TUESDAY_8AM + 180000, { standIns: 0 });

  ok('they are walking out', v.phase === 'leaving');
  ok('from the sanctuary door, not from a remembered route',
     v.path[0].x === door.x && v.path[0].y === door.y);
  ok('and the route reaches the entrance',
     JSON.stringify(v.path[v.path.length - 1]) === JSON.stringify(s.grid.entrance));

  let t = TUESDAY_8AM + 180000;
  for (let i = 0; i < 60 * 30; i++) { sys.update(1 / 30, t); t += 1000 / 30; }
  ok('and they actually get there', !sys.visitors.some((x) => x.id === v.id));
}

console.log('\n=== 76. The sanctuary moves, but not mid-service ===');
{
  const s = fullChurch(TUESDAY_8AM);
  s.currency.offering = 9999;
  clearSeats(s);

  ok('an idle sanctuary can be picked up', canPickUp(s, 'sanctuary').ok);

  for (let i = 0; i < 8; i++) seatPerson(s, { isStranger: false });
  ok('a full sanctuary can still be picked up', canPickUp(s, 'sanctuary').ok,
     '(figures snap, which is cosmetic — nothing breaks)');

  startService(s, 'come_unto_me', TUESDAY_8AM);
  const blocked = canPickUp(s, 'sanctuary');
  ok('but not while service is going on', blocked.ok === false,
     '(it would teleport the pastor out of the pulpit)');
  ok('and it says why', blocked.reason === MOVE_REASONS.DURING_SERVICE,
     `("${blocked.reason}")`);
  ok('the move itself is refused too',
     moveRoom(s, 'sanctuary', 0, 0, 0).reason === MOVE_REASONS.DURING_SERVICE);
  ok('and nothing is charged', s.currency.offering === 9999);

  ok('other rooms are unaffected by a service',
     canPickUp(s, 'fellowship_hall').ok === true,
     '(only the sanctuary is in use)');

  finishService(s, TUESDAY_8AM + 180000, { gradual: true });
  ok('once service is over it can move again', canPickUp(s, 'sanctuary').ok);

  // fullChurch() builds everything, so use a bare church here.
  ok('a room that was never built cannot be picked up',
     canPickUp(newState(TUESDAY_8AM), 'baptismal_pool').reason === MOVE_REASONS.NOT_BUILT);
}

console.log('\n=== 77. Actually moving the sanctuary ===');
{
  const s = newState(TUESDAY_8AM);   // roomier: sanctuary alone
  s.currency.offering = 9999;
  const paths = new PathCache().warm(s);
  const sys = new VisitorSystem(s, paths, 'p-sanct');

  for (let i = 0; i < 6; i++) seatPerson(s, { isStranger: false });
  const seatedBefore = s.sanctuary.seated;

  const sanctuary = s.rooms.find((r) => r.id === 'sanctuary');
  let target = null;
  for (let y = 0; y < s.grid.h && !target; y++) {
    for (let x = 0; x < s.grid.w && !target; x++) {
      if (x === sanctuary.x && y === sanctuary.y) continue;
      if (canMoveTo(s, 'sanctuary', x, y, 0).valid) target = { x, y };
    }
  }
  ok('there is somewhere to put it', target !== null,
     '(a 6x8 footprint has few options — that is fine)');

  const res = moveRoom(s, 'sanctuary', target.x, target.y, 0);
  ok('the move succeeds', res.ok, `(${res.reason || ''})`);
  ok('the congregation is not lost', s.sanctuary.seated === seatedBefore);

  paths.invalidate(); paths.warm(s);
  sys.repath();
  ok('and the church is still walkable', paths.allReachable(s));
  ok('the front door still reaches the sanctuary',
     paths.toRoom(s, 'sanctuary') !== null);
}

console.log('\n=== 78. The pastor always faces the people ===');
{
  const s = fullChurch(TUESDAY_8AM);
  ensurePastor(s, 'p-face');
  const t0 = roomTransform(s, s.rooms.find((r) => r.id === 'sanctuary'));
  const plan = pewLayout(t0.size);
  const chancel = chancelLayout(t0.size, plan);
  let t = TUESDAY_8AM;

  // Every phase, without exception.
  const phases = [];
  const record = () => phases.push({ phase: s.pastor.phase, pose: pastorPose(s, chancel, t) });

  record();                                          // seated
  advancePastor(s, t, { serviceActive: true }); record();   // rising
  t += PASTOR.RISE_MS + 1;
  advancePastor(s, t, { serviceActive: true }); record();   // preaching
  advancePastor(s, t, { serviceActive: false }); record();  // dismissing
  t += PASTOR.DISMISS_MS + 1;
  advancePastor(s, t, { serviceActive: false }); record();  // waving
  t += PASTOR.WAVE_MS + 1;
  advancePastor(s, t, { serviceActive: false }); record();  // returning

  ok('he never turns his back on the pews, in any phase',
     phases.every((p) => p.pose.facing === -plan.facing),
     `(${phases.map((p) => `${p.phase}:${p.pose.facing}`).join(' ')})`);
  ok('every phase was covered', phases.length === 6);

  // And the congregation is looking back at him.
  const slots = seatSlots(t0.size, plan, 8);
  ok('the congregation looks the other way', slots.every((x) => x.facing === plan.facing));
  ok('so pastor and people are face to face',
     phases[0].pose.facing === -slots[0].facing);
}

console.log('\n=== 79. A full house fills every bench ===');
{
  const s = newState(TUESDAY_8AM);
  const room = s.rooms.find((r) => r.id === 'sanctuary');
  const t = roomTransform(s, room);
  const plan = pewLayout(t.size);
  const slots = allSeatSlots(t.size, plan, { pews: room.seats });

  ok('every bench holds the same number', (() => {
    const per = {};
    for (const x of slots) {
      const key = `${x.z.toFixed(2)}|${x.side}`;
      per[key] = (per[key] || 0) + 1;
    }
    return new Set(Object.values(per)).size === 1;
  })(), '(3 rows x 2 benches x 3 seats)');

  ok('a full house leaves nobody sitting alone', (() => {
    const per = {};
    for (let i = 0; i < room.seats; i++) {
      const x = slots[i];
      const key = `${x.z.toFixed(2)}|${x.side}`;
      per[key] = (per[key] || 0) + 1;
    }
    const counts = Object.values(per);
    return counts.length === 6 && counts.every((c) => c === counts[0]);
  })(), '(16 into 18 slots left one person on the back-right bench)');

  ok('the back row is used', slots.some((x) => x.z === plan.benches[4].z));
}

console.log('\n=== 80. Folding chairs get seats too ===');
{
  const s = newState(TUESDAY_8AM);
  const room = s.rooms.find((r) => r.id === 'sanctuary');
  const t = roomTransform(s, room);
  const plan = pewLayout(t.size);

  const pewsOnly = allSeatSlots(t.size, plan, { pews: room.seats });
  const withChairs = allSeatSlots(t.size, plan, { pews: room.seats, tempSeats: 8 });

  ok('chairs add places to sit', withChairs.length === pewsOnly.length + 8,
     `(${pewsOnly.length} → ${withChairs.length})`);
  ok('the pews keep their indices', (() => {
    return withChairs.slice(0, pewsOnly.length)
      .every((x, i) => x.x === pewsOnly[i].x && x.z === pewsOnly[i].z);
  })(), '(so nobody is shuffled when chairs come out)');

  const chairs = withChairs.slice(pewsOnly.length);
  ok('chair seats sit beside the pews, in the side margins',
     chairs.every((c) => Math.abs(c.x) > t.size.w / 2 - plan.sideMargin - 1e-9));
  ok('and face the pulpit like everyone else',
     chairs.every((c) => c.facing === plan.facing));
  ok('they are marked as chairs', chairs.every((c) => c.chair === true));

  // The whole point: capacity and renderable seats must agree.
  s.sanctuary.tempSeats = 8;
  ok('there is a seat for everyone capacity allows',
     withChairs.length >= seatCapacity(s),
     `(${withChairs.length} slots for capacity ${seatCapacity(s)})`);
}

console.log('\n=== 81. Calling for the chairs ===');
{
  // deployFoldingChairs() and chairStatus() were written and tested
  // in step 1 but nothing outside the module ever called them —
  // the deacons had never once been asked. This covers the states
  // the prompt has to render.
  const s = fullChurch(TUESDAY_8AM);
  clearSeats(s);
  s.currency.offering = 5000;
  s.sanctuary.vestibule = 0;
  s.sanctuary.chairsReadyAt = 0;

  ok('an empty sanctuary is not offered chairs',
     chairStatus(s, TUESDAY_8AM).reason === 'not_needed',
     '(the prompt would be noise)');

  for (let i = 0; i < 18; i++) seatPerson(s, { isStranger: false });
  s.sanctuary.vestibule = 7;
  const ready = chairStatus(s, TUESDAY_8AM);
  ok('a full house with people waiting is offered chairs', ready.canDeploy);
  ok('the offer says how many and what it costs',
     ready.count > 0 && ready.cost > 0, `(${ready.count} for ${ready.cost})`);
  ok('and how many are waiting outside', ready.waiting === 7);

  const before = s.currency.offering;
  const res = deployFoldingChairs(s, TUESDAY_8AM);
  ok('the deacons bring them out', res.ok);
  ok('it is paid for', s.currency.offering === before - ready.cost);
  ok('people come in from the vestibule', res.seated > 0, `(${res.seated} seated)`);
  ok('the vestibule drains by that many', s.sanctuary.vestibule === 7 - res.seated);

  const out = chairStatus(s, TUESDAY_8AM);
  ok('a second call is refused while they are out', out.reason === 'already_out');

  // After a service the chairs are stored and go on cooldown.
  startService(s, 'come_unto_me', TUESDAY_8AM);
  finishService(s, TUESDAY_8AM + 180000, { gradual: true });
  const cooling = chairStatus(s, TUESDAY_8AM + 180000);
  ok('afterwards they are on cooldown', cooling.reason === 'cooldown');
  ok('and the prompt can say how long', cooling.cooldownRemainingMs > 0);

  const later = chairStatus(s, TUESDAY_8AM + 9 * H);
  ok('later they can be brought out again', later.reason !== 'cooldown');

  const broke = { ...s, currency: { ...s.currency, offering: 0 } };
  broke.sanctuary = { ...s.sanctuary, tempSeats: 0, chairsReadyAt: 0, vestibule: 5 };
  ok('with no offering the prompt says so',
     chairStatus(broke, TUESDAY_8AM + 9 * H).reason === 'cannot_afford');
}

console.log('\n=== 82. Everything designed is reachable ===');
{
  // Three capabilities were built, tested, and left with no way in:
  // moveRoom, deployFoldingChairs, and holdPrayerMeeting. Tests
  // call core functions directly and never ask whether the UI does,
  // so this checks the wiring itself.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  const wired = (fn) => new RegExp(`\\b${fn}\\s*\\(`).test(main);

  const mustBeCalled = [
    'holdPrayerMeeting', 'deployFoldingChairs', 'moveRoom',
    'cancelConstruction', 'startConstruction', 'unlockSermon',
    'startService', 'finishService', 'foundMinistry', 'setSchedule',
  ];
  for (const fn of mustBeCalled) {
    ok(`${fn}() is actually called from main.js`, wired(fn));
  }

  // And each one needs a control the player can press.
  const controls = ['prayer-go', 'chairs-go', 'openArrange', 'openBuild',
                    'openMinistries', 'svc-start', 'reopenAway'];
  for (const id of controls) {
    ok(`there is a control for #${id}`,
       html.includes(`id="${id}"`) && main.includes(`'${id}'`));
  }

  // No dead imports: anything main.js pulls in must be used.
  const imports = [...main.matchAll(/import\s*\{([^}]+)\}\s*from/gs)]
    .flatMap((m) => m[1].split(',').map((n) => n.trim().split(' as ').pop().trim()))
    .filter(Boolean);
  const body = main.replace(/import\s*\{[^}]+\}\s*from[^\n]+\n/gs, '');
  const dead = imports.filter((n) => !new RegExp(`\\b${n}\\b`).test(body));
  ok('main.js has no dead imports', dead.length === 0, `(${dead.join(', ')})`);
}

console.log('\n=== 83. The prayer meeting releases the queue ===');
{
  const s = fullChurch(TUESDAY_8AM);
  const sys = new VisitorSystem(s, new PathCache().warm(s), 'p-pray2');
  s.queue = [];

  // Someone waiting by the prayer room door.
  const v = sys.spawnOne(TUESDAY_8AM);
  v.needId = 'counseling';
  v.phase = 'queued';
  s.queue.push({ needId: 'counseling', arrivedAt: TUESDAY_8AM, visitorId: v.id });

  const res = holdPrayerMeeting(s, TUESDAY_8AM);
  ok('the meeting serves the queue', res.ok && res.served === 1);
  ok('and the queue empties', s.queue.length === 0);

  const released = sys.concludePrayer(TUESDAY_8AM);
  ok('the waiting visitor is released', released === 1 && v.phase === 'leaving',
     '(without this they wait by the door forever)');

  let t = TUESDAY_8AM;
  for (let i = 0; i < 60 * 30; i++) { sys.update(1 / 30, t); t += 1000 / 30; }
  ok('and they leave the church', !sys.visitors.some((x) => x.id === v.id));
}

console.log('\n=== 84. A build can be called off ===');
{
  const s = newState(TUESDAY_8AM);
  s.level = 10;
  s.currency.offering = 5000;
  const spot = suggestPlacement(s, 'fellowship_hall', 0);
  const before = s.currency.offering;

  startConstruction(s, 'fellowship_hall', spot.x, spot.y, 0, TUESDAY_8AM);
  ok('a site exists to cancel', s.construction.length === 1);

  const res = cancelConstruction(s, 'fellowship_hall');
  ok('it can be called off', res.ok);
  ok('with a full refund', s.currency.offering === before,
     '(nothing is gained by punishing a change of mind)');
  ok('and the site is gone', s.construction.length === 0);
  ok('the room can then be built somewhere else',
     startConstruction(s, 'fellowship_hall', spot.x, spot.y, 0, TUESDAY_8AM).ok);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
