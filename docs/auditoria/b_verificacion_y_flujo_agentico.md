# B. Verificación y flujo agéntico

> Auditoría para el paso de PSS a **PGS (Pixel Gaming Studio)**: un motor para
> generar los assets de un juego con agentes y retocarlos después en la app.
>
> Este anexo mira un ángulo: **The Unwritten Dao construyó, sin proponérselo,
> un banco de pruebas para arte hecho por agentes.** Lo que sigue es el
> inventario de ese banco, qué error real cazó cada control (con commit e
> issue), qué parte es del juego y qué parte le hace falta a cualquiera, y qué
> fricción quedó sin resolver.
>
> Fuentes: `~/juegos/unwritten-dao` (434 commits, sólo lectura), issues de
> `Khadosh/unwritten-dao`, `src/headless/` de este repo e issue #1 de PSS.
> **No se tocó código de producción en ninguno de los dos repos.**

---

## 0. La tesis, y la buena noticia

El juego no se propuso construir infraestructura de verificación de arte: se
propuso no verse mal. Pero como **Joaquín no lee código y lee terminal**, cada
vez que algo se veía mal apareció una herramienta que lo imprimiera, y cada vez
que algo se veía mal *y nadie lo notaba* apareció un test que lo prohibiera. El
resultado son 21 herramientas de terminal, 94 tests de núcleo, un lint de
estilo de imagen, un lint de colocación, un comparador píxel a píxel, un test
de alcanzabilidad y scripts de captura, corriendo sobre 24 mapas, 792 fuentes
`.pss.json` y 666 dibujos de texto.

**De eso, la mitad no es del juego: es lo que le falta a PGS.** La prueba más
fuerte es que varios de esos controles ya están implementados **dos veces** —
una en GDScript o Python dentro del juego y otra dentro de PSS (`pss lint`,
`pss map_lint`, `pss map_compare`) — porque nadie decidió de quién era la
responsabilidad.

La buena noticia, que conviene decir antes de la lista de faltantes: **PSS ya
tiene la doctrina correcta escrita.** Su `AGENTS.md` nombra tres pares
verificador/corrector en producción — arte `contact` + `lint`, mapas
`map_lint` + `map_compare`, sonido `sound_contact` —; `src/headless/brief.ts`
tiene una **política explícita de costo para agentes** («an agent pays for
every byte it reads»: los nueve comandos de la lista `LOOKING` devuelven
imagen y texto completo, el resto una línea de ≤240 caracteres con
`preview: true` opt-in); `pss ascii` se describe a sí mismo como «the cheapest
way to look at pixels»; y el criterio de aceptación del ida y vuelta de texto
formula la doctrina en una frase que vale para todo PGS: **«lo que el formato
no sabe guardar avisa al guardar, en vez de perderse en silencio»**.

Lo que falta no es la idea. Es cobertura, plomería y una decisión de alcance.

---

## 1. El banco de pruebas que nadie diseñó

| Capa | Dónde vive | Qué hay |
|---|---|---|
| Herramientas de terminal | 21 `*.sh` en la raíz | 6 de assets y proyecto (`arte.sh`, `sonido.sh`, `mapas.sh`, `contexto.sh`, `estado.sh`, `traza.sh`) y 15 de contenido/juego |
| Tests de datos de arte | 94 en `tests/core/` | `test_visuals.gd` (631 líneas, 33 tests), `test_caras.gd`, `test_suelos_pintados.gd`, `test_estilo_mapas.gd`, `test_mapas_alcanzables.gd`, `test_shaders.gd`, `test_luz.gd`, `test_sect_map.gd`, `test_sonidos.gd` |
| Humos con escena | 7 `tests/smoke_*.gd` | `smoke_visuals.gd` carga **cada** set visual y le exige el contrato de animaciones y que sea una sola pieza |
| Lint de imagen | `core/world/estilo_mapa.gd` (228 líneas) + `docs/diseno/estilo_mapas.md` | 6 reglas + clasificador de materiales + excepción `interior` |
| Lint de colocación | `scripts/mapas.py` (342 líneas) → `./mapas.sh`, sale 1 si hay algo roto | 12 errores y 4 avisos |
| Comparación contra lo anterior | `pss map_compare` | 13 commits de migración, de 99,8 % a «0 píxeles distintos» |
| Verificación visual | 3 `tests/shot_*.gd` + `art/pss/_ver/` + `docs/diseno/comparaciones/` (22 imágenes) | capturas que el agente mira; antes/después nombrado por issue |
| Presupuesto del agente | `./contexto.sh` | sale 1 si un doc pasó su tope de bytes |
| Compuerta | `scripts/hooks/pre-commit` | corre `./test.sh core` y cancela el commit: «No se commitea con el núcleo en rojo» |

Dos observaciones estructurales que valen más que el inventario:

**(a) Los controles son bloqueantes, menos uno.** Casi todo lo de arriba corre
en el pre-commit. `./mapas.sh` **no**: se corre a mano, y los commits lo citan
como «✓». Es un control de primera que depende de que el agente se acuerde — y
es exactamente la clase de paso que se saltea cuando la sesión va apurada.

**(b) El patrón de nacimiento es siempre el mismo, y es el que PGS debería
industrializar.** De trece controles auditados, **seis nacieron reactivos en el
mismo commit que arreglaba el bug** y el mensaje de commit dejó escrito el bug
con palabras de Joaquín:

1. Joaquín juega y dice «se ve mal» → issue con etiqueta `arte` o `bug`.
2. Un agente arregla ese caso.
3. Si el caso tenía forma de familia, el arreglo trae **la herramienta que lo
   imprime** (para que Joaquín decida mirando) y **el test que lo prohíbe**.
4. La regla se escribe en prosa en un doc de diseño (`estilo_mapas.md`,
   «Reglas que se chequean solas») y el test es su ejecución.

El paso 4 es el que hace que el control sobreviva a la rotación de agentes: la
regla existe en palabras antes de existir en código.

---

## 2. Tabla de controles: qué revisa · qué cazó · ¿de motor o del juego?

Última columna: **motor** = lo necesita cualquiera que genere assets con
agentes; **juego** = depende de las reglas de este juego; **mixto** = la regla
es de motor, la tabla de valores es del proyecto.

### 2.1 El asset existe, está entero y está exportado

| Control | Qué revisa | Qué cazó de verdad | ¿? |
|---|---|---|---|
| `test_visuals.gd::test_toda_fuente_pss_esta_exportada` | cada `art/pss/src/<c>/<id>.pss.json` tiene su `.png` **y** su `.json` al lado | el caso canónico del flujo agéntico, dicho por el propio test: «si falta, alguien tocó una fuente y no corrió `./arte.sh`». El agente edita la fuente, declara listo, y en pantalla no cambió nada. Preventivo, nace con el pipeline (`8d91455`, 30 sep) | **motor** |
| `test_visuals.gd::test_todo_el_arte_referenciado_existe` | nada en `visuals.json` apunta a un archivo ausente | el encabezado del archivo es la justificación entera: «un set que apunta a un archivo que no existe se dibuja como nada, y **eso no se ve en los tests del núcleo salvo que alguien lo mire: por eso este archivo**» | **motor** |
| `test_visuals.gd::test_el_dibujo_de_cada_adorno_mide_lo_que_dice_su_huella` | PNG propio = `size * 16` exacto; región del pack dentro del tileset | **reactivo**: `53c7678` (30 sep), «respeto del dibujo de los adornos (test de huella vs PNG)». El bug, en `TRASNOCHE.md`: el relleno respetaba la huella declarada y no el dibujo, así que las cañas del bosque crecían **sobre las copas de los cerezos**. El test lo cita como «F2 del informe visual» | **motor** |
| `test_visuals.gd::test_un_adorno_propio_es_la_textura_entera_de_su_asset_pss` | el adorno es el PNG completo, no un recorte | el farol sin exportar: `"falta exportar el farol: ./arte.sh"` | **motor** |
| `test_sonidos.gd::test_cada_receta_tiene_su_wav_y_cada_wav_su_receta` | biyección receta ↔ artefacto, **en los dos sentidos** | el mismo error que el PNG sin exportar, en sonido; y el espejo, el `.wav` huérfano que nadie usa. Cerrar el círculo en ambos sentidos es lo que caza el asset abandonado | **motor** |
| `./test.sh` (detector de salida) | marca rojo si aparece `SCRIPT ERROR`, `Parse Error` o `SHADER ERROR` **aunque el exit code sea 0** | «un script que no compila hace que Godot salga 0 sin correr nada: sin esto, un error de sintaxis se reportaba como "todo verde"» | **mixto**: la trampa es de Godot, la lección es de motor — **ningún comando de PGS debe imprimir éxito sobre un no-op** |

### 2.2 El contrato: el personaje tiene lo que la escena le va a pedir

| Control | Qué revisa | Qué cazó | ¿? |
|---|---|---|---|
| `smoke_visuals.gd` | **cada** actor construye sprite y responde a las seis animaciones del contrato (`core/world/visuals.gd:20`: `idle`, `walk`, `attack`, `technique`, `hurt`, `die`), con cuadros de verdad en cada una, y gira a la izquierda | es el único control que carga todos los sets: un set nuevo con sólo `idle` pasa todos los tests de datos y se rompe en pantalla. Preventivo, nace con el primer arte (`a865955`, 28 sep) | **motor** |
| `smoke_visuals.gd::_check_pieces` (`PIEZA_MINIMA = 4`) + `pss lint pieces` | ningún grupo de ≥4 px despegado del cuerpo en ningún cuadro, ni en diagonal | **reactivo, y la cita está en el código**: «pedido de Joaquín: *en algunas animaciones uno de los frames les separa la parte alta de la cabeza*» (`9348a60`, 1 oct). Una coronilla despegada por una fila vacía, un moño que quedó atrás | **motor** |
| `test_caras.gd::test_los_dialogos_solo_piden_caras_que_el_personaje_tiene` | ningún diálogo puede pedir un ánimo que ese retrato no tiene dibujado; el fallo nombra archivo, personaje y las caras disponibles | **reactivo, el mejor caso de «invisible»**: `dc0ec21` (5 oct), «**La Madre He pedía una cara cálida que nadie le dibujó: se la saqué, ya se veía la de siempre**». El encabezado lo enuncia: «una cara mal escrita en un diálogo se vería neutra sin que nadie lo note». Quedó como issue #117 (dibujarla y devolver la línea) | **motor** |
| `test_caras.gd::test_cada_cara_dibujada_existe` | cada ánimo declarado tiene su PNG **y no cae a la base** (una cara declarada que resuelve a la base es un error) | el caso espejo: declarar una cara y no dibujarla | **motor** |
| `test_shaders.gd` + `./test.sh` | cada `.gdshader` declara `shader_type`, el modo cargado coincide, y los uniforms que ve el motor son los que declara el texto; si no declara ninguno, se compila una copia con un **uniform centinela** | **reactivo, issue #12**: «un `.gdshader` roto **pasaba en verde** porque nadie lo cargaba en los tests». El renderer dummy parsea, escupe `SHADER ERROR` por stderr y sigue (`6ad66c2`, 4 oct, cierra #12) | **mixto**: técnica de Godot; el principio —verificar que el asset **carga en el runtime**, no sólo que el archivo está— es de motor |
| `test_visuals.gd::test_la_hoja_pss_trae_cuadros_y_animaciones` | la hoja trae `frameTags` («una hoja sin frameTags no anima nada»), duraciones > 0, celda de 32 px | el error de export silencioso: el PNG está, la metadata no | **motor** |
| `test_visuals.gd::test_cada_tecnica_tiene_su_miniatura_distinta` | dos técnicas no comparten miniatura | **issue #40**: «Hierro Callado y Hierro Viejo tienen la misma» | **motor** |
| `test_luz.gd::test_el_halo_es_redondo_y_su_borde_no_se_ve` | el halo es cuadrado de lado, el borde entero en alfa 0, las esquinas vacías bien adentro | **reactivo** (`9348a60`, 1 oct): «un recorte nunca deja un cuadrado… es un disco, no un cuadrado de puntas romas». Es el caso general de «el asset generado tiene borde recto donde debería desvanecerse» | **motor** |

### 2.3 Píxeles: paleta, borde, variación

| Control | Qué revisa | Qué cazó | ¿? |
|---|---|---|---|
| `test_visuals.gd::test_todo_asset_propio_usa_solo_la_paleta_madre` | todo color de toda fuente está en `paleta.pss.json` (≥24 colores exigidos); **escape explícito** con el tag `paleta_libre`; el fallo nombra carpeta, archivo y hex | preventivo (`ce037e4`, 30 sep: «cuarenta colores en rampas cortas… un test exige que todo asset propio la respete») con arrastre reactivo inmediato: `53c7678` remapea el pack porque **los troncos eran naranja fuego y las rocas color pergamino** | **mixto**: la regla es de motor y **ya existe** (`pss lint palette=`); la paleta y la excepción son del proyecto |
| `pss lint` (`commands.ts:802`, impl. `inspect.ts:266`) | índice de paleta usado sin color asignado; colores fuera de paleta (aceptando `#rrggbbaa` cuyo `#rrggbb` está); lados que no son múltiplo de `grid`; **píxeles sueltos con coordenadas**; **piezas despegadas**; **costuras de tile** (bordes que no se encuentran al repetir o dejan huecos) | es el lint que corre `./arte.sh control`. Nació de un bug de escala real: el `ROADMAP_IMMEDIATE` lo llama «la hoja al lado del jugador **que atrapó los faroles gigantes**» | **motor, ya hecho** |
| `core/world/estilo_mapa.gd` + `test_estilo_mapas.gd` | **R1** alfa sólo 0 o 255; **R2** ningún agujero dentro del mapa; **R3** sólo la paleta madre; **R4** ningún borde entre materiales recto > 2 celdas (32 px), exigiendo el mismo par de materiales a lo largo del tramo; **R5** ninguna celda idéntica a **sus 8** vecinas en más de un tercio del mapa; **R6** islas de 1 px de un material dentro de otro ≤ 2,5 % de los cambios de material, con la diagonal exenta | R4 y R5 nacieron de **que se veía la grilla**: baldosa repetida y caminos en escalones cuadrados. **R6 nació de un defecto de herramienta**: el borde tramado que dejaba `pss terrain`, «el pincel blando». Preventivo con deuda declarada: el commit de origen (`8496489`/`7d766c6`, 2 oct) dice «**la ladera pasa; la secta y río arriba quedan pendientes**» — esos dos mapas fallaban de entrada | **mixto** |
| ídem, `PENDIENTES` + `test_los_pendientes_siguen_pendientes` | **trinquete**: si un mapa de la lista de pendientes empieza a pasar, el test **falla** y pide sacarlo | se vació en dos pasos (`08bfd17`, `94d77cd`, 2 oct) y hoy `PENDIENTES := []`. Es el mecanismo que impide que la deuda de arte viejo se vuelva permanente, y el que hace que un lint nuevo se pueda activar el día uno sin bloquear a nadie | **motor** — pieza de diseño reutilizable tal cual |
| ídem, `MATERIALES` + `_materiales()` | seis materiales por color (pasto 8, tierra 6, piedra 6, agua 4, sombra 2, nieve 4); lo que no está es **acento** y hereda el material del vecino, para que una flor sobre un borde no rompa un tramo recto | **reactivo**: la rampa de nieve se agregó al pintar la cumbre (`69c6837`, 2 oct: «la paleta madre suma la rampa de la nieve y **el lint del estilo la toma como material**»); antes un borde recto nieve/roca pasaba inadvertido | **juego**: en PGS tiene que ser un archivo de configuración, no una constante en el código del lint |
| `test_estilo_mapas.gd` (9 tests, 3 negativos) | que cada regla **rechace** lo que debe, y que **acepte** lo correcto: un acento que corta un borde, una diagonal de 1 px, un interior con paredes rectas | **el detalle más valioso del archivo.** Sin `test_un_acento_no_corta_un_borde_recto` y `test_un_interior_puede_tener_paredes_rectas`, el lint se vuelve ruido y el agente lo empieza a ignorar — y entonces no existe | **motor**, y es disciplina más que código |
| `pss map_lint` (`maplint.ts`) | las mismas reglas, dentro de PSS, sobre PNG o receta, sin Godot; con `recipe=` lintea **el suelo y cada capa** | duplicado a propósito (el anexo del juego dice: «Sin Godot: `pss map_lint png= area= palette= materials=`»). Es lo más cerca que PSS tiene hoy de un verificador de escena completa en un comando | **motor, ya hecho** |
| `pss despeckle` | píxel solo cuyo color no comparten ≥`strength` de sus 8 vecinos toma el color de la mayoría; devuelve el ASCII del cuadro cuando es uno solo | la limpieza obligada después de pixelizar un render de IA. La misma regla en modo reporte es parte de `pss lint` | **motor, ya hecho** |

### 2.4 Colocación: el asset puesto en la escena

| Control | Qué revisa | Qué cazó | ¿? |
|---|---|---|---|
| `scripts/mapas.py` → `./mapas.sh` | **12 errores**: adorno sin definir en `visuals.json`; huella fuera del mapa por los costados y por abajo; **dos huellas que se pisan** (con dos excepciones declaradas: `when` en la misma celda son alternativas, `colgado` se pisa a propósito); NPC dentro de una pared; relleno con una caña sin definir; parche de piso fuera del mapa; niebla (claves cerradas, `density` 0,1–12, `speed` 0–40, `gust` 0–1, color `#rrggbb(aa)`); luz del mapa (`ambient` sin alfa, luz dentro del mapa); cada luz (claves cerradas, `radius` 0,5–8, `energy` 0–1, `flicker` ∈ {fuego, fatuo}); detalles de lo vivo (el `fx` existe en `actors`, `every` ∈ [0,5 … 30]); `shadow` ∈ {chica, mediana, grande, false}. **4 avisos**: asoma por arriba, NPC debajo de un adorno, pared sin nada encima, alto sin sombra | **reactivo, y el commit de origen es el arreglo**: `cb69b84` (30 sep) — «Rocas de la ladera y árbol de la secta adentro del borde… **./mapas.sh dice qué tiene cada mapa y grita si una huella se sale o pisa otra; un test exige lo mismo**». Casos concretos de la pasada analítica: `rocas` de la ladera en (11,5) ocupando hasta la columna 13 de un mapa de 13; `arbol_chico` de la secta en (14,7) en la columna 15 de 15; `rocas` sobre `pino_chico`. Días después: «**la roca del bosque ya no asoma por arriba**» (aviso 1) | **mixto** (ver §3.2) |
| ídem, las excepciones | `colgado` / `alternativa` (`c652363`, 1 oct) y `paredes_pintadas` (`8496489`, 2 oct) | **los dos entraron para matar falsos positivos reales**: el muro de tablillas de la terraza (que se pisan a propósito) y el peñasco pintado de la ladera (pared sin nada encima, pero el suelo ya la dibuja). Mismo patrón que §2.3: un lint sin escape declarable se vuelve ruido | **motor** |
| ídem, `sombra()` + `test_luz.gd::test_los_adornos_altos_sin_sombra_son_decisiones` | reproduce la regla de sombras de `core/world/lighting.gd`, lista los «altos sin sombra (¿a propósito?)», y **un test fija la lista exacta** (30+ ids, con la razón de cada uno) | el patrón **«aviso con pregunta + lista blanca con test»**: hoy son cañas, cuevas y pergamino; agregar un cuarto es una decisión, no un descuido | **motor** — otra pieza de diseño reutilizable tal cual |
| `test_sect_map.gd::test_los_mapas_reales_cierran` | `player_start` pisable; NPC dentro del mapa y no en pared; hito dentro del mapa; **salida que apunta a un mapa que existe**; `entry` de 2 componentes y que cae en celda **pisable** | integridad referencial del grafo de escenas: una salida a un archivo que no existe, o que te deja parado dentro de una pared | **motor** |
| `test_suelos_pintados.gd` | el suelo pintado mide **exactamente** el mapa (16 px/celda, más `margen`); cada capa viva existe, mide lo mismo y usa un movimiento de la lista cerrada (`mece`, `titila`, `fluye`, `corre`, `quieto`) | «si no, **el agua cae corrida de las celdas que bloquean**»: un píxel de diferencia rompe la lectura del mapa entero (`5adaa56`, 2 oct) | **motor** |
| `test_visuals.gd::test_lo_vivo_de_los_mapas_mide_lo_que_su_adorno` | cada cuadro de un adorno animado mide lo mismo que el quieto | «si no, el que respira se correría de su huella» | **motor** |
| **`test_mapas_alcanzables.gd`** | BFS desde `player_start` **y desde cada `entry` de cada salida de todos los demás mapas**; todo hito y todo NPC alcanzable (su celda o una vecina ortogonal); con la regla real del juego de que **lo que se mira no se pisa**; error si un mapa no dice por dónde se entra; guarda contra listas viejas (`files.size() > 10`) | **el mejor control del banco, y la cadena de commits está completa**: `813038c` (5 oct) introduce la forja al este de la ladera → `6f8c37d` la arregla («el sendero quedaba en un bolsón al que sólo se entraba pisando la estela, y una estela no se pisa: **no se podía llegar a la forja**») → `ed89d5a` crea el control, con la frase que debería estar en la portada de PGS: «**Lo de la forja no lo cazó nada: el mapa cargaba, el lint de estilo y mapas.sh daban el visto bueno, y el sendero estaba sellado.**» Trae además un test sintético de 4×3 que reproduce la falla | **mixto**, y el más importante (§3.3) |

### 2.5 «¿Esto es idéntico a la versión anterior?»

| Control | Qué revisa | Qué cazó | ¿? |
|---|---|---|---|
| `pss map_compare` (`commands.ts:1096`) | referencia · nuevo · diferencias lado a lado, cada píxel distinto en magenta sobre la referencia atenuada, **y el número**: cuántos difieren y su porcentaje; una imagen por capa con `refs` | la red de seguridad de la migración más grande del proyecto: ~14 000 líneas de `scripts/suelo_*.py` reemplazadas por 23 recetas. La progresión está en los mensajes de commit: `cf63125` (4 oct) **99,8 %** («comparación lado a lado para que Joaquín la mire; el arte del juego no cambia todavía») → `c2e43a5` **0,17 %**, con las **237 diferencias concretas listadas** en `pintar_mapas.md` §4 (la junta de los peldaños que no seguía el centro del camino, los arañazos de la madriguera que faltaban, las sombras de la estela y de la raíz) → y de ahí en adelante **0 píxeles distintos**, mapa por mapa: secta `a6d8769`, aldea `32b8fac`, casa de té `b4673c4`, bosque `f56f3a6`, cumbre `f45f267`, cumbre alta `8e23345`, camino `4fad7e5`, embarcadero `31f4397`, otra orilla `9298b44`, terraza `c7fb1ff`, raíces `0d63d09`, río arriba `a3ef1c3`; cierre en `83ef606`. **Sin ese número ningún agente podía afirmar «se ve igual que antes» y ningún humano iba a revisar 23 mapas a ojo** | **motor, ya hecho** — y el control que más trabajo habilitó |
| Precondición | `AGENTS.md` de PSS: «the painter is pure and deterministic, an exact port of the game's drawing scripts» | **el determinismo es lo que convierte la comparación de píxeles en verificación y no en ruido.** Es un requisito de arquitectura de PGS, no un detalle: todo generador tiene que ser reproducible por semilla | **motor** |

### 2.6 Sonido: el mismo patrón, resuelto mejor

`pss sound_contact` (`sound/analyze.ts`) se describe como **«Check WAVs without
listening»** y chequea por archivo: duración, pico y RMS en dBFS, offset DC,
centroide espectral (viento bajo vs campana alta), **si un loop empalma sin
salto** (con test de click a través del corte), si un one-shot empieza y
termina en silencio, y clicks aislados; imprime una tabla y, con `out=`, un PNG
de tiras de forma de onda. Del lado del juego, `test_sonidos.gd` agrega la
integridad referencial (cada mapa tiene ambiente de día y de noche, cada suelo
tiene su paso, cada telón su fondo, los ambientes son loops y los efectos no).

**Vale citarlo como el modelo a copiar para lo visual**: es el único dominio
donde PGS ya tiene «verificá sin usar el sentido humano correspondiente» —
números objetivos *más* una hoja de contacto *más* una lista de advertencias
con nombre. Lo visual tiene la hoja de contacto y el lint, pero no tiene los
números.

### 2.7 Los que son del juego y no suben

`balance.sh` (cada camino, cada bestia; «¿la revancha se gana 8 de 12?»),
`recorrido.sh`, `tiempo.sh`, `riesgos.sh`, `dialogos.sh`, `misiones.sh`,
`terraza.sh`, `cultivar.sh`, `alquimia.sh`, `meritos.sh`, `cuevas.sh`,
`traza.sh`, `bitacora.sh`, `partida.sh` y los tests del grafo de hilos. **Nada
de esto es de motor** y la hipótesis acierta en pleno: miden si el juego es
divertido y justo, no si el asset está bien hecho.

Tres cosas sí vale llevarse de este lado, no como código sino como forma:

- **Todas imprimen un resumen de ≤25 líneas con alarmas primero, y `--todo`
  para la tabla entera.** Es la ergonomía que hace que un agente las lea sin
  quemar contexto, y es la misma idea que `brief.ts` ya aplica en PSS. Debería
  valer para `lint`, `map_lint`, `inspect` y `compare`.
- **`./contexto.sh`** mide cuánto contexto gasta un agente al arrancar y falla
  si un doc pasó su tope. Control del harness, pero es el que mantiene usable
  todo lo demás.
- **`test_sect_reactions.gd`**, que es alcanzabilidad de *contenido*: existe
  porque «**el Anciano Hu pasó una sesión entera diciendo siempre lo mismo: sus
  mejores líneas eran inalcanzables y nadie se dio cuenta**», y siguió cazando
  después («encontró que Lin se quedaba mudo en los tres estados nuevos»). El
  contenido es del juego; **la pregunta «¿este asset que generé se va a ver
  alguna vez?» es de motor** y hoy ningún control de PGS la hace.

---

## 3. La hipótesis: confirmada, con tres correcciones

La hipótesis era: son de motor «¿el PNG existe y está exportado?», «¿el
personaje tiene las animaciones del contrato?», «¿el dibujo pide un color que
no está en la paleta?», «¿el tile tiene el borde duro?», «¿dos adornos se
pisan?», «¿esto es idéntico a la versión anterior?»; es del juego «¿la revancha
se gana 8 de 12?».

**Confirmada.** Las seis son de motor y las seis cazaron errores reales y
nombrables. Y hay una confirmación independiente fuerte: **tres de las seis ya
están implementadas dentro de PSS** — `pss lint` cubre paleta, grilla, píxeles
sueltos, piezas y costuras de tile; `pss map_lint` el estilo del suelo;
`pss map_compare` la comparación. O sea: cuando el juego necesitó un control
genérico, la mitad de las veces terminó escribiéndolo en PSS por su cuenta. Eso
no es coincidencia: es la respuesta.

### 3.1 «¿El tile tiene el borde duro?» son dos preguntas, y las dos son de motor

En el banco aparecen separadas y nacieron de causas distintas:

- **Costura**: el tile repetido no empalma a izquierda/derecha o arriba/abajo,
  o deja huecos transparentes (`pss lint tile`). Problema de tileset.
- **Borde blando**: alfa intermedio, antialias y tramado en el borde entre
  materiales (`estilo_mapa.gd` R1 y R6). Problema de **cualquier imagen que
  venga de un render de IA pixelizado**, y nació de un defecto de herramienta:
  `pss terrain` dejaba «el pincel blando». Es el caso de uso de PGS en estado
  puro — **el motor tiene que cazar lo que el motor ensucia.**

Agrego una tercera de la misma familia que no estaba en la lista y que ya tiene
su test: **el borde recto donde debería desvanecerse** (`test_el_halo_es_
redondo_y_su_borde_no_se_ve`). Un efecto generado con un recorte cuadrado se ve
como un cuadrado de puntas romas, y eso es invisible en los datos.

### 3.2 «¿Dos adornos se pisan?» es de motor sólo si PGS se queda con el manifiesto de colocación

Hoy el control vive en Python dentro del juego porque la huella depende de una
convención del juego — `columnas desde at.x - (w-1)//2, filas desde at.y - h+1`,
copiada a mano de `scenes/sect/sect_scene.gd` — y de dos excepciones del juego
(`when` = alternativas, `colgado` = se pisa a propósito). Peor: **está
implementado dos veces**, en `scripts/mapas.py` y espejado en
`tests/core/test_sect_map.gd`, porque uno corre a mano y el otro en el
pre-commit.

La regla «dos huellas no se intersecan», «una huella no se sale del lienzo»,
«nada ocupa la celda de un personaje», «las claves y los rangos del manifiesto
son los declarados», «una salida apunta a algo que existe» es puro motor.
**La decisión de producto de PGS es si adopta un formato de manifiesto de
escena** (grilla, celda, huella, ancla al pie, capas, luces, niebla). Si lo
adopta, se lleva `mapas.py` completo, los 12 errores y los 4 avisos. Si no lo
adopta, cada juego va a reescribir `mapas.py` en su lenguaje — y lo va a
reescribir **después** de que se le salga un árbol del borde, no antes.

### 3.3 Falta el control que más caro salió evitar: «¿el asset que colocaste rompe la jugabilidad?»

`test_mapas_alcanzables.gd` no está en la hipótesis y es el único que cazó un
mapa **que los otros tres controles daban por bueno**: el lint de estilo lo
aprobaba (los píxeles estaban bien), `./mapas.sh` lo aprobaba (las huellas no
se pisaban), el juego cargaba. Lo que fallaba era la **consecuencia** de haber
puesto una estela en la única celda de paso.

En forma genérica: **un asset colocado puede ser correcto en sí mismo, correcto
respecto de sus vecinos, y volver inalcanzable la mitad del nivel.** Es el
control de más arriba de la pirámide y el que ningún lint de imagen va a
encontrar nunca. Es de motor en la misma medida que §3.2: si PGS tiene
manifiesto de colocación con celdas bloqueantes, tiene el BFS casi gratis.

Y su hermano de §2.7: **«¿este asset se va a ver alguna vez?»** El juego lo
pregunta para diálogos y le salvó una sesión entera. Para assets, PGS no lo
pregunta: hoy nada avisa que un sprite exportado no esté referenciado por
nadie. Es la misma consulta en el grafo, en la otra dirección.

### 3.4 Un matiz sobre el contrato de animaciones

`pss lint` **no** lo verifica hoy. El contrato vive en el juego
(`core/world/visuals.gd:20` y `scenes/ui/character_sprite.gd`) y lo exige un
humo **con escena de Godot**, que es la forma más cara posible de chequear una
lista de strings. En PGS tiene que ser **un contrato declarado por proyecto**
(tags obligatorios, direcciones opcionales) que `pss lint` chequee contra el
`frameTags` de la hoja, sin motor de juego de por medio. Es barato y cubre el
error más vergonzoso: un personaje nuevo que camina pero no sabe morir.

---

## 4. El patrón de verificación visual

Es lo más valioso que hay acá y lo menos formalizado. **Los agentes de este
proyecto no dan por bueno un dibujo sin mirarlo**, y lo que más falló esta
semana fue saltearse ese paso.

### 4.1 Lo que se hace hoy

| Forma | Cómo | Qué resuelve |
|---|---|---|
| **Hoja de control** | `./arte.sh control <id…>` → `pss contact paths=… ref=jugador scale=4 grid=16 frame=fullest` → `art/pss/_ver/control.png`, y acto seguido `pss lint` sobre los mismos paths | el asset al lado del jugador, sobre grilla de 16 anclada a los **pies**, con su nombre debajo en una fuente de 3×5 px. Contesta de un vistazo la regla de escala del anexo («una persona es una celda de 16 px; lo que la dobla sin ser árbol, casa o monumento está mal») — y por eso «atrapó los faroles gigantes». `frame=fullest` existe porque «un destello o unas ondas arrancan en un punto: el primer cuadro no dice cuánto ocupan en pantalla» |
| **Hoja + canal de texto** | `./arte.sh ver <id>` → `pss render scale=6` **y** `pss ascii` a la terminal | «the cheapest way to look at pixels»: un agente sin visión igual verifica forma, tamaño y paleta, y a precio de tokens de texto |
| **Hoja del conjunto** | `./arte.sh cartas --hoja` (2 s) → todas las cartas a 2x y «como en la mano» a 2,5 | el anexo lo pide explícito: «antes y después de tocar una carta, el marco o `card_button.gd`». Es la única forma de ver que una carta nueva no desafina con las otras cuarenta |
| **Captura de la escena real** | `tests/shot_pulido.gd` (477 líneas) + `SHOT_MODE` ∈ {ventana, mano, cartas, horno, pelea, mapa, telones}, con `SHOT_NOCHE=1`, `SHOT_CUEVA=1`, `SHOT_MAPS=`, `SHOT_CELL=` | **lo único que muestra el asset en contexto**: con su suelo, su luz, su noche, sus vecinos y la gente encima. Los tres `shot_*` dicen en su encabezado «no es un test»; lo que sí garantizan son las invariantes de seguridad (nunca tocan la partida guardada, todo en memoria, `user://pruebas`, y `RenderingServer.force_draw` porque macOS deja de redibujar una ventana fuera de pantalla) |
| **Checklist de lo que se mira** | `estilo_mapas.md`, «Lo que se revisa con capturas (de día y de noche, a 1280×720)»: ¿se lee por dónde se camina y dónde están las salidas en 2 segundos?; ¿la luz tiene dirección y temperatura?; ¿la noche tiene focos cálidos?; ¿algo pasa por delante del jugador?; ¿se mueve algo, poco y desfasado?; ¿se reconoce el color dominante? | **la pieza más subestimada del banco**: convierte «mirá si está bien» en seis preguntas con respuesta sí/no. Es lo que hace que la verificación visual de un agente sea repetible y no estética |
| **Antes/después archivado** | `docs/diseno/comparaciones/` (22 imágenes nombradas por issue: `aldea_50.png`, `lotos_84.png`, `otra_orilla_56/57/83.png`, `sect_32.gif`, `cartas_antes_despues.png`, `*_receta.png`) | el commit que cierra un issue visual **enlaza su comparación**. Es la prueba, no la promesa |
| **Diff píxel a píxel** | `pss map_compare` | magenta + número (§2.5) |
| **Prueba lado a lado a ciegas** | `estilo_mapas.md`: «2 oct, la ladera, prueba lado a lado (**A Opus / B Fable, a ciegas**)» → `7d766c6` «Ladera nueva (prueba lado a lado, la A: Opus)» | dos agentes dibujaron el mismo mapa, Joaquín eligió sin saber quién era quién, ganó A, y **las dos cosas en que ganó B se fusionaron** (`28deb34`). De ahí salió la lección de estilo más citada del proyecto: «un camino liso, de color parejo y ancho constante se lee como río de barro» |
| **Higiene** | `AGENTS.md`: «**las escenas se verifican con capturas, no a ojo**» y «capturas: script propio `tests/shot_<algo>.gd`, y borralo al terminar» | que el banco no se llene de scripts de usar y tirar |

El circuito completo, cuando se respeta, es: **captura → informe visual →
issue → arreglo → test duro**. Dos tests llevan el nombre del informe en el
código: «F2 del informe visual» (el `size` mentiroso que ponía cañas en las
copas de los cerezos) e «Informe visual 2, B1» (una caña de dos celdas que
sube sobre el pasillo y **le tapa la cara al jugador** en la entrada del
bosque). Los informes viven en `docs/historial/TRASNOCHE.md` y `TRASNOCHE2.md`.

### 4.2 Qué pasa cuando no se hace

Los issues de esta semana son la lista de lo que se escapa sin mirar:

- **#117** — un diálogo pidiendo una cara que no existe. Invisible: se mostraba
  el retrato neutro. Lo cazó un test endurecido, no un ojo.
- **#130** — «Dos carteles cercanos se pisan (La plataforma sobre Mei)». El
  issue incluye las coordenadas para reproducir la captura: «el jugador en el
  patio de la secta, mirando al este desde [9,4]». **Sólo se ve renderizado**:
  ningún dato está mal.
- **#109** — «El ícono de la muñequera de Ren Bao parece un barril en chico».
  Correcto a tamaño grande, ilegible a 16 px. Sólo lo muestra una hoja de
  contacto a escala real.
- **#53** — «El brote de bambú es muy feo comparado con los otros bambúes».
  Correcto en aislamiento, mal en el conjunto. Sólo lo muestra una hoja del
  conjunto.
- **El jugador de 48 px** que «parece Dobby» tiene su propia excepción
  amurallada en el código (`SIN_REVISAR_PIEZAS = ["jugador_pelea"]`, «fuera
  hasta que pase por pulido») porque su técnica le parte la cabeza. Un asset
  que no se miró, entró, y hubo que ponerle una valla.
- **flux no obedece** «sin gente» ni «cueva cerrada»: el anexo de arte lo dice
  con todas las letras — «**mirá el render antes de pasarlo**». La IA
  generativa garantiza que este paso nunca se pueda saltar.
- Y el caso límite del `ROADMAP_IMMEDIATE` de PSS: «el motor sobre chibis de
  16 px: con piernas de 1–2 px la caminata casi no se mueve y `die` rota la
  cabeza en fragmentos». Ningún lint lo ve. **Hay que mirar.**

El patrón del error es uno: **el asset está bien y la escena está mal**, o **el
asset está bien solo y mal acompañado**. Ningún lint de píxeles llega ahí.

### 4.3 Lo que PGS debería traer de fábrica

`pss contact` y `pss map_compare` ya son el 60 %. Faltan cuatro cosas, en orden
de cuántos errores de §4.2 habrían cazado:

1. **`pss baseline` + `pss diff` para cualquier asset, no sólo mapas.** Hoy
   `map_compare` es el único comparador y entra sólo por receta de mapa o por
   dos PNG sueltos. Generalizado: cada asset guarda su última versión aprobada
   en `.pss/baseline/<id>.png`; `pss diff <id>` contesta magenta + número +
   veredicto; `pss baseline <id>` la actualiza. Con eso, «¿esto es idéntico a
   la versión anterior?» es un comando y un número para **cualquier** cambio,
   y el agente puede afirmarlo sin mirar. Los 13 commits de «0 píxeles
   distintos» son la prueba de que el patrón escala.
2. **`pss contact changed=`: la hoja del *cambio*, no de una lista de ids.** La
   llamada de hoy exige que el agente nombre los assets; el error de #53 (el
   brote feo entre bambúes lindos) requiere lo contrario: la hoja de **todo lo
   que cambió desde la baseline, más sus vecinos de familia**, antes y después,
   en una imagen. Cierra el agujero de «nadie lo miró» sin depender de que el
   agente se acuerde de qué mirar.
3. **`pss stage`: el asset en contexto, no sobre fondo liso.** Es lo que hacen
   los `shot_*.gd` a mano y lo que ningún comando de PSS hace: el asset sobre
   su suelo real, a la escala del juego, con el personaje de referencia al
   lado, **de día y de noche**, con las luces del manifiesto. La hoja de
   control ya pone fondo y grilla; falta que la escena sea **la del proyecto** y
   que salgan los dos momentos. Habría cazado #109 (ícono a 16 px en el
   inventario real) y #130 (dos etiquetas pisándose). Es la pieza que más
   dolería no tener en un motor que promete «assets de un juego».
4. **`pss compare a= b= --ciego`: lado a lado con etiquetas ocultas y la clave
   aparte.** Existe como procedimiento manual y produjo la mejor decisión de
   estilo del proyecto. Son unas decenas de líneas y convierte «¿cuál te gusta
   más?» en un experimento repetible. Con dos agentes dibujando en paralelo —
   que es cómo se trabaja acá — es la forma natural de decidir.

Y tres reglas de producto que valen más que las cuatro features:

- **Todo comando que escribe un asset termina imprimiendo el lint y la ruta de
  su hoja de contacto.** Hoy `./arte.sh control` encadena hoja y lint porque
  alguien se acordó; si el motor lo hace solo, el agente no puede declarar
  listo algo que no miró, porque la ruta de la imagen ya está en su propia
  salida.
- **`map_render` y `map_compare` tienen que entrar a `LOOKING`.** Hoy están
  afuera: un agente que renderiza un mapa o lo compara recibe
  `ok map_render: …` y tiene que pedir `preview: true` a mano. Son justo los
  dos comandos visuales que un compositor de escenas querría mirar, y la
  política de costo de `brief.ts` los dejó del lado barato por ser «comandos
  que escriben». Es una línea de código y es el bug de ergonomía agéntica más
  caro del repo.
- **La checklist viaja con el motor.** Las seis preguntas de
  `estilo_mapas.md` son genéricas (legibilidad del paso en 2 s, dirección y
  temperatura de la luz, focos cálidos de noche, algo delante del jugador,
  movimiento poco y desfasado, color dominante). PGS debería imprimirlas junto
  con la hoja, como hace `sound_contact` con sus advertencias.

---

## 5. Lo que todavía duele

### 5.1 Un proceso de PSS por paso — **de PGS, y es lo más urgente**

Issue #129 del juego, con números medidos: `./arte.sh personajes` tarda
**1:46** para cuatro personajes; los veintipico de la receta, varios minutos.
`scripts/personajes.py` llama a `bin/pss` una vez por paso **y por cuadro**.
Subir `tocado` y la búsqueda de la cara a PSS (`pss stamp`, `pss face_points`,
PSS `de10ee4`) bajó de 2:18 a 1:46 sacando cientos de llamadas; quedan `barba`,
`afeitar`, `arrodillar`, `atacar_de_pie` y `pelear` pidiendo `pss ascii` cuadro
por cuadro y `pss draw` por cada parche.

**Dato medido en este repo hoy**: `bin/pss` arranca en ~0,18 s (tres corridas,
caché caliente; `cli.ts` importa estáticamente todo el grafo de `commands.ts`,
así que esos 180 ms incluyen transpilar el módulo entero). El issue estimaba
~0,7 s. Con cualquiera de los dos números, **el orden de magnitud cierra**:
cientos de llamadas × 0,2–0,7 s son los dos minutos. `bin/pss-mcp` sí es un
proceso persistente, pero cada llamada sigue siendo un round-trip del agente, y
cada paso que escribe hace `loadAsset` + `saveAsset` del JSON entero desde
disco.

Lo que falta estructuralmente: **no existe forma de mandar N comandos en una
invocación.** Busqué `batch`, `daemon`, `--watch`, `repl`, modo `-` para leer
de stdin: no hay nada.

**Hacen falta las dos salidas del issue, en este orden, y hay una tercera que
es la verdadera.** El diagnóstico más profundo es que `scripts/personajes.py`
**es una receta escrita en Python**: decide en el lenguaje del juego lo que PSS
dibuja, paso por paso, desde afuera. Para los mapas ese problema ya se resolvió
y la solución está medida: las recetas de suelo corren **adentro** de PSS, un
`pss map_export` pinta un mapa entero de una llamada, y el resultado fue 14 000
líneas de Python borradas con 0 píxeles de diferencia. **La forma de la
solución ya existe en el repo; falta aplicarla a personajes.**

- `pss batch` (lista de comandos JSON por línea, un proceso, el asset en
  memoria) es el parche correcto para mientras, y como dice el issue «sirve a
  todos los scripts de `scripts/` sin discutir qué es del juego y qué no».
- `recetas/personajes.json` como **receta de PGS** es el arreglo.

Issue #68 del juego es el mismo diagnóstico escrito por Joaquín el 5 de
octubre, con la frase que debería abrir el documento de PGS: «**eventualmente
sería mucho más fácil crear otro juego**». Lista exactamente lo que quedó
pegado: `visuals.json` y su cargador, el contrato de animaciones, `suelo_vivo`
y `telon_vivo` con sus shaders, `pixel_nitido.gdshader`, el marco vertical de
las cartas, y los scripts de `scripts/` «que deciden en Python lo que PSS
dibuja».

### 5.2 El CI de PSS en rojo — **de PGS, y es peor de lo que dice el issue**

Issue #128 del juego reporta un error de eslint y tres de `tsc`. El estado real
hoy, verificado contra el log de la corrida 37471651639: **las últimas cuatro
corridas de `main` fallan** (desde el 5 de octubre; las dos del 1 de octubre
pasaban), y el job muere en `npm run lint` por **un solo error**, un ternario
usado como statement en `src/headless/mapsteps/grovesteps.test.ts:125`
(`@typescript-eslint/no-unused-expressions`; 1 error, 180 warnings, sin
`--max-warnings`).

Y porque muere ahí, **`tsc`, los tests y el build nunca corren en CI**. Debajo
hay **81 errores de `tsc -p tsconfig.app.json --noEmit`**: ~70 son ruido de
varianza (`readonly` de los fixtures contra las tuplas mutables de `MapStep`,
todos en `*steps.test.ts`), pero cuatro importan de verdad:

- `src/headless/commands.ts:320` — `z.record(z.unknown())` con firma de zod v4.
- `src/headless/mappaint.ts:1215` — `Property 'seed' does not exist` sobre el
  union `MapStep`.
- `src/headless/mapsteps/cavern.ts:585` — `Object.hasOwn` no existe:
  **`tsconfig.app.json` tiene `lib`/`target` por debajo de es2022.** Es
  configuración, no código.
- `src/headless/terrain.test.ts:46` — dos `possibly undefined`.

El `AGENTS.md` de PSS dice «`npm run lint` — ESLint (**must pass with 0 errors;
CI runs it**)». Esa regla está incumplida.

Por qué esto no es cosmético: el issue #128 lo dice mejor que yo —
«**mientras estén, cualquier push a PSS llega con el CI en rojo y no se
distingue de una rotura nueva**». Para un agente es peor que para una persona:
la persona recuerda que estaba rojo, el agente arranca de cero cada sesión, y
la elección es gastar el turno investigando un rojo ajeno o acostumbrarse a
ignorar el rojo. Las dos son malas. **PGS necesita el verde como invariante y
un `npm run check` único** que el agente corra antes y después, para que la
diferencia entre los dos sea lo único que tenga que leer.

Y el titular, para que quede dicho: **un motor que vende verificación tiene su
propia verificación apagada.** Nueve comandos de lint sobre arte, y cuatro
commits con el pipeline de calidad en rojo.

### 5.3 El índice de git compartido entre agentes — **del harness, con una pieza de PGS adentro**

El `AGENTS.md` del juego dedica su bloque más largo de reglas duras a esto:
nada de `stash`/`checkout`/`reset`/`clean`/`rebase`/`push`; `git add` de rutas
concretas y nunca `-A` ni `.`; `git commit -- <rutas>`; y para un archivo
compartido con cambios ajenos, armar el commit con un índice temporal y
`git commit-tree` + `git update-ref`, porque «un `GIT_INDEX_FILE` leído antes
de que otro commitee **revierte su commit en silencio**».

Eso es harness: PGS no tiene nada que decir sobre git. **Pero el archivo que
dispara la precaución es un archivo de datos, y la decisión de que sea uno solo
sí es de motor.** `data/visuals.json` es el manifiesto de todo el arte del
juego y lo editan todos los agentes de arte a la vez; el anexo tuvo que
documentar que `json.dump(indent=2)` lo reformatea entero («miles de líneas de
diff: tocar sólo las líneas propias con un script») y que se edita cargando y
guardando justo antes.

**Si PGS define el manifiesto de assets como un archivo por asset** (o por
carpeta) en vez de un JSON gigante, la mitad de la fricción de paralelismo
desaparece por diseño, sin tocar git. Es la decisión de formato más barata y de
mayor retorno de todo este documento.

### 5.4 El watchdog que corta corridas largas — **del harness, con una obligación para PGS**

Las reglas del juego exigen correr Godot siempre con tope
(`perl -e 'alarm 300; exec @ARGV'`) porque «un script que no compila deja a
Godot esperando para siempre», y prohíben trabajo en segundo plano y bucles de
espera. Eso es harness.

La obligación que le deja a PGS es: **ninguna operación debería necesitar ser
larga.** Hoy `./arte.sh` sin argumentos tarda unos 5 minutos y reexporta todo,
y el anexo ya tuvo que documentar el escape («Exportar sólo esto:
`bin/pss export_sheet` por archivo»). Un motor para agentes necesita que todo
sea **incremental por defecto**: reexportar sólo lo que cambió respecto de la
baseline, con `--todo` para forzar. Es el mismo principio que las 21
herramientas del juego ya aplican al **reportar** (resumen por defecto, `--todo`
si hace falta), aplicado al **trabajo**.

### 5.5 Lo que es del harness y punto

Los topes de bytes por documento y `./contexto.sh`; la prohibición de abrir el
juego (Joaquín puede estar jugando) y de escribir en `user://` (la partida se
protege con `user://pruebas`); la regla de borrar los `shot_*.gd` al terminar;
que cada agente lea su anexo y nada más. Es cómo se dirige una flota de
agentes, no cómo se hace un asset. No sube a PGS — pero vale como anexo de
«cómo trabajar con PGS», porque es la parte que nadie escribe hasta que se la
tropieza.

### 5.6 La fricción de fondo: el issue #1 de PSS es este documento desde el otro lado

El issue #1 («PSS es un motor de creación, no una colección de assets»),
elevado a principio rector en `ROADMAP_NEXT.md` el 6 de octubre, diagnostica el
mismo problema en la capa de mapas: 8606 líneas en `src/headless/mapsteps/`, 92
comandos `map_*`, y **3886 líneas en seis archivos con nombre de un mapa del
juego** contra 2141 de infraestructura genérica. Trece archivos se describen a
sí mismos como «port of the \<X\> script of The Unwritten Dao». Un solo claro al
pie de un salto se llevó doce comandos; «almohadones de musgo mojado» no es un
concepto de pixel art.

Y nombra la causa con precisión: **el objetivo era cero píxeles de diferencia
contra los scripts de Python, y esa restricción obliga a codificar las
decisiones exactas del original — lo contrario de generalizar.** «El resultado
salió bien; el reparto, mal.»

Dos cosas que vale conectar con esta auditoría:

- La opción (3) del issue, **destilar** cada familia a un paso genérico con
  opciones, «depende enteramente de `map_compare` como red de seguridad». O
  sea: el control de §2.5 no es sólo lo que habilitó la migración pasada, es lo
  que habilita la limpieza pendiente. **Generalizarlo a `baseline`/`diff`
  (§4.3.1) es la inversión que desbloquea el issue #1.**
- La opción (4), «que los ejemplos generen», **es literalmente PGS**.

El issue también deja la regla que debería gobernar el borde de ahora en más:
**«cada vez que algo cruza entre un juego y PSS, el commit contesta en una
línea por qué generaliza»**, más la moratoria («hasta decidirlo, no se agranda:
un paso con nombre propio entra sólo si va a servir a una segunda escena»). El
caso espejo de la misma semana es el issue #68 del juego: `tocado`, `bigote` y
`vincha` se quedaron en `scripts/personajes.py` **siendo capacidades de PSS**.
El borde se cruza mal en las dos direcciones.

---

## 6. Qué tendría que traer PGS de fábrica

Ordenado por errores reales cazados, no por elegancia.

1. **Comparación contra la versión anterior, para cualquier asset.**
   `map_compare` generalizado a `baseline` + `diff`. El control que habilitó la
   migración más grande del proyecto, el único que le deja a un agente afirmar
   «no cambió nada más» con un número, y el que desbloquea la limpieza del
   issue #1. Requiere lo que PSS ya tiene: generadores deterministas.
2. **Lint de asset con escapes declarables y tests de sus propios falsos
   positivos.** `pss lint` ya cubre paleta, grilla, píxeles sueltos, piezas
   despegadas y costuras; `map_lint` el estilo del suelo. Lo que falta copiar
   del juego no es una regla, son **tres mecanismos**: el trinquete
   `PENDIENTES` (activar un lint el día uno sin bloquear a nadie, y que la
   deuda no se vuelva permanente), el escape declarado (`paleta_libre`,
   `colgado`, `interior`), y la lista blanca con test
   (`los_adornos_altos_sin_sombra_son_decisiones`). Un lint con falsos
   positivos y sin escape lo aprende a ignorar el agente, y entonces no existe.
3. **Contrato de animaciones declarado por proyecto**, chequeado contra el
   `frameTags` de la hoja, sin motor de juego. Barato, y cubre el error más
   vergonzoso.
4. **Validación del manifiesto de colocación**: huellas dentro del lienzo, que
   no se pisan (con excepciones declarables), celdas de personaje libres,
   claves y rangos cerrados para luz/niebla/sombra/detalle, salidas que
   apuntan a algo que existe y dejan al jugador en celda pisable, y
   **alcanzabilidad por BFS**. Es el paquete que `mapas.py` +
   `test_sect_map.gd` + `test_mapas_alcanzables.gd` ya probaron, y el único que
   caza «el asset está bien y la escena está mal». Requiere la decisión de
   producto de §3.2.
5. **Verificación visual de fábrica**: hoja de contacto del cambio (no de una
   lista), render en contexto de día y de noche, antes/después con baseline, el
   lado a lado a ciegas, y la checklist de seis preguntas impresa junto a la
   hoja. Más: `map_render` y `map_compare` dentro de `LOOKING`, y que todo
   comando que escribe imprima su lint y la ruta de su hoja.
6. **«¿Este asset se va a ver alguna vez?»** El grafo de referencias en la otra
   dirección: un sprite exportado que nadie referencia. Es el mismo código que
   la integridad referencial que ya tiene, leído al revés.
7. **Un proceso, no cien**: `pss batch` ya, y recetas que corran adentro
   (personajes como los mapas) después. Todo incremental por defecto.
8. **Manifiesto por asset, no un JSON del mundo**, para que dos agentes puedan
   dibujar a la vez sin coreografía de git.
9. **Ergonomía de reporte**: alarmas primero, ≤25 líneas, `--todo` para la
   tabla, salida 1 si hay algo roto. Es lo que `brief.ts` ya empezó y lo que
   hace legibles para Joaquín y baratas para un agente a las 21 herramientas
   del juego.
10. **El verde como invariante y un `npm run check` único.** Sin esto, los
    nueve puntos anteriores son controles que el agente va a aprender a
    ignorar, porque ya aprendió a ignorar el rojo del CI.

Y lo que **no** sube: el balance, los diálogos, las misiones, el tiempo, los
riesgos, el grafo de hilos, la bitácora, la partida armada. Tampoco la paleta
madre, la tabla de materiales (`pasto`/`tierra`/`piedra`/`agua`/`nieve`), el
contrato de seis animaciones ni la convención de huella de este juego:
**esos son configuración del proyecto, y la diferencia entre un motor y un
segundo juego es exactamente que estén en un archivo y no en el código.**
