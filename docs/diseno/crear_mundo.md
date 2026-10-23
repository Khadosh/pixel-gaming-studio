# Crear mundo: el estilo de un proyecto

*Diseño. 6 de octubre de 2026. Escrito antes del código.*

## El problema

PGS sabe dibujar una cosa. No sabe **cómo se dibuja acá**.

Hoy el estilo de un proyecto vive repartido en los argumentos de cada comando y
en la memoria de la sesión que lo armó: esta paleta, esta luz, este tamaño, este
contrato de animaciones. Por eso dos assets del mismo juego salen distintos
según quién los pidió, y por eso cada sesión de agente empieza preguntando lo
mismo o adivinando.

Es el agujero que queda después de la auditoría. El eje de PGS —el dibujo de
texto es la verdad— resolvió cómo **una cosa** sobrevive a que la toquen a mano.
Falta cómo **un conjunto** se mantiene parecido a sí mismo.

## La decisión que esto cierra

**Un proyecto es una carpeta con un `pgs.json` adentro.** El disco es la verdad.

Eso contesta lo que estaba abierto: hoy el motor guarda en disco y la app en
Supabase, sin puente. Con esto, la app es la **ventana local** al proyecto en el
que el agente está trabajando: lee y escribe los mismos archivos. Supabase queda
para cuenta y para compartir, no para ser la verdad.

La razón: si la verdad vive en una base, el retoque hecho a mano deja de verse
en el `git diff` al lado del que hizo el agente, y eso es exactamente lo que
hace que el puente sirva.

## Las dos mitades del estilo

Un estilo tiene dos partes y **las dos hacen falta**:

- **Lo medible** — números y listas que el lint verifica. Paleta, grilla,
  tamaños, contrato. Contesta «¿esto rompe el estilo?».
- **Lo dicho** — prosa corta, en palabras. «Terroso, poco saturado, luz baja de
  la tarde, siluetas gruesas.» Contesta «¿cómo haría uno nuevo?».

Un agente que sólo tiene números hace cosas que pasan el lint y no pegan. Un
agente que sólo tiene prosa hace cosas lindas que no entran en la paleta. El
archivo tiene las dos, y cada una tiene su lector.

## El archivo

`pgs.json` en la raíz del proyecto.

```jsonc
{
  "name": "Pixel Gaming Studio",
  "says": "Herramienta oscura y sobria. Verde fosforescente sobre casi negro,
           como una terminal. Siluetas macizas antes que contornos finos.",

  "visual": {
    "palette": "art/paleta.pss.json",   // la única fuente de color
    "roles": {                          // qué significa cada color, por nombre
      "base": "verde_pantalla",
      "light": "verde_claro",
      "dark": "verde_sombra",
      "accent": "blanco"
    },
    "grid": 1,                          // la unidad; todo es múltiplo de esto
    "sizes": {                          // tamaños con nombre, no números sueltos
      "icon": [16, 16],
      "glyph": [8, 8]
    },
    "light": { "from": "upper_left", "strength": "soft" },
    "outline": { "use": false },
    "dither": { "use": false },
    "contract": "body"                  // el de src/headless/contract.ts
  },

  "type": {
    "font": "art/nube8.txt",
    "steps": [8, 16, 24]                // los únicos cuerpos permitidos
  },

  "sound": {
    "says": "Secos y cortos. Nada de cola. Madera y tela antes que metal.",
    "scale": "menor_pentatonica",
    "tuning": 440,
    "rate": 22050,
    "materials": ["madera", "tela", "piedra"],
    "lengths": { "short": 0.08, "medium": 0.25, "long": 0.9 }
  }
}
```

Nada de esto es nuevo como capacidad: la paleta, la luz, el contrato y las
escalas ya existen como argumentos. Lo nuevo es que **dejan de repetirse en cada
llamada** y pasan a tener un lugar donde mirarlos.

## Qué cambia en los comandos

1. **Heredan.** Un comando corrido dentro de un proyecto toma paleta, tamaños,
   luz y contrato del `pgs.json` si no se los dan. Lo que se pasa explícito
   gana, y el comando dice en su salida qué heredó, para que no sea magia.

2. **`pgs project`** imprime el estilo como resumen para quien lo necesite: la
   prosa, la paleta con sus colores a la vista, los tamaños con nombre, los
   cuerpos de letra. Es lo primero que lee un agente al entrar. Con `LOOKING`
   devuelve además la imagen: la paleta y la muestra de la fuente.

   *Lo que heredan hoy (19 de octubre, issue #26, después de que la pasada 1
   del patio encontró que no heredaba casi nada):*

   | comando | toma del `pgs.json` | cuándo |
   |:---|:---|:---|
   | `lint` | `visual.palette`, `visual.grid`, `visual.sizes`, `visual.contract`, `visual.proportions` | sin `palette`/`colors`, sin `grid` (sólo tiles), sin `sizes` (no tiles ni lo que hizo `map_export`), sin `contract`, sin `proportions`; el contrato heredado no mira tiles, ni assets sin ninguna animación, ni los que no son de ninguna clase (lo dice; `contract_ids=` los mete) |
   | `from_ascii` | `visual.palette` como `fit` | sin `fit:` ni `fit=`; **avisa**, no frena |
   | `music` | `sound.rate`, `sound.tuning`; avisa notas fuera de `sound.scale` | partitura sin `frecuencia:` / `afinación:` |
   | `animate`, `figure` | `visual.proportions` | sin `proportions` |
   | `sound` | `sound.rate`; con notas en la receta, `sound.tuning` y `sound.scale`; `sound.lengths` para un largo con nombre; `sound.materials` | lo que la receta no dice; una nota fuera de la escala se avisa; `"duration": "short"` (y `start`/`length` de una capa); un `material` fuera de la lista se avisa |
   | `font`, `font_web`, `font_contact` | `type.font`; `font_contact` además `type.steps` como escalas | sin `path`; los cuerpos, sólo si la hoja es la del mundo |
   | `map_render`, `map_export`, `map_compare`, `map_lint` | `visual.light.from` como `light` | recetas sin `light`; con una propia, avisa si apuntan distinto |
   | `map_render`, `map_export`, `map_compare`, `map_lint` | `visual.light.strength`: el borde de la sombra de un sol (`soft` = `soft: 2`, `fray: 0.3`; `hard` = `soft: 0`, `fray: 0`) | recetas con sol (`light` objeto) que no escriben `soft`/`fray`; lo escrito gana campo por campo (Khadosh/pixel-gaming-studio#36) |
   | `map_render`, `map_export`, `map_compare`, `map_lint` | `visual.scale` (píxeles de pantalla por píxel de dibujo): el grano del pasto (`patches.grain`) que la receta no escribe, a 2× uno a mitad de camino, desde 3× el del patio | sólo materiales de pasto de grano; lo escrito gana campo por campo (Khadosh/estudio#220) |
   | `map_from_game` | — | no escribe `[1, 1]` si el mundo tiene luz: la receta la toma al pintarse |

   El `pgs.json` es el más cercano subiendo desde el archivo (desde donde se
   corre, para la fuente sin `path` y el sonido en línea). La línea es siempre
   la misma: `heredado de ./pgs.json: paleta, contrato (patio)`. Falta:
   `type.steps` en el `lint` de texto. `pgs project` dice al pie qué comando lee
   cada campo.

   *Un contrato por clase de sprite (#36).* Un mundo con más de una clase
   (el patio: un gato que camina, bichos que se asoman, una fila de íconos)
   declara el contrato de cada una:
   `"contract": { "gato": "art/contrato.json", "bicho": "art/asoma.json", "iconos": null }`.
   La clave es un nombre de `sizes` (el lienzo la elige) o el id de un asset
   (gana el id); `null` es «sin contrato».

3. **`pgs lint` gana las reglas del estilo.** Colores fuera de paleta, tamaños
   que no son uno de los declarados, animaciones que no cumplen el contrato,
   texto en un cuerpo que no está en `steps`. Avisa, no impide — igual que el
   semáforo de divergencia.

## PGS como primer cliente

El proyecto PGS tiene un `pgs.json` y sus propios assets. Es la prueba más
barata que tenemos, y la única que no se puede falsear: **si PGS no alcanza para
vestir a PGS, no alcanza.**

Hoy no alcanza, y la auditoría de iconos y fuente dice exactamente dónde:

- La fuente de la app es Press Start 2P traída de Google por red, usada en ocho
  cuerpos distintos de los cuales sólo uno está en grilla.
- Los 61 iconos están escritos a mano en TypeScript, en dos formatos, y siete
  tienen el agujero pintado con el color del fondo en vez de ser transparente.

Entonces el primer `pgs.json` que existe es el de PGS, y las dos primeras cosas
que tiene que poder expresar son **su fuente** y **sus iconos**. Si el archivo no
alcanza para describir eso, no alcanza para nada.

## Lo que falta para eso, y es trabajo real

1. **`font_export` para la web.** PGS exporta BMFont, que sirve para Godot y no
   para una página. Falta un formato más, desde el mismo dibujo. No es un
   capricho de la app: cualquier proyecto web que salga de PGS lo va a querer.

2. **Los iconos como dibujos de PGS.** Convertidos desde los trazos de hoy, sin
   cambiar el arte todavía, para que entren al formato y se puedan abrir en el
   editor. Los siete agujeros pasan a ser transparencia de verdad.

Recién después viene el arte: los rotos, los cinco palos diagonales que a 16 px
son la misma mancha, el peso disparejo.

## Qué NO entra ahora

**Subir assets.** Un asset subido sólo sirve si entra al sistema de estilo: se
ajusta a la paleta, queda marcado como hecho a mano, lo revisa el lint. Sin lo
de arriba es una carpeta con archivos adentro, y eso ya lo hay. Después es
barato.

**El manifiesto.** El estilo dice **cómo**; el manifiesto dice **qué**. Son dos
archivos y dos momentos. El manifiesto se apoya en esto: sin estilo declarado no
existe «está fuera de estilo».
