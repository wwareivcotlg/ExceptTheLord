# Except the Lord Build the House

> *"Except the LORD build the house, they labour in vain that build it."* — Psalm 127:1, KJV

A 3D church builder for the Church of the Living God C.W.F.F. Members and strangers
arrive with needs; you build rooms and recruit ministries to meet them. Progress
continues while the app is closed.

**Status:** Build order steps 1–9 complete. Steps 10–11 remain.

---

## Run it

No build step. No `node_modules`. Three.js loads from unpkg via an importmap.

**Deploy:** push the *contents* of this folder to the root of a GitHub Pages repo
and open the URL — `index.html` must sit at the top level. Then surface it in
Subsplash as an App Link web view.

**Locally:** it needs a web server (ES modules won't load from `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Tests** (399 assertions, no browser required):

```bash
node test/offline.test.js
```

---

## What works today

- Save, restore, and offline catch-up with a server-authoritative clock
- Ministries, the weekly rhythm (Sabbath / Bible Study / Choir), and their modifiers
- Free placement on a grid, with rotation, validation, and A* pathfinding
- The sanctuary: pews facing the pulpit, vestibule overflow, folding chairs,
  batch prayer meetings
- Casting: congregation demographics by rank, fixed leadership, per-office rules
- A rendered church with a constrained dollhouse camera
- Visitors who arrive, walk, show a need, get served, and leave
- Seated visitors who actually sit in the pews, facing the pulpit
- A build menu, drag-to-place ghost with live validation, construction
  timers with progress bars, room moving, and supply production
- The sanctuary service: sermon library bought with Favor, a smart default
  that reads who is actually in the pews, and one payout for everyone at once
- Levels from XP, the recognition ladder, and a floor that grows with rank
- A ministry panel: found ministries, see their effects in plain words
- The weekly rhythm — Sabbath, Bible Study, Choir Rehearsal — with first-run
  day selection, and rehearsals that happen whether or not anyone is watching
- A While You Were Away card, reopenable from the HUD, backed by a five-entry
  ledger that gives the numbers context ("your busiest stretch this week")

## What doesn't exist yet

Named characters and the conversion arc · seasonal ministry packs · convention
events · any audio · Supabase sync is written but never called from `main.js`

---

## Where to change things

**`src/data/` is the entire editable surface.** Payouts, costs, durations,
footprints, scriptures, grid sizes, control feel, and demographic weights all live
there. You should not need to open `src/core/` to change how the game plays.

| File | Holds |
|---|---|
| `data/tuning.js` | caps, rates, grid sizes per rank, save timing |
| `data/needs.js` | the five needs and what each is worth |
| `data/rooms.js` | footprints, door positions, build costs, production |
| `data/ministries.js` | the ministry registry and the modifier vocabulary |
| `data/schedule.js` | Sabbath, Bible Study, Choir Rehearsal bonuses |
| `data/casting.js` | congregation ramp, offices, vesture, poly budget |
| `data/sermons.js` | sermon titles, KJV passages, affinities, payouts |
| `data/ranks.js` | the recognition ladder and the XP curve |

Away-card copy lives with the needs: each need carries `served` and `seeking`
strings.
| `data/controls.js` | camera and tap feel — pan/zoom/rotate inversion, damping |

### If the camera feels wrong

Open `src/data/controls.js`. Every feel-related number is there, including five
invert flags. `PAN_INVERT` is the one people notice: `true` moves the view with
your finger, `false` drags the floor under it.

## Architecture

```
src/core/     rules and state — no rendering, fully testable
src/data/     editable content and tuning
src/sim/      pathfinding and the live visitor loop
src/render/   the only place Three.js is imported
```

`render/layout.js` deliberately has no THREE import, which is why grid-to-world
math and pew orientation are covered by tests that run in plain Node.

---

## Things that will bite you

**Supabase returns HTTP 201 on insert.** `core/save.js` treats 200, 201 and 204 as
success. Never write a raw fetch to Supabase anywhere else.

**Save on `visibilitychange` and `pagehide`, not just a timer.** Subsplash web
views get killed by the OS without warning. This is the single most important
line in the project.

**Bump `BUILD` in `sw.js` AND in `src/data/controls.js` on every deploy.** The
value from `controls.js` is shown in the HUD, so you can always confirm which
build the browser is actually running. The module list in `sw.js` is maintained by
hand — add a file to `src/` and you must add it there too. A test checks this, but
only if you run it.

**If a code change doesn't seem to take effect,** it's the service worker. App
code is now served network-first so a redeploy shows up on the next load, but if
you're upgrading from an older build the OLD worker is still in control. Clear it
once: DevTools → Application → Service Workers → Unregister, then hard-reload. On
a phone, close every tab of the site and reopen it.

**Migrations are forward-only.** Never delete an entry from `MIGRATIONS` in
`core/state.js`. A player returning after eight months needs the whole chain.

**Grid sizes and room footprints are coupled.** A starting grid that can't fit the
first buildable room is a dead start. A test asserts every early room has at least
one legal placement — re-run it whenever a footprint changes.

**Orientation is load-bearing, twice.** `pewLayout()` returns `chancelZ` and a
`backZ` per bench; `chancelLayout()` returns the pulpit's decorated face and where
the preacher stands. Get either backwards and the congregation faces the wall or
the gold ends up on the back of the podium. Tests enforce both.

**Pew orientation detail.** `pewLayout()` returns `chancelZ` and a
`backZ` per bench; the backrest must be farther from the chancel than the seat, or
the whole congregation faces the back wall. A test enforces this.

---

**Sermons are ranked per minute, not per service.** Rank on total payout and the
longest sermon wins every room — its multiplier swamps every affinity difference
and the choice collapses into a tap. A test asserts no single sermon wins every
congregation once the library is full.

**The grid only ever grows, and rooms keep their coordinates.** That is what makes
rank expansion safe — nothing can be stranded by it. The entrance re-seats on the
new front wall, walking along the row if a room already stands there.

**An unmet need is described as a need, never a loss.** The away card says "5 came
seeking baptism", not "5 turned away". Same number, same nudge to build the pool,
but it describes people arriving rather than the player failing. A test asserts no
word in the card reads as a penalty.

**`todayEvent()` returns null on ordinary days.** Not a neutral object, not a
"1.0x" — null, so "show nothing on a Tuesday" is the path of least resistance for
every caller. A player must never see a number implying they are penalised for the
day of the week. Test 53 states the whole non-punitive promise: an absent player
still gathers a congregation, still earns, and loses nothing.

**Rank requires evidence of ministry, not just level.** Every rank needs services
held (and later, souls served) alongside a level, so you cannot buy your way up on
material service alone.

## Next: step 10

Named characters and the conversion arc — Mother Hayes, Deacon Pruitt, and the
stranger who becomes a member. `data/characters.js` does not exist yet; the
casting system it will build on does.

## Open questions

Convention format · whether there is any failure state · whether ministry members
need recruiting · how fast the grid should grow past Mission
