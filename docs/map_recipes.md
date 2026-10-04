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
