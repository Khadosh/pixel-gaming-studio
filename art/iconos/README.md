# Los iconos de la app

Un icono es un asset. Estos 63 son dibujos de PGS: un archivo de texto por
icono, en el formato de `src/headless/ascii.ts`, que se abre en el editor
(`/dibujo`), se retoca y se guarda como cualquier otro dibujo.

Antes no era así. Los 61 que había estaban escritos a mano en TypeScript, en dos
formatos: 14 como matrices de números en `src/lib/icons/iconRegistry.ts` y 47
como trazos SVG tipeados en `src/components/icons/PixelIcon.tsx`
(`<path d="M3 2h10v2H3V2z" />`, 640 líneas). No se abrían en el editor, no
tenían paleta, no pasaban por el lint. PGS existe para no escribir píxeles a
mano y los suyos propios estaban escritos a mano.

## Cómo se usa

```bash
npm run icons        # art/iconos/*.txt → src/lib/icons/generated.ts
npm run icons:hoja   # las dos hojas de contacto: hoja_de_contacto.png y hoja_1x.png
```

**El dibujo es la verdad**, `src/lib/icons/generated.ts` es derivado: se
regenera, no se edita. El componente de React no tiene píxeles adentro; cada
icono es una línea que apunta a su grilla.

Para cambiar un icono: se toca su `.txt` (a mano o en el editor) y se corre
`npm run icons`. Para agregar uno: un `.txt` más acá, una línea más en
`PixelIcon.tsx`.

## La regla

Esto es lo que hace que los 63 parezcan un juego y no una colecta. Son cuatro
cosas y `src/lib/icons/icons.test.ts` las verifica una por una, así que un icono
nuevo que las rompa no entra.

1. **Margen de 1 px en los cuatro bordes.** El dibujo vive en el cuadrado de
   14×14 entre (1,1) y (14,14). Nada toca el borde: en una barra, el icono que
   lo toca se ve un punto más grande que sus vecinos.
2. **Trazo de 2 px.** Horizontales, verticales y diagonales. Un trazo de 1 px a
   16 px parpadea y desaparece contra el fondo. De ahí sale el control mecánico:
   **ningún píxel suelto**, todo pintado tiene un vecino pintado arriba, abajo o
   al lado.
3. **Tinta entre 28 y 100 píxeles.** Antes iba de 16 (`chevron_down`) a 196
   (`film`): en una barra unos pesaban doce veces lo que otros. Los de puro
   trazo (`minus`, los `chevron`, `check`) quedan en el piso y los que son una
   masa (`info`, `grid`, `play`) en el techo. La mediana es 64.
4. **Se distingue por silueta, no por detalle.** A 16 px el detalle interno no
   existe. Dos iconos cualesquiera tienen que diferir en **18 celdas o más**;
   la única excepción declarada es `undo`/`redo`, que son el mismo dibujo
   espejado y ahí lo que cambia es la dirección.

El techo y el piso salen de la regla 2, no al revés: con 2 px de trazo y 1 px de
margen, un contorno pesa ~60 y una masa ~90. **Si un icono no llega al piso, se
alarga el trazo; si pasa el techo, se vacía** — una forma que encierra algo se
dibuja con el contorno y el hueco transparente, no rellena. Lleno sólo lo que es
una masa de verdad: `play`, `pause`, `user`, `bone`, `sword`, `sparkles`.

### La silueta se dibuja con `base`

Los papeles semitransparentes **no dibujan silueta**. Es la lección de esta
tanda: `claro` (`#ffffff40`) sobre el fondo de la app (`#131318`) da un gris de
luminancia 78 contra 215 del `base`, un cuarto de la fuerza; y sobre el `base`
da 225 contra 215, invisible. Los oscuros, al revés: sobre el fondo casi negro
no se ven, y sobre el `base` sí. O sea:

- lo que define la forma va en **`base`**, siempre;
- `oscuro` y `negro` sólo sirven **adentro de una masa de `base`**, como una
  ranura o una sombra, y a 16 px ninguno de estos 63 tiene masa para eso;
- `claro` sólo sobre `negro`/`oscuro`, nunca sobre el fondo ni sobre el `base`.

Por eso los 63 están dibujados con un solo papel. Los brillos que la conversión
dejó sueltos (en `sun`, `settings`, `package`, `hard_drive`, `image`, `sword`,
`edit`) no se arreglaron con otro color: eran capas de `opacity` apiladas que a
este tamaño no tenían cómo leerse, y se fueron con el rediseño.

## El control: a 1×, no a 6×

La trampa de este set es que **todo se ve bien al 6×**. `npm run icons:hoja`
saca por eso dos hojas:

| archivo | para qué |
|:--|:--|
| `hoja_de_contacto.png` (6×) | ver qué quiso dibujar cada icono y retocarlo |
| `hoja_1x.png` (1×) | **la condición real**: los 63 a 16 px, pegados |

Un icono se aprueba mirando la de 1×, y después en el navegador: `npm run dev` y
`/icon-preview`, que los lista a todos en la app. Un icono se juzga en la barra
donde vive, no en una grilla ampliada. Antes y después, a 1×, para cada uno que
se toque.

## Los cinco papeles

Todos los dibujos declaran la misma paleta, en el mismo orden, y cada color
dice qué papel es. El generador resuelve el papel **por el nombre**, así que
reordenar la paleta en el editor no rompe nada.

| glifo | color       | papel    | variable CSS     |
|:-----:|:------------|:---------|:-----------------|
| `b`   | `#d7dbd7`   | `base`   | `--px-base` = `currentColor` |
| `c`   | `#ffffff40` | `claro`  | `--px-light`     |
| `o`   | `#00000040` | `oscuro` | `--px-dark`      |
| `n`   | `#00000066` | `negro`  | `--px-black`     |
| `a`   | `#ffffff`   | `acento` | `--px-accent`    |

El `#d7dbd7` del `base` es el color de texto de la app (`--foreground`), puesto
ahí para que el editor muestre el icono como se ve en pantalla. En la app el
base es `currentColor`: **el icono toma el color del texto donde está**, y eso
no cambió con la conversión.

## Nítidos, aunque la fuente sea una grilla

`matrixToSvgPaths` pasa la grilla a trazos SVG, uno por papel, y el componente
dibuja esos trazos. O sea: la fuente de verdad es un dibujo de 16×16 píxeles y
lo que se dibuja sigue siendo vectorial, nítido a cualquier tamaño. No hay PNG
en el medio.

## Los siete agujeros

`tag`, `eye_off`, `trash`, `folder`, `grid`, `clock` y `x_circle` no tenían el
hueco transparente: lo tenían **pintado** con `fill="var(--background, #000)"`.
Sobre cualquier fondo que no fuera exactamente ese — un botón resaltado, una
fila seleccionada, un tema claro — el agujero salía como un bloque del color
equivocado. Al convertirlos el agujero pasó a ser transparencia de verdad.
Ninguno de los siete quedó irreconocible.

## Lo que sostiene esto

`src/lib/icons/icons.test.ts` tiene dos controles distintos y conviene no
confundirlos.

**El de la conversión.** `fixtures/trazos-previos.json` guarda, celda por celda,
lo que dibujaban los trazos SVG de antes (con un `9` donde estaba el agujero
pintado). Ese fixture **no se actualiza**: es el registro de lo que había.

**El del arte.** La tanda de arte rehizo el dibujo de 60 de los 61 — se leían
mal (`bone` parecía una copa de martini, `arrow_left` había perdido la punta),
eran cinco veces el mismo palo diagonal (`pencil`, `eraser`, `edit`, `line`,
`eye_off`) o no entraban en la regla de peso. Los 60 están declarados en la
lista `REDIBUJADOS` del test, con el motivo. `user` es el único que quedó igual:
ya cumplía. Lo que no está en esa lista tiene que seguir dibujando exactamente
lo de antes, y lo que está en la lista tiene que haber cambiado de verdad. **Un
icono no puede cambiar sin que alguien lo haya decidido y anotado.**

Y arriba de eso, los cuatro controles de la regla: margen, tinta, nada de
píxeles sueltos y 18 celdas de diferencia entre dos iconos cualesquiera.

## Lo que sigue sin convencer

- `undo` y `redo` se diferencian en 12 celdas porque son el mismo dibujo
  espejado. Es la excepción declarada; si alguna vez molesta, hay que cambiarle
  la forma a uno de los dos, no aflojar el número.
- `clock`, `info` y `x_circle` son los tres un anillo con una marca adentro y
  quedan en 22 celdas de diferencia. Es la convención (en lucide pasa lo mismo)
  y a 16 px no hay mucho más margen; lo que los separa en la práctica es dónde
  aparecen.
- `palette` es un óvalo con cuatro manchas: con tres parecía una cara. Funciona,
  pero es el que menos se lee solo de todo el set.
