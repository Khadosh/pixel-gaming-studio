# Decisiones tomadas, con sus razones

> Una decisión no se borra: si deja de condicionar, se marca como superada y se
> dice por qué. **Las razones importan más que las decisiones** — la decisión te
> dice qué hacer hoy, la razón te dice si todavía aplica mañana.
>
> **La regla que mantiene esto vivo:** una decisión que contradice una regla
> escrita en otro lado —`AGENTS.md`, un README, un roadmap— **corrige esa regla
> en el mismo commit**. Si no, el próximo agente lee la vieja. Es lo mismo que
> en el juego hace `record_event`: si una acción no pasa por ahí, para los NPCs
> no ocurrió.
>
> El equivalente en el juego es `docs/diseno/decisiones.md` de unwritten-dao.

---

- **El dibujo de texto es la fuente de verdad (6 de octubre; nombrado en la
  auditoría, era práctica sin nombre).** El camino es receta → render cacheado →
  dibujo de texto → píxeles, y el dibujo no se pisa porque pudo retocarse a
  mano. La ausencia de la cabecera `generated_by:` significa «dibujado a mano».
  *Razón:* es lo único que hace real «generar con agentes y retocar después»; si
  una corrida de receta borrara el retoque, nadie retocaría nunca.

- **La capa visual gana a la receta (6 de octubre; decisión de Joaquín).**
  Textual: «la capa visual gana a la receta, y llegado el caso se actualiza la
  receta con las correcciones que se hicieron; es el chiste de tener un editor».
  Un retoque pinta y **borra** (`!`), y el semáforo de divergencia avisa al 20 %
  sin impedir nada. *Razón:* un editor que pierde lo que hiciste no es un
  editor.

- **Un proyecto es una carpeta con un `pgs.json`, y el disco es la verdad
  (6 de octubre).** La app es la ventana local a esa carpeta; Supabase queda
  para cuenta y para compartir. *Razón:* si la verdad vive en una base, el
  retoque hecho a mano deja de verse en el `git diff` al lado del que hizo el
  agente, que es justamente lo que hace que el puente sirva.

- **El estilo tiene dos mitades y las dos hacen falta (6 de octubre).** Lo
  medible, que un lint revisa, y lo dicho en prosa, que contesta cómo haría uno
  nuevo. *Razón:* con sólo números un agente hace cosas que pasan el lint y no
  pegan; con sólo prosa, cosas lindas fuera de paleta.

- **PSS pasa a ser PGS, Pixel Gaming Studio (6 de octubre; decisión de
  Joaquín).** Quedan a propósito con el nombre viejo: los binarios `pss` y
  `pss-mcp` como alias, los nombres `pss_*` del MCP aceptados pero **no
  listados**, la extensión `.pss.json`, `meta.app` de `export_sheet`, las
  carpetas `art/pss/` del juego, y la historia (changelog, auditorías). *Razón
  de no listar los `pss_*`:* registrarlos duplicaría el catálogo a 280
  descripciones, que es el costo por sesión que la auditoría dice bajar.
  Lo que queda con el nombre viejo está listado en `AGENTS.md`.

- **PGS es el primer cliente de PGS (6 de octubre).** Su fuente y sus iconos son
  assets suyos, no código. *Razón:* es la única prueba que no se puede falsear.
  Si no alcanza para vestir a PGS, no alcanza.

- **Press Start 2P convive mientras se migra (6 de octubre).** La app adopta
  Nube 8 pantalla por pantalla y la fuente prestada se saca al final.
  *Razón:* la regla de los múltiplos enteros no es un cambio de fuente, es un
  rediseño de densidad; hacerlo de una en 351 lugares es cambiar a ciegas.

- **La vara de calidad es la secta dibujada en píxeles, no la pintada
  (6 de octubre; referencias en `docs/referencia/` del juego, issue
  unwritten-dao#135).** *Razón:* la pintada trata cada teja una sola vez y no se
  puede repetir —no hay forma de pedirle el edificio dieciséis que combine con
  los quince—; la de píxeles está hecha de piezas que se repiten, y eso es lo
  que un motor puede producir. Lo pintado se pinta a mano encima, y para eso
  está la capa de retoque.

- **Los agentes no pushean; el orquestador verifica y sincroniza al cerrar cada
  tramo (6 de octubre).** *Razón:* resuelve la contradicción entre
  `AGENTS.md` —que decía «NUNCA realizar commits o push de forma automática»— y
  el pedido de Joaquín del 5 de octubre de mantener los dos repos en sincro sin
  tener que pedirlo. La línea de `AGENTS.md` quedó corregida el mismo día: era la
  que lee todo agente nuevo al entrar.

- **Los 91 pasos de mapa salen del catálogo del MCP (6 de octubre; decisión de
  Joaquín, issue #1).** Textual: «PSS tiene que ser un motor de creación, no una
  colección de assets… por ahora anotalo como un issue a meditar la mejor opción
  aquí». Son el 67 % de las herramientas que el MCP le cobra a cada sesión.
  *Razón:* el catálogo es el prompt del agente y tiene presupuesto; un agente
  que ve cuarenta herramientas elige mejor que uno que ve ciento cuarenta.
