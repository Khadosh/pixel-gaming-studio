# El trasplante: la receta de un lugar sobre un mapa nuevo

*Khadosh/pixel-gaming-studio#1, opción B, elegida por Joaquín el 23 de octubre de 2026.*

El Dao hizo tres veces a mano un mapa nuevo copiando la receta de su hermano
(la cumbre alta desde la cumbre, la otra orilla desde el embarcadero, dos raíces
desde la primera). `map_transplant` lo hace en una llamada:

```bash
bin/pgs map_transplant recipe=fixtures/mapas/embarcadero.receta.json \
  game=fixtures/mapas/otra_orilla.json out=/tmp/otra.receta.json \
  ref=fixtures/mapas/otra_orilla.receta.json
```

Escribe la receta del mapa nuevo y contesta, paso por paso, qué pasó tal cual,
qué se movió (de dónde a dónde y anclado a qué), qué **no** se pudo poner y por
qué, y qué baldosas del mapa nuevo no las pinta ningún paso. Con `ref=` (la
receta real de ese mapa, si existe) mide cuánto difiere.

## La regla: anclar a lo que el mapa del juego dice que hay ahí

Lo que lee la grilla (la cueva, las raíces, la penumbra) pasa tal cual. Una
posición se lee en el mapa **de origen** (qué hay debajo) y se busca lo mismo en
el nuevo:

- **sobre una baldosa rara** (menos del 5 % del mapa: un muelle, el agua de la
  cueva) se mueve con ella, en el mismo lugar de su caja. Si el mapa nuevo no la
  tiene, el paso (o ese ítem de su lista) no se pone y se dice: «pool: the new
  map has no raices_agua».
- **junto a un decor o un landmark** que los dos mapas tienen una sola vez, se
  mueve con él.
- **sobre lo común** (piso, pared, pasto) queda si el mapa nuevo tiene lo mismo
  ahí; si no, va a la celda más cercana que lo tenga.
- **una fila o una columna sola** (la costa de un río) se ancla al borde de una
  **franja** (una baldosa que cubre más de la mitad de la fila) que existe en
  los dos. A menos de una celda del borde del mapa, o afuera, guarda su
  distancia a ese lado (el bosque que enmarca).
- **los puntos de una línea** (un sendero) mantienen su forma: el que no tiene
  nada propio debajo va con el punto más cercano de su línea que sí, y los que
  siguen a un tramo perdido se van con él.
- un paso que lee la máscara de otro que no se puso se va con él («floodwater:
  it reads estanque, not laid»).
- **las masas puestas a mano sobre una roca** (las de un `crag`: la cueva, el
  risco grande, cada piedra suelta) se mueven con su **grupo de paredes**: las
  paredes que se tocan, sin las que tienen un decor encima (los pinos). Una
  piedra suelta es un grupo de una celda; la roca de la cueva, uno de seis. Cada
  grupo sobre el que hay masas se empareja con el más parecido del mapa nuevo
  (forma y tamaño primero; la distancia, a medias: un hermano mueve sus rocas de
  lugar), **uno a uno** y buscando lo mejor en conjunto, no de a uno: si una
  piedra se queda con la única roca grande, el risco grande se queda sin nada.
  Las masas van al mismo lugar en la caja del grupo nuevo y se estiran con su
  **contorno** (hasta una vez y media), y la boca de la cueva y la grieta van con
  ellas. Perder una roca grande cuesta más que una piedra; una roca sin nada
  parecido no se pone y se dice. Las rocas del mapa nuevo que ninguna masa pisa
  se listan («rocks of the new map no mass of the recipe stands on»), para
  agregarles una piedra a mano: no se inventan.

La semilla no es estructura: `seed=` la cambia; las `salt` de cada paso quedan.

**Qué declara cada paso:** sólo qué campos son posiciones y de qué forma
(`TRANSPLANT` en `src/headless/maptransplant.ts`). Hoy: los pasos de las raíces,
de la orilla y de la cumbre, y los del núcleo que usan. Un paso sin declarar pasa tal cual y
la respuesta lo avisa.

## Cuánto acierta (medido contra el hermano real)

| trasplante | copia tal cual | trasplante | techo |
|---|---|---|---|
| raíces agua → boca (píxeles) | 27,8 % | **0,38 %** | lo que queda es la escalera de raíces, que sólo tiene la boca |
| raíces agua → nicho (píxeles) | 27,4 % | **0,41 %** | la formación, sólo del nicho |
| embarcadero → otra orilla (materiales) | 62,8 % | **19,4 %** | 11,3 % es el estanque, la acequia y las lajas, que sólo tiene la otra orilla |

En la cumbre no sirve medir píxeles contra el hermano: la cumbre alta es otra
receta (el risco a la derecha, una montaña en vez del bosque, lagunas, crestas
de lajas) y la copia y el trasplante difieren de ella en ~83 % igual. Lo que se
mide es **la roca sobre las paredes** del mapa del juego, que es lo que importa
jugando (que se vea sólido lo que choca), y no necesita hermano: el comando lo
contesta siempre que la receta tiene masas.

| trasplante (paredes con roca · roca fuera de paredes) | copia tal cual | trasplante | receta real |
|---|---|---|---|
| cumbre → cumbre alta | 19 % · 70 % | **48 % · 8 %** | 48 % · 3 % |
| cumbre alta → cumbre | 11 % · 61 % | **26 % · 16 %** | 36 % · 7 % |

Al revés falta la roca grande de la grieta: la cumbre alta no tiene ninguna
parecida, y queda en la lista de rocas sin masa.

En la orilla se mide el **mapa de materiales** (qué material quedó en cada
píxel), no los colores: cada paso tiene su `salt` y los hermanos no comparten
ninguna, así que dos orillas iguales de forma difieren en casi todo píxel.

Lámina: `docs/diseno/maquetas/trasplante/lamina.png` (arriba embarcadero →
trasplante → otra orilla real; abajo agua → trasplante → boca real). La de la
cumbre, `docs/diseno/maquetas/trasplante/cumbre.png` (copia tal cual →
trasplante → real, en los dos sentidos, con las paredes del juego marcadas en
rojo).

## Lo que no hace, y dice

- **No inventa lo que el origen no tiene.** La acequia y el estanque de la otra
  orilla no salen del embarcadero; la respuesta los lista como baldosas que
  nadie pinta, y se agregan con pasos del núcleo o de la familia.
- **No da vuelta la forma de un lugar.** La receta de la otra orilla pinta el río
  «desde el borde de arriba hasta la costa»; el embarcadero lo tiene en el
  medio. Trasplantada así sale peor que la copia (70 % contra 63 %), y la
  respuesta lo avisa: «shape.between [side, agua] covered mostly rio on the old
  map and covers mostly pasto on the new one». Se elige el hermano que se le
  parece.
- **No sabe de qué lado está el abismo.** El mapa del juego sólo dice dónde hay
  paredes: el risco y el mar de nubes quedan del lado de la receta (la cumbre
  alta los tiene del otro). Se cambia `side` a mano.
