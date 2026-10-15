# El patio: un segundo mundo para medir el motor

*Diseño. 15 de octubre de 2026. Escrito antes del código.*

## Para qué

Dos cosas a la vez, y las dos importan:

1. **Medir qué quedó como capacidad de PGS.** Todo lo que el motor sabe nació de
   un pedido de The Unwritten Dao. La pregunta que ningún test contesta es
   cuánto de eso sirve para **otro mundo**: otra paleta, otra luz, otro contrato,
   otra escala. Un segundo consumidor es la única forma de saberlo.
2. **Un juego para la hija de Joaquín**, de 6 años, que quiere estar adentro de
   un juego. Esto no es la excusa del experimento: es el encargo, y manda sobre
   el experimento cuando los dos no coinciden.

El guiño: el primer dibujo que se hizo en Pixel Sprite Studio fue un gato. El
juego es ese gato buscando a una nena.

## El juego

**Una pantalla.** Un patio de casa al anochecer, visto desde arriba y un poco
del sur, como todo lo que PGS dibuja hoy. La luz de la puerta de la cocina es la
única luz cálida; el resto es el azul que queda después de que se fue el sol.

**El gato se mueve con las flechas.** Nada más. Sin inventario, sin combate, sin
menú, sin guardar partida.

**Tres cosas que investigar.** El gato se acerca, aparece una pregunta y la nena
que juega elige entre tres respuestas. Las preguntas son trivia de animales —
cuál corre más rápido, cuál duerme parado, cuál no toma agua nunca — porque eso
es lo que la jugadora ya elige mirar sola. Acertar hace que el animal se asome y
se quede. **Errar no cuesta nada**: el animal da una pista y vuelve a preguntar.
A los 6 años un juego no se gana, se termina.

**El cierre.** Con los tres animales asomados, la puerta de la cocina se abre y
la nena aparece en el umbral. El gato corre hacia ella. Fin.

**Dura un minuto y medio.** Si dura cinco, algo se agrandó y hay que sacarlo.

**Lo que dibuja ella.** El gato ya existe cuando ella se sienta. Lo abre en el
editor de PGS (`/dibujo`) y lo hace suyo: le cambia un color, le pinta una
manchita, le pone un collar. Eso es todo lo que tiene que poder hacer, y es
exactamente el eje de PGS puesto a prueba por la usuaria menos complaciente que
hay: el dibujo de texto es la verdad, la receta la vuelve a poner, y lo que pintó
ella sobrevive.

## El mundo, como archivo

`pgs.json` en la raíz del repo del juego. No hay nada nuevo acá: es
[`crear_mundo.md`](./crear_mundo.md) usado por primera vez por un proyecto que
no es The Unwritten Dao, que es la mitad del punto.

```jsonc
{
  "name": "El patio",
  "says": "Un patio de casa al anochecer. Azules y violetas apagados, y una
           sola luz cálida: la de la puerta de la cocina. Siluetas blandas,
           contorno de un píxel, nada de bordes duros. Es de noche pero no da
           miedo: la casa está ahí y la luz está prendida.",

  "visual": {
    "palette": "art/paleta.pss.json",
    "roles": {
      "base": "azul_patio",
      "light": "azul_claro",
      "dark": "violeta_sombra",
      "accent": "amarillo_cocina"
    },
    "grid": 16,
    "sizes": {
      "bicho": [16, 16],
      "gato":  [24, 24],
      "nena":  [16, 32]
    },
    "light":   { "from": "lower_right", "strength": "soft" },
    "outline": { "use": true },
    "dither":  { "use": false },
    "contract": "art/contrato.json"
  },

  "type": { "font": "art/nube8.txt", "steps": [8, 16] },

  "sound": {
    "says": "Un patio de noche: grillos parejos abajo, y arriba cosas sueltas y
             cortas. Nada metálico. El maullido es lo único que llama la atención.",
    "scale": "mayor_pentatonica",
    "rate": 22050,
    "materials": ["tela", "madera", "pasto"],
    "lengths": { "short": 0.08, "medium": 0.3, "long": 1.2 }
  }
}
```

**El contrato de animaciones del juego** es la otra prueba de
[`contract.ts`](../../src/headless/contract.ts), y es corto a propósito: un gato
que camina no pelea, no lanza una técnica y no se muere.

```json
{ "id": "patio",
  "anims": ["idle_{view}", "walk_{view}"],
  "views": ["down", "up", "left", "right"] }
```

Si un comando del motor se queja de que falta `attack` o `die`, eso es un
hallazgo: el contrato no era tan dato como creíamos.

## Las dos pasadas

**Pasada 1 — con lo que PGS ya puede, sin tocar el motor.** Se escriben las
recetas y los assets del juego usando los comandos como están. Si algo no se
puede, **no se arregla el motor**: se anota y se sale como se pueda, aunque la
salida sea fea. Una pasada que arregla el motor mientras avanza no mide nada,
porque al final no se sabe qué faltaba.

**Pasada 2 — ampliar sólo lo indispensable.** Con el diario de la pasada 1 en la
mano se decide, traba por traba, si es **capacidad reutilizable** (entra al
motor, con su test y su línea de por qué generaliza) o **cosa de este juego**
(se queda en el repo del juego). Es la regla del borde de
[ROADMAP_NEXT.md](../../ROADMAP_NEXT.md), y acá es lo único que decide qué entra.

## El entregable es el diario, tanto como el juego

Un archivo `DIARIO.md` en el repo del juego, una entrada por traba, escrita
cuando pasa y no al final:

- **Qué quise hacer**, en una línea.
- **Qué comando usé** y qué contestó.
- **Cómo salí** (la salida fea, o nada).
- **Qué le falta al motor**, y la pregunta que importa: ¿esto le va a pasar a
  cualquier juego, o sólo a éste?

Un juego terminado sin diario es un juego; el diario sin el juego ya vale.

## Quién lo hace, y la regla

La pasada 1 la puede hacer un agente de afuera, que no conoce PGS. Eso no es por
ahorrar: un consumidor que no sabe dónde están las trampas del motor es un test
más honesto que uno que sí. Las condiciones:

- **No toca `src/headless/` ni nada de este repo.** Si se traba, lo anota.
- **Consume PGS por la puerta de entrada de cualquiera**: el MCP (`bin/pgs-mcp`)
  o el CLI (`bin/pgs`), desde el repo del juego. Si la puerta no alcanza, eso es
  el hallazgo.
- **No se agranda la capa de mapas.** El patio se compone con pasos genéricos
  (`map_material`, `map_area`, `map_path`, `map_light`, `map_scatter`, `settle`).
  Un paso con nombre propio no entra.
- El `pgs.json` y este encargo se los damos escritos. Lo que no se da escrito es
  cómo resolver nada.

La pasada 2 no se delega: qué generaliza es la decisión que el experimento
existe para tomar.

## Las trabas que ya se ven, antes de empezar

Tres están a la vista leyendo el motor. Sirven de calibración: si la pasada 1 no
encuentra éstas, no está mirando.

**1. El retoque no destructivo sólo protege lo generado.** Lo único que hace que
GUARDAR escriba un `.retoque.txt` aparte es que el dibujo traiga
`generated_by:` (`src/lib/textDrawing.ts`, `if (asset.generatedBy)`). El gato lo
vamos a dibujar a mano, así que no lo trae, así que lo que pinte la nena **pisa
el archivo**. Es justo el caso que el mecanismo quería cubrir y no cubre: un
dibujo hecho a mano que es la base de otro no tiene cómo decirlo. Salida de la
pasada 1: el base vive en `gato.base.txt` y a ella se le da una copia. Lo que la
pasada 2 tiene que contestar: si un dibujo a mano puede declararse base
protegida, o si el editor puede guardar como retoque sin que nadie lo haya
generado.

**2. No hay rig de cuadrúpedo.** `figure` es un peleador bípedo y `animate`
deriva su anatomía del mapa de proporciones (`menton`, `hombro`, `faja`,
`ruedo`, `botas`): un cuerpo humano parado. Los generadores son `walk`, `run`,
`jump`, `idle` y combate de dos piernas. Un gato caminando de costado no entra en
nada de eso, así que su caminata se dibuja a mano, cuadro por cuadro. La
pregunta de la pasada 2 no es «hagamos un rig de gato»: es si el mapa de
proporciones puede describir un cuerpo que no es el chibi de un juego, o si los
animales son dibujo a mano por definición.

**3. El editor no está hecho para alguien de 6 años.** Lo que ella necesita es
pincel, balde, ocho colores y deshacer. Lo que abre es capas, línea de tiempo,
piel de cebolla y anatomía. Es de la app, no del motor, y hay que anotarlo igual.

Y la que no se ve todavía, que es la que más vale: **el patio decide el
[issue #1](https://github.com/Khadosh/pixel-gaming-studio/issues/1)**. La capa de
mapas está congelada porque 3886 de sus 8606 líneas viven en archivos con nombre
de un mapa de The Unwritten Dao. Componer una escena nueva —baldosas, un
cantero, una reja, un árbol, la luz de una puerta— con pasos genéricos y nada más
es la medición que contesta si esa capa es un motor o una colección. Ese
resultado vale más que el juego.
