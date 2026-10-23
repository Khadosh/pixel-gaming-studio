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

La semilla no es estructura: `seed=` la cambia; las `salt` de cada paso quedan.

**Qué declara cada paso:** sólo qué campos son posiciones y de qué forma
(`TRANSPLANT` en `src/headless/maptransplant.ts`). Hoy: los pasos de las raíces
y de la orilla y los del núcleo que usan. Un paso sin declarar pasa tal cual y
la respuesta lo avisa.

## Cuánto acierta (medido contra el hermano real)

| trasplante | copia tal cual | trasplante | techo |
|---|---|---|---|
| raíces agua → boca (píxeles) | 27,8 % | **0,38 %** | lo que queda es la escalera de raíces, que sólo tiene la boca |
| raíces agua → nicho (píxeles) | 27,4 % | **0,41 %** | la formación, sólo del nicho |
| embarcadero → otra orilla (materiales) | 62,8 % | **19,4 %** | 11,3 % es el estanque, la acequia y las lajas, que sólo tiene la otra orilla |

En la orilla se mide el **mapa de materiales** (qué material quedó en cada
píxel), no los colores: cada paso tiene su `salt` y los hermanos no comparten
ninguna, así que dos orillas iguales de forma difieren en casi todo píxel.

Lámina: `docs/diseno/maquetas/trasplante/lamina.png` (arriba embarcadero →
trasplante → otra orilla real; abajo agua → trasplante → boca real).

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
- **La cumbre todavía no**: sus riscos son masas puestas a mano y sus pasos no
  declaran posiciones. Va con su familia.
