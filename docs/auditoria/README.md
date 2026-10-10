# De PSS a PGS: la síntesis

> **El nombre ya cambió.** El 6 de octubre de 2026, después de esta auditoría,
> Joaquín decidió que el producto dejaba de ser un editor de sprites y pasaba a
> llamarse **Pixel Gaming Studio (PGS)**: el CLI es `pgs`, el servidor MCP
> `pgs-mcp` y sus herramientas `pgs_*`. Estos cuatro informes se dejan como se
> escribieron, en el momento en que todavía se llamaba PSS, porque son el
> documento que llevó a la decisión y reescribirlos borraría de qué se trataba.
> Lo que sigue vigente de ellos es el plan, no el nombre.

> 6 de octubre de 2026. Joaquín pidió pausar el juego y auditar «lo que no es
> game-specific, sino potenciales mejoras a PGS», con el objetivo de «generar
> juegos de manera rápida» y «que sea un motor para crear los assets de los
> juegos de manera agéntica, y eventualmente poder hacer retoques desde la app».
>
> Cuatro auditorías en paralelo, una por ángulo:
> [A, el pipeline de arte del juego](a_pipeline_de_arte.md) ·
> [B, verificación y flujo agéntico](b_verificacion_y_flujo_agentico.md) ·
> [C, PSS hoy](c_pss_hoy.md) ·
> [D, la brecha hacia PGS](d_brecha_hacia_pgs.md).

## Lo que encontramos, en cinco frases

**PSS ya no es lo que dice su README.** Es un motor de assets por CLI y MCP con
136 comandos; de los 431 archivos tocados en octubre, 403 están en `headless/` y
8 en la app. El `AUDIT.md` de abril, que todavía lo llama «editor de pixel art
browser-based», está muerto: los tres features que decía que bloqueaban todo se
hicieron y resultaron irrelevantes. Lo que desbloqueó el arte de un juego entero
fue el dibujo por texto, que no estaba en ningún plan.

**El eje de PGS ya existe y nadie lo nombró: el dibujo de texto como fuente de
verdad.** Receta → render cacheado → dibujo de texto → píxeles, donde el texto es
la fuente y no se vuelve a pisar porque pudo retocarse a mano. La ida y vuelta
está probada sobre 79 dibujos. Es lo único que hace real «generar con agentes y
retocar después», y hoy está implícito en vez de escrito arriba de todo.

**El motor creció, pero su catálogo está lleno de una sola escena.** 91 de los
136 comandos son pasos de mapa, y 76 % de ese código reproduce mapas concretos de
The Unwritten Dao. No es un problema estético: son 91 descripciones de
herramienta que el MCP le cobra a cada sesión de agente, aunque vaya a dibujar
una carta. Y el síntoma ya volvió de rebote: el juego reescribió cavernas,
penumbra y rampas de sombra en Python porque los pasos no servían fuera de la
escena para la que nacieron.

**Para el segundo juego habría que reescribir unas 13 800 líneas, ninguna
reusable.** 8085 son pegamento (apuntadores, exportación a Godot, validadores,
orquestadores) y 5703 son dibujo que PSS no sabe hacer. La hipótesis de que lo
que frena es el pegamento acertó a medias: también falta dibujo.

**Un motor que vende verificación tiene la propia apagada.** El CI está rojo en
`main` desde el 5 de octubre por un error de eslint; como el job muere ahí, los
504 tests no corren. El riesgo real no es el rojo: es que el agente que aprendió
a ignorar ese rojo va a ignorar los controles nuevos.

## El banco de pruebas que armamos sin querer

De los 13 controles auditados, **6 nacieron reactivos**, en el mismo commit que
arreglaba el bug que los motivó. Esa es la forma sana: cada control vale lo que
cazó.

El que más rindió es `map_compare`: habilitó borrar 14 000 líneas de Python en 13
mapas pasando de «99,8 % parecido» a «0 píxeles distintos», y encontró 237
diferencias concretas en un solo mapa. Sin ese número nadie podía afirmar «se ve
igual», y la destilación de los pasos de mapa depende de él.

El control que más caro salió por no existir: **«¿el asset colocado rompe la
jugabilidad?»**. El sendero a la forja quedó sellado detrás de una estela; el mapa
cargaba, el lint de estilo y el de colocación lo daban por bueno, y lo encontró
Joaquín jugando.

## El retoque desde la app

Es el objetivo declarado y hoy hay medio puente. La salida:

- Lo **generado por receta** lleva el retoque como una **capa encima**, nunca
  mezclado: la receta sigue siendo la fuente y se puede volver a correr.
- Lo **dibujado a mano** queda como asset suelto, sin receta.
- Antes de aceptar cada retoque, la pregunta: **¿esto no debería ser un
  parámetro?** Prohibir la mano no elimina la necesidad de la mano, la disfraza
  de motor: así nacieron las casi 5000 líneas de pasos de escena.

La buena noticia es que esa capa está medio construida (`variant`: copia la base,
pinta en capa propia, nunca toca la base, se rehace corriéndola). Falta la otra
mitad y es barata: el editor guarda aplanado, el formato no tiene un campo
`generated_by:` (el único registro del vínculo es una frase en castellano dentro
de un campo libre), y los mapas no se pueden abrir porque el lienzo se asume
cuadrado. La dirección inversa, de píxeles a receta, no hace falta: lo que hace
falta es que receta y retoque coexistan sin pisarse.

## Por dónde empezar

El criterio es desbloquear, no embellecer.

1. **CI verde.** En curso. Sin esto todo lo demás se hace a ciegas.
2. **`generated_by:` en el formato y lienzo no cuadrado en el editor.** Es el
   objetivo del retoque y son dos cambios chicos.
3. **Manifiesto de assets, «qué falta» y andamio.** Que un juego declare qué
   necesita y de qué tamaño, que PGS conteste qué falta, y que el arte prestado
   sea capacidad del motor: 37 entradas y 20 líneas dejaron jugar una cueva
   entera antes de dibujarla. Da vuelta el orden: el arte llega midiendo lo que
   el mundo espera, en vez de rehacer el mundo alrededor del dibujo. El reporte
   de pendientes es parte de la capacidad; sin él el préstamo es deuda invisible.
4. **Decidir qué pasa con los 91 pasos de mapa** y, se decida lo que se decida,
   sacarlos del catálogo del MCP. Es el rubro más grande y el que más cuesta por
   sesión.
   *9 de octubre:* el catálogo ya se mide (`npm run mcp:catalog`) y bajó de
   406 KB a 197 KB sin sacar herramientas; los pasos de escena siguen siendo el
   61 % de lo que queda. Ver [E, el catálogo del MCP](e_catalogo_mcp.md).
5. **`batch`, y personajes como receta.** Hoy `scripts/personajes.py` es una
   receta escrita en Python; el parche es `batch`, el arreglo es subir personajes
   a receta como ya se hizo con mapas.
6. **El dibujo que falta.** Las primitivas de pintura que hoy sólo se alcanzan
   por `map_*`, la tipografía (que no existe: dos actos salieron con la fuente
   vectorial de Godot en un juego con snap a píxel) y la interfaz (PSS declara
   `ui` como categoría y no sabe generar ninguna).
7. **Addon de Godot y exportación incremental**, y reescribir el README.

## Lo que decide Joaquín

- **Los 91 pasos de mapa:** congelar, separar como ejemplos, destilar en pasos
  genéricos, o convertirlos en semilla para generar mapas nuevos
  ([issue #1](https://github.com/Khadosh/pixel-gaming-studio/issues/1)).
- **Dónde vive un proyecto.** Hoy el headless guarda en disco y la app en
  Supabase, sin puente, con jerarquía plana. Esto condiciona el retoque.
- **Si la fuente del dibujo pasa a vóxeles** (`docs/ideas.md`).

## Dos reglas que salen de esto

- **Primitivas, nunca formas con nombre.** Si en PGS aparece un paso llamado
  `cabra`, el diseño falló.
- **La regla del borde:** cuando algo cruza entre un juego y PGS, el commit
  contesta en una línea por qué generaliza. Esta semana falló en las dos
  direcciones el mismo día.
