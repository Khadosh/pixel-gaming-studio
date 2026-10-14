# `figure`: el rig de cuerpo entero, de frente, de espaldas y de perfil

`src/headless/figure.ts`. Un cuerpo de cápsulas en 3D (cabeza, torso, brazos,
piernas, falda) posado por cuadro desde una tabla de poses y proyectado con una
cámara; z-buffer, tres tonos por material, contorno de tinta. Sobre ese cuerpo
se pegan **partes dibujadas**: la cabeza por vista (`head_art`) y cualquier otra
cosa colgada de una articulación (`attachments`). Las partes se dibujan, no se
deforman: el rig elige la pose y las corre píxeles enteros con su articulación.

## Vistas

| `view` | cámara (`heading`) | para qué |
|---|---|---|
| `front` | 142 | 3/4 abajo a la izquierda: el rival de una pelea en diagonal |
| `back` | -36 | de espaldas, 3/4 arriba a la derecha: tu lado de la pelea |
| `side` | 0 | de perfil mirando a la derecha |
| `side_left` | 180 | de perfil mirando a la izquierda |
| `front_right` | 45 | diagonal: abajo a la derecha (un mapa que camina en ocho direcciones) |
| `front_left` | 135 | diagonal: abajo a la izquierda |
| `back_right` | -45 | diagonal de espaldas: arriba a la derecha |
| `back_left` | -135 | diagonal de espaldas: arriba a la izquierda |

`heading` acepta un número o uno por vista: `{ "front": 90, "back": -90 }` es un
sprite de mapa visto de frente, derecho. `elevation: 0` mira a nivel (el perfil
dibujado, sin ver la coronilla). `shift: { "side": [1, 0] }` corre la figura en
el lienzo en esa vista (un perfil con la espada saliendo atrás va un px
adelante); `side_left` toma el de `side` espejado.

`side_left` es una cámara de verdad, del otro lado: el brazo y la pierna de
adelante son los izquierdos y la luz sigue arriba a la izquierda. Lo dibujado
de `side` (cabeza, partes) se espeja solo si `side_left` no trae lo suyo. Con
un cuerpo simétrico, todo lo que está arriba de la cadera es el espejo exacto.

### Las diagonales (`front_right`, `front_left`, `back_right`, `back_left`)

Cámaras de verdad a 45° entre las vistas de hoy (nacieron del juego, #384: un
mapa que camina en diagonal y la pelea sobre el rombo). Las poses son 3D y valen
igual; lo que una diagonal no trae dibujado lo toma de sus dos vecinas
(`DIAGONALS`: la que mira, `front` o `back`, y el perfil de ese lado), sin
dibujar nada a mano:

- **`views`**: una diagonal sin su entrada usa la de la vista que mira.
- **La cabeza dibujada** (`head_art`, con `_shut` y `_blink`) se gira
  (`figureTurn.ts`): cada fila es un corte; la vista que mira da el ancho y el
  perfil la profundidad, juntos una elipse, y cada columna de la diagonal toma el
  píxel de la vista que mira, leído alrededor del corte (el ojo de adelante entero,
  el de atrás más angosto contra el borde). Pasados 70° (90° de espaldas) el
  píxel es del perfil, pero sólo de la oreja para atrás: un perfil dibuja el ojo
  en su borde, y leído entero pone una segunda cara al lado de la primera.
  **De espaldas** sólo se ve la mitad de atrás de la cabeza: la nuca del dibujo de
  espaldas y, donde el perfil la mira bastante más de frente (`SIDE_BIAS`), el
  costado del perfil (el pelo de la sien, la oreja con su línea); el ancho de
  cada fila es la mediana de las cinco de alrededor (una oreja dibujada un píxel
  afuera no hace raya), y las filas angostas de arriba (el rodete y su cinta,
  menos de `NARROW` del ancho) se corren enteras, como están dibujadas. La silueta
  lleva su tinta.
  `head_turn` (grados, por defecto 30) dice cuánto gira la cabeza desde la vista
  que mira, aunque el cuerpo gire más (un `heading` propio de la diagonal: el
  chibi del juego gira el cuerpo de espaldas 55° para que el hombro cercano mande
  y el brazo lejano quede tapado): un chibi de 3/4 conserva los dos ojos. Una `head_art.front_right` dibujada gana.
- **Las partes** (`attachments`) sin dibujo propio en la diagonal, según `turn`:
  `keep` (por defecto, lo rígido: espada, calabaza) toma el dibujo de la vista que
  mira (o el del perfil, si la parte no reemplaza un miembro ni cuelga de la
  cabeza: una cinta cortada para la cabeza de perfil flota en la girada), colgado
  de su articulación, que el rig ya giró; si el cuerpo girado la deja flotando
  (una estocada), se corre hacia su articulación hasta tocarlo (hasta 4 px).
  `wrap` la gira como la cabeza (ropa dibujada sobre el cuerpo; probado con el
  pecho y la falda del chibi del juego, se leían peor que con `keep`).
- El contrato `directional8` (`contract.ts`) pide las ocho vistas
  (`walk_down_right`, `idle_up_left`…); `viewOf` toma la vista más larga que
  calce.

`views: { "side": { … } }` cambia campos de la receta en una vista (se
reemplazan enteros; `null` saca uno): el dibujo puede tener la manga celeste de
perfil y clara de frente, y el rig lo sigue. `top.sleeve` da los tonos de la
manga (por defecto, un paso más oscura que el pecho).

## `stance`

- `fighter` (por defecto): guardia de pelea, pie de adelante adelantado; `walk`
  es un arrastre que nunca cambia de pie. Lo de siempre.
- `upright`: parado derecho, brazos colgando apenas afuera del cuerpo (la manga
  rompe el contorno), el pie izquierdo apenas adelante para que el perfil
  muestre las dos piernas, y los hombros caen desde el cuello. `walk` es un
  ciclo de verdad: contacto con el izquierdo adelante, paso, contacto con el
  derecho, paso; brazos contrapuestos y el cuerpo que sube en el paso. Lo que
  pide un sprite de mapa, y lo que se lee de perfil. Sólo `upright` corre
  (`run`, abajo). `technique` es el mismo
  en las dos; `attack`, `hurt` y `die` de `upright` se midieron contra la hoja
  de referencia del jugador (filas Atacar, Herir, Morir): una estocada que
  corta (la mano sube atrás del hombro y baja cruzando con un paso largo y la
  cadera abajo: de frente, el jab del peleador va hacia la cámara y no se ve),
  encogerse en el lugar, y plegarse al suelo de rodillas con la cabeza baja
  adelante (una cabeza dibujada no se puede acostar).

`arm_swing` (por vista: `views.front.arm_swing: 1`, `views.back.arm_swing:
-1`) hace que la caminata se lea de frente y de espaldas: la cámara mira a lo
largo del vaivén y el brazo que va y viene no se mueve en pantalla. Con esto la
mano que viene hacia la cámara baja `arm_swing` unidades por unidad de vaivén
(el codo, la mitad) y la otra queda a su altura: brazo cerca largo, lejos
corto. Sólo la cercana, porque la lejana al subir se mete en su puño y se
pierde. Negativo es para la cámara de atrás. Por defecto 0.

`build.depth` (profundidad de torso y falda contra el ancho: un chibi en túnica
se lee de perfil a 1,5), `build.feet` (botas) y `build.legs` (grosor de las
piernas) ajustan el cuerpo; `skirt.flare` abre el ruedo.

## Partes dibujadas

```json
"head_art": { "front": { "rows": [...], "legend": {...}, "at": [3, 1], "outlined": true },
              "side":  { "rows": [...], "legend": {...}, "at": [3, 3], "outlined": true } },
"attachments": [
  { "name": "espada", "joint": "spine_top", "legend": {...},
    "views": { "front": { "rows": [...], "at": [1, 23], "behind": true, "outlined": true },
               "side":  { "rows": [...], "at": [2, 24], "behind": true, "outlined": true } } },
  { "name": "calabaza", "joint": "hip_left", "views": { "front": {...}, "side": {...} } },
  { "name": "pecho", "joint": "chest", "views": { "front": { ..., "depth": 6 } } },
  { "name": "brazo", "joint": "elbow_right", "anims": ["idle", "walk"],
    "views": { "side": { ..., "replaces": ["arm_right"] } } }
]
```

- **Articulaciones:** `head`, `spine_top`, `chest`, `pelvis`, y a cada lado
  `shoulder_`, `elbow_`, `hand_`, `hip_`, `knee_`, `foot_` + `left`/`right` (los
  del personaje). `figureJoints(rec, anim, frame)` dice dónde cae cada una.
- **Dónde va:** `anchor` es el píxel de la parte que se apoya en la
  articulación. O, mejor, **`at`**: la esquina de arriba a la izquierda donde
  estaba la parte en el cuadro quieto (`idle`, cuadro 0) de esa vista. Una parte
  recortada de un dibujo de la figura a su tamaño dice de dónde salió y el motor
  calcula el ancla: el cuadro quieto devuelve el dibujo, las otras poses llevan la
  parte con su articulación.
- **Orden:** `behind: true` detrás de todo el cuerpo; por defecto delante de
  todo; `depth: n` a n px hacia la cámara desde la articulación (un pecho
  dibujado a la altura de la tela, que un brazo que se adelanta igual tapa).
- **`outlined: true`:** la parte trae su contorno (recortada de un dibujo
  terminado, tinta y todo) y la figura no le pone otro: el borde queda como se
  dibujó, con los píxeles que el dibujo dejó abiertos.
- **`flip`:** la parte espejada. `side_left` sin parte propia usa la de `side`
  espejada, colgada de la articulación del otro lado.
- **`replaces`:** miembros del rig que la parte reemplaza mientras se ve
  (`arm_left`, `arm_right`, `leg_left`, `leg_right`), como la cabeza dibujada
  reemplaza el cráneo. **`anims`:** en qué animaciones se ve (una manga dibujada
  colgando sirve para parado y caminando; el golpe vuelve al brazo del rig).
- Una vista que la parte no nombra no la muestra; `null` la esconde aunque haya
  de dónde espejar.
- **`sway`:** el ciclo propio de la parte, a destiempo del cuerpo:
  `{ "dx": 0, "dy": -1, "period": 4, "phase": 1, "anims": ["walk"] }` en el
  attachment o en una vista (la de la vista gana; `null` la deja quieta ahí).
  Dos dibujos: la parte como se cortó, y la parte corrida `dx`, `dy` px de su
  articulación, la mitad de los cuadros cada uno, empezando `phase` cuadros
  tarde. Con 4 y 1, los cuadros 1 y 2 van en su lugar y 3 y 0 corridos: el
  paso cambia en 0 y 2 y la parte contesta uno después. En `run` (seis cuadros
  a los cuatro de la caminata) `period` y `phase` se estiran 1,5 veces: con 4
  y 1, 6 y 2 (2, 3 y 4 en su lugar; 5, 0 y 1 corridos). Fuera de `anims` (la
  caminata y la carrera por defecto) no se mueve: el quieto es el dibujo. En `side_left`, un
  `dx` prestado de `side` o del attachment va al revés. 1 px a 2× son 2 en
  pantalla: sutil.

- **`joined`:** la parte sigue a la cabeza dibujada (una barba con el
  arranque en `head_art` y lo que cuelga sobre el pecho como adorno, la parte
  de abajo de una cola de caballo con su `sway`): sin línea de tinta contra la
  cabeza, el pelo o la cara que tapa, como no la hay dentro de un dibujo;
  contra el cuerpo sí lleva la suya. Sin `joined`, una parte de adelante
  entinta lo que tapa en todo su borde (es lo que separa un brazo del pecho).

```json
{ "name": "cinta", "joint": "head", "sway": { "dy": -1, "phase": 2 },
  "views": { "side": { "rows": [...], "at": [4, 8], "outlined": true },
             "back": { "rows": [...], "at": [11, 7], "outlined": true, "sway": { "dx": 1, "phase": 2 } } } }
```

## La cara del rig de perfil

Sin `head_art`, con la cámara de costado (a menos de unos 25° del perfil), el
rig dibuja la cara como perfil: el ojo un píxel adentro del borde de la cara
con un píxel de blanco delante (`eye_white`, por defecto `#ffffff`) y el
contorno después, la nariz de un píxel afuera del borde, entre el ojo y el
mentón, y el flequillo que llegaba a la fila del ojo vuelve atrás. Con los ojos
cerrados (`hurt`, `die`), una línea. En 3/4 siguen los dos ojos de siempre.

## El pestañeo: `blink`, `blink_walk`

Fuera de cualquier contrato (como `sit` y `lotus`): el gemelo con los ojos
cerrados de cada cuadro de `idle` (`blink`) y de `walk` (`blink_walk`), con
las mismas duraciones. Se dibujan como esa animación —las partes con `anims`,
el `sway`, el `arm_swing` igual— y sólo cambian los ojos: el juego cambia al
gemelo en el mismo cuadro mientras su propio reloj dice cerrado, sin cortar el
paso. La cabeza dibujada usa `head_art.<vista>_blink` si está (la cara abierta
con sólo los ojos cerrados) y si no `<vista>_shut`; así el herido puede
apretar la boca y el pestañeo no.

## Correr: `run`, `run_stride`, `run_lean`

Fuera de cualquier contrato y sólo de `upright` (un `fighter` que la pide
falla diciendo que no hay pose): lo que un juego pone mientras se corre. Seis
cuadros en loop de 80 ms (`RUN_FRAME_MS`, 12,5 por segundo contra los 6,7 de la
caminata): aterrizaje, bajada y vuelo con un pie, y lo mismo con el otro.

- **Zancada** 1,6 veces la de la caminata (de perfil, los pies a 11,8 px contra
  7,2 en un cuerpo de 33): el talón cae lejos adelante y el pie de atrás deja
  el piso.
- **El torso** 10° adelante sobre la cadera (`RUN_LEAN`), con los brazos y la
  cabeza que lo siguen: de perfil la cabeza va 2 px adelante.
- **Los brazos** doblados y más altos: la mano de adelante sube al pecho y la
  de atrás queda a la cadera, contrapuestas a las piernas. Como suben y bajan
  de verdad, de frente y de espaldas se leen sin `arm_swing` (que es sólo de
  la caminata).
- **El cuerpo** baja sobre la pierna que aterriza y en el vuelo los dos pies
  están en el aire (1,5 px).
- **El paso** cada 240 ms contra 300: 1,25 veces la cadencia, que con la
  zancada da los pies de un cuerpo que se mueve unas dos veces más rápido.
- **El bastón** (`cane`) se apoya en el aterrizaje y mientras el cuerpo baja
  (cuadros 0, 1, 3 y 4) y se levanta sólo en el vuelo (2 y 5): se apoya más
  que caminando. El dibujo del bastón tiene que tener `run` en sus `anims`.
- `blink_run`: el gemelo con los ojos cerrados, como `blink_walk`.

`build.run_stride` (por defecto 1) acorta o alarga la zancada de la carrera y
`build.run_lean` (grados, por defecto 10) cambia la inclinación; la caminata no
cambia. Un viejo corre a pasitos y encorvado como está (`run_stride` 0,65,
`run_lean` 0: con los 10° encima de `stoop` y `neck`, la cara se salía del
lienzo de 32). Medido en las articulaciones (`figure.test.ts`): zancada ≥ 1,4
veces la de la caminata, torso ≥ 6° más que parado en los seis cuadros, los
pies que cambian, el vuelo sin pie en el piso, las manos más altas y con más
vaivén que caminando.

## De rodillas: `kneel`

Fuera de cualquier contrato, como `sit`: rodilla derecha en el piso bajo su
cadera (la canilla va para atrás y no se ve), la pierna izquierda doblada
adelante **y abierta a su costado**, la rodilla a media altura y el pie
plantado bajo ella; el cuerpo derecho sobre la cadera, la cabeza alta, el
antebrazo izquierdo apoyado en la rodilla levantada, el derecho colgando, y los
ojos **abiertos** (no se está muriendo: es el que perdió en el ruedo y espera
que lo levanten). Dos cuadros en loop: respirar sube el pecho y la cabeza, las
rodillas quedan. Más bajo que parado y más alto que el final de `die`, con las
suelas en la misma fila.

Por qué abierta: una cámara de frente (`elevation: 0`, la del mapa) no ve una
rodilla que sólo va hacia adelante; con las dos piernas bajo las caderas la
pose se leía **agachada**. Lo que dice «de rodillas» de frente es la rodilla
levantada a un costado con su bota, y del otro lado la túnica que llega al
suelo. Medido en las articulaciones (`figure.test.ts`): torso a menos de 15° de
la vertical de perfil (4°), cabeza a 0,8 del `idle` o más (0,84), la rodilla
del piso a ras, la otra a más de 0,6 de la cadera y más de 3 px afuera de ella,
el pie bajo la rodilla y la mano a menos de 2,5 px de la rodilla.

## Comer sentado: `eat`

Fuera de cualquier contrato, como `sit`: la misma sentada con las piernas
cruzadas, pero con los ojos **abiertos** y las dos manos adelante sosteniendo
un cuenco a la altura del pecho (cuadro 0, 2600 ms) que suben hacia la boca
con la cabeza apenas inclinada sobre él (cuadro 1, 700 ms), en loop. `sit` con
los ojos cerrados y las manos en el regazo, sentado a una mesa, se leía
meditar. El cuenco lo dibuja la receta: un adorno colgado de una mano con
`anims: ["eat"]` y `depth` adelante (las manos se pueden dibujar en él, a los
costados). Medido en las articulaciones (`figure.test.ts`): la cadera donde la
de `sit`, las manos más de 3 px sobre las de `sit` y a menos de 2 px del pecho,
y en el cuadro 1 más de 2 px más arriba, debajo de la cabeza.

## Sentado de perfil y de espaldas

`sit` y `eat` se posan por vista (`FigureAnim.views`, `posesIn`): de frente,
la sentada de siempre; **de perfil**, el loto es un regazo: la rodilla de
adelante sale unos 8 px delante de la cadera, los pies cruzados abajo y la
espalda derecha sobre la cadera (las rodillas abiertas a los costados del
frente quedaban escondidas bajo el pecho y se leía agachado); comiendo, el
cuenco adelante del pecho y después a la boca. `side_left` usa el de `side`
desde la otra cámara: con una receta simétrica es su espejo. **De espaldas**,
la sentada de frente sirve (las rodillas asoman a los costados); comiendo, los
codos salen afuera de los hombros. La cadera y la cabeza quedan a la misma
altura que de frente: la misma sentada vista de otro lado, sin saltar al
girar. Lo mide `figure.test.ts` («sit and eat seen from every side»). Una
falda dibujada para estar parado no sirve sentado de perfil: la receta la
saca y deja la túnica del rig hasta las rodillas (lo hace el juego).

## Martillar: `hammer`, y una parte por cuadro: `frames`

Fuera de cualquier contrato, como `kneel`: el martillazo de una forja, tres
cuadros sin loop (arriba 380 ms, el golpe 160, medio camino de vuelta 220). La
mano derecha sube el martillo al costado de la cabeza y un poco atrás, el codo
afuera; la izquierda sostiene el hierro bajo y adelante; después el puño baja
adelante del pecho **a la altura del hombro, con el brazo derecho horizontal**
(donde está la cara de un yunque al lado de un chibi: con el puño en la faja el
martillo colgaba junto a la cadera, lejos del yunque), el pecho se inclina
sobre él y las rodillas ceden. Los
pies no se mueven: es un golpe, no un paso. El `attack` de `upright` es una
estocada que avanza, y frente a un yunque se leía caminar hacia él.

Un chibi de 2,5 cabezas no llega con el puño por encima de la coronilla: llega
a la altura de la cabeza, y lo que sube por encima es el martillo dibujado en
la mano. Como una parte se mueve con su articulación pero no gira, el martillo
son **dos partes**: una arriba (`frames: [0]`) y otra abajo (`frames: [1, 2]`),
las dos con `anims: ["hammer"]`. `frames` dice en qué cuadros de esas
animaciones se ve una parte (por defecto, en todos). El de arriba lleva el
mango largo (la cabeza del martillo 4 px o más sobre el pelo que tiene debajo)
y `depth` adelante en las cuatro vistas: detrás, la cabeza dibujada lo tapaba
entero. El de abajo sale de la mano hacia adelante, horizontal, con la cabeza
colgando en la punta.

Medido en las articulaciones (`figure.test.ts`): de frente, el puño arriba a la
altura de la cabeza y más de 5 px sobre el hombro; abajo, a menos de 2 px de
la altura del hombro, 3 px o más sobre la cadera y más cerca del medio que
parado; de perfil, abajo, más de 4 px adelante del hombro y a la altura del
hombro y del codo (el brazo horizontal); los pies, quietos.

## Revolver: `stir`, y aire en el lienzo: `headroom`, `sideroom`

Fuera de cualquier contrato, como `hammer`: revolver una olla alta con una pala
larga, de perfil, tres cuadros en bucle (hundir 900 ms, girar 800, levantar
800: una vuelta cada 2,5 s). Las dos manos en el palo adelante del pecho, la
derecha arriba (a la altura del pecho) y la izquierda abajo (en la faja), casi
una sobre la otra; al hundir empujan afuera y el pecho se inclina sobre ellas,
al girar vuelven al cuerpo con los hombros torcidos, al levantar suben con el
cuerpo derecho. Los pies no se mueven. La pala la dibuja la receta, una parte
por cuadro (`frames`) colgada de `hand_right`, porque una parte no gira. De
frente no se lee: un juego lo pide sólo de perfil.

Una olla más alta que la persona (el Horno Rojo de The Unwritten Dao: la boca a
36 px del mundo sobre los pies de un chibi de 24) no entra en 32 × 48. **`headroom`**
agrega filas vacías arriba del lienzo y **`sideroom`** columnas a cada lado; el
cuerpo, `ground` y cada `at` quedan donde estaban contados desde las suelas y
el medio, así que la receta dibujada para 32 × 48 no cambia nada más (un `at`
cortado de perfil se espeja en el lienzo sin aire y después se corre). Un juego
que para el sprite sobre los pies y lo centra ve el mismo cuerpo, con lugar
para lo que lleva.

Medido en `figure.test.ts`: las dos manos más de 2 px adelante del hombro, la
derecha 3 px o más sobre la izquierda y a menos de 2 px en x; los pies quietos;
al hundir la mano 1,5 px más afuera que al girar; con aire, los 32 × 48 de
abajo al medio son el cuadro sin aire píxel por píxel (de los dos lados) y una
pala que pasa la coronilla se ve.

## Un cuerpo viejo: `stoop`, `neck`, `leg_length`, `cane`, `cover_hands`

Para que un anciano se lea anciano a 24 px de alto sin cambiar el tamaño de la
cabeza (la regla del chibi):

- `build.leg_length` (por defecto 1): el largo de las piernas. 0,65 saca un
  35 % de la cadera a la suela (3,5 px en un cuerpo de 33) y baja todo lo de
  arriba lo mismo; las suelas quedan en su fila.
- `build.stoop` (grados): el pecho gira hacia adelante sobre la cadera y los
  hombros y los brazos lo siguen. `build.neck` (grados) dobla además la nuca:
  la cabeza va adelante y abajo. Con 12 y 8 el eje cabeza–cadera de perfil se
  inclina ~15° más que el de un adulto (`figure.test.ts` pide 8° o más).
- `top.cover_hands`: la mano se pinta como la manga (una túnica vieja tapa las
  manos). `top.sleeves: "rolled"`: la manga hasta el codo con un puño y el
  antebrazo al aire (un herrero).
- `cane: { hand: "left", reach: [3.5, 1.5, 1.5], lift: 2.4, ahead: 1.6 }` (en
  la carrera, ver «Correr»): esa
  mano deja de balancearse y sostiene el bastón donde cuelga parada más
  `reach` (adelante, arriba, afuera, en unidades de la tabla de poses).
  Parada y respirando no se mueve; en la caminata se apoya en cada contacto
  (cuadros 0 y 2, `ahead` adelante) y se levanta `lift` en cada paso (1 y 3):
  la parte colgada de esa mano (el bastón dibujado, con `anims: ["idle",
  "walk"]`) se apoya y se levanta con cada paso en vez de seguir el brazo.
  Como la mano no sube ni baja con el cuerpo, la punta toca el piso en los
  contactos. El bastón de `side_left` se dibuja propio (`views.side_left`):
  el espejo prestado de `side` colgaría de la otra mano, que se balancea.
- `pgs figure … joints=true` contesta además dónde cae cada articulación en el
  cuadro quieto de esa vista: para medir la postura (la inclinación) y no sólo
  el dibujo.

## El jugador de 32×48

La receta de prueba (el estudio aprobado de The Unwritten Dao,
`art/pss/recetas/chibis/jugador32.txt`, cortado en partes): `build.heads` 2,5,
`build.height` 33, `stance: upright`, `heading { front: 90, back: -90 }`,
`elevation: 0`, `shift.side [1, 0]`, `build.depth` 1,5, `build.shoulders` 1,15,
`build.feet` 1,3, `build.legs` 0,75; cabeza de frente y de perfil, pecho y falda
de frente, falda y brazo de perfil, espada y calabaza en las dos vistas, todas
con `at` y `outlined`. Medida contra los dos cuadros a mano con las medidas de
`scripts/chibi32_estudio.py` (alto de cabeza, cara/pelo, ojos, flequillo, nuca,
nariz, hombros, faja): todas dentro de ±1 px.

En el juego es `art/pss/recetas/chibis/jugador32_rig.json` (`./arte.sh rig`).
Suma la cabeza de espaldas dibujada a mano calcando la vista «Espalda» de la
hoja (rodete, cinta con sus colas, orejas, nuca en puntas; medida contra la
hoja a ±1 px salvo el rodete y las puntas, que son los de frente), las cabezas
de ojos cerrados (`front_shut`, `side_shut`, y `front_blink`: la boca de la
cara abierta), el qi (`glow`), la cinta, la
calabaza y la vaina con `sway`, y la espada en la mano de perfil en el golpe
(`espada_en_mano`, de `hand_right`, sólo en `attack`).

## Por capas: `layers: true` (el creador de personaje)

`pgs figure … layers=true` dibuja lo mismo y lo guarda partido: el asset trae
una capa por parte del cuerpo, siempre las nueve y en este orden
(`FIGURE_LAYERS`), aunque alguna quede vacía:

| capa | qué lleva |
|---|---|
| `pelo_atras` | el pelo que cae por la espalda: la nuca, la cola y el pelo largo del rig; los adornos `layer: "pelo_atras"` (una trenza, una cola) |
| `cuerpo` | la piel: cabeza, orejas, cuello, brazos desnudos, manos; la cara (ojos, boca, nariz de perfil) |
| `ropa_abajo` | pantalón, calzado, la falda del rig y su ribete |
| `ropa_arriba` | túnica, cuello, mangas, puño arrollado, delantal, muñequera |
| `faja` | la faja de la cintura (también la que cruza la falda) |
| `pelo_adelante` | el pelo de la cabeza, flequillo, rodete, barba, bigote |
| `adornos` | los adornos dibujados (por defecto), el sombrero |
| `arma` | los adornos `layer: "arma"` |
| `aura` | la luz de la técnica: el orbe y el aro |

**Cada píxel del cuadro fundido está en una sola capa**: apiladas en cualquier
orden dan el cuadro fundido, píxel por píxel (`figure.test.ts` lo mide con
Wei Kang en las cuatro vistas, y `export_sheet` por capa en índices, rearmado
con sus rampas, contra la hoja fundida). Las capas son una partición, no
dibujos completos: lo que tapa el brazo no está debajo en la túnica. Cambiar
el color de una capa es exacto; cambiar una capa por la de otra receta (otro
peinado) deja ver lo que la de antes tapaba: para eso están las capas
completas (`layers: "complete"`, abajo).

**Una cabeza dibujada (`head_art`) es un dibujo con la cara y el pelo
juntos**, y se parte por color: los de piel, ojos y blanco del ojo de la receta
van a `cuerpo`; los del pelo, la banda, la cinta y la barba, a
`pelo_adelante`. Lo que no es ninguno se decide por lo que toca: una mancha de
esos colores (la vincha de Wei, del rojo de su túnica; un iris) va entera con
lo que más toca su borde, la vincha con el pelo y el iris con la cara; la
tinta, con lo que más tienen sus vecinos; una punta de tinta suelta, con el
píxel más cercano que ya se decidió.

**Los adornos dicen su capa** (`attachments[].layer`, por defecto `adornos`):
la falda dibujada es `ropa_abajo`, el pecho cruzado `ropa_arriba`, la espada
`arma`, la cola `pelo_atras`. El adorno va entero a esa capa.

**El orden de apilado sale del dibujo**, vista por vista: donde dos partes de
dos capas se tocan (un brazo sobre la túnica, la vaina detrás del hombro), la
más cercana a la cámara va arriba; un voto por par de píxeles vecinos en todos
los cuadros. Dentro de una misma parte (la faja pintada sobre el torso) la
superficie sólo se curva y no vota. Una capa va arriba de otra con dos votos o
más y más votos a favor que en contra; cada capa, en el orden de
`FIGURE_LAYERS`, entra lo más arriba que puede quedando debajo de las que el
dibujo le puso encima, y la que nunca toca a otra queda en su lugar.
**`stack`** fija pares que el dibujo no ve tocarse: `[["pelo_atras", "arma"]]`
sube `pelo_atras` justo arriba de `arma` si el dibujo la dejó abajo (un molde sin
pelo atrás al que el juego le presta una cola larga: de espaldas tiene que colgar
sobre la espada cruzada). Va casi siempre por vista (`views.back`, que heredan
`back_right` y `back_left`); la fundida no cambia un píxel. La
respuesta del comando lo dice: `layers.order` (de abajo arriba) y
`layers.materials` (por capa, qué es cada color: `piel`, `ojos`, `pelo`,
`cinta`, `barba`, `tunica`, `manga`, `ribete`, `falda`, `faja`, `pantalon`,
`calzado`, `delantal`, `munyeca`, `sombrero`, `aura`, `tinta`; `dibujo` lo que
la receta no nombra, que el juego deja como está: un ojo celeste no es el aura
porque el aura sea celeste) y `layers.tones` (por capa, qué tono de su material
es cada color: su lugar en los tonos que la receta le da, 0 el más claro; la
falda dibujada en «túnica sombra» es el tono 2 de `tunica`, y recoloreada sola
sigue siendo la sombra; `null` para `dibujo`, 0 para la tinta y un material de
un solo color).

**`export_sheet` saca cada capa**: `layer=<nombre>` exporta sólo esa capa, con
los mismos cuadros y etiquetas que la hoja fundida; `indexed=true` la exporta
como hoja de índices: el píxel del color n-ésimo es gris n (`#nnnnnn`, alfa 255;
vacío, alfa 0) y `meta.ramp` es la rampa, del más claro al más oscuro (por
luminancia, empate por hex). Ocho tonos de piel son una hoja de índices y ocho
rampas.

### Capas completas: `layers: "complete"`

Con `layers: "complete"` cada capa se dibuja **entera, como si las demás no
estuvieran**: la túnica debajo del brazo, la cabeza debajo del pelo, el cuerpo
desnudo debajo de la ropa (torso, brazos y piernas en piel), la falda debajo de
la faja. Cada parte del rig se dibuja sola en su capa, con su propio z-buffer:
lo que va a otra capa no se dibuja y no tapa nada, salvo que la parte diga qué
es en esa capa (el torso es túnica debajo de la faja y piel en `cuerpo`).

**Apiladas en el orden de la vista dan la fundida, píxel por píxel.** El orden
es uno por vista, así que lo escondido de una capa sólo puede estar donde, en
el cuadro fundido, la tapa una capa que va **arriba** de ella en ese orden: lo
que la fundida muestra es de su capa, como en la partición, y cada capa de
abajo agrega lo que dibujó sola en esos píxeles. Las capas del asset vienen en
ese orden (compuestas tal cual, la fundida). `order` fuerza el orden (de abajo
arriba, las nueve) para juntar corridas en una hoja: el juego arma las
sentadas de perfil con otra receta y las apila con el orden de la vista.

**Lo que no puede:**

- Donde el orden de la vista contradice un cuadro (el brazo desnudo de Wei
  sobre el pelo al caer de espaldas, con el pelo sobre el cuerpo en esa vista)
  la capa de arriba no tiene nada ahí: es la misma regla que reproduce la
  fundida. Si el cuerpo va arriba de la ropa en una vista (el brazo desnudo
  sobre la túnica), el cuerpo desnudo debajo de la ropa tampoco puede estar.
- **Una cabeza dibujada (`head_art`)** se parte por color como en la
  partición; la cabeza debajo del pelo es una aproximación: el cráneo del rig
  (la esfera y las orejas que la cabeza dibujada reemplaza), agrandado redondo
  hasta el ancho de la cara dibujada y apoyado en el mismo mentón, más lo que
  la cara encierra de costado a costado y de arriba abajo (una ceja del color
  del pelo); ahí lo que era pelo pasa a piel, del tono de la piel de la cara
  más cercana, y la figura le dibuja el borde. El dibujo nunca dijo cómo es la
  frente debajo del flequillo: de espaldas la cabeza pelada es una bola del
  tono de la nuca.
- El aura rodea la silueta con la que se dibujó: con otro pelo, el aro sigue
  al de antes.
- Una prenda calza en el cuerpo en que se dibujó: la túnica de Wei (hombros
  1,3) en el jugador (1,15) deja un píxel abierto de perfil entre la vaina y la
  espalda en un cuadro de la caminata.

`figure.test.ts` lo mide con Wei Kang y el jugador del juego (mismo molde,
`fixtures/figura/`): apiladas dan la fundida en las cuatro vistas; el pelo de
Wei sobre el cuerpo del jugador no deja ningún hueco (un píxel vacío que el
borde del lienzo no alcanza, que en la fundida del jugador era cuerpo) en lo
que el juego dibuja en cada vista, donde la partición deja decenas; y la ropa
de Wei sobre el jugador tampoco, de frente y de espaldas.

En The Unwritten Dao lo arma `scripts/chibi_rig.py --capas [--completas] <id…>` (con `--completas`, además `<capa>_completa*`) (juntando
las cuatro vistas como la hoja fundida); el contrato que lee el juego está en
su `docs/diseno/creador_de_personaje.md`, «Contrato de capas».

## Tests

`src/headless/figure.test.ts`: la vista `side` y su espejo; más angosto de
perfil que de frente y una caminata en tijera; la cabeza de perfil en la
articulación y `flip`; `at` devuelve la parte donde se cortó; una parte sigue
a su articulación entre poses; delante/detrás/`depth` por vista; `outlined`;
`replaces`, `anims` y `frames`; `views`; `run` (seis cuadros más rápidos, zancada ≥ 1,4×, torso ≥ 6°, pies que cambian y vuelan, brazos más altos y de frente contrapuestos, `run_stride`/`run_lean` sin tocar la caminata, `sway` estirado a seis cuadros, el bastón apoyado más tiempo); el pestañeo (sólo cambia una franja de ojos,
cuadro por cuadro de idle y walk, lleva las partes de idle y el `sway`, usa
`_blink` y cae a `_shut`, sigue la `stance`); `kneel` (más bajo que parado, ojos abiertos, respira; de frente se lee de rodillas: torso < 15°, cabeza ≥ 0,8 del `idle`, una rodilla a ras y la otra levantada afuera con la mano encima); `eat` (la sentada con los ojos abiertos, las manos al pecho y después hacia la boca, la cadera donde la de `sit`); `hammer` (el puño sube a la cabeza y baja adelante a la altura del hombro, el brazo horizontal de perfil, con los pies quietos); el cuerpo viejo (el eje cabeza–cadera de perfil 8° o más que el de un adulto con la cabeza igual de alta; 3 a 4 px más bajo por las piernas con las suelas en su fila y la cadera bajando lo mismo que la coronilla; el bastón quieto parado, apoyado en los contactos y 2 px arriba en los pasos, y la mano libre que sí se mueve; `reach` adelante; `cover_hands` sin piel en los brazos y `rolled` con más); `sway` (corrida a destiempo, quieto intacto,
espejo, `null`); la cara del rig de perfil; las poses de pelea de `upright`;
misma receta, mismos píxeles; por capas (cada píxel en una sola capa y la
fundida igual en las cuatro vistas, la vincha con el pelo y el iris con la
cara, la capa de un adorno, el aura, el orden de apilado, el material, y la
hoja rearmada desde los índices y las rampas igual a la fundida).
`src/headless/figureTurn.test.ts`: las diagonales (el giro de la cabeza: igual
de ancha y con su tinta, el ojo de adelante entero y el de atrás angosto, la
oreja del perfil atrás y nunca su ojo, sólo colores de los dos dibujos, el espejo,
de espaldas sin ojos; las cuatro vistas a 45° de sus vecinas; todo el contrato en
diagonal; la cabeza dibujada para la diagonal gana; las cuatro de hoy iguales;
`keep` desde la vista que mira y nunca del perfil una parte de la cabeza; la parte
que flota se corre hasta tocar; `wrap`; las capas devuelven el cuadro;
`directional8`).
