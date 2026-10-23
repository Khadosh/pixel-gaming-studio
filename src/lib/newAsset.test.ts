import { describe, it, expect } from 'vitest';
import {
  ASSET_KINDS, blankAsset, defaultPalette, kindInfo, readProjectPalette, assetPalette, AI_CATEGORY_KIND,
} from './newAsset';
import { CATEGORIES } from './types';

describe('newAsset (Khadosh/pixel-gaming-studio#10)', () => {
  it('un asset nuevo es del tipo elegido, no siempre un personaje', () => {
    const a = blankAsset({ kind: 'terrain', size: 16, palette: defaultPalette(), id: 'x' });
    expect(a.category).toBe('terrain');
    expect(a.size).toBe(16);
    expect(a.layers?.[0].frames[0]).toHaveLength(16);
    expect(a.layers?.[0].frames[0][0]).toHaveLength(16);
    expect(a.layers?.[0].frames[0].flat().every((p) => p === 0)).toBe(true);
  });

  it('la paleta es la que se pasa: nada de piel, pelo ni espada', () => {
    const palette = { name: 'Dos', colors: ['#112233', '#445566'], names: ['fondo'] };
    const a = blankAsset({ kind: 'prop', size: 32, palette, id: 'x' });
    expect(a.palette).toEqual({ 0: 'transparent', 1: '#112233', 2: '#445566' });
    expect(a.colorNames).toEqual({ 1: 'fondo', 2: 'Color 2' });
    const names = Object.values(blankAsset({ kind: 'character', size: 32, palette: defaultPalette() }).colorNames);
    expect(names).not.toContain('Skin');
    expect(names).not.toContain('Sword');
  });

  it('cada tipo es una categoría que el catálogo conoce y sugiere un tamaño', () => {
    const known = CATEGORIES.map((c) => c.id);
    for (const k of ASSET_KINDS) {
      expect(known).toContain(k.id);
      expect([16, 32, 64, 128]).toContain(k.size);
    }
    expect(kindInfo('ui').size).toBe(16);
  });

  it('lee la paleta del config del proyecto y descarta lo que no es una', () => {
    expect(readProjectPalette({ directionality: '1-way', aesthetics: 'custom' })).toBeUndefined();
    expect(readProjectPalette(null)).toBeUndefined();
    expect(readProjectPalette({ palette: { colors: [] } })).toBeUndefined();
    expect(readProjectPalette({ palette: { colors: ['rojo'] } })).toBeUndefined();
    expect(readProjectPalette({ palette: { colors: ['#ff0000', '#00ff0080'], from: 'retro_gb' } }))
      .toEqual({ from: 'retro_gb', name: 'Paleta del proyecto', colors: ['#ff0000', '#00ff0080'] });
  });

  it('la paleta por defecto sale de la biblioteca', () => {
    const p = defaultPalette();
    expect(p.from).toBe('retro_pico8');
    expect(Object.keys(assetPalette(p).palette)).toHaveLength(p.colors.length + 1);
  });

  it('los tipos del asistente de IA caen en categorías del asset', () => {
    expect(AI_CATEGORY_KIND.object).toBe('prop');
    expect(AI_CATEGORY_KIND.environment).toBe('terrain');
  });
});
