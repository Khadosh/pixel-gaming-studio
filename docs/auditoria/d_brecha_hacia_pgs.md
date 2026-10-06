# La brecha hacia PGS

> Auditoría, 6 de octubre de 2026. Ángulo: **vestir un juego entero costó algo;
> ¿cuánto de eso sabe hacer PSS hoy y cuánto habría que rehacer para el próximo?**
>
> El caso medido es *The Unwritten Dao* (`~/juegos/unwritten-dao`): RPG xianxia en
> Godot 4.6, dos actos jugables, **23 mapas**, 126 actores, 221 adornos, 99 suelos,
> 19 telones de pelea, 63 cartas, 40 objetos, 18 técnicas, 83 efectos de sonido y
> 12 piezas de música. En arte: **820 PNG exportados desde 792 fuentes, 666 dibujos
> de texto** (396 MB en `art/pss/`); en sonido, **83 recetas → 83 WAV**. Todo el arte
> propio se hizo con PSS sin abrir su interfaz.
>
> Este documento no propone tocar el juego. Mide la brecha y ordena por dónde
> empezar, respetando el principio de `ROADMAP_NEXT.md` del 6 de octubre: **PSS es
> un motor de creación, no una colección de assets.**

---

## 1. El resumen de una línea

PSS ya sabe **dibujar** buena parte de lo que un juego necesita: 136 herramientas,
17 794 líneas de motor headless, 331 tests. Lo que no sabe es **ser el proyecto de un
juego**: declarar qué assets hacen falta, saber cuáles faltan, taparlos mientras tanto
y dejarlos puestos en el motor.

Pero el hallazgo que más corrige la intuición es otro: de las **8177 líneas de Python**
que el juego escribió para hacer su arte, **5703 (70 %) no llaman a PSS ni una vez**.
Son algoritmos de pixel art reimplementados afuera porque PSS no los tiene. O sea: la
brecha no es sólo pegamento. Es **mitad pegamento, mitad dibujo que PSS no hace**.

---

## 2. El inventario

Veredictos: **ya está** = PGS lo haría hoy sin escribir código nuevo del lado del
juego · **a medias** = PSS da las piezas pero la decisión y el armado viven en el
juego · **no existe** = PSS no lo toca.

| # | Qué necesitó el juego | Veredicto | Cómo se resolvió esta vez | Qué costó / qué le falta a PGS |
|---|---|---|---|---|
| 1 | **Personajes de mapa** (90 hojas: 4 direcciones × 5 animaciones, 16×16) | a medias | Cuerpos del pack Ninja Adventure (`import_character`), recoloreados a la paleta madre, vestidos con `stamp` (tocado) y `face_points` (bigote, vincha), con receta `personajes.json` (965 líneas de datos) | Ningún caminante de 16 px es propio. El motor de anatomía **no le gana al pack a esa escala** (regla 5 de `docs/frentes/arte.md`): con piernas de 1–2 px la caminata casi no se mueve. El orquestador es `scripts/personajes.py` (**537 líneas**, 52 llamadas a `pss`) |
| 2 | **Cuerpos de pelea humanos** (20 hojas: rival y espalda, 48×48, 3 cabezas) | **ya está** | `pss figure` (884 líneas): cápsulas en 3D en el marco del personaje, tabla de poses `FIGURE_ANIMS` con las 6 del contrato, 3/4, z-buffer, tres tonos por material, contorno. Receta `cuerpos_pelea.json` (438 líneas) | Lo más cerca de «PGS» que hay: una receta de datos y un comando. Pero la cabeza va a mano (9 `.txt`, uno por humano, con `anchor`) y el jugador de 48 px «parece Dobby»: el rig todavía no da una figura que entre sola |
| 3 | **Caras y retratos de diálogo** (31 facesets, 40 variantes de ánimo) | **ya está** | `pss variant`: la cara base más un overlay `.txt` de 38×38 con sólo lo que cambia (`.` = lo de abajo). 20 personajes × {cálida, dura}. Más 10 `caras_base/*.txt` que corrigen el retrato del pack | Mecanismo ejemplar y reusable: la base queda intacta, así que rehacerla reconstruye las variantes. Lo que falta: la **cara base** sale del pack o se dibuja a mano; no hay generador de retratos ni set canónico de ánimos |
| 4 | **Bestias y cuerpos no humanos** (47 hojas + retratos) | a medias | Dibujadas a mano como texto (40 en `dibujos/bestias/`), más `caras_bestias.py` (68, orquestador de `illustrate`) y **`bestias_forja.py` (240, cero llamadas a PSS)** | `figure` es bípedo: **no hay rig de cuadrúpedo**. Que los cuadrúpedos de costado necesiten 40 px mínimo para leerse se descubrió dibujando, y quedó como regla del juego, no del motor |
| 5 | **Suelos y tiles de mapas** (101 suelos, 23 recetas, 23 mapas) | ya está, de más | 91 comandos `map_*`; `map_from_game` lee el mapa del juego y las huellas de sus adornos, `map_export` escribe PNG + `.pss.json` + texto por capa **y escribe de vuelta** `painting`/`margen`/`vivo`/`copas` en el JSON del mapa, `map_compare` pone el antes y el después con las diferencias en magenta | Es la deuda que nombra el principio del 6 de octubre, y está **peor de lo que el roadmap registra**: **91 de las 136 herramientas (67 %)** son pasos de mapa, 8606 líneas en 34 archivos, 3886 de ellas en seis archivos con nombre de un mapa de este juego, y **16 archivos** se describen como port de un script del juego (el roadmap decía trece). Cuatro dicen «same numbers, same pixels»; los 116 tests de `mapsteps/` son regresión por escena, o sea **congelan las decisiones del original** |
| 6 | **Adornos y props** (269 hojas, 267 dibujos) | a medias | Uno por uno, a mano, como dibujo de texto. El flujo documentado es literalmente «copiá un `.txt` parecido y cambiá el `id`». Más `orillas_mapas.py` (231) y `piso_terraza.py` (**563, sin PSS**) para los parches grandes | PSS da las tres cosas buenas del ciclo (`from_ascii`, `contact`, `lint`) pero **no genera un prop**. La «Librería Esencial 16×16» de la Fase 7 sigue pendiente, y 267 adornos a mano es el rubro más caro en horas del juego entero |
| 7 | **Telones de fondo** (65 hojas, 19 escenarios) | **ya está** | `generate` (flux) → `illustrate` (cuantizar a paleta por OKLab) → `edit_zone` para rehacer una zona sin pagar de nuevo → `cutout` para las piezas vivas → `depth`/`layers` para parallax → `lights` para las luces pintadas. Receta `telones.json` (1699 líneas). Caché de renders en `ia/` (**101 MB**) para no volver a pagar | El mejor ejemplo de IA domada, con sus lecciones incorporadas (fondo liso, sujeto grande, flux no obedece «sin gente»). Lo que quedó pegado: `telones.py` (300, orquestador) y lo que se mueve lo mueve un shader del juego (`telon_vivo.gdshader` 88 + `telon_vivo.gd` 111) |
| 8 | **Efectos: luz, partículas, destellos** (24 hojas, 5 shaders, 2 mapas de luz) | a medias | `fx`/`fx_anim` (7 formas, con semilla), pero la mayoría de los 18 fx son dibujos a mano. **Cero partículas de Godot**: todo es sprite. Sombras y halos son dibujos (`sombra_chica/mediana/grande`, `luz_halo`) que interpreta `lighting.gd` (182); `lights` escribe las luces pintadas como JSON (`luces/cueva.json`) | El contrato de luz/sombra/niebla (radio, energía, parpadeo, ambiente, densidad, ráfaga) está inventado, probado y documentado… **en el juego**. PGS no sabe que una luz existe |
| 9 | **Interfaz y HUD** | **no existe** | `scripts/hud_pelea.py`: **482 líneas de Python, dos menciones a `pss`**. Rombos de piso isométricos 64×32, marco de nueve partes, orbe y pips de qi, íconos de acción. Los menús son `StyleBoxFlat` en `scenes/ui/theme.tres`: rectángulos redondeados, ni pixel art | PSS no tiene **9-slice**, ni botones, ni barras, ni paneles, ni marcos. Lo irónico: su propio modelo de datos declara `category: 'ui'` como una de cinco, y la capacidad es cero. Es el rubro más universal que hay |
| 10 | **Ilustraciones de cartas** (43) | **ya está** | `cartas.json` (277 líneas) + `generate` + `illustrate` con 15 parámetros (`cuantizar`, `acento`, `lineas`, `zoom`, `foco`, `contour`…); hoja de control `--hoja` que **lanza Godot headless** para fotografiar las cartas como las dibuja el juego | Funciona y aprendió del uso. Nada que mover, salvo que la hoja de control necesita el motor: PGS no puede mostrar una carta armada sin abrir Godot |
| 11 | **Marcos de carta y de ventana** (13) | **no existe** | `scripts/marcos_cartas.py`: **214 líneas, dos menciones a `pss`**. Marcos de nueve partes por naturaleza + el rollo de pergamino de la ventana de pestañas | Mismo agujero que la fila 9. Un marco de nueve partes es la pieza de UI más reusable que existe y PSS no la sabe hacer |
| 12 | **Íconos de objetos y técnicas** (24 + 20 + 16 + 10 familias) | a medias | Los de carta, del pack recoloreado (`arte.sh iconos` → `png_fit`); los de objeto, técnica (16×16) y familia (9×9), dibujos de texto a mano | PSS no genera íconos. A 9×9 el dibujo a mano probablemente sea lo correcto, pero **la silueta y el encuadre** se podrían generar |
| 13 | **Tipografía** | **no existe** | **No se resolvió.** Cero `.ttf`/`.otf`/`.fnt` en todo el repo, ningún `FontFile` en el tema ni en ningún `.tscn`: sólo overrides de tamaño y color (13 a 46). El juego usa **la fuente vectorial por defecto de Godot**, antialiaseada, en un proyecto con `default_texture_filter=0`, `scale_mode=integer` y snap a píxel. `docs/frentes/arte.md` no menciona tipografía en ninguna de sus 238 líneas | PSS tiene una fuente de 3×5 interna, sólo para rotular hojas de contacto (`inspect.ts`). La Fase 9.2 está 100 % sin empezar. **Es el agujero más barato de tapar con más impacto visible**: `from_ascii` + `export_sheet` ya son casi toda la maquinaria |
| 14 | **Sonido: efectos y ambientes** (83 recetas → 83 WAV) | **ya está** (el motor) | `pss sound` (receta JSON → WAV 16 bit mono, 9 fuentes, 4 filtros, ADSR, LFOs, echo, eventos dispersos, loop que empalma) y `pss sound_contact` (QA sin oídos: duración, pico, RMS, DC, centroide, salto de loop, clicks). El frente entero se resolvió con **dos comandos y 83 líneas de bash** | La prueba de que el modelo funciona. **El punto flojo: PSS no trae ni un ejemplo** —cero recetas, cero partituras, cero WAV en el repo, los tests las arman inline— y no hay nada de sonido en la app web. El próximo juego hereda el motor pero no una sola receta de la que partir |
| 15 | **Música** (12 piezas) | **ya está** (el motor) | `pss music`: partitura de texto → WAV, 9 instrumentos de fábrica pulsados o golpeados, humanización con semilla, sala, loop exactamente periódico | Mismo punto flojo: cero partituras de ejemplo en PSS. Lo específico del juego (el tema, la regla de no resolver) está bien que quede en el juego |
| 16 | **Paletas** | ya está | Una paleta madre (3 KB), `palette`/`palette_fit`/`palette_show`/`png_fit`/`png_knockout`, `illustrate quantize=palette`, y un test de que todo asset propio la usa (admite alfa) | Falta un escalón arriba: la paleta madre se armó a mano, y las rampas por material (que ya piden `map_material` y `figure`) se escriben a mano receta por receta. No hay auto-shade (sigue en Futuro Cercano) |
| 17 | **Control: mirar lo hecho** | **ya está** | `contact` (los assets al lado del jugador, línea de piso, grilla de 16, nombres en fuente de 3×5), `lint` (colores fuera de paleta, lados fuera de grilla, píxeles sueltos, bordes que no empalman, pieza separada), `map_compare`, `sound_contact` | La otra prueba de que el modelo funciona: Joaquín decide mirando estas hojas. Nada que mover |
| 18 | **Manifiesto de assets**: qué necesita este juego | **a medias, y del lado equivocado** | Sí hay un detector de faltantes: **`Visuals.missing_files()`** (`visuals.gd:384-412`) recorre todo lo declarado y devuelve lo que no está en disco, y **`tests/core/test_visuals.gd` (631 líneas, 40 tests)** lo exige junto con el contrato de animaciones, los pares fuente↔exportado, los tamaños en celdas y la paleta. Más `./mapas.sh` (342) y `estilo_mapa.gd` (228) | Verifica **existencia de lo declarado**, no «qué falta por hacer»: no hay progreso, no hay lista de pendientes (viven en GitHub Issues), y **sólo corre dentro de Godot**. Son 1200 líneas de validador que el segundo juego vuelve a escribir |
| 19 | **Apuntador juego↔asset** (`data/visuals.json`) | **no existe** como cosa de PGS | **2673 líneas a mano**, 128 KB, 21 secciones, cada una con su forma: más de 25 formas distintas sólo en seis secciones (`{pss, size, shadow}`, `{kind, set, lies_down, view_scale}`, `{tileset, cell, size}`, `{painting, vivo, rival, noche}`, string pelado…). Lo lee `visuals.gd` (435) | Sin esquema y sin validador propio. Editarlo con `json.dump` **reformatea el archivo entero**, así que hay que tocarlo con scripts línea por línea — el archivo que más fricción generó entre agentes. Dos claves (`characters_dir`, `monsters_dir`) ya quedaron huérfanas y nadie se enteró |
| 20 | **Andamio: jugar antes de dibujar** (`data/arte_provisorio.json`) | a medias | 226 líneas, **37 entradas** (23 adornos, 6 pisos, 6 actores, 2 telones) para la cueva de Fundación. Cada id que falta apunta a uno **que ya existe** y declara el tamaño en celdas que el mapa espera. `visuals.json` siempre gana, así que el día que llega el arte se registra allá y la entrada muere sola. Resuelto en 20 líneas de `visuals.gd` | **La mejor idea del proyecto** y la más barata: deja jugar un mapa entero antes de dibujarlo, y es a la vez **contrato de dimensiones** (si el arte nuevo no mide eso, hay que rearmar el mapa). Matiz: no es arte prestado del pack, es canibalismo del arte propio. Pero es del juego: PGS no la conoce, y el segundo juego la vuelve a inventar |
| 21 | **El pack prestado como materia prima** | ya está | 90 PNG CC0 (896 KB) que produjeron 396 MB de salida propia: `import_character`, `png_fit`, `png_knockout`, `stamp`, `face_points`, `variant` | Funciona tan bien que **el pack ya no aparece en runtime**: los 126 actores son `kind: "pss"` y el único consumo real es build-time. La capacidad está entera en PSS; lo que falta es que PGS sepa que un proyecto *tiene* un pack de arranque |
| 22 | **Importación al motor** (Godot) | a medias, por accidente | PSS exporta PNG 1:1 + JSON estilo Aseprite (frameTags, duraciones, loop) y el juego lo arma **en runtime**: `AtlasTexture`/`SpriteFrames` construidos a mano en **5 archivos GDScript** (`character_sprite.gd` 263 es el núcleo). Los 1219 `.import` los genera Godot con `--headless --import` desde `test.sh` | **Hay exactamente un `.tres` en el repo y es el tema de UI.** Ningún recurso de arte serializado: ni `SpriteFrames`, ni `TileSet`, ni `AtlasTexture`. Ningún addon. Los 5 shaders son del juego. Es el issue #68, ya estimado en **un día** |
| 23 | **El build de assets** | a medias | `arte.sh` (348 líneas, 9 subcomandos, ~118 de Python en heredocs) + `sonido.sh` (83). El default reconstruye los 792 assets desde los 666 `.txt` y reexporta todo: **~5 minutos, sin incremental** | Cada rubro nuevo agrega un subcomando y un script. No hay CI, ni watcher, ni hook que encadene «exportar → reimportar». PGS debería *ser* este build |

---

## 3. La hipótesis del pegamento: confirmada a medias, y el resto es peor

**La hipótesis:** lo que más frena no es generar píxeles sino el pegamento — cómo un
juego declara qué assets necesita, cómo se sabe cuáles faltan, cómo entra el arte
prestado mientras tanto, y cómo se exporta al motor.

**Veredicto: confirmada en la mitad, y la otra mitad es más grave.** Las cuentas de lo
que el segundo juego tendría que volver a escribir:

| Qué | líneas | ¿se reusa? |
|---|---|---|
| **Pegamento** | | |
| `visuals.json` + `arte_provisorio.json` + `sonidos.json` (los apuntadores) | 3 220 | **no** |
| `visuals.gd`, `character_sprite.gd`, `lighting.gd`, `estilo_mapa.gd`, `telon_vivo.gd`, `sound_book.gd`, `sonido.gd` + 3 shaders | 2 253 | **no** |
| `test_visuals.gd` + `mapas.py` (los validadores de assets) | 973 | **no** |
| `arte.sh` + `sonido.sh` (el build) | 431 | **no** |
| Orquestadores de PSS en Python (`personajes`, `telones`, `cuerpos_pelea`, `meridianos`, `caras_bestias`) | 1 208 | **no** (serían recetas) |
| **Subtotal pegamento** | **8 085** | |
| **Dibujo que PSS no sabe hacer** | | |
| `zonas_fundacion.py`, `raices.py` (cavernas, ruido con semilla, grietas) | 3 973 | **no** |
| `piso_terraza.py` (losas con juntas y musgo) | 563 | **no** |
| `hud_pelea.py` (rombos isométricos, marco de 9 partes, orbe y pips) | 482 | **no** |
| `bestias_forja.py` | 240 | **no** |
| `orillas_mapas.py` (parches anchos de borde irregular) | 231 | **no** |
| `marcos_cartas.py` (marcos de 9 partes) | 214 | **no** |
| **Subtotal dibujo afuera de PSS** | **5 703** | |
| **Total a rehacer** | **≈13 800** | **0** |

(Quedan afuera 1266 líneas de `raices_mapas.py`, `zonas_mapas.py` y los datos de mundo:
son contenido del juego, no arte.)

Dos lecturas, y la segunda es la que corrige la hipótesis:

1. **El pegamento es el 59 %** y es el que bloquea el *arranque*: sin él no se puede
   ni empezar. Confirmado. Y no es pegamento tonto: `arte.sh` es un build de cinco
   minutos sin incremental, y `test_visuals.gd` es un validador de 631 líneas que sólo
   corre dentro de Godot.
2. **El 41 % restante es dibujo**, y PSS no lo toca. Son 5703 líneas de algoritmos de
   pixel art escritos en Python **con dos menciones a `pss` o ninguna**: ruido
   determinista, cavernas, losas, marcos de nueve partes, rombos isométricos, orbes.
   Y parte de eso **duplica** pasos `map_*` que ya existen (cavern, gloom, soften,
   rampas de sombra), que es el problema del issue #1 asomando del otro lado: los
   pasos están tan pegados a su escena original que el juego prefirió reescribirlos.

Es exactamente el caso espejo que `ROADMAP_NEXT.md` ya nombró cuando `tocado`,
`bigote` y `vincha` vivían en el juego siendo capacidades de PSS. Entonces eran tres
funciones; hoy son siete scripts y 5703 líneas.

**Y dos huecos donde el problema no es el pegamento ni el volumen, sino que no hay nada:**

- **Tipografía** (fila 13). No está a medias: no existe, y se nota tanto que un juego
  de pixel art con snap a píxel renderiza todo su texto con una fuente vectorial
  antialiaseada. Ningún pegamento arregla eso.
- **Interfaz y HUD** (filas 9 y 11). 696 líneas de Python dibujando marcos y orbes,
  más un tema de Godot con rectángulos redondeados. PSS declara `ui` como una de sus
  cinco categorías de asset y tiene cero capacidad de generar una.

**Reformulación final:** el pegamento es lo que impide **arrancar**; la tipografía y la
UI son lo que impide **terminar**; y los 91 pasos de mapa son lo que hace que el
volumen cueste lo mismo la segunda vez. Las tres cosas entran en el mismo orden de
trabajo, y las dos de dibujo son más baratas de lo que parecen.

---

## 4. «Un juego nuevo en una fracción del tiempo»: el flujo, como si existiera

Hoy arrancar el arte de un juego nuevo es: escribir un `visuals.json` a mano, escribir
un `arte.sh`, escribir quince scripts de Python, escribir un `character_sprite.gd` y un
validador de 631 líneas que avise cuando algo falta. Semanas antes del primer sprite.

Así debería ser. El objetivo de cada paso es que **nadie escriba pegamento**.

**1. `pgs init`** — el proyecto nace en el repo del juego, no en la nube.

```
pgs init nombre=secta_del_pino motor=godot perspectiva=top-down celda=16
```

Escribe en el repo del juego `pgs/proyecto.json` (motor, celda, escala en mapa y en
pelea, contrato de animaciones, dónde va cada rubro), `pgs/paleta.json` y
`pgs/assets.json` vacío. En el proyecto de Godot instala `addons/pgs/`: el cargador del
apuntador, el armador de `SpriteFrames` desde el JSON de hojas (hoy 5 archivos de
GDScript lo hacen a mano), los shaders de píxel nítido, suelo vivo y telón vivo, el
contrato de luz/sombra/niebla y el reproductor de sonido por libro. Eso es el issue #68.

**2. `pgs paleta`** — la paleta madre desde un pedido, no a mano.

```
pgs paleta pedido="xianxia de montaña: piedra húmeda, bambú, tinta, qi violeta" n=40
```

Devuelve la paleta con nombres **y rampas por material** (cada color sabe su sombra y
su luz), que es justo lo que hoy se escribe a mano en los 23 `materials` de las recetas
de suelo. Se mira con `palette_show`, se ajusta, y desde ahí todo la respeta por `lint`.

**3. `pgs leer`** — el manifiesto se **deriva**, no se escribe.

```
pgs leer
```

Lee los datos del juego (mapas, encuentros, cartas, objetos, técnicas, diálogos) y
escribe en `pgs/assets.json` lo que esos datos *implican*, con su tamaño en celdas y su
contrato de animaciones: «el mapa `aldea` nombra 31 adornos»; «`cards.json` tiene 63
cartas, cada una con ilustración y marco»; «`encounters/` nombra 7 bestias, cada una
con cuerpo de mapa, cuerpo de pelea y retrato»; «cada actor con diálogo necesita
retrato». No es ciencia ficción: `map_from_game` ya lee un mapa del juego y saca su
grilla y las huellas de sus adornos, y `Visuals.missing_files()` ya recorre esta lista
—sólo que adentro de Godot y para un juego solo.

**4. `pgs falta`** — la pregunta que hoy nadie puede contestar.

```
pgs falta
```

```
adornos      221 declarados   198 hechos    23 faltan   (12 con andamio)
suelos        99              99            —
personajes    35              26             9 faltan   ( 9 con andamio)
retratos      34              24            10 faltan
cartas        63              43            20 faltan
sonidos       83              83            —
fuentes        2               0             2 faltan   ← nada puesto
ui             1 tema          0             marco, panel, barra, botón
```

Una tabla en la terminal, con alarmas, como las quince herramientas de inspección del
juego. Reemplaza las 631 líneas de `test_visuals.gd`, corre sin abrir el motor y, a
diferencia de ellas, contesta **antes** de hacer el trabajo. `--todo` lista id por id.

**5. `pgs andamio`** — jugar antes de dibujar.

```
pgs andamio
```

Para cada id que falta elige el más parecido entre lo que ya hay —el arte propio
primero, el pack de arranque después— que **respete el tamaño en celdas** que el juego
espera, y lo escribe en `pgs/andamio.json`. El addon lo resuelve al cargar con la regla
de oro ya probada: **lo real siempre gana**, así que el día que el arte llega no hay
que borrar nada. Es `arte_provisorio.json` ascendido a capacidad del motor, y es lo que
permite vestir un juego de atrás para adelante.

**6. `pgs hacer <rubro>`** — la parte que PSS ya sabe, en lote.

```
pgs hacer personajes        # figure / stamp / face_points / variant
pgs hacer suelos            # recetas de mapa → map_export
pgs hacer cartas            # generate → illustrate (con caché de renders)
pgs hacer ui                # 9-slice, marcos, barras, orbe, pips   ← nuevo
pgs hacer fuente            # hoja de fuente + métricas             ← nuevo
pgs hacer sonido            # recetas → WAV + partituras → música
```

Un subcomando por rubro, cada uno manejado por una receta JSON en el repo del juego.
Acá mueren los quince scripts de Python: `personajes.py` se vuelve `pgs hacer
personajes`, `hud_pelea.py` se vuelve `pgs hacer ui`, `marcos_cartas.py` se vuelve un
comando de nueve partes. La receta queda; la decisión en Python, no. Y cada rubro trae
**una receta de ejemplo** —lo que hoy el sonido no tiene— para arrancar copiando.

**7. `pgs control`** — la hoja antes de decidir.

```
pgs control --nuevo
```

Todo lo hecho desde el último control, al lado de la figura de referencia, sobre la
línea de piso, con grilla y nombres, más el lint. Ya existe (`contact` + `lint`); lo
nuevo es que sepa qué es «nuevo» y que recorra el manifiesto en vez de una lista de ids
escrita a mano.

**8. `pgs exportar`** — y el motor ya lo tiene puesto.

```
pgs exportar --cambiado
```

Escribe las hojas PNG 1:1 con su JSON, **los `.tres` que Godot espera** (`SpriteFrames`,
`AtlasTexture`, `TileSet`), los WAV con su punto de loop, la fuente bitmap, y actualiza
el apuntador del juego con escrituras quirúrgicas que no mueven las líneas de otro
agente. Y sólo lo que cambió: los cinco minutos de `arte.sh` son cinco minutos cada vez
que alguien toca un píxel.

**Y los retoques desde la app.** `pgs/` es una carpeta en el repo del juego, así que la
app abre un asset por ruta —como ya hace `/dibujo` con los dibujos de texto— lo retoca
con mouse, línea de tiempo y piel de cebolla, guarda sobre el `.txt`, y el agente sigue
sobre lo guardado. Esa mitad ya está hecha. Lo que falta es que la app vea el
**proyecto** (el manifiesto, lo que falta, la paleta) y no sólo el archivo; hoy el
headless trabaja contra archivos en disco y la app contra Supabase, y **los dos mundos
no se hablan**.

**El día uno realista con esto:** `init`, `paleta`, `leer`, `andamio` → el juego se
camina entero con andamio, con la lista de lo que falta en la terminal, antes de dibujar
un píxel. Después, rubro por rubro, el andamio se cae solo.

---

## 5. El orden

**Criterio:** primero lo que **desbloquea** el arranque de un juego nuevo, no lo que es
más lindo ni lo que está más cerca de terminarse. Un rubro desbloquea si sin él no se
puede empezar; el resto es volumen, y el volumen se hace con andamio puesto.

Y la regla del borde de `ROADMAP_NEXT.md` vale para todo esto: cada cosa que cruza del
juego a PGS, el commit contesta en una línea **por qué generaliza**.

### Sin decidir nada grande — se puede empezar mañana

| orden | qué | por qué desbloquea | tamaño |
|---|---|---|---|
| **1** | **Manifiesto y `pgs falta`** (pasos 3 y 4) | De esto cuelga todo lo demás: sin «qué necesita este juego» no hay andamio automático, no hay progreso, no hay export incremental y el validador sigue siendo un test de 631 líneas por juego que sólo corre en Godot. Primer caso real gratis: leer `visuals.json` y los 23 mapas de The Unwritten Dao y reproducir lo que hoy contesta `Visuals.missing_files()`, **sin abrir el motor** | mediano |
| **2** | **`pgs andamio`** (paso 5) | Convierte «vestir un juego» en reversible: se juega primero, se dibuja después. Ya está diseñado y probado en 226 líneas de datos y 20 de código; subirlo a PGS es casi mudanza, y la regla «lo real siempre gana» ya está validada. Depende del manifiesto | chico |
| **3** | **El addon de Godot y `pgs exportar`** (pasos 1 y 8) | Es el issue #68, ya estimado en **un día**. Sin esto el segundo juego reescribe el armado de atlas en 5 archivos de GDScript, los cinco shaders, el cargador del apuntador y el reproductor de sonido. Mayor devolución por línea escrita de toda la lista. Si además exporta sólo lo cambiado, se van los cinco minutos de `arte.sh` | mediano |
| **4** | **Tipografía** (Fase 9.2) | El agujero más barato con más impacto visible: un juego entero salió con la fuente vectorial de Godot. No depende de nada, no bloquea a nadie, se nota en cada pantalla, y `from_ascii` + `export_sheet` ya son casi toda la maquinaria | mediano |
| **5** | **UI y HUD: 9-slice, marcos, paneles, barras, orbes** | El rubro más universal que PSS ignora, y declarado en su propio modelo de datos. Se destila de `hud_pelea.py` (482) y `marcos_cartas.py` (214), que son el caso espejo exacto de `tocado`/`bigote`/`vincha` | mediano |
| **6** | **Recetas de ejemplo para sonido y música** | El motor está entero y es bueno, y el repo no trae **ni una** receta ni una partitura: el próximo juego hereda la capacidad y ninguna referencia. Es casi gratis y es la única forma de que una colección se justifique según el principio del 6 de octubre: ejemplos que ayudan a generar | chico |
| **7** | **`pgs paleta`** con rampas por material y auto-shade | Chico y habilitante: las rampas ya las piden `map_material` y `figure`, y hoy se escriben a mano receta por receta | chico |
| **8** | **Props generativos** (Fase 7) | 267 adornos a mano fue el rubro más caro en horas. No desbloquea el arranque (el andamio lo tapa), así que va después de lo que sí | grande |

### Necesita una decisión de Joaquín antes de tocar código

| qué | la decisión | por qué no se puede esquivar |
|---|---|---|
| **Los 91 pasos de mapa** (issue #1 de PSS) | ¿Congelar, separar como biblioteca de ejemplos, destilar en pasos genéricos con opciones, o usarlos como semilla para generar mapas nuevos? | Son el 67 % de la superficie MCP y el 48 % del motor headless, con 116 tests de regresión que **congelan** las decisiones de este juego. Y el síntoma ya cruzó de vuelta: el juego reescribió cavernas, penumbra y rampas de sombra en Python porque los pasos no servían afuera de su escena. Mientras no se decida, los mapas del próximo juego cuestan lo mismo, y la regla «no se agranda» congela el rubro más grande |
| **Vóxeles como fuente de píxeles** (`docs/ideas.md`) | ¿Se cambia la fuente del dibujo —modelos de vóxeles en texto + renderizador ortográfico— o se sigue dibujando por ángulo? | Es la apuesta grande: daría isométrico, ocho direcciones coherentes y animación barata de un golpe, y haría irrelevantes varias filas del inventario (incluidos los rombos isométricos de `hud_pelea.py`). Pero sólo paga si el próximo juego los pide. Son unos cientos de líneas con tests; el trabajo verdadero es el gusto de los modelos |
| **Dónde vive el proyecto** | ¿`pgs/` es una carpeta en el repo del juego, versionada con él, o una fila en Supabase? | El objetivo dice «eventualmente poder hacer retoques desde la app». Esta auditoría asume **carpeta en el repo** (el manifiesto cambia con el juego y tiene que entrar en el mismo commit; la app lo abre por ruta como ya hace `/dibujo`). Pero hoy el headless guarda archivos en disco, la app guarda en Supabase, y **no hay puente**: la jerarquía es plana (proyecto → sprites), sin colecciones ni tipos de asset. Condiciona los pasos 1, 3 y 8 |
| **El pack de arranque** | ¿PGS trae su propio pack de andamio, o cada juego trae el suyo? | El pack CC0 de 896 KB produjo 396 MB de arte propio y hoy no aparece en runtime: es materia prima pura, y funcionó. Si el andamio se vuelve capacidad de PGS hay que decidir si PGS trae un pack —una colección, justificable sólo si **ayuda a generar**, por el principio del 6 de octubre— o si el proyecto lo declara |

### Lo que no haría ahora

- **Sandbox de gameplay** (E.2) y **modo de proyecto** (8.2): lindos, y el sandbox
  incluso valida el contrato de export, pero ningún juego se frena por no tenerlos.
- **Terminar las Core 8** (ATTACK, HURT, CAST, DIE): el juego ya pelea con `figure`,
  que resuelve las seis del contrato. Es pulido de un rubro que ya está verde.
- **Monetización, galería, marketplace, Playwright**: otro eje. No tocan la brecha.

---

## 6. Lo que esta auditoría da por bueno

Tres cosas funcionan tan bien que conviene no tocarlas y, sobre todo, **copiar su
forma** en lo que falta:

1. **Sonido** (filas 14 y 15). Un frente entero —83 efectos y 12 piezas— resuelto con
   dos comandos y 83 líneas de bash, con revisión numérica para quien no tiene oídos.
   Es el molde: receta de texto en el repo del juego, comando puro y determinista en
   PGS, y una tabla que avisa sola cuando algo está mal. Lo único que le falta es traer
   un ejemplo.
2. **El arte como texto** (`from_ascii`/`to_ascii`, 666 dibujos con ida y vuelta exacta
   y tests sobre los dibujos reales del juego). La fuente de verdad es legible,
   diffeable y editable por un agente **y** por una persona en el editor. Cualquier
   rubro nuevo de PGS debería tener su formato de texto.
3. **El control antes de decidir** (`contact`, `lint`, `map_compare`, `sound_contact`,
   `map_lint`). Joaquín decide mirando, y para eso hay hojas. Un rubro nuevo sin su
   hoja de control no está terminado.

Y una cuarta, que no es de PSS pero es la que más tiempo ahorró: **el andamio**. Treinta
y siete líneas de datos dejaron jugar una cueva entera antes de dibujarla. Si PGS se
lleva una sola idea del juego, que sea ésa.
