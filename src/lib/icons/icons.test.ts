/**
 * El control de los iconos.
 *
 * Los 61 iconos de la app estaban escritos a mano en TypeScript, en dos
 * formatos: matrices en `iconRegistry.ts` y trazos SVG tipeados en
 * `PixelIcon.tsx`. Ahora son dibujos de PGS en `art/iconos/*.txt`.
 *
 * `fixtures/trazos-previos.json` es lo que dibujaban aquellos trazos, celda por
 * celda, con el papel de cada una (0 transparente, 1 base, 2 claro, 3 oscuro,
 * 4 negro, 5 acento) y **9 donde el agujero estaba pintado con el color del
 * fondo** — `fill="var(--background, #000)"`, que sobre cualquier fondo que no
 * fuera exactamente ese salía como un bloque del color equivocado.
 *
 * La conversión tenía que conservar el arte tal cual estaba, con un solo cambio
 * a propósito: esos agujeros pasan a ser transparencia de verdad. Este test es
 * lo que lo sostiene: cualquier otra diferencia es un error.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIcons } from '../../../scripts/gen-icons';
import { ICON_NAMES, ICON_PALETTE, ICON_REGISTRY } from './generated';
import { matrixToSvgPaths } from './iconParser';
import { PIXEL_ICONS } from '@/components/icons/PixelIcon';

type Grid = number[][];

const PREVIOUS: Record<string, Grid> = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/trazos-previos.json'), 'utf8'),
);

/** El papel que marcaba un agujero pintado con el color del fondo. */
const PAINTED_HOLE = 9;

/** Los siete, y cuántos píxeles de agujero tenía cada uno. */
const HOLES: Record<string, number> = {
  clock: 18, eyeOff: 25, folder: 84, grid: 64, tag: 4, trash: 10, xCircle: 14,
};

/** Los dos iconos que no existían antes: los dibujó PGS para sacar lucide-react. */
const ADDED = ['info', 'terminal'];

describe('los iconos son dibujos de PGS', () => {
  it('el módulo generado está al día con los dibujos de art/iconos', () => {
    const fromDrawings = Object.fromEntries(buildIcons().map(i => [i.key, i.matrix]));
    expect(fromDrawings).toEqual(ICON_REGISTRY);
  });

  it('cada icono tiene su componente y cada componente su icono', () => {
    expect(Object.keys(PIXEL_ICONS).sort()).toEqual(Object.keys(ICON_REGISTRY).sort());
    expect(Object.keys(ICON_NAMES).sort()).toEqual(Object.keys(ICON_REGISTRY).sort());
  });

  it('todos son de 16x16 y usan sólo los cinco papeles', () => {
    for (const [key, matrix] of Object.entries(ICON_REGISTRY)) {
      expect(matrix.length, key).toBe(16);
      for (const row of matrix as Grid) {
        expect(row.length, key).toBe(16);
        for (const v of row) expect(ICON_PALETTE[v], `${key}: papel ${v}`).toBeDefined();
      }
    }
  });
});

describe('la conversión conservó el arte', () => {
  const previous = Object.keys(PREVIOUS);

  it('están los 61 de antes más los que se dibujaron después', () => {
    expect(previous).toHaveLength(61);
    expect(Object.keys(ICON_REGISTRY).sort()).toEqual([...previous, ...ADDED].sort());
  });

  it.each(previous)('%s dibuja lo mismo que los trazos de antes', key => {
    const before = PREVIOUS[key];
    const now = ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid;
    let holes = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (before[y][x] === PAINTED_HOLE) {
          // El único cambio buscado: el agujero pintado pasa a ser transparente.
          expect(now[y][x], `${key} ${x},${y}: el agujero tenía que quedar vacío`).toBe(0);
          holes++;
        } else {
          expect(now[y][x], `${key} ${x},${y}`).toBe(before[y][x]);
        }
      }
    }
    expect(holes, `${key}: píxeles de agujero`).toBe(HOLES[key] ?? 0);
  });

  it('ninguno de los siete quedó vacío al vaciarle el agujero', () => {
    for (const key of Object.keys(HOLES)) {
      const ink = (ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid)
        .flat().filter(v => v !== 0).length;
      expect(ink, key).toBeGreaterThan(20);
    }
  });
});

describe('los trazos SVG que salen de la grilla', () => {
  /** Las celdas que cubre un trazo de `matrixToSvgPaths` (`M<x> <y>h<w>v1h-<w>z`). */
  function cells(d: string): [number, number][] {
    const out: [number, number][] = [];
    const re = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;
    let m: RegExpExecArray | null;
    let consumed = 0;
    while ((m = re.exec(d))) {
      consumed += m[0].length;
      const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let i = 0; i < w; i++) out.push([x + i, y]);
    }
    expect(consumed, `trazo con algo que no es un tramo de fila: ${d}`).toBe(d.length);
    return out;
  }

  it.each(Object.keys(ICON_REGISTRY))('%s: una celda, un papel, y ninguna de más', key => {
    const matrix = ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid;
    const paths = matrixToSvgPaths(matrix);
    const roles: [string, number][] = [
      ['primary', 1], ['light', 2], ['dark', 3], ['black', 4], ['accent', 5],
    ];
    const painted = new Map<string, number>();
    for (const [field, role] of roles) {
      for (const [x, y] of cells(paths[field as keyof typeof paths])) {
        const at = `${x},${y}`;
        expect(painted.has(at), `${key} ${at}: lo pintan dos papeles`).toBe(false);
        painted.set(at, role);
      }
    }
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(painted.get(`${x},${y}`) ?? 0, `${key} ${x},${y}`).toBe(matrix[y][x]);
      }
    }
  });
});
