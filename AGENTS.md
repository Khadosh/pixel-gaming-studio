# AGENTS.md — Pixel Sprite Studio

> This file provides project context for AI coding assistants. `CLAUDE.md` is a symlink to it.
> Last verified against the code: 2026-10-01. If you find a discrepancy, fix this file in the same change.

## Project Overview

Pixel Sprite Studio is a browser-based pixel art editor with AI-assisted sprite and animation generation. Users create, animate, and export pixel art sprites (16, 32, 64 or 128 px) with a layer system, multi-frame timeline, anatomy-driven procedural animations, and persistent cloud storage.

Key capabilities:
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
| `src/pages/TextDrawing.tsx` | `/dibujo`: opens a text drawing (`from_ascii` format) in the editor and saves it back to the same `.txt`. No backend |
| `src/lib/textDrawing.ts`, `src/lib/textFileAccess.ts` | Text drawing ↔ editor asset (session keeps glyphs, real canvas size; `warnings` for what the text cannot hold) and local file open/save (File System Access API, else input + download) |
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
- Commands: `new`, `info`, `ascii`, `render`, `import_sheet` (grid cut, exact colors; `into` appends to an existing asset),
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
- Registry in `src/headless/commands.ts` (zod schemas); CLI and MCP are thin adapters.
  Add a command there and both fronts get it. Tests: `src/headless/headless.test.ts`
  (node environment, no jsdom).
- Model additions honored only by the headless side for now: `SpriteAsset.width/height`
  (non-square canvas), `AnimationDef.durations` (ms per frame) and `AnimationDef.loop`.
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
- A **frame** is `number[][]`, a square grid. Each number is a palette index; `0` = transparent.
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
