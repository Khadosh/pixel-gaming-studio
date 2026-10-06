# Poblar una escena: la biblioteca de objetos

*Diseño. 6 de octubre de 2026. Escrito antes del código.*

## De dónde sale esto

La referencia que fijamos como meta (`docs/referencia/secta_en_pixel.webp` en el
repo del juego) tiene una propiedad que conviene mirar de cerca: **sus edificios
son más simples que los de la ilustración pintada, y la foto funciona igual.**

Lo que la sostiene son los puestos del mercado con sus toldos, los faroles, los
barriles, las cercas, los farolillos de piedra, el bonsái del centro, la
variedad de verdes. Son objetos chicos, muchos, bien puestos.

Conclusión incómoda y útil: **el vocabulario de objetos no es el paso previo al
arte bueno. Es el arte bueno.**

## Qué hay hoy, en concreto

Miré el pipeline antes de escribir esto, porque la intuición decía otra cosa.

**El suelo está muy bien resuelto.** 91 pasos de mapa pintan materiales con
tonos, ruido suave en los bordes para que no escalonen, profundidad por
distancia a la orilla, espuma, flecos sobre la línea de agua, sombras, rampas de
banco. Eso ya tiene calidad de referencia.

**Los objetos chicos existen a medias.** El paso `scatter` sabe colocar matas,
flores, piedritas, rocío, hojas y cantos rodados, y tiene las reglas de
colocación que hacen falta: sobre qué materiales, cerca de qué, a cuántos
píxeles de separación, cuántos intentos, o en lugares fijos. Y con
`what: "stamp"` acepta **un dibujo cualquiera**… pasado como filas de glifos
**dentro de la receta**.

**Y ahí está el agujero.** Un objeto dibujado para un mapa vive incrustado en el
JSON de ese mapa. No tiene nombre, no se puede reusar en otra escena, no se abre
en el editor, no se retoca, no pasa por el lint de paleta. Es exactamente lo
mismo que les pasaba a los iconos de la app antes de esta semana: píxeles
escritos a mano adentro de un archivo que no es un dibujo.

**El amoblado tampoco es de PGS.** El paso `furnish` pinta la alfombra y la
sombra **debajo** de piezas que ya existen: las coloca el juego en su propio
JSON de mapa, y la receta sólo conoce sus prefijos para ponerles sombra. O sea
que hoy la decisión de qué va dónde vive del lado del juego, y PGS pinta el
piso.

## La idea

**Un objeto es un asset. Una escena es una colocación de assets.**

### 1. La biblioteca

Un objeto es un dibujo normal de PGS —se abre en el editor, se retoca, entra en
la paleta del proyecto, lleva `generated_by` si lo generó una receta— más tres
cosas que un dibujo suelto no tiene:

- **`anchor`**: qué píxel del dibujo apoya en el suelo. Sin esto, un farol
  puesto en una celda queda flotando o enterrado, y es el error que más se nota.
- **`footprint`**: cuántas celdas ocupa y cuáles bloquean el paso. Lo necesita
  el juego, no el dibujo.
- **`tags`**: `farol`, `mercado`, `madera`, `interior`. Es lo que permite pedir
  «faroles» sin nombrarlos uno por uno.

Viven en el proyecto, como los iconos: una carpeta de dibujos y nada más.

### 2. La colocación

Las reglas ya están probadas en `scatter`: sobre qué material, cerca de qué, con
cuánta separación, cuántos, o en lugares fijos, y todo determinístico por
semilla. Lo que cambia es **a qué se las aplicás**: hoy a una lista cerrada de
cosas que el código sabe dibujar; mañana a cualquier objeto de la biblioteca,
por nombre o por etiqueta.

«Faroles a lo largo de este camino, cada cinco celdas, alternando el lado» tiene
que ser una línea de receta, no un dibujo nuevo.

### 3. Las dos colocaciones conviven

La colocación por regla **no reemplaza** la autoral. Lo que el juego pone a mano
en su JSON de mapa —la forja acá, la estela allá— sigue siendo del juego y es lo
correcto: son decisiones de diseño, no de densidad. La regla es para las
cuarenta cosas que no se deciden una por una.

## Lo que esto NO resuelve, y hay que decirlo

**La composición.** La referencia tiene una plaza en el centro, caminos que
llevan el ojo, siluetas variadas contra el borde del acantilado. Eso no sale de
una regla de colocación: sale de que alguien decidió dónde va cada cosa.

Colocar por regla da **verosímil**, no **compuesto**. Y está bien que así sea:
la composición es una decisión, y lo que la biblioteca hace es que ejecutarla
sea barato. El que decide puede ser un agente mirando el resultado, que para eso
está la hoja de contacto; lo que no puede es salir de la nada.

## Por qué esto ahora

1. Es lo de mayor rendimiento hacia la referencia, y lo medimos: treinta objetos
   chicos cambian más una escena que diez edificios.
2. Reusa lo que ya funciona —las reglas de `scatter`, el formato de dibujo, la
   capa de retoque— en vez de inventar un sistema nuevo.
3. Es la primera cosa que el archivo de proyecto tiene que poder describir de
   verdad: un objeto fuera de la paleta del proyecto es el caso más claro de
   «esto está fuera de estilo», y hoy no hay dónde revisarlo.

## Lo que falta decidir antes de escribir código

- **Dónde vive el `anchor`**: ¿una cabecera más del formato de texto, como
  `retouch_of:`, o un archivo al lado? La cabecera es más simple y sigue la
  línea de lo que ya hicimos.
- **Cómo se nombra un grupo**: etiquetas libres o una lista cerrada por
  proyecto. Las libres son cómodas y se desordenan; la cerrada la declara el
  `pgs.json` y el lint la revisa.
- **Si la biblioteca es del proyecto o del motor.** Mi voto: **del proyecto**,
  con ejemplos en PGS. Una colección de objetos adentro del motor es justo lo
  que Joaquín dijo que no quiere («PGS tiene que ser un motor de creación, no
  una colección de assets»), salvo como ejemplo que enseñe a hacer el propio.

Relacionado: el issue #1 de PGS (los 91 pasos de mapa salen del catálogo del MCP
y el destino es generar mapas inteligentemente). Esto es la parte de «generar
inteligentemente»; aquello es la del catálogo.
