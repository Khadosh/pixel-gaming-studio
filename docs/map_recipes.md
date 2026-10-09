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
- **Objetos de archivo** (`stamp` con `draw`): en vez de `rows` + `glyphs`
  adentro de la receta, `draw: "objetos/farol.txt"` —un dibujo de texto
  normal, relativo a la receta—. El objeto tiene nombre, se abre en el
  editor, se retoca y lo reusa cualquier receta. **Todo color del dibujo
  tiene que estar en la paleta de la receta** (se busca por hex): si no,
  la receta falla listando los que faltan, que es el lint «este objeto está
  fuera de la paleta de la escena» en el momento en que se apoya en el mapa.
  Ejemplo: `objetos/farol.txt` en los fixtures, que salió de
  `embarcadero.receta.json` sin cambiar un píxel del mapa.
- **El ancla** (cabecera `anchor: x,y` del dibujo): qué píxel del dibujo
  apoya donde lo ponés. Con ancla, el `at` de la receta es **un lugar del
  suelo**, no la esquina de una lámina: el pie del poste del farol es
  `anchor: 5,11`, así que la celda dice dónde se planta y mover el dibujo
  (agrandarlo por arriba, por ejemplo) no corre el farol de lugar.
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

- **El lomo de un muro visto de arriba: `flank` en `area`** (el recinto del
  templo de la secta). Un área angosta (el tope de un muro, un bordillo) gana
  su cara lateral del lado opuesto a la luz:
  `"flank": {"side": "east", "width": 3, "material": "muro del jardín", "rim": true}`.
  La cara son `width` px en la mitad oscura de la rampa de `material` (el pie,
  lo más oscuro); el px del tope contra la cara es la junta más oscura; una
  junta cruza la cara donde termina una piedra del tope (con `flagstones`; si
  no, cada `every` px). `rim` pone el filo de luz de 1 px del otro lado,
  cortado en las juntas. `ragged` (por defecto sí) la hace pared de piedra
  vieja y no franja a regla: cada sillar de la cara mide `width` o uno menos y
  cada piedra del tope sale 1 px del lado de la luz o no, nunca tres seguidas
  iguales (así ningún borde sigue derecho dos celdas). La cara no pinta sobre
  el material del área ni el suyo (otro muro: un `ashlar` que la cruza la
  corta, y la esquina se lee). Con `flank`, `flagstones` no deja afuera las
  piedras del borde: el tope corre entero.

- **Las esquinas de un recinto: `join` en `flank`, `round` en `ashlar`**. Un
  muro norte-sur (un `area` con `flank`) que llega a uno este-oeste (un
  `ashlar` con `id`, pintado antes) se une a él en vez de apoyarse:
  `"flank": {"side": "east", "width": 3, "material": "muro del jardín", "join": ["muro norte 1", "muro sur 1"]}`.
  En la punta de abajo, el lomo sigue por encima de la banda de arriba del
  `ashlar` hasta donde empieza su cara (su último renglón es el filo de luz,
  en línea con la banda del muro que sigue al lado: nada de contorno oscuro
  cerrando el rectángulo); la cara lateral baja hasta ahí y corta; la cara de
  frente sigue por debajo de la esquina con su extremo en relieve (de luz del
  lado de la luz, en sombra del otro). En la punta de arriba, el lomo nace en
  el borde de afuera del muro del que sale. El extremo de un `ashlar` que no
  sigue más allá de la esquina vuelve a lo que había debajo (nunca asoma), y
  la esquina de afuera del lomo se corta redonda: 2 px de chaflán donde el
  muro no sigue, 1 px donde sigue. Qué lado sigue lo dice el `ashlar` (si
  pasa más de 2 px del lomo y su cara). El `ashlar` tiene que ir antes en los
  pasos; si no está o no toca el muro, el paso lo dice.
  `round: true` en un `ashlar` suelto (un pilar, un escalón) le corta las dos
  esquinas de arriba 2 y 1 px y pone su extremo oeste de luz y el este en
  sombra: un sillar de esquina, no la punta de una caja.

- **Un muro como una sola cosa: el paso `parapet`** (el recinto del templo de
  la secta, vuelta 17). Un camino de tramos este-oeste o norte-sur es la línea
  media del muro y el muro se dibuja entero de una vez:
  ```json
  {"step": "parapet", "id": "muro del recinto", "material": "piedra del muro",
   "path": [[0.5, 0.25], [23.5, 0.25], [23.5, 19.25], [0.5, 19.25]], "closed": true,
   "gaps": [[[11, 19.25], [13, 19.25]]], "top": 0.5, "face": 0.62, "light": "northwest",
   "sink": {"material": "pie del muro", "on": ["pasto"]}, "moss": {"skip": [10.5, 13.5]}}
  ```
  El tope (`top`, en celdas) es una banda **del mismo ancho en todos los
  tramos**, de mampostería (`rubble`: piedras redondeadas de tamaños distintos,
  `stones` px, con junta oscura), así que una esquina es la misma piedra
  doblando y no dos dibujos que se tocan. La cara (`face`) cuelga sólo de los
  tramos este-oeste (miran al sur: en un recinto, el muro norte hacia adentro y
  el sur hacia afuera), en la misma mampostería un tono más oscura, con una
  línea de sombra bajo el tope y más oscura hacia el pie; los tramos norte-sur
  muestran sólo el tope, el costado en sombra (1 o 2 px a tramos) y la sombra
  en el suelo (`shadow` px). El filo de luz del tope va del lado de la luz y al
  norte, la junta en sombra del otro; donde una junta llega al borde lo muerde
  (ningún borde a regla) y las esquinas de afuera se cortan 2 px. La cara
  termina en una piedra de esquina en relieve (sillares, de luz del lado de la
  luz, en sombra del otro) o, contra el tope de otro tramo, en una junta oscura.
  `gaps` abre vanos en un tramo y cada lado termina en un pilar (`pillar`:
  `bulge` px más ancho a cada lado, `rise` px más alto, su piedra de tope con
  luz y sombra, su cara en sillares hasta el pie); un camino abierto termina en
  pilares o, con `ends: "flush"`, en la banda redondeada (un muro que nace de
  otro). `sink` hace que el pasto se coma el pie de cada cara (`on`: sólo donde
  el suelo al pie es de esos materiales; en un piso de losas, sólo la línea
  oscura del pie) y unas matas los bordes de los tramos norte-sur (`tufts`);
  `moss`, pelos de musgo que cuelgan del tope por la cara y musgo en algunas
  juntas del tope. Dos `parapet` se tocan sin costura: el segundo no pinta
  sobre el tope ni la cara del primero y no les pone borde (un muro de
  contención que nace del perimetral, un parapeto bajo que muere en la cara de
  otro). Un muro de contención es un `parapet` de tope angosto (el labio del
  piso de arriba) y cara alta; un parapeto bajo, tope angosto y `face: 0`.
  Determinista por `salt`. La mampostería también es una textura de material
  (`"texture": "rubble"`, con `stones` en el área). No tiene comando
  `map_parapet` (el catálogo del MCP tiene presupuesto): se escribe en la
  receta y lo pintan `map_render` y `map_export`.

- **Un edificio visto de arriba en tres cuartos: `roof`, `chimney`, `fence` y
  `building`** (la forja de la secta: `forja.receta.json` en los fixtures, la
  forja de la referencia en píxel a 14 × 12 celdas, con dos filas más arriba
  para el humo). Código en
  `mapsteps/building.ts`, `mapsteps/fence.ts` y `mapsteps/buildingschema.ts`.
  Ninguno tiene comando `map_*` (el catálogo del MCP tiene presupuesto): se
  escriben en la receta y los pintan `map_render` y `map_export`; los cuatro los
  puede poner un `place`. La luz viene del noroeste, como en todo el juego; las
  superficies del edificio se oscurecen dentro de su propia rampa (una sombra
  sobre el techo es una teja un tono abajo) y el suelo por la regla de la receta.

  **`roof`**, un techo de tejas:
  ```json
  {"step": "roof", "id": "techo", "material": "teja", "rect": [2, 2, 10, 2.8],
   "ridge": "h", "hip": 14, "upturn": 9, "crest": 7, "shadow": 5}
  ```
  `rect` es el techo visto de arriba sin el alero, del lomo del caballete a la
  línea del alero. `material`: rampa de 6 tonos o más [tinta, hondo, sombra,
  cuerpo, luz, brillo] (la teja de la isla: tinta, tinta, basalto hondo… basalto
  luz). Las tejas son un patrón: **columnas** (canto de luz, cuerpo, lado en
  sombra, canal oscuro) que bajan, con la hilada sólo como muesca a fase propia
  por columna (`tile: [ancho, alto]`, por defecto [5, 4]): costillas, nunca una
  grilla. `ridge: "h"` muestra el agua del sur con el caballete arriba (lomo de
  `cap` px con brillo y juntas mordidas, cuernos de `curl` px en las puntas,
  `crest` un adorno en el medio; `hip` px de limatesa en cada punta: la del oeste
  con luz, la del este en sombra); `ridge: "v"` muestra las dos aguas, la del
  oeste con luz, con las costillas bajando en diagonal desde el caballete, y
  `gable` px de hastial al sur (el triángulo de revoque con su puntal y sus
  tablas de borde, `pediment`). `lean: "west"` (o `"east"`) deja un solo agua que cae
  hacia ese lado, con el caballete contra el otro borde: un cobertizo apoyado en
  el cuerpo. El alero sobresale `eaves` px por los cuatro
  lados, se abre `flare` px hacia abajo (el alero es más ancho que el caballete,
  y las columnas se abren con él), sus esquinas suben y salen en punta
  (`upturn`) y la línea entre ellas se comba; la fila de abajo son los remates de
  teja (el canal corta antes: el borde nunca es una regla) y debajo cae una
  banda de sombra de `shadow` px sobre lo que haya (la pared), nunca arriba.
  `outline` (por defecto sí): tinta alrededor de arriba y de las puntas, donde
  se recorta contra lo de atrás. `layer` para ponerlo en otra capa.

  **`chimney`**, una chimenea de piedra con horno:
  ```json
  {"step": "chimney", "material": "piedra de la forja", "at": [5.6, 7],
   "base": [48, 50], "stack": [24, 34], "shift": -12, "mouth": {"size": [26, 24], "ring": 3},
   "fire": {"layer": "fuego", "glow": 10, "frames": 4, "colors": ["bermellón", "fuego", "fuego luz", "túnica luz"]},
   "smoke": {"layer": "humo", "puffs": 8, "drift": [14, 44], "size": [4.5, 12], "fade": 0.6},
   "shadow": {"on": ["forja roof", "pasto", "lajas"]}}
  ```
  `at` es el medio del pie en el suelo; `base` el cuerpo (el horno), `stack` el
  tubo encima (corrido `shift` px), con un hombro de luz entre los dos
  (`shoulder`), su cara este en sombra (`side`), la tapa con la boca oscura del
  tubo y una brasa, y piedras de esquina que salen un px cada dos hiladas (ningún
  canto a regla). La piedra va en hiladas (`masonry: "coursed"`, `course` px) o
  en mampostería (`"rubble"`, la de `parapet`); rampa de 8 tonos. `mouth`: la
  boca del horno en arco de dovelas, oscura adentro; el **fuego en su capa**
  (`fire.layer`) y su luz sobre el suelo de adelante (`glow` px, por la tabla
  `lighten` de la receta). **Un fuego son cuadros**: con `fire.frames: n` (2 a
  8) cada cuadro es un dibujo entero en su capa, `<layer>_1` … `<layer>_n`
  (`fuego_1`, `fuego_2`…; `map_export` y `place` las sacan como cualquier capa),
  que el juego muestra por turno (`"mov": "cuadros"`): la misma cama de brasas,
  lenguas que suben y cambian con la semilla del cuadro, puntas que se
  desprenden por encima de un hueco, el núcleo claro que late. `colors`:
  [borde, llama, núcleo] o [borde, llama, núcleo, corazón] (el blanco de lo más
  caliente); `back`: [arriba, abajo] el fondo del horno detrás de las llamas,
  alumbrado (con cuadros, `madera sombra` y `bermellón`: nunca negro detrás de
  un fuego). Sin `frames`, una sola capa `<layer>`, como antes. El **humo en
  otra** capa (`smoke`): una columna de `puffs` bocanadas, de radio `size`
  [primera, última] (ancho en la base, se abre al subir), que sube `drift`
  [derecha, arriba] px; en la parte de arriba (`fade`, la fracción de la
  columna) se aclara y se ralea en jirones con huecos hasta desaparecer: no
  termina en un puf. `colors`: [sombra, cuerpo, luz] o con un cuarto, el de lo
  más alto. Su sombra cae al este sobre las
  máscaras o materiales de `shadow.on` (el techo de un `building` es
  `"<id> roof"`).

  **`fence`**, una cerca de madera por camino:
  ```json
  {"step": "fence", "material": "madera de la cerca", "path": [[1.9, 6.9], [2.9, 9.4], [5.4, 9.5]],
   "gaps": [[[3.6, 9.43], [4.3, 9.46]]], "post": [4, 10], "rails": [3, 7], "spacing": 17, "tufts": "pasto"}
  ```
  El camino es el pie de la cerca, en cualquier ángulo. Postes cortos con
  **tapa** (dos filas de luz un px más anchas que el poste, tinta arriba y a los
  costados), cara de luz al oeste y pie oscuro; `rails` alturas de los dos
  travesaños. Cómo se lee un travesaño depende del tramo:
  - **este-oeste**: una barra de `rail` px (luz arriba, sombra abajo) con una
    línea de tinta debajo, de poste a poste; postes cada `spacing` px como mucho;
  - **en diagonal** (una ladera): la barra se inclina de verdad, cada poste
    parado a su altura; un tramo empinado (más de 1 px de bajada por px) abre
    los postes hasta un 30 % para que los travesaños se vean inclinados entre
    ellos, como dos líneas paralelas por los costados de los postes;
  - **norte-sur** (de punta): los postes se escorzan, más juntos que a lo ancho
    (`spacing` × 0,85, con lugar para que se vean los travesaños entre uno y
    otro), y cada travesaño es su canto, una línea casi vertical de poste a
    poste: el alto por el lado de la luz (oeste), el bajo por el de la sombra,
    con el suelo entre los dos.
  Cada px sabe qué tan al sur está: un poste de adelante tapa el travesaño que
  pasa por detrás y un travesaño tapa la cara del poste del que sale. `gaps`
  abre la cerca entre dos puntos de un tramo, con un poste a cada lado; cada
  punta del camino termina en poste. La sombra de postes y travesaños cae abajo
  a la derecha como la tira `cast` (un px a h de alto cae 0,55·h a la derecha y
  0,22·h abajo de su pie), sólo sobre `on`; `tufts` pone matas al pie de
  algunos postes.

  **`building`**, las paredes con el techo encima:
  ```json
  {"step": "building", "id": "forja", "rect": [2, 2, 10.2, 5], "wall": 36,
   "material": "revoque", "frame": "vigas", "stone": "piedra de la forja", "bays": 20, "rail": 12,
   "side": 6, "open": [{"at": [5.4, 8.4], "board": true, "shelf": 13}], "windows": [[143, 8, 14, 10]],
   "shadow": {"offset": [8, 3], "on": ["pasto", "lajas"]}, "roof": {"material": "teja", "hip": 14, "upturn": 9}}
  ```
  `rect` es el edificio visto de arriba, del caballete al pie del frente; `wall`
  px de pared de frente (el techo ocupa lo de arriba y su alero le cae encima).
  Zócalo de piedra (`stone`, `plinth` px), revoque (`material`: [hondo, sombra,
  cuerpo, luz]) entre postes cada `bays` px, viga arriba y `rail`, ventanas de
  celosía (`windows`, px desde la esquina de la pared), puertas de tablas
  (`doors`), y **vanos abiertos** (`open`): se ve adentro (la pared del fondo en
  sombra, un estante con cosas, un letrero, un banco). Su **cara este en sombra**
  retrocede `side` px (sube medio px por px), con el poste de esquina; la
  **sombra al suelo** es la silueta entera corrida `shadow.offset` px al sureste,
  con el borde deshilachado. `roof` es un `roof` sin `rect`: va sobre las paredes
  y la cara este. Registra las máscaras `<id>` (todo el edificio) y `<id> roof`.

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

- **Lo que trajo la terraza de los duelos** (`terraza.receta.json` en los
  fixtures: las cuatro capas iguales al script, píxel a píxel). Pasos nuevos en
  `mapsteps/terrace.ts`: `cloudbanks` (el mar de nubes visto de arriba: bruma,
  filas de bancos chatos con lomos al sol, `peaks` que flotan con repisas y
  pinos chatos, bancos que les tapan el pie), `ashlar` (la cara de una terraza
  en hiladas de sillares, `sink` en la nube, `moss` que cuelga), `courses`
  (losas grandes en hiladas sobre una caja: tono por losa, labio de luz, junta
  clara; `wear` con `lanes`, `rings` y `spots`; `edge` nombra la banda del
  borde donde nadie pisa y el musgo entra en las juntas; grietas), `runner`
  (losas largas de punta a punta), `arena` (el ruedo de un duelo), `balustrade`
  (`across`: bordillo, pasamanos, barrotes, postes con remate, `gaps` y
  `holes`; `down`: las de los costados vistas de arriba; lo de `across` se
  para y `cast` echa su sombra), `stairway` (escalinata hasta abajo del
  dibujo), `sprigs`, `fallen` y `motes` (con el azar compartido) y `overhang`
  (la rama de un pino de risco en una capa de adelante, con su sombra). En
  `cast`: `landmarks`, `offset` (los adornos traen el `offset` del mapa del
  juego), `foot: "lowest"` (el pie es la fila opaca más baja) y `covers`.

- **Lo que trajeron las raíces del pino** (`raices_boca`, `raices_agua` y
  `raices_nicho.receta.json` en los fixtures: un laberinto de cuevas, todas las
  capas iguales al script, píxel a píxel). Pasos nuevos en
  `mapsteps/cavern.ts` (+ `cavernschema.ts`): `cavern` (las paredes de la
  grilla como masa de roca por `grid_mask`: vista de arriba en facetas con
  contorno y labio, la cara al sur sobre el piso de abajo con canto claro,
  estratos, veta, brillos de humedad en su capa y pie oscuro; piso de piedra
  fría en lajas partidas, oscuro al pie de las paredes, piedritas; las salidas
  siguen en el margen y `shafts` sube un pozo negro; colores en `tones`),
  `hangroots` (raíces que bajan por las caras elegidas por el ruido por celda
  del juego, raicillas, tierra, gotas en su capa con charquito, raíces finas
  por delante donde nadie se para debajo), `carvings` (inscripciones talladas
  en columnas: `at`, `within`, `count`), `rootladder` (escalera de raíces por
  un pozo), `pool` (agua quieta), `formation` (anillos, los ocho trigramas y
  rayos tallados en el piso, encendidos en su capa dentro de `box`), `gloom`
  (lo de afuera se pierde en lo negro por la tabla `shade`; lo que no está en
  ella cae a `darkest`) y `soften` (un píxel suelto de un material dentro de
  otro pasa a su acento). El mapa del juego trae `occupied` (inicio, NPCs,
  hitos); el export suma `windows` (una capa cortada a un rect del mapa, en
  celdas) e `ids` (el id entero del archivo de una capa).

- **Lo que trajo río arriba** (`rio_arriba.receta.json` en los fixtures: un claro
  de musgo al pie de un salto, las siete capas iguales al script, píxel a
  píxel). Pasos nuevos en `mapsteps/glen.ts` (+ `glenschema.ts`): `glen` (el
  trazado, sólo máscaras: `pool`, `stream`, `river`, `water`, `earth`, `ledge`,
  `sand`, y las distancias `water`, `earth` y `land`), `cushions` (musgo
  mojado junto al agua), `mudtrail` (tierra mojada: borde, tres tonos, más
  mojada cerca del agua, granos, huellas, labio y matitas), `shingle` (playa de
  grava con su barranca), `ledgeslabs` (repisa de lajas mojadas), `plunge` (el
  agua: río por hondura, poza y arroyo por distancia, orillas altas con cara y
  sombra, grava lamida, piedritas bajo el bajío, anillos de espuma del salto),
  `wetstones` (piedras con espuma y estela), `wetwood` (bosque de los costados;
  sus bordes los leen `glenshade` y `boughs`), `glenshade` (sombras por prefijo
  de adorno, `casters`), `glenlitter` (lo chico con el azar compartido),
  `glenflow` (brillos y corrientes en sus capas) y `boughs` (ramas por delante
  con musgo colgando). En `lines`, `sines` y `slope`.

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

### Un lugar: una receta adentro de otra (`place`)

Un lugar (un recinto, un jardín, un muelle) se dibuja una vez en **sus propias
celdas**, su (0, 0) en su esquina, como una sub-receta (`materials`, `colors`,
`size`, `steps`; sin `game`: pinta sobre el de la madre). La madre lo pone con

```json
{"step": "place", "recipe": "../lugares/recinto.json", "at": [7, -1], "reserve": "recinto"}
```

Antes de pintar (`mapplace.ts`, en `renderRecipe`: todo `map_*` lo hereda) cada
paso de la sub-receta se corre a `at` y queda en el lugar del `place`, como si
estuviera escrito ahí: el mismo orden, las mismas máscaras (`on`, `avoid`,
`within`), la paleta de la madre. Sus materiales y colores se suman a los de la
madre (un mismo nombre tiene que decir lo mismo). Moverlo es cambiar `at`.

- Se pueden poner: `area`, `water` (formas `blobs`, `rect`, `curve`), `path`,
  `scatter`, `courses`, `ashlar`, `parapet`, `stairway`, `runner`, `umbra`,
  `rocks`, `grove`, `roof`, `chimney`, `fence`, `building`. Otro paso para la receta con un error; se agrega diciendo qué se
  corre en él (`MOVES` de `mapplace.ts`).
- `reserve`: una máscara de la madre con el rectángulo del lugar (`size` desde
  `at`), que existe desde el primer paso: un `grove` la evita con `avoid`, un
  `scatter` deja afuera sus lugares fijos con `outside`.
- `grove` con `into`: sus árboles van al final de esa arboleda de la madre (no
  es una arboleda aparte). Un árbol puede llevar su sal (`[u, v, tipo, alto,
  sal]`): es el mismo esté donde esté en la lista.
- Un lugar adentro de otro cae en la suma de los dos `at`.

## Comandos (CLI `bin/pgs`, MCP `pgs_*`)

```bash
pgs map_from_game game=data/world/ladera.json visuals=data/visuals.json palette=art/pss/src/paleta.pss.json out=receta.json margin='[9,1]'
pgs map_material recipe=receta.json name=pasto ramp='["túnica noche","hoja sombra","hoja","bambú","hoja clara","bambú claro","pasto"]' texture=patches
pgs map_area recipe=receta.json material=pasto shape=all
pgs map_path recipe=receta.json id=camino material=tierra points='[[6.5,-1],[6,7],[6.5,16]]'
pgs map_light recipe=receta.json edges='["bosque"]'
pgs map_scatter recipe=receta.json what=tufts layer=mechones
pgs map_render recipe=receta.json out=ver.png scale=2
pgs map_lint recipe=receta.json
pgs map_export recipe=receta.json dir=art/pss/suelos txt=art/pss/dibujos/suelos
pgs map_export recipe=receta.json            # con export.png/txt/src en la receta
pgs map_compare recipe=receta.json ref=suelo_viejo.png out=cmp.png   # lado a lado, diferencias en magenta
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
