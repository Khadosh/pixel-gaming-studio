# Pixel Sprite Studio — Auditoría Estratégica 2026

> ## ⚠️ Documento histórico (abril de 2026). Superado.
>
> **No arranques una sesión con esto: el mapa está viejo.** Esta auditoría
> describe PSS como «un editor de pixel art browser-based», y hoy PSS es un
> motor de assets por CLI y MCP con 136 comandos (de los 431 archivos tocados en
> octubre, 403 están en `src/headless/` y 8 en la app). Los tres features que
> acá figuran como bloqueantes se hicieron y resultaron irrelevantes; lo que
> desbloqueó el arte de un juego entero fue el dibujo por texto, que no está
> mencionado en ninguna parte de este archivo.
>
> **El estado actual está en [`docs/auditoria/`](docs/auditoria/README.md)**
> (octubre de 2026: qué es PSS hoy, la brecha hacia PGS y por dónde empezar), el
> plan táctico en [`ROADMAP_IMMEDIATE.md`](ROADMAP_IMMEDIATE.md) y la capacidad
> real en [`AGENTS.md`](AGENTS.md).
>
> **Se conserva porque dos partes siguen valiendo:** el posicionamiento
> competitivo (§3, contra Aseprite, Piskel, Pixilart) y el riesgo de costo de la
> IA (§8), que no cambió de naturaleza. Todo lo demás —roadmap, prioridades,
> «brechas críticas»— leelo como historia.
>
> `AUDIT_TECNICA.md` (2026-09-22), en cambio, sigue vigente.

> Generado: 2026-04-08  
> Objetivo: Análisis FODA, brechas de producto, benchmarking competitivo y estrategia de monetización.
> Ver también `AUDIT_TECNICA.md` (2026-09-22): auditoría de código, backend, seguridad y deuda técnica.

---

## 1. Estado Actual del Producto

Pixel Sprite Studio es un **editor de pixel art browser-based** con las siguientes capacidades activas:

- Editor de canvas pixel-by-pixel (brush, eraser, fill, shapes, eyedropper)
- Sistema de capas con visibilidad, bloqueo y opacidad
- Timeline con drag-and-drop de frames
- Animaciones múltiples por sprite con playback en tiempo real
- Onion skinning
- Generación de sprites y animaciones via IA (Google Gemini 2.5 Pro)
- Exportación PNG y GIF
- Autenticación y persistencia en Supabase
- Catálogo público de assets (16 sprites pre-cargados)
- Librería de props (armas, accesorios inyectables como capas)

**Stack:** React 18 + TypeScript + Vite + Tailwind + Supabase + Gemini API

---

## 2. Análisis FODA

### Fortalezas

| # | Fortaleza | Impacto |
|---|-----------|---------|
| F1 | **IA generativa integrada** — Gemini 2.5 Pro genera sprites y animaciones directamente desde prompt | Alto |
| F2 | **Arquitectura modular** — 7 sub-hooks especializados, Context API, separación clara de concerns | Medio |
| F3 | **Stack moderno** — React 18, TanStack Query, Supabase, Vite; stack productivo, escalable y reclutable | Alto |
| F4 | **Editor rico** — Layers, timeline dnd-kit, onion skin, shapes, symmetry, shortcuts de teclado | Alto |
| F5 | **Suite de tests** — 9 archivos de test unitarios cubriendo los hooks principales | Medio |
| F6 | **Persistencia real** — Supabase con RLS, Auth, JSONB storage; no es solo un demo | Alto |
| F7 | **UX pulida** — Press Start 2P font, dark theme, toasts, kbd hints, layout "Holy Grail" | Medio |
| F8 | **Props system** — Inyección de accesorios como capas (armas, escudos) — diferenciador único | Alto |
| F9 | **Formatos de salida** — PNG con transparencia + GIF animado | Medio |

### Debilidades

| # | Debilidad | Riesgo |
|---|-----------|--------|
| D1 | **TypeScript no-strict** — `strict: false` en tsconfig; bugs tipo silenciosos en producción | Medio |
| D2 | **Sin herramienta de selección** — No se puede seleccionar, mover, ni copiar una región del canvas | Alto |
| D3 | **Sin importación de imágenes** — No se puede cargar un PNG externo como referencia o sprite | Alto |
| D4 | **Canvas sin zoom** — No hay zoom in/out en el editor; los sprites de 32×32 pueden ser difíciles de editar | Medio |
| D5 | **Palette system limitado** — Sin HSL picker, sin auto-shade, sin templates (NES, Game Boy) | Medio |
| D6 | **Sin resize/crop** — No se puede cambiar el tamaño del canvas una vez creado el sprite | Medio |
| D7 | **Sin undo para operaciones de alto nivel** — Solo hay undo de pixel drawing; mover capas o borrar frames no se puede deshacer | Alto |
| D8 | **No hay merge de capas** — Listado en Fase 3 como pendiente pero sin completar | Bajo |
| D9 | **Sin colaboración** — Todo es single-user; no hay sharing, no hay link público al sprite | Medio |
| D10 | **Catálogo de assets estático** — Solo 16 sprites pre-cargados en código; no hay UGC (user-generated content) | Medio |
| D11 | **CORS abierto en Edge Functions** — `Access-Control-Allow-Origin: *` sin restricción | Bajo |
| D12 | **Sin paginación** — Las queries de Supabase no pagina; con muchos sprites puede volverse lento | Medio |
| D13 | **Versión 0.0.0** — Sin versionado semántico, sin changelog público | Bajo |

### Oportunidades

| # | Oportunidad | Potencial |
|---|-------------|-----------|
| O1 | **Mercado indie game dev en crecimiento** — itch.io tiene >1M juegos, la mayoría indie necesita assets pixel art | Alto |
| O2 | **IA como ventaja competitiva** — Aseprite no tiene IA; ningún editor web tiene generación + edición nativa integrada | Alto |
| O3 | **Marketplace de sprites** — Plataforma donde usuarios vendan/compartan paquetes de sprites generados | Alto |
| O4 | **Integración con game engines** — Export directo a Godot (.tres/.png), Unity (atlas JSON), RPG Maker (.xml) | Alto |
| O5 | **Tiers freemium** — Versión gratuita limitada (assets, IA calls) + Pro ilimitado | Alto |
| O6 | **Plantillas temáticas por género** — RPG, platformer, dungeon crawler; kits completos de personajes + tiles | Medio |
| O7 | **API pública** — Monetizar generación IA como API para pipelines de juegos procedurales | Medio |
| O8 | **Colaboración en tiempo real** — Supabase Realtime ya disponible en el stack; co-edición de sprites | Medio |
| O9 | **Mobile / tablet** — React es cross-platform; touch events + stylus para iPad podría capturar mercado creativo | Bajo |
| O10 | **Comunidad y social** — Feed de creaciones, follows, likes; plataforma social para pixel artists | Medio |

### Amenazas

| # | Amenaza | Severidad |
|---|---------|-----------|
| A1 | **Aseprite** — El estándar de la industria, con features décadas adelante y una comunidad masiva | Alta |
| A2 | **Herramientas gratuitas establecidas** — Piskel, Lospec, LibreSprite, PixilArt.com no cobran nada | Alta |
| A3 | **Costos de IA escalables** — Gemini API tiene costo por llamada; sin rate limiting el gasto puede descontrolarse | Alta |
| A4 | **DALL-E 3 / Midjourney pixel art** — Modelos generales que generan pixel art aceptable sin editor especializado | Media |
| A5 | **Dependencia de Gemini** — Un cambio de pricing o discontinuación de la API rompe el feature core | Media |
| A6 | **Dependencia de Supabase** — Cambios de pricing o outages afectan directamente al producto | Baja |
| A7 | **Tamaño de mercado acotado** — Pixel art es un nicho dentro de game dev; la adopción masiva es difícil | Media |
| A8 | **Open-source competition** — Si alguien forka este proyecto (es web, el código es visible) y lo mejora | Baja |

---

## 3. Análisis Competitivo

### 3.1 Comparativa de Features

| Feature | Pixel Sprite Studio | Aseprite | Piskel | PixilArt.com | Lospec |
|---------|-------------------|---------|--------|-------------|--------|
| **Browser-based** | ✅ | ❌ (desktop) | ✅ | ✅ | ✅ |
| **Generación con IA** | ✅ Gemini | ❌ | ❌ | ❌ | ❌ |
| **Layer system** | ✅ | ✅ Avanzado | ❌ | ✅ Básico | ❌ |
| **Animation timeline** | ✅ | ✅ Profesional | ✅ Básico | ✅ | ❌ |
| **Onion skinning** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Herramienta selección** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Zoom canvas** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Import PNG como referencia** | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Tilemap editor** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Scripting/extensiones** | ❌ | ✅ Lua | ❌ | ❌ | ❌ |
| **Export JSON spritesheet** | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Paletas NES/GameBoy** | ❌ | ✅ | ✅ Básico | ✅ | ✅ |
| **Colaboración** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Persistencia en nube** | ✅ | ❌ | ✅ Básico | ✅ | ❌ |
| **Props / accesorios IA** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Open source** | ❌ | ✅ EULA | ✅ MIT | ❌ | ❌ |
| **Precio** | Gratis (ahora) | $19.99 one-time | Gratis | Gratis | Gratis |

### 3.2 Análisis por Competidor

#### Aseprite — El Estándar de la Industria

**Ventajas de Aseprite sobre PSS:**
- 20+ años de desarrollo — features profundas (tilemap, scripting Lua, color modes, blending modes)
- Timeline profesional con easing, cel-based, velocity curves
- Comunidad masiva (Reddit, Discord, YouTube tutorials)
- Integración con pipelines CI/CD via CLI (`aseprite --batch`)
- Soporte nativo de formatos (.ase, .aseprite, spritesheet JSON)
- Zoom fluido con hotkeys (numpad), rotación de vista
- Color modes: RGB, Grayscale, Indexed

**Lo que PSS tiene y Aseprite no:**
- Generación de sprites con IA (unique differentiator)
- Browser-based (sin instalación, cross-platform instantáneo)
- Persistencia en nube sin setup
- Props system como layers automáticas
- Colaboración potencial (Supabase Realtime)

**Conclusión:** Aseprite es intocable para pixel artists serios. PSS debe ir por el segmento de **game devs no-artistas** que necesitan sprites funcionales rápido.

---

#### Piskel — Editor Web Gratuito

**Ventajas de Piskel sobre PSS:**
- Simpler UX — curva de aprendizaje más baja
- Funciona sin cuenta
- Selection tool y move tool
- Exporta GIF y spritesheet PNG

**Debilidades de Piskel:**
- Sin IA
- Sin layers
- Sin nube (salvo Google Drive básico)
- Sin mantenimiento activo (el proyecto está casi abandonado)
- UI anticuada

**Conclusión:** PSS ya supera a Piskel en features. El gap es la herramienta de selección y el zoom.

---

#### PixilArt.com — Plataforma Social

**Ventajas de PixilArt sobre PSS:**
- Comunidad masiva con feed social
- Desafíos diarios, galería pública
- Drawing tools completas (selección, lasso, magic wand)
- Free + Pro ($5/mes)

**Debilidades de PixilArt:**
- Sin IA
- Editor menos potente que Aseprite
- Sin layer system avanzado
- Sin animaciones multi-frame complejas

**Conclusión:** PixilArt demuestra que el modelo freemium funciona en pixel art. PSS puede aprender de su estrategia social.

---

### 3.3 Posicionamiento Recomendado

```
                    ARTISTAS PRO
                         ▲
                    Aseprite ★
                         |
        Profesional ◄────┼────► Accesible
                         |
           PixilArt ★    |    ★ PSS (actual)
                         |
           Piskel ★       |
                         ▼
                    CASUAL / INDIE
```

**Reposicionamiento objetivo:**
```
                    ARTISTAS PRO
                         ▲
                    Aseprite ★
                         |
        Profesional ◄────┼────► Accesible
                         |
                         |    ★ PSS (objetivo)
              PixilArt ★ |      ← "AI-first sprite studio"
                         |
                         ▼
                  GAME DEVS / INDIE
```

**Propuesta de valor única (USP):**
> *"El único editor de pixel art que genera, anima y guarda tus sprites desde el navegador — sin instalar nada, sin saber dibujar."*

---

## 4. Brechas de Producto vs ROADMAP

### 4.1 Features Críticos Faltantes (bloqueantes para monetización)

| Feature | Estado ROADMAP | Prioridad Real | Por qué importa |
|---------|---------------|---------------|-----------------|
| **Herramienta de selección** | Backlog | 🔴 Crítica | Sin esto, mover/copiar partes de un sprite es imposible. Presente en TODOS los competidores |
| **Zoom del canvas** | No listado | 🔴 Crítica | Sin zoom, editar detalles en 32×32 es frustrante. Feature básico de cualquier editor gráfico |
| **Import PNG / referencia** | Backlog (sprite sheet import) | 🔴 Crítica | Los game devs necesitan importar sus propios assets. Habilita casos de uso reales |
| **Undo para operaciones de alto nivel** | No listado | 🟠 Alta | Borrar un frame o mover una capa son irreversibles ahora |
| **Resize / crop canvas** | Fase 4 | 🟠 Alta | Sin esto el sprite queda "fijo" en el tamaño inicial |
| **Merge de capas** | Fase 3 pendiente | 🟡 Media | Flattenear el sprite es necesario para flujos de trabajo profesionales |

### 4.2 Features Diferenciadores (ventaja competitiva a desarrollar)

| Feature | Estado | Potencial | Notas |
|---------|--------|-----------|-------|
| **Colaboración real-time** | No iniciado | Alto | Supabase Realtime ya en stack — "Figma para pixel art" |
| **Export a game engines** | No listado | Alto | Godot, Unity, RPG Maker; directo desde el editor |
| **Spritesheet JSON metadata** | No listado | Alto | Standard en la industria (Texture Packer format) |
| **Paletas históricas** | Fase 5 | Medio | NES (52 colores), Game Boy (4 colores), CGA, EGA |
| **Tiling preview** | Backlog | Medio | Ver cómo se repite un tile en un mapa |
| **Batch AI generation** | Parcial | Alto | Generar set completo de animaciones en un click |
| **API pública** | No listado | Alto | Monetizable, atrae developers |

### 4.3 Deuda Técnica Prioritaria

| Item | Urgencia | Esfuerzo | Impacto |
|------|----------|---------|---------|
| Activar TypeScript strict mode | 🟠 Alta | Bajo | Previene bugs en producción |
| Paginación en queries Supabase | 🟡 Media | Bajo | Performance con >100 sprites por usuario |
| Rate limiting en Edge Functions | 🔴 Urgente | Bajo | Sin esto, un usuario puede vaciar el presupuesto de Gemini |
| Validación estricta del JSON de Gemini | 🟠 Alta | Bajo | Respuestas malformadas pueden crashear el editor |
| CORS restrictivo en Edge Functions | 🟠 Alta | Bajo | Seguridad básica |
| E2E tests con Playwright | 🟡 Media | Medio | Regresiones en flujos críticos (crear, editar, exportar) |

---

## 5. Estrategia de Monetización

### 5.1 Modelo Recomendado: Freemium + Créditos IA

El modelo más alineado con la naturaleza del producto y el comportamiento del segmento objetivo (indie devs).

#### Tier Gratuito (Free)
- 3 proyectos activos
- 5 sprites por proyecto
- 10 generaciones IA por mes
- Export PNG
- Catálogo de 16 assets base
- Watermark en export GIF

#### Tier Pro ($9/mes o $79/año)
- Proyectos y sprites ilimitados
- 200 generaciones IA por mes
- Export PNG, GIF, Spritesheet JSON
- Sin watermark
- Paletas premium (NES, GB, CGA...)
- Props library completa
- Acceso anticipado a features

#### Tier Studio ($29/mes o $249/año)
- Todo de Pro
- Generaciones IA ilimitadas
- Colaboración (hasta 5 miembros)
- API access (hasta 1000 req/mes)
- Export a formatos de game engines
- Soporte prioritario
- Assets exclusivos generados por IA

#### Créditos IA (one-time)
- Pack 50 créditos: $4.99
- Pack 200 créditos: $14.99
- Pack 500 créditos: $29.99

### 5.2 Marketplace de Assets (Revenue Share)

Un catálogo donde usuarios vendan packs de sprites:
- PSS toma 30% de cada venta (como App Store / itch.io)
- Vendedor recibe 70%
- Assets verificados por IA + revisión manual
- Categorías: personajes, tiles, UI, efectos

**Potencial:** Si 100 creators venden paquetes a $4.99 con 50 ventas/mes promedio:
`100 × 50 × $4.99 × 0.30 = $7,485/mes`

### 5.3 API Pública (Developer Tier)

Exponer `/generate-sprite` y `/generate-animation` como API:
- Precio por llamada: $0.02-$0.05/request
- Plans: Starter (100 req/mes gratis), Pro (1000 req/$19), Business (10k req/$99)
- Casos de uso: generadores procedurales de juegos, pipelines de assets automáticos

### 5.4 Licencias de Assets Institucionales

- Estudios indie compran "packs enterprise" de sprites generados
- $99-$499 por pack temático completo (RPG, Platformer, etc.)
- Incluye múltiples personajes, animaciones completas, tiles

### 5.5 Proyecciones Conservadoras (Año 1)

| Fuente | MAU Target | Conversión | ARPU | MRR |
|--------|-----------|-----------|------|-----|
| Pro subscriptions | 500 | 5% = 25 | $9 | $225 |
| Studio subscriptions | 500 | 1% = 5 | $29 | $145 |
| Créditos IA | 500 | 15% = 75 | $8 | $600 |
| Marketplace | 500 | 20% = 100 | $3 | $300 |
| **Total** | | | | **$1,270/mes** |

Con 5,000 MAU (alcanzable en 12 meses con buena distribución):
> **~$12,700/mes → $152,400/año** estimado conservador

---

## 6. Roadmap Recomendado (Revisado)

### Fase A — Paridad Competitiva (4-6 semanas)
*Sin esto, no se puede monetizar.*

- [ ] **Zoom del canvas** — Scroll para zoom, hotkeys `+`/`-`, indicator de nivel zoom
- [ ] **Herramienta de selección rectangular** — Select, move, copy/paste, delete región
- [ ] **Undo para operaciones de alto nivel** — Stack de acciones (borrar frame, mover capa)
- [ ] **Merge de capas** — Flattenear capas seleccionadas
- [ ] **Rate limiting** en Edge Functions — Por usuario, por día
- [ ] **TypeScript strict mode** — Fix warnings, habilitar strict

### Fase B — Diferenciación y Monetización (6-10 semanas)
*Features que justifican el pago.*

- [ ] **Import PNG** — Cargar imagen como referencia o como sprite base
- [ ] **Resize / crop canvas** — Con anchor configurable y presets 8/16/32/64px
- [ ] **Paletas históricas** — NES, Game Boy, CGA, EGA, Pico-8
- [ ] **Export Spritesheet JSON** — Formato Texture Packer compatible
- [ ] **Tiling preview** — Ver sprite repetido en grid configurable
- [ ] **Sistema de créditos IA** — Integración con Stripe para cobrar
- [ ] **Onboarding flow** — Tutorial interactivo para nuevos usuarios
- [ ] **Plan Free/Pro en Supabase** — Feature flags por tier

### Fase C — Plataforma (10-16 semanas)
*Construir el moat.*

- [ ] **Catálogo público de usuarios** — UGC, galería social, likes
- [ ] **Marketplace** — Venta de packs con revenue share
- [ ] **Colaboración básica** — Compartir proyecto con link de solo lectura
- [ ] **Export a Godot** — `.tres` resource con spritesheet embebido
- [ ] **Export a Unity** — Atlas PNG + JSON con rect coordinates
- [ ] **API pública** — Docs, autenticación con API keys, rate limits

### Fase D — Escala (16+ semanas)
*Si hay traction.*

- [ ] **Colaboración real-time** — Co-edición con cursors compartidos (Supabase Realtime)
- [ ] **AI in-painting** — Seleccionar área y regenerar con prompt
- [ ] **Batch AI generation** — Generar set completo de 8 animaciones en un click
- [ ] **Mobile / tablet** — Touch events, stylus pressure, PWA
- [ ] **Plugins / extensiones** — API de scripting para automatizar workflows
- [ ] **Versioning de sprites** — Historial de cambios por sprite

---

## 7. Estrategia de Distribución

### Canales de Adquisición (por costo-efectividad)

1. **Product Hunt** — Lanzar cuando haya paridad con Piskel + feature de IA diferenciada
2. **Reddit** — r/gamedev, r/indiegaming, r/PixelArt; posts orgánicos con demos
3. **itch.io** — Publicar herramienta gratuita con link al Pro; itch tiene comunidad de target
4. **YouTube** — Tutorials "crea tu personaje de RPG con IA en 5 minutos"
5. **Twitter/X + TikTok** — Demos cortos de generación IA; pixel art tiene alto engagement visual
6. **Discord servers** — Gamedev, pixel art communities (100k+ miembros agregados)
7. **SEO** — "free pixel art editor", "AI sprite generator", "pixel art animation tool"

### Métricas Clave a Trackear

| Métrica | Target Mes 3 | Target Mes 12 |
|---------|-------------|--------------|
| MAU | 500 | 5,000 |
| Nuevos registros/semana | 50 | 500 |
| Sprites creados/día | 100 | 1,000 |
| Retención D7 | 20% | 35% |
| Conversión Free→Pro | 3% | 7% |
| Generaciones IA/día | 50 | 500 |
| MRR | $200 | $12,000 |

---

## 8. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Costos Gemini API descontrolados | Alta | Alto | Rate limiting por usuario + tier, cache de respuestas similares |
| Aseprite lanza versión web | Media | Muy Alto | Apostar fuerte en IA y colaboración (ventaja difícil de replicar) |
| Competidor copia el stack IA | Alta | Medio | Construir moat en comunidad, marketplace y datos propios |
| Supabase pricing increase | Baja | Medio | Arquitectura portable (no vendor lock-in en lógica de negocio) |
| Gemini API discontinuada | Baja | Alto | Abstracción de la capa IA para soportar OpenAI/Anthropic como fallback |
| GDPR compliance (usuarios UE) | Media | Medio | Privacy policy, data deletion, consentimiento explícito |

---

## 9. Quick Wins Inmediatos (próximos 7 días)

Sin inversión de desarrollo mayor, estos cambios mejoran retención y setup de monetización:

1. **Landing page con demo sin registro** — Permitir crear 1 sprite sin account; reduce fricción
2. **Rate limiting en Edge Functions** — Límite de 20 calls/día por IP para cuentas Free
3. **Share link de sprites** — URL pública para ver un sprite (solo lectura) — viral coefficient
4. **Changelog público** — Mostrar las últimas updates en la app; builds confianza y engagement
5. **Stripe integration básica** — Aunque sea solo el checkout; medir si alguien paga antes de buildear features

---

## 10. Conclusión

Pixel Sprite Studio tiene **una ventaja competitiva genuina y defendible**: es el único editor pixel art web con generación IA integrada, sistema de capas, timeline de animaciones y persistencia en nube en un solo producto.

El producto está listo para monetizar, pero le faltan **3 features críticos** que cualquier usuario esperaría de un editor gráfico (zoom, selección, import PNG). Sin esos, la retención será baja.

**Prioridad #1:** Cerrar el gap de paridad con la competencia gratuita (Fase A).  
**Prioridad #2:** Activar monetización con Stripe + sistema de créditos IA (Fase B).  
**Prioridad #3:** Construir el moat de comunidad y marketplace (Fase C).

El camino a $10k MRR es alcanzable en 12 meses con 5,000 usuarios activos y una tasa de conversión del 5%.
