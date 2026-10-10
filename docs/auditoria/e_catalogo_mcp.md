# E. El catálogo del MCP, medido y a dieta

> 9 de octubre de 2026. Seguimiento del costo 1 de [C, PSS hoy](c_pss_hoy.md) §4.1
> y del punto 4 de la [síntesis](README.md): lo que el MCP le cobra a cada sesión
> de agente antes de que haga nada.

## Cómo se mide

`npm run mcp:catalog` (`scripts/mcp-catalog.ts`) arranca `bin/pgs-mcp` de verdad,
por stdio, como lo arranca un cliente, le pide `tools/list` (todas las páginas) y
mide la lista **serializada en JSON**, que es lo que el cliente le pone en el
contexto al agente, más las `instructions` del servidor. No arma el catálogo a
mano: si el servidor publica otra cosa, la medida lo ve. `--json` da los números
para comparar; `PGS_MCP=…` mide otro binario (p. ej. `bin/pss-mcp`).

El mismo número lo controla `src/headless/mcpcatalog.test.ts`, con el servidor
arrancado **desde otro directorio** (la condición en la que ya se rompió una vez
por un import resuelto contra el cwd).

## Antes y después

| | antes | después |
|---|---:|---:|
| herramientas | 146 | 147 (+ `pgs_doc`) |
| bytes de `tools/list` | 406.149 | 196.565 |
| instrucciones del servidor | 0 | 531 |
| **total por sesión** | **406.149** | **197.096** (48,5 %) |
| tokens aproximados (bytes/4) | ~101.500 | ~49.300 |
| descripciones de herramienta | 53.207 (13,1 %) | 17.359 |
| descripciones de campo | 162.334 (40,0 %) | 51.454 |
| nombres | 3.430 | 3.447 |
| estructura del schema | 187.178 (46,1 %) | 124.305 |

Presupuesto que fija el test: **216.000 bytes** (lo logrado más ~10 % de aire).

### Las 15 más caras

| antes | bytes | después | bytes |
|---|---:|---|---:|
| `pgs_map_area` | 15.332 | `pgs_map_area` | 5.283 |
| `pgs_map_brink` | 13.527 | `pgs_map_scatter` | 4.164 |
| `pgs_map_flight` | 13.260 | `pgs_map_grove` | 3.945 |
| `pgs_map_grove` | 10.520 | `pgs_map_brink` | 3.853 |
| `pgs_map_scatter` | 9.317 | `pgs_map_flight` | 3.377 |
| `pgs_map_cloudscape` | 8.986 | `pgs_map_water` | 3.344 |
| `pgs_map_water` | 8.563 | `pgs_map_network` | 3.215 |
| `pgs_map_network` | 8.360 | `pgs_illustrate` | 3.085 |
| `pgs_map_stairway` | 8.253 | `pgs_map_path` | 2.828 |
| `pgs_map_path` | 6.689 | `pgs_map_overhang` | 2.823 |
| `pgs_map_feature` | 6.485 | `pgs_map_feature` | 2.818 |
| `pgs_map_wall` | 6.130 | `pgs_variant` | 2.709 |
| `pgs_map_material` | 6.004 | `pgs_map_wildwood` | 2.599 |
| `pgs_map_overhang` | 5.560 | `pgs_map_cloudscape` | 2.536 |
| `pgs_variant` | 5.516 | `pgs_map_claypan` | 2.520 |

## Qué cambió

1. **Descripción de herramienta: una frase, ≤ 200 caracteres.** Qué hace y qué
   contesta. El párrafo largo no se perdió: pasó a `Command.details`, que
   muestran `pgs help <comando>` y `pgs_doc`. La coletilla «Answers one line;
   preview: true adds the image» que llevaban 130 herramientas se dice una vez,
   en las `instructions` del servidor. Ahorro: ~36 KB.
2. **Descripción de campo: sólo arriba y sólo si es corta (≤ 80).** Las largas y
   todas las anidadas siguen en el schema zod —donde `pgs_doc` las lee, así que
   no se desactualizan— pero el catálogo no las carga. Las de `commands.ts` que
   importaban para llamar bien (proporciones, `into`, `base`, `generate.image`,
   `contract`…) se reescribieron para entrar en 80. `preview`, y el `recipe` y el
   `index` de los pasos de mapa, se explican una vez en las instrucciones.
   Ahorro: ~110 KB.
3. **Estructura sin ruido, misma validación.** `tools/list` deja de ser el
   volcado del SDK y pasa a ser `publishedTools(commands)`
   (`src/headless/mcpcatalog.ts`): sin `$schema`, sin los límites ±2^53 que zod
   le pone a cada entero, tuplas de un solo tipo como array con largo, uniones de
   tipos simples como lista de tipos, uniones de arrays contiguas como un rango.
   Cada reescritura es una identidad de JSON Schema draft 7, y un test verifica
   que cada comando publica la estructura entera de su schema (sólo falta
   prosa). La validación de `tools/call` sigue siendo el zod. Ahorro: ~63 KB.
4. **`pgs_doc { command }`** (`bin/pgs doc command=<nombre>`): la descripción
   larga y todos los campos, anidados incluidos, con tipo y descripción. Cuesta
   ~350 bytes por sesión y es lo que hace posible el punto 2 sin perder nada.

## Qué no cambió

- Una herramienta por comando, con su schema; nada escondido detrás de un
  `pgs_run`. Los nombres `pgs_*` y el alias `pss_*` (reescrito a la entrada, no
  listado) siguen igual.
- La CLI: `pgs help` muestra las frases cortas; `pgs help <comando>` muestra la
  frase corta y debajo el texto largo de siempre (`details`), y los campos como
  antes. Los comandos y sus argumentos no cambiaron: el juego llama los mismos.
- Las descripciones de campo de `src/headless/mapsteps/` no se tocaron (otro
  agente trabajaba ahí). Son ~37 KB de prosa que hoy el catálogo no muestra
  porque pasan de 80 caracteres: reescribir su primera frase para que entre
  devolvería información útil al catálogo a un costo chico.

## Lo que sigue: segundo nivel, si hace falta

No hizo falta para llegar a la mitad, pero es el próximo escalón: los 83 pasos
de mapa de escena (todo `map_*` salvo `from_game`, `material`, `render`,
`export`, `compare`, `lint`, `area`, `path`, `water`, `light` y `scatter`) son
**121 KB de los 197** (61 %). Un servidor aparte (`bin/pgs-mcp --maps`, o una
variable de entorno) que los publique sólo en las sesiones que hacen mapas
dejaría el catálogo base en ~76 KB (~19k tokens). Es la opción 2 del issue #1
con el detalle que la vuelve útil; no se hizo porque cambia qué ve un agente y
eso lo decide Joaquín.
