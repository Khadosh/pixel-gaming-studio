# Pixel Gaming Studio — Visión a Futuro 🔮

> Roadmap estratégico con las fases pendientes del proyecto.
> Para el historial de lo completado, ver [ROADMAP_COMPLETED.md](./ROADMAP_COMPLETED.md)
> Para el sprint actual, ver [ROADMAP_IMMEDIATE.md](./ROADMAP_IMMEDIATE.md)

---

## Principio: PGS es un motor de creación, no una colección de assets 🧭

> Joaquín, 6 de octubre de 2026. Vale para todo lo que entre de acá en adelante.

PGS tiene que ser un **generador de juegos**, no una colección de cosas hechas.
Una colección se justifica sólo en dos casos: que sirva de **ejemplo rápido** de
algo, o que esos ejemplos **ayuden a generar cosas nuevas**. De los mapas de un
juego lo que se toma es **qué nos sirve para generar mapas**, no el mapa.

Hoy esto no se cumple del lado de los mapas: de las 8606 líneas de
`src/headless/mapsteps/`, 3886 están en seis archivos con nombre de un mapa de
The Unwritten Dao, y trece archivos se describen como «port of the \<X\> script
of The Unwritten Dao». Un solo claro al pie de un salto se llevó doce comandos.
Pasó por buscar cero píxeles de diferencia contra los scripts del juego, que
obliga a codificar las decisiones del original en vez de generalizarlas.

Qué hacer con eso está sin decidir y se medita en el
[issue #1](https://github.com/Khadosh/pixel-gaming-studio/issues/1): congelar la
capa, separarla como biblioteca de ejemplos, destilarla en pasos genéricos con
opciones, o convertirla en semilla para generar mapas nuevos. **Hasta decidirlo,
no se agranda**: un mapa nuevo se compone con pasos genéricos, y un paso con
nombre propio entra sólo si va a servir a una segunda escena.

**La regla del borde:** cada vez que algo cruza entre un juego y PGS, el commit
contesta en una línea por qué generaliza. El caso espejo pasó la misma semana:
`tocado`, `bigote` y `vincha` vivían en los scripts del juego siendo capacidades
de PGS.

---

## Dirección siguiente: la segunda proyección (isométrica) 🧊

> Joaquín, 12 de octubre de 2026, después de preguntar cuánto costaría pasar
> The Unwritten Dao a isométrico: «no es simplemente un cambio de arte, es
> básicamente hacer de 0… quizás puede ser el próximo nivel para PGS». Sin fecha.

Hoy PGS sabe dibujar mapas **desde arriba** (3/4 cenital sobre celdas
cuadradas): setenta pasos de mapa (risco, edificio, techo, arboleda, agua,
senda, escalinata, mar de nubes…) que nacieron uno por uno de lo que un juego
pidió, con su lint, su regresión visual y su caminante. Y sabe armar chibis por
**molde** (`cuerpo32_base`: vistas frente, espalda, perfil) más identidad, por
capas con paleta por índices y capas completas.

La segunda proyección no es un parámetro de los pasos de hoy: es otra
geometría (rombo 2:1, orden por profundidad, qué tapa a qué), así que son los
mismos setenta pasos otra vez, en rombo, y un molde isométrico nuevo con sus
vistas diagonales. Lo que se hereda entero: el motor de recetas, el lint, la
regresión, el rig por capas, el recolor, el creador de personaje, las fuentes,
el sonido. Es el caso de uso que falta para que PGS sea **motor** y no la
herramienta de un juego: dos proyecciones prueban que las recetas no están
casadas con una.

Cómo entra: **no** con The Unwritten Dao como conejillo (ahí sería rehacer la
capa de arte entera con el juego intacto abajo; cinco o seis semanas de
noches). El juego que venga después de 1.0 nace isométrico y hace crecer PGS
como éste lo hizo con el cenital, paso a paso y con la regla del borde.
Antes, en el cenital, queda un escalón más barato que cualquier juego va a
pedir: las **ocho direcciones** del rig (dos vistas diagonales en el molde, una
vez; las cabezas dibujadas son el costo).

**La técnica candidata: voxel para lo construido y los cuerpos, dibujo para el
acabado** (Joaquín, 12 oct: «¿la técnica sería voxeles?»). Un voxel es un píxel
con volumen: un modelo de voxeles es 3D de verdad, así que se arma una vez y
las vistas salen todas (frente, espalda, perfil, las cuatro diagonales, el
cenital de hoy, la isométrica), con luz y sombra coherentes, y las animaciones
por piezas (brazo, pierna) se renderizan en todas las direcciones solas. Las
vistas buenas son los ángulos limpios (cada 90 grados y las isométricas); una
rotación libre escalona los cubos. El render no es pixel art todavía: la pasada
que lo vuelve dibujado (cuantizar a la paleta madre, contorno de un píxel, dos o
tres tonos por material, dithering donde convenga) es el trabajo de verdad, y es
donde PGS ya tiene músculo (`palette_fit`, `remap`, el lint de estilo). Las
caras, el pelo y los adornos finos siguen siendo dibujo de texto por vista,
encima: es lo que da el carácter y donde el voxel pierde. Reparto: terreno,
edificios, muros, puentes y árboles en voxel; el molde de los chibis en
volumen; el acabado a mano.

**El formato del voxel (13 oct, de una devolución de ChatGPT que trajo Joaquín sobre el ASCII → píxel):** no una
matriz llena por altura sino **capas con herencia y diferencias** (`inherit` / `add` / `remove` / `replace`, o mejor,
primitivas con rango de altura: una caja de (x, y, z) a (w, d, h), un material; la nieve y el musgo por superficie
expuesta con semilla, no adentro del volumen), con el material separado del color (base, luz, sombra, hondo: el
render elige por cara y por luz) y la proyección aparte de la geometría. La regla de escala que ya cumple PGS en
los mapas y vale igual acá: **ASCII para lo chico (hasta 32 px: sellos, caras, adornos), híbrido para lo mediano,
declarativo para lo grande** (un muro de 200 px cuesta lo mismo que uno de 20: cambia un parámetro); el ASCII queda
como capa de retoque por píxel sobre lo generado. Lo que mide si conviene: tokens de generación más correcciones por
asset aceptado, no tokens por asset. Antes de eso, barato y para este juego: **props paramétricos** (banco, farol de
pedestal, poste, estandarte, pedestal: plantilla + material + nieve + desgaste + semilla, en 3/4 con dos o tres píxeles
de fondo y una pata corrida) para no redibujar cada sello a mano y para que no salgan simétricos y de frente.

---

## Fase 8 — Studio Pro (continuación) 🚀

### 8.1 — Anatomy-Driven Animation Suite (Foco Actual)
- [ ] **Pixel-Perfect Transforms**: Migrar el motor de animación de rectángulos a máscaras de píxeles reales.
- [ ] **Core 8 Suite**: Set de 8 animaciones base pro (Idle, Walk, Run, Jump, Attack, Hurt, Cast, Die).
- [ ] **Skeleton & Hierarchies**: Sistema de herencia de movimiento (ej: el brazo sigue al hombro).

### 8.2 — Tipo de Proyecto (Project Mode)
*Prerequisito para: Sandbox, perspectivas inteligentes, filtros de animación*

- [ ] **Definición de modo**: Selector al crear asset/proyecto — `side-scroller`, `top-down`, `isometric`
- [ ] **Filtro de perspectivas**: Side-scroller solo muestra Side R/L; Top-down muestra Front/Back/Side; Isometric muestra sus ángulos
- [ ] **Filtro de animaciones**: Platformer sugiere `jump`/`fall`; Top-down sugiere `walk_up`/`walk_down`; Side-scroller sugiere `walk_left`/`walk_right`
- [ ] **Grilla por defecto**: Isometric activa rejilla de diamante; Top-down activa cuadrada; Side-scroller sin grilla especial

### 8.3 — Galería de Equipamiento (Clothing/Props)
- [ ] **Ropa Inyectable**: Capas de equipo (cascos, abrigos, armaduras) pre-alineadas a las bases estándar
- [ ] **Categorización**: Filtros específicos para "HEADWEAR", "CHEST", "ACCESSORY"
- [ ] **Creación masiva**: Assets por categorías (objetos, consumibles, equipo)

### 8.4 — Wizard de Creación Mejorado
- [ ] **Flujo Guiado**: Asistente por pasos (Modo → Categoría → Plantilla → Configuración)
- [ ] **Filtros Inteligentes**: Ocultar animaciones/herramientas no válidas según la categoría y modo del asset

### 8.5 — Motor IA Híbrido (HQ Image-to-Pixel)
- [ ] **HQ Generation**: Prompt → Imagen RAW de alta calidad (vía Gemini)
- [ ] **Auto-Import Pipeline**: Puente automático entre la imagen generada y el motor de pixelización/cuantización del Studio

---

## Fase 9 — Ecosistema de Proyecto Integral 🌍
*Prioridad: ALTA — Evolucionar de un editor de sprites sueltos a un creador de recursos de juego (Game Asset Suite), con una UI de proyecto real*

### 9.1 — Sistema de Tipos de Asset
- [ ] **Categorización Core**: Separar formalmente los recursos en `Characters`, `Assets/Props`, `Tilesets`, `Fonts` (Tipografía) y `UI Elements`.
- [ ] **Project Dashboard Overhaul**: Rediseñar la vista principal del proyecto con secciones dedicadas para cada categoría, dando una visión real de que se está armando un juego y no solo archivos sueltos.
- [ ] **Herramientas Especializadas**: Adaptar el "Studio" según el tipo de asset (ej: tilesets no necesitan timeline de animación de personaje, pero sí testing de autotiling).

### 9.2 — AI Font Generator & Tipografía
- [ ] **Generación de Fuentes vía IA**: Capacidad de generar "spritesheets" de fuentes bitmap completas a partir de un prompt (ej: "fuente gótica medieval 8x8" o "fuente sci-fi neón").
- [ ] **Mapeo Automático**: Slicear e identificar las letras (A-Z, 0-9) automáticamente para crear una fuente utilizable en motores de juego.
- [ ] **Text Preview Editor**: Un mini-canvas para probar la fuente en tiempo real escribiendo diálogos de prueba.

---

## Fase E — Integración y Exportación Pro 💰

### E.1 — Export profesional
- [ ] **Export Spritesheet JSON (Texture Packer format)** — PNG plano + JSON con nombre de animación, índices de frames, duración por frame y rect coordinates. Importable en Godot, Unity y Defold
- [ ] **Resize / crop canvas** — Anchor configurable, presets 8×8 / 16×16 / 32×32 / 64×64
- [ ] **Export a Godot** — Recurso `.tres` con spritesheet embebido
- [ ] **Export a Unity** — Atlas PNG + JSON con rect coordinates por frame
- [ ] **Import palette (.pal / .gpl)** — Cargar paletas de herramientas externas
- [ ] **Sprite sheet import** — Cargar PNG y dividirlo en frames automáticamente

### E.2 — 🧪 Mini Sandbox de Gameplay
*El loop completo: generás → animás → testeás → exportás.*
*Prerequisito: Tipo de Proyecto (8.2) debe estar implementado.*

- [ ] **Canvas de prueba interactivo** — Canvas separado del editor, loop con `requestAnimationFrame`
- [ ] **Character controller** — Movimiento con teclado (WASD / flechas), detección de dirección según modo (side-scroll vs top-down)
- [ ] **State machine de animación** — Transiciones automáticas: idle ↔ walk → attack, basadas en input del teclado
- [ ] **Tilemap de fondo seleccionable** — 2-3 tilemaps de ejemplo (interior, exterior, dungeon)
- [ ] **Driven por el contrato de export** — El sandbox consume el mismo JSON que se exporta a engines

---

## Fase 7 — Expansión de Contenido 🎨

- [ ] **Librería Esencial (16x16)**: Pociones, naturaleza, cofres y items listos para usar
- [ ] **Tilemap Support**: Generación de tiles de terreno (pasto, agua, muros) compatibles entre sí
- [ ] **Composición Multicapa**: Herramientas para alinear assets importados rápidamente

---

## Fase B — Monetización y Onboarding 💵

- [ ] **Sistema de créditos IA + Stripe** — Integración de pagos, planes Free/Pro, cobro por generación
- [ ] **Onboarding interactivo** — Tutorial paso a paso para nuevos usuarios
- [ ] **Changelog público en la app** — Mostrar últimas updates; builds confianza

---

## Fase C — Plataforma y Comunidad 🌐

- [ ] **Galería pública de sprites** — Feed de creaciones con likes y filtros
- [ ] **Share link de solo lectura** — URL pública con preview embebible
- [ ] **Marketplace** — Venta de packs de sprites con revenue share (70/30)
- [ ] **Colaboración básica** — Compartir proyecto editable con otros usuarios
- [ ] **API pública** — Docs, autenticación con API keys, rate limits por tier

---

## Fase D — Escala 🚀

- [ ] **Colaboración real-time** — Co-edición con cursors compartidos (Supabase Realtime)
- [ ] **AI in-painting** — Seleccionar área del canvas y regenerar parcialmente con prompt
- [ ] **Batch AI generation** — Set completo de animaciones canónicas en un solo click
- [ ] **Smart Multi-layer AI Splitting** — IA detecta y separa colores/posiciones en capas
- [ ] **Tilemap editor básico** — Construir niveles con los tiles generados
- [ ] **Mobile / tablet (PWA)** — Touch events, soporte stylus, layout adaptado
- [ ] **Plugins / scripting** — API para automatizar workflows

---

## Backlog / Ideas Futuras

| Feature | Complejidad | Impacto |
|:--------|:-----------|:--------|
| Bezier curve drawing | 🔵 Alta | Bajo |
| Gradient tool | 🟡 Media | Bajo |
| Color modes (Indexed, Grayscale) | 🔵 Alta | Medio |
| Animation easing curves | 🔵 Alta | Medio |
| CLI / batch export headless | 🔵 Alta | Medio |
| Tilemap editor completo | 🔵 Alta | Alto |
| Sombreado Dinámico Procedural (Fuente de Luz) | 🔵 Alta | 🔥 Muy Alto |
| Image Overlay Guide (capa fantasma externa) | 🟡 Media | Medio |
| Exportación de Máscaras por Miembro (Spine/Spriter) | 🟡 Media | Medio |
