/** Lo que importa de una caja en pantalla (un DOMRect sirve tal cual). */
export interface Caja {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Aire entre lo último de la barra y el borde de arriba del panel. */
export const AIRE_SOBRE_FLOTANTE = 8;

/**
 * Cuánto hay que reservar abajo de una barra para que un panel flotante que se
 * le monta encima no tape lo último que tiene: lo que el panel se mete en la
 * barra desde abajo, más un poco de aire. Cero si no se tocan.
 */
export function reservaBajoFlotante(barra: Caja, flotante: Caja, aire = AIRE_SOBRE_FLOTANTE): number {
  const seCruzanDeCostado = flotante.left < barra.right && flotante.right > barra.left;
  const seMeteDesdeAbajo = flotante.top < barra.bottom && flotante.bottom > barra.top;
  if (!seCruzanDeCostado || !seMeteDesdeAbajo) return 0;
  return Math.ceil(barra.bottom - flotante.top) + aire;
}
