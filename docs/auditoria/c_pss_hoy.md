# PSS hoy — qué es, qué está sólido, qué bloquea el salto a PGS

> Auditoría del estado actual de Pixel Sprite Studio. 6 de octubre de 2026.
> Medido contra el código en `main` (`8743af6`), no contra la documentación.
> Ángulo: PSS **como está hoy**. Las propuestas de PGS van en los otros documentos.

---

## 0. Resumen

PSS ya no es lo que dice ser. El `README.md` lo presenta como «a browser-based pixel
art editor with AI-assisted sprite and animation generation»; en la práctica es un
**motor de assets por línea de comandos con 136 comandos**, con un editor web encima
que no se toca desde el 1 de octubre y un backend de Supabase que no se toca desde el
22 de septiembre. Los 47 commits de octubre suman 431 archivos tocados: **403 en
`src/headless/`**, 13 en `docs/`, 7 en `src/lib/` y 8 en la app (`components` y `pages`).

Los números de las tres superficies:

| Superficie | Archivos (sin tests) | Líneas | Último commit propio |
|:---|---:|---:|:---|
| `src/headless/` (CLI + MCP) | 61 | 17.794 | 6 de octubre |
| App web (`components`, `pages`, `hooks`, `integrations`, sin `ui/`) | 84 | 13.460 | 1 de octubre |
| `src/lib/` (modelo compartido) | — | 7.320 | 1 de octubre |
| `supabase/` (3 Edge Functions + `_shared` + migraciones) | — | 1.025 | 22 de septiembre |
| `src/components/ui/` (shadcn generado) | 19 | 1.215 | — |

Tests: **35 archivos, 504 tests, todos verdes en local** (9,6 s). De esos, 19 archivos
y 4.425 líneas son del headless.

Y sin embargo **CI está roja en `main` desde el 5 de octubre**, cuatro corridas
seguidas. No son los tests: es `eslint` (1 error) y `tsc` (81 errores). Detalle en §4.2.

---

## 1. El mapa del repo: tres superficies

### 1.1 Qué hay

**La app web.** React 18 + Vite 5 + Tailwind + shadcn, Zustand en 9 slices, TanStack
Query, React Router. Backend Supabase: tablas `projects` / `project_sprites` (JSONB
con RLS) / `user_ai_usage`, y tres Edge Functions en Deno (`generate-sprite-fal`,
`generate-perspective-fal`, `generate-animation`) con `requireUser` + cuota atómica.
Nueve rutas (`src/App.tsx:64-78`), de las cuales dos son herramientas locales
(`/icon-preview`, `/dibujo`).

**El headless por CLI.** `bin/pss` es un shell script de 5 líneas que ejecuta
`node_modules/.bin/tsx src/headless/cli.ts`. El registro vive en
`src/headless/commands.ts` (1.545 líneas) con un esquema zod por comando. `cli.ts`
son 77 líneas: parsea `key=value` o un JSON, llama a `runCommand`, imprime.

**El MCP.** `bin/pss-mcp` → `src/headless/mcp.ts`, **40 líneas**. Itera el mismo
registro y registra cada comando como `pss_<nombre>` sobre stdio. El repo del juego
apunta su `.mcp.json` ahí.

### 1.2 Qué comparten y qué duplican

Lo importante: **CLI y MCP no duplican nada**. Son dos adaptadores finos (77 y 40
líneas) sobre un registro único. Esa es una de las mejores decisiones del repo: agregar
un comando lo da en los dos frentes gratis.

La única divergencia real entre CLI y MCP es intencional y está en `src/headless/brief.ts`
(70 líneas): sobre MCP, los comandos que *escriben* contestan **una línea** y no mandan
la imagen salvo con `preview: true`, porque un agente paga cada byte que lee. Los nueve
comandos del set `LOOKING` (`info`, `inspect`, `ascii`, `render`, `contact`, `lint`,
`palette_show`, `sound_contact`, `face_points`) contestan completo. Es una decisión de
economía de contexto, no deuda.

**Entre la app y el headless casi no hay puente.** La app importa exactamente dos
módulos del headless, y sólo desde `src/lib/textDrawing.ts:11-12`:

```
import { fromAscii, toAscii, type AsciiLayout } from '@/headless/ascii';
import { normalizeHex } from '@/headless/assetModel';
```

Eso es todo. El headless, por su lado, importa `src/lib/types.ts` (el contrato
`SpriteAsset` / `Frame` / `AnimationDef`) y nada más de la app. El reparto está bien
hecho y es deliberado: `assetModel.ts` es el modelo puro sin un solo import de Node
(«so the browser can use it too», dice su encabezado) y `asset.ts` son 20 líneas que le
agregan disco. Por eso `/dibujo` pudo existir.

### 1.3 Qué sabe hacer una y la otra no

| | App web | Headless |
|:---|:---|:---|
| Dibujar píxel por píxel con el mouse, selección, rotar, zoom, simetría | **sí** | no |
| Línea de tiempo con drag & drop, piel de cebolla, playback | **sí** | no |
| Capas con visibilidad, bloqueo, opacidad (UI) | **sí** | parcial (el modelo las tiene) |
| Marcar anatomía por píxel a mano | **sí** | no (`anatomy` acepta filas, no píxeles) |
| Proyectos, usuarios, nube, cuota de IA | **sí** | no |
| Exportar GIF | **sí** | no |
| Importar PNG/GIF por UI | **sí** | no (`import_sheet` existe pero sin panel) |
| Lienzo no cuadrado (`width`/`height`) | **no** | sí |
| `durations` y `loop` por animación | no | sí |
| Dibujo como texto (`from_ascii`/`to_ascii`) | sí (sólo `/dibujo`) | sí |
| Recetas de mapas (91 comandos), `map_render`, `map_export`, `map_lint` | no | **sí** |
| Figuras por rig 3D (`figure`), `stamp`, `face_points`, `variant` | no | **sí** |
| Telones: `illustrate`, `edit_zone`, `depth`, `layers`, `lights`, `cutout` | no | **sí** |
| Sonido y música por receta (`sound`, `music`, `sound_contact`) | no | **sí** |
| Control de calidad: `contact`, `lint`, `map_lint`, `map_compare` | no | **sí** |
| Export hoja 1:1 + JSON estilo Aseprite (`export_sheet`) | parcial (PNG/GIF) | **sí** |

La asimetría es la noticia: **todo lo que produjo el arte de un juego entero está
solamente en el headless**, y todo lo que permite retocar a mano está solamente en la
app. Las dos mitades se tocan en un único punto (`/dibujo`) y sobre un único formato
(el texto). Eso es exactamente la brecha de §5.

### 1.4 Cuántos comandos y cómo están agrupados

`pss help` lista **136 comandos**. El corte:

| Grupo | Comandos | Dónde vive |
|:---|---:|:---|
| Modelo y mirada (`new`, `info`, `inspect`, `ascii`, `render`, `frames`, `anim`, `resize`, `transform`, `remap`, `despeckle`) | 11 | `assetModel.ts`, `render.ts`, `ops.ts` |
| Dibujo y FX (`draw`, `fx`, `fx_anim`) | 3 | `ops.ts` |
| Paleta (`palette`, `palette_fit`, `palette_show`, `png_fit`, `png_knockout`) | 5 | `ops.ts` |
| Hojas (`import_sheet`, `import_character`, `export_sheet`) | 3 | `sheet.ts`, `character.ts` |
| Texto (`from_ascii`, `to_ascii`) | 2 | `ascii.ts` (446 líneas) |
| Control (`contact`, `lint`, `map_lint`) | 3 | `inspect.ts`, `maplint.ts` |
| IA como materia prima (`generate`, `pixelize`, `illustrate`, `edit_zone`, `depth`, `layers`, `lights`, `cutout`) | 8 | `ai.ts` (622), `zones.ts`, `backdrop.ts` |
| Cuerpos (`figure`, `animate`, `anatomy`, `variant`, `stamp`, `face_points`) | 6 | `figure.ts` (884), `animate.ts`, `variant.ts`, `stamp.ts`, `face.ts` |
| Suelos sueltos (`terrain`, `grid_mask`) | 2 | `terrain.ts`, `gridmask.ts` |
| Sonido (`sound`, `sound_contact`, `music`) | 3 | `sound/` (9 archivos, 1.787 líneas) |
| **Mapas por receta (`map_*`)** | **91** | `maprecipe.ts`, `mappaint.ts`, `mapnoise.ts`, `mapfile.ts`, `mapsteps/` |
| **Total** | **136** | |

Los 91 `map_*` son **67 % del catálogo**. Es la deuda del issue #1, medida desde otro
lado: dos de cada tres comandos de PSS hablan de mapas, y la mayoría de esos de un mapa
puntual de The Unwritten Dao.

### 1.5 Qué cubren los tests de verdad

504 tests en 35 archivos. Lo que miden, por familia:

- **`headless.test.ts` (1.184 líneas)**: el grueso del motor comando por comando, vía
  `runCommand`. Cubre 41 comandos distintos de los 136.
- **`maprecipe.test.ts`, `maplint.test.ts`, `gridmask.test.ts`, `terrain.test.ts`,
  `backdrop.test.ts`**: la infraestructura genérica de mapas y telones.
- **`mapsteps/*.test.ts` (10 archivos, 2.037 líneas)**: tests de **imagen de oro**.
  Pintan una receta de los fixtures y la comparan píxel a píxel contra el PNG que
  produjo el script de Python del juego. Ejemplo literal
  (`mapsteps/glensteps.test.ts:33-41`): «every layer is the same as the script painted,
  pixel for pixel», sobre siete capas.
- **`sound/*.test.ts`**: determinismo, niveles, costura del loop, afinación.
- **`ascii.test.ts` + `src/lib/textDrawing.test.ts` (87 tests)**: la ida y vuelta exacta
  del formato de texto, sobre los 79 dibujos reales del juego copiados a
  `src/headless/fixtures/dibujos`.
- **App**: 9 archivos. Casi todos testean slices del store a través de hooks que ya no
  existen con ese nombre (`useLayerActions.test.ts` y compañía); `ExportMenu.test.tsx`
  es el único de componente. Nada de E2E: hay `@playwright/test` y `playwright.config.ts`
  desde abril, cero specs.

Lo que **no** cubren, y es relevante:

- **Los esquemas zod de los 91 `map_*` están casi sin probar.** Los tests de `mapsteps`
  llaman a los pintores (`paintMap`, `renderRecipe`, `runLines`) y a recetas de fixture,
  no a `runCommand('map_glen', …)`. 95 de los 136 comandos no tienen un test que los
  invoque como comando. Eso explica que los 81 errores de `tsc` vivan precisamente en
  esos archivos de test sin que nadie se entere.
- **La app arriba de los slices.** El canvas, el lienzo, el guardado, `/dibujo` como
  página: nada.
- **El backend.** Sólo `deno test` de `_shared` (dos archivos). Las tres Edge Functions
  no tienen test.

Un número incómodo: los fixtures ocupan **1,9 MB en `src/headless/fixtures/mapas`**
(106 archivos: PNGs de los scripts del juego, recetas y JSONs de mapa) y 408 KB en
`fixtures/dibujos`, todo trackeado en git (137 archivos). La red de seguridad del motor
de mapas **es** una colección de assets de un juego. Funciona, pero es el mismo problema
del issue #1 una capa más abajo.

---

## 2. Qué envejeció en `AUDIT.md` (8 de abril de 2026)

`AUDIT.md` es una auditoría **de producto SaaS**: FODA, benchmarking contra Aseprite y
Piskel, tiers de $9/$29, marketplace con revenue share, proyección de $12.700/mes con
5.000 MAU. Está escrito seis meses antes de que existieran el headless, el CLI, el MCP,
las recetas de mapas, el sonido y la música, y antes de haber hecho el arte entero de un
juego con PSS.

### Ya no es cierto

| Lo que dice `AUDIT.md` | Qué pasó |
|:---|:---|
| «Pixel Sprite Studio es un **editor de pixel art browser-based**» (§1) | Hoy el 93 % del trabajo de octubre fue headless. El editor es una de tres superficies, y la que menos se mueve. |
| «Generación de sprites y animaciones via IA (**Google Gemini 2.5 Pro**)» (§1) | Los sprites y las perspectivas son fal.ai; Gemini quedó sólo para cuadros de animación. Y la IA dejó de ser el motor: `generate`/`pixelize`/`illustrate` son materia prima para pasadas de pulido, no el producto. La lección registrada en `ROADMAP_IMMEDIATE.md` es que a 16 y 32 px un objeto simple sale mejor con `draw` que pixelizado. |
| D2 «Sin herramienta de selección», D4 «Canvas sin zoom», D3 «Sin importación de imágenes» — los **tres features críticos** sin los cuales «la retención será baja» (§10) | Los tres están hechos (`AGENTS.md` los lista: selección con move/rotate/resize, zoom & pan, import de imagen y GIF con cuantización). Y resultaron irrelevantes para el único usuario real: lo que desbloqueó el arte de un juego fue el dibujo por texto, no el zoom. |
| D1 «TypeScript no-strict» | `tsconfig.app.json` tiene `"strict": true`. |
| D7 «Sin undo para operaciones de alto nivel» | `historySlice` con checkpoints explícitos. |
| D11 «CORS abierto», §4.3 «Rate limiting en Edge Functions: 🔴 Urgente» | Resueltos el 22 de septiembre (`_shared/cors.ts`, `_shared/usage.ts`, RPC `increment_ai_usage`). |
| D13 «Versión 0.0.0, sin changelog» | `0.1.0`, nombre real, y un `CHANGELOG.md` de 459 líneas que es hoy el documento más vivo del repo. |
| «Catálogo de assets estático — solo 16 sprites pre-cargados» (D10) | Irrelevante: los assets que importan son los 969 PNG y 792 `.pss.json` del repo del juego, afuera de PSS. |
| Todo el §3 (comparativa contra Aseprite / Piskel / PixilArt) | Compara editores para humanos. PSS compite hoy, si compite con algo, contra *scripts de Python escritos a mano por un agente*. El competidor real de `pss map_glen` es `scripts/suelo_rio_arriba.py`, no Aseprite. |
| Todo el §5 y §7 (monetización, distribución, Product Hunt, MAU, conversión Free→Pro) | No hay señal de que se haya trabajado en nada de eso en seis meses. Es un plan para un producto que PSS no está siendo. |
| §4.2 «Spritesheet JSON metadata — no listado» | Hecho en headless (`export_sheet`, JSON estilo Aseprite con `frameTags` y `durations`). |

### Sigue valiendo

- **El posicionamiento negativo.** «Aseprite es intocable para pixel artists serios. PSS
  debe ir por el segmento de game devs no-artistas» (§3.2). Resultó más cierto de lo que
  el documento imaginaba: el usuario de PSS no dibuja, dirige.
- **A3 «Costos de IA escalables»** y **A5 «Dependencia de Gemini»**: vigentes. La única
  mitigación es que la IA perdió centralidad.
- **O4 «Integración con game engines»**: es lo que efectivamente pasó, por otra puerta
  (PNG + JSON que Godot lee con `"kind": "pss"`), no por un botón «Export a Godot».
- **El reflejo de fondo** — un asset suelto no sirve, lo que sirve es un juego entero de
  assets coherentes — anticipa la Fase 9 y el salto a PGS. `AUDIT.md` lo escribió como
  «Game Asset Suite» pensando en una UI; terminó siendo un CLI.

**Veredicto:** `AUDIT.md` ya no es una auditoría, es un documento histórico. Debería
quedar marcado como tal arriba del título, no citado en `AGENTS.md` como «estado y plan
de retoma».

---

## 3. Qué envejeció en `AUDIT_TECNICA.md` (22 de septiembre de 2026)

Esta envejeció mucho mejor, porque se ejecutó. Verifiqué los hallazgos uno por uno
contra el código.

### Resueltos (verificado)

| Hallazgo | Estado hoy |
|:---|:---|
| C1 + C2: dos Edge Functions gastando fal.ai sin autenticar | `supabase/functions/_shared/` existe con `auth.ts`, `usage.ts`, `validate.ts`, `cors.ts`, `http.ts`, `llm.ts`. `generate-sprite/` (la función muerta) se borró. |
| A1: límite diario eludible por concurrencia | `20260922120000_atomic_ai_usage.sql`. |
| A4: no existe `_shared` | Existe, con tests Deno (`llm_test.ts`, `validate_test.ts`). |
| Doc desincronizada (§4, el hallazgo más grave) | `AGENTS.md` reescrito contra el código, con fecha de verificación arriba y `CLAUDE.md` como symlink real. Es hoy la mejor documentación del repo. |
| Dos headers / dos menús de exportar (§1) | Unificados (`EditorHeader` con `variant`, `ExportMenu` compartido, commit del 22/9). |
| Dos clientes de Supabase | Uno (`src/lib/supabase.ts`); `src/integrations/supabase/client.ts` borrado. |
| Código muerto (§3) | Borrado: `useGenerateSprite.ts`, `Index.tsx`, `NavLink.tsx`, `pixelCharacter.ts`, los dos `bun.lock*`. `src/components/ui/` bajó de 48 a **19** componentes. |
| Tres lockfiles | Uno, con `"packageManager": "npm@10"`. |
| B5 «Sin CI» | `.github/workflows/ci.yml` con dos jobs (frontend + Deno). |
| M2 slug único global, M5 esquema sin índices ni trigger | `20260922130000_schema_hardening.sql`. |
| M3 snapshot local pisando la DB | Snapshot con hash del asset; se descarta si no coincide. |
| M6 sesión expirada sin manejo global | `QueryClient` con manejo de 401 en `App.tsx`. |
| D1 / Fase 4.14 `strict: true` | Activado. |
| 59 dependencias, 38 sólo por shadcn | 64 declaradas, pero con los 29 componentes shadcn sin uso borrados. |

### Ya no es cierto por otra razón

- **«87 tests, todos pasan»** → 504 tests. **«13 archivos de test»** → 35.
- **«~24.000 líneas TS/TSX en 224 archivos»** → 39.728 en 209 archivos (sin tests ni
  `ui/`). Creció 65 % en dos semanas, todo del lado headless.
- **«Errores de tipos (`tsc`, strict off): 2»** → **81 errores con strict on**, todos
  nuevos, 76 de ellos en `src/headless/mapsteps/`. El indicador se dio vuelta.
- **«Problemas de ESLint: 187 (161 errores, 26 warnings)»** → 181 problemas, pero
  **1 error y 180 warnings**. Mejoró en forma pero el único error rompe CI.
- **«CI: No existe»** → existe y está roja. Es peor que no existir, porque nadie la mira.

### Sigue valiendo, sin tocar

- **A6 / `npm audit`**: eran 27 vulnerabilidades (2 críticas, 17 altas); hoy son **23
  (2 críticas, 13 moderadas/altas)**. Nunca se corrió el upgrade de la Fase 4.
- **M4** (purga silenciosa de `versions` sobre 1 MB, sin paginación): el select parcial
  se hizo, la purga silenciosa y la falta de paginación siguen.
- **B2** (fuga de detalle en mensajes de error).
- **Fase 4.13** (upgrade escalonado Vite 8 / Vitest 5 / Router 7 / React 19 / Tailwind 4):
  intacta. Es la causa de las dos críticas.
- **«Los tests de `SpriteEditor/hooks/tests/` conservan los nombres viejos … son el
  último fósil de la arquitectura de hooks»**: siguen ahí, con los mismos nombres.
- **Cero E2E** con Playwright instalado.

**Veredicto:** `AUDIT_TECNICA.md` cumplió. Lo que queda abierto es la Fase 4 completa
(dependencias) y el fósil de los tests de la app. Lo que **no** cubre, por fecha, es
todo el headless: no hay una sola línea sobre CLI, MCP, mapas ni sonido, que es el 93 %
de la actividad reciente. Esa es la auditoría que falta, y es este documento.

---

## 4. La deuda

> **Estado del backlog.** `gh issue list --repo Khadosh/pixel-sprite-studio --state all`
> devuelve **un solo issue, el #1**, abierto el 6 de octubre. La CI roja y el proceso por
> paso están identificados pero **no hay issue para ninguno de los dos**. Van acá con los
> números para que se puedan abrir tal cual. Contrasta con el repo del juego, donde
> «todo pendiente es un issue»: en PSS el backlog vive en tres archivos de ROADMAP y en el
> `CHANGELOG`, no en GitHub.

### 4.1 Issue #1 — los pasos de mapa que son de un juego (abierta, es la grande)

El issue está bien planteado y los números se verifican. Agrego precisión al reparto:

| | líneas |
|:---|---:|
`src/headless/mapsteps/` total (lo que cita el issue) | 8.606
— de eso, tests | 2.037
— de eso, **código** | 6.569
Los seis pintores con nombre de escena (`alpine`, `riverbank`, `glen`, `terrace`, `cavern`, `grove`) | **3.886**
Sus seis esquemas zod (`*schema.ts`) | **1.108**
Pasos genéricos reutilizables (`schema`, `room`, `network`, `feature`, `cliff`, `flight`, `planks`, `flagstones`, `paving`, `rope`, `lowland`) | 1.575
Infraestructura genérica, afuera de `mapsteps/` (`mappaint` 1.307, `mapfile` 372, `maprecipe` 314, `maplint` 215, `gridmask` 152, `mapnoise` 148) | 2.508

**4.994 de 6.569 líneas de `mapsteps/` (76 %) son una escena concreta**, y **31 archivos
de `src/headless/` mencionan «The Unwritten Dao» por nombre**. `map_cushions` (almohadones
de musgo mojado) y `map_glenlitter` existen porque existe un claro al pie de un salto en
un juego.

**Qué cuesta hoy en el flujo agéntico.** Tres cosas concretas, no una molestia estética:

1. **El catálogo del MCP.** Un agente que carga el servidor `pss` recibe **136 descripciones
   de herramientas**, 91 de ellas `map_*`, muchas párrafos enteros («Add or replace (by id)
   a cliff step of a map recipe: the map ends at the lip of a plateau (on the left); beyond
   it, far below, a sea of mist…»). Eso se paga en contexto en **cada** sesión, incluso
   cuando el agente va a dibujar una carta. Y hace más difícil elegir: con doce comandos
   que dicen cosas parecidas sobre musgo mojado, la decisión correcta deja de ser obvia.
2. **La próxima escena no se compone, se programa.** Un mapa nuevo que no sea uno de los
   siete ya portados no tiene pasos que lo cubran; hay que escribir otro archivo con otro
   nombre propio. El costo marginal de un mapa nuevo no bajó con los siete anteriores.
3. **CI roja.** 76 de los 81 errores de `tsc` están en los tests de `mapsteps/` (§4.2).
   La capa que no es motor es la que rompe la verificación de todo lo demás.

**Qué costaría arreglarla.** De las cuatro opciones del issue, el costo es muy distinto:

- *Congelar* (opción 1): cero trabajo, deja los tres costos de arriba intactos. Salvo el
  2, que al menos deja de crecer.
- *Separar en `examples/`* (opción 2): bajo, una tarde de mover archivos y cambiar imports.
  **Resuelve el costo 1 si además los `map_*` de escena salen del registro del MCP** y se
  exponen por otra vía (un comando `map_example` con un nombre de escena, o un segundo
  servidor MCP que se carga sólo cuando se van a hacer mapas). Ese detalle es lo que
  convierte la opción 2 de cosmética en útil.
- *Destilar* (opción 3): alto, pero con red. Los cuatro `glen*` y los tres `wet*` son
  candidatos obvios a ser uno con opciones. El riesgo está acotado porque `map_compare` y
  los tests de cero píxeles dicen si se rompió algo. Estimo que las seis familias se
  reducen a entre 15 y 25 comandos genéricos, o sea del orden de 70 comandos menos en el
  catálogo. Varios días, y no le da nada al jugador en el corto plazo.
- *Que los ejemplos generen* (opción 4): es un proyecto, no una tarea, y depende de
  decidir antes qué es «una escena» como dato.

### 4.2 CI roja en `main` (no anotada en GitHub)

Cuatro corridas fallidas seguidas: `37471651639` (6/10), `37370849101` (5/10),
`37360459780` (5/10), `37331562943` (5/10). La última verde es del 1 de octubre.

La causa no son los tests (504 pasan en local y pasarían en CI). Son los otros dos pasos
del job `frontend`:

- **`npm run lint`: 1 error.** `src/headless/mapsteps/grovesteps.test.ts:125:26` —
  `@typescript-eslint/no-unused-expressions`, «Expected an assignment or function call and
  instead saw an expression». Más 180 warnings (casi todos `no-explicit-any`), que no
  rompen.
- **`npx tsc -p tsconfig.app.json --noEmit`: 81 errores**, repartidos así:

  | archivo | errores |
  |:---|---:|
  | `mapsteps/riverbanksteps.test.ts` | 27 |
  | `mapsteps/lowlandsteps.test.ts` | 25 |
  | `mapsteps/terracesteps.test.ts` | 12 |
  | `mapsteps/terrace.ts` | 5 |
  | `mapsteps/cavernsteps.test.ts` | 4 |
  | `mapsteps/alpinesteps.test.ts` | 3 |
  | `terrain.test.ts` | 2 |
  | `mapsteps/cavern.ts`, `mappaint.ts`, `commands.ts` | 1 cada uno |

  El patrón dominante es trivial y repetido: tuplas declaradas con `as const` en los
  tests (`readonly [0, 1, 12, 9]`) que no entran en los `[number, number, number, number]`
  mutables de los esquemas. Ejemplo literal: «The type `readonly [0, 1, 12, 9]` is
  `readonly` and cannot be assigned to the mutable type `[number, number, number, number]`».

**Qué cuesta hoy.** Todo: con CI roja de forma permanente, el semáforo deja de informar.
Un agente que rompa algo de verdad la semana que viene no se va a enterar, porque rojo es
el estado normal. Y como `npm test` corre *después* de `lint` y `tsc` en el mismo job, los
504 tests **no se están ejecutando en CI desde el 5 de octubre**. La red de seguridad del
motor de mapas existe en la máquina de Joaquín y en ningún otro lado.

**Qué costaría arreglarla.** Horas, no días. El error de eslint es una línea. Los 81 de
`tsc` son mecánicos: o se les quita el `as const` a los literales de los tests, o los
esquemas aceptan `readonly`. Lo que hay que agregar es lo que impidió que se filtraran:
los esquemas zod de 91 comandos sin un test que los invoque como comando (§1.5). Vale
también partir el job en dos (`lint`+`tsc` y `test`) para que un error de tipos en un test
no impida correr los tests.

### 4.3 Un proceso por paso (no anotada en GitHub)

`bin/pss` no es un binario: es `exec node_modules/.bin/tsx src/headless/cli.ts`. Cada
invocación arranca Node y transpila TypeScript desde cero. Medido: **~0,19 s** por llamada
sólo de arranque, antes de hacer nada.

Y la unidad de trabajo del motor de mapas es **un comando por paso**. En el repo del juego
hay **23 recetas de suelos con 274 pasos en total** (de 3 a 23 pasos cada una: `cumbre`
tiene 23, `cumbre_alta` 22, `otra_orilla` 22). Armar una receta desde cero es una llamada
por paso más el `map_render`, y cada paso es apenas un `upsertStep` que lee el JSON de la
receta, le mete un objeto y lo vuelve a escribir.

**Qué cuesta hoy.** Por el lado del MCP, poco: el servidor es un proceso de larga vida y
paga el arranque una vez. Por el lado del CLI, que es lo que usan `arte.sh` y los scripts
del juego, un mapa de 20 pasos regala ~4 s de arranque puro, y rearmar los 23 mapas son
~52 s de `tsx` antes de pintar un píxel. Lo más caro no es el reloj: es que **no existe la
noción de «una receta» como transacción**. Veinte procesos que leen y reescriben el mismo
JSON no pueden validar el conjunto (un paso que referencia un `id` que otro va a crear
después), no dan un error con contexto del todo, y no se pueden correr dos recetas en
paralelo sin cuidado.

**Qué costaría arreglarla.** Hay tres arreglos independientes, de menor a mayor:
un comando `batch`/`script` que tome una lista de comandos y los corra en un proceso
(chico, y el registro ya lo habilita: `runCommand` es una función); un `map_recipe` que
tome la receta entera como un objeto y la valide de una vez (medio); y compilar el CLI en
vez de transpilarlo en cada corrida (chico, pero toca el empaquetado). El primero es el que
más devuelve por lo que cuesta.

### 4.4 Deuda que no está anotada en ningún lado

**D1 — Los fixtures son una colección de assets de un juego (1,9 MB en git).**
`src/headless/fixtures/mapas` tiene 106 archivos: los PNG que pintaron los scripts de
Python del juego, las recetas y los JSON de mapa. `fixtures/dibujos` tiene 408 KB con los
79 dibujos del juego. En total 137 archivos trackeados. Es la misma enfermedad del issue #1
en la capa de tests: la garantía de calidad de PSS es «sale igual al script de ese juego».
Si PSS tiene que ser un motor, en algún momento el test de oro tiene que ser *una receta
sintética que ejercita el paso*, no la cumbre alta de The Unwritten Dao. Costo de arreglar:
alto y poco agradecido; costo de dejarlo: el repo no se puede desacoplar del juego.

**D2 — El editor no honra `width`/`height`.** `src/lib/types.ts:91-99` lo dice en el
código: «Today only the headless tools (src/headless) honor them; the web editor still
assumes a square canvas». Es el bloqueo duro de §5, está anotado en `ROADMAP_IMMEDIATE.md`
como pendiente, pero no como deuda ni como issue. Lo mismo con `durations` y `loop`.

**D3 — `commands.ts` tiene 1.545 líneas y 36 imports.** El registro es la mejor decisión
del repo (§6) y al mismo tiempo el archivo que todos los cambios tocan. Hoy importa de 36
módulos distintos y la mitad de sus líneas son esquemas de `map_*`. Partirlo por familia
(un registro por dominio que el índice compone) es barato y evita el cuello de botella con
agentes en paralelo, que es el modo de trabajo de Joaquín.

**D4 — Los tests de la app son un fósil, y no hay E2E.** Seis archivos en
`SpriteEditor/hooks/tests/` con nombres de hooks que no existen desde abril, testeando
slices. `@playwright/test`, `playwright.config.ts` y `playwright-fixture.ts` están desde
abril con cero specs. Ya estaba en `AUDIT_TECNICA.md` (B5, M4) y sigue.

**D5 — 23 vulnerabilidades de npm, 2 críticas.** La Fase 4 de `AUDIT_TECNICA.md` nunca se
corrió. No es urgente para un CLI local, pero la app web está desplegada.

**D6 — El README miente.** No es un detalle: es el primer archivo que lee cualquier
agente o persona nueva, y describe un producto que PSS no es. No menciona `bin/pss`, ni el
MCP, ni los mapas, ni el sonido. `AGENTS.md` sí está al día (y es excelente), pero el
README es la puerta.

---

## 5. La brecha hacia «retocar desde la app»

### 5.1 Sí, coincido: es el problema central de PGS

La ida y vuelta receta → píxeles → retoque → ¿receta? es el problema central, y hoy no
existe. Lo que hay es **medio puente, para un solo formato y un solo tamaño**.

El medio puente que funciona: `/dibujo` (`src/pages/TextDrawing.tsx`,
`src/lib/textDrawing.ts`, `src/lib/textFileAccess.ts`). Abre un `.txt` del formato
`from_ascii`, lo edita con línea de tiempo, capas y piel de cebolla, y lo escribe de
vuelta al mismo archivo con la File System Access API. Está bien hecho: la sesión guarda
lo que el editor no sabe (glifos, líneas `anim:`, `fit:`, el lienzo real), la ida y vuelta
es exacta y tiene test (`textDrawing.test.ts`, 87 tests), y **lo que el formato no puede
guardar avisa en vez de perderse**: capas ocultas, opacidad parcial, píxeles fuera del
lienzo, etiquetas con espacios, comentarios, anatomía, tags (`textDrawing.ts:79-136`).
Ese aviso explícito es el patrón correcto y hay que conservarlo.

### 5.2 Qué falta, concretamente

**(a) El lienzo.** El editor trabaja sobre un cuadrado de `size × size`. Al abrir un
dibujo no cuadrado, `openTextDrawing` (`textDrawing.ts:31-50`) hace
`size = Math.max(width, height)` y rellena. Para un dibujo de 16×32 es aceptable. Para lo
que sale de una receta de mapa, no: los mapas del juego son **448×224, 512×288, 512×320**.
Un `512×320` se abre como `512×512`: **262.144 celdas por cuadro**, sin tope ni aviso. En
la práctica los mapas generados **no se pueden abrir en el editor**. Y son justo lo que
uno querría retocar.

**(b) El formato.** `/dibujo` abre `.txt`. Los 792 `.pss.json` del juego no se abren en
ninguna parte: la app sólo abre assets de Supabase (por `projectSlug`/`spriteSlug`) o un
`.txt` local. No hay «abrir este archivo de disco» para el formato nativo.

**(c) El vínculo con la receta: no existe, y el formato no lo sabe.** Esta es la peor.
En el repo del juego, `art/pss/dibujos/` tiene 666 `.txt`. **101 de ellos** (todos en
`dibujos/suelos/`) tienen esta línea de encabezado:

```
description: capa brillos del mapa cumbre_alta, pintada por receta (pss map_export): no se edita a mano
```

O sea: los generados por receta y los hechos a mano **viven en la misma carpeta, en el
mismo formato, y se distinguen sólo por una frase en castellano dentro de un campo de
texto libre**. `/dibujo` abre los 101 igual que los otros. Si alguien retoca uno y guarda,
el archivo queda bien… hasta la próxima corrida de `map_export`, que lo pisa sin decir
nada. No hay campo que diga «esto lo generó tal receta», no hay chequeo, no hay aviso.
El único freno es una frase que el editor no lee.

**(d) El concepto de retoque ya existe, pero sólo en el headless y sólo por texto.**
`variant` (`src/headless/variant.ts`, 95 líneas) es exactamente la opción «capa aparte
encima de la receta», implementada y usada: copia la base, agrega una capa `variante`
arriba y pinta ahí un *overlay* (un dibujo de texto donde todo glifo que no sea `.` se
superpone), devuelve `painted` y `changed`, **y nunca toca la base, así que volver a
correrlo después de que la base cambió rearma la variante**. El juego lo usa para 40
retratos con ánimo. Falta la otra mitad: **el editor no sabe producir un overlay**. Guarda
el dibujo aplanado completo, no la diferencia. No hay «guardar sólo la capa de arriba»
ni «guardar como overlay».

### 5.3 Las tres opciones

**Opción A — el retoque como capa aparte encima de la receta.**
La receta sigue siendo la fuente de verdad del fondo; el retoque es un overlay versionado
al lado, que se vuelve a aplicar después de cada regeneración. Es lo que `variant` ya
hace, y el modelo de datos ya lo soporta (`SpriteLayer` con nombre).

- A favor: el retoque sobrevive a regenerar. Es el único modelo donde la receta y la mano
  conviven sin que una gane. `map_export` ya escribe por capas, así que un overlay por
  capa encaja. Y hay precedente de uso real: 40 retratos del juego.
- En contra: si la receta cambia debajo, el overlay puede quedar flotando sobre píxeles
  que ya no están. Hay que poder detectarlo: `variant` ya devuelve `changed` (cuántos
  píxeles del overlay difieren de la base), que es casi la señal que hace falta — si
  `changed` cae mucho entre dos corridas, el overlay se desalineó. Falta la comparación
  contra la corrida anterior.
- Lo que hay que construir: un «guardar como overlay» en el editor (la capa de arriba como
  `from_ascii`, con la base de referencia nombrada), que el editor marque la base como
  bloqueada, y un `variant --check` que avise cuando la base se movió.

**Opción B — la receta como fuente única, retoque prohibido.**
Es el estado de hecho de hoy, no declarado. Los 101 `.txt` generados dicen «no se edita a
mano» y nada lo hace cumplir.

- A favor: cero ambigüedad, y empuja a que todo lo que uno quiere retocar se vuelva un
  parámetro de la receta — que es exactamente el principio del 6 de octubre
  (`ROADMAP_NEXT.md`). Cada vez que algo no se puede expresar en la receta, eso es el
  bug.
- En contra: es la razón por la que `mapsteps/` tiene 4.994 líneas de escena concreta. Si
  toda decisión estética tiene que entrar por la receta, los pasos crecen con nombre
  propio: «almohadones de musgo mojado» es un retoque que se volvió comando. Prohibir la
  mano no elimina la necesidad de la mano: la disfraza de motor.
- Lo que hay que construir, si se elige: casi nada de código, pero el formato tiene que
  decirlo. Un campo `generated_by:` en el encabezado del texto y del `.pss.json`, que
  `/dibujo` lea para abrir en sólo lectura con un cartel.

**Opción C — el retoque rompe el vínculo y queda como asset suelto.**
Abrís lo generado, lo tocás, y a partir de ahí es tuyo: la receta queda como historia.

- A favor: simple, honesto, y es lo que el flujo del juego ya hace para lo dibujado a mano
  (los 565 `.txt` hechos a mano **son** la fuente de verdad; `arte.sh` rearma el
  `.pss.json` desde el texto en cada corrida, y nadie edita los PNG exportados). Para un
  prop o una cara, es suficiente.
- En contra: para un mapa es inaceptable. Un suelo de 512×320 con siete capas que se
  desprende de su receta ya no se puede volver a pintar con otra luz, ni con otra paleta,
  ni se puede comparar con `map_compare`. Perdés el motor justo en el asset donde el
  motor más rinde.

### 5.4 Mi recomendación

**A para todo lo generado por receta, C para lo dibujado a mano, y B como la pregunta que
se hace antes de aceptar un overlay.** En concreto:

1. **Que el formato sepa de dónde viene cada cosa.** Un campo real (`generated_by: receta
   + id del paso`, no una frase en `description`) en el texto y en el `.pss.json`. Es el
   prerequisito de todo lo demás y es barato. Hoy el único registro de esto es una oración
   en castellano dentro de un campo libre, y eso ya es un bug esperando.
2. **El editor abre cualquier cosa generada en sólo lectura, y ofrece «empezar un retoque»**,
   que crea la capa overlay. Guardar escribe el overlay, no el aplanado. El modelo de
   `variant` tal cual, con el editor del otro lado.
3. **Antes de aceptar un overlay, la pregunta de B:** «¿esto no debería ser un parámetro
   de la receta?». Si el mismo retoque aparece dos veces, es un parámetro. Esa es la
   versión operativa de la regla del borde del principio del 6 de octubre, aplicada a
   píxeles en vez de a comandos.
4. **El lienzo no cuadrado en el editor es el bloqueo duro** y va primero: sin eso, nada
   de lo anterior aplica a un mapa, que es donde el problema duele.

Y una nota sobre la dirección inversa (píxeles → receta), que el enunciado deja como
pregunta abierta con un signo de interrogación: **no la intentaría**. Inferir una receta
desde píxeles retocados es un problema abierto y no hace falta para el flujo. Lo que hace
falta es que la receta y el retoque coexistan sin pisarse, que es A.

---

## 6. Lo que PSS hace bien y hay que cuidar

Decisiones que se tomaron una vez y siguieron pagando meses después:

1. **El registro único de comandos con adaptadores finos.** `commands.ts` define; `cli.ts`
   (77 líneas) y `mcp.ts` (40 líneas) adaptan. Agregar un comando lo da en los dos frentes
   sin trabajo. Con 136 comandos y dos superficies, cero duplicación. Es la mejor decisión
   del repo y hay que defenderla cuando `commands.ts` se parta (§4.4 D3): partir el
   registro, nunca los adaptadores.

2. **Zod como esquema y como documentación a la vez.** `pss help <comando>` sale de los
   `.describe()` del esquema, y el MCP publica el mismo `schema.shape` como `inputSchema`.
   La documentación de una herramienta no puede desincronizarse de su validación porque
   son el mismo objeto.

3. **El modelo puro separado del disco.** `assetModel.ts` (290 líneas) sin un solo import
   de Node; `asset.ts` (20 líneas) le agrega `readFileSync`/`writeFileSync`. Lo mismo con
   `ascii.ts`. Por eso el navegador pudo reusar el parser del formato de texto y `/dibujo`
   existió en un commit en vez de en un refactor. Es la línea que hace posible toda la
   opción A de §5.

4. **El arte como texto.** `from_ascii` / `to_ascii` con ida y vuelta exacta y verificada
   sobre los 79 dibujos reales del juego. Esto resultó ser el motor fuerte de PSS: ganó a
   los renders de IA en las comparaciones del juego, es *diffable* en git, lo puede escribir
   un agente y lo puede retocar una persona. Los 666 `.txt` del juego son la prueba. Si hay
   un formato que PGS tiene que tratar como sagrado, es este.

5. **La economía de contexto del MCP (`brief.ts`).** Darse cuenta de que «un agente paga
   cada byte que lee» y hacer que los comandos que escriben contesten una línea, con la
   imagen sólo bajo pedido, es una decisión de diseño para agentes que casi nadie toma. Es
   justamente el criterio que falta aplicar al catálogo de 136 herramientas (§4.1).

6. **Las herramientas de mirar sin abrir nada.** `ascii`, `render`, `contact`, `lint`,
   `map_lint`, `map_compare`, `sound_contact`, `inspect`, `palette_show`, `face_points
   table=true`. Un agente que no ve y una persona que no quiere abrir la app pueden las
   dos juzgar el resultado desde la terminal. `contact` al lado del sprite del jugador
   atrapó faroles gigantes; `sound_contact` revisa WAVs sin escucharlos. Es la misma
   lección que la memoria de Joaquín guarda como «cada sistema necesita su tabla».

7. **Determinismo por semilla, en todo.** Mapas, FX, sonido y música dan los mismos bytes
   con la misma receta, y cada capa de sonido saca de su propio generador «so adding a
   layer does not change the others». Sin eso los tests de imagen de oro y `map_compare`
   no existirían, y el paso del juego a PSS no habría podido verificarse.

8. **`variant`: el retoque que no destruye la base.** 95 líneas que resolvieron bien un
   problema real (40 retratos con ánimo) y que son, sin que estuviera planeado, el
   prototipo de la respuesta a la pregunta central de PGS.

9. **La reacción a `AUDIT_TECNICA.md`.** Se ejecutó casi completa en un día de trabajo, y
   el hallazgo más grave que señalaba (la doc describía una arquitectura que no existía)
   quedó resuelto con un `AGENTS.md` que hoy está al día, con fecha de verificación arriba
   y la instrucción de corregirlo en el mismo cambio. Ese archivo es el activo documental
   del repo. El `README.md`, en cambio, quedó como estaba (§4.4 D6).

---

## 7. Lo que yo pondría primero

Ordenado por lo que desbloquea, no por tamaño:

1. **CI verde** (§4.2). Horas. Sin esto los 504 tests no corren en ningún lado y nada de
   lo que sigue se puede verificar.
2. **Que el formato sepa qué lo generó** (§5.4.1). Chico. Prerequisito de toda la brecha
   del retoque, y hoy el único registro es una frase en castellano.
3. **Lienzo no cuadrado en el editor** (§4.4 D2). El bloqueo duro para retocar cualquier
   cosa que salga de una receta de mapa.
4. **Decidir el issue #1 y, si es la opción 2, sacar los `map_*` de escena del catálogo
   del MCP** (§4.1). Lo que paga no es mover archivos: es dejar de cobrarle 91 descripciones
   de herramienta a cada sesión de agente.
5. **Un comando `batch`** (§4.3). Chico, y convierte una receta de veinte procesos en una
   transacción.
6. **Reescribir el `README.md`** y marcar `AUDIT.md` como histórico (§2, §4.4 D6).
