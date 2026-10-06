import type { Frame } from '../types';
import { 
  shiftPixels, 
  rotatePixels, 
  stretchPixels, 
  clearPixels, 
  cloneFrame 
} from './transforms';

/**
 * API Humana para Transformaciones Anatómicas.
 * Estas funciones facilitan la animación moviendo grupos de píxeles (miembros).
 */

/**
 * Desplaza un grupo de píxeles en una dirección (delta r, delta c).
 */
export function desplazarPixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  dr: number,
  dc: number
): Frame {
  return shiftPixels(source, target, pixels, dr, dc);
}

/**
 * Rota un grupo de píxeles alrededor de un punto pivot.
 */
export function rotarPixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  pivot: { r: number; c: number },
  anguloGrados: number,
  dr: number = 0,
  dc: number = 0
): Frame {
  return rotatePixels(source, target, pixels, pivot, anguloGrados, dr, dc);
}

/**
 * Estira un grupo de píxeles verticalmente, manteniendo la conexión con la base.
 * Ideal para el torso o extremidades que se estiran sin desconectarse.
 */
export function expandirPixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  dr: number
): Frame {
  return stretchPixels(source, target, pixels, dr);
}

/**
 * Colapsa un grupo de píxeles eliminando filas (squash).
 * Útil para flexiones de rodilla o compresión de torso.
 */
export function colapsarPixels(
  source: Frame,
  target: Frame,
  pixels: { r: number; c: number }[],
  dr: number, // Cantidad de píxeles a comprimir (hacia abajo si es positivo)
  pivotSide: 'top' | 'bottom' = 'bottom'
): Frame {
  if (dr === 0 || pixels.length === 0) return target;
  
  // `dr` sólo mueve filas: el único límite acá es la ALTURA.
  const frameHeight = source.length;
  const absDr = Math.abs(dr);

  // Encontramos el rango de filas de los píxeles
  let minR = frameHeight, maxR = 0;
  pixels.forEach(p => {
    if (p.r < minR) minR = p.r;
    if (p.r > maxR) maxR = p.r;
  });
  
  const height = maxR - minR + 1;
  if (height <= absDr) return target; // No se puede colapsar más de lo que mide

  // Seleccionamos qué filas eliminar (distribuidas)
  const rowsToRemove = new Set<number>();
  for (let i = 0; i < absDr; i++) {
    const r = minR + Math.floor((i + 0.5) * (height / absDr));
    rowsToRemove.add(r);
  }

  // Mapeamos los píxeles restantes
  pixels.forEach(p => {
    if (rowsToRemove.has(p.r)) return;
    
    // Calculamos cuántas filas eliminadas hay debajo/encima de este píxel
    let removedBefore = 0;
    rowsToRemove.forEach(rr => {
      if (pivotSide === 'bottom') {
        if (rr > p.r) removedBefore++;
      } else {
        if (rr < p.r) removedBefore++;
      }
    });

    const nr = pivotSide === 'bottom' ? p.r + removedBefore : p.r - removedBefore;
    if (nr >= 0 && nr < frameHeight) {
      const color = source[p.r][p.c];
      if (color !== 0) target[nr][p.c] = color;
    }
  });

  return target;
}

/**
 * Limpia un grupo de píxeles del frame destino para preparar el dibujo de la parte movida.
 */
export function limpiarPixels(
  frame: Frame,
  pixels: { r: number; c: number }[]
): Frame {
  return clearPixels(frame, pixels);
}

/**
 * Crea una copia profunda del frame.
 */
export function clonarFrame(frame: Frame): Frame {
  return cloneFrame(frame);
}
