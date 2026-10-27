# El rig voxel: un esqueleto para los modelos voxel

`src/headless/voxelrig.ts` (puro), Khadosh/pixel-gaming-studio#60. Es `figure`
pasado a 3D: un modelo voxel dice su esqueleto (`rig`) y su pose (`pose`) o su
animación (`animation`), el rig acomoda las cajas en esa postura y después se
dibuja como cualquier modelo (`rotate`, `frames`, capas, luz, sombras). Una pose
nueva o una animación nueva es un JSON, no un dibujo.

Antes, cada pose de las personitas del estudio era cajas escritas a mano por
`armar_persona.py` (`base` + `changes`): no se podía pedir «levantá el brazo
45°» sin dibujar. Lo que ese script hacía con los brazos y las piernas
(`miembro()`: una sección barrida por los tramos) ahora lo hace el motor, igual
celda por celda.

## El rig

Un `.rig.json` al lado del modelo (o el objeto adentro, en `rig`):

```json
{
  "joints": {
    "cadera": { "at": [24, 24, 22] },
    "cuello": { "parent": "cadera", "at": [0, 0, 14] }
  },
  "follow": { "torso": "cadera", "cabeza": "cuello" },
  "spine": ["cadera", "cuello"],
  "limbs": {
    "brazo_d": {
      "from": "cuello", "at": [9, 0, 0], "group": "brazo_d",
      "bones": [6, 8], "section": [4, 4], "side": 1,
      "bands": [{ "to": 2, "material": "raya" }, { "to": 6, "material": "ropa" }, { "material": "piel" }],
      "top": 2, "cut": 1,
      "limits": { "swing": [-90, 180], "spread": [-20, 180], "bend": [0, 150] }
    }
  },
  "poses": { "saluda": { "brazo_d": { "swing": [0, 0], "spread": [160, -20] } } },
  "animations": { "saluda": { "frames": 4, "fps": 6, "keys": { "0": "parada", "2": "saluda" } } }
}
```

- **`joints`**: la raíz dice dónde está en el modelo; las demás, dónde están
  desde su `parent`, en reposo. Mover una articulación mueve a sus hijas.
- **`follow`**: los grupos de cajas del modelo que no se doblan (el torso, la
  cabeza, lo que se lleva) y la articulación que siguen. Se corren enteros, con
  sus formas redondas y sus dibujos; nunca se giran celda por celda.
- **`limbs`**: un miembro es una cadena de huesos (`bones`, los largos de la
  raíz a la punta) que cuelga de una articulación (`from`, con su raíz en `at`:
  el medio de la sección arriba). Se dibuja barriendo su sección (`section`:
  ancho en x, fondo en y) cada cuarto de unidad; donde el hueso se acuesta, la
  sección engorda en alto para no quedar una lámina. Sus celdas van al grupo
  `group`, y las cajas del modelo de ese grupo no se usan: el miembro lo dibuja
  el rig. `bands`: el material por largo recorrido desde la raíz (la manga, la
  piel). `end`: una caja en la punta (el pie), desde el punto final, x desde la
  primera columna de la sección. `top`: donde el hueso va por debajo, su grosor
  no pasa de esa altura sobre la raíz (el hombro no asoma sobre el torso; un
  brazo levantado sí sube). `cut`: las filas justo debajo de la raíz que no se
  pintan (el hombro caído). `under`: grupos que no pisa (la pollera sobre las
  piernas). `side`: −1 si está del lado −x, 1 del +x (hacia dónde es «afuera»).
- **`spine`**: las dos articulaciones entre las que se inclina el torso.

## La pose

Por miembro, una de tres formas:

- **`swing`** (y **`spread`**): un ángulo por hueso, en grados. El primero desde
  colgando derecho, cada uno de los siguientes desde el hueso de antes; `swing`
  es hacia adelante (+) o atrás, `spread` hacia afuera de su lado.
- **`reach`**: el punto `[x, y, z]` del modelo donde va la punta («la mano sobre
  la tecla», «el pie en el piso»). Para dos huesos; el codo dobla para el lado
  que permiten los límites.
- **`through`**: los puntos de la cadena, uno por hueso. Sirve para calcar una
  pose dibujada; con `stretch` la pose dice que estira los huesos a propósito.

Además: una articulación con `[x, y, z]` se mueve tanto (`"cadera": [0, 0, 1]`,
el saltito del paso); `tilt` inclina el torso una unidad cada `every` de alto
(`max`, `back`): lo que cuelga de la articulación de arriba de la columna va
entero, lo de la de abajo (las piernas) queda. `from` arma una pose desde otra
(`{"from": "camina_1", "brazo_d": {…}}`). Lo que la pose no nombra queda en
reposo: los miembros colgando derecho.

## Límites

Por miembro, en grados: `swing` y `spread` del primer hueso, `bend` de cada
articulación siguiente (un codo `[0, 150]`: no dobla al revés; una rodilla
`[-150, 5]`). Con `through`, cada hueso puede diferir de su largo hasta
`stretch` (del miembro, por defecto 1, o de la pose). Una pose afuera se rechaza
diciendo todos los problemas juntos, con el miembro y el ángulo:
`brazo_d: bend -40° is under 0°`. Un `reach` que no llega dice cuánto le falta.

## La animación

`frames`, `fps`, `keys` (las poses clave por cuadro, desde 0: una pose o su
nombre) y `loop` (por defecto sí: después de la última vuelve a la primera).
Un cuadro clave es su pose tal cual; entre dos, cada miembro pasa por los
ángulos de entre medio (y los huesos con el largo de entre medio), así un brazo
doblado sigue siendo brazo en el camino; las articulaciones se mueven en
unidades enteras; la inclinación es la de la clave de antes.

## En el modelo y en el comando

```json
{ "id": "tomas_camina", "base": "persona_parada_yp.voxel.json", "rig": "persona.rig.json", "animation": "camina" }
```

`bin/pgs voxel model=tomas_camina.voxel.json out=… png=… layers=true` dibuja la
tira de cuadros (como `frames=`), con el `fps` de la animación si no se le pasa
otro. Con `pose` es un solo dibujo. `rig`, `pose` y `animation` se heredan de la
`base` como lo demás, así que una pose es una línea: `{"base": "tomas.voxel.json",
"pose": "senala"}`. Un modelo puesto con `place` puede tener pose, no animación.
`rotate` gira la figura ya posada: las ocho vistas salen del mismo modelo.

## Lo que se midió

`voxelrig.test.ts`, con Tomás del estudio (`src/headless/fixtures/rig/`):
`parada`, `camina` ×4 y `corre` ×4 salen del rig iguales a las dibujadas, celda
por celda y píxel por píxel, también girado. Las poses que el script escribía
con cajas sueltas (`teclea`, `sentada`, `mano_parada`, `dibuja`, `lleva`) salen
por datos y van a la lámina, `docs/rig/lamina.png`
(`npx tsx scripts/rig-lamina.ts`), al lado de las dibujadas.

Lo que la lámina deja ver: **las poses dibujadas a mano estiran los huesos**.
La carrera acorta la pantorrilla casi 3 unidades; sentada, la pierna mide 28 en
vez de 20 (la silla del estudio pone la cadera a 22 para todos); al teclear
sentado el antebrazo llega a 20 cuando mide 8; con la mano levantada el brazo
pasa la cabeza porque mide 22 en vez de 14. El rig lo puede calcar (`through` +
`stretch`, «RIG CALCO»), o dibujar con los huesos de verdad («RIG HUESOS»): los
pies no llegan al piso y la mano levantada queda al lado de la cabeza.

Lo que todavía no hace: bandas de material por altura (botas, medias a rayas),
un miembro de más de dos huesos con `reach`, girar la cabeza por
pose (sigue siendo `turn` de `changes`) y el `recostar` de los sillones (lleva
también los brazos en escalera).
