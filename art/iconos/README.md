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
npm run icons:hoja   # la hoja de contacto de todos juntos
```

**El dibujo es la verdad**, `src/lib/icons/generated.ts` es derivado: se
regenera, no se edita. El componente de React no tiene píxeles adentro; cada
icono es una línea que apunta a su grilla.

Para cambiar un icono: se toca su `.txt` (a mano o en el editor) y se corre
`npm run icons`. Para agregar uno: un `.txt` más acá, una línea más en
`PixelIcon.tsx`.

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

## El control

`src/lib/icons/icons.test.ts` tiene, celda por celda, lo que dibujaban los
trazos de antes (`fixtures/trazos-previos.json`, con un `9` donde estaba el
agujero pintado) y exige que lo que sale hoy sea lo mismo. La única diferencia
permitida es que esos `9` queden vacíos. Pasó para los 61.

## Lo que falta

El arte. La conversión no cambió un píxel a propósito, así que los problemas de
dibujo siguen todos ahí: `bone` no se lee como un hueso, `arrow_left` perdió la
flecha, `sword` parece un tilde con un palo, `hard_drive` es una mancha. La hoja
de contacto (`hoja_de_contacto.png`) es para eso.

Y lo que la conversión sí se llevó puesto: los trazos de antes apilaban capas
semitransparentes con `opacity` sobre el base, y una grilla tiene **un color por
píxel**. Donde había un brillo encima del cuerpo ahora hay un píxel `claro`
solo, que es más débil. Se nota en `sun`, `settings`, `package`, `hard_drive`,
`image`, `sword` y `edit`. Es la misma tanda de arte: lo que ahí hace falta es
elegir colores de papel que se lean solos, no volver a apilar capas — porque lo
que muestra el editor tiene que ser lo que muestra la app.
