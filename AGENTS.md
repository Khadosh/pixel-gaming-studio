# AGENTS.md — Pixel Sprite Studio

> This file provides project context for AI coding assistants. `CLAUDE.md` is a symlink to it.
> Last verified against the code: 2026-10-06. If you find a discrepancy, fix this file in the same change.

## Project Overview

Pixel Sprite Studio is an **asset engine for games**: 140 commands on one asset model, reachable as a CLI (`bin/pss`), as an MCP server (`bin/pss-mcp`) and as a browser editor. Most of the work happens headless, in `src/headless/` — see "Headless: CLI and MCP" below, which is the biggest section of this file for a reason. The app is the hand pass: open what the engine made, retouch it, save it back. `README.md` is the short version; `docs/auditoria/` is where PSS stands today.

The app is a browser pixel art editor with AI-assisted sprite and animation generation: create, animate and export pixel art sprites (16, 32, 64 or 128 px) with a layer system, multi-frame timeline, anatomy-driven procedural animations, and persistent cloud storage.

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
| `src/pages/TextDrawing.tsx` | `/dibujo`: opens a text drawing (`from_ascii` format) in the editor and saves it back to the same `.txt`. No backend. A drawing with `generated_by:` is **not** written back: GUARDAR writes `<drawing>.retoque.txt`, the layer on top (pick the drawing and its `.retoque.txt` together to keep a retouch already started). What the editor shows is what the drawing ends up being: an erased pixel goes to the layer as `!`, and the save says how much of the drawing the layer decides |
| `src/lib/textDrawing.ts`, `src/lib/textFileAccess.ts` | Text drawing ↔ editor asset (session keeps glyphs, `generated_by:`, the base pixels as opened; `warnings` for what the text cannot hold) and local file open/save (File System Access API, else input + download; `pickTextFiles` takes a drawing plus its retouch) |
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

- `bin/pss <command> '<json>'` or `bin/pss <command> key=value …`; `bin/pss help`.
- `bin/pss-mcp` is an MCP server over stdio exposing every command as `pss_<command>`
  (a game repo points its `.mcp.json` at it). `render` returns the PNG as an image.
- Commands: `batch` (a whole recipe of commands as one transaction: see "A recipe as a transaction" below),
  `new`, `info`, `ascii`, `render`, `import_sheet` (grid cut, exact colors; `into` appends to an existing asset),
  `import_character` (a pack folder → one asset with directional tags; layouts in `src/headless/character.ts`),
  `export_sheet` (1:1 PNG + Aseprite-style JSON with frameTags and durations), `draw`,
  `fx`, `fx_anim`, `palette` (set/add/names/map), `palette_fit` (nearest colors of a target palette),
  `palette_show`, `png_fit` (recolor a whole PNG to a palette, layout untouched), `png_knockout` (drop a background color connected to region edges), `remap`, `frames`, `anim`, `animate` (anatomy-engine generators from one pose), `anatomy`,
  `stamp` (a directional drawing over every frame of a character), `face_points` (the eyes, the hairline and the skin, frame by frame),
  `transform`, `resize`, `despeckle` (majority filter: lone pixels take the color their neighbours agree on; lines survive), `illustrate` (PNG → full-bleed width×height picture: cover crop around a focus, average or mode sampling, thin dark lines kept, thin bright accents kept (`accent`), flat background, optional subject contour, `quantize=palette` to go straight onto the fit palette by OKLab hue instead of median cut; no figure crop, no background removal), `pixelize` (PNG → asset via the editor's quantizer; specks far from the figure are ignored by the crop, `speck_fraction`), `generate` (fal.ai → PNG, `image_size` for landscape scenes; key from
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
  steps (by id); `map_render` paints every layer (ground, front, the moving ones) into a PNG, `map_export` writes a PNG,
  asset and text drawing per layer, `map_lint recipe=` lints each layer. The painter is pure and deterministic, an exact
  port of the game's drawing scripts (the ladera recipe gives 99.8 % of its pixels; `maprecipe.test.ts`).
- Text and control (`src/headless/ascii.ts`, `src/headless/inspect.ts`): `from_ascii` builds an asset from a text
  drawing and `to_ascii` writes any asset back in the same format (exact round trip). Format: header lines
  `id:`, `name:`, `category:`, `size: WxH` (inferred when missing), `description:` (repeatable), `fit: <asset>`,
  `generated_by: <command> key=value …` (what made it, as data: see "Generated and retouched" below),
  `retouch_of: <drawing>` (this drawing is the retouch layer of that one: every glyph but `.` goes
  over it, and `!` — `ERASE_GLYPH` — takes the pixel underneath **out**; `!` is rejected in the
  legend and in a drawing with no `retouch_of:`, so it can never be mistaken for a color),
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
  tile edges that do not meet. `fit` and `lint` accept a palette color at any opacity (`#rrggbbaa` whose
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
  In `character.ts` the two tables are kept apart on purpose: the **contract** (which animations, named how)
  belongs to the game, the **layout** (where this pack keeps each of them) belongs to the pack, so a game with
  another contract needs no new layout. The engine's word for a generator and the contract's word for a role
  can differ: a `technique` is generated as a `cast` (`GENERATOR_OF`).
- Figures (`src/headless/figure.ts`): `figure recipe=<json> out=<asset> view=front|back` draws a full-body fighter
  (48×40, about 30 px tall) from a rig instead of a base sprite: sphere-swept capsules in the character's own 3D
  frame, posed per frame from one pose table (`FIGURE_ANIMS`: idle, walk, attack, technique, hurt, die) and
  projected in 3/4 (front: turned to the lower left; back: from behind, turned to the upper right), z-buffered,
  shaded in three tones per material and outlined (ink also where a limb passes in front of the body). Every frame
  is drawn whole, so nothing comes apart. Recipe: build, skin, hair style/band/ribbon, hat, beard, top/sleeves,
  skirt, sash, pants, shoes, glow. Tests: `figure` in `headless.test.ts`.
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
  asset, and before accepting a retouch the question is whether it should be a parameter of the recipe.
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
  renders a folder. `sound_contact` checks WAVs without listening: duration, peak and RMS, DC, spectral centroid,
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
- **Typography example** (`examples/tipografia/`): **Nube 8**, a proportional pixel font with every glyph
  Spanish needs (111). `nube_base.txt` is drawn by hand (94 glyphs, cells of 8x11), `nube.compose.json`
  derives the 16 of the accents and the inverted punctuation, `nube.txt` is what `font_compose` writes and
  `nube.retoque.txt` the one thing left to the hand (one painted pixel, no erase: the font is finished, and
  the example is not the place to demonstrate a glyph). Its README is where the format, the metrics, the
  erase glyph and the way out to Godot are explained for a person.
- **Sound examples** (`examples/sonido/`): six recipes and one score, one per shape the engine makes
  (a hit, struck metal with its own partials, a looping ambience, an ambience populated with `events`,
  an interface pluck, a footstep on a material, a short loopable piece), with a README that says what
  each one teaches and how to render and check it. A test renders all seven and demands `0 with warnings`.
  They are the reference a new game starts from; the engine is generic, the examples are the only map of it.
- **A recipe as a transaction** (`src/headless/batch.ts`): `batch steps=[…]` or `batch recipe=<json>` runs a
  whole list of steps — each one `{ "command": "<name>", …its arguments }` — in **one** process. It is not
  about the clock (`bin/pss` is tsx with no build step, about 0.25 s to start): it is that "a recipe", the
  dozen or two calls that make one map or one character, did not exist as a unit, so nobody checked the set
  before the first file was written and a typo in step nine left half a recipe on disk. `batch` **validates
  every step against its command's schema before running any of them** and answers every problem at once
  with nothing written; then it runs them in order and answers one line per step (the same line MCP gives a
  writing command). `dry_run` only checks; `keep_going` runs them all and reports every failure instead of
  stopping at the first (a folder of independent drawings). Paths are relative to where you run it, as on the
  command line, and a batch cannot contain a batch. Authoring the 23 map recipes of the game (434 calls:
  `map_from_game`, the materials and the 286 steps) goes from 108 s in 434 processes to 0.4 s in one.
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
- `SpriteAsset.width/height` (a non-square canvas) is honored by **both** sides now: `dims(asset)`,
  `blankFrame(w, h)` and `blankFrameLike(asset)` in `assetModel.ts` are the only way to ask how big a canvas
  is — never `asset.size` as both axes, which is what kept a 448×224 map from opening in the editor.
  `AnimationDef.durations` (ms per frame) and `loop` are still headless-only in the UI.
- Coordinates in commands are x = column, y = row; frames stay `number[][]` as `[row][col]`.

First consumer: *The Unwritten Dao* (Godot), whose `arte.sh` rebuilds `art/pss/src/*.pss.json` from the
hand drawings in `art/pss/dibujos/*.txt` (`from_ascii`), exports them through `bin/pss export_sheet`,
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
npm test             # Unit tests (vitest)
npm run test:watch
supabase start       # Local backend (see README for ports and secrets)
deno test supabase/functions/_shared/   # Edge Function helper tests
```

CI (`.github/workflows/ci.yml`) runs lint, `tsc`, tests, build, and `deno check` of every function on every push and PR.

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
- **NUNCA realizar commits o push de forma automática**. Siempre solicitar verificación del usuario y esperar a que pida explícitamente el commit.
