# Except the Lord Build the House

> *"Except the LORD build the house, they labour in vain that build it."* — Psalm 127:1, KJV

A 3D church builder for the Church of the Living God C.W.F.F. Members and strangers
arrive with needs; you build rooms and recruit ministries to meet them. Progress
continues while the app is closed.

**Status:** Build order steps 1–4 complete. Steps 5–11 remain.

---

## Run it

No build step. No `node_modules`. Three.js loads from unpkg via an importmap.

**Deploy:** push the contents of this folder to the root of a GitHub Pages repo and
open the URL. Then surface it in Subsplash as an App Link web view.

**Locally:** it needs a web server (ES modules won't load from `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Tests** (184 assertions, no browser required):

```bash
node test/offline.test.js
```

---

## What works today

- Save, restore, and offline catch-up with a server-authoritative clock
- Ministries, the weekly rhythm (Sabbath / Bible Study / Choir), and their modifiers
- Free placement on a grid, with rotation, validation, and A* pathfinding
- The sanctuary: pews, vestibule overflow, folding chairs, batch prayer meetings
- Casting: congregation demographics by rank, fixed leadership, per-office rules
- A rendered church with a constrained dollhouse camera
- Visitors who arrive, walk, show a need, get served, and leave

## What doesn't exist yet

Build menu and placement UI · level and recognition ladder · the "While You Were
Away" card · named characters · sermon selection · most ministries beyond their
data entries · any audio · Supabase sync is written but never called from `main.js`

---

## Where to change things

**`src/data/` is the entire editable surface.** Payouts, costs, durations,
footprints, scriptures, grid sizes, and demographic weights all live there. You
should not need to open `src/core/` to change how the game plays.

| File | Holds |
|---|---|
| `data/tuning.js` | caps, rates, grid sizes per rank, save timing |
| `data/needs.js` | the five needs and what each is worth |
| `data/rooms.js` | footprints, door positions, build costs, production |
| `data/ministries.js` | the ministry registry and the modifier vocabulary |
| `data/schedule.js` | Sabbath, Bible Study, Choir Rehearsal bonuses |
| `data/casting.js` | congregation ramp, offices, vesture, poly budget |

## Architecture

```
src/core/     rules and state — no rendering, fully testable
src/data/     editable content and tuning
src/sim/      pathfinding and the live visitor loop
src/render/   the only place Three.js is imported
```

`render/layout.js` deliberately has no THREE import, which is why grid-to-world
math is covered by tests that run in plain Node.

---

## Things that will bite you

**Supabase returns HTTP 201 on insert.** `core/save.js` treats 200, 201 and 204 as
success. Never write a raw fetch to Supabase anywhere else.

**Save on `visibilitychange` and `pagehide`, not just a timer.** Subsplash web
views get killed by the OS without warning. This is the single most important
line in the project.

**Bump `CACHE` in `sw.js` on every deploy** or returning players keep the old
build. The module list there is maintained by hand — add a file to `src/` and you
must add it to `sw.js` too. A test checks this, but only if you run it.

**Migrations are forward-only.** Never delete an entry from `MIGRATIONS` in
`core/state.js`. A player returning after eight months needs the whole chain.

**Grid sizes and room footprints are coupled.** A starting grid that can't fit the
first buildable room is a dead start. A test asserts every early room has at least
one legal placement — re-run it whenever a footprint changes.

---

## Next: step 5

Build menu, construction timers, supply production. Most pieces exist already:
`validatePlacement` and `legalPlacements` drive the placement preview, construction
timers already resolve offline, and production lines already run in buckets. It's
mostly UI plus a placement mode on the camera.

Before that, open it on a phone. Four steps of work, no frames seen yet.
