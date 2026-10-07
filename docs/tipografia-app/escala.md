# La escala tipográfica de la app

Escrita **antes** de tocar un solo componente. Es el contrato: la app se dibuja
con **Nube 8**, la fuente que hace PGS, y Nube 8 tiene un solo tamaño verdadero
y sus múltiplos.

Aplicada en **toda la app**: editor, workspace, asistente de IA, catálogo,
ficha de asset, dashboard, login y portada. Press Start 2P ya no se carga.

## Por qué no es un cambio de fuente

Nube 8 se dibujó en una celda de 8 px: a `font-size: 8px` un píxel del dibujo es
un píxel de pantalla, a 16 es un cuadrado de 2 y a 24 uno de 3. **A 9, 10 u 11
px el navegador tiene que inventar**, y eso es exactamente lo que la app hacía
con Press Start 2P: de 351 tamaños explícitos, sólo 85 eran 8 px.

Así que no hay un «equivalente» de los 10 px de hoy. Hay 8 y hay 16. Adoptar la
regla es **rediseñar la densidad**, y la escala es la forma de hacerlo sin
decidir 189 veces lo mismo.

## Las medidas del dibujo

```
celda 8x11 · base 9 · línea 12 · espacio 3 · track 1
mayúsculas 6 filas · minúsculas 5 filas (altura de x) · colas 2 filas
avances: mayúsculas 6 · minúsculas 5 · dígitos 5 (todos iguales) · espacio 3
```

De ahí salen dos números que importan al comparar con lo que había:

| | mayúscula | ancho medio por carácter |
|:---|---:|---:|
| Press Start 2P a 10 px | 10 px | 10 px |
| Nube 8 a 8 px | 6 px | ~4,5 px |
| Nube 8 a 16 px | 12 px | ~9 px |

O sea: **a 16 px el texto ocupa casi lo mismo de ancho que los 10 px de hoy, y
es un 20 % más alto.** El riesgo del cambio es vertical, no horizontal: filas de
altura fija (`h-5`, `h-7`) y cajas de interlineado apretado.

## Los cuatro papeles

Tres cuerpos, porque la fuente tiene tres. Cuatro papeles, porque dos comparten
cuerpo y se distinguen por mayúsculas y color, no por tamaño. Eso **es** la
disciplina de una fuente de píxeles: no hay medio punto.

| papel | clase | cuerpo / línea | qué es | de dónde viene |
|:---|:---|:---|:---|:---|
| **etiqueta** | `.nube-etiqueta` | 8 / 12 | lo que se lee de reojo y nunca en voz alta: marcador de sección en mayúsculas, etiqueta de campo, número de cuadro, FPS, px, atajo, chip, aviso de ayuda | `text-[5px]` … `text-[9px]` |
| **cuerpo** | `.nube-cuerpo` | 16 / 24 | lo que se lee de verdad y se toca: botones, ítems de lista, nombres de color, de capa y de animación, valores editables, tooltips, errores | `text-[10px]` … `text-[12px]`, `text-xs`, `text-sm` |
| **título de panel** | `.nube-titulo` | 16 / 24 | el encabezado principal de un panel, uno por panel. Mismo cuerpo que el texto que encabeza: lo que lo separa es mayúsculas y color, no el tamaño | los `text-[10px] uppercase` de los encabezados |
| **título de página** | `.nube-pagina` | 24 / 36 | uno por pantalla, no más: el nombre del sprite en el encabezado | `text-[10px]` / `text-xs` del encabezado |

Variantes, para cuando una fila no da:

- `.nube-cuerpo-apretado` — cuerpo 16, línea **20**.
- `.nube-etiqueta-apretada` — cuerpo 8, línea **8**.

Tres cosas que la escala **no** adivinó y que las corrigió mirar la pantalla:

- **El aviso de ayuda es etiqueta, no cuerpo.** A 16 px, el recuadro de ayuda de
  FX ocupaba 280 px de alto y empujaba todos los controles abajo del pliegue. Es
  texto que se lee una vez: va a 8, que es lo que medía antes.
- **El título no lleva tracking.** 1 px por letra son 14 px en «ANATOMY ENGINE»,
  y ésos eran justo los que faltaban. El tracking queda para las etiquetas en
  mayúsculas, donde el ancho sobra.
- **Un control segmentado es un chip.** `auto / humanoid / custom` a 16 px no
  entra en 262 px y se trunca a «Hu…». Va a etiqueta.

## Las tres reglas que vienen con la escala

**1. El interlineado es 12 × escala, y si hay que apretarlo se resta un número
par.** La caja de contenido de Nube 8 mide exactamente la línea del dibujo (12 ·
escala), así que el medio-interlineado de `line-height: 12·escala` es cero. Con
una línea impar de diferencia el medio-interlineado cae en medio píxel y **todo
el renglón se dibuja corrido y borroso**. 24 → 20 está bien; 24 → 21 no.

**2. El tracking es en píxeles enteros o no es.** `tracking-widest` son 0,1 em:
1,6 px a cuerpo 16. Cada letra arranca en una fracción de píxel y la fila entera
se ensucia. Las clases traen `letter-spacing: 0`, y para el aire de un
encabezado en mayúsculas están `.nube-track-1` y `.nube-track-2` (1 px y 2 px).

**3. Una sola fuente por pantalla.** JetBrains Mono (`font-mono`) sale también
del editor: los dígitos de Nube 8 tienen todos el mismo avance (5), así que una
columna de números sigue alineada sin necesidad de una monoespaciada prestada.

## Lo que la escala arregla de paso

Press Start 2P **no tiene mayúsculas acentuadas**: en el panel de configuración
se leía `CATEGORíA` y `DESCRIPCIóN`, con la Í y la Ó cayendo a la fuente del
sistema. Nube 8 tiene `Á É Í Ó Ú Ñ` y las dibuja en la grilla.

## Los rediseños que pidió el resto de la app

Igual que en el editor, lo mecánico fue casi todo; lo que costó fue lo que no
entraba:

- **La tarjeta del catálogo.** El nombre compartía renglón con el chip de
  categoría y ya se truncaba a 10 px («TREASURE CHEST…»). A cuerpo 16 quedaba en
  «TREASURE C…». Ahora el chip va solo arriba y el nombre se queda con el ancho
  entero de la tarjeta, en dos renglones (`line-clamp-2`, caja fija de 48 px para
  que la fila de datos siga alineada entre tarjetas).
- **La etiqueta de fila del spritesheet** se dibuja en el `<canvas>`, no en
  HTML (`SpriteSheetCanvas`). Era `Press Start 2P` a 6 u 7 px según la escala;
  ahora es Nube 8 a **8 px fijos**: a 16 «ATTACK» mide 72 px y la columna de
  etiquetas tiene 44.
- **El aviso de «¿olvidaste tu contraseña?»** comparte renglón con la etiqueta
  del campo. Los dos a cuerpo 16 no entran en los 384 px de la tarjeta de login:
  los dos son etiqueta.
- **El título de la portada** era `text-7xl` (72 px). Ver abajo.

## Lo que queda abierto

**El techo de 24 px le queda chico a la portada y al login** (issue #7). El
título de la portada pasó de 72 px a 24 y ahora mide casi lo mismo que el
párrafo que lo acompaña: la jerarquía quedó plana. Se le puso `nube-track-2`
(2 px, entero) y aire, que es todo lo que la escala permite sin inventar un
cuerpo nuevo. La decisión —adoptar un cuarto cuerpo, o aceptar que la portada
sea chata— es de Joaquín.

Existe desde `98baff8` una **negrita de verdad** (`font_variant`, en
`examples/tipografia/`). Ninguna pantalla la pide hoy: donde había `font-bold`
—el nombre del proyecto en el dashboard, el nombre de color en la ficha de
asset, las opciones de estética del asistente— alcanzó con separar por cuerpo y
color. Si alguna vez hace falta, es una decisión de si la app adopta la familia,
no de maquillarlo con la síntesis del navegador.

Siguen en `rem` las **clases por defecto de los primitivos de shadcn**
(`text-sm` de `Button`, `text-base md:text-sm` de `Input`, `font-medium`,
`font-semibold`): no se ven porque cada uso les pasa una clase `nube-*` que
gana, pero son la red de seguridad equivocada. Tocarlas es un cambio que afecta
a las once pantallas a la vez y necesita su propia pasada de capturas.
