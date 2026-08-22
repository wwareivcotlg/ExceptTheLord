# Except the Lord Build the House
### Design & Architecture Doc — v2

> *"Except the LORD build the house, they labour in vain that build it."* — Psalm 127:1, KJV

**Platform:** Multi-file PWA on GitHub Pages → Subsplash App Link web view
**Renderer:** Three.js r128, stylized low-poly
**Backend:** Supabase (sync + restore only)
**Monetization:** None. Fully free, no ads, no purchases, ever.

---

## 1. Locked Decisions

| Decision | Choice |
|---|---|
| Title | Except the Lord Build the House |
| Build target | Multi-file PWA, GitHub Pages, service worker |
| Art direction | Stylized low-poly |
| Layout | Free placement grid |
| Progression | Single church; Level + COTLG recognition ladder |
| Ministries | Unlockable, data-driven, extensible |
| Weekly rhythm | Sabbath (large), Bible Study & Choir (small), days configurable |
| Named characters | Yes — recurring members and converting strangers |
| Leaderboard | None — non-competitive |
| Real money | None |
| Offline visitors | Auto-served if resource built + available |
| Player identity | Anonymous first, claim after milestone |

---

## 2. Core Loop

1. A member or stranger enters the church.
2. A need appears in a thought bubble above their head.
3. Player routes them to a room that serves that need — or builds/recruits if it doesn't exist.
4. Need is met. Visitor exits blessed. Player earns Offering + Favor + XP.
5. Currency funds rooms, workers, and ministries.
6. Bigger church → more visitors → higher level → new ministries → higher multipliers.

**The tension to protect:** material needs are the idle engine. Spiritual needs are the reason to open the app. Never let auto-serve cover prayer, counseling, or preaching.

---

## 3. The Five Needs

| Need | Room | Worker | Auto-serves offline? |
|---|---|---|---|
| Food / meals | Fellowship Hall + Kitchen | Kitchen Crew | Yes (if stocked) |
| Clothing | Benevolence Closet | Women's Work Volunteer | Yes (if stocked) |
| Baptism | Baptismal Pool | Minister | Yes (if pool built) |
| Prayer & counseling | Prayer Room / Study | Mother or Elder | **No — queues** |
| Hearing the Word | Sanctuary + Pulpit | Preacher | **No — pews fill and hold** |

### 3.1 The Sanctuary Mechanic

The anchor of active play.

- Sanctuary has **seat capacity**, growing with expansion (start: 12 pews).
- Visitors with the *Word* need take a seat and **wait indefinitely**.
- Pews keep filling while the player is away, exempt from the offline cap.
- On return, the player taps the pulpit to **begin service**.
- Service runs 3–8 real minutes, scaling with sermon tier.
- On completion, **every seated visitor is served at once** — largest payout in the game.
- Preacher enters a rest cooldown.

Service payout is where every ministry multiplier lands. This is deliberate: it makes the whole ministry tree feel like it's building toward something rather than trickling passive income.

### 3.2 The Vestibule & Folding Chairs

Word visitors beyond seating capacity **do not leave.** They wait in the vestibule, up to 2× permanent seating. This turns a turned-away count from a loss into a reason to act.

**Folding chairs.** When the pews are full and people are waiting, the deacons and trustees can set out folding chairs along the sides.

- Costs Offering per chair (base 6 chairs, +4 with a Trustee Board)
- **Never deploys automatically.** Setting out chairs is part of gathering, and gathering requires a person. Auto-deploying would spend the player's Offering unasked, burn the cooldown at a moment they didn't choose, and remove the one tactical decision on return.
- Deploying immediately seats people from the vestibule
- Lasts **exactly one service** — chairs are folded away when service ends
- 6-hour cooldown, shortened by the Trustee Board and Men's Ministry
- Cannot be deployed twice for the same service

This is the moment the church visibly strains at its walls, and it's the strongest organic nudge toward expanding the sanctuary.

**The Trustee Board works while you're away** — but by making room *outside*, not inside. It raises vestibule capacity from 2× to 3× seating, so fewer souls are lost on a long absence. No Offering spent, no cooldown burned, and the decision to call for chairs still belongs to the player.

### 3.3 The Batch Prayer Meeting

The counseling queue is generous (24 base) because **one Elder serves the entire queue in a single action.** Later arrivals earn a reduced share — the first ones waited longest — but nobody is left unserved. A long queue should read as a reward waiting to be collected, never as twenty taps of chores.

### 3.4 Sermons

Two independent decisions, both resolved:

**Scripture always shows.** Every service displays a sermon title and KJV passage, regardless of whether the player chose it. This is the most ministry-meaningful surface in the game and it costs zero friction.

**Selection uses a smart default.** The game pre-selects the best-fit sermon and states why ("Mostly strangers today"). One tap accepts. A second tap opens the list to override. Casual players never face a decision; engaged players get one.

What makes the choice real:

- **Audience affinity** — the pews aren't uniform. Evangelistic sermons pay more to a house of strangers; teaching sermons yield more Favor from longtime members; youth-oriented sermons reward a Y.P.P.U.-heavy crowd. The right answer changes every service.
- **Currency steering** — sermons lean Offering, Favor, or XP. The player picks based on what they're saving toward.
- **Length tradeoff** — short sermons pay less but free the pulpit fast; long ones pay more but let arrivals stack unseated. Matters most right before the player puts the phone down.
- **Progression** — sermons unlock with Favor, making the pulpit an investment rather than a static building.

---

## 4. Placement & Layout

Free placement grid, which is more fun and meaningfully more work. Naming the cost up front: **free placement requires visitor pathfinding.** A fixed floorplan wouldn't. Budget for it.

### 4.1 Grid

- Church floor is a tile grid. Footprint expands with recognition rank (start ~10×8).
- Rooms have footprints (Kitchen 3×3, Sanctuary 6×8, Prayer Room 2×3) and rotate in 90° steps.
- Placement validity requires: inside bounds, no overlap, the entrance tile left clear, the room's own approach tile walkable, a path from the entrance to that approach tile, **and** no existing room stranded by the new placement.
- Grid sizes are tuned so the widest early room fits beside the sanctuary with an aisle to spare. A starting grid that can't fit the first buildable room is a dead start — worth re-checking whenever a footprint changes.
- Rooms can be moved later for a small Offering fee. Never charge Favor for rearranging — that punishes creativity.

### 4.2 Pathfinding

Grid-based A* over walkable tiles, recomputed only when the layout changes. Cache paths per (entrance → room) pair; a church has few destinations and many visitors, so caching makes this cheap.

If a placement would strand a room, block it at preview time with a clear reason — never let the player commit a build and then discover it's unreachable.

### 4.3 Interaction

**Screen-space picking, not raycasting.** Project visitor and room positions to 2D and hit-test in screen coordinates. Raycast occlusion in a crowded room on touch causes missed taps, and this game will have overlapping characters in tight spaces.

---

## 5. Progression: Level & Recognition

Two parallel tracks, deliberately separate.

**Level** — earned from XP on every need served. Drives *ministry unlocks*. Steady, frequent, always visible.

**Recognition Rank** — milestone-based, drives *footprint and visitor tiers*. Rare and ceremonial.

1. **Mission** — a storefront room, a handful of chairs
2. **Local Temple** — recognized, named, given a pastor
3. **District Recognition** — district-tier visitors appear
4. **National Convention** — recurring event, special visitors, limited-time needs
5. **Temple Planting** *(optional endgame)* — soft prestige; rebuild with a permanent Favor multiplier

Convention is an **event**, not a second base. No multi-campus management.

---

## 6. Ministries

The extensibility layer. A ministry is an organizational unit — distinct from a room — with a leader, optional member count, and a set of **modifiers**. Some require a room; some don't.

### 6.1 The modifier system

This is the piece that matters architecturally. Every ministry, present or future, is **pure data**. Adding a seasonal ministry should require zero code.

```js
// /src/data/ministries.js  — EDITABLE
{
  id: "creative_arts",
  name: "Creative Arts Ministry",
  parent: null,
  unlock: { level: 12, requires: ["choir"], offering: 15000, favor: 60 },
  leader: { role: "arts_director", favorCost: 40 },
  modifiers: [
    { type: "service_multiplier", value: 0.15 }
  ],
  scripture: "Praise him with the timbrel and dance... — Psalm 150:4",
  season: null,        // or { start: "12-01", end: "12-26" }
  pack: "core"         // content pack tag, for future drops
}
```

**Modifier types** (the full vocabulary — add to this list, not to logic):

| Type | Effect |
|---|---|
| `service_multiplier` | Multiplies sanctuary service payout |
| `visitor_rate` | Increases overall arrivals |
| `visitor_rate_stranger` | Increases stranger arrivals specifically |
| `visitor_tier_unlock` | Makes a new visitor category appear |
| `need_unlock` | Adds a new servable need |
| `production_speed` | Speeds supply lines |
| `favor_gain` | Multiplies Favor earned |
| `queue_capacity` | Expands counseling queue / pew capacity |
| `virtual_reach` | Adds online viewers (see 6.3) |
| `offline_grace` | Extends the offline cap |

### 6.2 Stacking rule

**Additive within a tree, multiplicative across trees.** Creative Arts + Drama + Praise Dance + Praise & Worship sum to a single Creative Arts bonus; that result then multiplies against Music, Outreach, and so on.

Purely multiplicative stacking goes exponential by mid-game and the economy stops meaning anything. Cap total service multiplier at something like 5× and tune toward it.

### 6.3 Launch ministries

| Ministry | Unlock | Effect |
|---|---|---|
| **Choir** | Level 6 | `service_multiplier` — foundational, gates Creative Arts |
| **Y.P.P.U.** | Level 8 | `visitor_tier_unlock`: youth visitors; `favor_gain` |
| **Y.A.M.** | Level 10 | Young adult visitors; boosts Outreach effectiveness |
| **Creative Arts** | Level 12, requires Choir | Parent tree; `service_multiplier` |
| ├ Praise & Worship | Level 14 | `service_multiplier` |
| ├ Praise Dance | Level 16 | `service_multiplier` |
| └ Drama | Level 18 | `service_multiplier`; unlocks special event services |
| **Outreach** | Level 9 | `visitor_rate_stranger` — more strangers through the door |
| **Media / Tech** | Level 15 | `virtual_reach` — online viewers and virtual membership |
| **Men's Ministry** | Level 11 | `production_speed`; construction discounts |
| **Women's Work** | Level 7 | `production_speed` on clothing; `favor_gain` |

### 6.4 Media / Tech and virtual membership

Worth its own note because it interacts with offline progression. Online viewers are a **passive, always-on** stream that doesn't depend on pathfinding, seats, or the player being present. That makes it powerful and easy to break the economy with.

Rules: virtual reach only produces during and shortly after a service, it yields Offering but **very little Favor**, and it's capped as a percentage of in-person service payout (suggest 40%). Thematically right — broadcast extends reach but doesn't replace gathering.

### 6.5 Seasonal and future packs

The `season` and `pack` fields exist so you can drop in Christmas, Easter, Convention, or Anniversary ministries without touching code. A ministry with a `season` window simply doesn't appear in the unlock list outside its dates, and its modifiers stop applying when the window closes. Ministries already built during a season should keep a small permanent residual so seasonal content doesn't feel rented.

---

## 7. The Weekly Rhythm

Three special days. **The non-punitive guarantee: ordinary days are the baseline, not a penalty.** Never show a "1.0×" multiplier on a Tuesday. The UI should say nothing at all on ordinary days, and celebrate on special ones.

### 7.1 The days

**Sabbath — large bonus.** Sunday by default, configurable. Visitor rate up sharply, service payout multiplied substantially, special visitors appear, and the player may hold **multiple services** in one day. This should feel like an event, not a percentage.

**Bible Study — small bonus.** Player picks the day at first launch (default Wednesday). Favor-weighted rather than Offering-weighted; teaching and counseling needs pay more.

**Choir Rehearsal — small bonus.** Player picks the day (default Friday). Rather than paying out directly, rehearsal **buffs the next service's multiplier**. This chains Friday into Sabbath and makes both matter without penalizing a skip.

### 7.2 First-launch configuration

During onboarding, ask two questions: which day is your Bible Study, and which day is choir rehearsal? Store in `state.schedule`. Let it be changed later from settings, with a cooldown (once per in-game month) so it can't be gamed by rotating days.

### 7.3 Missing a special day

Nothing is lost. The sanctuary still filled while away and still holds. The player simply didn't get the multiplier. That's the whole non-punitive design: you can never fall behind, only decline a boost.

Rehearsal buffs should persist until the next service is held rather than expiring at midnight — otherwise a Friday player who can't open the app Sunday morning feels cheated.

---

## 8. Casting & Representation

This game depicts the Church of the Living God C.W.F.F., a historically African-American denomination. Casting is accuracy, not decoration, and both rules below are **enforced in code** (`src/core/casting.js`) rather than left to an artist to remember.

**Rule 1 — The congregation grows more multicultural as the church grows.** A small mission reflects its neighborhood; a national-tier church reflects the reach it has earned. Black members remain the plurality at every stage — reach widens the church, it does not replace it.

| Rank | Black | Latino | White | Asian | Other |
|---|---|---|---|---|---|
| Mission | 94 | 3 | 2 | 0 | 1 |
| Local Temple | 88 | 5 | 4 | 1 | 2 |
| District | 80 | 8 | 6 | 3 | 3 |
| National | 70 | 12 | 9 | 6 | 3 |

Outreach, Media/Tech, and Y.A.M. shift the mix further (capped at 25%), which is thematically exact — the ministries that widen the church's reach visibly change who walks through the door.

**Composition, not model ids.** CC0 character packs are built as a base mesh plus swappable parts, so a person is composed: `base × skinTone × hair × outfit × outfitColor`. Skin tone is applied by tinting the material in Three.js — Quaternius ships tone shaders only in its paid Source tier, and doing our own is cheaper and keeps the ramp data-driven. Hairstyles are restricted by both group and gender; the church hat is women-only, since the crown is a tradition rather than a generic head prop.

**Poly budget.** A Sabbath sanctuary holds 26 with folding chairs out. Quaternius bases average ~13k triangles — roughly 340k for a full house, too heavy for an older phone in a Subsplash web view. Target is ~2.5k per character; Kenney Blocky/Mini are the prototype baseline.

**Clergy vesture is bespoke.** Nothing suitable exists CC0. What's available is Catholic cassocks and fantasy clerics, which would read as the wrong denomination entirely — COTLG dress is tailored suits, robes, and clerical collars. Three models (`pastor_suit`, `bishop_robe`, `chief_bishop_robe`) must be built, and the code flags them via `bespokeAssets()`.

**Rule 2 — Leadership casting is fixed.** Pastors, overseers, bishops, the Vice Chief Bishop, and the Chief Bishop are African-American, true to the current state of COTLG. These roles are **not** sampled from a weighted pool; the code returns a fixed appearance and flags it, so no future tuning of the congregation ramp can accidentally randomize an office.

**Rule 3 — Who may hold each office.** Per COTLG polity, declared as data in `ROLE_GENDER`:

| Office | May be held by |
|---|---|
| Chief Bishop | Men |
| Vice Chief Bishop | Men |
| Bishop | Men |
| Overseer | Men |
| Pastor | Men or women |

A woman pastor wears her own vesture (`pastor_suit_f`), not a man's suit — bringing the bespoke clergy models to four. No office is ever cast in a teen proportion.

Serving roles — kitchen crew, volunteers, ushers, choir, praise dancers, media techs, trustees, deacons — may be multicultural at any stage.

---

## 9. Named Characters

Cheap to add, disproportionate for warmth. A small roster of recurring figures with their own arrival patterns and dialogue lines.

- **Mother Hayes** — visits weekly, always brings Favor, occasionally a word of encouragement
- **Deacon Pruitt** — reliable, low-need, quietly boosts nearby workers
- **A stranger with no name** — appears repeatedly with different needs; after enough services, is baptized and becomes a named member

Store as data in `/src/data/characters.js` with arrival rules, dialogue pools, and a small state machine for conversion arcs. The conversion arc is the emotional payoff of the whole game — give it a real moment on screen.

---

## 10. Currencies

| Currency | Earned from | Spent on |
|---|---|---|
| **Offering** | Serving any need | Rooms, furniture, expansions, moving |
| **Favor** | Spiritual needs only | Workers, ministries, sermon tiers, rank advancement |
| **Supplies** | Production timers | Consumed by food & clothing services |
| **XP** | Every need served | Level (not spendable) |

Favor being spiritual-only is what keeps the theme honest: you cannot buy your way up the ladder on material service alone.

---

## 11. Data Architecture

### 10.1 Schema shape

Use a **single JSONB blob per player**, not normalized tables. With no leaderboard and no server-side validation, normalization buys nothing and costs multiple round trips on a mobile connection.

```sql
create table player_saves (
  player_id      uuid primary key default gen_random_uuid(),
  state          jsonb not null,
  save_version   integer not null default 1,
  save_counter   bigint  not null default 0,
  claim_method   text,              -- null | 'email' | 'pin'
  claim_email    text unique,
  claim_name     text,
  claim_pin_hash text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create index on player_saves (claim_name);

-- Server-authoritative clock. Never trust the device.
create or replace function server_time()
returns timestamptz language sql stable as $$ select now() $$;
```

### 10.2 The `state` blob

```js
{
  v: 1,
  lastSavedAt: 1755820000000,
  level: 14, xp: 8820,
  rank: "local_temple",
  schedule: { sabbath: 0, bibleStudy: 3, choir: 5 },   // 0=Sun
  currency: { offering: 4210, favor: 88, supplies: { food: 30, clothing: 12 } },
  grid: { w: 14, h: 12 },
  rooms: [
    { id: "sanctuary", x: 4, y: 2, rot: 0, level: 1, seats: 12 },
    { id: "fellowship_hall", x: 1, y: 8, rot: 90, level: 2 }
  ],
  ministries: [
    { id: "choir", startedAt: 1755000000000, members: 14 },
    { id: "creative_arts", startedAt: 1755600000000, members: 6 },
    { id: "praise_dance", startedAt: 1755700000000, members: 4 }
  ],
  buffs: [ { id: "choir_rehearsal", value: 0.2, consumeOnService: true } ],
  construction: [ { roomId: "baptismal_pool", startedAt: 1755819000000, durationS: 7200 } ],
  production:   [ { line: "kitchen", startedAt: 1755819500000, durationS: 900, yield: 10 } ],
  workers:      [ { id: "preacher_01", role: "preacher", restUntil: 1755820600000 } ],
  sanctuary: { seated: 9, seatedSince: [] },
  queue: [ { needId: "counseling", arrivedAt: 1755818000000, visitorSeed: 44812 } ],
  characters: { stranger_arc: { visits: 5, converted: false } },
  stats: { totalServed: 1204, servicesHeld: 61 }
}
```

### 10.3 Local layer

`localStorage` is the source of truth **during a session**. Supabase is the sync target.

- Read local on boot; if absent, pull from Supabase.
- If both exist, take the higher `save_counter`.
- Write local on every state change.
- Push to Supabase debounced ~5s, **and unconditionally on `visibilitychange` and `pagehide`**.

That last point matters more than anything else in this document. Subsplash web views get killed by the OS without warning. Save on a timer alone and players will lose progress you can never reproduce.

### 10.4 The 201 rule

Supabase inserts return **HTTP 201 on success**. Treat 201 as success. Put it in a shared `supabaseWrite()` helper once and never write a raw fetch again.

### 10.5 Schema versioning

```js
const MIGRATIONS = {
  1: (s) => s,
  2: (s) => ({ ...s, ministries: s.ministries ?? [] }),
};

function migrate(state) {
  let s = state;
  while (s.v < CURRENT_VERSION) { s = MIGRATIONS[s.v + 1](s); s.v += 1; }
  return s;
}
```

Forward-only, never remove an old migration. A player returning after eight months needs the whole chain.

---

## 12. Time & Offline Progression

### 11.1 Server time

```js
let clockOffset = 0;
async function syncClock() {
  const t0 = Date.now();
  const serverMs = await rpc("server_time");
  const rtt = Date.now() - t0;
  clockOffset = serverMs + rtt / 2 - Date.now();
}
const serverNow = () => Date.now() + clockOffset;
```

If the RPC fails on an offline launch, fall back to device time and flag the session for reconciliation on next sync. Never let a failed clock sync block play.

### 11.2 Deterministic visitors

```js
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(hash(playerId) ^ bucketIndex);
```

Same absence, recomputed twice, yields the same result.

### 11.3 Offline catch-up

**Process in chronological buckets, not in aggregate.** Total production minus total consumption gives wrong answers — a kitchen that runs dry at hour 3 can't serve at hour 4 even if it restocks at hour 6.

```
OFFLINE_CAP = 10 hours
BUCKET      = 5 minutes

resolveOffline(state, serverNow):
  elapsed = min(serverNow - state.lastSavedAt, OFFLINE_CAP)
  buckets = floor(elapsed / BUCKET)
  summary = { served:{}, offering:0, favor:0, queued:0, turnedAway:0 }

  for i in 0..buckets-1:
      t   = state.lastSavedAt + i * BUCKET
      rng = mulberry32(hash(playerId) ^ i)
      mods = resolveModifiers(state, dayOfWeek(t))   // ministries + weekly rhythm

      1. Complete construction where startedAt + durationS <= t
      2. Complete production; add supplies, respect storage cap
      3. Generate visitors for this bucket (rate × mods.visitor_rate)
      4. For each visitor:
           if auto-servable and room exists and supplies available:
                consume supply, add offering, summary.served[need]++
           else if player-required:
                seat or enqueue if capacity, else summary.turnedAway++
           else:
                summary.turnedAway++      // room not built
  return summary
```

Note step 4's `mods` is resolved **per bucket**, using that bucket's day of week — so an absence spanning Saturday into Sunday correctly picks up the Sabbath rate.

Then show a **"While You Were Away"** card: souls served, Offering earned, how many wait in the sanctuary, and anything turned away. Turned-away counts are your best organic nudge to build the missing room — no notification spam required.

### 11.4 The cap

Ten hours default. Long enough that overnight pays off, short enough that returning has a point. With no monetization you can be generous — the cap exists for pacing and to bound catch-up computation, nothing else.

**Exempt from the cap:** sanctuary seating, and choir rehearsal buffs.

---

## 13. Project Structure

```
/except-the-lord
  index.html
  manifest.json
  sw.js                    ← service worker: cache shell + assets
  /src
    main.js
    /core
      state.js             ← state shape, migrations
      save.js              ← local + Supabase sync, the 201 helper
      time.js              ← serverNow, offline resolver
      rng.js
      modifiers.js         ← resolves ministries + weekly rhythm into one set
    /sim
      visitors.js
      production.js
      construction.js
      pathfinding.js       ← grid A*, cached per destination
    /render
      scene.js
      church.js            ← grid, room meshes, placement preview
      characters.js        ← low-poly visitors, thought bubbles
      picking.js           ← screen-space hit detection
    /ui
      hud.js, build-menu.js, ministry-panel.js, away-card.js, onboarding.js
    /data
      needs.js             ← EDITABLE
      rooms.js             ← EDITABLE: footprints, costs, durations
      workers.js           ← EDITABLE
      ministries.js        ← EDITABLE: the registry, incl. seasonal packs
      ranks.js             ← EDITABLE
      characters.js        ← EDITABLE: named figures, dialogue, arcs
      casting.js           ← EDITABLE: congregation ramp; FIXED leadership
      sermons.js           ← EDITABLE: titles, KJV passages, affinities, payouts
      schedule.js          ← EDITABLE: weekly rhythm bonuses
      scripture.js         ← EDITABLE: KJV verses per need/milestone
      tuning.js            ← EDITABLE: caps, rates, curves
  /assets
    /models                ← .glb, lazy-loaded per room
    /textures
```

Everything a non-programmer would change lives in `/src/data`. No tuning constant, payout, verse, or cost should ever appear inline in a logic file.

---

## 14. Palette & Identity

- COTLG Purple `#3C3489` — primary UI, headers, rank badges
- COTLG Gold `#B87A00` — currency, highlights, service completion
- Warm neutral wood and stone for the interior

Low-poly asset sources: Quaternius (CC0 rigged characters), Kenney.nl (CC0 props and furniture). Both permit commercial use without attribution, though attributing them anyway is the right thing to do.

**Live footfall differs from offline accrual.** The base rate (12/hr) governs what accumulates while away. Presence multiplies it 20×, because at 12/hr a watching player sees one person every five minutes and the church reads as abandoned. An hour of active play lands near a full offline cycle — presence rewarded, absence not punished.

**The tap is a bonus, never a requirement.** Tapping a waiting visitor serves them instantly for +25%. Left alone, material needs auto-serve after 3.5 seconds anyway. This is what keeps an absence harmless while still giving active play something to do.

**Camera.** A constrained dollhouse rig, deliberately not OrbitControls: pitch stays in a narrow band so you always look down into the church, and the target is clamped to the grid so the building can never be lost off-screen. One finger pans, two fingers pinch to zoom and twist to turn.

**Gold is reserved.** It appears only at doors, the entrance threshold, and the pulpit facing. If gold spreads to general UI accents, the sanctuary stops being where the eye goes.

Audio: WebAudio synth for UI and stingers. The one place a real asset earns its size is the sanctuary — a short organ or hymn chord on service completion.

---

## 15. Open Questions

1. **Ministry members.** Are member counts decorative, or do they need recruiting and cost upkeep? Upkeep adds management burden — probably decorative for v1.
2. **Convention format.** Weekly, monthly, or tied to rank? And does it happen at the player's church or take them somewhere?
3. **Failure state.** Is there any? Right now a player can never lose — only grow slower. That may be exactly right for this audience.
4. **Grid expansion pacing.** How much footprint per rank? Too much at once and the church feels empty; too little and free placement stops feeling free.

---

## 16. Build Order

1. ~~**Save/restore + clock sync + offline resolver — headless, no rendering.**~~ **Done.** `core/save.js`, `core/time.js`, `core/offline.js`.
2. ~~Grid, placement, and pathfinding — still mostly headless, validated with a 2D debug view.~~ **Done.** `core/grid.js`, `sim/pathfinding.js`, ASCII floor plan via `asciiMap()`.
3. ~~Static low-poly church interior, one room, camera controls.~~ **Done.** PWA shell, `render/scene.js`, `render/camera.js`, `render/church.js`, `render/layout.js`, `render/palette.js`. All geometry procedural — no `.glb` dependency yet.
4. ~~One need end to end: visitor spawns → walks → bubble → tap → serve → payout.~~ **Done.** `sim/visitors.js`, `core/serve.js`, `render/characters.js`, `render/bubble.js`, `render/crowd.js`, `render/picking.js`.
5. Build menu + construction timers + supply production.
6. Sanctuary and the service mechanic.
7. Modifier system + first three ministries.
8. Weekly rhythm + onboarding day selection.
9. Level, recognition ladder, "While You Were Away" card.
10. Named characters and the conversion arc.
11. Remaining ministries, seasonal pack scaffolding, polish.

Steps 1 and 2 first are non-negotiable. Every persistent-world game built rendering-first ends up retrofitting the save system, and the retrofit is always worse than doing it cold.
