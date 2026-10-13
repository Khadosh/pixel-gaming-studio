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
  **Pisado, no dibujado (`soft`)**: sin barranco ni labio (sin tinta), el
  borde que entra y sale en mordiscos (`ragged`, px), puntas de pasto sobre
  el borde en matas de pocos px, más oscuras del lado de la luz (`tips`), una
  orla de pasto gastado afuera que sube su rampa sin perder la textura
  (`verge: [mín, máx]` px, `lift`), manchas del pasto más claro que aguantan
  adentro de la tierra (`worn`) y la tierra en manchas blandas de dos tonos
  (sin sal y pimienta). **`fade: [px del principio, px del final]`** (en el
  paso o en un ramal): ese tramo se angosta y se deshace en el pasto, para
  un extremo libre (una bahía, el hueco de una cerca); 0 donde se junta con
  otro camino.
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
- **El sol** (`light` como objeto: una sola luz para todo el mapa y sus
  lugares). `"light": {"dir": [0.5, 1], "length": 0.25, "tone": 2}`: un punto
  h px sobre el suelo cae a `length`·h px de su pie, por `dir` (0,1 es un sol
  alto, un charco al pie; 0,8 uno bajo). Todo lo que tira sombra la tira con
  esa regla a una sola máscara, que se apoya una vez (en el paso `light` y al
  final del mapa): `tone` tonos abajo por la tabla `shade`, el mismo en todo
  el mapa; `tones` lo cambia por material (`{"tierra": 1}`: un sendero a dos
  tonos se ve barro); dos sombras encimadas oscurecen **una** vez. `on`: los
  materiales que la reciben (si no, los que nombran los pasos); `fray` (0,3)
  muerde el borde en mordiscos de 3 a 6 px (ruido suave, nunca un px suelto);
  `soft` px de penumbra un tono más clara, que se ensancha y se angosta; un
  charco (de copa, de hito o de roca) es una mancha y no un óvalo barrido:
  óvalos que se angostan en la mitad de arriba de la copa más tres o cuatro
  lóbulos hacia los costados y abajo, sin tramos rectos; `crown` [rx,
  ry] la copa vista de arriba (veces su ancho); `contrast` (0 a 0,6) deja más
  de cada copa del lado oscuro. Leen el sol: `grove` (la copa barrida desde
  donde empiezan las hojas hasta la punta; el arbusto desde el suelo; con
  `crowns` en el `grove`, el charco toma el ancho de la copa dibujada y no su
  ancho nominal), los
  adornos e hitos altos en `light` (por su tamaño; uno muy ancho, como un pino
  de jardín, hace un charco más chico que su copa), `building` (cada px desde
  el pie del frente; la cara este desde el suyo; el alero sobre el suelo),
  `chimney` (en el techo sigue su `shadow.px`), `stall` (el toldo y lo de
  abajo, el mostrador), `fence`, `beds`, los sellos con `stands` (su silueta y
  un charco del ancho de su pie, sin necesidad de un paso `cast`), `cast`,
  `rocks`, `umbra`, `parapet`, la sombra de `feature` y el muelle (`pier`: las tablas a `height` px sobre el agua y los
  pilotes desde el agua). Desde el issue #17
  también: `shade` del bosque de bambú (el matorral es una masa de `height` px,
  32 por defecto, su borde corrido por el sol; los óvalos de `casts` se apoyan
  como están dibujados), `shadows` de la cumbre (un adorno `pino*` es copa
  sobre tronco, otro grande un charco del suelo a su alto; cada `crag` con
  `shadow` tira cada columna de su campo de alturas desde su pie, nunca sobre
  sí mismo), `glenshade` de la cañada (un caster con `trunk` es copa, otro un
  charco de su `r`; el bosque de los costados es una masa de `height` px, de
  todos los lados y no sólo del izquierdo), `overhang` (lo que se para —tronco,
  ramas y su tinta— tira desde el alto de su eje sobre el pie, `foot` o el px
  más bajo del tronco: la sombra de una rama es tan ancha como la rama; una
  raíz es contacto; una copa es un piso de hojas al alto de su panza; `cast`
  oscurece la copa de abajo y la corteza desde donde las pone el sol y la
  altura entre ellas; el `contact` bajo las raíces deja de ser un color en la
  capa y pasa a la máscara) y las caras de `area` con `face` (cada px de la
  cara tira desde su alto sobre su pie, y el tope detrás de ella desde el alto
  de la cara; nada cae sobre lo levantado). Los pasos de cueva (`cavern` y
  compañía) no tiran sombra: su oscuridad es de hondura, no de una luz.
  **Lo que es de la luz vieja no se usa con sol** —`shade.reach`, `slope` y
  `deep`; `glenshade.rim`, `casters[].at` y `deep` (el `trunk` sólo dice que
  es un árbol); `overhang.shadow.at` (con sol `at` es optativo y el `[dx, dy]`
  de `cast` no se usa); `light.trunks`, `crowns` y `trees`; `cast.lean`,
  `smooth` y `min`; `rocks.shadow`; `shadow.offset` de `building`, `beds` y
  `stall`; `shadow` y `under` de `pier`; `furnish.shape`— y una receta con sol que los declara lo oye: cada render
  (`map_render`, `map_export`, `map_lint`, `map_compare`) lo dice por stderr,
  un renglón por paso (`sunIgnored`, `mapsteps/sun.ts`): dos luces donde una
  calla son las que nadie nota. Un `place` pinta con el
  contexto de la madre: hereda su sol. Con `light: [x, y]` (o sin `light`)
  cada paso tira su sombra a su manera, como siempre (`mapsteps/sun.ts`).
- **Una lámpara en vez del sol** (`light.source`, para un interior):
  `"light": {"source": {"at": [5, 4], "h": 30}, "length": 1.2, "tone": 2, "soft": 2}`
  en vez de `dir`. La lámpara está en la celda `at` (su medio; se aceptan
  fracciones) a `h` px del piso. Cada cosa tira su sombra desde su pie **lejos
  de la lámpara**: un punto z px alto cuyo pie está a d px de ella cae a
  d·z/(h − z) px del pie (la geometría de una luz puntual), nunca a más de
  `length`·z; lo que está tan alto como la lámpara o más tira `length`·z. Así,
  cuatro muebles alrededor de una vela tiran cuatro sombras opuestas, más largas
  cuanto más alto el mueble. La misma máscara, `tone`, `tones`, `soft`, `fray`,
  `on`: todos los pasos de la lista de arriba la leen sin saber cuál luz es
  (`leanAt` en `mapsteps/sun.ts` da la inclinación para un pie y un alto). Lo
  que tiene un lado iluminado fijo (`ctx.dir`: el labio de una cara, el lado
  claro de una cosa) lo toma de la lámpara hacia el medio del mapa.
- **Relieve** (`relief`, en `rocks`, `boulders` y `crag`): una roca es un
  campo de alturas sombreado desde la luz de la receta, no una bola de dos
  tonos («una pelota de roca», Joaquín, 10 de octubre). `mapsteps/rockform.ts`
  arma el campo sobre la silueta de siempre (normalizada al disco unidad): una
  cúpula con la cresta arriba y atrás —caída corta y empinada hacia el borde de
  arriba, larga hacia el pie—, y las **facetas** son planos tangentes a esa
  cúpula: uno chato cortado bajo la cresta (el plano de arriba) y `facets − 1`
  alrededor, uno siempre mirando lejos de la luz; la altura de un px es el más
  bajo de ellos (el cuerpo convexo que envuelven, con aristas rectas donde se
  cortan dos planos, quebradas un px por ruido). Cada px toma la pendiente de
  su plano (un 10 % doblada hacia la cúpula) y su normal contra la luz —`dir`
  del sol, o la `source` de una lámpara por `leanAt` en el pie de la roca,
  levantada 35°— da la banda: claro (el plano de arriba y las caras al sol),
  medio (los costados), sombra (las caras opuestas), el **núcleo** un tono más
  hondo en la cara que mira contra la luz justo bajo una cresta lateral (no
  bajo el labio del plano de arriba: ahí una raya oscura se lee como una boca),
  un **rim** de 1 px del tono más claro adentro del contorno donde el borde
  mira a la luz, y las **grietas** (`cracks`: caminatas desde el borde de
  arriba hacia el pie, hundidas en el campo) en el tono más hondo, con la pared
  de enfrente un tono arriba. Una arista entre dos caras del mismo tono lleva
  la del lado más oscuro un tono abajo; el tramado es una costura de 1 px sólo
  donde dos bandas se tocan adentro de una misma cara de una roca grande, a lo
  largo. Una roca chica toma menos facetas (una cada 16 px² además de la de
  arriba) para leerse a 1×. **La silueta, el contorno (tinta incluida: `settle`
  se la saca abajo como siempre) y la sombra proyectada no cambian**, y sin
  `relief` la receta da los mismos píxeles. En un `crag` las lajas que ya tenía
  se ensanchan (30 / `facets` + 2 px) y cada una se gira hacia la luz según su
  sal y `height`; quedan la nieve, las costuras, las vetas y `face_colors`.
  `{"step": "rocks", …, "relief": {}}` o `{"relief": {"facets": 4, "cracks": 2, "height": 1.2, "seed": 7}}`.
- **La cima de un peñasco con su material** (`crag.top_colors`, 11 de octubre):
  desde arriba lo que más se ve de un `crag` es su cima, y tenía tonos fijos
  (`piedra clara`, `piedra`, `nieve honda`): en las cuevas del inmortal la roca
  quedaba a luminancia 134 contra 88 de la referencia aunque las caras ya fueran
  basalto. `top_colors` es a la cima lo que `face_colors` a las caras: un mapa
  `color → color`. Con `"ramp"` la roca de la cima se sombrea con la rampa de su
  material por la luz de la receta: la normal del campo de alturas (la pendiente
  a lo ancho y a lo largo, a la mitad: de arriba se lee más chata) contra la luz
  levantada 35° (`litBy` de `rockform.ts`, la regla del relieve). Lo chato toma
  el tono principal del material (`base`), lo que mira al sol uno o dos arriba, lo
  que le da la espalda uno o dos abajo; el borde dos abajo del lado contrario a la
  luz y uno del otro, la roca justo bajo la nieve uno abajo. Con `relief` la cima
  se quiebra en planos (celdas de Voronoi, cada una inclinada por su sal tanto
  como `height`) y donde dos planos de una misma banda se tocan, el que mira más
  lejos de la luz baja un tono: una arista, no una línea de tinta. La nieve de la
  cima toma la misma luz (`túnica luz`, `nieve`, `nieve sombra`) y sus manchas se
  suavizan más (sobre roca oscura una mota de nieve se lee como basura). Las
  caras no cambian. `{"step": "crag", …, "top_colors": "ramp", "relief": {}}`.
- **Lomas de nieve** (`drifts`, 11 de octubre): la nieve con forma. Las
  hondonadas de `snowfield` son manchas lavanda chatas; una ladera nevada tiene
  lomas con un lado al sol y otro en sombra, y nieve amontonada contra lo que se
  para en ella. `mapsteps/drifts.ts` arma un campo de alturas sobre la nieve (los
  px de `on`), como `relief` el de una roca: lomas sueltas (`count`, `size`,
  `height`) o fijas (`at: [[u, v, rx, ry, alto?]]`), largas del lado de donde
  viene el viento y cortas a sotavento (`wind`: hacia dónde sopla; la cresta a un
  tercio hacia sotavento), con el borde que ondula; y bancos (`against`): contra
  cada cosa con pie registrada antes (`registerFooted`, como las lee `settle`:
  rocas, troncos, postes; `targets` las elige) y contra los px de los materiales
  de `against.kinds` (la roca de un `crag`, una pared), la nieve sube hacia el pie
  (`reach`, `height`), más donde el viento le pega, despareja. Se sombrea con
  `litBy` sobre la rampa de la nieve: el lado al sol queda en la nieve (`base`,
  por defecto el tono bajo el claro: `nieve` en `[noche, honda, sombra, nieve,
  luz]`; pintado entero de `túnica luz` se leía mancha y no luz), el lado contrario
  uno y dos abajo, y la cresta —el último px hacia la luz antes de la sombra— el
  tono claro. Sin contorno. Va después de los `crag` y los árboles y antes de
  `settle`. `{"step": "drifts", "material": "nieve", "on": ["nieve"], "height": 7,
  "against": {"kinds": ["ceja", "roca"]}}`.
- **Asentar** (`settle`): lo que se para se asienta en el suelo, no queda
  puesto encima. Un sello se estampa entero, con la tinta cerrada por los
  cuatro lados, y su único vínculo con el suelo era la sombra del sol: «una
  piedra al borde de un estanque se siente como una pelota de roca puesta
  ahí» (Joaquín, 10 de octubre). **Los pasos registran sus cosas con pie**
  mientras pintan (`registerFooted`, `mapsteps/settle.ts`) —un sello con
  `stands`, una roca de `rocks`, `boulders` o `wetstones`, el tronco de cada
  árbol de `grove`, el cuerpo de cada poste de `fence`, los pilotes de
  `pier`, las paredes de `building`— y registrar no pinta nada: sin `settle`
  la receta da los mismos píxeles. Un paso `settle` toma las que se
  registraron antes que él (todas menos los edificios, o las de `targets`: id
  del paso, nombre del paso o clase —`stamp`, `stone`, `trunk`, `post`,
  `piling`, `building`—) y les aplica cinco reglas, cada una apagable:
  `sink` (el pie se hunde 1–3 px bajo una línea mordida y el suelo de abajo
  vuelve encima; una base recta y construida se hunde pareja, unas patas un
  tercio; donde debajo del pie hay otra cosa no se hunde, y sólo se espeja
  suelo de verdad), `ink` (la tinta que mira al suelo, y la de los costados del
  cuarto de abajo cada vez menos, toma el tono más hondo del material de
  encima en esa columna), `ring`
  (un anillo de oclusión un tono abajo del suelo, más ancho abajo que a los
  costados, deshilachado, haga lo que haga el sol), `tufts` (briznas del
  pasto de alrededor que pisan el borde del pie, o piedritas en tierra) y,
  por contexto, `wet` (agua a ≤ 2 px del pie: franja mojada, espuma bajo el
  pie y el reflejo roto en el agua; `wet.layers` para el agua que vive en
  una capa, como un estanque que el juego llena) y `moss` (sólo si se pide:
  musgo del lado contrario al sol con el pie en pasto en sombra). Va **al
  final**, después de la luz y de los esparcidos: uno posterior podría caer
  sobre el suelo que el pie devolvió. `map_lint` mide los sellos con la base
  toda de tinta y avisa pasado el 10 %.
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
  como pakua, `octagon: true` la hace de ocho lados, `trigrams` le da sus ocho
  trigramas desde el norte en sentido horario (la piedra queda lisa, sin vetas
  claras, a 3 px de cada trigrama y del yin-yang: lo tallado se lee) —tres líneas de arriba hacia
  abajo, `"1"` entera y `"0"` partida, la de abajo hacia el centro, talladas
  con el filo de luz debajo y largas según el radio: a 48 px, barras de 10; las
  diagonales acostadas sobre la piedra (calculadas en el plano del disco,
  perpendiculares al rayo y del largo de las del norte, y proyectadas:
  paralelas a su lado del octógono, sin filo)—, `trigramAt` su radio (0,6) y `taiji: true` el
  yin-yang al centro;
  `slab`: una losa vieja con grieta y musgo; `roots`: raíces que se meten en
  la tierra). Textura `flagstones` (lajas por grilla escalonada, con `stones`
  y `wear` en el área; `fray` deshilacha el borde: falta alguna losa que el
  borde cortó, el borde se muerde de a dos px y las juntas que dan al pasto
  son de musgo, no una línea de sombra alrededor). Parámetros: `patches` del material (escalas, sales y
  umbrales del pasto), `levels` de `mottled`, `on` en `area`/`path` (sólo
  sobre esos materiales), forma `curve`, blobs con sal y `fine`, `openings` y
  `crowns` del bosque de afuera, `gaps` y `crowns` de `poke`, `breath`,
  `salts` y ramales-sendero en `path`, `buildings`, `casts` y `rim` en
  `light`, `odds`/`far_spacing`/`stem`/`over`/`alone`/`reach` del esparcido y
  `what: "litter"` (agujas caídas y piedritas en un sendero). En la receta:
  `shade` (la tabla de oscurecer a mano, en vez de bajar por la rampa) y
  `scatter_salt` (la sal del azar del esparcido).

- **El azar del esparcido es por intento, no un flujo compartido** (desde el
  11 de octubre de 2026; The Unwritten Dao #266). Cada intento de `scatter`
  (briznas, flores, piedritas, hojas, rocío, `dashes`), de `sprigs`, `fallen`,
  `motes` y de las cuatro tandas de `glenlitter` saca sus números de un hash
  del paso (su `step`, su `what`, su `id` y cuántos iguales vinieron antes,
  con `scatter_salt` y `seed`), del número de intento y del número de sorteo:
  el intento 812 cae siempre en el mismo px y decide lo mismo, haga lo que
  haga el resto del mapa. Antes los pasos compartían un flujo y un intento
  rechazado o aceptado corría todos los de después: mover un sendero una
  celda movía briznas y rocío en toda la isla. Ahora lo que cambia queda a
  menos de dos celdas de lo tocado (lo que el espaciado de las briznas
  arrastra). Agregar un paso con `id` no re-sortea los demás; agregar uno sin
  `id` del mismo `step`/`what` antes de otro sí re-sortea ese otro (va por
  orden): un `id` lo ata.
  `"scatter_draws": "stream"` en la receta vuelve al flujo compartido de antes
  (los píxeles de los scripts del juego y de los mapas pintados antes de ese
  día: los tests contra los PNG de los scripts lo usan). Sin el campo, el
  sorteo nuevo: las recetas viejas cambian **una vez** (el mismo esparcido,
  otras posiciones).
- **Las matas y los árboles de una zona de `grove` también** (11 de octubre de
  2026; The Unwritten Dao #290). Los pies ya salían del número de intento;
  la forma (la sal de cada copa y cada mata) salía de cuántos se habían
  plantado antes en la zona, así que una mata de menos junto a un sendero
  cambiaba la forma de todas las que venían después, por toda la isla. Ahora
  la sal es un sorteo del propio intento. Quedan dos alcances que no son
  azar: un grupo (`groups`, `ranks`) se arma entero, así que un árbol a dos
  o tres celdas de lo tocado puede cambiar con su grupo; y una zona que
  llega a su `count` termina cuando lo alcanza, así que una mata de más o de
  menos junto al cambio saca o agrega la última del sorteo, en cualquier
  lado (una zona que no llega a su `count`, que termina por lugar, es local
  del todo). Los árboles de `trees` siguen tomando la sal de su índice (o la
  suya, el quinto valor): la lista es un dibujo, y un `place` movido con `at`
  tiene que conservar sus árboles; para sacar o agregar uno sin re-dibujar
  los de después, cada uno con su sal. Con `"scatter_draws": "stream"`, la
  sal de antes (por cuenta).

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

- **Una cascada helada: el paso `icefall`** (la fuente de la Campana Alta de
  unwritten-dao, `docs/diseno/campana_alta.md`). El agua que se heló cayendo por
  una cara de roca: una cortina de columnas de hielo una al lado de la otra,
  angosta en el labio y más ancha al pie.
  ```json
  {"step": "icefall", "material": "hielo", "at": [3.3, 0.9], "length": 92,
   "width": [5, 11], "flutes": [2, 4], "icicles": 0, "foot": [17, 7]}
  ```
  `material` es una rampa de seis [tinta, hondo, sombra, medio, luz, brillo];
  `at` la cabeza (el medio del labio), `length` px hasta el pie, `width` [medio
  ancho arriba, al pie] (se abre con la caída). Cada columna (`flutes`, px) es
  redonda: su canto del lado de la luz claro y una canaleta oscura del otro, un
  poco más clara o más oscura que sus vecinas; la cortina entera con luz del
  lado de `light` (oeste por defecto) y la tinta en el borde en sombra; se
  hincha en pliegues (un borde claro sobre uno oscuro), hilos de luz bajan por
  algunas columnas; cada una termina en su carámbano (`icicles` px el más
  largo, la punta de un px) y `foot` [rx, ry] apila hielo y espuma helada al
  pie, encima de los carámbanos. Con `layer` va en otra capa y el suelo queda
  como estaba. **`glints`** `{layer, share, length}`: el agua que sigue
  corriendo debajo del hielo, rayitas de `length` px (2) del tono de brillo
  bajando por el medio de las columnas (`share`, la chance por fila y columna,
  0,12) y unas pocas en el montón del pie, en la capa `layer` (`brillos`) que el
  juego hace titilar, como los brillos de un río; el suelo no cambia. No tiene
  comando `map_icefall` (el catálogo del MCP tiene presupuesto): se escribe en
  la receta.

- **Un puente de piedra sobre arcos: el paso `causeway`** (el puente del lago de
  la fuente de la Campana Alta). Un puente que cruza el agua de sur a norte,
  visto de arriba: de los dos lados de su tablero salen las pilas a intervalos
  y entre ellas, pegada al tablero, la sombra del arco sobre el agua.
  ```json
  {"step": "causeway", "material": "losas", "x": [7.4, 9.6], "y": [6.0, 11.8],
   "on": ["agua"], "every": 22, "pier": [10, 9], "rise": 4, "arch": [9, 13],
   "shade": ["monte sombra", "agua de hielo honda"]}
  ```
  `x` los costados del tablero y `y` el tramo sobre el agua, en celdas; sólo
  pinta sobre `on` (el tablero y las orillas quedan). Cada pila es un bloque de
  `pier` [sale, largo] px con las esquinas de afuera cortadas, su tapa con luz
  del lado oeste, tinta alrededor y `rise` px de cara sur en sombra; `every` px
  de una a otra. Entre dos pilas, la media luna oscura del arco: `arch` [oeste,
  este] px en su medio (más larga del lado contrario a la luz: el tablero está
  alto y tira su sombra), `shade` [hondo, borde]. Ponelo antes de los cordones
  (`balustrade`). Sin comando `map_causeway`: se escribe en la receta.

- **El agua que corre cae por un muro: el paso `spill`** (los arroyos de los
  aleros de la Campana Alta, que bajan por los muros de contención). No es hielo
  (`icefall`): una franja de agua de `length` px desde `at` (la cabeza, en
  celdas), con medio ancho `width` [cabeza, pie] px, en vetas de los tonos de su
  rampa [hondo, medio, bajo, espuma, brillo], el labio de arriba en brillo, los
  bordes un tono abajo (el hondo del lado contrario a la luz), espuma donde cae
  (`foot` [rx, ry] px) y, si hay `flow`, las vetas de luz en esa capa para que
  el juego las haga correr hacia abajo.
  ```json
  {"step": "spill", "material": "agua que cae", "at": [16.5, 19.85], "length": 27,
   "width": [7, 9], "flow": "cascada", "foot": [12, 4]}
  ```
  Va después del muro (`parapet`, con un hueco donde cae) y del arroyo que llega.

- **El agua que cae por una garganta, vista desde arriba: el paso `gorge`** (después de los puentes a ras del piso de la
  Campana Alta). Una hendidura cortada en la terraza: desde el labio `at` por `length` px, el agua de medio ancho `width`
  [labio, pie] entre dos paredes de roca (`rock`) de unos `walls` px, la que mira a la luz clara y la otra en sombra, más
  oscuras al fondo, con grietas y nieve en el borde (`snow`); brillo en el labio, hilos que se alargan al caer, más espuma
  abajo y un montón de espuma al pie (`foot`); `flow` como en `spill`.
  ```json
  {"step": "gorge", "material": "agua que cae", "rock": "roca", "at": [16, 21.85], "length": 62, "width": [13, 17],
   "walls": 9, "snow": ["túnica luz", "nieve sombra"], "foot": [22, 6], "flow": "cascada"}
  ```
  `spill` cae en saltos con `ledges` (`[{at, widen, shift}]`: un labio de roca `rock`, espuma debajo, el agua más ancha y
  corrida) y rompe su cabeza y los labios de las repisas con `ragged` px. Sin comando `map_gorge`.
  Una repisa con `pool` px junta el agua en una cubeta irregular antes del desborde; `wobble` px hace que el ancho
  suba y baje, `split` [desde, hasta] la abre en dos hilos y `wet` px moja la roca de los costados (un tono abajo, con
  motas de salpicadura).
  En `gorge`, `void` px pone el hueco oscuro entre el agua y las paredes, `lip` px el borde claro de la terraza en la
  cabeza con su sombra, `relief` las repisas y entrantes de las paredes, y `still` hace que el agua corra sin caer (un
  cuello hasta un puente). En `building`, `open[].thick` y `open[].bases`: postes y columnas más gruesos con su basa.

- **Un puente de arco visto de frente: el paso `archbridge`** (los puentes de
  los aleros de la Campana Alta, que cruzan los arroyos de oeste a este). El
  tablero de losas entre dos pretiles (`curbs` px), y bajo su borde sur la cara
  de `face` px en hiladas, con los arcos (`arches`: `{u, half}`) abiertos del pie
  hasta `rise` px: adentro queda lo pintado antes (el agua), más oscuro bajo la
  curva (`vault` px) y con tinta arriba; las dovelas alrededor con luz del lado
  oeste y la clave arriba.
  ```json
  {"step": "archbridge", "material": "arco", "x": [14.4, 18.6], "y": [17.55, 18.7],
   "face": 16, "arches": [{"u": 16.5, "half": 9}], "rise": 13, "curbs": 3}
  ```
  Va después del agua que cruza. Sin comando `map_spill` ni `map_archbridge`.

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
  tablas de borde, `pediment`). **El caballete de un templo** (`ridge: "h"`): `hook` enrosca los cuernos de las
  puntas (suben panzones hacia afuera y la punta vuelve hacia adentro, sobre el caballete) y `ornament`
  `{width, colors?, heart?}`, con `crest` de alto, pone en el medio un remate de volutas (tejas oscuras con
  canto de luz y cuentas de oro) y un medallón de oro con corazón bermellón al pie. **Un techo de pabellón**
  (el de alquimia de unwritten-dao, `docs/diseno/alquimia.md`): `sweep` (0 a 1) lo vuelve cóncavo (el alero sube
  desde el medio, costados y limatesas se abren al pie, las tejas de cada faldón de punta corren a lo largo de su
  limatesa); `back` px, con `hip`, baja las esquinas de atrás del alero (una pirámide, no una caja); `hipcap` px
  pone un rollo de tejas por cada limatesa; `trim` pinta caballete, limatesas, cuernos y remate con otra rampa de los
  mismos tonos (cumbreras grises sobre teja verde). **Un alero de templo** (unwritten-dao `docs/diseno/recinto.md`): `tips` (0 a 1) es la parte de cada mitad
  del alero que sube a la punta; el medio corre derecho (el templo de la referencia: derecho el 83 %, `tips` 0,2);
  `tiphook` px (con `hip`) enrosca un gancho en cada esquina de adelante, al pie de la limatesa, en la rampa de `trim`;
  `[oeste, este]` con un 0 deja sin gancho la esquina que un ala tapa. **Las costillas parejas** (`ribs: "even"`): donde
  las columnas de tejas se abren hacia el alero, un solo px oscuro por canal y por fila (con `fan`, el de siempre, un canal
  se dobla o se saltea una fila: el zigzag donde la limatesa abre más). **Un techo de dos pisos** (el pabellón de alquimia,
  unwritten-dao `docs/diseno/alquimia.md`): un `roof` encima de otro en la misma capa con `overroof: true` echa la banda
  de sombra de su alero sobre las tejas de abajo (sin él, sólo al suelo), y `lip: true` pinta la fila de remates del
  alero en la rampa de `trim` (el labio gris del alero verde: donde un piso termina sobre el otro, se lee el borde).
  **El caballete ornamentado** (`ridgeband: {height, inset?, colors?}`): en lugar del rollo, una banda de volutas de
  `height` px desde el tope del caballete hacia abajo (nunca por encima: lo que crece detrás del techo no se mueve), una
  cada 8 px, espiral con luz y cuenta de oro, junta oscura entre dos; `crest`/`ornament` y los cuernos van encima.
  `rise` (px) la hace subir hacia el medio de a una voluta (la del centro `rise` px sobre el caballete, cada vez menos
  hasta `reach` de cada mitad, 0,6; afuera, plana) y el remate con su medallón va sobre la del medio: el caballete del
  templo de la referencia. Sube por encima del techo: la máscara del lugar crece. **Un techo viejo:** `moss: {odds}` (0,08 a 0,2)
  le crece musgo en manchas, más hacia el alero y en los canales, cada px en el tono de musgo de su teja. `lean: "west"` (o `"east"`) deja un solo agua que cae
  hacia ese lado, con el caballete contra el otro borde: un cobertizo apoyado en
  el cuerpo. El alero sobresale `eaves` px por los cuatro
  lados, se abre `flare` px hacia abajo (el alero es más ancho que el caballete,
  y las columnas se abren con él), sus esquinas suben y salen en punta
  (`upturn`) y la línea entre ellas se comba; la fila de abajo son los remates de
  teja (el canal corta antes: el borde nunca es una regla) y debajo cae una
  banda de sombra de `shadow` px sobre lo que haya (la pared), nunca arriba.
  `outline` (por defecto sí): tinta alrededor de arriba y de las puntas, donde
  se recorta contra lo de atrás. `layer` para ponerlo en otra capa.

  **Un techo de paja** (`thatch`; unwritten-dao #227: la choza de Gu, el alero del fogón de Peng):
  ```json
  {"step": "roof", "material": "paja", "rect": [10.7, 3.7, 2.75, 3.2], "ridge": "v", "lean": "east",
   "eaves": 3, "thatch": {"course": 5, "fray": 2, "ties": 10}, "moss": {"odds": 0.1}}
  ```
  `thatch: true` (o el objeto) repinta de paja la misma forma que haría la teja (alero, `flare`, `hip`,
  `ridge`, `lean`, `gable`): haces en **hiladas paralelas al alero** de `course` px (5), peinados hacia abajo
  (en el frente cada haz de 3 px con su lado a la luz un tono arriba y el otro uno abajo, alguno entero un tono
  corrido; en un agua que cae al este o al oeste, vista de través, las hiladas son 1,4 veces más anchas y cada fila
  de paja es una hebra suelta: con haces se leía como ladrillo);
  el borde de abajo de cada hilada **cuelga deshilachado** sobre la de abajo (hasta `fray` px, de a un haz; de a
  una hebra en los costados) con la sombra oscura debajo; el **canto del alero grueso** de puntas cortadas (la fila de abajo oscura, dos filas de
  puntas con luz) y alguna punta de paja colgando un px más; los **costados redondeados**: en un hastial
  (`ridge: "h"` sin `hip`) y en las puntas norte y sur de `ridge: "v"` las hiladas doblan hacia abajo en los
  últimos 4 px; con `hip` corren alrededor de la limatesa. El caballete es un **rollo atado** (`cap` px, 4 por
  defecto con paja; una atadura cada `ties` px, 10). **El sol de la receta** decide los tonos: la cara que mira
  hacia la luz un tono arriba, la que le da la espalda uno abajo (con el sol del noroeste del juego, el agua del
  oeste clara y la del este en sombra; con un sol del este, al revés); el frente (el agua que mira a la cámara)
  es el cuerpo y sólo se aclara con un sol del sur. El `material` es la paja: rampa de 6 tonos [tinta, hondo,
  sombra, cuerpo, luz, brillo] (madera sombra, tierra sombra, bronce, oro, oro claro, arena). Sin cuernos,
  `crest`, `hook` ni `tiphook`; `moss` funciona igual que en la teja. Sin `thatch`, las tejas de siempre.

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
  `"<id> roof"`). **Si el techo va en otra capa** (`roof.layer: "techos"`),
  `shadow.layer` dice cuál oscurece la sombra sobre esas máscaras: sin él cae en
  el suelo, debajo del techo, y no se ve; sobre los materiales (el pasto) sigue
  yendo al suelo.

  **La chimenea en dos capas** (`stack_layer`, `split`): el horno en el suelo
  (quien se para delante queda encima de él) y el tubo en la capa de los techos
  (encima de la gente y del techo que pisa):
  ```json
  {"step": "chimney", "...": "…", "stack_layer": "techos", "split": 32,
   "shadow": {"on": ["forja roof", "pasto"], "layer": "techos"}}
  ```
  Desde `split` px sobre el pie para arriba (por defecto el alto de `base`: el
  hombro, el tubo y la tapa) va en `stack_layer`; lo de abajo en `layer`. Si el
  horno es más alto que la pared del edificio, poné `split` a la altura del
  alero (`wall` menos lo que cuelga el alero) para que lo que se cruza con el
  techo vaya con él. Compuesta (la de arriba sobre la de abajo) es la misma
  chimenea, píxel por píxel. Sin los campos, una sola capa como antes.

  **`smoke`**, el humo de `chimney` sin la chimenea (un incensario, un fogón):
  ```json
  {"step": "smoke", "at": [12, 5.9], "layer": "humo", "puffs": 8, "drift": [7, 36], "size": [1, 4.2], "fade": 0.65}
  ```
  `at` es donde nace la columna; lo demás, como el `smoke` de la chimenea (que lo pinta con la misma función).

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
  - **norte-sur** (de punta; sólo más de tres de bajada por uno de ancho, `seenEndOn`: un tramo
    empinado sigue siendo barras inclinadas): los postes se escorzan, más juntos que a lo ancho
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
  (`doors`; `panes` es la rampa [sombra, luz] del papel de las celosías, para que una pared de madera oscura
  las deje claras, y `door_lattice` [desde, alto] px vuelve celosía los paneles de arriba de la puerta doble),
  **una pared de tablas** (`boards: true` o `{width, weathered}`: tablas paradas del `material` de `width` px, 4, con
  el canto de luz al oeste y la junta honda al este, algunas un tono abajo, `weathered` 0,3; la casa de madera gris de
  Peng, unwritten-dao `docs/diseno/forja_de_peng.md`),
  **columnas que se despegan** (`pillars: {width, shade?, base?, base_height?, brackets?}`; el templo de unwritten-dao,
  `docs/diseno/recinto.md`): postes de `width` px (3 es el de siempre) con la tinta en su canto este, `shade` px (2) de
  sombra sobre la pared a su este, un bloque de piedra clara al pie sobre el zócalo, un px más ancho por lado
  (`base: true` la piedra del zócalo, o un material; `base_height` 4) y `brackets` px de viga con las cabezas de las
  ménsulas con luz cada 6 px bajo el dintel; puertas y ventanas no se mueven,
  y **vanos abiertos** (`open`): se ve adentro (la pared del fondo en
  sombra, un estante con cosas, un letrero, un banco; con `floor` px, el piso de
  piedra que se ve adentro, sobre el zócalo que sigue por debajo, y `columns` columnas sueltas: un pabellón
  abierto; `through: true`, un pabellón abierto de lado a lado: sin pared del fondo, entre las columnas se ve lo pintado
  antes —la campana de la Campana Alta delante de sus cascadas—). Su **cara este en sombra**
  retrocede `side` px (sube medio px por px), con el poste de esquina; la
  **sombra al suelo** es la silueta entera corrida `shadow.offset` px al sureste,
  con el borde deshilachado. `roof` es un `roof` sin `rect`: va sobre las paredes
  y la cara este. Registra las máscaras `<id>` (todo el edificio) y `<id> roof`.
  **Puertas y escalinata** (el pabellón de los discípulos, unwritten-dao
  `docs/diseno/pabellon.md`): una puerta de `doors` de 10 px o más es de **dos
  hojas** (la junta oscura al medio, cada hoja con su larguero de luz, un
  tablero hundido y una argolla), en su madera (`door`, por defecto la de
  `frame`); los postes del marco son las jambas. `stoop` baja escalones de
  piedra desde el tope del zócalo hacia adelante: `at` [desde, hasta] en celdas
  desde el oeste (el ancho del escalón de arriba), `treads` (3), `tread` px de
  fondo con su contrahuella (6), `riser` (2), `spread` px que cada uno es más
  ancho que el de arriba (1) y `cheek` px del bloque de piedra a cada lado (5);
  nariz con luz, contrahuella en sombra, juntas trabadas de un escalón al otro.
  Un edificio con alas es tres `building` con el pie en la misma fila: las alas
  primero (`side: 0` la que queda contra el cuerpo) y el cuerpo, más alto,
  después, así su alero cae sobre los techos de las alas.

  **`beds`**, canteros de huerto:
  ```json
  {"step": "beds", "id": "huerto", "soil": "tierra del huerto", "frame": "madera de la cerca",
   "beds": [[1.5, 7.85, 2.25, 1.75, 0], [4, 7.85, 2.2, 1.75, 1]],
   "plants": [{"shape": "leafy", "spacing": 5}, {"shape": "flower", "bloom": ["flor sombra", "flor", "flor clara"]}],
   "rise": 4, "shadow": {"offset": [3, 2], "on": ["pasto"]}}
  ```
  Cada cantero es `[u, v, w, h]` (o con un quinto número, el índice de lo que
  crece en él en `plants`; si no, se turnan): un marco de tablas visto de arriba
  (las del norte y el oeste con el canto de luz), la tabla de adelante con su
  cara al sur (`rise` px, pie en tinta, juntas), adentro tierra oscura (`soil`:
  [honda, oscura, cuerpo, luz]) en surcos este-oeste cada `rows` px y una hilera
  de plantas en cada lomo, de atrás hacia adelante: `leafy` (una cabeza de hojas
  de 6 × 5), `sprout` (un tallo con dos hojas), `flower` (tallo, hojas y una
  cabeza de `bloom`), `tall` (una mata más alta que ancha). Las hileras alternan
  medio paso, falta una planta cada tanto y cada una sube o baja un px: crece, no
  es una bandeja. **Un huerto que desborda**: `size` (por clase, 1 a 4) hace de cada planta un montículo de
  hojas festoneado `size` veces más grande (una flor, con flores arriba); `overflow` px corre las hileras por encima
  de la tabla de atrás y más allá de las de los costados, y pone las plantas de todos los canteros después de las
  tablas: lo de adelante tapa la tabla del de atrás. Con más `size`, más `spacing` y `rows`. Su sombra cae al sureste sobre `shadow.on` (`offset`, por defecto [4, 3]: dos tonos cerca de las tablas, uno afuera). Registra la máscara
  `<id>`; un `place` lo corre por la esquina de cada cantero.

  **`stall`**, un puesto de mercado con toldo (el mercado de la secta, unwritten-dao
  `docs/diseno/mercado.md`):
  ```json
  {"step": "stall", "id": "puesto rojo", "rect": [4, 2.6, 2.8, 1.1], "cloth": "toldo rojo", "wood": "madera",
   "goods": [{"kind": "pottery"}, {"kind": "fruit"}], "layer": "techos", "shadow": {"on": ["pasto", "lajas"]}}
  ```
  `rect` es el suelo entre los postes: los de atrás en la fila `v`, los de adelante (y el pie del
  mostrador) en `v + h`. El **toldo** (`cloth`, rampa de 6: [tinta, hondo, sombra, cuerpo, luz, brillo];
  rojo: tinta, madera sombra, bermellón, bermellón claro, piel sombra, piel) va en `layer` (los techos:
  el jugador pasa por debajo y queda tapado): está `height` px [adelante, atrás] sobre el suelo (por
  defecto [34, 38]: más alto atrás, cae hacia adelante), sobresale `eaves` px a los costados y
  `overhang` hacia adelante, es `flare` px más ancho en el borde de adelante que en el lomo, se comba
  `sag` px entre los postes y levanta las puntas `upturn` px. El lomo con luz, el costado oeste con
  luz y el este en sombra, `panels` paños cosidos con su costura en sombra y su labio de luz, un
  pliegue de cada poste de adelante hacia el medio del lomo (`folds`), y el **faldón** de `valance` px
  colgando del dobladillo, en sombra, con el pie festoneado; tinta alrededor. Los **postes** (`posts`
  2 o 4, `post` px de ancho) asoman `peak` px por encima de la tela con un nudo de tinta. El
  **mostrador** (`counter`: `depth` px de tapa, `rise` de frente, `inset`) con tablas a lo largo y
  frente de tablones; arriba, la **mercadería** (`goods`, por turno: `fruit` canasto colmado, `cloth`
  piezas dobladas, `pottery` cántaros y cuencos, `herbs` atados, `baskets`; `colors` las rampas
  [oscuro, cuerpo, luz]; `heap` 2 o 3 filas, las de atrás medio paso corridas y más altas: un mostrador colmado) y, atrás, un **estante** con más (`shelf`, un tono abajo en la sombra del
  toldo; con `layer`, el estante y los postes de atrás van a la capa del toldo: quien pasa por detrás
  del puesto queda detrás de ellos, no encima). Bajo el dobladillo una banda de sombra (`under` px) sobre mostrador, mercadería y postes; el
  suelo bajo el toldo, entre el dobladillo y el mostrador, dos tonos abajo; una línea de contacto al
  pie del mostrador; la sombra del toldo cae al sureste (`shadow.offset`, por defecto [10, 5]) sobre
  `shadow.on`. Registra las máscaras `<id>` (mostrador, postes, mercadería) y `<id> awning`. Un
  `place` lo corre por `rect`, y también corre una `rope` (`from`, `to`): la cuerda con banderines del
  mercado.
  **Tapado** (`covered: {cloth, layer, drop, ropes}`): una lona (`cloth`, rampa de 6 como el toldo; su borde en su tono hondo, nunca la tinta) sobre el mostrador y la mercadería: sigue los montones (luz al oeste de cada uno, sombra al este, un pliegue entre dos), se dobla sobre el borde de adelante y cuelga `drop` px (4) por la cara con pliegues, detrás de los postes de adelante y en la sombra del toldo; `ropes` (2) la atan en el oscuro de la madera. Sin `layer` va al suelo (un puesto siempre cerrado); con una capa propia el puesto muestra su mercadería y la lona la tapa cuando el juego prende esa capa (de noche); entonces lo que está sobre el estante baja al suelo, debajo de la lona (su tabla sigue arriba), y de día se ve igual.

  **Rayas** (`stripes`, el toldo de Zhao en la aldea, 10 de octubre): `{"cloth": "toldo blanco", "width": 3}`
  pinta franjas que alternan `cloth` y esta segunda tela (otra rampa de 6, del mismo orden: blanca =
  tinta, piedra sombra, túnica sombra, pergamino, túnica luz, nube), de `width` px medidos en el lomo
  (por defecto 3). Corren cuesta abajo por la columna de la tela lisa, así que se abren con el `flare`:
  las del medio caen derechas y las de afuera se corren hacia afuera, y siguen por el faldón y su
  festón. Cada px toma su tono en la rampa de su franja, así que la luz del lomo, el costado oeste,
  la sombra del este, las costuras y los pliegues quedan iguales encima de las rayas. Sin `stripes`,
  el toldo de siempre píxel por píxel.

  **Una cadena** (`chain: {colors?, link?}`, el paso de hielo y la Campana Alta de unwritten-dao): la cuerda en
  eslabones de `link` px, uno de plano (extremos oscuros, el medio con luz y un px del otro lado del aro) y uno de
  canto; con `sag: [x, y]` (un vector) el medio cuelga hacia un costado: la cadena de un puente que corre de norte a
  sur se comba hacia afuera del tablero. Las campanas, con `hang`.
  Una `rope` más empinada que 1 (dos casas una al sur de la otra) o atada de derecha a izquierda se
  dibuja por su eje largo y rellena el salto cuando la comba la hace bajar más de un px: sale una línea
  continua, no puntos. Su `sag` sigue siendo hacia abajo de la pantalla: en una cuerda norte-sur se ve
  como un tramo más largo, no como una curva de costado. Las que cruzan de izquierda a derecha con
  pendiente de 1 o menos siguen siendo las del script, un px por columna.


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
  `kind`, `stands` (sellos: un pilar pintado en el suelo que echa sombra) y
  `flip` (el sello espejado en su caja: la tela del estandarte hacia el otro lado).

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
  (losas largas de punta a punta), `arena` (el ruedo de un duelo; `inlay` le engasta bandas de bronce en el
  piso: `at` radios como fracción del óvalo, `width` px, con luz del lado del sol), `balustrade`
  (`across`: bordillo, pasamanos, barrotes, postes con remate, `gaps` y
  `holes`; `down`: las de los costados vistas de arriba; lo de `across` se
  para y `cast` echa su sombra), `stairway` (escalinata hasta abajo del
  dibujo), `sprigs`, `fallen` y `motes` (con el azar compartido) y `overhang`
  (la rama de un pino de risco en una capa de adelante, con su sombra). En
  `cast`: `landmarks`, `offset` (los adornos traen el `offset` del mapa del
  juego), `foot: "lowest"` (el pie es la fila opaca más baja) y `covers`.

- **Lo que trajo el Pino Quieto** (un pino de jardín de 8 × 6 celdas en The
  Unwritten Dao, hecho sólo con `overhang` en una capa): parámetros nuevos del
  paso, todos opcionales (sin ellos sale igual que antes). `tones: [arriba,
  abajo]`: cada copa en tres tonos por su alto (la franja de arriba en luz,
  hacia el oeste `bambú claro`; el medio en hoja con motas; la de abajo en
  sombra) en vez del canto con luz. `lumps` (px entre las gibas del lomo; por
  defecto unos 7): gibas más anchas, copas en domo. `belly: [período, hondura]`
  px: la panza festoneada en arcos. `outline`: tinta en todo el borde, el lomo
  incluido; con `tones`, la tinta del lomo al oeste se corta en puntas de luz.
  `cast: [dx, dy]` px: cada copa oscurece un tono lo que muestran en `[x+dx,
  y+dy]` las copas más bajas que ella (mayor `v`): el piso de arriba echa su
  sombra sobre el de abajo. Las copas se pintan en orden, así que se listan de
  abajo para arriba. Con `tones`, un px suelto de copa o corteza (sin vecino de
  su color, entre cinco o más de otro) toma el de alrededor: el lint queda
  limpio. Pisos alternados y ramas en diagonal salen de componer varios
  `overhang` sin copas (ramas) y uno con todas.

- **Lo que trajo el tronco del Pino Quieto** (11 × 8 celdas): `limbs` en
  `overhang` (con ellos `trunk` es opcional). Cada limb es un tubo: `path`
  [u, v] en celdas desde la punta gruesa y `width` (medio ancho en px:
  `[inicio, fin]` o uno por punto, así el tronco se ensancha en cada horqueta
  y se afina entre ellas). Se pinta como un cilindro con luz del noroeste en
  cuatro tonos (`barktones`, de claro a oscuro; por defecto madera clara,
  tierra, madera, madera sombra): una franja de luz baja por el oeste del
  tronco y por el lomo de cada rama, la sombra honda al este. Las vetas
  (`grain`, 0 a 1) son trazos cortos a lo largo del limb, desfasados de un
  trazo al siguiente, que se curvan con él: tono, no tinta. Un limb que viene
  después nace del anterior (no lo pisa) y le echa sombra debajo (la
  horqueta). `knots` [u, v]: un óvalo oscuro con hueco de tinta y anillo de
  luz. Una raíz (`root: true`) va encima de lo que tiene abajo, separada de
  las raíces anteriores por un hueco de tinta, y `contact: [color, filas]`
  pone la sombra de contacto bajo las raíces. Las puntas finas van en un solo
  tono y la tinta sólo recorta contra lo de afuera; el `cast` de las copas
  oscurece también la corteza que tapan.

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

- **Las capas vivas se recortan** (unwritten-dao #339): una capa que `export.ground.vivo` le pasa al juego para animar
  (las vetas `flow` de una cascada, los brillos del agua) se borra donde un paso posterior cambió el suelo (un edificio
  delante, la cara de un puente encima); los pasos que sólo re-tiñen (`light`, `shadows`, `settle`…) no tapan.

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
  `rocks`, `grove`, `roof`, `chimney`, `smoke`, `fence`, `building`, `beds`, `stall`, `rope`, `feature` (se corre su `at`: un disco de meditación, una losa, un anillo de piedras), `crag` (sus `masses`, `cleft` y `mouth.at`: la boca de una cueva se dibuja en el lugar con su peñasco), `wetstones` y `drifts` (sus `at`), `cast` (no tiene nada que correr: tira la sombra de lo que está parado hasta ahí, los sellos con `stands` del lugar y los de la madre puestos antes; con `skip: [""]` deja afuera la decoración del mapa del juego, que es de la madre; con un sol en la receta un sello con `stands` ya tira su sombra solo y el `cast` no agrega nada: sirve con la luz vieja, y ahí un sello que ya tiró sombra por el `cast` de un lugar se oscurece otra vez si la madre corre otro `cast` después). Otro paso para la receta con un error; se agrega diciendo qué se
  corre en él (`MOVES` de `mapplace.ts`).
- Un `scatter` del lugar sin lugares fijos (mechones, flores, rocío) se queda en su rectángulo: el `place` le
  pone `within: [reserve]` (sin eso, sus intentos corren sobre la madre entera y caen en otros lugares).
- `reserve`: una máscara de la madre con el rectángulo del lugar (`size` desde
  `at`), que existe desde el primer paso: un `grove` la evita con `avoid`, un
  `scatter` deja afuera sus lugares fijos con `outside`.
- `grove` con `crowns` {`spread`, `low`, `fall`, `under`}: cómo toman la luz
  las copas de los árboles (no los arbustos) y cuán grandes son contra el
  tronco. `spread` multiplica su ancho (lo que tapan se controla contra `keep`
  igual que siempre; un árbol de una zona que taparía algo queda con la copa
  de antes, para que los troncos no se muevan), `low` dónde empieza la copa de
  hoja ancha (fracción del alto, 0,3 por defecto), `fall` la oscurece de la
  mitad para abajo (luz de arriba) y `under` px de sombra contra su borde de
  abajo. Sin `crowns`, todo como antes.
- `grove` con `tall` en una zona (`[[odds, factor]…]`): árboles de distintos altos. Con su propio sorteo, esa
  parte de los árboles de la zona sale `factor` veces más alta (los arbustos no). Los pies no se mueven: uno
  que con la copa grande taparía lo que se guarda (`keep`, `behind`, la gente) o llegaría a una máscara de
  `avoid` que su copa de siempre no tocaba queda de su alto. `map_export` dice cuántos crecieron.
- `grove` con `ranks` en una zona (`{"group": [factores], "near": [celdas, factor]}`): el alto por dónde está
  cada árbol en vez de por sorteo (`tall` no corre). Cuando una mancha (`groups`) está entera, sus árboles de
  atrás para adelante (por la fila del pie) salen `group[0]`, `group[1]`… veces su alto (el último sigue para el
  resto; uno solo, el primero), y uno con el pie a menos de `near[0]` celdas de una máscara de `avoid` (un
  sendero, un lugar) a lo sumo `near[1]`: grandes al fondo de cada mancha, chicos junto a los caminos. Los pies
  no se mueven (todos se sortean antes) y uno que más grande taparía lo que se guarda o llegaría a `avoid` queda
  de su alto. `map_export` dice cuántos crecieron y cuántos achicó (`shorter (ranks)`).
- `grove` con ginkgos y sauces (10 de octubre): dos tipos más de árbol, `"ginkgo"` y `"willow"`, en `trees`
  (`[u, v, "ginkgo", alto, sal]`) o en las chances de una zona (`kinds: { ginkgo: 0.1, willow: 0.05 }`; por
  defecto 0, así que una zona de antes planta lo mismo). El ginkgo es dorado, más alto que ancho, con la copa en
  abanico que se abre hacia arriba sobre un tronco recto gris claro (`ginkgo`, `pale_bark`); el sauce cae en
  cuatro a seis cortinas hasta casi el suelo desde un domo bajo, con un tronco corto inclinado (`willow`). Los
  dos toman el sol como los demás (lado claro al oeste, `contrast`, sombra en el suelo con `fray`). Las copas de
  un `grove` no se mecen: el sauce tampoco.
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

**Dónde quedó cada árbol** (unwritten-dao #172). `map_export trees=<archivo.json>` escribe
`{recipe, origin, cell, trees: [{grove, at, cell, kind, size}]}`: cada árbol (no los arbustos) que plantaron los
`grove` de la receta, de atrás hacia adelante; `grove` su id (o `grove<i>`), `at` el pie del tronco en el PNG
(px, con el margen), `cell` el mismo pie en celdas del mapa del juego (con decimales: `floor` da la celda del
tronco), `kind` y `size` [ancho de la copa, alto] px. Es el mismo pie que planea la arboleda, no uno buscado en
los píxeles: una cadena que vuelve pared el tronco lo lee en vez de renderizar una sonda. La lista también va en
la respuesta (`data.trees`); el texto dice cuántos y adónde.

**Comparar** (`map_compare`): la receta contra el dibujo que reemplaza (o dos
PNG con `a=`/`b=`; varias capas con `refs={capa: png}`): referencia, receta y
diferencias en magenta, y cuántos píxeles cambian.

`map_from_game` contesta la grilla en texto (`.` pisable, `#` pared, `D`
adorno, `E` salida) para ubicar caminos y áreas. Un paso con `id` se
reemplaza al volver a mandarlo (`index` lo inserta en un lugar). El
código: `maprecipe.ts` (esquemas), `mappaint.ts` (el pintor, puro),
`mapnoise.ts` (ruido y formas, el mismo de los scripts), `mapfile.ts` (disco).

## Los campos de cada paso, por extenso

El catálogo del MCP publica la descripción de un campo sólo si entra en 80
caracteres (`FIELD_DESCRIPTION_MAX`, `src/headless/mcpcatalog.ts`); la del
schema dice qué es y en qué unidad, y `pgs_doc { command }` la muestra. El
porqué, los valores por defecto largos y los ejemplos de cada campo que no
entraba están acá, con el texto que tenía el schema (en inglés, como el
código). `npx tsx scripts/long-fields.ts` lista los campos de `map_*` que
pasan de 80: tiene que salir vacío.

### `map_material`

- `texture`: patches: light patches stretched along the light, with blades (grass, snow); mottled: three tones at 5 px with grains (earth); canopy: tree crowns in silhouette, darker with depth (a forest edge); grain: stone with veins along the light and moss on the lit lip; slabs: Voronoi stones with a lit lip and a joint; flagstones: laid stones one per cell of a staggered grid (the area says stones: [w, h] px), lit lip up-left, joint down-right, moss creeping into the joints of the border, worn where wear says; rubble: rounded stones of different sizes packed with dark joints, not in courses (the area says stones: [smallest, biggest] px, default [3, 6]), lit up-left, from an 8-tone ramp (joint 2, stones 4 to 6); paving: loose Voronoi stones around the middle of a court (the area says paving: {at, …}), moss and earth in the joints; planks: a wooden floor of boards in rows over the box of the area (the area says planks: {…}); flat: the base tone; water: bands by distance to the shore
- `levels`: mottled: below levels[0] the base tone, above levels[1] two up, between one up (default [0.40, 0.66])

### `map_area`

- `layer`: layer to paint (default "ground"); e.g. "front" for what passes in front of people
- `stones`: flagstones: [w, h] px of a stone (default [12, 7]); rubble: [smallest, biggest] px (default [3, 6])
- `fray`: flagstones: odds a stone of the border is left out (the grass stays), and the joints against the grass go moss green instead of shadow: an edge that frays into the meadow (default 0)
- `planks`: planks: boards laid in rows across the floor (texture "planks"): each board its tone, a lit lip on top, the joint below, the end in shadow, grain, knots and two nails
- `flank`: the top of a narrow wall: its side face, joints where a stone of the top ends, darker at the foot; stops at another wall of its material

### `map_path`

- `breath`: [samples of one breath, of the small one, share of the small one] (default [46, 22, 0.25])
- `on`: paints only over these materials (the shape still counts whole); the lit lip goes where it painted
- `salts`: absolute salts of its noise, to copy a drawing (default 21, 22 and 51 + seed; the grains use mottle + 3)
- `bank`: the cast shadow of the bank on the side of the light and a lit lip on the far grass (default true)
- `fade`: [px at its start, px at its end] over which the line narrows and breaks up into the grass (0: it goes on whole, it meets another path)
- `soft`: a trodden path instead of a drawn one: no bank nor lip (no ink), a ragged border with grass tips over it, and a verge of worn grass that fades into the meadow

### `map_light`

- `crowns`: [rx, ry, ahead, core], all times the crown width: a grove tree casts a round soft shadow at its foot instead of the flat scalloped one, ahead·width down-light, one tone darker and two inside its core (core·the radii); the stripe of the trunk stays (default none: the flat one)
- `low`: sprite prefixes of low things with a shadow (default: those with shadow in visuals)
- `buildings`: [u0, u1, foot v in cells, depth px, side px, salt]: a band under a building and a wedge off its right side
- `casts`: scalloped shadows at fixed places: [u, v in cells, rx px, ry px, salt, dx px?, dy px?]
- `blocks`: [u0, u1, foot v in cells, depth px, skew, salt, side px]: the shadow of a block (a house): a wedge `side` px tall off its right side (from u1) that grows down, and under the foot a band `depth` px deep that leans right by skew per px; its first two rows under the block are deeper
- `stripes`: [u, v in cells, length px, slope]: a 2 px stripe going right and down (the shadow of a pole)
- `rim`: ids of "outside" areas that darken a band of 4 to 8 px inside their own edge, whatever the light (shade under the trees)

### `map_scatter`

- `what`: litter: fallen needles near a tree (at) and pebbles on a path; leaves: dry leaves fallen near trees (at: [u, v, r px]), one or two px, the px below in shadow; dashes: dry leaves of bamboo, dashes of a few px lying flat or sloping, more on the first `on` material (a trail) than on the others
- `colors`: flowers: color groups; dew: [[first, second]]; leaves: [colors, the color of the second px of each]; dashes: [colors on the first material, on the others] (default [["bronce", "oro", "oro claro"], ["bronce", "oro"]])
- `relief`: boulders: the body of each as a height field of facets shaded from the light (as `rocks.relief`)
- `at`: fixed places [u, v, …]; flowers: a clump at each [u, v] in cells (instead of count tries); boulders [u, v, rx, ry] in cells; leaves: the trees [u, v in cells, r px, squash across?] (squash: the distance across is divided by it, default 1)
- `draw`: stamp: a drawing of the object from a file (a text drawing in the from_ascii format, path relative to the recipe) instead of rows and glyphs: the object has a name, is opened and retouched in the editor and is reused by other recipes. Every color of the drawing must be in the palette of the recipe, or the recipe fails listing the ones that are not
- `odds`: tufts: [near, far] chance to keep a try (default [0.9, 0.28]; null: every try is kept, no draw); dashes: [on the first material, on the others far from the edge, near it] (default [0.55, 0.10, 0.22]); flowers: cumulative chance of each color group; litter: [needles near the tree, pebble] (default [0.6, 0.75]); pebbles: [keep, big below, small below] (default [0.16, 0.3, 0.65]); leaves: [skip, a second px] (default [0.5, 0.5])
- `odds_each`: flowers: each color group tries its odds with a draw of its own, in order (the last takes the rest)
- `own`: pebbles: only on pixels still of the path material (not on what was paved over it)
- `stem`: flowers: the pixel under one is tone stem[0] where the grass is at most tone stem[1], else stem[1] (default [1, base - 1])
- `over`: dew: only over these colors (default the 3 lightest tones of its material; null: any color)
- `reach`: dew: px beyond the map sides it may fall (default 40); flowers: only this close to the map sides (default anywhere)
- `edge`: tufts, dashes: [id of a mask with a distance (a thicket floor, a path), px]: "near" is this many px or less from its border (instead of near other materials)
- `shapes`: tufts: their shapes, rows of "h" (tip, on the layer), "l" (stem, on the ground) and "." (default four built-in shapes)
- `lift`: tufts: the stem is at least this tone of the ramp, the tip at least that one (default [0, 0])
- `unknown`: tufts: tone taken when the color under it is not of its ramp (default: no tuft there)
- `straw`: tufts: [stem, tip] colors of a dry stalk where the color under it is not of its ramp (straw); default: no tuft there
- `dry`: tufts: [odds, color]: with a draw of its own, the tip is this color (a dry tip) instead of two tones up
- `dust`: pebbles: a grain falling on the lightest earth tone turns this color (default: that tone)
- `fade`: leaves: a leaf is skipped with odds distance/fade (fewer away from the tree) instead of odds[0], and lands up to r px from it
- `below_on`: leaves: the px below goes into shadow only when it is of an `on` material (default any)
- `inside`: dew: [id of a mask with a distance (a path), px]: only this far or more inside it
- `stands`: stamp: it stands up from its bottom row (a pillar): a cast step throws its shadow, like the decor
- `flip`: stamp: mirrored left to right inside its box (the widest row): the same drawing facing the other way, at the same place
- `outside`: ids of masks: a fixed place (`at`) whose cell px falls inside any of them is skipped (a place that reserves its rectangle)
- `within`: ids of masks: nothing of it lands outside them (a scatter of a place stays in its rectangle: `place` adds its `reserve` here to every scatter without fixed places)

### `map_cliff`

- `material`: what lies below the edge, far away: a ramp [deep, mist, cloud shadow, cloud, cloud light] (e.g. celeste oscuro … túnica luz)
- `face`: the rock face material: an 8-tone stone ramp (ink, line, dark, shadow, mid, speck, light, highlight)
- `side`: the side of the map that ends in the cliff (only "l": the face looks west, lit by the morning)
- `peaks`: far peaks rising from the clouds: [u, v of the top in cells, half width px, height px]
- `grass_colors`: the grass that hangs over the lip [first px, the rest] (default ["bambú", "hoja"])
- `pines`: the pines on top of the far peaks [lit, shadow] (default ["hoja", "hoja sombra"])

### `map_brink`

- `id`: names the mask of what lies past the foot of the face (a cloudbanks step with `within` paints the sky there again); default brink<index>
- `face`: the rock face: an 8-tone stone ramp (ink, line, dark, shadow, mid, speck, light, highlight) with its moss (the grass hanging over the lip)
- `sea`: what lies past the foot, far below (kind): a ramp [deep, haze, shadow, cloud, light]; its clouds hide the foot
- `ring`: the lip is a closed loop around the whole island: faces fall under every lip that looks south, narrower sides show west (lit) and east (in shade), the north lip is a crisp edge, all outside is the sky
- `side`: ring: px of the side faces [base, + fbm, + px more on the west, the side in the light, in long waves] (default [7, 5, 0])
- `view`: ring: the faces seen from above and a little from the south, in perspective, instead of `side`: [lean, sides]. Each lip hangs its face toward its foot lean × drop px out along its normal and down the rest of the drop, so the mountain widens going down: a south lip shows its whole drop, a west or east lip lean × drop px (its columns leaning out a little, in the shadow of the grass of the lip), a north lip only the lip and a px or two of rock. The faces of the sides go `sides` of the way down (lost in the cloud sooner than the south); billows only under the south faces (default none: the old upright sides; the sect: [0.35, 0.85])
- `lip`: [u, v] in cells, from west to east: the lip of the ground; under it the face falls south. Eased between the points (no corners), level past the ends
- `drop`: px of the face: [base, + fbm, + up to this much more under each slab: a jagged foot] (default [40, 10, 6])
- `taper`: px over which the face shrinks toward the end of the island: its corner turns round (default 16; 0 a straight side)
- `gap`: px: a slit of sky this narrow between two solid columns is closed, the face goes on under it (default 8)
- `drape`: grass hanging over the lip in curtains: [odds of a curtain, px of the longest] (default [0.75, 12])
- `bushes`: bushes leaning over the lip: [px between two, radius px] (default [22, 6]; 0 none)
- `bare`: ring: [u, v, radius] in cells: stretches of the lip with no bushes leaning over it, where the grass runs bare to the edge (a bay in the woods of the rim, a lookout; default none)
- `grass`: [lit blade, top, deep, edge] colors of the curtains (default from the moss of the face, light to dark)
- `haze`: [px across, px down, salt] of the haze past the foot, as the cloudbanks step paints it (default [60, 7, 1211])
- `mist`: banks of cloud hiding the foot: [px of a bank, thickness px, px above the foot] (default [40, 5, 4])
- `falls`: [u in cells, half width px]: a waterfall pouring over the lip from a notch and falling into the clouds at the foot (needs water). ring: [u, half width px, v, length px] pours from the edge at (u, v) — if that is inside the island, from the nearer side edge on its row — straight down length px over the side and the sky
- `pour`: ring: [spread, fade px]: a fall that pours instead of a strip of water — out of a cleft with a broken edge, narrow at the head and spread × wider lower down, long light and dark threads running down it, and its last fade px dissolving into the cloud tones (spray that becomes the clouds at the foot)
- `spring`: px down the face where the falls come out of a dark cleft, instead of running over the lip from a stream (default 0: over the lip)
- `skip`: materials it never paints over (a stairway that goes down the face, painted before)
- `swallow`: false leaves what `skip` keeps whole at the foot: by default a bank of cloud swallows a stairway where it reaches the foot (it goes down into the sea); a stairway that comes out at the bottom of a cliff and goes on over the ground below (the foot of the cliff seen from below, The Unwritten Dao's ladera) keeps every tread (default true)
- `sky`: materials that are already sky: a column whose lip falls on one has no face, the sky goes on below the lip (default [sea])
- `clear`: layers erased wherever it paints (the drifting clouds and far peaks of a cliff on the side)
- `swell`: ring: [px, px across, salt]: the drop of the face rises and falls this much along the island in long waves (tall in places, low in others; default none)
- `strips`: ring: the columns of the face are upright strips of different widths (slabs[0] ± jitter), each broken in blocks of its own heights (about slabs[1]): basalt, not stretched cells (default false)
- `jitter`: how far the columns wander from their grid, 0..1 (default 0.7): more gives columns of very different widths
- `shade`: ring: light of the east side, in shade (default -0.3; the west side is 0.45): higher and it reads as rock in the shade instead of a black band
- `lit`: ring: light of the west side, in the sun (default 0.45): lower and a wide side reads as rock with its columns instead of flat pale panels
- `ledges`: ring: odds that the top of a block of a column (where one block sits on the one below) wears a cap of grass (default 0)
- `tufts`: ring: [odds, radius px, px it hangs over the block below (default 2)]: a clump of green sits on the top of some blocks of the columns (a ledge), half over the face below (default none)
- `fringe`: ring: grass hanging over the lip of the sides too, in tongues out from the edge: [odds, px of the longest] (default none)
- `billows`: the foot is swallowed by masses of cumulus (the painter of cloudscape) instead of flat banks: [px between two, radius px, px they rise over the foot]; the falls end in a big one
- `soft`: billows: soft masses, as in cloudscape soft (the rim only over the sky past the foot; default rim the light tone of the sea, tone 2)
- `veil`: ring + view: the foot of every face (south and sides) is lost behind mist instead of ending on a dark edge: [px of mist up from the foot, + up to this much more in long waves (higher in stretches)]. The rock goes on under it flatter and paler, its columns guessed in the deep belly tone, a fine checker and the belly tone melting into the cloud tones; billows rise under the sides too (default none)
- `notch`: ring + view: every fall gets a face seen from the front behind it: [px of rock on each side of the water, px of the bite]. On a south lip the lip bites into the island; a fall off a side pours from a shelf of grass jutting out of the edge (its top in cushions, running into the lip beside with no slit of sky), whose south lip hangs a whole face of rock as long as the water, in narrow columns under a short fringe of grass; the water leaves it by a groove in that rock (default none)
- `spume`: ring + billows: the foot of the falls comes apart in the clouds instead of a strip of water going through them: [px of foam over the cloud, px of the thin veil of water under it]. Where a fall meets a billow the water widens, lightens and breaks into a fine checker of the cloud tones, puffs of spray sit on the cloud over it, and under the cloud only a veil of light water dots fades out (no clean water below). The billows themselves get a round, lumpy belly (no straight bottom) and a soft rim of the belly tones over the rock and the water too, melting into the veil of the face (default none: the old falls and billows)
- `shelves`: ring + view, with veil: ledges of grass lower down the face, peeking out of the mist: [odds per column, px wide] (default none)
- `flank`: ring + view: px of face that a lip looking west or east shows, whatever the drop (default lean × drop, at most 0.48 × drop). For the sides of a tall map seen from the south (the caves of The Unwritten Dao: walls of granite of 3–4 cells, 48–64 px). On a flank the columns are upright on the screen (`slabs[0]` px wide, `jitter`) and the blocks are courses down it, not the strips of the lip leaning out; each column is round: lit on the side of the sun and turning into shade across it
- `strata`: ring + view: [px apart, jitter px]: the blocks of every column of a flank break at shared levels (each column off by up to jitter px, about half its joints shut, so one block spans one to three courses): granite in strata, with the dark line at the foot of every block. With `ledges` and `grass` in the snow tones (`["túnica luz", "nieve", "nieve sombra", "nieve honda"]`) every ledge can wear its cap of snow
- `buttress`: ring + view + flank: the flank in buttresses of granite instead of blocks (`{"buttress": {}}` takes the defaults). `width`: [narrowest, widest] px of a column (default [6, 12]): columns of very unequal width, one after the other across the screen, whose gutters wander a px or two down the wall (each column swells and narrows); `gutter`: px of the dark channel on the shaded side of each (default 1); `round`: 0..1, how far a column turns from lit to shade across it (default 0.8: a face toward the sun that turns fast into the gutter, a px of light along its lit edge here and there); `joints`: the odds a level of `strata` breaks a column (default 0.3; `strata` defaults to [24, 8]), and the break is a fracture that wanders up and down across the column, not a ruled joint. The granite carries long flutes down each column. Measured on a copy of the caves of the game (`slabs` [15, 24], `strata` [24, 12]): straight horizontal edges (4 px of one tone over 4 of another) fall from 11 to 1 per column of the flank, and of the runs of rock between two gutters 95 % are lighter on the side of the sun, by 1.5 tones on average (with blocks, 56 % and 0.15). `ledges` and `grass` still put snow on the breaks; with fewer breaks, give `ledges` more odds
- `buttress.follow`: the columns of the flank counted out from the lip of their row (the lip as the picture shows it, eased over two cells), not from the left of the picture: a lip that wanders in spurs and bays bends its gutters with it, so a long side has no gutter ruled straight down the whole map (default false: px by px as before). Measured a cell down where the lip moved 5 px or more, a gutter is found again at the same distance from the lip two times in three (one in three at the same px); without it, the other way round
- `skirt`: ring + view: [px between two, radius px, px into the rock]: masses of cumulus (the painter of `billows`, with `soft`) down the foot of each side face (a west or east flank), row after row, so the side ends in cloud instead of on the sky beside it, which reads as a floor at the height of the top. Its clouds stay out of the mask of the step, so a `cloudscape` with `within` the brink paints its sky and peaks behind them (an `area` that repaints the sea material flat would paint over them)
- the light: with a sun from the east (`light.dir` x < 0) the lit side of a ring is the east one (its sides, its faces in view and the rim against the sky); from the west or with no sun, the west, as always

### `map_flight`

- `style`: down: treads stacked from the top of the picture down to `to`, between two low walls; climb: treads side by side along x, rising to the right by `slope`, between two walls, into a forest; edge: the stair of the brink, by the face of the island (see edge)
- `stepped`: climb: each tread level and the next one higher, the edges climbing in steps (default false: a smooth ramp of treads)
- `clearing`: climb: [half px, breathing px] of the opening cut in the forest around it (default [10, 1.5])
- `through`: climb: the forest material it is cut into (default the canopy material); the cut becomes grass
- `fade`: climb: [px, every px]: after this many px each `every` px is one step darker (in the forest shade) (default [24, 12])
- `worn`: climb: stone steps with weight (always stepped): each tread level with a lit nose on its west end and a dark joint under the next one, a low wall on the north side (outline, lit cap, face), the flank of the flight in shadow under the treads (its top climbing in steps, its foot along the slope: each step rests on the one before), its shadow on the ground below, sunk treads and moss in the joints and corners. `wall` px of the north wall (default 3), `riser` px more of flank (default 2), `blocks` given: more treads cut across in two stones. With `rock`, no flank and no north wall: the flight is cut into a crest of rock, steps seen from the front (see rock)
- `edge`: edge: where it goes and what it is cut into; `from` is the cell of the brow it is born on, `half` half the width of a tread (default 9), `every` px of a step (default 6), `worn` its wear

### `map_feature`

- `what`: dais: a round stone platform with a south face, a lit lip, a carved ring, the eight trigrams and a carved center, and its cast shadow; slab: an old rectangular stone with cut corners, a crack and moss on the lit corner; roots: roots that leave the foot of a trunk and sink into the earth; ring: a forgotten formation, flat stones in a ring eaten by moss, each with its small shadow, and a worn groove joining them; frost: a broken band of frost around something (a tomb), lighter inside; ash: the ash of a fire, two tones
- `material`: dais, slab: an 8-tone stone ramp (moss from its moss); roots: the earth material they turn grass into
- `corner`: slab: the corner is cut where both |dx| > corner[0] and |dy| > corner[1] px (default [6, 4.5])
- `octagon`: dais: the platform in eight straight sides (corners on the ellipse of `size`, a side facing each direction), its lip and carved ring too
- `trigrams`: dais as a bagua: its eight trigrams from the north clockwise, each three lines from top to bottom ("1" solid, "0" broken; ☱ is "011"); carved one tone under the stone with a lit lip, the bottom line towards the center. Without it, the Fu Xi order of before
- `trigramAt`: dais: where the middle bar of each trigram sits, as a fraction of the radius (default 0.6)
- `shadow`: dais: material it casts its shadow on → the material that pixel becomes (it stays shaded for what comes after)
- `on`: ring: materials its stones shade and the groove marks (the groove only the first); frost, ash: materials it falls on
- `groove`: ring: [samples around, above (noise), color] of the groove (default [260, 0.45, "hoja sombra"])
- `box`: ring, frost, ash: half size px of the box it is drawn in (default ring [5, 4], frost [12, 6], ash [7, 4])
- `band`: frost: [inner px, outer px, + outer wobble px] (default [3.5, 6.5, 1.5]); ash: [_, radius px, _] (default [0, 3.6, 0])
- `colors`: frost: [inner, outer] (default ["niebla", "niebla sombra"]); ash: [two tones] (default ["piedra sombra", "túnica oscura"])
- `seed`: salt (default: dais 471, slab 481, roots 500, ring 251 (moss + 1 + k, groove + 2), frost 262 (its noise + 1), ash 271)

### `map_network`

- `material`: the earth: a 5-tone ramp [line, shadow, base, light, dust] (base index from the material)
- `parts`: in order, into one mask: roads, blobs and ovals added, blobs cut; then the border is cleaned once
- `inside`: [id of a mask with a distance (a thicket floor), px]: before the clean, the earth keeps only what lies inside it, at least px from its border
- `also`: blobs added after the clean, each cleaned on its own (a court paved later over the earth: the earth counts it, its tufts stay out)
- `breath`: [samples of one breath, of the small one, px of the small one]: half width = width[0] + width[1]·n1(i/b0) + b2·n1(i/b1) (default [30, 9, 0.6])
- `trod`: [px, wobble px, noise px, salt]: closer than px (± wobble) to a road center the earth is trodden (default [5.8, 2.2, 7, 226])
- `trod_levels`: trodden: below [0] the base tone, above [1] two up, between one up (default [0.42, 0.70])
- `loose_levels`: not trodden (dry dust): above [1] two up, above [0] one up, else the base (default [0.30, 0.46])
- `ruts`: [from px, to px, salt, noise px across, px down, above]: broken ruts this far from a road center, one tone down (default [3.0, 4.2, 225, 6, 2, 0.42])
- `ruts_on`: light: the ruts only dull the lightest tone (two up → one up) and leave the rest (leaves on a trail)
- `grains`: [salt, odds trodden, odds loose, odds light?]: a dark grain (trodden) or a base one (loose), else a light one (odds light, default the trodden odds) (default [223, 0.035, 0.016])
- `grains_all`: the grains fall on the border and the bank too, with the loose odds (default only inside)
- `bank`: tones from the base of the bank on the side of the light, 1 and 2 px in (default [-1, -1])
- `loose_tones`: tones from the base of the dry dust above loose_levels[1] and above loose_levels[0] (default [2, 1])
- `wheel_ruts`: two continuous ruts (cart wheels) along the trodden roads, one each side of the center: a dark line, its lip below and its light above
- `lip`: the grass that faces the light across the earth gets a lit lip (default true: its tone second from the top; a color name: that color)
- `tufts`: tries of grass tufts creeping into the earth 2-3 px from its border: {count, salt, colors: [tip, stem]} (default none)

### `map_wall`

- `material`: the kind its pixels get (what other steps see; default "wall"; it needs no material in the recipe)
- `rect`: [x, y, w, h] px from the top-left corner of the map (the margin is negative): a straight wall
- `from`: the side the profile starts at: t for a wall seen face on (its bands from the top) or a beam seen from above; l/r for a side beam (from its outer side) (default "t")
- `profile`: colors across the wall, from the `from` side: a color is 1 px, an object a band of h px
- `windows`: [x, y, w, h] px from the map corner: lattice windows with paper lit from behind and a sill (the sun step casts their light)
- `doors`: cells (u) of the map where a horizontal wall leaves a door one cell wide (e.g. the exit)
- `shadow`: the shadow the wall casts on the floor along it: each px one tone darker (recipe shade)
- `layer`: the layer the wall goes on (a beam or a lintel seen from above, over people: `"techos"`); the floor under it keeps its own kind (it still takes shadows and light) and the wall's `shadow` stays on the floor. Without it, the ground, as always

### `map_glow`

A pool of light on the floor around a lamp (a candle, a furnace, a brazier): `"glow": {"at": [5, 4], "r": [10, 40], "tones": 2, "on": ["tablas"]}`.

- `at`: the cell of the light (its middle; fractions allowed)
- `r`: [core, edge] px: inside the core, `tones` steps of the recipe `lighten`; from there to the edge, one step fewer per ring (with `tones` 2: two up to the middle of the way, one to the edge)
- `tones`: steps of lighten at the core (default 2). The warmth is the lighten table's (one step lighter and warmer)
- `on`: materials it lights (default any)
- `fray`: how much the border of each ring is bitten inward by smooth noise, in bites up to 6 px (default 0.5): never a ruled circle, and never a px past `r[1]`
- `layer`: the lit colors go to this layer and the ground stays as it was (a light the game switches on with `when`: the candles at night). The layer is painted when the map is done, over the finished ground (every shadow laid), so what it shows is the floor under it, lit
- `salt`: of its noise (default 911)

Without `layer` it lightens the ground where it runs: put it before what stands, and the shadows (laid at the end) darken it where they fall.

### `map_settle`

What stands sits in the ground instead of on it. The steps that lay a thing with a foot register it as they paint (a stamp with `stands`, a rock of `rocks`, `boulders` or `wetstones`, the trunk of each tree of a `grove`, the body of each post of a `fence`, the pilings of a `pier`, the walls of a `building`); registering paints nothing, so a recipe without `settle` paints the same px. Put it **last**, after the light and the scatters.

```json
{"step": "settle", "id": "asentar"}
{"step": "settle", "id": "asentar", "targets": ["rocks", "piedra del estanque"], "wet": {"layers": ["agua"]}, "tufts": {"density": 1.5}}
{"step": "settle", "id": "asentar", "tufts": false, "moss": true}
```

- `targets`: step ids, step names or kinds (`stamp`, `stone`, `trunk`, `post`, `piling`, `building`) of the things it settles. Default: every thing laid before it but buildings (a wall stands on a plinth or a floor of its own: name `building` to settle one). Each thing is settled once, by the first settle that takes it
- `sink`: px its foot goes under the ground: below a line across the foot that meanders a px up and down in runs a few px long (never teeth), the ground just under the foot is mirrored back up, its kind and its shadow too (and the water of `wet.layers`). Default by height: 1 under 12 px, 3 for a big thing (24 px high and 20 wide), else 2; never more than a third of it (a log 3 px high sinks 1). A straight built base (80 % of its columns end on its lowest row: a crate, a barrel) sinks level, not bitten; legs (its lowest rows split in runs: a brazier, a bench) sink a third of their height, level. Only on ground: a column whose foot stands on another thing (a trunk in front of it, a post, the top of a gravestone, any stamp or fence) does not sink, and only ground (a material that is no thing with a foot, no stamp, no fence) is mirrored up; where there is none near, the px stays. 0: none
- `ink`: the ink of the thing (its darkest colors that live mostly on its outline; a rock's line) turns, column by column, the deepest tone of the material just above it (inward when that is ink too: the curve of its side), never of another material of the thing (the lacquer of a lantern never paints the foot of its post); where it faces the ground always, on the sides of its lower quarter less toward the sides; on legs only the legs' feet, their sides stay ink; the ink above stays (default true)
- `ring`: `{tones, below, side, fray}` — the ground at its foot `tones` down the recipe's shade (default 1), `below` px under the foot (2; 3 for a thing 18 px high or more), `side` px at its sides (1), the outer edge bitten away in bites (`fray`, 0.4). It is there whatever the sun does (it is the contact, not a shadow); never on water nor on another thing. `false`: none
- `tufts`: `{density, pebbles}` — blades of the grass around (a `patches` material) that stand on the ground at the foot (only on ground, never on another thing; only under its foot: not under a tassel, a handle or the belly between its legs) and go up over its edge (beside a straight built base, not over it), toward its ends, lighter than both where they cross it; `density` blades per 5 px of foot where all around is grass (scaled by the share of grass around it). On earth, sand or stone a few pebbles at the foot instead (`pebbles`, default true). `false`: none
- `wet`: `{near, rows, tones, foam, reflect, materials, layers}` — with water at most `near` px from its foot (default 2): its lower `rows` (3; 2 under 10 px high; give or take one, an irregular top) over its foot, `tones` down its own material (2: by the recipe's `shade` or its ramp, never into its ink), only the material that touches the water (a tassel or a lantern over a wet post stays dry), a broken line of foam under its foot (`foam`), and its lowest `reflect` rows (4) mirrored into the water in the water's tones (darker for its dark px), dithered and broken more the deeper. `materials`: the water (default those with texture `water`); `layers`: the layers that hold water over the ground (a pond the game fills): the band, the foam and the reflection go on that layer, so they show only when the water does. `false`: none
- `moss`: `true` or `{odds, colors, shade}` — off by default. When the grass on the side of its foot toward the light is in the sun's shadow (`shade` of it, 0.5), soft patches of moss (`odds` of it, 0.14) on the side away from the sun, never on its foot row nor on its ink; `colors` default two tones under the base of the grass and its base. In the pilot of 10 October it read as grass climbing the rock and greened crates and flowers: ask for it on rocks only
- `salt`: of its noise (default 2971)

`map_lint` of a recipe says how many stamps that stand have their feet all of ink (the lowest row of the stamp, all ink): over 10 % it warns; after `settle`, 0. A flat stamp (4 px high or less: a log is all outline) is not measured, a base whose color does not close the top of the stamp too is its own shade, not ink, and a foot hidden behind a thing in front (its lowest row under a third of its width) is no base.

### `map_furnish`

- a rug goes under a stamp laid before it on the floor (`registerStamped`): the px of the stamp that nothing painted over since stay on top
- `what`: rug: a reed mat under each piece of decor with one of the `under` prefixes (rounded corners, a cloth border lit up-left, a herringbone weave); shadows: short cold shadows at the foot of the decor: with the recipe's light, thrown by it (a sun or a lamp); without it down-right, each px one tone darker (they stack where two meet)
- `offset`: rug: its center from the cell of the piece, cells (default [1.0, 0.55]: under a two-cell table)
- `border`: rug: [[inner band lit, shade], [outer px lit, shade]] (default [["piel", "piel sombra"], ["bermellón", "madera sombra"]])
- `weave`: rug: [[even bands of 3 rows: off, on], [odd bands: off, on]] by (x/2 + y/3) parity (default [["arena", "oro claro"], ["oro", "arena"]])
- `skip`: shadows: sprite prefixes with none (hung on the wall, standing lamps) (default [])
- `shape`: shadows: [rows, px in from the left, px past the right, lean px per row] (default [4, 3, 2, 1.2]). Only without a sun: with the recipe's `light` (a `dir` or a `source`) each piece throws a pool from its foot as high as it is (`size`), by that light, into the one mask; `shape` is then the old light and the lint says so (`sunIgnored`)

### `map_thicket`

- `open`: [u, v, w, h] in cells walkable even if they are walls or margin (a clearing on a wall cell, the trail out of the map)
- `edge`: [amount, px, salt, octaves] of each noise added to the smoothed grid where the floor ends (default [[0.30, 11, 201, 3], [0.12, 4, 202, 2]])
- `clearings`: [u, v in cells, r px, squash, wobble px, salt, lobes?]: round clearings added to the floor (r + wobble·n1(angle·lobes), lobes default 2)
- `damp`: [px, tone]: this close to the thicket the floor is never lighter than this tone of its ramp (damp moss) (default [3, 2]; null none)

### `map_outcrop`

- `masses`: [u, v in cells, rx px, ry px, salt?]: the ellipses of the rock (salt default trunc(u·10))
- `wobble`: [amount, lobes, phase, fine amount, fine lobes, fine salt] of its border (default [0.1, 1.6, 3, 0.05, 7, 5])
- `floor`: [id of a thicket floor, v in cells]: below this row the rock leaves the floor free
- `top`: [salt, px along the light, px across, above: mid, above: shadow (else dark)] of the streaks of its top (default [242, 9, 3, 0.6, 0.32])
- `boulders`: [u, v in cells, rx px, ry px]: big stones with moss piled on top, back to front, each with a dark seat on the rock

### `map_undergrowth`

- `mottle`: [px, salt, edge px, above near the edge, above anywhere]: leaves near the border, dark depths elsewhere (default [6, 281, 2, 0.5, 0.72])
- `dashes`: [tries, salt, odds of the first color]: fallen leaves, two px and a third below (default [1600, 282, 0.6])

### `map_canes`

- `thicket`: id of the thicket step: canes are born in its wall cells (and the margin) and rise
- `leaves`: the two layers of leaves, which sway out of step (default ["leaves", "leaves_b"])
- `clear`: [u, v] cells where someone stands (people, an exit): no cane covers them; the decor of the game is kept clear too
- `foot`: [left of the foot, right] the shadow at the foot of a cane (default ["túnica noche", "tinta"])
- `tall`: [odds, px, salt]: on some walkable cells behind a root the canes pass in front this many px (default [0.45, 9, 291])
- `salts`: salts of where roots fall (301, 302), of thinning the deep ones (363), of each cane (311), of its leaves (321) and of the low edge behind (292)

### `map_shade`

- `height`: with a sun: px the thicket stands over its border (default 32): its shadow reaches the sun's length times that
- `casts`: [u, v in cells, rx px, ry px, salt]: soft oval shadows (of the landmarks), one tone each, stacking

### `map_beams`

- `mottle`: [px across, px down, salt (+ index), below]: the leaves above cut it in spots (default [5, 4, 352, 0.36])
- `core`: [share of the half width, half length px] where it is two tones lighter (default [0.45, 22])

### `map_snowfield`

- `material`: the snow: a ramp [night, deep, shadow, snow, lit] (e.g. nieve noche … túnica luz)
- `hollows`: [below, above]: where the height noise is below, a hollow in violet shade (its upper border deeper, its lower lip lit); above, a lit crest (default [0.40, 0.70])
- `cover`: snow only above a wavy line (and old patches below it); the rest is grass, with the snow lip: lit on its upper edge, shaded on its lower one and its shadow on the grass

### `map_ledge`

- `width`: [px, fbm amount, fbm px, salt, n1 amount, n1 px, salt] of the face (default [7, 4, 6, 343, 2.5, 17, 344])
- `snow`: where the lip is snowy: all, or [id of a snowfield line, px below it] (default all)

### `map_cloudsea`

- `peaks`: [u, v in cells (top), half width px, height px]: columns of rock that float, snow and a small pine on top, clouds at their feet

### `map_crag`

- `cleft`: [u, v in cells, rows px, spread]: a dark wedge cut into it from v up (default rows 8, spread 0.45)
- `ink`: the color of its outline and of the seams of its darkest facets (default túnica noche); a stone tone (piedra sombra, nieve noche) gives a crag without ink, like the stamped rocks of a place
- `top_colors`: its top: a map color → color (as `face_colors` for its faces), or `"ramp"`: the rock of its top shaded from the ramp of its material by the light of the recipe (see **La cima de un peñasco** above; the flat top takes the material's `base`)
- `relief`: `{facets?, cracks?, height?, seed?}` — its lajas turned to the light of the recipe: 30 / `facets` + 2 px wide (default 5: 8 px), each turned by its salt as much as `height`, lit on the side of the sun, a core under the lip on the side away, a 1 px rim of light inside the lit edge, `cracks` (default 1) as ink lines down some lajas; snow, seams, veins and `face_colors` stay
- `jag`: how much its height wanders along x, the teeth of its top line: 0.3 as always, 0.1–0.15 a rounded ridge (a risco a house is dug into: `contornos curvos`)
- `dome`: each mass rises as a dome (a round top, the height of `sqrt(1 − r²)`) instead of a cone (a peak); several masses side by side make a broad rock with a lumpy top and a lumpy foot, the risco a house is dug into
- `settle`: px: a run of face this short in a column between two runs of top becomes top, and a run of top between two faces becomes face, so a slope neither steep nor flat shows one surface instead of stripes of both (a ladder of dark dashes at 4x); the silhouette does not change (default 0: as always)
- `columns`: how tall a laja of its face is for its width (default 2 with `relief`, 13/6 without: as always); 4–5 split the face in tall columns of rock with vertical cracks, the stone of a mountain of pillars, instead of a net of facets

### `map_trail`

- `style`: earth: packed earth with a dark bank and stones; trodden: a channel trodden in the snow with footprints; slabs: wind-swept rock in slabs with snow in the joints, casting a shadow
- `cover`: [px, px, salt, octaves, above]: where this noise is above, snow covers it (slabs)
- `slush`: earth: [snowfield line id, px below the line, salt, above]: slush where it enters the snow

- `steps` (trodden): `{at, colors?, over?, kind?}` — steps cut across the channel at rows `at` (v, cells): a lit nose, the riser, a dark foot, ends bitten; `over` other kinds inside the channel they cut too (slabs laid before the trail), `kind` the kind of their px

### `map_water`

- `cut`: `{material, px: [side, south], snow?, on?, ragged?, salt?}` — the bed cut into the ground: walls of wet rock down to the water, `south` px where the bank above looks south (its whole face), `side` px along the sides, a dark edge where the bank lies below; lit toward the light, darker toward the water, cracks down the face, a lip of `snow` [lit, shaded] on top, a wet dark line at the foot. Its px take the rock's kind
- `rim`: `{px: [least, most], colors: [light, mid, dark], salt?}` — plates of shore ice over the edges of the water, of uneven width, a lit edge toward the open water, a few cracks and their px of shadow on the water below

### `map_pond`

- `at`: [u, v in cells, rx px, ry px, salt]: smooth ice with the sky in diagonal streaks, a step of snow above and a lit lip below, and two or three cracks

### `map_umbra`

- `ramp`: each px goes a step (two with `deep`) down the ramp of its own material (its kind) instead of the recipe's shade table; a color not in that ramp goes by the table. A roof of basalt tiles under the brow of a rock darkens without darkening the basalt of the rails, the stamps and every other thing of the map (ovals and `along`; bands under a sun still go with the sun)
- `along`: [{`of`, `px`, `period`?, `salt`, `box`?, `stands`?}]: the grass at the foot of what is built. The `on` materials within a width of the `of` ones (a wall, a stone floor, a fence) that wanders from `px[0]` to `px[1]` along the edge (fbm of `period` px, default 9; a min of 0 breaks it into stretches), on every side: it is the contact, not a shadow. A step (two with `deep`) darker, whole to the edge; with a sun, a shadow of the sun laid over it later takes it from its color before, by the larger tone (never twice), and a material the sun does not shade (the leaves of a bed) darkens all the same. `box` [u0, v0, u1, v1] keeps it inside; a place moves it; `stands` (px): the lowest px of what stands (a stamp with `stands`: a lantern, a banner pole, a statue), up to that height above its bottom row, are an edge too, so the band pools at its foot and never climbs its sides (a halo); its own px are never darkened (`of` may be empty)

### `map_shadows`

- `decor`: the decor of the game casts (pines a crown and a trunk stripe, big things an oval) (default true)

### `map_straw`

- `patch`: straw where fbm(x/a, y/b, salt, 3) + fine·fbm(x/c, y/d, salt2, 2) > above: [a, b, salt, c, d, salt2, fine, above] (default [34, 17, 851, 6, 3, 852, 0.12, 0.55])
- `lit`: [above, color] from the top: the strand color by its noise (default [[0.40, "oro claro"], [0.33, "oro"]])
- `shaded`: on darker grass the straw shows as strands and specks; the rest of the grass stays (default on hoja, hoja sombra, bambú: [0.5, "oro"], [854, 3, 0.15, "bronce"])

### `map_overlook`

- `bands`: [depth px, color] from the lip out: the lit lip, the dark under it (default [[1, "pasto"], [2.5, "madera sombra"]])
- `face`: [px, wobble px, period px, salt, color]: the narrow dark face after the bands, until px + wobble·n1(y/period, salt) deep (default [4.0, 1.2, 5, 903, "túnica noche"])

### `map_woodedge`

- `waves`: waves of the right edge along y (default [[2.4, 19, 911], [1.2, 7, 912]]); the top and bottom edges are straight
- `depths`: px past the edge where the second and third ramps start (default [10, 28]); the first ones are at most 7.5 px
- `ramps`: [glint, light, mid, shadow, line] by depth (default from the ramp: lit, one down, deep)
- `cut`: id of a mask (a road net): no crown where its probes (±r across, 0.6r up, 0.8r down) touch it
- `earth`: [material, px, px]: that material past the right edge + px goes one step darker, past + px + px two (default none)

### `map_damp`

- `on`: [id of a mask with a distance (the earth), px]: only on its material, this far inside

### `map_cast`

- `lean`: [across, down] per px of height: a px h high falls at x + across·h, y + h + down·h (default [0.55, 0.22])
- `foot`: the foot of a piece: the bottom row of its sprite, or its lowest opaque row (default bottom)
- `covers`: every px of a piece keeps its own place out of the shadow, even the ones of its foot (default false: only those above it)

### `map_lines`

- `lines`: name → a wavy line across the map: y(x) = the row + each wave of x. Shapes ({between}) and the river steps read them by name

### `map_wildwood`

- `clear`: no wood strictly between these (a river): from line + px to line + px (no from: from the top)

### `map_beach`

- `bands`: [px to the water below (null: the rest), above, color, else]: the first band whose px is not reached gives color where the noise is above `above` (default wet sand at the water, then dry)
- `lip`: [px, salt, odds, color, else]: the first px under the top line are the lip of the grass (default [1.2, 1122, 0.6, "hoja sombra", "vida sombra"])
- `specks`: [salt, odds, px from the water, color]: lone stones on the dry sand (default [1123, 0.02, 4, "piedra"])

### `map_footpath`

- `parts`: trodden ribbons (half width ≥ 2.4 px, it breathes slow and fast) and blobs, one mask

### `map_pier`

- `shadow`: without a sun, its shadow on the water to the right: x from right + from to right + to, while x - right < width (+1 each third row), rows from top + rows[0] to bottom + rows[1]
- `height`: with a sun (`light` as an object), px the deck stands over the water (default 8): each plank throws where the sun puts that height and each post from the water up to it, into the one mask, only on the water (the deck and the posts never take it); `shadow` and `under` are the old light and say so (`sunIgnored`)
- `pilings`: [[l|r, px], [t|b|m, px] or v]: posts by the deck sides, with a ripple at their foot
- `ripple`: [ends, middle] of the ripple at the foot of a post (default ["celeste luz", "celeste"])

### `map_reeds`

- `clumps`: [u, v, stalks, spread px, salt]: v is the row of their foot (or px added to `line`)
- `mark`: [materials, material]: the stalks on the ground make those that material (nothing grows on them later)

### `map_rocks`

- `shadow`: [dx, dy, rx, ry] times its radii: the oval of its shadow (default [0.5, 0.6, 1.1, 0.8])
- `relief`: `{facets?, cracks?, height?, seed?}` — the body as a height field of facets shaded from the light of the recipe (see **Relieve** above). `facets` the planes, the top one included (default 5; a small rock takes fewer); `cracks` fine valleys in the deepest tone (default 1 from 6 px of radius; none under 4 px); `height` how much it stands out (default 1); `seed` the salt of its facets (default the rock's). The silhouette, the outline and the shadow do not change

### `map_ditch`

- `river`: [top line, bottom line] of the river it starts from (null: the picture side); no ditch there

### `map_floodwater`

- `channel`: a ditch that still reads as a ditch when full: its wall stays, its water is deep (mid and deep tones, the lit tone only on the far bank), no foam

### `map_cloudbanks`

- `material`: the sky below (kind of every pixel); its ramp is [deep, haze, shadow, cloud, light]
- `haze`: [px across, px down, salt, below]: the haze is the deep tone where fbm is below `below`, else the haze tone (default [60, 7, 1211, 0.3])
- `rows`: long flat banks of cloud seen from above, one row after the other: a domed top in lumps (lit), a flat cold belly
- `peaks`: floating peaks [u, v in cells (the top), half width px, height px, pines]: a column of rock widening down with ledges, lit left, flat pines on top
- `peak_salts`: [left side, right side, cracks, lit edge, pines] (+ the index of the peak but the pines; default [1220, 1225, 1230, 1231, 1241])
- `pines`: [trunk, lit left, crown, under, light top-left] (default madera sombra, bambú, hoja, hoja sombra, bambú claro)
- `feet`: [salt, salt step, thickness px, spread (× half width), px above the foot]: a bank hiding the foot of each peak (default [1290, 5, 5, 2.2, 3])
- `drift`: the long banks go to their own layer (the game moves it: "corre") instead of the ground; with within, only the banks that moved px each way still fall on the sky stay there
- `within`: only inside this mask (the id of a brink: what lies past its foot): the same sky as a first cloudbanks step with the same numbers, painted again where the island fell away

### `map_ashlar`

- `ragged`: px: the stones of the top course stand each at its own height (up to this much lower) with their top corners worn round: a rubble wall, not a ruled top (default 0)
- `round`: round ends (a loose end, a pillar): its top corners cut 2 and 1 px, its west end column lit and its east one in shadow, a corner stone in relief and not the vertex of a box

### `map_courses`

- `material`: the stone (kind); its ramp is [joint dark, joint, cold, grain, shade, mid, light, lit] (e.g. piedra sombra, piedra, niebla sombra, niebla, túnica sombra, piedra clara, pergamino, túnica luz); moss from its moss [dark, light]
- `salt`: default 1321 (tones +3, moss +5, grain +7, cracks +11, specks +13, cold joint +9)
- `overgrow`: an old floor where nobody walks: moss and grass come in from the walls over the slabs (needs edge), ragged, lighter in the middle of a patch, with a dark rim, and the slabs peek through

### `map_runner`

- `split`: px from the middle of the joint between the two slabs of a row [odd rows, even rows] (default [-3, 4])

### `map_balustrade`

- `across`: rails along a row, seen from the front: a curb, a lacquered handrail, balusters, posts with gold finials; they stand up (a cast step throws their shadow)
- `down`: the rails of the sides, seen from above: curb and handrail along, gold finials every so often
- `lacquer`: [line, dark, mid, light] (default tinta, madera sombra, bermellón, bermellón claro)

### `map_stairway`

- `from`: row of the first tread, cells; it goes to the bottom of the picture unless `to` says where it ends
- `to`: row past the last tread, cells: the flight ends there instead of at the bottom of the picture (a stairway inside a map, between two levels)
- `tread`: [nose left, nose right, then the rows 1 to 4] (default túnica luz, pergamino, piedra clara, túnica sombra, piedra, piedra sombra)
- `worn`: steps that read as stone: the colors come from the ramp of the material (`tread` and `wall` are not used), `every` defaults to 7, `middle` is not used and past `fade` it goes one step darker every two treads

### `map_overhang`

- `bark`: [light, mid, dark, outline] (default madera clara, madera, madera sombra, túnica noche)
- `leaves`: [night, shadow, mid, crown, light, glint] (default túnica noche, hoja sombra, hoja, bambú, bambú claro, hoja clara)
- `salts`: [bark, lumps, spots] (default [1811, 1800, 1820]; lumps and spots + the index of the pad)
- `tones`: [top, bottom] fractions of each pad height: the top band in light (lit toward the west), the bottom band in shadow, the middle in leaf: a pad in three tones instead of a lit rim (default: the lit rim)
- `cast`: [dx, dy] px: each pad of the step darkens one tone what its pads lower than it (a bigger v) show at [x + dx, y + dy], so a tier drops its shadow on the tier below (with a sun the offset comes from the sun and the height between the pads; [dx, dy] is only the old light)
- `outline`: ink every edge of a pad, the bumpy top included (default: ink only under and at the east)
- `shadow`: its shadow on the ground: without a sun the whole layer slid `at`; with one, what stands thrown from its height over `foot`, a pad from the height of its belly line
- `foot`: with a sun: v in cells of the ground the tree stands on (default the lowest px of its trunk and limbs)
- `limbs`: trunk, boughs and roots as round limbs, painted in order before the pads: bark in four tones lit from the northwest (a light band down the west of the trunk, on top of a bough), grain that follows each limb, ink only against the outside
- `limbs[].into`: `{from, tones, ink?, band?}`, a root that sinks into the rock face: past `from` (share of its length from the thick end, mixed over `band`, default 0.15, dithered) its bark takes the rock's four `tones` and its outline the rock's `ink`, so it is lost in the stone instead of ending in the air
- `barktones`: the four tones of the limbs, light to dark (default madera clara, tierra, madera, madera sombra)

### `map_grove`

- `bark`: [light, mid, dark, outline] (default madera clara, madera, madera sombra, túnica noche)
- `layer`: layer of the crowns, in front of people (default "copas"); the trunks go on the ground
- `into`: in a sub-recipe (a place step): the id of a grove of the mother recipe; its `trees`, moved to the place, are added at the end of that one instead of being a grove of their own (only `trees` is allowed)
- `on`: materials (kinds) under the foot of a zone tree, 3 px around and 6 up (default any but the empty one)
- `keep`: [u, v, w?, h?] cells no crown nor its shadow covers, besides the occupied cells of the game (where someone stands or a landmark is), which are always kept: a zone tree that would is not planted, a given one is an error
- `behind`: [u, v, w, h] boxes of things that stand on the bottom row of the box (a sprite of the game, drawn under the crowns): no crown nor its shadow of a tree whose foot is above the bottom of the box covers it (the tree is behind it); a tree whose foot is on or below it is in front and may. A zone tree that would is not planted, a given one is an error
- `clear`: [u, v, r?] cells no foot of a zone stands within r cells of (default 1.5; an entrance, a spot people stand on); occupied cells of the game are always kept
- `leaves`: [outline, shadow, mid, light, glint] of a round crown (default túnica noche, hoja sombra, hoja, bambú, bambú claro)
- `needles`: [outline, shadow, mid, light, glint] of a pine (default túnica noche, hoja sombra, hoja, bambú, bambú claro)
- `snow`: [px, lit, mid, shade]: snow lying on each tier of a pine, px deep at the peak and thinner toward the tips (which stay green), lit to the west and in shade to the east; the silhouette does not change
- `blossom`: [outline, shadow, mid, light, glint] of a plum (default túnica noche, flor sombra, flor, flor clara, túnica luz)
- kind `ginkgo`: a straight trunk of pale bark (`pale_bark`) that goes on up inside the crown, and a golden crown that opens upward like the leaf of the tree, a fan: narrow where it starts, its sides curving out as it rises, a low dome with a shallow notch on top. Built of small clusters each lit on its own (the crown reads as many small fans of leaves, not one ball), a few hanging under the sloping sides; it darkens from its middle down half as much as a green crown (`crowns.fall`). Narrower than a broadleaf as tall (0.66 to 0.76 of it), so its pool of shadow is smaller
- `ginkgo`: [outline, shadow, mid, light, glint] of a ginkgo (default túnica noche, bronce, oro, oro claro, fuego luz)
- `pale_bark`: [light, mid, dark, outline] of the ginkgo's trunk (default piedra clara, piedra, piedra sombra, and the outline of `bark`)
- kind `willow`: a short trunk leaning well over to one side, boughs up into a low lumpy dome, and from the dome the crown falls in four to six curtains (by its salt) almost to the ground (2 to 9 px over the foot; the middle ones, in front of the trunk, a little shorter): one mass on top, they part lower down, first a crease of shadow and then air where the trunk shows, the outer ones bowing out before they hang; streaked down their length like strings of leaves, their feet frayed into tips of uneven length. Lit to the west and darker down, like every crown; the shadow is swept from just over the ground, since the curtains reach it. It does not sway: no crown of a grove moves (the layer of the crowns is still)
- `willow`: [outline, shadow, mid, light, glint] of a willow (default túnica noche, hoja sombra, hoja, bambú, niebla sombra: greyer than the leaves, the glint silver)
- `drape`: [face materials, px]: where a crown stands over the lip of a cliff (the first px of one of these materials below its foot, 20 px down at most), green hangs from the lip under it in curtains up to this long, longest under the middle of the crown (default none)
- `zones[].ranks`: {group: [factor…], near?: [cells, factor]}: sizes by where a tree stands instead of a draw (`tall` is then ignored): once a group is whole its trees back to front (by the row of the foot) are group[0], group[1]… times their height (the last goes on; a lone tree gets the first), and one whose foot is within `near[0]` cells of a mask of `avoid` at most `near[1]`; the feet do not change, and one that would then cover what is kept or reach `avoid` keeps its size
- `zones[].tall`: [[odds, factor]…]: that share of the zone's trees (not bushes) this many times taller, by a draw of its own; the feet, kinds and count do not change, and one whose taller crown would cover what is kept or reach a mask of `avoid` its usual crown does not stays at its size
- `crowns`: how the crowns of the trees (not the bushes) take the light and how large they are against their trunks; without it, as always

### `map_cloudscape`

- `material`: the kind of every pixel it paints; its ramp gives the sky [deep, mid, light] (tones 0, 1, 2)
- `clouds`: [crest, mid, belly, deep belly] of the clouds (default tones 6, 5, 4, 3 of the ramp)
- `haze`: [px across, salt, deep]: the sky is its mid tone, and the deep one in wide soft patches where the noise is below deep (default [200, 4001, 0.36])
- `masses`: cumulus masses: lumps on lumps, lit from the upper left, a cold belly and a crease where one lump sits in front of another; drawn back to front
- `soft`: soft masses: the edge melts into the sky (only where the sky shows, never over another cloud), a less scalloped crest
- `horizon`: [top, bottom px, salt?]: a band of haze across the picture, behind the masses and over the peaks, thick in its middle and dithered out at both edges, its middle line wavering
- `sea`: a sea of cloud under everything: below a wavering line the sky is a floor of almost white cloud (soft troughs of mid and belly, small gaps of light sky), its top edge and its body heaped with cumulus drawn back to front; those masses drift like the others. `lobes [min, max]` (px) turns its top edge into a row of cloud tops: discs that wide sitting on the line, spaced along it (a steep side gets as many as a flat one), round tops with a notch between two, never a straight run (bare, the parabola of `rise` reads as a diagonal cut on the steep sides); `swell` (0.3) is how much of each disc stands over the line, and `crest` (share of the radius) puts a cumulus on each lobe, shaded and drifting like the other masses
- `drift`: the masses and wisps go to their own layer (the game moves it: "corre") instead of the ground; with within, a whole mass drifts only if, moved px each way, it still falls on the sky past the island; one that would touch it stays on the ground, behind the island (never a cloud cut straight)
- `within`: only inside this mask (the id of a brink: what lies past its foot): the same sky as a first cloudscape step with the same numbers, painted again where the island fell away
- `planes[].snow`: `{tones, line?, jag?, salt?}` — a far peak (`shape: "peak"`) with its own snow (unwritten-dao #226, the snowy peaks of the summit): `tones` [lit, mid, shade, crack] lit on the same side as the rock (left); the snow covers `line` of the height from the summit down (default 0.45), so a shoulder lower than that stays bare rock; the line breaks up and down `jag` of the height (default 0.12) strip by strip between two ribs — a gully holds the snow lower, a rib runs dark up into it — and wavers a px or two along each strip; the last rows of snow over the line in its shade tone. Without it, the peak as always (before, a snowy peak was two `peak` with the same salt, the snow a narrower one over the rock, and it came down to the clouds at the foot):
  ```json
  {"shape": "peak", "tones": ["lejos", "monte", "monte sombra", "monte sombra"], "at": [[-2.8, 15.0, 31, 56]],
   "snow": {"tones": ["nube", "celeste luz", "cielo claro", "lejos"], "line": 0.45}, "feet": 0.5, "salt": 4603}
  ```

- `planes[].over`, `planes[].pavilion`, `planes[].chains` (unwritten-dao #301, third round: the pavilions and chains of the sea of clouds): `over` (0..1) draws the top share of each pillar again after the masses, the sea and the wisps, so the needles stand out of the clouds instead of being covered (below the cut, the same px). `pavilion` `{on, tones: [roof dark, roof lit, snow, posts, floor], width?, posts?, ink?, finial?}` stands a little pavilion on the top of the pillars `on` (indices of `at`): a stone floor, two lacquer posts and a lintel with the dark inside, a hip roof with turned-up eaves, snow on its ridge, an ink outline; those pillars lose their pines. `chains` `{pairs, colors: [link, glint], sag?, drop?, bells?}` hangs a chain from the side of one top to the other (from a pavilion's eave if it has one), sagging `sag` px (6), a little bell under its middle. All three drawn over the clouds; a wrong index is an error.
  ```json
  {"tones": ["niebla", "basalto luz", "basalto claro", "basalto"], "at": [[-6.5, 6, 12, 110], [-3.6, 9.5, 9, 120], [-7.8, 14.5, 14, 150]],
   "spire": 0.55, "over": 0.4, "pavilion": {"on": [1], "width": 15, "posts": 4, "tones": ["basalto hondo", "basalto claro", "nieve", "bermellón", "niebla"], "ink": "tinta"},
   "chains": {"pairs": [[0, 1], [1, 2]], "colors": ["basalto hondo", "basalto luz"], "sag": 7, "bells": "oro"}}
  ```
- `planes[].mesa` (unwritten-dao #339, the peñones of the Campana Alta): a pillar that keeps the width of its rock up to its top and wears a table seen from above there, an ellipse `mesa` × its half width deep in the tones of `cap` (lit on the west, the south and east rim in shade); its pines stand on the table and a pavilion in its middle. With `spire` it narrows upward and still ends in a table.
- `planes[].spire`, `planes[].pines`: a pillar (`shape` pillar, the default) as a needle of rock, its top narrower by `spire` of its width (0..0.9), and `pines` `{count: [min, max], tones: [dark, mid, snow], height?: [min, max] px}`, little pines standing on its top with snow on their tiers (unwritten-dao #301: the needles of the sea of clouds of the Campana Alta). Without them, px by px as before.

### `map_cavern`

- `keep`: [floor, shaft] inset px each cell keeps (default [3, 4]: a one-cell corridor never closes)
- `exits`: the corridor of each exit on the border goes on into the margin and is lost in the dark (default true)
- `shafts`: [u, from v, to v] cells (inclusive, the margin is negative): a shaft going up, painted black (a ladder goes down it)
- `face`: [base px, swing, period px, swing 2, period 2 px]: the height of a south face at column x = base + round(swing·n1(x/period)) + round(swing2·n1(x/period2 + 5)) (default [7, 1.5, 7, 0.7, 13])
- `facets`: [top px, floor px]: size of the Voronoi facets of the rock seen from above and of the slabs of the floor (default [12, 11])
- `floorKind`: the kind its floor px get (default none, as always): a step after it with `on` —a glow around a torch, the shadows of a lamp— then lights the floor and leaves the rock above alone

### `map_hangroots`

- `odds`: a face cell (wall over floor) gets a root when the cell noise (salt 1) is below this, of 100 (default 24)
- `hang`: thin roots hang in front when the cell noise (salt 8) is below this and nobody stands below (default 60)

### `map_carvings`

- `within`: then the face cells inside this box with no root (by the cell noise, salt 9), at most max
- `count`: then this many face cells by the cell noise (salt 9), the ones with no root (default 2)
- `ink`: the color of the strokes (default tinta): a room with no ink outlines (an interior to the mould of the island) carves them in a deep tone of its stone

### `map_formation`

- `ink`: the color of the carved trigram strokes on the ground (default tinta): a cave with no ink outlines carves them in a deep tone of its stone; the lit layer does not change

### `map_gloom`

- `at`: px past the map where it goes 1, 2, 3 and 5 steps darker (default [4, 18, 34, 52])
- `area`: the id of a mask (an area, a water, a brink…): px out of it, not past the map, count for `at` (8-steps), so a gloom closes around a room or a clearing anywhere. It needs no cavern: `salt` (default the cavern's, else 0) and `darkest` (default the cavern's, else tinta) are its own

### `map_glen`

- `beach`: the line of a lines step: the gravel beach is at or below it and off the water (mask "sand", cleaned)

### `map_cushions`

- `reach`: [px, more px, period px, salt]: closer to the water than px + more·fbm(x/period, y/period, salt, 2) (default [9, 4, 6, 337])
- `noise`: [px across, px down, salt, above]: and where this noise is above (default [5, 4, 338, 0.42])

### `map_mudtrail`

- `levels`: tones by the 5 px noise: below a → shadow, below b → base, above c → light (default [0.30, 0.42, 0.62])
- `wet`: [px, more px, period px]: closer to the water than this the earth is one tone wetter (default [14, 6, 6])

### `map_plunge`

- `banks`: materials that make a high bank over the water (a face of earth and a cold shadow)
- `faces`: the two px of a high bank face (default earth tierra sombra, madera sombra; rock túnica oscura, túnica noche)

### `map_wetwood`

- `top`: [far, near, px]: above the map (off the ledge) the wood closes (default túnica noche, hoja sombra, 5)
- `fade`: [px past the edge, one step until, deep from, all dark from, salt]: past the edge what is not wood darkens (default [10, 24, 52, 66, 427])

### `map_glenshade`

- `rim`: without a sun: [px, more px, period, row, salt]: the shadow of the wood on the left (default [4, 5, 9, 3.3, 431])
- with a sun it needs no `wetwood` (only `rim` reads its edges) and its casters no `at`: the wood is any mass of `wood` (none is fine)
- `height`: with a sun: px the wood stands over its edge (default 32): its shadow reaches the sun's length times that

### `map_glenlitter`

- `tufts`: tufts: count (9000), odds [near, far] ([0.9, 0.35]), spacing [near, far] px ([8, 11]), near [px to the water, px around the earth] ([10, 6]), shapes, layer of the tips ("mechones"), unknown [color, tone] (["vida sombra", 1])
- `flowers`: pale flowers by the water: count (36), px past the map (8), px from the water (22), [odds, colors, else], stem (hoja sombra)

### `map_glenflow`

- `sun`: [px along, px across, salt, above]: sunny glints are white (default [64, 13, 333, 0.6])

### `map_drifts`

- `on`: the materials it lies on (the snow): nothing else is painted, and the banks rise only over them
- `count`, `size`, `height`: free mounds over the snow (default one per 4000 px of it), [min, max] px along the wind (default [16, 40]; across, 0.45–0.7 of it), px at the crest (default 5)
- `at`: fixed mounds [u, v in cells, rx px along the wind, ry px across, height px?]
- `against`: `{kinds?, targets?, reach?, height?}`: banks against the things with a foot laid before (by step id, step name or kind; default all but buildings) and the px of `kinds`; `reach` px out from the foot (default 7, more where the wind meets it), `height` at the foot (default 0.8 × height)
- `wind`: [x, y] the way it blows (default [1, 0.2]): a mound is long upwind and short on the lee
- `base`: index of the flat snow in the ramp (default the material's `base`, else length − 2)

### `map_wetstones`

- `water`: its water: ids of masks (a glen's `water`, a water step's id) and/or materials (the water of a curve, a pool), together (default the glen's `water`; a name that is neither stops the recipe)
- `flow`: [x, y] the way the water runs, snapped to an axis: foam where the stone meets the water coming, the wake downstream, drifting a px across every 4 (default [1, 0]: the glen's river, as before)
