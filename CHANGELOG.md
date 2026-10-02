# CHANGELOG - Pixel Sprite Studio

El registro histórico completo de la evolución del proyecto, desde su concepción hasta hoy.

---

## 2026-10-02 (Hoy)

- **Headless**: **`cutout`: una pieza que se mueve, sacada de un telón quieto**. Las capas por profundidad hacían mecer medio telón y el suelo donde se pelea parecía temblar; *The Unwritten Dao* quiere mover sólo lo que se mueve (las nubes, la cascada, el bote, la llama). `cutout path= out= base_out= rect=|polygon=|mask=` corta las celdas de la zona cuyo color pasa el filtro (`colors`, `min_lightness`/`max_lightness`, `grow` para llevarse el borde) a una pieza con alfa, y escribe el telón sin ella con el hueco pintado por la celda más cercana de la fila o la columna (`fill`), para que la pieza se corra unos píxeles o parpadee sin mostrar una copia debajo. Se encadenan: cada `base_out` es el `path` del siguiente.
- **Tests**: 1 test nuevo (`backdrop.test.ts`): corta las nubes del cielo y no el mismo gris del monte, pinta el hueco con el cielo de la fila, crece un píxel por claridad y el comando escribe pieza y base.
- **Headless**: **Telones arreglables, en capas y con sus luces** (`edit_zone`, `depth`, `layers`, `lights`). La IA no cerraba la boca de luz de una cueva y un telón era una imagen plana con luces puestas a ojo. `edit_zone png= out= prompt= polygon=|rect=|mask=` manda la zona (con contexto; `context=4` = la imagen entera, así el modelo no reencuadra) y una instrucción al modelo de edición, y vuelve a componer **sólo dentro de la zona**, con borde suave (`feather`) y llevando la respuesta al tono de lo de afuera (`match`: el modelo regradúa todo, más cálido y claro, aunque se le pida que no); `answer=` guarda la respuesta y `from_answer=` la recompone sin volver a pagar. `illustrate base= polygon=` redibuja sólo esas celdas sobre la ilustración vieja (la zona en fracciones del render, mapeada por el mismo corte). `depth` pide un mapa de profundidad (depth-anything v2 en fal); `layers` parte la ilustración en capas de lejos a cerca con alfa, pintando cada una unas celdas por debajo de las de adelante para que al correrse no se abra un hueco. `lights` encuentra las luces pintadas (núcleos claros y vivos, unidos si están cerca) con centro, color y radio del resplandor, y las escribe en JSON. **PSS lee JPEG** (`jpeg-js`): el modelo de edición contesta JPEG aunque se le pida PNG, y `generate` ahora entrega PNG igual. Primer consumidor: los telones de pelea de *The Unwritten Dao* (la cueva y las raíces cerradas, cinco telones en tres capas, las antorchas donde están pintadas).
- **Tests**: 8 tests nuevos (`backdrop.test.ts`): JPEG leído y convertido; zonas por rectángulo, polígono y máscara; la zona vuelve sólo adentro y el resto queda igual; el tono se empareja y una respuesta guardada se recompone; `illustrate base=` cambia sólo la zona; capas (lejos opaca, cerca sólo lo suyo, relleno debajo); `depth` con fetch inyectado; dos antorchas encontradas con su color y un resplandor más ancho que la llama.

- **Headless**: **`illustrate` pinta telones: dither ordenado y hasta 512 px**. Los telones de pelea de *The Unwritten Dao* (320 × 180, a 4x llenan 1280 × 720) salían en franjas: una paleta chica no tiene los tonos del medio de una niebla que se aleja o un cielo que aclara. `dither` (0..1) mezcla en damero Bayer 4 × 4 los dos colores más cercanos de la celda, sólo si están a menos de `dither_reach` (OKLab, 0,12 por defecto: un tronco oscuro nunca se salpica de cielo); con `quantize=palette` el segundo color también sobrevive a la poda. El tope de `width`/`height` pasa de 256 a 512.
- **Headless**: **`generate image=<png local>`**: la imagen de referencia del modelo de edición sale de un archivo (como data URI), para corregir un render con una instrucción en vez de pedir otro. (El modelo de edición contesta JPEG: ver `edit_zone`, más arriba.)
- **Tests**: 2 tests nuevos (`headless.test.ts`): un gris del medio se vuelve damero de sus dos vecinos y nunca entre colores lejanos; `pngDataUri` arma el data URI y rechaza lo que no es PNG.
- **Headless**: **Delantal en `figure`**. Duan Lie, el del Horno Rojo de *The Unwritten Dao*, necesitaba su delantal de cuero para no ser «otro de túnica roja», y el rig sólo sabía túnica, faja y falda. `apron` (`tones`, `from` 0 cintura a 1 pecho, `length` de la cadera a la suela, `trim` del ruedo) cuelga un paño delante del torso y entre las rodillas, como pieza propia: una línea de tinta lo separa de la ropa de atrás y acompaña la guardia, el golpe y la caída.
- **Tests**: 1 test nuevo (`headless.test.ts`): el delantal se ve de frente, menos de espaldas, y ningún cuadro queda con piezas sueltas.
- **Headless**: **Chibis de 3 cabezas en `figure`, con la cabeza dibujada a mano**. Los peleadores de proporción realista (6–7 cabezas) quedaban flacos y chicos al lado de los chibis del mapa de *The Unwritten Dao*. `build.heads` (2.5 a 4) arma el cuerpo de chibi: cabeza grande, torso ancho y corto, miembros cortos, manos de mitón y pies grandes, con las articulaciones colgando unas de otras para que la guardia, el golpe o la caída conserven su forma; boca y cuello de vuelta entera. `head_art` (por vista: `front`, `back`, `front_shut`, `back_shut`; filas de glifos con leyenda y ancla) pega sobre la articulación de la cabeza una cabeza dibujada en píxeles (la misma cara y el mismo pelo del sprite del mapa, que una cápsula no sabe dibujar), con su profundidad para que un brazo pase por delante; el contorno lo pone la figura. Con cabeza dibujada, `die` termina de rodillas (una cara derecha no se acuesta). Pelo `bob` y `hair.crown`. Primer consumidor: vos y Lin en la pelea en diagonal.
- **Tests**: 1 test nuevo (`headless.test.ts`): el chibi de 3 cabezas tiene el contrato entero sin piezas sueltas, la cabeza más ancha que la cintura, y la cabeza dibujada aparece.
- **Headless**: **Peleadores de cuerpo entero dibujados por un rig** (`figure`). El motor de anatomía mueve píxeles de una pose dibujada y a 16 px no hay cuerpo que mover: en la pelea en diagonal de *The Unwritten Dao* los chibis escalados a 7x eran cabezas gigantes sin cuerpo. `figure recipe= out= view=front|back` arma el cuerpo con cápsulas en 3D (cabeza, pelo, torso, brazos, piernas, falda de túnica), lo posa con una tabla de poses (guardia, paso, golpe, juntar y empujar el qi, retroceso, caer de rodillas) y lo proyecta en 3/4: de frente mirando abajo a la izquierda (un rival) o de espaldas mirando arriba a la derecha (tu lado). Z-buffer, tres tonos por material con una luz fija, contorno de tinta y tinta donde un brazo cruza el cuerpo; ojos sólo si se ven; aura y luz entre las palmas en la técnica. Cada cuadro sale entero: la cabeza no se despega nunca. Primer consumidor: los once cuerpos de pelea de *The Unwritten Dao*.
- **Tests**: 2 tests nuevos (`headless.test.ts`): el contrato entero, sin piezas sueltas en ningún cuadro, sólo con los colores de la receta y de unos 30 px de alto; de frente golpea hacia la izquierda y de espaldas hacia la derecha.

## 2026-10-01
**9 commits realizados**

- **MCP**: **Respuestas cortas para agentes**. Un comando que escribe (`new`, `draw`, `from_ascii`, `variant`, `pixelize`, `png_fit`, `sound`…) contesta una línea (`ok from_ascii: farol 16x32 · 1 cuadros · idle`) y la imagen sólo con `preview: true`; antes devolvía el resumen entero del asset (con la paleta) y una imagen en cada llamada, y un agente de *The Unwritten Dao* gastaba cientos de miles de tokens en eso. Los que miran (`render`, `contact`, `lint`, `ascii`, `info`, `palette_show`, `sound_contact`) siguen igual. Nuevo `inspect`: el detalle de un asset. La CLI no cambia. Lógica en `brief.ts`.
- **Tests**: 2 tests nuevos (`headless.test.ts`): una línea sin paleta ni imagen salvo `preview`; los que miran conservan la imagen e `inspect` trae la paleta.

- **Headless**: **Las ilustraciones guardan lo chico y vivo**. `illustrate` suma `accent` (una celda con al menos esa fracción de píxeles saturados y claros toma ese color: chispas, grietas encendidas, hojas sobre piedra; antes perdían contra lo oscuro de alrededor) y `quantize=palette` (las celdas van directo a la paleta de `fit` por distancia OKLab, que sigue el tono, y los menos usados se pliegan en el más cercano hasta `max_colors`; el corte de mediana fundía un humo violeta o una brasa en una caja más grande antes de llegar a la paleta, y redmean mandaba un azul noche al verde oscuro). Primer consumidor: siete ilustraciones rehechas de las cartas de *The Unwritten Dao* (la brasa, la puerta con su aro, el humo del veneno).
- **Tests**: 1 test nuevo (`headless.test.ts`): una línea naranja de 1 px sobre piedra sobrevive con `accent` y no sin él; con `quantize=palette` el azul noche va al gris violáceo, sólo se usan colores de la paleta y no más que `max_colors`.

- **Headless**: **Ilustraciones de borde a borde** (`illustrate`). `pixelize` recorta a la figura y saca el fondo: sirve para un sprite, no para el dibujo de una carta. `illustrate png= width= height=` corta el render a la proporción pedida alrededor de un foco (`focus_x`, `focus_y`), cada celda toma el promedio o el color que más se repite (`sample=mode`), conserva las líneas oscuras finas (`outline`), aplana el fondo (lo que toca el borde inundado hacia adentro con una tolerancia: un cielo en degradé deja de salir moteado) y dibuja un contorno de 1 px alrededor de la figura (`contour`); después `fit` a una paleta y `despeckle`. `generate` acepta `image_size` (`landscape_4_3`…) para pedir una escena apaisada. Primer consumidor: las ilustraciones de 56 × 36 de las cartas verticales de *The Unwritten Dao*.
- **Tests**: 2 tests nuevos (`headless.test.ts`): el corte toma el lado del foco, nada queda transparente y un objetivo ancho conserva las dos mitades; un cielo en degradé queda de un solo color y la figura lleva su contorno.

- **Headless**: **Piezas separadas**. `lint` con `pieces` (o `pieces_ids` para algunos assets) avisa, cuadro por cuadro y con el nombre de la animación, de un grupo de 4 px o más que no toca el cuerpo ni en diagonal: la coronilla despegada por una fila vacía, un moño que quedó atrás. Nuevo `detachedPieces` en `inspect.ts`. Primer uso: `./arte.sh control` del juego en personajes, pelea y bestias.
- **Motor de anatomía**: **El lanzamiento y el golpe recibido ya no parten la cabeza**. `generateCast` subía la cabeza uno o dos píxeles y abría una fila transparente sobre el cuello (en un chibi de 16 px, la mitad de arriba de la cabeza flotando en dos de los cuatro cuadros); ahora la estira (`stretchPixels`) y cierra lo que quede con `sealGaps`, nuevo en `transforms.ts` (un hueco corto dentro de una columna que la base no tenía toma el color de arriba; los huecos de la base, entre las piernas o bajo un brazo, quedan). `generateHurt` rotaba la cabeza 15° y en menos de 32 px la deshacía en fragmentos: abajo de 32 px el cuerpo retrocede entero; desde 32, la rotación se sella. Lo encontró Joaquín en *The Unwritten Dao* (los 28 personajes y bestias rearmados, ninguno con piezas sueltas).
- **Tests**: 2 tests nuevos (`headless.test.ts`): cast y hurt dejan un chibi en una pieza y sin filas vacías (falla con el motor de antes); `lint pieces` encuentra la coronilla separada, la nombra `idle 1`, ignora lo menor al mínimo y une lo que se toca en diagonal.

- **Headless**: **Música desde partituras de texto**. `music` rinde una `.partitura` a WAV: encabezado (tempo, compás, semilla, loop, humanización leve con semilla en tiempo y fuerza, un poco de sala, cola), instrumentos con nombre y voces de notas que se leen (`A3 q`, `E4 h.`, acordes `A3+E4`, silencios `r`, golpes `x`, la duración sigue valiendo hasta que cambie, dinámicas `pp`…`ff`, acentos `>`, apoyaturas `~`, repeticiones `[ … ]x3`); `|` comprueba que el compás cierre y el error nombra la línea. Un loop suma al principio todo lo que suena pasado el final (la cola de las cuerdas y de la sala): queda exactamente periódico y la vuelta no se oye. Los instrumentos son capas de receta afinadas a un `base` y tocadas a la altura de cada nota; vienen de fábrica cítara (guzheng), qin, gotas, cuenco, campana, gong, tambor, madera y bambú (sólo pulsados y golpeados), y un juego puede traer los suyos en JSON. Primer consumidor: el leitmotiv de *The Unwritten Dao* y sus diez variantes.
- **Sonido**: **Cuerda pulsada mejor** (`string`): afinada exacta con un pasa-todo para la fracción de muestra (la `pluck` redondeaba el período: Mi5 salía un cuarto de tono alto), dura lo mismo en cualquier altura (`ring`, segundos hasta -60 dB), púa más o menos dura (`bright`) y punto donde se pulsa (`pick`, un peine sobre la excitación). **Cuenco y campana reales** (`bell`): parciales inarmónicos que se apagan cada uno a su ritmo (los agudos primero), partidos en dos modos cercanos que baten despacio. Filtro `peak` (realce o corte, la caja de resonancia) y `track: false` para resonancias fijas que no siguen la nota. `pluck` no cambia: los sonidos ya hechos dan los mismos bytes.
- **Tests**: 12 tests nuevos de música (`src/headless/sound/music.test.ts`): lectura de notas, duraciones, acordes, repeticiones y dinámicas; errores con línea; bytes reproducibles; el loop empalma aunque una nota suene a través del corte; niveles; la humanización mueve poco; la cuerda afinada a menos de 6 cents de La2 a Mi5; dura su `ring` grave o aguda; el cuenco se oscurece al apagarse; y el comando con una carpeta, un instrumento propio y texto en línea.

- **Headless**: **Sonido sintetizado desde recetas**. `sound` convierte una receta JSON en un WAV PCM 16 bit mono (22050 o 44100 Hz): capas que se mezclan, cada una con su fuente (seno, triángulo, cuadrada, sierra, ruido blanco/rosa/marrón, cuerda pulsada Karplus-Strong, crepitar de ráfagas al azar) o sub-capas, filtros (pasa-bajos/altos de un polo o biquad, pasa-banda), envolvente ADSR, LFO sobre volumen, frecuencia o corte (con forma `random`, un vaivén suave para el viento), eco y eventos que repiten la capa a intervalos con semilla (pájaros, golpes de bambú, tazas). Misma receta y semilla, mismos bytes; cada capa tiene su propio generador. `loop: true` empalma el final con el principio con un fundido de igual potencia y escribe el punto de loop en un chunk `smpl` (Godot lo importa como loop). Nada satura: un limitador deja todo pico bajo -0,5 dBFS; `normalize` lleva el pico a un valor.
- **Headless**: **Revisar sonido sin oídos**. `sound_contact` da por cada WAV duración, pico y RMS, DC, centroide espectral (grave ↔ agudo), si el loop empalma (salto contra el paso usual y prueba de click a través del empalme), si un efecto arranca y termina en silencio, y clicks (con su segundo); `out` dibuja las ondas en una hoja PNG. Primer consumidor: el `./sonido.sh` del juego (54 sonidos).
- **Tests**: 12 tests nuevos de sonido (`src/headless/sound/sound.test.ts`): bytes reproducibles, capas independientes, empalme del loop y detección de uno roto, nada satura, bordes en silencio y sin DC, cada fuente suena y el centroide distingue grave de agudo, eventos en su lugar, clicks, ida y vuelta del WAV con su loop, errores con nombre, y los dos comandos.

- **Editor**: **Abre y guarda los dibujos de texto**. Nueva página `/dibujo` (sin cuenta ni nube): ABRIR .TXT (o pegar el texto) carga tamaño, paleta con nombres, cuadros y animaciones (con duraciones y loop) en el editor de siempre, con línea de tiempo, piel de cebolla y capas; GUARDAR escribe el mismo `.txt` en su lugar (File System Access API en Chrome/Edge; en otros navegadores lo descarga con el mismo nombre). Un dibujo abierto y guardado sin tocar es el mismo texto, glifos incluidos; un píxel retocado cambia un carácter. Lo que el texto no guarda (capas que se aplanan, capas ocultas, opacidad de capa, píxeles fuera de un lienzo no cuadrado, etiquetas con espacios, comentarios `#`, anatomía) se avisa al guardar y se puede cancelar. Los lienzos no cuadrados se abren en un cuadrado y se recortan al guardar. Primer caso: el guardián de piedra del juego, retocado y guardado desde el navegador.
- **Headless**: `fromAscii` devuelve el `layout` del texto (glifo de cada color, qué animaciones tenían línea `anim:`, `fit:`, comentarios) y `toAscii` lo respeta: ida y vuelta exacta sobre los 79 dibujos del juego (antes ninguno volvía igual: los glifos salían por índice). `ascii.ts` y el modelo (`assetModel.ts`, separado de la lectura/escritura en disco de `asset.ts`) ya no importan Node, así que el navegador usa el mismo código.
- **App**: sin `.env` la app ya no se rompe entera al arrancar: el cliente de Supabase apunta al stack local y sólo falla lo que pide datos.
- **Tests**: 79 dibujos reales del juego como fixtures (`src/headless/fixtures/dibujos`): ida y vuelta por texto y por el store del editor, el píxel retocado, colores nuevos, paleta corta respetada, lienzo no cuadrado, avisos y guardado cancelado.

- **Headless**: **La hoja de control muestra el cuadro más lleno**. `contact` acepta `frame=fullest`: de cada asset dibuja el cuadro con más píxeles pintados (el primero si empatan), no el 0. Un efecto que crece desde un punto (un destello, unas ondas, una hoja que entra por el costado) arranca en un píxel o vacío, y el cuadro 0 no decía cuánto ocupa en pantalla. Nuevo `fullestFrame` en `inspect.ts`. Primer uso: los detalles vivos del juego (el destello de lo que se puede tocar, el remolino, las ondas, la hoja) en `./arte.sh control`.
- **Tests**: 50 tests headless (1 nuevo: `fullest` elige el cuadro de la cruz y el 0 sigue siendo el punto).

- **Headless**: **La hoja de control respeta el alpha**. `contact` compone cada píxel semitransparente sobre el fondo (source-over) en vez de copiarlo tal cual: una sombra de tinta al 40 % oscurece el pasto como en el juego, en vez de verse como una mancha gris opaca, y lo mismo la niebla. Con `blend=add` los suma (color por alfa), para ver un halo de luz como lo dibuja el juego sobre un fondo oscuro. Nuevo `blitBlend` en `png.ts` (`over` | `add`). Primer uso: las sombras de contacto y el halo de las luces del juego.
- **Tests**: 49 tests headless (1 nuevo: la sombra a medio alfa oscurece el fondo y el halo se suma).

- **Headless**: **Variantes de un asset**. `variant` copia un asset a otro archivo y pinta los cambios en una capa nueva encima ("variante"): un dibujo de texto en el formato de `from_ascii` donde todo glifo menos `.` va sobre la base, y/o operaciones de `draw`. El archivo base y sus capas no se tocan nunca, así que rearmar la base y volver a correr el mismo comando rearma la variante. Devuelve cuántos píxeles pinta y cuántos cambian de verdad; con `fit`, el dibujo tiene que estar en la paleta. Primer uso: los retratos con ánimo del juego (cálido y duro, desde el neutro).
- **Paletas**: `fit` (en `from_ascii` y `variant`) y `lint` aceptan un color de la paleta con cualquier opacidad: `#rrggbbaa` pasa si su `#rrggbb` está. La niebla y las sombras son colores de la madre con alpha, no colores nuevos.
- **Tests**: 48 tests headless (4 nuevos: la variante no toca la base, cuenta lo que cambia, rechaza pisar la base, tamaños distintos y colores fuera de la paleta; y el alpha sobre la paleta).

- **Headless**: **Arte como texto**. `from_ascii` crea o reemplaza un asset desde un dibujo de caracteres con su leyenda (encabezado con id, nombre, categoría, tamaño opcional, descripción, `fit` y opciones de animación; leyenda `glifo = #hex [nombre]`; uno o más cuadros tras `== <animación> <n>`) y `to_ascii` escribe cualquier asset en el mismo formato, ida y vuelta exacta (probado sobre los 93 assets del juego: 92 idénticos, el único distinto es el que tiene anatomía). Errores con archivo, línea, cuadro, fila y columna; `fit` nombra el glifo y el hex fuera de la paleta. `glyphs_from` da a cada color el glifo de su índice en otra paleta: todos los dibujos sobre la misma madre comparten glifos. Reemplaza los cuatro conversores sueltos que escribieron los agentes del juego.
- **Headless**: **Hoja de control y lint**. `contact` pone varios assets lado a lado a escala entera, cada uno junto a un asset de referencia (el jugador) sobre la misma línea de pie, con fondo de color, grilla de N px y el nombre debajo (fuente de 3×5). `lint` revisa sin tocar nada: colores fuera de una paleta, lados que no son múltiplo de `grid`, píxeles sueltos (la regla de `despeckle`, como informe) y, para tiles, bordes opuestos que no empalman o que dejan huecos transparentes.
- **Tests**: 44 tests headless (10 nuevos: formato, errores, varios cuadros con animación, ida y vuelta, contacto y lint).

---

## 2026-09-30
**1 commit realizado**

- **Headless**: **Núcleo sin navegador, CLI y servidor MCP** (`src/headless/`, `bin/pss`, `bin/pss-mcp`). Un agente puede crear assets, importar hojas PNG 1:1 (colores exactos), dibujar, aplicar los FX procedurales (`fx`, `fx_anim` con curvas de intensidad y semilla), manejar paleta, cuadros y animaciones, y exportar hoja 1:1 + JSON estilo Aseprite (`frameTags` con `loop`, duración por cuadro). `render` devuelve la imagen por MCP. Primer consumidor: el juego *The Unwritten Dao* (Godot).
- **Modelo**: `SpriteAsset.width/height` opcionales (lienzo no cuadrado), `AnimationDef.durations` (ms por cuadro) y `AnimationDef.loop`. Sólo el lado headless los honra por ahora.
- **FX**: `drawSparks` acepta un generador aleatorio (semilla reproducible), reparte las chispas en círculo y escala cantidad y dispersión con el lienzo (calibrado a 16 px). Todos los FX aceptan lienzos no cuadrados.
- **Import**: `import_sheet … into=<asset>` agrega los cuadros de otra hoja a un asset existente (mismo tamaño de cuadro, paleta fusionada por hex, tags con índices corridos). Sirve para juntar las hojas separadas de un pack (Idle, Walk, Attack…) en un solo personaje.
- **Paletas**: `palette_fit` ajusta cada color de un asset al más cercano de una paleta (la de otro asset o una lista), con mapeos forzados y conservando alpha, y devuelve la tabla de qué fue a qué; `palette_show` dibuja la paleta como muestrario; `palette map` recolorea por valor (mismo mapeo para un sprite y su retrato).
- **Personajes**: `import_character` importa un personaje entero desde la carpeta de un pack en un solo paso, con los tags estándar por dirección (idle, walk, attack, hurt × down/up/left/right, más technique y die). Layouts `ninja_separate` (Idle/Walk/Attack/Special1/Dead) y `ninja_sheet` (una hoja de 4 columnas × N pasos).
- **Animación**: `animate` genera con el motor de anatomía (idle, walk, run, jump, attack, cast, hurt, die, con sufijo de dirección) a partir de un cuadro base, y `anatomy` guarda las filas del cuerpo en el asset. Probado sobre chibis de 16 px de un pack ajeno: la respiración, el retroceso y el brillo de cast sirven; la caminata mueve poco con piernas de dos píxeles y `die` (rotación de cabeza) deja fragmentos: deuda para el motor.
- **FX**: `bolt`, un rayo dentado con ramas y halo entre dos puntos (`x,y` → `x2,y2`), reproducible por semilla; disponible en `fx` y `fx_anim`.
- **IA headless**: `generate` pide una imagen a fal.ai con el mismo prompt técnico de la Edge Function (clave desde `FAL_AI_KEY` o `supabase/functions/.env`, nunca por argumento) y `pixelize` convierte cualquier PNG en un asset de un cuadro con el cuantizador del editor (fondo verde fuera, colores reducidos, opcionalmente ajustado a la paleta de otro asset). Los comandos pueden ser asíncronos.
- **Pixelize afinado**: recorta al contenido (el fondo se detecta por las esquinas de la imagen entera, no del recorte), vuelve transparente el fondo antes de muestrear para que no sangre verde en los bordes, y pide PNG a fal.ai (flux responde JPEG por defecto).
- **Paletas**: `png_fit` recolorea un PNG entero (un tileset, cualquier imagen) a una paleta destino sin tocar su disposición: cada color va a su mapeo forzado o al más cercano, con alpha intacto.
- **Paletas**: `png_knockout` vuelve transparente, en un PNG, el color de fondo que toca el borde de cada región (relleno desde los bordes), dejando las islas del mismo color: despega el pasto pegado alrededor de las piezas de un tileset sin tocar los rellenos.
- **Paletas**: `png_fit` acepta `regions` para recolorear sólo dentro de rectángulos (un adorno de un tileset con su propio mapeo, antes del general).
- **Pixelize**: el recorte al contenido ignora las manchas sueltas (blobs mucho más chicos que la figura: una miga de sombra, un punto que el modelo dejó en el croma) y las borra antes de muestrear; `speck_fraction` regula el umbral (0 las conserva). Antes un punto en una esquina estiraba el recorte y la figura salía chica.
- **Limpieza**: `despeckle`, filtro de mayoría para el ruido que deja un render pixelizado: cada píxel suelto toma el color en que coinciden sus vecinos; las líneas y los contornos sobreviven. `strength` 2 también come las puntas de los guiones; `passes` repite.
- **Tests**: 34 tests en entorno `node`; `setup.ts` ya no exige `window`.

---

## 2026-09-22
**10 commits realizados**

- **Fix**: **CI en verde**. Corregida una coma duplicada en `eslint.config.js` que rompía el lint en Node 20, `deno check` con la config de cada función y sin `node_modules`, `.claude` ignorado por ESLint y `tailwind.config.ts` sin `require()`.

- **Seguridad**: **Edge Functions con autenticación obligatoria y cuota atómica**. Nuevo `supabase/functions/_shared/` (auth, cuota, validación, CORS configurable, timeouts, parseo de LLM). Las tres funciones vivas (`generate-sprite-fal`, `generate-perspective-fal`, `generate-animation`) verifican el JWT antes de cualquier llamada externa, validan el input, consumen la cuota diaria mediante el RPC `increment_ai_usage` (atómico, verificado con 15 llamadas concurrentes) y responden errores sin filtrar detalles internos. Se eliminó `generate-sprite` (Gemini), que ningún cliente invocaba. 17 tests con `deno test`.
- **DB**: **Migración de robustez**. Slug de proyecto único por usuario (`UNIQUE (user_id, slug)`), `updated_at` con trigger en `projects` y `project_sprites`, límite de 2 MB en `asset_data`, políticas RLS reescritas con `(select auth.uid())` y `EXISTS`. Verificado aislamiento entre usuarios con psql.
- **Refactor**: **Header único del editor**. `EditorHeader` con props `variant`, `backTo` y `syncStatus` reemplaza al header duplicado de `SpriteStudio`. `ExportMenu` e `ImportButton` compartidos: una sola fuente para exportar e importar. Renombrado con doble click y estado en el store; guardar crea checkpoint en ambos contextos.
- **Refactor**: **Cliente Supabase único y tipado**. `src/lib/supabase.ts` usa `createClient<Database>` y deriva `Project`/`ProjectSprite` del esquema; `toJson`/`fromJson` son la única frontera JSONB. Eliminado el cliente huérfano de `integrations/`. Los cuatro hooks de IA pasan por `invokeAiFunction`, que exige sesión.
- **Fix**: **Sesión expirada, snapshot local y listados**. Manejo global de 401/JWT expirado en `QueryClient` con signOut y toast; el snapshot de localStorage lleva un hash del asset origen y se descarta si la DB es más nueva; el listado de sprites ya no descarga `versions`; la purga de historial avisa con un toast en vez de ser silenciosa. Slug de proyecto con reintento ante 23505.
- **Fix**: Corregidas 3 violaciones de `rules-of-hooks` (`useGenerateSpriteFal`, `IconPreview`) y los 2 errores de `tsc` preexistentes.
- **Chore**: **Limpieza**. Borrados 5 archivos muertos de `src/`, 30 componentes shadcn sin uso, 25 dependencias huérfanas (59 → 34), `scratch/`, `.lovable/` y los lockfiles de bun. `npm audit fix` reduce las vulnerabilidades de 27 a 6 sin cambios breaking. `package.json` pasa a `pixel-sprite-studio@0.1.0` con `packageManager: npm`.
- **Infra**: **CI en GitHub Actions**: lint, `tsc`, tests, build y `deno check` de las Edge Functions en cada push y PR. ESLint con `no-unused-vars` activo y `no-explicit-any`/`ban-ts-comment` como warnings (deuda visible: 183 warnings).
- **Docs**: **`AGENTS.md` reescrito contra el código real** (slices de Zustand, `SpriteStudio` como editor principal, fal.ai + Gemini, cliente único, contratos de las Edge Functions). README con proveedores de IA correctos y estructura actualizada.

- **Docs**: **Auditoría técnica para retomar el proyecto** (`AUDIT_TECNICA.md`). Cronología de la duplicación del header del editor (commit `1b0e1b8`), inventario de código muerto y dependencias sin uso, hallazgos de seguridad en Edge Functions (dos funciones de fal.ai sin autenticación, límite diario eludible por concurrencia), desincronización de `CLAUDE.md` con la arquitectura real de slices, y plan de retoma en 5 fases.
- **Fix**: **`.dockerignore` con `**/.env`**. La imagen de Docker incluía `supabase/functions/.env` porque el patrón `.env` solo matchea en la raíz del contexto.

- **Export**: **PNG del layer actual**. Nueva opción en el menú EXPORTAR que descarga solo el layer activo en el frame que se está editando como imagen estática, sin componer con el resto de los layers y a opacidad completa. El nombre del archivo incluye el asset, el layer y el índice de frame.

- **Infra**: **Stack local completo con Docker + Supabase CLI**. Añadidos `Dockerfile`, `docker-compose.yml` y `.dockerignore` para correr el frontend en un contenedor con hot reload. `supabase/config.toml` ahora define puertos propios (54421-54429) para convivir con otros proyectos Supabase locales, y habilita las cuatro Edge Functions en local.
- **Seguridad**: **Higiene de secrets**. `.env` dejó de estar versionado (solo se commitean los `.env.example`), se eliminó el prefijo `VITE_` del connection string de Postgres (Vite lo habría expuesto al browser) y el cliente de Supabase generado por Lovable ya no tiene URL ni anon key hardcodeadas: lee `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` como el resto del código, lo que permite apuntar a local o nube cambiando solo `.env.local`.
- **Docs**: Sección "Local stack" en el README con comandos, tabla de puertos y modelo de secrets (frontend vs Edge Functions, local vs nube).

---

## 2026-05-07
**1 commit realizado**

- **Proyecto**: **Sistema de Configuración de Proyectos (ProjectConfig)**. Implementado flujo de trabajo basado en reglas globales de proyecto. Ahora, al crear un "Nuevo Mundo", se define la direccionalidad (1-Way vs 4-Way) y la estética (8-Bit, Fantasy, Gameboy, etc.). Estas reglas persisten en la base de datos y gobiernan dinámicamente todo el estudio.
- **IA**: **Generación Condicionada por Contexto**. Las Edge Functions (`generate-sprite-fal`, `generate-animation`, `generate-perspective-fal`) ahora reciben la configuración del proyecto. Se inyectan reglas rígidas en los prompts técnicos para asegurar que los sprites y animaciones generados respeten la perspectiva y el estilo visual del juego automáticamente.
- **UI/UX**: **Interfaz Adaptativa Pro**. El editor ahora oculta controles irrelevantes (como perspectivas frontales/traseras en juegos de scroll lateral) y pre-configura el motor de anatomía en la orientación correcta.
- **IA**: **Wizard de Creación Inmersivo**. Rediseñado el flujo de creación de proyectos en el Dashboard con un asistente de 3 pasos ("Nuevo Mundo") con estética pixel-art y selección visual de reglas.
- **Fix**: **Sincronización de Perspectiva Post-Caché**. Corregido el bug donde el LocalStorage mantenía perspectivas de proyectos anteriores; ahora se fuerza el estado correcto basado en la configuración del proyecto al abrir cualquier asset.

---

## 2026-05-06
**3 commits realizados**

- **Animación**: **Procedural FX Panel**. Implementado un nuevo panel de control para aplicar transformaciones procedurales (mover, rotar, expandir, colapsar) a miembros específicos basados en el motor de anatomía. Permite manipular directamente píxeles de cabeza, torso, brazos y piernas con parámetros de offset y ángulo.
- **Animación**: **Custom Animation Flow**. Añadida la posibilidad de crear animaciones personalizadas ("Custom") desde cero. El flujo permite definir un nombre y clona automáticamente el frame actual para inicializar la secuencia, facilitando la creación manual asistida por FX.
- **UI/UX**: **Navegación FX y Tooltips**. Integrada una nueva pestaña en el sidebar con el icono `PxSparkles` etiquetada como "FX" para el acceso rápido a herramientas procedurales. Se mejoraron los tooltips de navegación para mayor claridad.

---

## 2026-04-27
**4 commits realizados**

- **Animación**: **Anatomy Builder API (Walk, Run, Jump)**. Refactorización masiva del motor de animaciones procedimentales mediante un patrón Fluent Builder (`animate_body`). Se reescribieron los ciclos completos de Walk (8 frames), Run (con suspensión aérea) y Jump. El código es ahora 100% declarativo, reduciendo drásticamente el boilerplate y garantizando una sincronización perfecta (squash/stretch) entre todas las extremidades y el torso.
- **Animación**: **IDLE & BREATH (Anatomy Engine)**. Implementado el ciclo completo de animación IDLE con sistema de respiración y flexión de rodillas basado en anatomía. Se actualizaron las funciones de transformación para soportar desplazamientos con rotación y se solucionaron errores de ghosting y desconexiones de cintura.
- **UI/UX**: **Previsualización Dinámica Pro**. Rediseñado el panel de previsualización de animaciones para soportar dinámicamente assets de 64x64 y 128x128. Las escalas ahora se ajustan automáticamente y el panel utiliza un sistema de "hug content" para eliminar espacios vacíos alrededor del sprite.
- **Mejora**: **Nombrado Inteligente de Colores**. Implementado un sistema de resolución de nombres que añade automáticamente matices (shades) estilo Tailwind (50-950) cuando hay duplicados en la paleta. Ahora las importaciones y rampas de color son mucho más fáciles de navegar (ej. "Charcoal Gray 600", "Charcoal Gray 700").
- **Fix**: **Blindaje de Persistencia (QuotaExceededError)**. Migrado el sistema de caché local (localStorage) al motor de serialización RLE+Delta. Esto reduce el uso de disco hasta en un 97% para assets de 128px. Además, se ha implementado una estrategia de "Auto-Purge" que libera espacio de otros proyectos antiguos si el almacenamiento del navegador está al límite, priorizando siempre el trabajo actual.
- **Rendimiento**: **Motor de Compresión RLE+Delta**. Implementado un nuevo sistema de serialización tipado (`spriteDto`) que combina Run-Length Encoding con codificación Delta. Logra ahorros de hasta **-97%** en animaciones complejas y evita la expansión en frames con dithering.
- **Optimización**: **Hashing FNV-1a**. Reemplazado `JSON.stringify` por un hash numérico ultra-rápido en el deduplicador de `localStorage`, reduciendo el tiempo de procesamiento en un 500% para sprites de 64x64+.
- **QA**: **Cobertura de Almacenamiento**. Añadida suite de 26 tests específicos para el ciclo de vida de los datos, cubriendo todos los tamaños soportados (16 a 128px) y garantizando retrocompatibilidad.

---

## 2026-04-26
**17 commits realizados**

- **Novedad**: **GIF Reverse Engineering Wizard**. Implementado motor de ingeniería inversa que permite desglosar archivos GIF, seleccionar rangos de frames y mapearlos automáticamente a orientaciones (Front/Side/Back) y animaciones.
- **Fidelidad**: **Control de Fondo en Importación**. Añadido toggle para desactivar la eliminación automática de fondo, evitando la pérdida de píxeles en assets con colores similares al fondo.
- **Backend**: **Sincronización de Slugs**. Estabilizada la creación de sprites desde cero mediante el uso de la columna física `slug` en Postgres, eliminando errores de restricción NOT NULL.
- **UI/UX**: **Reactividad de Paleta**. Promocionado el estado de `activeColorKey`, `tool`, `brushSize` y `mirrorX` al store global. **Solucionado el problema del primer clic en la paleta**.
- **Refactor**: **usePixelEditor Controlado**. Convertido el motor de dibujo en un hook controlado para garantizar sincronización perfecta con la UI y atajos de teclado.
- **QA**: **Blindaje de Tests Unitarios**. Implementada limpieza automática de `localStorage` y mock de `crypto.randomUUID`, estabilizando la suite de 43 tests.
- **Animación**: **Caminata Pro (Richard Williams)**. Restaurado el ciclo de 4 fases con ritmo vertical preciso y corregida la coordinación cruzada brazo-pierna.
- **UI**: **Cursores Dinámicos**. Implementado soporte para cursores contextuales (`row-resize`, `col-resize`) al interactuar con el esqueleto anatómico.
- **Fix**: **Interacción de Anatomía**. Corregido el bug donde se dibujaban píxeles accidentalmente al arrastrar las líneas guía.

---

## 2026-04-25
**5 commits realizados**

- **Animación**: **Sistema basado en Máscaras de Anatomía**. Migrado el motor de animación para utilizar un sistema de máscaras aditivas, corrigiendo errores de piezas desaparecidas y eliminando el efecto de "smearing" en los bordes durante las transformaciones.
- **Refactor**: **Modularización de UI**. Desglosado el componente monolítico `SpritePixelEditor` en hooks y sub-componentes especializados, facilitando la escalabilidad del lienzo de dibujo.
- **Roadmap**: **Reestructuración Estratégica**. Dividido el roadmap oficial en tres archivos (`ROADMAP_COMPLETED.md`, `ROADMAP_NEXT.md`, `ROADMAP_IMMEDIATE.md`) para separar historial, visión a futuro y ejecución inmediata.

---

## 2026-04-24
**10 commits realizados**

- **Estructura**: **Ecosistema de Proyecto**. Agregada al roadmap la Fase 9 que evoluciona la herramienta de un editor de sprites sueltos a una suite completa de Game Assets, incluyendo soporte planeado para tipografía por IA.
- **Workflow**: **Sincronización Total de Perspectivas**. Rediseñado el sistema de navegación para que el canvas, las miniaturas, la previsualización de animación y el panel de anatomía operen sobre una base de datos unificada (Front, Side R/L, Back).
- **Animación**: **Asociación Contextual y Auto-Selección**. Implementado filtrado dinámico de la biblioteca de animaciones según la vista activa y sistema de pre-selección automática de `Idle` al cambiar de perspectiva.
- **Fix**: **Persistencia de Base en Orientación**. Corregido el bug que reseteaba la vista al Frente al interactuar con el botón BASE; ahora respeta el frame base de la orientación actual (Side/Back).
- **IA**: **Cableado de Perspectiva Back**. Integrado el frame de espalda (idx 2) como destino oficial para la generación por IA y sincronizado con el motor de anatomía.
- **Herramienta**: **Estabilización de Selección y Resize**. Rediseño total del motor de transformación usando deltas absolutos y sistema de **Auto-Lift**, eliminando el "drift" de redondeo y permitiendo redimensionar o borrar selecciones al instante sin necesidad de moverlas primero.
- **Rendimiento**: **Optimización del Pincel Pro**. Implementada detección de cambios por celda y suspensión de cálculos anatómicos durante el trazo, restaurando la sensación de respuesta instantánea y eliminando el delay en sprites de alta resolución.
- **Persistencia**: **Motor de Compresión por Hashing**. Implementado sistema de deduplicación estructural para `localStorage` que reduce drásticamente el tamaño de los datos al reutilizar frames idénticos, permitiendo restaurar el historial completo de versiones (Checkpoints) sin superar el límite de 5MB del navegador.
- **Arquitectura**: **Modularización de Utilidades**. Extraída la lógica de compresión a un helper independiente con cobertura total de tests unitarios.
- **Fix**: **Estabilidad en Animación 32x32**. Corregidos errores de acceso a arrays mediante el forzado de redondeo de coordenadas anatómicas en todo el flujo de generación.
- **Anatomía**: **Motor de Desmembramiento (Dismemberment)**. Evolución radical del sistema de límites a un motor de miembros funcional con soporte para configuraciones específicas por orientación (Frente, Perfil, Espalda).
- **IA**: **Chroma Key Inteligente (HSL)**. Reemplazada la detección de fondo verde por un motor basado en HSL que elimina halos con mayor precisión y suprime la filtración de color verde en los bordes del sprite.
- **UI/UX**: **Memoria de Paneles**. El panel de previsualización de animación ahora persiste su estado expandido/colapsado entre sesiones.
- **UI/UX**: **Optimización de Espaciado**. Reducidos gaps y paddings del layout para maximizar el área de canvas disponible.
- **Iconografía**: **Consistencia PxBone**. Creado icono pixel-art de hueso (`PxBone`) y reemplazado el ícono Lucide en el sidebar y panel de anatomía para unificar la identidad visual.
- **Anatomía**: **Pincel de Miembros**. Implementado soporte para "pintar" la selección de píxeles en el motor de anatomía, permitiendo arrastrar el puntero para añadir/eliminar regiones de miembros de forma fluida.
- **Fix**: **Bloqueo de Guías**. Deshabilitada la interacción con las líneas guía (huesos) mientras se están editando los píxeles de un miembro, evitando arrastres accidentales.
- **Fix**: **Posicionamiento de Icono**. Ajustada la posición del icono `PxBone` para evitar overflow lateral en contenedores estrechos.

---

## 2026-04-23
**8 commits realizados**

- **IA**: **Migración a Seedream V4 Edit**. Actualizado el motor de Img2Img para usar el modelo de Bytedance (`fal-ai/bytedance/seedream/v4/edit`), optimizando la consistencia visual en la generación de perspectivas laterales.
- **Anatomía**: **Sistema de Pivotes Óseos**. Implementada detección automática de hombros, caderas y rodillas en `analyzeBodySegments`, permitiendo animaciones basadas en rotación real de miembros.
- **Mejora**: **Ataque con Rotación**. Rediseñada la animación de ataque para usar arcos de rotación desde el hombro, logrando un movimiento mucho más dinámico y natural.
- **Arquitectura**: **Refactor Modular de Animación**. Migrado todo el motor de transformación y generación procedural a una nueva librería especializada en `src/lib/sprite/`. Separada la lógica de anatomía, transformaciones atómicas y generadores por tipo (`walk`, `idle`, `combat`, `movement`).
- **Mejora**: **Ciclos de 8 Frames (High Fidelity)**. Actualizados los algoritmos de caminata para seguir el estándar de 8 frames (estilo Richard Williams), logrando un movimiento mucho más fluido y profesional.
- **Mejora**: **Física de Rodillas (Knee Flexion)**. Implementada lógica de flexión de rodillas y estabilidad de torso en todo el catálogo de animaciones procedurales, eliminando la rigidez y el "jitter" vertical excesivo.
- **Novedad**: **Depurador de Generación IA**. Implementado botón de exportación de referencia (debug) que permite descargar la imagen exacta enviada a la IA para diagnóstico.
- **Mejora**: **Referencia HD (16x Upscale)**. Optimizado el envío de imágenes a la IA con un escalado pixel-perfect de 16x (512px) que elimina la borrosidad y mejora drásticamente el reconocimiento anatómico.
- **Arquitectura**: **Especialización de Edge Functions**. Separada la lógica de generación en dos funciones independientes: `generate-sprite` (Txt2Img/Schnell) y `generate-perspective` (Img2Img/Kontext).
- **Mejora**: **Fidelidad de Rotación (Kontext)**. Migrada la generación de perspectivas al modelo Flux Pro Kontext, optimizado para mantener la consistencia del personaje en giros de 90 grados.
- **Mejora**: **Prompting Imperativo**. Refinados los prompts de rotación para forzar vistas de perfil y evitar el sesgo de "frente" del modelo original.
- **Fix**: **Estabilidad de Tipos**. Resueltos errores de sintaxis y tipado en los hooks de generación y el bridge del editor, asegurando compatibilidad con el nuevo flujo de trabajo.

---

## 2026-04-22
**6 commits realizados**

- **Novedad**: **Consistencia de Perspectivas (IA)**. Implementado sistema Img2Img que permite generar vistas laterales y traseras basadas en la vista frontal, manteniendo coherencia de diseño.
- **Mejora**: **Preview de Animación Flotante**. Rediseñado el panel de previsualización como una ventana flotante (Picture-in-Picture) escalable y adaptable que optimiza el espacio de trabajo.
- **Mejora**: **Navegación de Sidebar Inteligente**. Implementado un sistema de pestañas dinámicas que solo expande la opción activa, eliminando la necesidad de scroll vertical.
- **Mejora**: **Fidelidad de IA (Nearest Neighbor)**. Optimizado el envío de referencias a la IA mediante escalado pixel-perfect, eliminando borrosidad y mejorando la coherencia en rotaciones.
- **Mejora**: **Remapeo Inteligente de Color**. Nuevo motor de sincronización de paletas que protege los índices originales del sprite al integrar resultados de la IA, evitando cambios de color no deseados.
- **Limpieza**: **Depuración de Interfaz**. Eliminada la pestaña redundante de Historial Cloud y corregidos iconos duplicados en el botón de generación IA.
- **Estructura**: **Dualidad de Roadmap**. Restructurada la planificación en dos niveles: Estratégico (Visión) y Táctico (Ejecución Inmediata) para mejorar el foco del desarrollo.
- **Fix**: **Tooltips Portaled**. Corregido error de clipping y scrollbars horizontales en los tooltips (especialmente Reset Zoom) mediante el uso de Portals de Radix UI.

---

## 2026-04-21
**9 commits realizados**

- **Novedad**: **URLs Amigables (Slugs)**. Migración a formato `/project/id-nombre` y `/editor/id-nombre` para mejorar el SEO y permitir compartir enlaces legibles.
- **Novedad**: **Sprite Studio (Full Display)**. Migración completa del editor de un modal a una página dedicada (`/project/:id/editor/:spriteId`) para máxima inmersión.
- **Novedad**: **Autosave Cloud**. Implementado sistema de sincronización automática y silenciosa con 3s de debounce e indicadores de estado en tiempo real.
- **Novedad**: **Borrador Masivo (Magic Eraser)**. Nueva herramienta para eliminar todas las instancias de un color en el frame activo con un solo click.
- **Mejora**: **Importación de Alta Fidelidad**. Nuevo motor de pixelización con promediado de bloque (Box Sampling) que elimina el ruido en imágenes fuente de alta resolución.
- **Mejora**: **Interfaz de Importación**. Rediseño estético total del modal con grilla de puntos de fondo, efectos de escaneo dinámico y esquineros pixel-art.
- **Fix**: **Estabilidad en Toolbar**. Corregido error de profundidad de renderizado ("Maximum update depth") relacionado con tooltips y re-definición de componentes.
- **Fix**: **Crash de Inicialización**. Resuelto error crítico de `subscribe is not a function` en el Studio mediante una refactorización estructural de la inyección del Store.
- **Fix**: **Iconografía Faltante**. Solucionados errores de referencia por iconos no importados tras la reorganización de la barra de herramientas.
- **Mejora**: **Jerarquía de Navegación**. Reordenadas las pestañas del editor (Anims, Layers, Bones, Themes, Config) para priorizar el flujo creativo sobre la configuración técnica.
- **Mejora**: **Encabezado Persistente**. Implementado campo de nombre de asset editable directamente en el breadcrumb superior para una gestión de metadatos más fluida.
- **Mejora**: **Herramientas de Transformación**. Refinado el feedback visual de la herramienta de selección con manejadores de redimensión y cursores contextuales.

---

## 2026-04-19
**1 commit realizado**

- **Novedad**: **Garbage Collector de Frames**. Implementado sistema automático de limpieza de frames huérfanos que ya no están asociados a ninguna animación o capa para optimizar el almacenamiento.

---

## 2026-04-15
**5 commits realizados**

- **Novedad**: Sistema de **Anatomía de 4 Segmentos**. Implementado control total de Cuello, Cintura y Ancho de Torso con guías visuales inteligentes que solo aparecen en la pestaña **BONES**.
- **Mejoras**: Sincronización de extremidades **"Limb-Aware"**. Balanceo de brazos dinámico basado en los límites laterales del torso definidos por el usuario.
- **Mejoras**: **Rediseño total de Animaciones Predefinidas**. Refactor de `Idle`, `Walk`, `Attack`, `Hurt`, `Jump` y `Cast` con inercia física y deformación anatómica.
- **Mejoras**: Nuevas primitivas de movimiento: `leanBody` (inclinación), `squash` (compresión rítmica) y `shiftArea` (desplazamientos localizados).
- **Novedad**: Sistema de **Importación de Imágenes**. Permite convertir cualquier archivo (PNG, JPG, WebP) en pixel art editable directamente en el editor.
- **Mejoras**: Motor de pixelización híbrido con algoritmos de mapeo a paletas fijas (Sprite/Librería) y generación automática via **Median Cut**.
- **Interfaz**: Nuevo modal de importación con previsualización interactiva (drag/zoom), detector de frames vacíos y advertencias de seguridad.
- **Iconografía**: Agregado icono de **Upload** (`PxUpload`) al sistema de iconos pixel-art.

---

## 2026-04-11
**8 commits realizados**

- **Fix**: Corregido bug que causaba que el Icon Studio se abriera con el canvas vacío debido a colisiones de persistencia en el `localStorage`.
- **Novedad**: Implementación de **Icon Studio**. Ahora puedes editar cualquier icono del sistema directamente en el editor de sprites desde `/icon-preview`.
- **Mejoras**: Refinamiento geométrico de iconos circulares (**Undo**, **Redo**, **Rotate**, **Moon**) basado en grillas de píxeles manuales.
- **Mejoras**: Fase 3 de rediseño de iconos: Metáfora de **Espejo** para Flips, **Engranaje 3D** premium y **Caja de Suministros**.
- **Mejoras**: Rediseño de iconos críticos (**Themes**, **Layers**, **Config**, **Fill**) para mayor claridad semántica.
- **Mejoras**: Fase 2 de rediseño de iconos con detalles mecánicos y texturas avanzadas.
- **Agregado**: Laboratorio de Iconos (`/icon-preview`) para previsualización y desarrollo en tiempo real (solo en localhost).
- **Utilitario**: Agregada función "DEBUG: COPIAR JSON" en el menú de exportación (visible solo en localhost).

---

## 2026-04-10
**7 commits realizados**

- **Agregado**: Navegador de Assets universal con búsqueda por nombre/tags y soporte para importar creaciones propias ("Mis Sprites").
- **Agregado**: Sistema de composición inteligente con remapeo automático de paletas y aplanado de capas al importar assets multi-capa.
- **Agregado**: Etiquetas (Tags) con normalización y sugerencias inteligentes por categoría.
- **Agregado**: Panel de metadatos (Categoría y Descripción) para una organización profesional.
- **Agregado**: Filtrado avanzado multi-select en la galería (soporta combinaciones como `#warrior #fire`).
- **Mejoras de interfaz**: Restricciones de tamaño en tiempo real (solo 16x16 dentro de 32x32) para facilitar la composición coherente.
- **Mejoras de interfaz**: Consistencia visual en miniaturas con fondo de canvas pixel-art y alineación perfecta.
- **Mejoras de interfaz**: Rediseño de diálogos de confirmación con iconos pixel-art personalizados.
- **Corregido**: Bug crítico de recursión infinita al cambiar de herramienta con una selección activa.
- **Utilitario**: Implementación de persistencia robusta en LocalStorage y detección de cambios sin guardar.
- **Utilitario**: Creación del registro histórico completo (**CHANGELOG.md**) desde el origen del proyecto.

---

## 2026-04-09
**10 commits realizados**

- **Agregado**: Sistema global de **Undo / Redo** para todas las acciones del editor (capas, colores, frames).
- **Agregado**: Funcionalidad "Merge Layer Down" para combinar capas.
- **Agregado**: Rate limiting preventivo (10 llamadas/día) para el uso de IA.
- **Mejoras de interfaz**: Implementación del **"Studio Layout"** (Palette a la izquierda, Configuración a la derecha).
- **Mejoras de interfaz**: Nomenclatura de colores profesional (Basada en distancias cromáticas).
- **Corregido**: Habilitado **TS Strict Mode** en todo el proyecto; resueltos más de 50 errores de nulabilidad.
- **Utilitario**: Migración completa del estado del editor de React Context a **Zustand** para mayor estabilidad.

---

## 2026-04-08
**25 commits realizados**

- **Agregado**: Herramienta de **Selección** con soporte para Mover, Copiar, Pegar y Eliminar fragmentos.
- **Agregado**: Soporte para exportación en formato **GIF** animado.
- **Agregado**: Funcionalidades de navegación pro: **Zoom**, Paneo (Mouse3) y Borrado rápido (Mouse2).
- **Agregado**: Panel de creación de sprites "Desde Cero" con soporte para múltiples tamaños (16x16, 32x32).
- **Mejoras de interfaz**: Rediseño premium del panel de IA y el catálogo de activos con filtros contextuales.
- **Corregido**: Sincronización de paletas al clonar o importar props.
- **Utilitario**: Refactorización técnica: Separación de lógica en **7 sub-hooks especializados** y suite de 21 tests unitarios.

---

## 2026-04-07
**11 commits realizados**

- **Agregado**: Generación de animaciones de **"Ataque Mágico" (Casting)** con efectos procedurales.
- **Agregado**: Sistema de upscale inteligente de assets de 16px a 32px preservando el estilo pixel-art.
- **Mejoras de interfaz**: Playback de animaciones integrado en el footer del editor para feedback en tiempo real.
- **Corregido**: Error de renderizado en `SpriteSheetCanvas` al mezclar frames de distintos tamaños.
- **Utilitario**: Adopción de **TanStack Query (React Query)** para la gestión de datos asíncronos con Supabase.

---

## 2026-04-06
**12 commits realizados**

- **Agregado**: Flujo completo de recuperación de contraseñas y correos de confirmación.
- **Corregido**: Normalización de la estructura de capas para que el sistema sea opcional y retrocompatible.
- **Utilitario**: Conexión base con **Supabase Auth & Database**; configuración de políticas RLS.

---

## 2026-04-05
**13 commits realizados**

- **Agregado**: Sistema de **Capas (Layering)** profesional con visibilidad, bloqueo y opacidad.
- **Agregado**: Generación de animaciones multi-capa asistida por IA (Gemini 2.5 Flash).
- **Agregado**: Herramientas avanzadas: Espejo (Mirror) y Rotación con cálculo de Centro de Masa.
- **Mejoras de interfaz**: Implementación de **Onion Skinning** para previsualizar frames adyacentes.
- **Corregido**: Estabilidad del motor de exportación PNG.

---

## 2026-04-04
**7 commits realizados**

- **Mejoras de interfaz**: Refactorización del editor a un layout más robusto (Holy Grail layout).
- **Agregado**: Soporte inicial para resoluciones de 32x32 en el motor de renderizado.
- **Corregido**: Sincronización de estado entre el editor y la base de datos asíncrona.

---

## 2026-04-03
**4 commits realizados**

- **Agregado**: Primer editor de píxeles funcional con herramientas de pincel básicas.
- **Agregado**: Sistema de gestión de frames inicial para animaciones.
- **Corregido**: Fallbacks de animación en previsualización de assets del catálogo.

---

## 2026-04-02
**18 commits realizados**

- **Agregado**: Integración completa con **Supabase** (Auth, Postgres, RLS).
- **Agregado**: Panel de **Dashboard** para gestión de proyectos y persistencia del usuario.
- **Agregado**: **Landing Page** interactiva con secciones de héroe y previews en vivo.
- **Agregado**: Motor inicial de IA (Gemini) para generación de sprites desde texto.
- **Agregado**: Catálogo de assets público con sistema de filtrado dinámico.
- **Utilitario**: Implementación de contexto de paleta de colores editable.

---

## 2026-04-01 (Genesis)
**6 commits realizados**

- **Utilitario**: Creación del repositorio y configuración inicial de **Vite, React y TypeScript**.
- **Mejoras de interfaz**: Definición de la estética base (Dark mode, fuentes pixel-art).
- **Agregado**: Prototipo inicial de la grilla de píxeles 16x16 y motor de dibujo básico.
