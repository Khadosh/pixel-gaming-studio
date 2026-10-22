import { describe, it, expect } from 'vitest';
import { reservaBajoFlotante, AIRE_SOBRE_FLOTANTE } from '../reservaFlotante';

// La barra derecha del editor a 1440x900 y el panel de vista previa mediano,
// medidos en la captura de docs/tipografia-app/despues/editor-animations.png.
const barra = { top: 73, bottom: 759, left: 1078, right: 1428 };
const mediano = { top: 663, bottom: 878, left: 1193, right: 1368 };

describe('reservaBajoFlotante', () => {
  it('reserva lo que el panel se mete en la barra, más el aire', () => {
    expect(reservaBajoFlotante(barra, mediano)).toBe(759 - 663 + AIRE_SOBRE_FLOTANTE);
  });

  it('un panel más grande pide más lugar', () => {
    const grande = { ...mediano, top: 500 };
    expect(reservaBajoFlotante(barra, grande)).toBe(759 - 500 + AIRE_SOBRE_FLOTANTE);
  });

  it('no reserva nada si el panel queda debajo de la barra', () => {
    expect(reservaBajoFlotante(barra, { ...mediano, top: 770 })).toBe(0);
  });

  it('no reserva nada si el panel está al costado de la barra', () => {
    expect(reservaBajoFlotante(barra, { ...mediano, left: 900, right: 1070 })).toBe(0);
  });

  it('redondea para arriba los medios píxeles', () => {
    expect(reservaBajoFlotante(barra, { ...mediano, top: 663.4 }, 0)).toBe(96);
  });
});
