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

`heading` acepta un número o uno por vista: `{ "front": 90, "back": -90 }` es un
sprite de mapa visto de frente, derecho. `elevation: 0` mira a nivel (el perfil
dibujado, sin ver la coronilla). `shift: { "side": [1, 0] }` corre la figura en
el lienzo en esa vista (un perfil con la espada saliendo atrás va un px
adelante); `side_left` toma el de `side` espejado.

`side_left` es una cámara de verdad, del otro lado: el brazo y la pierna de
adelante son los izquierdos y la luz sigue arriba a la izquierda. Lo dibujado
de `side` (cabeza, partes) se espeja solo si `side_left` no trae lo suyo. Con
un cuerpo simétrico, todo lo que está arriba de la cadera es el espejo exacto.

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
  pide un sprite de mapa, y lo que se lee de perfil. `technique` es el mismo
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
  paso cambia en 0 y 2 y la parte contesta uno después. Fuera de `anims` (la
  caminata por defecto) no se mueve: el quieto es el dibujo. En `side_left`, un
  `dx` prestado de `side` o del attachment va al revés. 1 px a 2× son 2 en
  pantalla: sutil.

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
- `cane: { hand: "left", reach: [3.5, 1.5, 1.5], lift: 2.4, ahead: 1.6 }`: esa
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

## Tests

`src/headless/figure.test.ts`: la vista `side` y su espejo; más angosto de
perfil que de frente y una caminata en tijera; la cabeza de perfil en la
articulación y `flip`; `at` devuelve la parte donde se cortó; una parte sigue
a su articulación entre poses; delante/detrás/`depth` por vista; `outlined`;
`replaces` y `anims`; `views`; el pestañeo (sólo cambia una franja de ojos,
cuadro por cuadro de idle y walk, lleva las partes de idle y el `sway`, usa
`_blink` y cae a `_shut`, sigue la `stance`); `kneel` (más bajo que parado, ojos abiertos, respira; de frente se lee de rodillas: torso < 15°, cabeza ≥ 0,8 del `idle`, una rodilla a ras y la otra levantada afuera con la mano encima); el cuerpo viejo (el eje cabeza–cadera de perfil 8° o más que el de un adulto con la cabeza igual de alta; 3 a 4 px más bajo por las piernas con las suelas en su fila y la cadera bajando lo mismo que la coronilla; el bastón quieto parado, apoyado en los contactos y 2 px arriba en los pasos, y la mano libre que sí se mueve; `reach` adelante; `cover_hands` sin piel en los brazos y `rolled` con más); `sway` (corrida a destiempo, quieto intacto,
espejo, `null`); la cara del rig de perfil; las poses de pelea de `upright`;
misma receta, mismos píxeles.
