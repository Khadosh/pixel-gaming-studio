# Auditoría A — el pipeline de arte que el juego construyó al costado

> Qué se aprendió haciendo el arte de *The Unwritten Dao* con PSS, y qué de eso
> es capacidad de motor (PGS) en vez de arte de ese juego.
> Fuente: `/Users/joaquinnader/juegos/unwritten-dao` al 6 de octubre de 2026
> (commit `827d4b4`). **Auditoría: no se cambió una línea de ninguno de los dos
> repos.**

## El criterio

Lo fija el precedente de esta semana, no una opinión:

| Pieza | Qué hizo | Por qué |
|:---|:---|:---|
| `tocado` → `pss stamp` | subió | «estampar una prenda por dirección, corrida con la cabeza» vale para cualquier cuerpo prestado |
| buscador de la cara → `pss face_points` | subió | «encontrar los ojos y la línea del pelo en un sprite ajeno» vale para cualquier pack |
| `bigote`, `vincha` | se quedaron | deciden **qué** se le dibuja a Pei Shou y a Mei |

Una pieza sube si contesta *cómo se le hace X a cualquier sprite o a cualquier
juego*. Se queda si decide *qué se dibuja en este mundo*.

Y hay un antecedente más grande, de la semana pasada, que fija el método: los
suelos. Once scripts de Python del juego (`suelo_ladera.py` 1253,
`suelo_embarcadero.py` 1492, `suelo_rio_arriba.py` 1472, `suelo_aldea.py` 1380,
`suelo_bosque.py` 977, `suelo_casa_te.py` 561, `suelos_mapas.py` 208,
`camino_props.py` 627, `secta_props.py` 776, `terraza_props.py` 428,
`cumbre_props.py` 325 — **9.499 líneas**) ya no existen: lo que hacían vive en
PSS como `map_*` + 23 recetas en `art/pss/recetas/suelos/`, y cada migración se
cerró con `map_compare` dando **0 píxeles de diferencia**. Dos lecciones de ahí,
que vuelven más abajo:

1. Los generadores de adornos (`*_props.py`, 2.364 líneas) **no se migraron: se
   borraron**. Un dibujo de texto ya dibujado no necesita su generador.
2. Buscar cero píxeles obliga a codificar las decisiones del original en vez de
   generalizarlas: 91 de los 136 comandos de PSS hoy son `map_*`, y 3.886 de las
   8.606 líneas de `src/headless/mapsteps/` llevan nombre de un mapa de este
   juego (ROADMAP_NEXT.md, issue #1). **El cero-píxel es el método de
   verificación, no el objetivo del diseño.**

## Lo que hay hoy

| Qué | Cuánto | Dónde |
|:---|---:|:---|
| scripts de Python | 8.177 líneas en 15 archivos | `scripts/*.py` |
| dibujos de texto (la fuente de verdad) | 666 `.txt` | `art/pss/dibujos/` (props 267, suelos 101, telones 65, cartas 43, horno 41, bestias 40, hud 23, …) |
| fuentes de asset | 792 `.pss.json` | `art/pss/src/` |
| recetas | 29 JSON + 63 `.txt` | `art/pss/recetas/` (de las cuales 23 son recetas de suelo que ya corren en PSS) |
| orquestador | 348 líneas de bash | `arte.sh` |
| manifiesto | 127 KB | `data/visuals.json` (126 actores, 221 adornos, 99 suelos, 19 telones) |
| arte prestado | 5 KB | `data/arte_provisorio.json` |

De los 666 dibujos, **102 declaran el script que los generó**; 17 nombres de
script distintos, de los cuales **10 ya no existen** (los suelos y los props
migrados). O sea: el dibujo sobrevive a su generador, por diseño.

---

## 1. Pieza por pieza

### Los quince scripts

| Script | Líneas | Qué hace | Veredicto |
|:---|---:|:---|:---|
| `raices.py` | 1808 | la cueva de legado entera: tileset, 22 adornos, 4 bestias (`centipede`, `bat`, `shade_thing`, `guardian`), telón, íconos. Trae la clase `Img`, `write()` y las primitivas | **mitad y mitad**: `Img` + `write()` + `tube_mask`/`shade`/`strand`/`polygon` → PGS; los 28 dibujos y sus poses, al juego |
| `zonas_fundacion.py` | 2165 | la cumbre alta y río arriba: 2 tilesets, ~25 adornos, 7 bestias (`goat`, `hawk`, `tiger`, `toad`, `heron`, `eels`, `jiao`) con su versión de mapa de 16×16, 2 telones. Define `ANIMS_TIERRA` | **mitad y mitad**: `fill_shaded`, `ell_mask`, `poly_mask`, `rot`, `thick`, `cut_below`, `over` y `ANIMS_TIERRA` → PGS; las 39 bestias y adornos, al juego |
| `bestias_forja.py` | 240 | el topo de la veta: pelea + mapa. Importa todo de los dos de arriba | **se queda** (ya es sólo contenido; es la prueba de que el harness está afuera del script) |
| `hud_pelea.py` | 482 | 23 dibujos del HUD: rombos de piso 64×32, marco de nueve partes, orbe y pips del qi, íconos de 16 | **zona gris**: el marco de nueve partes, el medidor y el rombo isométrico son formas de motor; los colores, el oro y la tinta son de este juego |
| `marcos_cartas.py` | 214 | 5 marcos de carta por naturaleza + brillo por rango, 64×96, paneles acoplados a `LAYOUT` de `card_button.gd` | **se queda**. El marco se dibuja contra la ventana que lo muestra |
| `meridianos.py` | 154 | llama a `pss figure` con pose `lotus` y pinta los canales como máscaras encima | **se queda** (ya es un cliente de PSS; 38 líneas de receta + máscaras del mundo) |
| `personajes.py` | 537 | reconstruye 126 personajes del pack: `import_character` + mapa de colores + `png_fit`; y `barba`, `afeitar`, `vincha`, `bigote`, `tocado`, `pose_arrodillada`, `ataque_de_pie` | **mitad y mitad**: `retocar_cara` (retoque por caja de región sobre un `Faceset`), `arrodillar`/`atacar_de_pie` (sintetizar un cuadro que el pack no trae) → PGS; `vincha`, `bigote`, `barba` ya decidido: se quedan |
| `cuerpos_pelea.py` | 149 | resuelve nombres de color, lee la cabeza a mano y llama a `pss figure` por vista | **se queda**. Lo único generalizable es `resolver()` (nombres de color → tonos, en profundidad) y `head_art` ya es parámetro de `figure` |
| `caras_bestias.py` | 68 | render de IA → `pss illustrate` 38×38 → `.txt` que pasa a ser la fuente | **va a PGS**: es la tercera copia del mismo pipeline (ver §3) |
| `telones.py` | 300 | lo mismo para 19 telones, más zonas de edición, `cutout` de lo vivo y `lights` | **va a PGS** la maquinaria (caché de render, zonas, recorte de lo vivo, sub-paleta); el estilo y los focos, al juego |
| `piso_terraza.py` | 563 | el piso de la terraza de los duelos: lajas Voronoi, ruedo, camino, cielo | **se queda** — y además ya está duplicado: `map_ashlar`/`map_courses`/`map_arena`/`map_balustrade` hacen esto en PSS. Es deuda del juego, no candidato |
| `orillas_mapas.py` | 231 | 2 suelos que una baldosa de 16 no puede dar (la orilla de la nieve, el camino que serpentea), en parches con `slices` | **zona gris**: el concepto «un parche ancho con huecos transparentes, partido en tajadas con su posición» es formato (lo que `map_export` ya escribe por capa); el resto es decoración |
| `mapas.py` | 342 | lint del dato del mapa: huellas fuera del borde, adornos que se pisan, NPC debajo de un adorno o en una pared, paredes sin nada arriba, niebla y luces fuera de rango | **zona gris fuerte**: huella/choque/alcanzable es de motor (y PSS ya lee esas huellas en `mapfile.ts:26`); el esquema de `fog` y de `light` es de este juego |
| `zonas_mapas.py` | 311 | **el revés de `map_from_game`**: `ground_rows` + leyenda + listas de adornos, hitos y gente → el JSON del mapa, con las paredes deducidas de cada huella y asserts de choque | **va a PGS** la función `build()`; los 7 mapas, al juego |
| `raices_mapas.py` | 613 | laberinto perfecto con semilla + aperturas + salas talladas, y colocación por regla: `bfs`, `route`, `leaves`, `free_leaf`, `chokepoint`, `wall_beside`, `neighbors_open` | **mitad y mitad**: el tallado y el grafo (7 funciones, ~120 líneas) → PGS; «la bestia en el único pasillo que lleva a la salida» y los siete rivales, al juego |

### Las piezas internas que son motor disfrazado

| Pieza | Dónde, cuántas veces | Qué es | Veredicto |
|:---|:---|:---|:---|
| clase `Img` (`put`/`rect`/`ellipse`/`line`/`stamp`/`outline`/`shift`/`swap`/`rows`) | `raices.py:64-137`, reimportada por `zonas_fundacion`, `bestias_forja`; versión chica en `piso_terraza` (`blank`/`line`/`blit`) y en `personajes` (`_lienzo`/`_pegar`/`_punto`) | el lienzo de glifos. PSS tiene `ops.ts` (line/rect/circle/fill) pero **no** polígono, ni relleno por máscara, ni contorno, ni pegado | **va a PGS** |
| `write(folder, id, name, desc, frames, anims)` | 6 scripts (`raices`, `zonas_fundacion`, `piso_terraza`, `orillas_mapas`, `hud_pelea`, `marcos_cartas`) | tabla de `(animación, lienzo)` → texto `from_ascii` con leyenda en orden de paleta y validación de glifos sin color | **va a PGS** |
| paleta de glifos propia (`PAL`/`PALETTE`/`COLORS`) | 8 scripts | la misma madre recortada a mano, glifo por glifo | **va a PGS** como «sub-paleta por nombres» (ya existe el truco en `arte.sh`: `pss new palette=` con los nombres de la madre) |
| `fill_shaded` / `shade` / tres tonos con luz arriba a la izquierda | `zonas_fundacion:39`, `raices:496`, `bestias_forja` | pintar una máscara en luz/medio/sombra sin contorno, y el contorno de tinta al final | **va a PGS** |
| `ell_mask`, `poly_mask`, `tube_mask`, `rot`, `thick` | `zonas_fundacion`, `raices` | álgebra de máscaras. PSS ya tiene `Mask`, `organic`, `catmull`, `ribbon`, `clean`, `distanceIn` en `mapnoise.ts` — **pero sólo alcanzables por `map_*`** | **va a PGS** (exponer lo que ya existe) |
| `smooth_noise` / `noise` / `random.Random(semilla)` | 6 scripts | ruido suave determinista. `mapnoise.ts` ya tiene `fbm`/`vnoise`/`h2` | **va a PGS** (exponer) |
| `ANIMS_TIERRA` | `zonas_fundacion:934`, usado por 5 bestias y por `bestias_forja` | el contrato con duraciones por animación | **va a PGS** (ver §2) |
| `resolver(valor, colores)` | `cuerpos_pelea:26` | un nombre de color → sus tres tonos, en profundidad, dentro de una receta | **va a PGS** (toda receta de PGS lo va a querer) |
| `retocar_cara` | `personajes:21` | mapa de color válido sólo dentro de una caja, sobre un `Faceset` del pack | **va a PGS** (`png_fit` ya tiene `regions=`; falta el caso retrato) |
| `footprint(decor, sprite, at)` | `mapas.py:23`, `zonas_mapas.py:41` (idéntica) | la convención `x - (w-1)//2`, `y - h + 1` | **va a PGS** (PSS ya la aplica en `mapfile.ts`, sin exponerla) |
| `bfs`/`leaves`/`chokepoint`/`carve` | `raices_mapas.py` | grafo de un laberinto: cuellos de botella, callejones, rutas | **va a PGS** |
| caché de render de IA + «el `.txt` es la fuente, no se pisa salvo `--pisar`» | `telones.py`, `caras_bestias.py`, `arte.sh cartas` (3 veces) | ver §3 | **va a PGS** |

---

## 2. Los contratos

### El esqueleto que PGS tendría que dar de fábrica

**Sí, los cuatro.** En orden de cuánto los necesita un flujo agéntico:

**(a) El dibujo de texto como fuente de verdad.** Ya es de PSS
(`from_ascii`/`to_ascii`, ida y vuelta exacta, probada contra 79 dibujos del
juego en `src/headless/fixtures/dibujos`), pero no está dicho como el contrato
central que es. Es lo que hace posible la frase «generar con agentes y retocar
después desde la app»: el agente escribe texto, la app abre ese mismo texto
(`/dibujo`, `src/pages/TextDrawing.tsx`) y lo guarda de vuelta en el archivo.
Sin un formato así, «retocar después» significa un PNG que el siguiente
generador pisa. **Esto es el eje de PGS**, y conviene escribirlo arriba de todo.

**(b) El contrato de animaciones** (`idle`, `walk`, `attack`, `technique`,
`hurt`, `die`, con variantes por dirección `walk_down`). Hoy está hardcodeado
**cuatro veces**: `src/headless/character.ts:2`, `src/headless/figure.ts:277`
(`FIGURE_ANIMS`, con duraciones), `src/headless/commands.ts:274` (la
descripción) y `scripts/zonas_fundacion.py:934` (`ANIMS_TIERRA`) en el juego.
Cuatro copias de la misma tabla es la señal de un concepto que falta. En PGS:
un contrato con nombre (`topdown_rpg`, por decir) con sus duraciones y su
política de faltantes (el juego la resuelve en
`scenes/ui/character_sprite.gd`: la que falta se cubre con la primera), que
`figure`, `import_character`, `animate`, `from_ascii` y el lint acepten como
`contract=`. **Chico, y paga en todos los comandos a la vez.**

**(c) El manifiesto / apuntador** (`data/visuals.json`). La parte generalizable
es chica y clara: `id → {kind, set, size en celdas, shadow, faceset, scale,
facing}`. PSS ya parsea ese subconjunto (`mapfile.ts:26`, `VisualsJson` con
`size`/`shadow`/`pss`) pero por adentro y sólo para los mapas. Lo que **no**
sube: `caras`, `en_el_piso`, `lies_down`, `entrena`, `battle_scale`,
`caras_alias`, `xu_ban` — son de este mundo. Lo que sí vale la pena subir junto:
**la paleta madre como ajuste del proyecto** en vez de un `fit=` repetido en
cada llamada (`arte.sh` lo pasa 5 veces), y el `cell` (ya existe en las recetas
de mapa). Valor para PGS: es el índice que la app necesita para mostrar «esto es
un juego, no una carpeta de archivos» (fase 9.1 del roadmap pide exactamente
eso, y acá hay un formato ya probado con 126 actores y 221 adornos).

**(d) El arte prestado** (`data/arte_provisorio.json`). **Coincido, y es el que
más me sorprendió.** Por qué:

- **El costo es ridículo.** Toda la capacidad son ~20 líneas:
  `core/world/visuals.gd:44` (`resolve(kind, id)`: si el manifiesto tiene el id
  gana el manifiesto; si no, el que lo tapa; si no, el mismo), más
  `standins()` (`:54`) que lista lo pendiente, más el dato (5 KB, 14 adornos y
  unos telones). El lint lo lee en `scripts/mapas.py:265-273` tratando al
  prestado como si fuera el real.
- **Desacopla las dos cosas más lentas de un pipeline agéntico.** Construir el
  mundo y dibujarlo son dos frentes con velocidades distintas. Hoy la cueva de
  Fundación entera (6 pisos, laberinto, bestias, botín) se jugó y se balanceó
  con un bambú haciendo de raíz colgante y un cerezo haciendo de fuente.
- **Convierte «lo que falta» en una cola de trabajo consultable.** `standins()`
  devuelve `{kind: [ids]}` y `./cuevas.sh` lo imprime (`tests/cuevas.gd:154`).
  Eso es exactamente cómo se despacha a un agente de arte: no «dibujá algo»,
  sino «estos 14 ids, con este tamaño, este contrato de animaciones y este
  nombre».
- **Lleva el tamaño esperado**, y esa es la parte fina. El comentario del
  archivo lo dice: «el arte nuevo tiene que medir eso o el mapa se rearma». El
  préstamo no es un parche visual: es un **contrato de forma firmado antes de
  que exista el dibujo**. Sin eso, el arte llega y el mundo se rehace alrededor
  del arte.
- **La resolución va en el resolvedor, no en el dato.** El día que el dibujo
  llega se registra en el manifiesto y el préstamo deja de usarse solo, sin
  tocar un mapa. Es el mismo principio del apuntador, aplicado a lo que todavía
  no existe.

Un reparo honesto, para que entre bien: un préstamo demasiado bueno esconde que
falta el arte. El reporte de pendientes **es parte de la capacidad**, no un
extra; sin él, el préstamo es deuda invisible.

### Un contrato que falta y que esta auditoría encontró

**Un generador escribe sólo sus propias claves, y se puede volver a correr.**
`scripts/zonas_mapas.py:13` tiene el cartel: «OJO (5 oct): **no correrlo más**.
La cumbre alta tiene el suelo pintado por receta, la veta de la roca y a Su Wan,
que este script no conoce: correrlo los pisa». `raices_mapas.py:11` dice lo
mismo. Dos generadores de 924 líneas quedaron de un solo uso porque escriben el
archivo entero. PSS ya tiene la cura, y conviene nombrarla como regla del motor:
`map_export ground=` escribe en el mapa del juego «only the keys that changed»
(`commands.ts`). Todo comando de PGS que escriba un archivo que otros también
editan tiene que ser idempotente y dueño sólo de sus claves.

---

## 3. Lo que se repite

Tres patrones pasan el umbral de tres. En orden de costo:

### a) El harness de dibujar a mano (8 scripts, 5.703 líneas) — el más caro

`raices.py` 1808 + `zonas_fundacion.py` 2165 + `piso_terraza.py` 563 +
`hud_pelea.py` 482 + `bestias_forja.py` 240 + `orillas_mapas.py` 231 +
`marcos_cartas.py` 214 = **5.703 líneas, el 70 % del Python del juego**, para
producir ~108 dibujos. Todas repiten el mismo molde:

1. una paleta de glifos recortada a mano de la madre (8 de 8),
2. un lienzo de caracteres con sus primitivas (3 implementaciones distintas de
   lo mismo: `Img`, `blank`/`blit`, `_lienzo`/`_pegar`),
3. máscaras (elipse, polígono, tubo) y relleno en tres tonos con la luz arriba a
   la izquierda, más contorno de tinta al final (3 de 8),
4. ruido suave determinista con semilla fija (6 de 8),
5. una función que recibe parámetros de pose (`dx`, `dy`, `head`, `step`,
   `kneel`, `lying`, `eye`…) y devuelve un cuadro,
6. una tabla `[(animación, cuadro), …]` y `write()` que la pasa a texto
   `from_ascii` (6 de 8),
7. el mismo contrato de animaciones con las mismas duraciones.

**Los puntos 1-4, 6 y 7 son motor. El 5 es el juego.** Y lo picante: PSS ya
tiene casi todo el 1-4 escrito y probado en `mapnoise.ts` (`Mask`, `organic`,
`catmull`, `ribbon`, `clean`, `distanceIn`, `fbm`) y `mappaint.ts` (1.307 líneas
de rampas, tonos, texturas) — **pero sólo se llega por `map_*`**. Un suelo puede
usar las primitivas; una bestia no. Eso es lo que obliga a escribir un script de
Python por zona.

No propongo quince comandos: propongo **uno** (`pss paint`, receta de pasos de
dibujo sobre un lienzo de glifos, con el escritor de texto y el contrato
adentro) y la disciplina del issue #1: **primitivas, nunca formas con nombre
propio**. `goat` no entra a PGS; `mask.ellipse`, `fill.shaded`, `outline`,
`noise`, `frames` sí. Si en PGS empieza a aparecer un paso llamado `cabra`, el
diseño falló.

### b) El pipeline de ilustración por IA (3 veces, idéntico)

| Dónde | Qué ilustra | Tamaño |
|:---|:---|:---|
| `arte.sh` (bloque `cartas`, ~90 líneas de Python embebido) | 43 cartas | 56×36 |
| `scripts/telones.py` (300 líneas) | 19 telones | 320×180 |
| `scripts/caras_bestias.py` (68 líneas) | retratos de bestias | 38×38 |

Las tres hacen, en el mismo orden y con las mismas banderas (`--otra`,
`--pisar`): receta JSON por id → ¿existe el render en `art/pss/ia/`? si no,
`pss generate` (y **nunca** se vuelve a pagar) → `pss illustrate` con `fit=` a
una sub-paleta armada por nombres de la madre → `pss to_ascii` → el `.txt` pasa
a ser la fuente y **no se pisa** porque puede haberse pulido a mano → hoja de
contacto en `art/pss/_ver/`. Telones agrega zonas y recorte de lo vivo; el resto
es la misma máquina tres veces.

Esto es, palabra por palabra, la promesa de PGS: la IA propone, el píxel queda
como texto editable, el humano retoca y la máquina no le pisa el retoque. Hoy
está escrito tres veces en el repo del juego y cero veces en PSS.

### c) El orquestador del proyecto (`arte.sh`, 348 líneas)

`./arte.sh` sin argumentos: rearma los 666 `.txt` → `.pss.json` contra la madre,
rearma las 40 caras con ánimo (`pss variant`), exporta los 792 assets a PNG+JSON
y **imprime una tabla** (id, px, cuadros, colores, carpeta, animaciones).
`./arte.sh control <id…>`: hoja de contacto al lado del jugador sobre grilla de
16, más `pss lint` contra la madre, más las luces sumadas sobre un fondo de
noche. `ver`, `texto`, `paleta`, `tiles`, `iconos`.

No es un patrón repetido dentro del juego: es **el patrón que todo juego hecho
con PGS va a tener que reescribir**. Y es la pieza que más le falta a PSS para
ser un motor de juegos: hoy PSS sabe hacer un asset, no sabe **rehacer un
proyecto entero de forma determinista y contarte qué hay**. (Memoria de
Joaquín: «cada sistema necesita su tabla en la terminal».)

---

## 4. Costo y cómo verificar

| # | Candidato | Esfuerzo | Qué medir para no romper nada |
|---:|:---|:---|:---|
| 1 | **Arte prestado + reporte de pendientes** (`standins`) | chico | Es dato nuevo: no hay nada que romper. Fixture de manifiesto + test de que el manifiesto siempre gana, que un préstamo a un id inexistente se ignora y que el reporte sólo lista lo que falta. Cotejar contra `core/world/visuals.gd:44` y los 14 ids de hoy |
| 2 | **Contrato de animaciones como dato** (`contract=`) | chico | Las cuatro copias actuales son el oráculo: `figure` y `import_character` tienen que seguir dando los mismos nombres, duraciones y `loop` (ya hay test: `headless.test.ts:1065` y `:1103`). Además, los 40 dibujos de `art/pss/dibujos/bestias/` con `ANIMS_TIERRA` tienen que releerse idénticos |
| 3 | **Pipeline de ilustración por receta** | chico/medio | **Gratis y exacto**: los renders ya están cacheados en `art/pss/ia/` (cartas, telones, caras). Correr el comando nuevo contra esos PNG y exigir los `.txt` **byte a byte** iguales a los 43 + 19 + 22 de hoy. Cero llamadas a fal.ai, cero píxeles de diferencia |
| 4 | **Manifiesto de assets + paleta madre del proyecto** | medio | `visuals.json` entero (126 actores, 221 adornos, 99 suelos) tiene que parsear sin pérdida y volver a escribirse **sin reformatear** (el anexo del juego avisa: `json.dump(indent=2)` reformatea 127 KB y produce miles de líneas de diff). Test: leer → escribir → `diff` vacío |
| 5 | **Kit de ráster + escritor de texto** (`pss paint`) | medio | Los 666 dibujos son un banco de regresión gratis. Reimplementar con el kit **dos** scripts contrastantes (`hud_pelea.py`, 23 dibujos geométricos, y `raices.py`, 28 orgánicos) y exigir 0 píxeles con el `.txt` de hoy. La ida y vuelta de texto ya está probada sobre 79 dibujos (`ascii.test.ts`); `map_compare a= b=` ya compara dos PNG y dibuja en magenta lo que difiere |
| 6 | **Autor de mapas: texto → dato** (el revés de `map_from_game`) | medio | Correr contra los 7 mapas de `zonas_mapas.py` y los 6 pisos de `raices_mapas.py` **escribiendo a un directorio temporal** y comparando el JSON clave por clave con el commiteado, **sólo en las claves que el generador posee** (`width`, `height`, `walls`, `ground.patches`, `decor`). Esa comparación parcial es también el test de la idempotencia de §2 |
| 7 | **Lint de dato de mapa** (huella, choque, alcanzable) | chico/medio | `./mapas.sh` sobre los mapas del juego tiene que dar el mismo veredicto (hoy: limpio). Los chequeos de `fog` y `light` **no** suben: su esquema es del juego |
| 8 | **Grafo de laberinto** (tallar, cuellos, callejones) | medio | Mismas semillas, mismas grillas: los 6 pisos de las raíces se tallan hoy con semillas fijas (`FLOORS`), así que el laberinto se compara celda por celda. La **colocación** no sube, así que no hay nada más que verificar |
| 9 | **Rig de criaturas** (`pss creature`, el hermano de `figure`) | **grande** | **Acá el método del cero-píxel no aplica**, y hay que decirlo: un rig no reproduce 11 bestias dibujadas a mano. Se verifica con `pss contact` (las 11 al lado del jugador, antes y después), `pss lint pieces=` (ninguna pieza despegada: el criterio que ya se usa para los cuerpos) y el ojo de Joaquín. Es el candidato más valioso y el más riesgoso; **no lo empezaría primero**, y lo mediría contra la vara del jugador de 48 px («parece Dobby»): si no se ve de una pieza, no entra |
| 10 | **Kit de UI** (nueve partes, medidor, orbe, rombo isométrico) | medio | Bajo valor por ahora: el marco y el HUD del juego están acoplados a `card_button.gd` y a los paneles. Lo único que subiría barato es el **formato** de nueve partes (márgenes declarados + lint de que las nueve partes cierran) |

Orden que recomiendo: **1 → 2 → 3** (los tres chicos, y los tres cambian cómo se
siente el flujo), después **5** y **4**, y **9** sólo cuando haya un segundo
juego que pida bestias.

---

## Lo que yo no movería

- **Los 666 dibujos y las poses que los producen.** `goat`, `tiger`, `jiao`,
  `guardian`, `centipede`, el topo, los marcos por naturaleza, los rombos
  dorados: son el *qué* de este mundo. Y hay precedente: los cinco generadores
  de adornos (2.364 líneas) se **borraron**, no se migraron, porque el dibujo de
  texto ya era la fuente. Lo mismo le espera a `raices.py` y
  `zonas_fundacion.py` el día que sus dibujos estén cerrados: **el objetivo no
  es portar esos 4.000 líneas, es que no haya que escribir las próximas 4.000.**
- **Más pasos de mapa con nombre propio.** El roadmap ya lo congeló (issue #1):
  91 de 136 comandos son `map_*` y 3.886 líneas llevan nombre de un mapa de este
  juego. `piso_terraza.py` (563 líneas) **ya está duplicado** en
  `map_ashlar`/`map_courses`/`map_arena`/`map_balustrade`: eso es deuda del
  juego, no un candidato a subir.
- **El esquema de `fog`, `lights`, `ambient` y los `vivo`** (`corre`, `mece`,
  `titila`, `fluye`, `destella`, `cae`, `estela`). Los movimientos son nombres
  que el shader del juego entiende; PGS puede recortar la pieza (`cutout` ya lo
  hace) y declarar que se mueve, no decidir cómo.
- **La escala** («una persona es una celda de 16», todo a 4x en el mapa y 5x en
  la pelea, una bestia de costado 40 px mínimo). Son reglas de dirección de arte
  de este juego. `cell` como ajuste de proyecto sí; el número, no.
- **`vincha`, `bigote`, `barba`** — ya decidido, y la decisión sigue siendo
  buena: deciden qué se dibuja en estas cabezas. Lo que subió fue cómo se
  encuentra la cabeza.
- **El balance entre marco y ventana** (`marcos_cartas.py` ↔ `LAYOUT` de
  `card_button.gd`): dos archivos que se mueven juntos. Un marco separado de la
  ventana que lo muestra no es una capacidad, es un dibujo huérfano.
