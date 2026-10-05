# Ideas para PSS (sin fecha)

## Modelos de vóxeles como fuente de píxeles (5 de octubre de 2026)

Pregunta de Joaquín: ¿PSS tiene un límite duro o puede mejorar mucho, por
ejemplo para isométrico y falso 3D? Lectura de Claude: el motor fuerte de
PSS hoy es el dibujo a mano por texto (ganó a todos los renders en las
comparaciones de The Unwritten Dao), y eso escala mal en animaciones largas y
en el mismo objeto desde varios ángulos. La puerta grande no es «render con
IA mejor»: es cambiar la fuente.

- **Modelos de vóxeles en texto** (como los dibujos de hoy): un personaje
  son unas decenas de líneas de bloques con color de la paleta madre.
- **Renderizador ortográfico** a píxeles desde cualquier ángulo, con la luz
  (`lights`) y la paleta; cuantización, contorno, lint y comparación lado a
  lado se aplican igual encima.
- Da de un golpe: isométrico (cámara a 2:1; las recetas de mapas con otra
  proyección), falso 3D (ocho direcciones coherentes, sombras que cierran),
  animación barata (mover partes del modelo entre cuadros).
- Unos cientos de líneas con tests. Lo difícil sigue siendo el gusto de los
  modelos, pero una vez por objeto en lugar de una por ángulo.
- Para The Unwritten Dao no hace falta todavía; para el próximo juego o un
  isométrico, es el paso. Ver también el issue #68 del juego (addon de Godot).
