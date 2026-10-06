# ROADMAP INMEDIATO (Táctico) ⚡

> **Foco actual (6 de octubre de 2026)**: ⚡ **quick wins hacia PGS**, salidos de
> la [auditoría](docs/auditoria/README.md). El foco anterior (Anatomy-Driven
> Animation Engine) queda más abajo, sin cancelar.

---

## ⚡ 0. Quick wins hacia PGS

*Criterio: chico, seguro, y desbloquea algo. Nada de acá necesita una decisión de
Joaquín; lo que sí la necesita está al final.*

**Orden que eligió Joaquín (6 de octubre): tanda 1 → 2 → 4 → 3.** O sea, la
tipografía antes que el manifiesto: lo visible y barato primero, y el pegamento,
que es lo más grande, al final. Única excepción propuesta por Claude: `batch`
sube a la tanda 2, porque abarata cada corrida de agente y el resto del plan se
hace con agentes.

### Tanda 1 — higiene, para no trabajar a ciegas

- [ ] **CI verde.** Rojo en `main` desde el 5/10 por un error de eslint; como el
      job muere ahí, los 504 tests no corren. El riesgo no es el rojo: es que el
      agente que aprendió a ignorarlo ignore después los controles nuevos.
- [x] **`map_render` y `map_compare` dentro de `LOOKING`** (`brief.ts`). Bug de
      una línea: son los dos comandos de mirar mapas y quedaron fuera de la lista
      de «mirar», justo los que un agente necesita para no dar por bueno lo que
      no vio. Hecho el 6/10: entraron los dos y también **`map_lint`**, que estaba
      afuera por lo mismo (sobre MCP contestaba `ok map_lint: problems=3` sin
      decir cuáles). `map_compare` además devuelve la imagen de la comparación
      cuando es una sola: el número dice cuánto difiere, sólo el magenta dice
      dónde. La regla quedó escrita en `AGENTS.md` para que no vuelva a pasar.
- [x] **Recetas de sonido de ejemplo.** El motor de sonido está entero y es
      genérico (9 fuentes, 9 instrumentos, QA sin oídos), pero PSS no trae **una
      sola** receta ni partitura: los tests las arman en línea. El próximo juego
      hereda la capacidad y ninguna referencia. Es lo más barato de toda la lista.
      Hecho el 6/10: `examples/sonido/`, seis recetas y una partitura (un golpe,
      metal golpeado con sus parciales, un ambiente en bucle, un ambiente poblado
      con `events`, una interfaz, un paso sobre un material, una vuelta de música),
      cada una mostrando algo distinto, con un README que dice qué enseña cada una
      y cómo escucharla y verificarla. Un test las renderiza y exige
      `0 with warnings`.
- [x] **README al día y `AUDIT.md` marcado como histórico.** El README describe un
      editor de pixel art en el navegador; PSS es un motor de assets por CLI y MCP
      con 136 comandos. Los agentes leen esos archivos al arrancar: mientras digan
      otra cosa, cada sesión empieza con el mapa equivocado. Hecho el 6/10: el
      README arranca por las tres superficies (CLI, MCP, app) y por el dibujo de
      texto como fuente de verdad, `AUDIT.md` lleva un aviso arriba de que es de
      abril y quedó superado (se conserva por el posicionamiento y el riesgo de
      costo de IA), y el *Project Overview* de `AGENTS.md` dejó de decir «editor
      de pixel art».
- [ ] **El contrato de animaciones, como dato.** Está escrito cuatro veces
      (`character.ts`, `figure.ts`, `commands.ts`, y el juego). Cuatro copias de
      la misma tabla es un concepto que falta: un `contract=` que acepten `figure`,
      `import_character`, `animate`, y que `pss lint` sepa chequear.

### Tanda 2 — el retoque desde la app (el objetivo declarado)

- [ ] **`generated_by:` en el formato.** Hoy el único registro de que un dibujo
      salió de una receta es una frase en castellano dentro de un campo libre
      («no se edita a mano»): 101 de los 666 dibujos del juego son así, mezclados
      con los hechos a mano, y la receta los pisa en silencio.
- [ ] **Lienzo no cuadrado en el editor.** Los mapas son 448×224 o 512×320 y el
      editor los abre como cuadrados: hoy **no se pueden abrir**. Bloquea el
      retoque justo donde más se necesita.
- [ ] **Que el editor guarde la capa de retoque en vez de aplanar.** `variant` ya
      hace la mitad buena (copia la base, pinta en capa propia, nunca toca la
      base, se rehace corriéndola). Falta que el editor produzca esa capa.
- [ ] **`batch`** (subido de la tanda 3). 23 recetas con 274 pasos, 0,19 s de
      arranque por llamada. Lo caro no es el reloj: es que «una receta» no existe
      como transacción y nadie valida el conjunto. Se adelanta porque todo el
      resto del plan se hace con agentes y esto abarata cada corrida.

### Tanda 3 — que un juego nuevo arranque (va última, por decisión de Joaquín)

- [ ] **Manifiesto, «qué falta» y andamio.** Que un juego declare qué assets
      necesita y de qué tamaño, que PGS conteste cuáles faltan, y que el arte
      prestado sea capacidad del motor (37 entradas y 20 líneas dejaron jugar una
      cueva entera antes de dibujarla). Da vuelta el orden: el arte llega midiendo
      lo que el mundo espera. El reporte de pendientes es parte de la capacidad:
      sin él, el préstamo es deuda invisible.

### Tanda 4 — dibujo barato y visible

- [ ] **Tipografía.** No existe en ninguno de los dos lados: dos actos jugables
      salieron con la fuente vectorial de Godot, antialiaseada, en un juego con
      snap a píxel. La maquinaria ya está casi entera entre `from_ascii` y
      `export_sheet`.

### Lo que necesita decisión de Joaquín (no son quick wins)

- Los 91 pasos de mapa, y sacarlos o no del catálogo del MCP
  ([issue #1](https://github.com/Khadosh/pixel-sprite-studio/issues/1)): es el
  67 % de las herramientas que el MCP le cobra a cada sesión.
- **Dónde vive un proyecto**: hoy el headless guarda en disco y la app en
  Supabase, sin puente y con jerarquía plana. Condiciona el retoque.
- Si la fuente del dibujo pasa a vóxeles (`docs/ideas.md`).

---

## 🦴 1. Core Anatomy Engine (Cimientos)
*Hacer que el motor "entienda" los píxeles seleccionados por el usuario.*

- [x] **Unificador de Miembros**: Crear un "Resolver" que entregue un mapa de píxeles para cada parte del cuerpo, usando la selección manual si existe o infiriendo el área si no (Fallback Inteligente).
- [x] **Transformaciones por Máscara**: Implementar `shiftPixels` y `rotatePixels` que operen sobre los `MemberConfig.pixels` para permitir movimientos sin distorsionar el resto del cuerpo.

## 🎬 2. The Core 8 Suite (Fase 1)
*Implementar las 8 animaciones base con soporte total de anatomía y direcciones.*

- [x] **1. IDLE & BREATH**: Animación sutil usando squash/stretch basado en el pivot de la cintura.
- [x] **2. WALK (Front/Side/Back)**: Ciclo de 8 frames con flexión de rodillas real (usando píxeles de piernas).
- [x] **3. RUN**: Variación del walk con mayor inclinación de torso y zancada más larga.
- [x] **4. JUMP**: Anticipación (squash), salto (stretch + lift) y caída.
- [ ] **5. ATTACK**: Thrust/Slash usando el pivot del hombro detectado/marcado.
- [ ] **6. HURT**: Recoil físico con rotación de cabeza y torso.
- [ ] **7. CAST (Advanced)**: El sistema actual mejorado para usar los brazos marcados.
- [ ] **8. DIE**: Colapso físico real (caída de rodillas y desplome).

---

## 🖥️ 3. Headless (CLI + MCP) — para alimentar juegos desde un agente
*Ver "Headless" en AGENTS.md. Primer consumidor: The Unwritten Dao (Godot).*

- [x] **Núcleo headless**: `src/headless/` con registro de comandos, CLI (`bin/pss`) y MCP (`bin/pss-mcp`).
- [x] **Limpieza de renders**: `despeckle` y recorte que ignora manchas (`pixelize`). Lección del juego: a 16 y 32 px un objeto simple (una estera, un pergamino) sale mejor dibujado con `draw` que pixelizado; la IA rinde en formas grandes (un biombo, un poste).
- [x] **Import de hojas 1:1** (grilla, margen, espaciado, colores exactos, tags por fila/columna).
- [x] **Export hoja 1:1 + JSON estilo Aseprite** (rects, duración por cuadro, frameTags con loop).
- [x] **FX procedurales por comando** (`fx`, `fx_anim`) con semilla reproducible.
- [x] **Animación de anatomía por comando** (`animate` + `anatomy`).
- [ ] **El motor sobre chibis de 16 px**: con piernas de 1–2 px la caminata casi no se mueve y `die` rota la cabeza en fragmentos. Hace falta un modo "chibi" (mover bloques enteros, sin rotar) o pasos mínimos de 1 px garantizados.
- [ ] **Que el editor honre `width/height`, `durations` y `loop`** (hoy sólo el lado headless).
- [x] **El editor abre y guarda los dibujos de texto** (página `/dibujo`, `src/lib/textDrawing.ts`; hecho el 1 de octubre) (`from_ascii` / `to_ascii`, formato en `src/headless/ascii.ts`). **Prioridad.** Hoy el agente dibuja por texto y nadie puede retocar eso en el editor; con esto se juntan las dos mitades: el agente arma por texto, una persona abre el mismo dibujo con línea de tiempo, piel de cebolla y capas para animar o pulir, guarda, y el agente sigue sobre lo guardado. Pedido por Joaquín (1 de octubre). Criterios:
  - Abrir un `.txt` (o pegar su contenido) carga tamaño, paleta, cuadros y animaciones (`== idle 0`) en el editor.
  - Guardar vuelve a escribir el `.txt` sin perder nada que el formato tenga (ida y vuelta exacta, con test: `to_ascii(from_ascii(x)) == x`).
  - Lo que el formato no sabe guardar (capas, alfa parcial fuera de la paleta) avisa al guardar en vez de perderse en silencio.
  - Primer caso real: abrir `art/pss/dibujos/bestias/guardian_de_piedra_pelea.txt` de The Unwritten Dao, retocar un cuadro y que `./arte.sh` del juego lo tome.
- [x] **IA como materia prima por comando**: `generate` (fal.ai) y `pixelize` (el puente "HQ Image-to-Pixel" del roadmap, sin panel).
- [ ] **Import de hojas desde la UI** reutilizando `importSheetImage`.
- [x] **Arte como texto** (`from_ascii` / `to_ascii`): el dibujo de caracteres con leyenda es la fuente de verdad de lo dibujado a mano; el juego guarda 43 en `art/pss/dibujos/` y `arte.sh` los rearma.
- [x] **Control de escala y limpieza** (`contact` + `lint`): la hoja al lado del jugador que atrapó los faroles gigantes, ahora por comando.
- [x] **Variantes de un asset** (`variant`): la misma cara con otras cejas, boca o mirada, en una capa encima de la base sin tocarla; el juego hace 24 retratos con ánimo así.
- [x] **Abrir un `.txt` de dibujo en el editor** (y guardar de vuelta), para retocar con el mouse lo que nació como texto. (Ver el ítem de arriba.)

## ⏳ Futuro Cercano (Post-Anatomy)
- [ ] **Auto-Shade Generator** (Herramientas de Paleta)
- [ ] **HSL Color Picker Pro**
- [x] **Export Texture Packer JSON** (hecho en headless: `export_sheet`)
- [x] **Duración por Frame** (modelo: `AnimationDef.durations`; falta la UI)

---

## ✅ Completados Recientemente
- [x] **Perspectivas y Grillas Pro**: Auto-Mirror, Rejilla Isométrica, Modo Top-Down
- [x] **Nombres Canónicos**: Sistema estándar implementado
- [x] **Dismemberment Tool (UI)**: Capacidad de marcar píxeles por miembro
- [x] **Previsualización Dinámica**: Soporte auto-escalable para 64x64 y 128x128 sin overflow.
- [x] **Procedural FX Tool**: Panel de manipulación de miembros basado en anatomía (FX tab).
- [x] **Custom Creation Flow**: Modo de creación de animaciones manuales desde el frame base.

---

*Para la visión a largo plazo, ver [ROADMAP_NEXT.md](./ROADMAP_NEXT.md)*
*Para el historial completo, ver [ROADMAP_COMPLETED.md](./ROADMAP_COMPLETED.md)*
