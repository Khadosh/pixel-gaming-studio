# Sonido de ejemplo

Siete archivos para leer antes de escribir el primer sonido de un juego. No son
una biblioteca de assets: son **las formas que el motor sabe hacer**, una por
archivo, cada una copiable y modificable. Todo el sonido de PSS es texto: la
receta (o la partitura) es la fuente y el `.wav` se rehace siempre desde ella,
con los mismos bytes para la misma semilla.

El formato completo está en `src/headless/sound/recipe.ts` (capas, fuentes,
filtros, envolvente, LFO, eco, `events`) y en la cabecera de
`src/headless/sound/music.ts` (partituras). Acá está sólo lo mínimo para
arrancar.

## Los ejemplos

| archivo | qué es | qué enseña |
|:---|:---|:---|
| `golpe_seco.json` | un impacto en el cuerpo | el golpe mínimo: un seno que cae de 170 a 60 Hz más dos ruidos de distinto color, cada uno con su envolvente. Nada dura más de 0,2 s |
| `golpe_de_metal.json` | un martillo contra un yunque | **sub-capas como una sola voz**: las parciales del metal no son armónicas, así que se escriben a mano y comparten envolvente y `echo` |
| `agua_que_corre.json` | un ambiente en bucle | `loop: true` + `crossfade`: el final se cruza con el arranque y el WAV lleva su punto de loop (Godot lo importa como bucle). Los LFO `random` son el vaivén de la corriente; `events` suelta una burbuja de a ratos |
| `grillos_de_noche.json` | un ambiente poblado, en bucle | **bichos con `events`**: una capa chica repetida como voces sueltas, con su propio paso, tono y fuerza. El chirrido es un LFO de 26 a 33 Hz sobre la ganancia; la distancia, ganancia más un *lowpass* |
| `interfaz_elegir.json` | confirmar en un menú | una interfaz es un sonido corto y **sin ruido**: dos cuerdas pulsadas (`pluck`, Karplus-Strong) a la quinta. Con `damping` se elige entre brillante y apagado |
| `paso_en_grava.json` | un paso sobre un material | el apoyo (ruido grave y corto) y el material (`crackle`: ráfagas por segundo en una banda). Cambiar de material es cambiar tres números; cambiar **sólo `seed`** da el segundo paso del par, para que la caminata no repita el mismo byte |
| `bucle_en_la.partitura` | una vuelta de música, 8 compases | tempo y compás con chequeo de barras, dos instrumentos de fábrica, dos voces con su octava, dinámicas, un acorde, un bloque `[ … ]x2` y `loop: si`, que pliega las colas que siguen sonando sobre el arranque |

## Escucharlos

```bash
bin/pss sound recipe=examples/sonido out_dir=/tmp/sonido      # las 6 recetas
bin/pss music score=examples/sonido out_dir=/tmp/sonido       # la partitura
afplay /tmp/sonido/golpe_de_metal.wav                          # macOS; en Linux, aplay
```

Una sola receta, con nombre de salida propio:

```bash
bin/pss sound recipe=examples/sonido/golpe_seco.json out=/tmp/golpe.wav
```

## Verificarlos sin escucharlos

Es la parte que importa cuando el que genera es un agente. `sound_contact` mide
cada WAV y avisa de lo que se oye mal antes de que nadie lo oiga:

```bash
bin/pss sound_contact 'paths=["/tmp/sonido"]' out=/tmp/sonido/control.png
```

Da una tabla y, con `out`, una hoja de ondas en PNG para mirar de un saque:

- **sec / Hz** — duración y frecuencia de muestreo.
- **peak / rms** (dBFS) — cuán fuerte está y cuán parejo. Un golpe tiene pico
  alto y RMS bajo; un ambiente, los dos parecidos.
- **dc** — corrimiento de continua: lejos de 0 es un sonido que empuja el
  parlante para un lado.
- **centroid** — el centro del espectro en Hz: grave (viento) ↔ agudo
  (campanita). Es la forma de chequear «quedó demasiado brillante» con un
  número.
- **loop** — `seam ok` si el bucle empalma sin salto ni click en el cruce.
- **check** — `ok`, o lo que haya: un efecto que no arranca y termina en
  silencio (va a chasquear al dispararse), un click en el medio, continua.

Los siete ejemplos dan `0 with warnings`, y hay un test que lo exige
(`src/headless/sound/sound.test.ts`): si uno deja de renderizar o deja de pasar
el control que viene a enseñar, es un bug.

## Los que no están acá

El motor tiene más de lo que estos siete muestran: las fuentes `string`
(cuerda afinada exacto, con `ring` en segundos y posición del pulsado) y `bell`
(modal, con `partials` inarmónicas y `beat`), el filtro `peak` con `track:
false` (la caja de un instrumento), y nueve instrumentos de fábrica para las
partituras (`citara`, `qin`, `gota`, `cuenco`, `campana`, `gong`, `tambor`,
`madera`, `bambu`). Están documentados en `AGENTS.md`, sección «Sound» y
«Music», y en los esquemas de `src/headless/sound/`.
