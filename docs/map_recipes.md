# Mapas por receta (`map_*`)

Un suelo de mapa pintado píxel a píxel, descripto como datos en vez de un
script. Primer consumidor: *The Unwritten Dao*, cuyos `scripts/suelo_*.py`
(once mapas) repetían las mismas piezas con otros números; su versión larga
de este documento es `docs/diseno/pintar_mapas.md` de ese repo.

## Lo común (lo que la receta sabe hacer)

- **La grilla del juego manda en lo que se pisa.** El mapa del juego (ancho,
  alto, `wall_rects`, `decor` con su huella, salidas) más un margen pintado
  alrededor. Posiciones y tamaños de cosas del mapa en **celdas** (con
  fracciones; `(0, 0)` es la esquina del mapa, el margen es negativo); lo
  chico (medio ancho, alto de una cara, distancias) en **px**.
- **Materiales con rampa** (nombres de la paleta, de oscuro a claro) y una
  textura: `patches` (pasto/nieve: manchas de luz alargadas en la dirección
  del sol, moda 3×3, briznas), `mottled` (tierra en tres tonos con granos),
  `canopy` (copas por profundidad), `grain` (piedra de 8 tonos: tinta, línea,
  oscuro, sombra, medio, mota, luz, brillo; con `moss`), `slabs` (lajas de
  Voronoi), `flat`, `water` (`[hondo, medio, bajío, espuma, brillo]`). La
  sombra de un color es un paso abajo en su rampa (`shade_max`, `shade_min`).
- **Caminos por curva** (`path`): Catmull-Rom por puntos, medio ancho que
  respira (`width: [px, vaivén]`, `widen`), claros y lenguas (`clearings`,
  `branches`), la sombra del barranco del lado de la luz y el labio claro del
  otro (`bank`), huellas (`ruts`), matitas que se meten, peldaños (`stairs`).
- **Áreas** (`area`): `all`, `blobs` (manchas orgánicas), `cells` (letras de
  la grilla por `grid_mask`), `rect`, `outside` (el bosque de los costados)
  y `poke` (copas del borde que pasan por delante, en otra capa). `face: N`
  la levanta: cara al sur de N px, musgo en el labio con luz, `holes`.
- **Agua** (`water`): bandas por distancia a la orilla, la orilla alta
  (`bank`) y su reflejo, espuma cortada abajo, ondas, brillos en una capa.
- **Luz** (`light`): una dirección por receta (`light: [1, 1]`, las sombras
  caen abajo a la derecha). Sombras de los adornos del juego (copa festoneada
  y tronco para lo alto, chica para lo bajo con `shadow`), del borde del
  bosque y de las caras; limpias, un paso abajo de la rampa.
- **Esparcir** (`scatter`): `tufts` (las puntas a la capa que se mece),
  `flowers`, `pebbles`, `dew`, `boulders` en lugares fijos, `stamp`; con
  tiradas, distancia mínima, cerca de qué, sobre qué y `walkable: false`
  (nunca sobre una celda pisable). Todas comparten un azar en orden.
- **Capas**: `ground` y las que nombren los pasos (`front`/`copas` delante de
  la gente; `mechones`, `rocio`, `brillos`: lo vivo).
- **Lint y export**: `map_lint recipe=` corre el lint de estilo sobre cada
  capa (materiales del lint en `lint.materials`); `map_export` escribe un PNG
  por capa y, si se pide, el `.pss.json` y el dibujo de texto de cada una.

- **Lo que trajo la secta** (`secta.receta.json` en los fixtures: las cuatro
  capas iguales al script, píxel a píxel). Pasos nuevos en `mapsteps/`:
  `cliff` (el risco: el mapa termina en un labio, abajo el mar de nubes con
  picos lejanos, la cara de roca y piedras sueltas), `flight` (peldaños:
  `down`, apilados entre muretes; `climb`, de costado subiendo hacia un
  bosque que se abre en pasto) y `feature` (`dais`: la plataforma con cara,
  anillo, los ocho trigramas y una sombra que cambia el material donde cae;
  `slab`: una losa vieja con grieta y musgo; `roots`: raíces que se meten en
  la tierra). Textura `flagstones` (lajas por grilla escalonada, con `stones`
  y `wear` en el área). Parámetros: `patches` del material (escalas, sales y
  umbrales del pasto), `levels` de `mottled`, `on` en `area`/`path` (sólo
  sobre esos materiales), forma `curve`, blobs con sal y `fine`, `openings` y
  `crowns` del bosque de afuera, `gaps` y `crowns` de `poke`, `breath`,
  `salts` y ramales-sendero en `path`, `buildings`, `casts` y `rim` en
  `light`, `odds`/`far_spacing`/`stem`/`over`/`alone`/`reach` del esparcido y
  `what: "litter"` (agujas caídas y piedritas en un sendero). En la receta:
  `shade` (la tabla de oscurecer a mano, en vez de bajar por la rampa) y
  `scatter_salt` (la sal del azar compartido).

- **Lo que trajo la aldea** (`aldea.receta.json` en los fixtures: las cuatro
  capas iguales al script, píxel a píxel). Pasos nuevos en `mapsteps/`:
  `network` (la tierra de un pueblo de una pieza: `parts` en orden —caminos
  `road` con ancho que respira, `blob` que suma y `cut` que saca una isla de
  pasto—, limpiada una vez; `also` suma patios que se pavimentan después;
  pisada cerca del medio de los caminos (`trod`, `ruts`, `grains`), polvo
  seco lejos (`loose_levels`), labio en el pasto y matitas) y `rope` (una
  cuerda que cruza por delante, con `hang`: faroles como filas de glifos).
  Textura `paving` (lajas sueltas alrededor de `paving.at`, juntas de musgo
  o tierra, borde en sombra). Parámetros: `cut`/`clear`/`fade`/`tries`/`far`
  en `outside` (el camino corta el bosque y se apaga en su sombra), `cut` en
  `poke`, `blocks`/`stripes`/`reach` en `light`, flores con `near: []`,
  `reach` y `odds_each`, piedritas con `own` y `odds`, `what: "leaves"` y
  `around`/`over: null` en el rocío (el polvo de una plaza).

- **Lo que trajo la casa de té** (`casa_de_te.receta.json` en los fixtures:
  un interior, las dos capas iguales al script, píxel a píxel). Textura
  `planks` (tablas corridas sobre la caja del área: tono por tabla, labio con
  luz, junta, punta en sombra, veta, nudos, clavos; más oscuras adelante y en
  los rincones). Pasos nuevos en `mapsteps/room.ts`: `wall` (pared recta en un
  rect de px; `profile` desde el lado `from`: de frente, bandas con `split` y
  `boards`, `windows` de celosía, `columns`; desde arriba, la viga; `doors`
  con `threshold` y su luz en una capa; `shadow` en el piso), `furnish`
  (`rug` bajo las mesas, `shadows` al pie de los muebles) y `sun` (la luz de
  las ventanas de un `wall` corrida sobre el piso, en su capa). En la receta,
  `lighten` (tabla de aclarar) y `export.crop` (capas del tamaño del mapa).

- **Lo que trajo el bosque de bambú** (`bosque.receta.json` en los fixtures:
  las siete capas iguales al script, píxel a píxel). Pasos nuevos en
  `mapsteps/grove.ts`: `thicket` (las celdas de pared y el margen son
  matorral; el piso, con borde curvo —la grilla suavizada más ruido, `edge`—,
  `open` y `clearings`, pintado con su material y `damp` pegado al matorral;
  los pasos que siguen lo leen por id), `outcrop` (peñón: `masses`, cara al
  sur, `top`/`rim` y `boulders` apiladas), `undergrowth` (adentro del
  matorral), `canes` (cañas una por una que nacen en las celdas de pared y
  suben: nunca tapan una celda delante de su pie ni las de `clear` y los
  adornos; bajas sobre `path`, altas en algunos lugares (`tall`); hojas en dos
  capas `leaves`), `shade` (sombra del matorral y de `casters`, `casts` bajo
  los hitos) y `beams` (haces de luz en su capa, `motes` de polvo en otra).
  En `feature`: `ring`, `frost`, `ash`. En `scatter`: `what: "dashes"` y, en
  las matas, `edge`, `shapes`, `lift`, `unknown`, `foot`. En `network`: la
  parte `oval`, `inside`, `ruts_on` y `lip` de un color. En `patches`:
  `blade_odds`.

- **Lo que trajo la cumbre** (`cumbre.receta.json` y `cumbre_alta.receta.json`
  en los fixtures: una montaña nevada, todas las capas iguales al script,
  píxel a píxel). Pasos nuevos en `mapsteps/alpine.ts`: `snowfield` (la nieve:
  hondonadas en sombra violeta con el labio al sol, lomas, escarcha; `cover`
  la deja sólo arriba de una línea con ondas en celdas y en px, con pasto que
  asoma cerca, manchones viejos abajo y el pasto —textura `patches`— debajo;
  su `id` nombra la línea), `ledge` (el borde del mapa a izquierda o derecha:
  cornisa y cara de roca angosta) y `cloudsea` (lo de abajo: hondura en
  franjas, bancos de nubes y `peaks` que flotan), `crag` (peñasco por campo de
  alturas en 3/4: nieve arriba que gotea por la cara, roca donde es empinado,
  cara en lajas de Voronoi; `shadow`, `veins` con su capa, `cleft`, `mouth`
  con carámbanos, `face_colors`, `icicles`), `mountain` (sesenta peñascos más
  allá del borde, más hondos lejos), `conifers` (abetos nevados por filas; los
  de adelante en `copas`), `trail` (curvas con ancho base + ondas y manchas;
  `earth`, `trodden` con pisadas o `slabs` con su sombra; `slush`, `cover`),
  `tracks`, `pond`, `shrub`, `shadows` (lo pendiente de los peñascos, los
  adornos —no los hitos, salvo `landmarks`— y `casts`), `tussocks`, `stones`,
  `sparkles` y `spindrift`. Las capas de `export.layers` existen aunque
  ningún paso las pinte.

- **Lo que trajo el camino de abajo** (`camino.receta.json` en los fixtures: un
  camino de llanura seca, las cuatro capas iguales al script, píxel a píxel).
  Pasos nuevos en `mapsteps/lowland.ts`: `straw` (paja en manchas, lejos del
  borde del pasto, en hebras verticales; sobre el pasto en sombra sólo hebras y
  motas), `overlook` (a la izquierda la tierra termina en un labio con luz, lo
  oscuro debajo y una cara angosta; más allá, abajo en la bruma, el llano:
  parcelas pálidas en una grilla torcida con lindes más claras, un río y un
  camino que se va), `woodedge` (copas pasado la derecha, arriba y abajo,
  más hondas lejos, nunca sobre la red de tierra; pasado el borde la tierra y
  el pasto se oscurecen; su `id` es el borde de un `poke`), `damp` (tierra
  mojada) y `cast` (cada píxel opaco de un adorno echa sombra abajo a la
  derecha según su alto sobre el pie; `skip`, `skip_when`). Para `cast` la
  receta dice `sprites` (la carpeta de los PNG: `pss` de cada entrada de
  visuals + `.png`) y cada adorno llega con su silueta (`mask`). Parámetros:
  `half` del pasto; en `network` `wheel_ruts` (dos rodadas continuas con su
  labio), `bank`, `loose_tones`, `grains` de cuatro, `grain_tones`,
  `grains_all`; `spacing` de `poke`; en `scatter` `odds: null`, `left`,
  `straw`, `dry` (matas), `many` (flores), `mid`, `dust` (piedritas), `fade`,
  `below_on` y el ancho por árbol (hojas), `spacing_y`, `inside` (rocío) y
  `kind`, `stands` (sellos: un pilar pintado en el suelo que echa sombra).

- **Lo que trajo la orilla del río** (`embarcadero.receta.json` y
  `otra_orilla.receta.json` en los fixtures: todas las capas iguales al
  script, píxel a píxel). Pasos nuevos en `mapsteps/riverbank.ts`: `lines`
  (líneas onduladas con nombre a lo ancho: las orillas; la forma
  `{between: [arriba, abajo]}` y los pasos del río las leen), `wildwood` (el
  bosque en silueta por lo lejos que queda del mapa: costados, arriba con un
  hueco para el camino, abajo siguiendo una línea, nunca entre dos líneas),
  `beach` (arena entre dos líneas: mojada junto al agua, labio del pasto,
  piedritas y conchitas), `mudbank` (barro bajo una línea), `footpath`
  (cintas que respiran y manchas, fuera del río y de ciertos materiales; borde
  en sombra, tierra en tres tonos, huellas, labio; arena pisada donde cruza
  una playa), `pier` (tablas con puntas desparejas, largueros, sombra en el
  agua, pilotes con su onda), `reeds` (juncos tallo por tallo: matas o una
  fila por una línea; puntas que se mecen; los del agua enteros por delante;
  `not` deja libre el muelle), `rocks` (piedras con su sombra), `umbra`
  (óvalos y franjas de sombra de borde ondulado), `meadow` (matas y flores
  con su propio sorteo h2 por índice, no el azar compartido), `shimmer`
  (brillos con sol de un lado y vetas de corriente), `slabs` (lajas de
  Voronoi en una mancha), `ditch` (acequia seca con labios de piedra),
  `claypan` (estanque seco: barro partido en placas, borde de piedras con
  musgo y una pasarela de lajas con su cara) y `floodwater` (el agua que vuelve
  a esas máscaras, en su capa; con `export.crop` es un parche del tamaño del
  mapa). En `patches`, `blades_up` (la sal del segundo píxel de la brizna).

## La receta

```json
{
  "game": "ladera.json", "visuals": "visuals.json", "palette": "paleta.pss.json",
  "margin": [9, 1], "light": [1, 1], "seed": 0,
  "materials": { "pasto": {"ramp": ["túnica noche", "…", "pasto"], "texture": "patches", "shade_min": 1}, "…": {} },
  "steps": [
    {"step": "area", "material": "pasto", "shape": "all"},
    {"step": "area", "id": "bosque", "material": "bosque", "shape": {"outside": {"sides": "lr"}}},
    {"step": "path", "id": "camino", "material": "tierra", "points": [[6.5, -1.4], "…"], "clearings": [[6.75, 7.55, 1.7, 1.25, 0.24]]},
    {"step": "light", "edges": ["bosque"]},
    {"step": "scatter", "what": "tufts", "layer": "mechones"},
    {"step": "area", "material": "bosque", "shape": {"poke": "bosque"}, "layer": "copas"}
  ],
  "export": {"id": "ladera", "layers": {"ground": "", "mechones": "_mechones"}}
}
```

La de la ladera entera (41 líneas) está en
`src/headless/fixtures/mapas/ladera.receta.json`; reproduce el 99,8 % de los
píxeles del script (`maprecipe.test.ts` lo verifica contra su PNG).

## Comandos (CLI `bin/pss`, MCP `pss_*`)

```bash
pss map_from_game game=data/world/ladera.json visuals=data/visuals.json palette=art/pss/src/paleta.pss.json out=receta.json margin='[9,1]'
pss map_material recipe=receta.json name=pasto ramp='["túnica noche","hoja sombra","hoja","bambú","hoja clara","bambú claro","pasto"]' texture=patches
pss map_area recipe=receta.json material=pasto shape=all
pss map_path recipe=receta.json id=camino material=tierra points='[[6.5,-1],[6,7],[6.5,16]]'
pss map_light recipe=receta.json edges='["bosque"]'
pss map_scatter recipe=receta.json what=tufts layer=mechones
pss map_render recipe=receta.json out=ver.png scale=2
pss map_lint recipe=receta.json
pss map_export recipe=receta.json dir=art/pss/suelos txt=art/pss/dibujos/suelos
pss map_export recipe=receta.json            # con export.png/txt/src en la receta
pss map_compare recipe=receta.json ref=suelo_viejo.png out=cmp.png   # lado a lado, diferencias en magenta
```

**Export de punta a punta.** Con `export.png`, `export.txt` y `export.src` en
la receta (relativos a ella), `map_export recipe=` escribe por capa el dibujo
de texto, el `.pss.json` rearmado desde ese texto y el PNG con su JSON de hoja
(lo mismo que `from_ascii` + `export_sheet`: el juego lo rearma igual).
`export.names` le pone nombre a cada capa. `export.ground` escribe en el
`ground` del mapa del juego (`painting`, `vivo`, `copas`…; `margen` sale del
`margin` de la receta) sólo las claves que cambiaron, sin tocar el resto del
texto del archivo (`ground_at: ""` = la raíz del mapa).

**Comparar** (`map_compare`): la receta contra el dibujo que reemplaza (o dos
PNG con `a=`/`b=`; varias capas con `refs={capa: png}`): referencia, receta y
diferencias en magenta, y cuántos píxeles cambian.

`map_from_game` contesta la grilla en texto (`.` pisable, `#` pared, `D`
adorno, `E` salida) para ubicar caminos y áreas. Un paso con `id` se
reemplaza al volver a mandarlo (`index` lo inserta en un lugar). El
código: `maprecipe.ts` (esquemas), `mappaint.ts` (el pintor, puro),
`mapnoise.ts` (ruido y formas, el mismo de los scripts), `mapfile.ts` (disco).
