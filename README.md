# 🎮 Pixel Sprite Studio

**An asset engine for games, driven by an agent.** PSS turns descriptions — text
drawings, recipes, prompts, scores — into the sprites, animations, sheets, map
grounds, illustrations, sounds and music a game loads, and then lets a person
retouch them by hand without losing the source.

It is **140 commands** on the same asset model, reachable three ways:

| Surface | What it is | Entry point |
|:---|:---|:---|
| **CLI** | `pss <command>` from a shell or a build script | `bin/pss` (`bin/pss help`) |
| **MCP** | the same commands as tools over stdio, one per command (`pss_render`, `pss_from_ascii`…) | `bin/pss-mcp` |
| **App** | a browser pixel-art editor (canvas, layers, timeline, onion skin) over the same files | `npm run dev`, port 8080 |

The CLI and the MCP server are the **headless** side (`src/headless/`): no React,
no Zustand, no backend, no browser. They are where the engine lives. The app is
the hand pass: open what the engine made, fix it, save it back.

> First consumer: *The Unwritten Dao* (Godot). Its `arte.sh` rebuilds the whole
> art of the game from text drawings and recipes through `bin/pss`, and its
> `sonido.sh` does the same for every sound and every piece of music.

## The axis: a drawing is text

The one idea everything else hangs from:

```
recipe / prompt / sheet  →  render  →  text drawing (.txt)  →  pixels
                                       ↑ the source of truth
```

`from_ascii` builds an asset from a text drawing — a header, a legend of
`glyph = #hex name`, and the frames as rows of glyphs — and `to_ascii` writes any
asset back in exactly the same format. The round trip is exact (tested over 79
real drawings). That is what makes "generate with an agent, retouch by hand"
real: the text is diffable, reviewable, editable by a person **and** by a model,
and it is never overwritten by the generator once a human has touched it.

What tells the two apart is one header line. Everything a command makes carries
`generated_by: <command> key=value …` — what made it and the arguments to make
it again, as data. **No header means drawn by hand**, so a recipe stops instead
of writing over it, and a retouch of something generated lives in its own file
beside it (`<drawing>.retoque.txt`) and is laid back on top as a layer. The
absence is the whole signal, which is why a command that only *changes* an asset
never stamps one.

That layer wins over the recipe: it can leave what was underneath (`.`), paint a
color, or **take a pixel out** (`!`), so what the editor shows is what the asset
ends up being. Every command that lays one on says how much of the drawing the
layer decides, and over a fifth it says the corrections belong in the recipe.

```
id: lantern
size: 16x24
. . . a a . . .
. a b b b b a .
```

## What it knows how to do

**A recipe as a transaction** — `batch`: a whole list of steps, each
`{ "command": "<name>", …its arguments }`, inline or as a JSON file you keep in
the repo, run in **one** process. Every step is checked against its command's
schema **before any of them runs**, so a typo in step nine answers before the
first file is written instead of leaving half a recipe on disk. `dry_run` only
checks, `keep_going` reports every failure instead of stopping at the first.

**Assets and drawing** — `new`, `info`, `inspect`, `draw` (ops), `frames`,
`anim`, `transform`, `resize`, `remap`, `despeckle`, `palette`, `palette_fit`,
`palette_show`, `png_fit`, `png_knockout`.

**Text drawings** — `from_ascii`, `to_ascii`, `ascii`, and `variant`: a copy of a
base with the changes painted on a layer of its own, so re-running it after the
base changes rebuilds the variant instead of losing it.

**Characters and animation** — the **animation contract is data** (`contract.ts`:
a list of names where `{view}` means one per view, `body` and `directional`
built in, a project declares its own), so `import_sheet` and `import_character`
(a borrowed sprite pack becomes one asset with the contract's tags), `animate`
(the anatomy engine: idle, walk, run, jump, attack, cast, hurt, die from a
single pose — or `contract=` to grow every animation of a contract and be told
which ones it could not), `lint contract=` (does this character keep it?),
`anatomy`, `figure` (a full-body fighter drawn from a rig, every frame whole),
`stamp` (a garment on a borrowed body, following the bob of the walk),
`face_points` (the eyes, the hairline and the skin of a sprite nobody annotated),
`fx`, `fx_anim`, `export_sheet` (1:1 PNG + Aseprite-style JSON).

**AI as raw material** — `generate` (fal.ai), `pixelize` and `illustrate` (a
render becomes pixels on your palette), `edit_zone` (redo one zone of a picture
and blend it back, the rest byte for byte), `depth` + `layers` (split an
illustration into parallax planes), `lights`, `cutout`. Keys live in the
environment or in `supabase/functions/.env`, never in a command argument.

**Maps as data** — 91 `map_*` steps plus `map_from_game`, `map_render`,
`map_export`, `map_compare`, `terrain` and `grid_mask`: a painted map ground
described as a recipe instead of a script. Deterministic and pure. See
[`docs/map_recipes.md`](docs/map_recipes.md) — and
[`docs/auditoria/`](docs/auditoria/README.md) for why this layer is frozen until
its [open question](https://github.com/Khadosh/pixel-sprite-studio/issues/1) is
answered.

**Sound and music** — `sound` (recipes: layers of oscillators, noise, plucked
and struck strings, modal bells, crackle, with filters, ADSR, LFOs, echo and
seeded events; `loop: true` writes a real loop point), `music` (`.partitura`
text scores over nine built-in instruments), `sound_contact`. Start at
[`examples/sonido/`](examples/sonido/README.md).

**Typography** — `font` (a glyph sheet is a text drawing; the advance comes from
the ink, so the drawing is the metric), `font_compose` (the accents and the
inverted punctuation of Spanish derived from the letters already drawn) and
`font_contact`. Out to an AngelCode BMFont a game engine reads. Start at
[`examples/tipografia/`](examples/tipografia/README.md).

**Control, without eyes** — the part that makes agentic generation safe:
`render`, `contact` (a sheet of assets next to the player, to catch the lantern
that came out bigger than the house), `lint` (colors off the palette, lone
pixels, tile edges that do not meet, detached pieces), `map_lint`, `map_compare`
(how many pixels differ from the reference, with the differences in magenta),
`sound_contact` (duration, peak, RMS, DC, spectral centroid, loop seam, clicks)
and `font_contact` (a phrase set with the font: missing glyphs, letters that
touch, the rows of the cell the ink really uses). Every one of these was born
the same day as the bug it would have caught.

`bin/pss help` lists all of them; `bin/pss help <command>` gives one its schema.

## From an agent (MCP)

Point the client's `.mcp.json` at `bin/pss-mcp`:

```json
{
  "mcpServers": {
    "pss": { "command": "/path/to/pixel-sprite-studio/bin/pss-mcp" }
  }
}
```

Every command shows up as `pss_<command>`. Two things to know about the answers:

- A command that **produces text worth reading** answers that text whole, even
  though it also writes files: the control table of `sound` and `music`, the
  grid of `map_from_game`, the files of `map_export`, the report of `batch`. The
  cut is not "does it write?" — it is "does it have something to say?".
- A command with **nothing to say** answers **one line** ("what it wrote, its
  size, its animations") and no image. Ask for the picture with `preview: true`,
  or the full detail with `pss_inspect`. An agent pays for every byte it reads.
- A command that **looks** (`render`, `ascii`, `contact`, `lint`, `map_render`,
  `map_compare`, `map_lint`, `sound_contact`, `font_contact`, `info`, `inspect`,
  `palette_show`, `face_points`) answers in full, **image included**. The list is
  `LOOKING` in `src/headless/brief.ts`.

The cheapest way to look at pixels is `pss_ascii`: the frame as text, no image at
all.

## From a shell (CLI)

```bash
npm install                                     # tsx, the only thing the CLI needs

bin/pss new path=/tmp/lantern.pss.json width=16 height=24 'palette=["#000000","#e8c170"]'
bin/pss from_ascii txt=art/dibujos/lantern.txt out=/tmp/lantern.pss.json
bin/pss animate path=/tmp/hero.pss.json base=0 anim=walk_down
bin/pss render path=/tmp/lantern.pss.json out=/tmp/look.png scale=6
bin/pss lint 'paths=["/tmp/lantern.pss.json"]' palette=art/palette.pss.json
bin/pss export_sheet path=/tmp/hero.pss.json out=game/art/hero.png
bin/pss batch recipe=art/recetas/jugador.json       # the whole recipe, one process
bin/pss batch recipe=art/recetas/jugador.json dry_run=true   # check it, write nothing
```

Arguments are `key=value` (JSON values for arrays and objects) or one JSON blob:
`bin/pss draw '{"path":"…","frame":0,"ops":[…]}'`. Coordinates are `x` = column,
`y` = row.

## The app

A browser editor over the same assets: pixel canvas with brush, fill, shapes and
selection, layers, a multi-frame timeline with per-animation FPS, onion skin,
the anatomy panel, palette tools, PNG and GIF export, and AI generation through
Supabase Edge Functions (fal.ai for sprites and perspectives, Gemini for
animation frames).

```bash
npm install
npm run dev        # http://localhost:8080
```

Its most useful route for the pipeline above is **`/dibujo`**: open a `.txt` text
drawing from disk, retouch it with the mouse, save it back to the same file, and
the agent keeps working on what you saved. No backend needed for that page.

Projects, sprites, auth and the AI quota need Supabase; the local stack is below.

### Local stack (Docker + Supabase)

**Prerequisites:** Docker Desktop and the
[Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start                              # Postgres, Auth, Studio, Edge Functions
cp .env.example .env.local                  # the API URL and anon key it printed
cp supabase/functions/.env.example supabase/functions/.env   # GEMINI_API_KEY, FAL_AI_KEY
docker compose up --build                   # frontend with hot reload
```

| Service | URL |
|:---|:---|
| App | http://localhost:8080 |
| Supabase API | http://127.0.0.1:54421 |
| Supabase Studio | http://127.0.0.1:54423 |
| Mail inbox (auth emails) | http://127.0.0.1:54424 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54422/postgres` |

Ports are offset by +100 from the Supabase defaults (see `supabase/config.toml`)
so this project can coexist with other local Supabase projects.

**Secrets:** `.env` / `.env.local` hold only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, both public by design — never put a secret behind a
`VITE_` prefix, Vite ships every one of them to the browser. Edge Function
secrets live in `supabase/functions/.env` locally and in `supabase secrets set`
in the cloud. All `.env` files are git-ignored; only the `.env.example`
templates are committed.

Stop everything with `docker compose down` and `supabase stop`.

## Asset format

- A **frame** is `number[][]` (`[row][col]`); each number is a palette index and
  `0` is transparent.
- A **layer** holds its own frames plus visibility, lock and opacity.
- An **animation** is a list of frame indices, with optional `fps`, `durations`
  and `loop`.
- An **asset** is a palette (`{index: "#rrggbb"}`), color names, layers,
  animations and optional anatomy. On disk it is a `.pss.json`; in the DB and in
  localStorage it is compressed (`src/lib/spriteDto.ts`).
- The text form of all of it is the `from_ascii` drawing.

## Tests and CI

```bash
npm test                                 # 500+ unit tests (vitest), headless included
npm run lint                             # ESLint, 0 errors
npx tsc -p tsconfig.app.json --noEmit    # types
deno test supabase/functions/_shared/    # Edge Function helpers
```

CI (`.github/workflows/ci.yml`) runs lint, `tsc`, tests, build and `deno check`
of every function on every push and PR.

## Where the documentation is

| File | What it holds |
|:---|:---|
| [`AGENTS.md`](AGENTS.md) | **read this first.** The architecture, every headless capability in detail, the conventions, and the "do NOT" list. `CLAUDE.md` is a symlink to it |
| [`docs/auditoria/`](docs/auditoria/README.md) | October 2026: what PSS actually is, the gap to PGS, and where to start |
| [`ROADMAP_IMMEDIATE.md`](ROADMAP_IMMEDIATE.md) | the current sprint. Check before starting anything |
| [`ROADMAP_NEXT.md`](ROADMAP_NEXT.md) | the strategic backlog, and the principle: PSS is an engine, not a collection of assets |
| [`ROADMAP_COMPLETED.md`](ROADMAP_COMPLETED.md) | what is already done |
| [`docs/map_recipes.md`](docs/map_recipes.md) | map recipes (`map_*`) in depth |
| [`examples/sonido/`](examples/sonido/README.md) | sound and music, by example |
| [`examples/tipografia/`](examples/tipografia/README.md) | a pixel font, by example: the format, the recipe, the retouch and the way out to Godot |
| [`AUDIT_TECNICA.md`](AUDIT_TECNICA.md) | code, backend and security audit (2026-09), still current |
| [`AUDIT.md`](AUDIT.md) | product audit (2026-04), **superseded** — kept for the positioning and the AI cost risk |
| [`CHANGELOG.md`](CHANGELOG.md) | what changed, day by day |

## License

MIT
