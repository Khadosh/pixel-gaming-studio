import { describe, it, expect } from 'vitest';
import { blankAsset, type ProjectPalette } from './newAsset';
import { followsPalette, planRepalette, remapsByIndex, repaletteAsset } from './projectPalette';
import type { SpriteAsset } from './types';

const VIEJA: ProjectPalette = { from: 'tres', name: 'Tres', colors: ['#000000', '#ff0000', '#ffffff'] };

/** Un asset de la paleta vieja con un píxel de cada color y uno transparente. */
function dibujo(palette = VIEJA): SpriteAsset {
  const a = blankAsset({ kind: 'prop', size: 2, palette, id: 'a' });
  a.layers![0].frames[0] = [[0, 1], [2, 3]];
  return a;
}

describe('projectPalette (Khadosh/estudio#226)', () => {
  it('un asset sigue la paleta si tiene sus colores en orden, sin importar mayúsculas', () => {
    const a = dibujo();
    expect(followsPalette(a, VIEJA)).toBe(true);
    expect(followsPalette({ palette: { ...a.palette, 2: '#FF0000' } }, VIEJA)).toBe(true);
    expect(followsPalette({ palette: { ...a.palette, 2: '#00ff00' } }, VIEJA)).toBe(false);
    expect(followsPalette({ palette: { 0: 'transparent', 1: '#000000' } }, VIEJA)).toBe(false);
  });

  it('la misma paleta retocada cambia los colores y deja los píxeles', () => {
    const nueva = { ...VIEJA, colors: ['#000000', '#aa2200', '#ffffff'] };
    expect(remapsByIndex(VIEJA, nueva)).toBe(true);
    const b = repaletteAsset(dibujo(), VIEJA, nueva);
    expect(b.palette).toEqual({ 0: 'transparent', 1: '#000000', 2: '#aa2200', 3: '#ffffff' });
    expect(b.layers![0].frames[0]).toEqual([[0, 1], [2, 3]]);
  });

  it('otra paleta lleva cada color al más cercano y reescribe los píxeles', () => {
    const otra: ProjectPalette = { from: 'otra', name: 'Otra', colors: ['#f0f0f0', '#101010', '#cc1111'] };
    expect(remapsByIndex(VIEJA, otra)).toBe(false);
    const b = repaletteAsset(dibujo(), VIEJA, otra);
    expect(b.palette).toEqual({ 0: 'transparent', 1: '#f0f0f0', 2: '#101010', 3: '#cc1111' });
    // negro → #101010 (2), rojo → #cc1111 (3), blanco → #f0f0f0 (1)
    expect(b.layers![0].frames[0]).toEqual([[0, 2], [3, 1]]);
  });

  it('una paleta más corta no deja píxeles apuntando a colores que ya no existen', () => {
    const dos: ProjectPalette = { from: 'dos', name: 'Dos', colors: ['#000000', '#ffffff'] };
    const b = repaletteAsset(dibujo(), VIEJA, dos);
    const usados = new Set(b.layers![0].frames[0].flat());
    for (const p of usados) expect(b.palette[p]).toBeDefined();
    expect(b.layers![0].frames[0]).toEqual([[0, 1], [1, 2]]);
  });

  it('los colores que el asset sumó a mano se conservan, después de los nuevos', () => {
    const a = dibujo();
    a.palette[4] = '#00ff00';
    a.colorNames[4] = 'pasto';
    a.layers![0].frames[0] = [[4, 1], [2, 3]];
    a.layers![0].paletteIds = [1, 4];
    const cinco = { ...VIEJA, colors: [...VIEJA.colors, '#0000ff', '#ffff00'] };
    const b = repaletteAsset(a, VIEJA, cinco);
    expect(b.palette[6]).toBe('#00ff00');
    expect(b.colorNames[6]).toBe('pasto');
    expect(b.palette[4]).toBe('#0000ff');
    expect(b.layers![0].frames[0]).toEqual([[6, 1], [2, 3]]);
    expect(b.layers![0].paletteIds).toEqual([1, 6]);
  });

  it('el plan separa los que cambian de los retocados a mano', () => {
    const sigue = { id: '1', asset_data: dibujo() };
    const retocado = { id: '2', asset_data: { ...dibujo(), palette: { ...dibujo().palette, 2: '#123456' } } };
    const plan = planRepalette([sigue, retocado], VIEJA);
    expect(plan.follow.map((s) => s.id)).toEqual(['1']);
    expect(plan.keep.map((s) => s.id)).toEqual(['2']);
    expect(planRepalette([sigue], undefined).follow).toEqual([]);
  });
});
