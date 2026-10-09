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
  pide un sprite de mapa, y lo que se lee de perfil. `attack`, `technique`,
  `hurt` y `die` son los mismos en las dos.

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

## Tests

`src/headless/figure.test.ts`: la vista `side` y su espejo; más angosto de
perfil que de frente y una caminata en tijera; la cabeza de perfil en la
articulación y `flip`; `at` devuelve la parte donde se cortó; una parte sigue
a su articulación entre poses; delante/detrás/`depth` por vista; `outlined`;
`replaces` y `anims`; `views`; misma receta, mismos píxeles.
