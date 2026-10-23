# Los pasos de escena: ejemplos, no motor

PGS hace los assets de un juego; no es una colección de ellos (Joaquín, 6 oct
2026, Khadosh/pixel-gaming-studio#1). La mayoría de los `map_*` no son motor:
son los scripts de dibujo de *The Unwritten Dao* pasados a pasos, cortados por
una escena. «Almohadones de musgo mojado» (`map_cushions`) no es un concepto de
pixel art: es una parte de un mapa de ese juego. Se quedan, **como ejemplos**,
con el nombre del lugar para el que se hicieron.

## Dos capas

- **El núcleo** (`MAP_CORE` en `src/headless/mcpcatalog.ts`): leer el mapa del
  juego, los pasos genéricos con que se compone cualquier lugar y pintar,
  exportar y revisar. `map_from_game`, `map_material`, `map_area`, `map_path`,
  `map_water`, `map_light`, `map_scatter`, `map_settle`, `map_render`,
  `map_export`, `map_compare`, `map_lint`. Un lugar nuevo se arma con esto (el
  patio lo hizo con 31 pasos, todos del núcleo).
- **Las escenas** (`SCENE_FAMILIES` en `src/headless/mapsteps/scenes.ts`): los
  otros 85, cada uno en la **familia** del lugar del primer juego para el que se
  hizo, con las recetas de ese lugar como ejemplo de cómo van juntos
  (`src/headless/fixtures/mapas/<mapa>.receta.json`, junto a su mapa del juego
  y los PNG de su script original).

## Por qué la familia y no el paso

Medido sobre las 17 recetas reales del juego: de los 85 pasos de escena, **57 los
usa una sola receta**, y los que usan dos o tres son de **mapas hermanos del
mismo lugar** (la cumbre y la cumbre alta comparten 11, las dos orillas 10, las
tres raíces del pino 5). Sólo cuatro cruzan lugares, y están aparte como
`compartidos`. Un paso de escena no sirve suelto: sirve con su familia, y un
mapa nuevo de ese lugar empieza por copiar la receta de un hermano (es lo que el
juego hizo tres veces a mano).

## Las familias

| familia | lugar | recetas | pasos |
|---|---|---|---|
| `cumbre` | La cumbre | cumbre, cumbre_alta | 16 (snowfield, crag, conifers, trail…) |
| `orilla` | La orilla | embarcadero, otra_orilla | 14 (beach, mudbank, reeds, pier…) |
| `rio_arriba` | Río arriba | rio_arriba | 12 (glen, cushions, plunge, wetstones…) |
| `raices` | Las raíces del pino | raices_agua, raices_boca, raices_nicho | 8 (cavern, hangroots, carvings…) |
| `terraza` | La terraza del duelo | terraza | 11 (ashlar, arena, balustrade, stairway…) |
| `bosque` | El bosque de bambú | bosque | 6 (thicket, canes, outcrop, beams…) |
| `secta` | La secta | secta | 4 (cliff, brink, flight, cloudscape) |
| `interiores` | La casa de té y el cuarto de la vela | casa_de_te, cuarto_vela | 4 (wall, furnish, sun, glow) |
| `camino` | El camino de abajo | camino | 4 (straw, overlook, woodedge, damp) |
| `aldea` | La aldea | aldea | 1 (rope) |
| `forja` | La forja | forja | 1 (grove) |
| `compartidos` | más de un lugar | — | 4 (network, feature, cast, lines) |

La lista entera, siempre al día: `bin/pgs help escenas` (o `pgs_doc { command: "escenas" }`
por MCP). `bin/pgs help map_<paso>` y `pgs_doc` dicen, en la segunda línea, de qué
familia es un paso y cuáles son sus recetas.

## Cómo se usan

- **Por CLI** están todos, siempre. `bin/pgs help` los lista al final, por familia.
- **Por MCP** no vienen en el catálogo de cada sesión (Khadosh/pixel-gaming-studio#19):
  `pgs_doc` los documenta, `pgs_batch` y `tools/call` los corren, y
  `bin/pgs-mcp --maps` (o `PGS_MCP_MAPS=1`) los lista.

## La regla para un paso nuevo

Un `map_*` nuevo entra **o al núcleo o a una familia**, y el test
(`mapsteps/scenes.test.ts`) no deja pasar uno que no diga cuál. Al núcleo, si
sirve a un lugar que no es el suyo (el commit contesta en una línea por qué
generaliza); si no, a la familia de su lugar. Lo que ya es de escena y resulta
servir a otro lugar se destila (un paso genérico con opciones) y recién ahí sube.

Qué quiere decir que estos ejemplos **generen** mapas nuevos (lo que Joaquín
eligió en #1) está planteado en `docs/diseno/mapas_inteligentes.md`.
