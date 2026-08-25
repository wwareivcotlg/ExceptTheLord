# Where the Kenney models go

Everything below is optional. If the folder is missing, or a file fails to load,
every piece falls back to the procedural rounded geometry automatically. A church
rendered as boxes is far better than one rendered as nothing.

## Folder layout

Alongside `index.html`, at the root of wherever you deploy:

```
index.html
sw.js
src/
assets/
  models/
    furniture/          ← Kenney Furniture Kit, GLTF format, .glb files
      bench.glb
      benchCushion.glb
      bookcaseClosed.glb
      ...
    characters/         ← Kenney Blocky Characters
      character-a.glb
      Textures/
        texture-a.png   ← optional; see below
```

**Characters keep their folder structure.** Unlike the furniture, the character
`.glb` references its texture externally as `Textures/texture-a.png`. We do not
use that texture, so the folder is optional — but if you keep it, keep it nested.

Use the **GLTF format** folder from the Kenney download and copy the `.glb`
files. They are self-contained binaries — no textures or `.bin` files to keep
alongside them.

## Adding a new piece

Two edits, both in data files:

1. **`src/data/models.js`** — add the model:

```js
tableRound: {
  file: 'tableRound.glb',
  scale: 2.0,                       // Kenney's unit is ~0.4; a tile here is 1.0
  materials: { wood: 'pewWood' },   // recolour by material NAME
},
```

2. Then map a furniture piece to it in the same file:

```js
export const PIECE_MODELS = {
  shelves: 'bookcaseClosed',
  table_a: 'tableRound',
};
```

The piece ids come from `src/data/furniture.js`.

## What these files actually are

Probed rather than assumed, because these details decide whether a model lands
correctly:

- **No textures.** Materials are named (`wood`, `carpet`) with a base colour, so
  they recolour cleanly into the COTLG palette. Map names in `MATERIAL_COLORS`.
- **Origin at the base, corner-anchored.** x runs 0→w, z runs −d→0. The loader
  recentres in x and z and keeps the base on the floor.
- **Kenney's unit is roughly 0.4** where a floor tile here is 1.0, so most pieces
  want about `scale: 2.0`.
- **Tiny.** 170–372 triangles, 7–40 KB per file.

## Measurements that matter

`bench.glb` is 0.40 × 0.47 × 0.20 with its seat surface at y 0.24. At `scale: 2.0`
that gives a 0.80-wide bench with a 0.48 seat — two side by side span 1.60, which
is almost exactly one pew bench (1.63). That is why the pews can eventually be
swapped for real benches without redoing the seating maths.

## What we take from the characters

Not the meshes. Every Kenney body part is a **12-triangle cube** — the blocky look
lives entirely in the texture, and our procedural figures already have rounded
torsos, shaped hair, shoes and hands.

What the file has that cannot be hand-rolled is **27 clips of real animation**,
authored as plain rotation tracks on named nodes:

```
root → leg-left, leg-right, torso → arm-left, arm-right, head
```

Nothing is skinned. So our figures use those exact names, the same nesting, and
the same joint pivots — and the clips play on our geometry. Only one character
file is needed; the other seventeen differ only by texture.

Sitting stays hand-written. The `sit` clip lands wherever its own rig puts it, and
a person has to meet an actual pew at an actual height.

## Still to do

The pews and folding chairs are still procedural. Swapping them in means moving
`SEAT_TOP_Y` from 0.58 to the model's measured 0.48, which touches the seating
maths, so it wants doing with the game open in front of us rather than blind.

Characters are the bigger visual win and are not wired up at all yet.
