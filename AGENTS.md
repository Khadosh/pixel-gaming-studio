# AGENTS.md — Pixel Gaming Studio

> This file provides project context for AI coding assistants. `CLAUDE.md` is a symlink to it.
> Last verified against the code: 2026-10-07. If you find a discrepancy, fix this file in the same change.

## Project Overview

Pixel Gaming Studio is an **asset engine for games**: 149 commands on one asset model, reachable as a CLI (`bin/pgs`), as an MCP server (`bin/pgs-mcp`) and as a browser editor. Most of the work happens headless, in `src/headless/` — see "Headless: CLI and MCP" below, which is the biggest section of this file for a reason. The app is the hand pass: open what the engine made, retouch it, save it back. `README.md` is the short version; `docs/auditoria/` is where PGS stands today.

The app is a browser pixel art editor with AI-assisted sprite and animation generation: create, animate and export pixel art sprites (16, 32, 64 or 128 px) with a layer system, multi-frame timeline, anatomy-driven procedural animations, and persistent cloud storage.

### The old name, and what keeps it on purpose

It was **Pixel Sprite Studio (`pss`)** until 6 October 2026, when Joaquín renamed
it: this is an engine that makes the assets of a game, not a sprite editor. The
rename was deliberately **not** carried everywhere, so do not "finish" it:

- **`bin/pss` and `bin/pss-mcp` stay as aliases** that delegate to `bin/pgs` and
  `bin/pgs-mcp`. A second repo, on hold, invokes the binary by the old name and
  must not be touched to start working again. They print one notice on stderr
  (once a day, `PGS_ALIAS_QUIET=1` to silence it) and leave stdout untouched.
- **The MCP tools are `pgs_*` and the old `pss_*` names are still accepted but
  not listed** (`src/headless/mcpnames.ts`): a `tools/call` for `pss_x` is
  rewritten to `pgs_x` on the way in. Registering both names would put two
  entries per command in the catalog, and that catalog is the per-session cost
  the audit says to bring down — so the alias is a rewrite, never a second tool.
- **The `.pss.json` extension of the asset files does not change.** There are
  over a thousand of them in the game repo and the rename buys nothing.
- **`meta.app` of the Aseprite-style JSON that `export_sheet` writes still says
  `pixel-sprite-studio`** (`src/headless/sheet.ts`), for the same reason: it is
  stamped on hundreds of already-exported files in the game repo and nothing
  reads it.
- **The game's `art/pss/` folders, its `.mcp.json` and its scripts keep the old
  name.** The game repo is not ours to rewrite; the aliases are what keep it
  running.
- **History keeps the name it was written with**: the old `CHANGELOG.md`
  entries, `ROADMAP_COMPLETED.md`, `AUDIT.md`, `AUDIT_TECNICA.md` and the four
  audits in `docs/auditoria/` (including the file named `c_pss_hoy.md`). The
  audit's README carries a note saying the rename happened.
- The local folder of this repo is still `pixel-sprite-studio`; the GitHub repo
  is `pixel-gaming-studio` and GitHub redirects the old URL.

Key capabilities of the app:
- Pixel-by-pixel canvas editor (brush, eraser, fill, shapes, selection with move/rotate/resize, symmetry, onion skin, zoom & pan)
- Layer system with visibility, lock, and opacity
- Multi-frame animation timeline with drag-and-drop reordering, per-animation FPS
- Anatomy engine: mark pixels per body part and generate procedural animations (idle, walk, run, jump) and FX
- AI generation through Supabase Edge Functions: sprites and perspectives via **fal.ai**, animation frames via **Gemini**
- Image and GIF import (with palette quantization), props library (weapons, accessories as layers)
- PNG sprite sheet, single-layer PNG, and GIF export
- Authentication and cloud persistence via Supabase, with compressed local snapshots

## Tech Stack

- **React 18** + **TypeScript** (non-strict — `strict: false` in tsconfig)
- **Vite 5** with SWC plugin (dev server on port **8080**)
- **Tailwind CSS 3** + **shadcn/ui** (Radix primitives in `src/components/ui/`, generated code)
- **Zustand** for editor state (store split into slices), **TanStack Query v5** for server state
- **React Router 6**
- **Supabase**: Auth, Postgres (JSONB storage, RLS), Edge Functions (Deno)
- **fal.ai** (`fal-ai/flux/schnell`, `fal-ai/bytedance/seedream/v4/edit`) and **Google Gemini** (`gemini-2.5-pro`), called only from Edge Functions
- **dnd-kit** (timeline and layers), **omggif** (GIF encoding), **file-saver**
- **Vitest** + Testing Library for unit tests (`src/test/setup.ts`), Deno test for Edge Function helpers
- Package manager: **npm** (`package-lock.json` is the only lockfile)
- Path alias: `@/` maps to `src/`

## Key Files

| File | Purpose |
|:---|:---|
| `src/lib/types.ts` | Core types: `Frame`, `SpriteLayer`, `AnimationDef`, `SpriteAsset` |
| `src/lib/supabase.ts` | **The only Supabase client** (typed with `Database`). Exports `Project`, `ProjectSprite`, `ProjectConfig`, `toJson`/`fromJson` |
| `src/integrations/supabase/types.ts` | DB schema types. Regenerate with `supabase gen types typescript --local` and re-apply the hand-written header |
| `src/lib/layerUtils.ts` | Layer compositing: `compositeFrame`, `upscale2x`, `ensureLayerSupport` |
| `src/lib/spriteDto.ts`, `src/lib/storageCompression.ts` | RLE + delta serialization of assets for DB and localStorage |
| `src/lib/sprite/` | Anatomy engine: `anatomy.ts`, `anatomyResolver.ts`, `anatomyTransforms.ts`, `generators/` (Fluent Builder for walk, run, jump, idle) |
| `src/lib/spriteAnimations.ts`, `src/lib/spriteTransforms.ts` | Procedural animation helpers and pixel transforms |
| `src/lib/aiFunctions.ts` | `invokeAiFunction`: the single way to call an Edge Function (requires a session) |
| `src/lib/authErrors.ts` | `isAuthError` used by the global query/mutation error handlers |
| `src/lib/assets/` | Pre-loaded catalog (`ASSET_CATALOG`), `PALETTE_LIBRARY`, `PROP_LIBRARY` |
| `src/pages/SpriteStudio.tsx` | **The editor page** (`/project/:projectSlug/editor/:spriteSlug`). Creates the store and renders `EditorLayout` |
| `src/pages/ProjectWorkspace.tsx` | Project page: sprite list, AI creator wizard, navigation to the editor |
| `src/pages/TextDrawing.tsx` | `/dibujo`: opens a text drawing (`from_ascii` format) in the editor and saves it back to the same `.txt`. No backend. A drawing with `generated_by:` or `base: protected` is **not** written back: GUARDAR writes `<drawing>.retoque.txt`, the layer on top (pick the drawing and its `.retoque.txt` together to keep a retouch already started; a protected base opened alone asks for it, and the first save of a session reads the file it is going to before writing and keeps a retouch found there under what was painted now, #37). A strip **PINTA EN** (`PaintAcrossControl`, `src/lib/paintAcross.ts`) sends each stroke to the frame, its whole view or every frame (#43); a protected base opens on the view. What the editor shows is what the drawing ends up being: an erased pixel goes to the layer as `!`, and the save says how much of the drawing the layer decides |
| `src/lib/textDrawing.ts`, `src/lib/textFileAccess.ts` | Text drawing ↔ editor asset (session keeps glyphs, `generated_by:`, the base pixels as opened; `warnings` for what the text cannot hold) and local file open/save (File System Access API, else input + download; `pickTextFiles` takes a drawing plus its retouch) |
| `art/iconos/*.txt` | **The app's own icons, as PGS drawings** (one per icon, `from_ascii` format). The source of truth: see "The icons are drawings" below |
| `scripts/gen-icons.ts` | `npm run icons`: those drawings → `src/lib/icons/generated.ts`. `scripts/icons-contact.ts` (`npm run icons:hoja`) writes their contact sheet |
| `src/components/icons/PixelIcon.tsx` | The 63 icon components (`PxTrash`, `PxEye`, …). No pixels in it: one line per icon, pointing at its grid |
| `src/pages/IconPreview.tsx` | Localhost-only tool that edits the app's pixel icons using `SpriteEditorModal` |
| `src/components/SpriteEditor/SpriteEditor.tsx` | Modal wrapper around `EditorLayout`. Only used by `IconPreview` |
| `src/components/SpriteEditor/store/useSpriteEditorStore.ts` | Store factory: composes the slices, persists a hashed snapshot to localStorage |
| `src/components/SpriteEditor/store/slices/` | `base`, `layer`, `frame`, `animation`, `palette`, `transform`, `export`, `history`, `anatomy` |
| `src/components/SpriteEditor/store/derived.ts` | Selectors: `selectActiveLayer`, `selectVisibleFramesIndices`, `selectFilteredPalette`, onion skin |
| `src/components/SpriteEditor/context/SpriteEditorContext.tsx` | Provider + `useSpriteEditorStore` / `useSpriteEditorStoreApi` / `useOptionalSpriteEditorStoreApi` |
| `src/components/SpriteEditor/hooks/` | Bridges between the store and AI hooks: `useAnimationGeneration`, `usePerspectiveGeneration`, `useEditorEffects` |
| `src/components/SpriteEditor/components/EditorLayout.tsx` | Editor shell: canvas, sidebar, timeline, preview |
| `src/components/SpriteEditor/components/EditorHeader.tsx` | **Single header** for both the Studio page and the modal (`variant`, `backTo`, `syncStatus` props) |
| `src/components/SpriteEditor/components/ExportMenu.tsx`, `ImportButton.tsx` | Shared export dropdown and import button. Add new export options here only |
| `src/components/SpriteEditor/components/` | Panels: LayersList, PaletteSection, AnimationLibrary, Timeline, AnatomyPanel, ProceduralAnimPanel, HistoryPanel, GifImportWizard, ImportImageModal |
| `src/components/SpritePixelEditor.tsx`, `src/hooks/usePixelEditor.ts` | Canvas rendering and drawing input |
| `src/hooks/useProjectQueries.ts` | TanStack Query hooks for projects and sprites (list select excludes `versions`) |
| `src/hooks/useAuth.tsx` | Supabase auth context |
| `src/hooks/useGenerateSpriteFal.ts`, `useGeneratePerspectiveAI.ts`, `useGenerateAnimation.ts` | AI hooks, one per Edge Function |
| `src/App.tsx` | Routes, `QueryClient` with global 401 handling |
| `supabase/functions/_shared/` | `auth` (`requireUser`), `usage` (`consumeQuota`), `validate`, `cors`, `http`, `llm` (`fetchWithTimeout`, JSON parsing) |
| `supabase/functions/generate-sprite-fal`, `generate-perspective-fal`, `generate-animation` | The three Edge Functions |
| `supabase/migrations/` | Schema. `increment_ai_usage` RPC enforces the daily AI quota atomically |
| `src/components/ui/` | shadcn/ui components — do NOT edit manually, use the shadcn CLI |

## Headless: CLI and MCP (no browser)

`src/headless/` drives the same asset JSON without React, Zustand or Supabase, so
an agent (or a script) can produce art for a game:

- `bin/pgs <command> '<json>'` or `bin/pgs <command> key=value …`; `bin/pgs help`.
- `bin/pgs-mcp` is an MCP server over stdio exposing every command as `pgs_<command>`
  (a game repo points its `.mcp.json` at it). `render` returns the PNG as an image.
- Commands: `batch` (a whole recipe of commands as one transaction: see "A recipe as a transaction" below),
  `new`, `info`, `ascii`, `render`, `import_sheet` (grid cut, exact colors; `into` appends to an existing asset),
  `import_character` (a pack folder → one asset with directional tags; layouts in `src/headless/character.ts`),
  `export_sheet` (1:1 PNG + Aseprite-style JSON with frameTags and durations; `layer` exports one layer, `indexed` an index sheet with `meta.ramp`), `draw`,
  `fx`, `fx_anim`, `palette` (set/add/names/map), `palette_fit` (nearest colors of a target palette),
  `palette_show`, `png_fit` (recolor a whole PNG to a palette, layout untouched), `png_knockout` (drop a background color connected to region edges), `remap`, `frames`, `anim`, `animate` (anatomy-engine generators from one pose), `anatomy`,
  `stamp` (a directional drawing over every frame of a character), `face_points` (the eyes, the hairline and the skin, frame by frame),
  `voxel` (boxes with materials → isometric 2:1 pixel art: one tone per face, a one-pixel contour, a line where one thing stands in front of another; a room too: tiled floor, walls, `shadows` and `clear` glass, `layers` on one canvas plus `<out>.lugar.json` with the projection origin, `only=` one layer; boxes at negative `at` and a `pivot`, so a figure stands on its foot at the origin, `rotate` turning the whole model about it; `frames=[…]`, the frames of an animation on one canvas as one asset and a PNG strip; `box.paint`, a text drawing (or a grid of colors) on a face of a box, one unit per pixel, in the light of its face and turning with it (on a top, an edge along a world diagonal comes out straight, not as a comb; `shadeRows`/`shadePixels`/`shadeDraw`, the same drawing in its colors in shadow; `upright` on a side, the drawing as it shows on screen, straight on whatever side the box turns it to); `base` + `changes`, a model that is another one but for some changes by box `id` or `group` (remove, replace in place, add, move, turn a group a quarter about x, y or z through a point: a pose from a pose, `deriveModel`); `src/headless/voxel.ts`, pure, the command reads the drawings and picks their shade from the palette), `transform` (flip_h, flip_v, shift on every layer of the frame, so a retouch or a variant stays on its base; `layer` moves one), `resize`, `despeckle` (majority filter: lone pixels take the color their neighbours agree on; lines survive), `illustrate` (PNG → full-bleed width×height picture: cover crop around a focus, average or mode sampling, thin dark lines kept, thin bright accents kept (`accent`), flat background, optional subject contour, `quantize=palette` to go straight onto the fit palette by OKLab hue instead of median cut; no figure crop, no background removal), `pixelize` (PNG → asset via the editor's quantizer; specks far from the figure are ignored by the crop, `speck_fraction`), `generate` (fal.ai → PNG, `image_size` for landscape scenes; key from
  `FAL_AI_KEY` or `supabase/functions/.env`, never a command argument; the edit model answers JPEG,
  read by `src/headless/image.ts` and handed back as PNG).
- Backdrops (`src/headless/zones.ts`, `src/headless/backdrop.ts`): `edit_zone` redoes one zone of a render
  (rect/polygon/mask in fractions + instruction) and blends the answer back only inside it, regraded to the
  rest (`answer=`/`from_answer=` to recompose without paying again); `illustrate base=` + the zone redraws
  only those cells; `depth` (depth-anything on fal) + `layers` split an illustration in far→near alpha
  layers for parallax; `lights` writes the painted light sources (center, color, glow radius) as JSON.
- Map recipes (`src/headless/maprecipe.ts`, `mappaint.ts`, `mapnoise.ts`, `mapfile.ts`; `docs/map_recipes.md`): a painted
  map ground as data. `map_from_game` reads a game map JSON into a grid (+ decor sizes from its visuals) and starts the
  recipe; `map_material` (ramp + texture), `map_area`, `map_path`, `map_water`, `map_light`, `map_scatter` add or replace
  steps (by id); `map_light` only darkens (the shadows) and `map_glow` is the light that brightens, with a shape (a pool,
  the fan of a door, a polygon), warm tones per material (`ramps`, `even` for all or a list) and `along`, the
  falloff measured down a line so one light goes on over the next material and ends straight; `map_render` paints every layer (ground, front, the moving ones) into a PNG, `map_export` writes a PNG,
  asset and text drawing per layer, `map_lint recipe=` lints each layer (and says how many stamps that stand have feet all of ink).
  **A recipe has states** (`variants`, `src/headless/mapvariant.ts`): a door open and closed is the base plus
  `{remove, set, add}` by step id, applied first thing in `renderRecipe`; `map_render`/`map_export`/`map_lint` take
  `variant=` (`map_export variant=*`: all of them) and the drawings of a variant carry `variant=` in `generated_by:`.
  `export.layers`, when declared, is the list of what `map_export` writes. A floor of tiles or a wall of bricks is
  the texture `tiles` (`mapsteps/tiles.ts`): a grid anchored to a cell with `at`, one tone per tile, wear,
  a lit edge and, lit from below, a shaded one too (`shade`); an `area` of tiles (or planks, flagstones, paving)
  with `face` keeps its texture down the face. The shadows of the `light` step fall on the ground, never on a stamp
  that `stands`, whatever the order of the steps.
  **What stands sits in the ground with `settle`** (`mapsteps/settle.ts`): the steps that lay a thing with a foot
  register it (`registerFooted`: stamps with `stands`, rocks, boulders, wet stones, trunks, fence posts, pilings,
  building walls; registering paints nothing) and a `settle` step, last in the recipe, sinks it, takes the ink out
  of its foot, rings it, grows blades over it and wets it by water. The painter is pure and deterministic, an exact
  port of the game's drawing scripts (the ladera recipe gives 99.8 % of its pixels; `maprecipe.test.ts`).
  **An object of a map can live in a file of its own**: a `scatter` step with `what: "stamp"` takes `draw:
  <text drawing, relative to the recipe>` instead of `rows` + `glyphs`, so the object has a name, opens in the
  editor, takes a retouch and is reused by any recipe. `expandDrawings` (`mapfile.ts`) turns it into the inline
  form inside `renderRecipe` — the one door into painting, so `map_render`, `map_export`, `map_compare` and
  `map_lint` all inherit it and `mappaint.ts` knows nothing about files. Its colors are matched **by hex**
  against the palette of the recipe and a color that is not there stops the recipe listing the ones that are
  not: that is the lint "this object is out of the palette of the scene", where it is laid on the map
  (`docs/diseno/poblar.md`, issue #4). **The library**: `pick: ["farol", "mercado"]` instead of `draw` asks a
  folder of drawings (`library`, default `objetos/` beside the recipe) for every object whose name (its `id`)
  or one of its `tags` is a word of the list (`libraryObjects`, sorted by name; a word that names nothing
  stops the recipe listing what the folder has). With `at` each place takes one of them; without, `count`
  tries lay them **by rule** (`placeObjects` in `mappaint.ts`): a cell of the game map and an object drawn by
  the seed, the anchor on the middle of the cell, and it goes only if every cell of its `footprint` is in the
  map, free (no object of an earlier step took it), on an `on` material, not walkable with `walkable: false`,
  near a `near` material and `spacing` px from the others. Every object laid (by `draw` or `pick`) is in
  `PaintedMap.objects` with its anchor px and cell and the cells it blocks and walks: `map_export objects=`
  writes them for the game. A `rope` `hang` takes `draw` too (its anchor is the hook). The painter refuses a
  `draw`/`pick` that was not read (`paintMap` straight on `readRecipe`): it would paint nothing.
- Text and control (`src/headless/ascii.ts`, `src/headless/inspect.ts`): `from_ascii` builds an asset from a text
  drawing and `to_ascii` writes any asset back in the same format (exact round trip). Format: header lines
  `id:`, `name:`, `category:`, `size: WxH` (inferred when missing), `description:` (repeatable), `fit: <asset>`,
  `generated_by: <command> key=value …` (what made it, as data: see "Generated and retouched" below),
  `retouch_of: <drawing>` (this drawing is the retouch layer of that one: every glyph but `.` goes
  over it, and `!` — `ERASE_GLYPH` — takes the pixel underneath **out**; `!` is rejected in the
  legend and in a drawing with no `retouch_of:`, so it can never be mistaken for a color),
  `base: protected` (a hand-made drawing someone else retouches: see "A hand-made base" below),
  `anchor: x,y` (the pixel of the drawing that sits where the drawing is placed, in px and whole
  numbers inside it: a `stamp` with `draw:` puts **that** pixel on the cell the recipe names, not the
  top-left corner, so a lantern neither floats nor is buried),
  `footprint: ##/#o` (the cells of the map it takes, rows top to bottom split by `/`: `#` blocks the way,
  `o` takes the cell and lets you walk, `.` is not its own; the bottom-left cell is the anchor's; default
  the anchor's cell, blocking), `tags: farol, mercado` (free words a recipe asks for it by),
  `font:`/`glyphs:`/`advance:`/`kern:` (this drawing is a glyph sheet: carried as written, only
  `font.ts` reads them — see "Typography" below),
  `anim: <name> fps=N durations=a,b loop=true|false label=X`; legend `glyph = #hex [name]` in palette order
  (`.` is transparent); then frames, each after `== <anim> <pos>, <anim2> <pos>` (`==` alone: no animation;
  pos optional = next). Errors name file, line, frame, row and column. `to_ascii glyphs_from=<asset>` picks
  each glyph from that palette's index so files on one palette share glyphs. `fromAscii` also returns the text's
  `layout` (glyphs, declared `anim:` lines, `fit:`, comment count) and `toAscii(asset, { layout })` writes the same
  text back; tested on the game's 79 drawings in `src/headless/fixtures/dibujos`. `ascii.ts` and `assetModel.ts`
  (the pure model; `asset.ts` adds disk I/O) have no Node imports: the web editor uses them (`/dibujo`). `contact` is a control sheet
  (assets next to a reference sprite on a baseline, background color, grid of N px, names in a 3×5 font) and
  `lint` reports colors off a palette, sides off `grid`, lone pixels (the `despeckle` rule, read-only) and
  tile edges that do not meet. The size and the lone pixels are **a tile's rules** (`tile`, `tiles` or category
  `terrain`): a sprite keeps the size it is drawn at and its lone pixels are mostly drawn on purpose (the light
  in an eye, a hair tip), so it counts them only with `lone=true` (a sprite out of `pixelize`). Without that,
  a clean chibi of the game's rig gave 125 warnings and a new real one could not be told from the noise (#271). A ground out of `map_export` is `terrain` too, but its lone pixels are
  texture (grass, flowers): `lint` counts them there only with `lone=true`, and `map_lint` judges a map's blur
  (estudio#215). `fit` and `lint` accept a palette color at any opacity (`#rrggbbaa` whose
  `#rrggbb` is on the palette: fog, shadows).
- **The animation contract, as data** (`src/headless/contract.ts`, pure): "every character has idle, walk,
  attack, technique, hurt and die" is a decision a **game** makes, and it used to be written out four times
  (the tags of `character.ts`, the pose table of `figure.ts`, the descriptions in `commands.ts`, and a fourth
  copy in the game). A contract is now a list of names where `{view}` means one per view:
  `{ "id": "directional", "anims": ["idle_{view}", "hurt_{view}", "walk_{view}", "attack_{view}", "technique", "die"], "views": ["down","up","left","right"] }`.
  Two come with the engine: `body` (what `figure` draws) and `directional` (what `import_character` builds).
  `figure`, `import_character`, `animate` and `lint` take `contract=` — a built-in name, a JSON file a project
  keeps, or the object — and each one defaults to the contract it has always used, so nothing changes until
  asked. `lint contract=` answers which animations an asset is missing or has empty (extras are fine: a game
  sits one character down to meditate; `contract_ids=` limits it, because a portrait is not a character).
  `animate contract=` grows **every** animation of a contract out of the poses the asset already has and says
  which ones it could not and why — the report of what is still missing is part of the capability.
  **`animate` says no on what is not a person standing** (`readStanding` in `animate.ts`, issue #31): the
  engine only moves a biped, and on a cat it used to answer `made` with the bob of a person. The base pose is
  measured on its silhouette: wider than tall, or — as tall as wide, where a person is only a chibi, a big head
  on a small body — a top at one end (a head or a tail sticking out), a top in pieces spread across it (ears),
  or the widest row below the middle (sitting, four legs) is refused with what was measured and the two ways
  out, nothing written. Calibrated on real drawings (`standing.test.ts`, `fixtures/patio/`): the cat, owl, toad
  and hedgehog of El patio refused, the girl, the game's chibis and every view of the `figure` rigs kept. A
  body declared with `anatomy` (here or on the asset) or a `proportions=` **passed** (not inherited: the
  project's map is its people, not this drawing) is animated anyway, with a `warnings` line. What it cannot
  tell is a 16 px pack beast from a 16 px pack chibi: both are one round head filling the square; a beast
  is declared instead. **A body on four legs walks** (`body=quadruped` on `animate`, or stored with
  `anatomy body=quadruped`; `generators/quadruped.ts`, issue #41): no skeleton, only the legs, found going up
  from the soles (the rows the outline and the air cut in as many pieces as the lowest one), each moved whole
  — a shear that keeps the hip and moves the foot, a lift that brings the sole up a pixel — in diagonal pairs.
  In profile the near legs open and close like scissors and the far ones (drawn darker, between them) slide
  out past them; from the front or the back one diagonal lifts, then the other, and a piece in the middle
  (a tail hanging) stays. Only the walk: anything else is refused, and a contract makes the walks and skips
  the rest with the reason. `legs={row, columns}` fixes the guess. Measured on the cat of El patio
  (`quadruped.test.ts`): its walk drawn by hand and the generated one share whole rows. `frames=`
  keeps fewer frames of a loop (idle: 2 = rest and settle; walk and run sampled evenly).
  With `base_from="idle_{view}"` a `_left` animation (generated as the right one and flipped) takes the left
  pose **mirrored in**, and with no left pose it grows from the right one: the left view is born from the
  right, as a game that draws three views expects (game #148).
  In `character.ts` the two tables are kept apart on purpose: the **contract** (which animations, named how)
  belongs to the game, the **layout** (where this pack keeps each of them) belongs to the pack, so a game with
  another contract needs no new layout. The engine's word for a generator and the contract's word for a role
  can differ: a `technique` is generated as a `cast` (`GENERATOR_OF`).
- **The proportion map, as data** (`src/headless/proportions.ts`, pure): where the lines of a body of this
  project fall, declared once in `pgs.json` under `visual.proportions` instead of patched per drawing (which
  is what `anatomy` was: a correction for a guess that came out wrong on *that* character). Three maps, one
  thing, **all in one scale — the figure's height**, widths included, the way a canon counts heads:
  `rows` (the lines down the body: `menton`, `hombro`, `faja`, `ruedo`, `botas`; 0 at the crown, 1 at the
  soles), `widths` (a name that is also a row is measured at that row) and `face` (hairline, eyes, mouth
  **inside the head box**). `anatomy` says which named line is the neck, the waist, the knee, the ankle and
  the torso, so a project keeps its own words and the engine can still read a map it did not write.
  `variants` holds a map per named size and **the canvas picks its own**: a 16×32 asset in a project whose
  `visual.sizes` calls 16×32 `chibi` gets the `chibi` variant with nobody passing it.
  `animate`, `figure` and `lint` take `proportions=` and, left out, **inherit it** from the nearest `pgs.json`
  (what is passed explicitly wins and the command says where it came from; see "What a command takes from
  pgs.json" below for the other knobs that inherit). `animate` builds the `AnatomyConfig` off it — rows *and* torso columns — instead of looking for the
  limbs in the pixels; `figure` takes `build.heads` from `ratios.head_of_height`.
  **`lint proportions=` is how a lint answers "this character is out of proportion"**, with two rules it must
  not be made to forget:
  **(a) the widths only hold facing the camera.** The rows are checked in every view — turning does not move
  your chin — but a profile's shoulder is narrower on purpose: on the game's own chibi it measures 10 px
  instead of 12, and head/shoulder comes out 1.40 against a rule that says never over 1. So widths and the
  count made of them are skipped in a view outside `facing` (default `''`, `down`, `up`) and the skip is
  **printed**, because a profile nobody measured must not read as a clean profile.
  **(b) a map is the body standing.** Only the poses in `poses` are measured (default: the idle). Mid-stride a
  walk swings an arm past the shoulder and a `sit` folds the figure up.
  The body's width at a row is the run of paint the figure's **middle** passes through, not edge to edge: a
  sword on the back makes a 6 px neck measure 10. Slack is `tolerance` of the height and never under 1 px.
  Tests: `src/headless/proportions.test.ts`, carrying the real 16×32 chibi of The Unwritten Dao — the schema
  has to be able to describe a character that already exists or it describes nothing.
- **What a command takes from `pgs.json`** (#26; the table is in `docs/diseno/crear_mundo.md`): what is not
  passed comes from the nearest `pgs.json` walking **up** from the file (`findProject`), what is passed always
  wins, and the answer says it in **one line**, always the same shape — `heredado de ./pgs.json: paleta,
  contrato (patio)` (`inheritedLine` in `project.ts`). `lint`: `visual.palette`, `visual.contract` (a built-in
  name or a JSON path, relative to the project) and `visual.proportions`; the **inherited** contract skips
  tiles and assets with no animation at all (a prop, a portrait) and prints that it skipped them —
  `contract_ids=` names one in. `sound`: `sound.rate` for a recipe with no `rate`, and since a `freq` can now
  be a **note** (`"G5"`, or `[t, "G5"]` points; `sound/notes.ts`, resolved before the schema) the world's
  `tuning` and `scale` for its notes — one outside the scale is warned about, not stopped on; the recipe's own
  `rate`/`tuning`/`scale` win. `font`, `font_web`, `font_contact`: no `path` is `type.font` (looked up from
  where the command runs) and `font_contact` shows the world's `type.steps` as its scales when the sheet is
  the world's own font. Map recipes: `renderRecipe` (`worldLightFor` in `mapfile.ts`) gives a recipe with no
  `light` the world's `visual.light.from` (`upper_left` = `[1, 1]`, `lower_right` = `[-1, -1]`), and says when
  a recipe's own light points another way; `map_from_game` no longer writes `[1, 1]` into a new recipe in a
  world with a light. It only **reads** the world; what a light step does with it is that its fixed molds
  (`buildings`, `blocks`, `stripes`, the `dx` of a `casts`) are mirrored about their own middle when the light
  comes from the right (x < 0): they were drawn lit from the left. The vertical is not turned.
  **The rest of #26** (Khadosh/pixel-gaming-studio#36): `lint` also takes `visual.grid` (the side of a tile:
  1 in PGS, 16 in el patio, the same rule either way) and `visual.sizes` (a sprite whose canvas is none of the
  named sizes is a warning naming them; not tiles, not what `map_export` made). **`visual.contract` can be one
  per class of sprite**: `{ "gato": "art/contrato.json", "bicho": "art/asoma.json", "iconos": null }`, the key
  an asset id or a name of `visual.sizes` (the canvas picks it, the id first; `contractFor` in `project.ts`),
  `null` no contract; an asset in no class is left out and said, as a tile is. `from_ascii` with no `fit`
  takes `visual.palette` as one, but **warns** (`warnings` + `inherited` in its data) instead of stopping:
  drawings nobody checked against the palette would stop a whole `arte.sh`. `music` takes `sound.rate` and
  `sound.tuning` for a score with no `frecuencia:` / `afinación:` (a new header key) and warns notes outside
  `sound.scale` (`musicWorld` in `sound/index.ts`). `sound`: a `duration`, or a layer's `start`/`length`, can
  be a name of `sound.lengths` (`"short"`; `resolveLengths` in `sound/notes.ts`, an unknown name stops it
  listing the ones there are), and a recipe's `material` outside `sound.materials` is warned about.
  `pgs project` ends with which command reads each field (`FIELD_READERS`). Still **only for reading**:
  `says`, `roles`, `stroke`, `margin`, `outline`, `dither` and `visual.light.strength` (what a soft or a hard
  light looks like is a call of taste, left open in #36). Tests:
  `src/headless/herencia.test.ts`, whose font tests run the binary standing **inside** the fixture world, the
  call that failed in el patio.
- Figures (`src/headless/figure.ts`, `docs/figure.md`): `figure recipe=<json> out=<asset> view=front|back|side|side_left` draws a full-body fighter
  (48×40, about 30 px tall) from a rig instead of a base sprite: sphere-swept capsules in the character's own 3D
  frame, posed per frame from one pose table (`FIGURE_ANIMS`: idle, walk, attack, technique, hurt, die) and
  projected in 3/4 (front: turned to the lower left; back: from behind, turned to the upper right), z-buffered,
  shaded in three tones per material and outlined (ink also where a limb passes in front of the body). Every frame
  is drawn whole, so nothing comes apart. Recipe: build, skin, hair style/band/ribbon, hat, beard, top/sleeves,
  skirt, sash, pants, shoes, glow. `side`/`side_left` are the profile cameras (heading 0/180; per-view `heading`,
  `shift`, `views` overrides); `stance: upright` stands square and walks in a real cycle (map sprites). Drawn
  parts: `head_art` per view and `attachments` (art hung from a joint, per view: `at` = where it was cut from
  the standing frame, `behind`/`depth`, `outlined`, `flip`, `replaces` a rig limb, `anims`); side_left falls
  back to side mirrored. `layers: true` splits it into nine asset layers (`FIGURE_LAYERS`: cuerpo, pelo, ropa,
  faja, adornos, arma, aura…) that partition every frame (composited, the same pixels), and answers the stacking
  order per view (from where the parts meet in the z-buffer) and each color's material and tone: the character
  creator, docs/figure.md «Por capas». `layers: "complete"` draws each layer whole (the robe under the arm,
  the head under the hair, the bare body under the clothes) as far as the view's order lets, so stacked in
  that order they still give the fused frame and a layer can stand in for another figure's (`order` forces
  the order, to join runs); docs/figure.md «Capas completas». A recipe missing what a body is built from (`skin`, `hair`, `top`, `pants`, `shoes`) is refused naming every field, and what the canvas cuts off the standing frames comes back as `warnings` with the change that fits it (`figureClip`). With the rig's own head (no `head_art`), a front view square on lights the face from the middle (`FACE_LIGHT`), a chibi's `long` hair falls down both sides of the face over the ears, and a head under 8 px across (`FIGURE_FACE_MIN`) is a `warnings` line naming the `build.height` it needs (`faceWarnings`; docs/figure.md «A 16 de ancho», #40). Tests: `figure` in `headless.test.ts`, `figure.test.ts` and `standing.test.ts`.
- Variants (`src/headless/variant.ts`): `variant path=<base> out=<new> overlay=<txt>` copies the base and
  paints the changes on a new top layer ("variante"): an overlay drawing in the `from_ascii` format where
  every glyph but `.` is laid over the base, and/or `ops`. The base file and layers are never touched, so
  re-running after the base changes rebuilds the variant. Returns `painted` and `changed` pixel counts.
  The game uses it for portraits with mood (`art/pss/recetas/caras/<id>_<cara>.txt`).
- **Generated and retouched** (`src/headless/retouch.ts`): a drawing a command wrote carries
  `generated_by: <command> key=value …` — the command and the arguments to make it again, as data
  (`SpriteAsset.generatedBy`, so the `.pss.json` carries it too), never a sentence in `description:`. No
  header means **drawn by hand**. `map_export` writes it on every drawing (`recipe=` relative to the drawing,
  `layer=`) and `checkOverwrite` looks at it **before** writing: a hand-made drawing, or one another recipe
  owns, stops the whole export with the file named instead of being overwritten in silence (`force=true` to
  overwrite anyway; the first run over drawings made before this existed needs it once).
  **Who stamps it, and who must not.** `madeBy(name, args)` + `relTo(carrier, path)` build the header in one
  line (paths relative to the file that carries it, so the pair travels together; an argument with a space
  in it is left out rather than failing to write, since the format cannot hold one). It is stamped by every
  command that **makes** a drawing of its own: `map_export`, `font_compose`, `variant`, `figure`,
  `import_sheet` (not with `into`: that cut did not make the asset, so it does not speak for it),
  `import_character`, `pixelize`, `illustrate`, `layers`, `cutout`, `terrain` (each piece too), and
  `export_sheet`, whose header goes in the Aseprite JSON (`meta.generated_by`) because a PNG has nowhere to
  carry it. It is **not** stamped by `new` (an empty canvas is where hand work starts), by anything that only
  **changes** an asset (`draw`, `fx`, `palette`, `remap`, `frames`, `anim`, `animate`, `transform`,
  `despeckle`, `resize`, `anatomy`, `stamp`: a hand drawing run through `despeckle` is still a hand drawing),
  or by `from_ascii` / `to_ascii`, which carry whatever the drawing they were handed already said —
  `to_ascii generated_by=false` drops it, which is how something a command made becomes the hand-drawn
  source of itself. The absence is the signal, so a command that stamps what it did not generate breaks the
  whole bridge. The PNG-only outputs (`generate`, `edit_zone`, `depth`, `png_fit`, `png_knockout`,
  `map_render`) carry nothing: `png.ts` writes no text chunk.
  The retouch of a generated drawing lives in its own file beside it, `<drawing>.retoque.txt`: a
  `retouch_of:` overlay in the same format, which `applyRetouch` lays back over the regenerated layer through
  `variant` (layer "retoque"). So the recipe stays the source and the retouch survives running it again;
  the exported `.pss.json` and PNG carry base + retouch, the drawing stays exactly what the recipe painted.
  `retouch=false` skips it. The editor writes that file: see `/dibujo` in Key Files.
  The rule, Joaquín's: what a recipe generates takes the retouch as a layer, what is drawn by hand is a loose
  asset — **unless it declares itself a base** (below) — and before accepting a retouch the question is
  whether it should be a parameter of the recipe.
  **A hand-made base** (`src/headless/protectedbase.ts` pure, `guard.ts` on disk; issue #32, the cat of
  el-patio a six-year-old paints a collar on): a drawing with no `generated_by:` that carries
  `base: protected` in its header. It says something about **the file**, not about who made it — the
  absence of `generated_by:` still means "drawn by hand" — and lives in `AsciiLayout.base`, never in the
  asset, so a variant or a `.pss.json` made from a base is not a base. Two things follow, the same in the
  engine and in the editor because both ask one function, `retouchAside({ generatedBy, base })`
  (`'generated' | 'base' | undefined`): (1) GUARDAR writes what was painted to `<drawing>.retoque.txt` and
  never the drawing, and `from_ascii txt=<base>` lays that file back over it on a layer `retoque`
  (`retouch=false` skips it; the answer carries the coverage line), so the base can be redrawn and the
  collar lands on the new one; (2) **nothing writes over it**: the guard (`guardWrite` / `writeGuarded`)
  looks at the **destination**, not at who writes, and sits in `saveAsset`, `writePng` and every
  `writeFileSync` of the headless (to_ascii, map_export, font_compose, font_variant, WAVs, JSON), so a
  command written tomorrow is covered too; `checkOverwrite` says no to a base even when its
  `generated_by:` matches. `force=true` (`to_ascii`, `map_export`, `font_compose`, `font_variant`)
  overwrites anyway; the commands without `force` just refuse. The divergence warning (below) is **not**
  given on a base, which has no recipe to move the corrections up to; the share is still said.
  `base:` takes only `protected` and is rejected on a `retouch_of:` file.
  **A retouch frame can hold for many** (`src/headless/framescope.ts`, issue #43, the collar that blinked
  as the cat walked): `== *` is every frame of the drawing underneath, `== *_right` every frame of every
  animation whose name matches. Only in a `retouch_of:` file; they are not frames of the retouch
  (`fromAscii` returns them in `scoped`, `toAscii` takes them back in `scoped`), the frames are looked up in
  the **base** when it is laid (so a base that grows a frame gets it too), they go first and a frame of its
  own paints over them, and one that names no frame is refused naming the animations. The editor spreads
  them over the frames on open and gathers back on save what came out the same on every frame of a view
  (`gatherScoped`; a view has a scope only when `*_<view>` names exactly its frames, which on a sprite with
  diagonals `*_right` does not).
  The reverse direction (pixels back into a recipe) is **not** wanted.
  **The layer wins over the recipe** (Joaquín, 6 October): "la capa visual gana a la receta… y llegado el caso
  se actualiza la receta con las correcciones, es el chiste de tener un editor". So the overlay says three
  things, not two: `.` leaves what was underneath, a color glyph paints, and `!` takes the pixel **out**.
  No layer can paint a hole, so `makeVariant` clears an erased pixel from the layers under it **in its own
  copy** — the file on disk is untouched, so running the recipe again rebuilds the base and the erase lands
  on the new one. What the editor shows is what the drawing ends up being: in the PNG, the `.pss.json`, the
  BMFont page and every contact sheet. In the editor, `saveTextDrawing` writes the erase instead of dropping
  it, and `addRetouchLayer` reads it back as a hole in the base, so the two round-trip.
  **The divergence traffic light** (`src/headless/divergence.ts`, pure, imported by the editor too) is what
  that costs, said out loud. `makeVariant` / `applyRetouch` answer a `RetouchCoverage`: `painted`, `changed`,
  `erased`, `divergent` (`changed + erased`), `ink` (every pixel the drawing has ink in, before or after) and
  `share` = `divergent / ink`. `map_export`, `font`, `font_contact` and `font_compose` print it
  (`retouch · <file>: N px pintados, M borrados · X% del dibujo lo decide la capa`), and over
  `DIVERGENCE_LIMIT` (**20%**, justified where it is defined) they add a warning naming what to go and
  change — the `recipe=`/`spec=` of the drawing's own `generated_by:`. It never refuses: past a fifth the
  recipe no longer generates that drawing, re-running it proves nothing and `map_compare` is measuring the
  hand, so the corrections belong up in the recipe — but that is a person's call, not a gate.
- Borrowed bodies (`src/headless/stamp.ts`, `face.ts`): a sprite pack gives you a body that walks for free,
  but at 16 px several characters end up sharing it. `stamp path=<asset> txt=<drawing>` puts a garment on it:
  the drawing is the size of the sprite with one frame per view (`== down`, `== up`, `== left`, `== right`;
  `.` leaves what was there) and lands on **every** frame of every animation of that view, shifted with the
  head (the first row of the frame with any pixel) so it follows the bob of the walk; what leaves the canvas
  is clipped. The naming convention is a parameter: `anims` (`"*_{view}"` by default) picks the animations a
  view covers, `anchor` (`"idle_{view}"`) the one whose first frame sets the reference head, `align=none`
  never shifts. `face_points path=<asset> skin= ink= [hair= forehead=]` finds the face nobody drew for you,
  frame by frame: the eyes (ink with skin on both sides, two facing the camera and one in profile, with the
  top row and its columns), the hairline (hair over the shade of the forehead, **with how many rows of hair
  sit in between**, so a headband can sit one, two or three pixels up without a second pass) and the skin
  (every pixel and its box). The view of each frame comes from the animations, nothing is drawn, and
  `table=true` answers a line per frame. The game stamps Peng's bandage and Pei Shou's bun with `stamp`, and
  builds his moustache and Mei's headband on `face_points`.
- Sound (`src/headless/sound/`): `sound` synthesizes a recipe (JSON, schema in `recipe.ts`) into a WAV, PCM 16 bit
  mono at 22050 (default) or 44100 Hz. A recipe is `duration`, `seed`, optional `loop`/`crossfade`, `normalize`
  (peak dBFS) or `gain_db`, and `layers`; each layer has a `source` (`sine`, `triangle`, `square`, `saw`, `noise`
  white/pink/brown, `pluck` = Karplus-Strong, `crackle` = seeded random bursts) or sub-`layers` mixed as one voice,
  plus `filters` (lowpass/highpass one-pole or biquad, bandpass), an ADSR `envelope`, `lfo` on gain/freq/cutoff
  (`random` = smooth seeded wander), `echo`, `start`/`length`, and `events` (repeat the layer as separate voices at
  seeded intervals with random pitch and gain: birds, knocks, cups). Frequencies can be `[[t, Hz], …]` sweeps.
  Each layer draws from its own generator (seed + position), so the same recipe gives the same bytes and adding a
  layer does not change the others. `loop: true` renders the crossfade length past the end, lays it over the start
  (equal power) and writes a `smpl` loop point (Godot imports it as a loop). The mix goes through a DC blocker,
  one-shots get 2 ms / 10 ms fades, and a limiter keeps every peak under -0.5 dBFS. `sound recipe=<dir> out_dir=`
  renders a folder. `variations: N` (2–16) writes N takes of the same recipe, `<name>_1.wav` … `<name>_N.wav`, each
  with its own seed (`takeSeed`: the first is the recipe as written): steps, keys and knocks that never repeat the
  same bytes. `sound_contact` checks WAVs without listening: duration, peak and RMS, DC, spectral centroid,
  loop seam (jump vs the usual step, plus a click test across the splice), one-shot edges at silence, and clicks
  (an isolated second-difference spike over 20× its neighbourhood while the level holds: crackle grains stay
  under it, a cut or a square gate does not); `out=` draws waveform strips. Tests: `src/headless/sound/sound.test.ts`.
  Sources also include `string` (Karplus-Strong tuned exactly with an allpass, `ring` = seconds to -60 dB at any pitch,
  `pick` position comb, `bright` pick) and `bell` (modal: inharmonic `partials` [ratio, amp, T60], `beat` Hz); filters
  add `peak` (RBJ peaking EQ, `gain_db`) and `track: false` (a fixed resonance, the box of an instrument).
- Music (`src/headless/sound/music.ts`, `instruments.ts`): `music score=<file|dir|text> out=|out_dir=` renders a
  `.partitura` (text: `tempo`, `compas`, `semilla`, `loop: si`, `humano: tiempo= fuerza=`, `sala: mix largo=`, `cola`,
  `instrumento <name> = <preset|json> gain= ring= octava=`, `voz <name> = <instrument> octava= gain=` and then notes:
  `A3 q`, `E4 h.`, chords `A3+E4`, `r` rest, `x` hit, durations carry over, `pp…ff`, `>` accent, `~` grace,
  `[ … ]xN`, `|` bar check with the line in the error). Instruments are recipe layers tuned to `base` Hz, rendered per
  note at note/base pitch: built-ins `citara`, `qin`, `gota`, `cuenco`, `campana`, `gong`, `tambor`, `madera`, `bambu`
  (plucked and struck only), or a JSON in `instrumentos/` next to the score. A loop folds everything that rings past
  the end (and the room tail) onto the start, so it is exactly periodic. Tests: `src/headless/sound/music.test.ts`
  (determinism, seam with a note ringing across it, levels, tuning of the string, ring time, bowl decay).
- **Typography** (`src/headless/font.ts` pure, `fontfile.ts` on disk): a font is **one glyph sheet** — a
  single-frame text drawing whose canvas is a grid of fixed cells, one glyph per cell — plus four header
  keys `ascii.ts` carries and only `font.ts` understands: `font: cell=WxH baseline= line= space= track=`,
  `glyphs:` (one line per row of cells, one character per cell, a space skips one), `advance:` and `kern:`
  (both `key=value`, optional). A sheet and not a file per glyph because the pixels have to live in a text
  drawing for the editor and the retouch machinery to work, and because a font is judged with the whole
  alphabet in view. **The drawing is the metric**: the advance of a glyph is its last painted column plus
  one plus `track`, so drawing a letter wider widens the text, with no table to keep in sync; the left
  bearing is drawn, not declared; `advance:` is for the few where the ink is not the measure (the space,
  a `1` that has to line up with the other digits). One design size, scaled by whole numbers: no hinting,
  no antialiasing, no per-size variant. `font path=<sheet> [out=<x.fnt>] [ink=] [godot_import=] [table=]`
  reads it and writes an AngelCode BMFont (`.fnt` + its page PNG 1:1, and the `.import` Godot wants with
  `scaling_mode=1`, integer only); Godot 4 takes it through `FontFile.load_bitmap_font()` or its own
  importer — **verified against the engine**, glyph by glyph, 751 ink pixels identical to `font_contact`
  at 1x. `font_compose spec=<json> out=<sheet>` derives glyphs from the base ones (a mark stamped over a
  letter, centred on its ink by default; `turn` 180°, `flip`), writes `generated_by: font_compose` and
  honours `checkOverwrite`, so the hand pass lives in `<sheet>.retoque.txt` and survives running it again.
  `font_contact` is the control sheet (in `LOOKING`): it sets a phrase at whole-number scales and answers
  the image **and** the missing glyphs, the width, the rows of the cell the ink really uses, pairs that
  touch with no pixel between them, cells with ink no `glyphs:` row claims, glyphs that fill the cell or
  cross the baseline. Tests: `src/headless/font.test.ts`.
- **Typography for the web** (`src/headless/fontweb.ts` pure, written out by `fontfile.ts`): BMFont is what
  an engine reads and what **no browser** does, so `font_web path=<sheet> out=<x.ttf> [css=] [family=] [em=]`
  writes the same font as a **TrueType** plus the `@font-face` that loads it. Same `PixelFont`, same glyphs,
  and the advances taken from `FontGlyph.advance` and never recomputed — if the two exports ever drift, the
  font a page sets is not the one the game sets (`fontweb.test.ts` compares them glyph by glyph against the
  `xadvance` of `bmfont()`). TrueType and not WOFF2: it works in every browser behind `@font-face`, needs no
  compressor (so the file stays pure and the project takes no new dependency) and its bytes can be read back
  to check. The tables are written by hand, 64 units per drawing pixel, and **a pixel is an exact square**:
  every painted pixel becomes a rectangle on the grid (merged per horizontal run; the non-zero winding rule
  unions them with no seam and no hole to orient), so at the design body and its whole multiples every edge
  lands on a whole device pixel and the coverage is 0 or 1. The em square is `em` drawing pixels — the cell
  width by default, which is the 8 of Nube 8 — and **the content box is the line of the drawing**: ascent =
  `baseline`, descent = `line - baseline`, so the half-leading of `line-height: <line>px` is zero and the
  baseline falls on a whole pixel. With the descent at the ink instead, the box is 11 for a 12 px line and
  the text is set one device pixel off at 2x and two at 3x — a real bug, found by the browser control and
  kept out by a test. The output is deterministic (fixed dates), so the exported file belongs in git.
  Verified in Chrome, not deduced: see `examples/tipografia/web.html`.
- **Derived fonts** (`src/headless/fontvariant.ts` pure, written out by `fontfile.ts`): `font_variant
  path=<sheet> out=<sheet> kind=outline|shadow|bold [dx= dy= color= id= name= force=]` writes a whole sheet
  derived from another — outline (dilate the ink 3x3 and subtract it: a hollow letter), shadow (an offset
  copy underneath in a color of its own, `#808080` by default = the ink at half brightness) or bold (the
  smear: the ink unioned with itself one pixel over). Same machine as `font_compose` one step further, and
  the same contract: `generated_by: font_variant` with the **effective** arguments (so running it again with
  the defaults writes the same header and the overwrite guard lets it through), `checkOverwrite`, the hand
  pass in `<sheet>.retoque.txt`, the divergence light. **The advance recalculates itself**, because the
  advance is the ink plus `track` — a declared advance of a glyph with ink grows the same amount (a `1` stays
  lined up with the digits), one with no ink does not (the space) — and that is also why **the gap between
  two neighbours is preserved**: what the operation adds on the right the advance takes back, and the left
  bearing is drawn. An outline can therefore never glue two letters together. The cell, `baseline` and `line`
  grow to fit, so nothing is clipped and the leading is the base's; the letter keeps its place on the
  baseline and what the operation adds falls below it. What is **not** free is the counterform: it measures
  the whites of every glyph before and after and answers `closed` / `tightened` / `narrow`, plus
  `closed_after_retouch` taken on the sheet as it is read back — whether the hand pass really reopened them.
  A counterform is a white of the **ink box** boxed in along one axis, so the open gaps of `m`, the aperture
  of a `c` and the channels of an `E` count and a corner notch does not: counting only *enclosed* holes said
  the bold of Nube 8 was fine while `miró` was setting as `■iró`. Tests: `src/headless/fontvariant.test.ts`.
- **Typography example** (`examples/tipografia/`): **Nube 8**, a proportional pixel font with every glyph
  Spanish needs (111). `nube_base.txt` is drawn by hand (94 glyphs, cells of 8x11), `nube.compose.json`
  derives the 16 of the accents and the inverted punctuation, `nube.txt` is what `font_compose` writes and
  `nube.retoque.txt` the one thing left to the hand (one painted pixel, no erase: the font is finished, and
  the example is not the place to demonstrate a glyph). `nube.ttf` + `nube.css` are the web export,
  `web.html` the page that loads them (and the control: it declares in `data-scale` and `--x`/`--y` where
  each line starts, so a screenshot can be compared pixel by pixel against `renderText`) and
  `muestra-web.png` the Chrome capture. The three derived sheets are there too (`nube.contorno.txt`,
  `nube.sombra.txt`, `nube.negrita.txt` with its 110-pixel retouch and a `muestra-*.png` each): the contour
  and the shadow come out with no hand work, the smear closes **14** glyphs whose strokes sit one pixel
  apart (`W m r w x 4 " « » ¨ * & # …`) and the retouch puts those back at a single weight. The shadow
  survives to Godot (the BMFont page carries both colors) and **not** to a browser, since a TrueType has no
  colors and the shadow fuses with the ink — a page wants `text-shadow` on the base font instead. Its README
  is where the format, the metrics, the erase glyph, the variants and the ways out — to Godot and to a
  page — are explained for a person.
- **Sound examples** (`examples/sonido/`): six recipes and one score, one per shape the engine makes
  (a hit, struck metal with its own partials, a looping ambience, an ambience populated with `events`,
  an interface pluck, a footstep on a material, a short loopable piece), with a README that says what
  each one teaches and how to render and check it. A test renders all seven and demands `0 with warnings`.
  They are the reference a new game starts from; the engine is generic, the examples are the only map of it.
- **A recipe as a transaction** (`src/headless/batch.ts`): `batch steps=[…]` or `batch recipe=<json>` runs a
  whole list of steps — each one `{ "command": "<name>", …its arguments }` — in **one** process. It is not
  about the clock (`bin/pgs` is tsx with no build step, about 0.25 s to start): it is that "a recipe", the
  dozen or two calls that make one map or one character, did not exist as a unit, so nobody checked the set
  before the first file was written and a typo in step nine left half a recipe on disk. `batch` **validates
  every step against its command's schema before running any of them** and answers every problem at once
  with nothing written; then it runs them in order and answers one line per step (the same line MCP gives a
  writing command). `dry_run` only checks; `keep_going` runs them all and reports every failure instead of
  stopping at the first (a folder of independent drawings). Paths are relative to where you run it, as on the
  command line, and a batch cannot contain a batch. Authoring the 23 map recipes of the game (434 calls:
  `map_from_game`, the materials and the 286 steps) goes from 108 s in 434 processes to 0.4 s in one.
- **One process for a script that asks as it goes** (`src/headless/batchlines.ts`): `bin/pgs batch -` reads a
  command per line on stdin and answers each one with a JSON line as soon as it is done, `{"ok": true, "out":
  <exactly what bin/pgs prints>}` or `{"ok": false, "error": …}`; a failure does not stop the next line
  (`--lines <file>` reads a file; the exit code is 1 if any failed). A line is the argv as a JSON array
  (`["draw", "path=a.pss.json", "ops=[…]"]`, what a Python script already hands to `subprocess`), a step of a
  batch (`{"command": …}`) or plain words. `batch` plans before running and these scripts decide the next call
  from the answer to the last one (`pgs ascii` of a frame, then a patch): one process for all of them took
  `./arte.sh personajes` of the game from 44 s to 0.5 s (#129). CLI only: the MCP is already one process.
- Registry in `src/headless/commands.ts` (zod schemas); CLI and MCP are thin adapters.
  Add a command there and both fronts get it. Tests: `src/headless/headless.test.ts`
  (node environment, no jsdom).
- **What MCP answers** (`src/headless/brief.ts`, tests in `brief.test.ts`). Two rules, and the
  question each one asks is not the same:
  - **Does it produce text worth reading?** If a command sets `result.text`, that text is the answer
    and goes through **whole**; `briefLine` passes it, it does not rebuild a line. A command with no
    text of its own gets one line from its `data` (`oneLine`, which a batch report also uses). The cut
    is *not* "does it write files?": `sound` writes a WAV **and** answers the control table, and the
    line rebuilt from `data` used to throw the table away, leaving the agent calling a sound good
    without ever having checked it. The same had happened to `music`, `map_from_game` (the grid, which
    is what the steps are planned on), `map_export` (which file each layer wrote), `font`, `to_ascii`
    and `grid_mask`. So: if what a command has to say does not fit in `oneLine`, give it a `text`.
  - **Is looking at it the whole point?** Then it also goes in `LOOKING`, which keeps the **image**
    too (`render`, `contact`, `lint`, `map_render`, `map_compare`, `map_lint`, `sound_contact`,
    `font_contact`…). Everything else shows its picture only with `preview: true`, because an agent
    pays for every byte it reads. A check left out of that list reports a number without the picture
    that would contradict it.
- **The catalog has a budget** (`src/headless/mcpcatalog.ts`, scale in `mcpcatalog.test.ts`,
  `npm run mcp:catalog` to read it). Every agent session pays for the whole `tools/list` before it does
  anything: it was 406 KB (~100k tokens) on 9 October 2026 and is ~220 KB now (197 KB after the diet, +23 KB
  when the map step fields came back, #18), and the test fails over `CATALOG_BUDGET` (242 KB), measured on the real server over stdio from another directory. The rules:
  - `description` is **one sentence, ≤ 200 characters**: what it does and what it answers. The long
    explanation goes to `details`, which `pgs help <command>` and `pgs_doc` show and the catalog does not.
    A tool over 200 needs an entry, with its reason, in `DESCRIPTION_EXCEPTIONS`.
  - A field description reaches the catalog only **at the top level and only when ≤ 80 characters**
    (`FIELD_DESCRIPTION_MAX`). The long ones and every nested one stay in the zod schema, where
    `pgs_doc { command }` (`bin/pgs doc command=<name>`) reads them: write the first 80 characters as
    the thing an agent needs to call the tool, and the tuning prose after that only if it is worth it.
    The map steps (`map_*`) keep **every** top-level field within 80 (what it is, in what unit); the why and
    the long defaults go to `docs/map_recipes.md`, "Los campos de cada paso, por extenso".
    `npx tsx scripts/long-fields.ts` lists the `map_*` fields over 80 and must come out empty (`--all`: every command).
  - What many tools share is said once, in the server's `instructions` (`INSTRUCTIONS`): `preview`,
    `pgs_doc`, the `recipe` and `index` of a map step. Do not put it back in every tool.
  - `tools/list` is `publishedTools(commands)`, not the SDK's dump: the same structure (a test checks
    every command publishes its whole schema minus prose), compacted (`compactSchema`: no `$schema`, no
    ±2^53 bounds on every integer, tuples of one type as arrays with a length, a mixed tuple as `prefixItems`: the API reads the schema as 2020-12 and drops a whole tool whose `items` is a list). Validation is still the
    zod schema in `tools/call`. A new command costs every session: look at what `npm run mcp:catalog`
    says it adds before raising the budget.
- `SpriteAsset.width/height` (a non-square canvas) is honored by **both** sides now: `dims(asset)`,
  `blankFrame(w, h)` and `blankFrameLike(asset)` in `assetModel.ts` are the only way to ask how big a canvas
  is — never `asset.size` as both axes, which is what kept a 448×224 map from opening in the editor.
  `AnimationDef.durations` (ms per frame) and `loop` are still headless-only in the UI.
- Coordinates in commands are x = column, y = row; frames stay `number[][]` as `[row][col]`.

First consumer: *The Unwritten Dao* (Godot), whose `arte.sh` rebuilds `art/pss/src/*.pss.json` from the
hand drawings in `art/pss/dibujos/*.txt` (`from_ascii`), exports them through `bin/pgs export_sheet`,
and checks new art with `arte.sh control` (`contact` + `lint`). Its `sonido.sh` renders `art/sonido/recetas/*.json`
with `sound`, its scores `art/sonido/musica/*.partitura` with `music`, and reviews them with `sound_contact`.

## Roadmap (3 archivos)

- **`ROADMAP_COMPLETED.md`**: historial de lo completado.
- **`ROADMAP_NEXT.md`**: visión a futuro y backlog estratégico.
- **`ROADMAP_IMMEDIATE.md`**: sprint actual. **Consultar siempre antes de empezar nuevas tareas.**
- **`AUDIT.md`** (producto, 2026-04) y **`AUDIT_TECNICA.md`** (código y seguridad, 2026-09): estado y plan de retoma.

## Architecture & Patterns

### Sprite Data Format
- A **frame** is `number[][]` indexed `[row][col]`. Each number is a palette index; `0` = transparent.
  The canvas is `asset.width × asset.height` when those are set and `size × size` otherwise: ask `dims(asset)`
  (`src/headless/assetModel.ts`), never `asset.size` for both axes.
- A **layer** (`SpriteLayer`) holds its own `frames[]`, plus `isVisible`, `isLocked`, `opacity`, optional `paletteIds`.
- Frames `[0]`, `[1]`, `[2]` of every layer are reserved for the Front, Side and Back canonical bases.
- An **animation** (`AnimationDef`) stores `frameIndices[]` referencing positions in `layers[0].frames[]`, plus optional `fps`.
- A **sprite** (`SpriteAsset`) has `palette: Record<number, string>`, `colorNames`, `layers[]`, `animations[]`, optional `anatomy` and `versions`.
- In the DB and in localStorage the asset is stored compressed (`spriteDto.ts`). `toJson`/`fromJson` in `src/lib/supabase.ts` are the only JSONB boundary.

### The icons are drawings

The app's 61 icons used to be hand-written TypeScript, in two formats: number
matrices in `src/lib/icons/iconRegistry.ts` and SVG paths typed out in
`PixelIcon.tsx`. PGS exists so that nobody writes pixels by hand, and its own
were written by hand. They are now **PGS drawings**, one text file per icon in
`art/iconos/`, opened and retouched in the editor like any other asset.

- **The drawing is the truth**, `src/lib/icons/generated.ts` is derived: it is
  regenerated by `npm run icons`, never edited. A drawing carries no
  `generated_by:` — nothing generates it, it is drawn by hand.
- **Five papers, as named palette entries**: `base`, `claro`, `oscuro`, `negro`,
  `acento`, in that order in every drawing. The generator resolves the paper
  **by the color's name**, so reordering the palette in the editor is safe.
  `PixelIcon` maps them to the same CSS variables as always and `--px-base` is
  `currentColor`: an icon takes the color of the text it sits in. Breaking that
  would freeze every icon to one color across the app.
- **A grid, drawn as vectors**: `matrixToSvgPaths` turns the grid into SVG
  paths, one per paper, so the source of truth is 16×16 pixels and what is drawn
  stays sharp at any size. No PNG in between.
- **One color per pixel.** The old paths stacked semi-transparent layers with
  `opacity` over the base; a grid cannot say that, and what the editor shows has
  to be what the app shows. So a highlight is its own pixel, not a veil: shading
  is fixed by choosing paper colors that read on their own.
- `src/lib/icons/icons.test.ts` holds, cell by cell, what the old paths drew
  (`fixtures/trazos-previos.json`) and demands the same output. Seven icons had
  their hole **painted** with `var(--background, #000)`; those cells, and only
  those, are now transparent.

### Editor State
- `createSpriteEditorStore()` builds one Zustand store per open sprite. `SpriteStudio` and `SpriteEditorModal` create it and provide it through `SpriteEditorStoreProvider`.
- State and actions live in `store/slices/*`. **New editor behavior goes in a slice**, exposed through `store/types.ts`, and consumed with `useSpriteEditorStore(selector)`.
- Cross-cutting derived data goes in `store/derived.ts`.
- The store persists a snapshot to localStorage keyed by sprite id (or `new-<projectId>`), tagged with a hash of the asset it came from. A snapshot whose hash does not match the freshly loaded asset is discarded.
- Undo/redo lives in `historySlice`; explicit checkpoints via `createCheckpoint`.

### Canvas Rendering
- Pixel-by-pixel with `CanvasRenderingContext2D`; layers composited via `compositeFrame()` (respects visibility and opacity).
- Checkerboard background for transparency; onion skin renders adjacent frames at reduced opacity.

### Backend
- **Postgres** tables `projects`, `project_sprites` (JSONB `asset_data`, max 2 MB, `UNIQUE (project_id, slug)`), `user_ai_usage`. `projects` has `UNIQUE (user_id, slug)`: clients must handle SQLSTATE `23505`. Both tables have `updated_at` maintained by trigger.
- **RLS** restricts every table to its owner. `user_ai_usage` is written only by the service role.
- **Edge Functions** (`verify_jwt = false` in `config.toml`; auth is enforced in code): every function calls `requireUser` before anything else, validates the body, then `consumeQuota` (RPC `increment_ai_usage`, 10 calls per user per day, atomic), then the model with a 90 s timeout. Errors return generic Spanish messages and log details server-side.
  - `generate-sprite-fal`: `{ prompt, size, palette?, image_url?, projectConfig? }` → `{ imageUrl, prompt, originalPrompt, size }`
  - `generate-perspective-fal`: `{ prompt, image_url, size, palette?, projectConfig? }` → `{ imageUrl, images }`
  - `generate-animation`: `{ baseFrame, animationName, size, palette, colorNames?, projectConfig? }` → `{ frames }`
- Secrets: `GEMINI_API_KEY`, `FAL_AI_KEY`, optional `ALLOWED_ORIGIN`. Locally in `supabase/functions/.env`; in the cloud via `supabase secrets set`. See README "Local stack".

### Routing
```
/                                        → Landing (public)
/auth                                    → Login / signup
/dashboard                               → Project list (protected)
/project/:projectSlug                    → Project workspace (protected)
/project/:projectSlug/editor/:spriteSlug → Sprite editor (protected)
/catalog, /asset/:assetSlug              → Public asset browser
/icon-preview                            → Icon tool (localhost only)
/dibujo                                  → Open/save a text drawing in the editor (no backend)
```

## Coding Conventions

- TypeScript for all new files; functional components with hooks
- Tailwind utilities for styling; inline styles only for dynamic values (canvas colors)
- **Type is Nube 8, the font PGS makes, and it has three bodies: 8, 16 and 24 px, nothing between.**
  Never a raw `text-xs`/`text-[9px]`/`font-pixel`: use the four roles — `.nube-etiqueta` (8/12),
  `.nube-cuerpo` (16/24), `.nube-titulo` (16/24) and `.nube-pagina` (24/36), declared in `src/index.css`.
  Tighten a line only by an **even** number (24 → 20, never 21) or the whole line lands on a half pixel;
  letter-spacing is whole pixels (`.nube-track-1`, `.nube-track-2`) or zero; no `italic` and no `font-bold`
  (the browser synthesises them and the grid breaks). Canvas text too: `8px "Nube 8"`. The why, the
  redesigns it forced and what is still open is `docs/tipografia-app/escala.md`; before/after shots are
  `docs/tipografia-app/{antes,despues,antes-app,despues-app}/`, taken with `scripts/capturas-app.mjs`.
- `@/` alias for imports from `src/`
- Canvas/drawing logic in `src/hooks/`, domain helpers in `src/lib/`, editor state in `store/slices/`
- Header, export and import UI are shared components: never duplicate them per page
- Colors live in `SpriteAsset.palette`; never hardcode palette colors in components
- ESLint: `no-explicit-any`, `ban-ts-comment` and `no-unused-vars` are warnings. Do not add new ones; remove them when touching a file

## Commands

```bash
npm run dev          # Dev server (http://localhost:8080)
npm run build        # Production build
npm run lint         # ESLint (must pass with 0 errors; CI runs it)
npm run icons        # art/iconos/*.txt → src/lib/icons/generated.ts
npm run icons:hoja   # the contact sheet of the icons
npm test             # Unit tests (vitest)
npm run test:watch
supabase start       # Local backend (see README for ports and secrets)
deno test supabase/functions/_shared/   # Edge Function helper tests
```

CI (`.github/workflows/ci.yml`) runs lint, `tsc`, tests, build, and `deno check` of every function on every push and PR.

**Before handing back, `npm run lint` must report 0 errors, whoever introduced them.** A lint error that "was already there" gets fixed anyway: CI is red or green, it has no owner (a stray expression in `sky.ts` kept CI red for a day while five agents reported it as "not mine", 8–9 Oct 2026).

## Commit Conventions

One-liner commits in Spanish, grouping related files and functionality:

```
type(scope): descripción corta en español
```

**Types:** `feat`, `fix`, `refactor`, `style`, `test`, `chore`, `docs`

No usar descripciones largas, no listar archivos modificados, no usar bullet points en el mensaje. Un solo renglón siempre.

**Changelog:** Es mandatorio actualizar `CHANGELOG.md` con cada cambio significativo, incrementando el contador de commits del día y resumiendo las funcionalidades agregadas o corregidas.

## Do NOT

- Edit files in `src/components/ui/` manually — shadcn/ui generated components
- Use CSS-in-JS or styled-components — stick to Tailwind
- Change the `number[][]` frame format — rendering, compositing, compression and export depend on it
- Change the `SpriteLayer.frames[]` / `AnimationDef.frameIndices[]` relationship — playback depends on it
- Call fal.ai, Gemini or any AI API from the client — all AI calls go through Edge Functions via `invokeAiFunction`
- Create a second Supabase client — import `supabase` from `@/lib/supabase`
- Use `var` — always `const` or `let`
- Add inline `style` tags or `<style>` blocks — use Tailwind classes
- Put secrets in any `VITE_*` variable — Vite exposes them to the browser
- **Pushear.** Un agente **nunca** pushea: commitea lo suyo y para ahí. El
  orquestador verifica (tests, tipos, lint, y los binarios corridos desde otro
  directorio) y sincroniza los dos repos al cerrar cada tramo, sin que Joaquín
  tenga que pedirlo — eso lo pidió el 5 de octubre de 2026 y es lo que reemplaza
  a la regla vieja de esta línea, que decía esperar a que pidiera cada commit.
  Ver `docs/diseno/decisiones.md`.
