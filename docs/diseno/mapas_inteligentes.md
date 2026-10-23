# Crear mapas con inteligencia: qué quiere decir

*Diseño. 23 de octubre de 2026. Escrito antes del código, como pide #1.*

Joaquín, 6 oct, en Khadosh/pixel-gaming-studio#1: «SI, necesitamos la capacidad
de ser inteligentes a la hora de crear mapas, esto va a ser grande pero creo que
un big win». Eligió que los pasos de escena dejen de ser una colección y pasen a
ser **semilla para generar mapas nuevos**. El primer paso ya está: los pasos de
escena salieron del catálogo del MCP (#19) y viven como ejemplos, por familia
(`docs/mapas/escenas.md`). Lo que falta decidir es la dirección.

## Lo que dicen las recetas que ya existen

Las 17 recetas reales del juego (`src/headless/fixtures/mapas/`):

- **La unidad es el lugar, no el paso.** De 85 pasos de escena, 57 los usa una
  sola receta; los demás los comparten mapas hermanos del mismo lugar. Sólo
  cuatro (`network`, `feature`, `cast`, `lines`) cruzan lugares.
- **El juego ya generó mapas desde ejemplos, a mano, tres veces.** La cumbre
  alta salió de la cumbre, la otra orilla del embarcadero, dos raíces del pino
  de la primera. Es el caso de uso, y ya tiene un control: el mapa hermano real.
- **Los hermanos comparten la estructura, no los números.**

  | hermanos | pasos | mismos pasos (tipo + id) | idénticos | materiales idénticos |
  |---|---|---|---|---|
  | cumbre → cumbre alta | 23 / 22 | 16 | 0 | 4 de 8 |
  | embarcadero → otra orilla | 17 / 20 | 15 | 1 | 7 de 9 |
  | raíces agua → boca | 6 / 6 | 5 | 3 | 4 de 4 |
  | raíces agua → nicho | 6 / 6 | 5 | 4 | 4 de 4 |

  Las raíces se copian casi tal cual porque sus pasos **leen la grilla** del
  juego (las paredes como roca, la cara donde da al piso). La cumbre no, porque
  sus pasos **llevan coordenadas** (cada risco es una masa en celdas puesta a
  mano para ese mapa). Lo que separa un paso trasplantable de uno que no lo es
  no es el lugar: es si lee la grilla o trae posiciones.

## Tres lecturas de «inteligente»

### A. Variaciones de una escena

Una receta y pedirle otra: otra semilla, otra estación, otro estado.
**Costo:** chico; la semilla y las variantes (`variants`, puerta abierta y
cerrada) ya existen. **Da:** el mismo lugar con otra cara. **No da:** un mapa
nuevo; el mapa del juego es el mismo. Es lo que menos se acerca a «generar».

### B. Trasplante: una familia sobre un mapa nuevo *(recomendada)*

Dar la receta de un lugar y el mapa de juego **nuevo** (su grilla, paredes,
salidas, adornos) y que PGS escriba la receta del mapa nuevo: lo que lee la
grilla pasa tal cual, lo que trae posiciones se vuelve a poner con una regla
(relativo a una pared, a una salida, a un material, por densidad en una
máscara), y lo que no pudo poner lo dice, en vez de inventarlo.
**Costo:** grande. Un módulo puro (`maptransplant.ts`), un comando
(`map_transplant`, uno más en el núcleo: ~1–2 KB de catálogo) y, sobre todo,
que cada paso declare cuáles de sus campos son posiciones y con qué regla se
re-ponen: 85 esquemas. Se hace por familia, empezando por las raíces (casi
gratis: ya leen la grilla) y la orilla. **Da:** un mapa nuevo de un lugar que
ya existe, en una llamada, y **se mide**: trasplantar la cumbre sobre la grilla
de la cumbre alta y comparar con la cumbre alta real (`map_compare`), lo mismo
con las orillas y las raíces. Es la única de las tres con un control que no
dependa de que a alguien le guste. Y lo que obliga a hacer (que un paso diga
qué es posición) es lo mismo que haría falta para destilar un paso de escena
en uno del núcleo.

### C. Describir un lugar y que el motor componga los pasos

«Un muelle de pescadores al atardecer» → una receta. **Costo:** el más
incierto. Una regla del motor que elige pasos compite con el agente que ya los
elige (el patio salió así, 31 pasos del núcleo, sin ayuda del motor), y aprender
qué pasos van juntos de 17 recetas es una tabla que ya escribimos a mano: las
familias. **Da:** una primera receta para retocar. **Riesgo:** que el motor
decida el gusto, que es de Joaquín. Lo que sí vale de esta idea ya existe: el
agente pregunta `pgs help escenas`, ve qué lugar se parece y arranca de ahí,
que es B con un humano o un agente eligiendo la familia.

## Recomendación

**B, por familias, empezando por las raíces y midiendo contra el hermano real.**
Es la que convierte la colección en motor de verdad (el ejemplo sirve para un
mapa que no existía), es la que el juego ya hizo a mano tres veces, y la única
que se puede aceptar por medidas. A sale gratis de paso (un trasplante sobre la
misma grilla con otra semilla es una variación). C queda para después, si hace
falta: con B hecho, «describir un lugar» se reduce a elegir de qué familia
trasplantar, y eso un agente ya lo hace.

**Lo que no entra en ninguna:** volver a portar scripts de un juego paso por
paso. Un lugar nuevo de un juego nuevo se compone con el núcleo; un paso nuevo
entra al núcleo o a una familia (`docs/mapas/escenas.md`, «La regla»).

## Decidido (Joaquín, 23 oct): B

«B, el trasplante, empezando por las raíces y la orilla, que se miden contra su
hermano real». Hecho el primer tramo: `map_transplant`, con las medidas y lo que
no hace en `docs/mapas/trasplante.md`. Sigue la cumbre (sus riscos traen
posiciones a mano) y el resto de las familias, cada una con su hermano o su
mapa nuevo como control.

## Lo que se preguntó (Joaquín)

1. ¿B (trasplante), A (variaciones) o C (describir)? Recomendado: B.
2. Si B: ¿se arranca por las raíces y la orilla, que son los casos que se miden
   solos, o por un mapa nuevo concreto que el juego (o el patio) necesite ya?
