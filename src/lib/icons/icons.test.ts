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
 *
 * Después vino la tanda de arte, que rehízo el dibujo de 60 de los 61 (la regla
 * de peso y margen está en `art/iconos/README.md`). Esos están declarados acá
 * abajo, en `REDIBUJADOS`: el fixture sigue siendo el registro de lo que había,
 * y lo que no está en la lista tiene que seguir dibujando exactamente lo mismo.
 * Un icono no puede cambiar sin que alguien lo haya decidido y anotado.
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

/**
 * La tanda de arte: los que se volvieron a dibujar a propósito, por qué.
 *
 * - **No se leían:** bone (parecía una copa de martini), arrowLeft (había
 *   perdido la punta), sword, tag, resetRotate, hardDrive, package, sparkles,
 *   sun, transform, rotateCw, pipette, moon, fill.
 * - **Eran la misma mancha:** pencil, eraser, edit, line y eyeOff eran los
 *   cinco un palo diagonal; ahora se separan por silueta.
 * - **Pesaban de más o de menos:** el resto, para entrar en la regla de 2 px de
 *   trazo, 1 px de margen y 28–100 px de tinta (antes iba de 16 a 196).
 *
 * `user` es el único que quedó como estaba: ya cumplía. `info` y `terminal` no
 * aparecen acá porque no están en el fixture (son los dos que no existían antes
 * de la conversión), pero la tanda también los rehízo.
 */
const REDIBUJADOS = new Set([
  'arrowDownToLine', 'arrowLeft', 'bone', 'check', 'chevronDown', 'chevronLeft',
  'chevronRight', 'chevronUp', 'circle', 'clock', 'copy', 'download', 'edit',
  'eraser', 'eye', 'eyeOff', 'fileVideo', 'fill', 'film', 'flipH', 'flipV',
  'folder', 'grid', 'hardDrive', 'hash', 'image', 'layers', 'line', 'loader',
  'logOut', 'minus', 'mirror', 'monitor', 'moon', 'package', 'palette', 'paste',
  'pause', 'pencil', 'pipette', 'play', 'plus', 'rect', 'redo', 'resetRotate',
  'rotateCw', 'save', 'search', 'select', 'settings', 'sparkles', 'sun', 'sword',
  'tag', 'transform', 'trash', 'undo', 'upload', 'x', 'xCircle',
]);

/** Cuánta tinta puede tener un icono: la regla de peso de art/iconos/README.md. */
const TINTA = { min: 28, max: 100 };

/** Cuántas celdas tienen que distinguir a dos iconos cualesquiera a 16 px. */
const DIFERENCIA_MINIMA = 18;

/** Las parejas que son el mismo dibujo espejado: ahí lo único que cambia es la dirección. */
const ESPEJOS: Array<[string, string]> = [['undo', 'redo']];
const DIFERENCIA_MINIMA_ESPEJO = 10;

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

  /** Lo que dibujaban los trazos de antes, con el agujero pintado ya vaciado. */
  function antes(key: string): Grid {
    return PREVIOUS[key].map(row => row.map(v => (v === PAINTED_HOLE ? 0 : v)));
  }

  function esIgualAAntes(key: string): boolean {
    const before = antes(key);
    const now = ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid;
    return before.every((row, y) => row.every((v, x) => now[y][x] === v));
  }

  it.each(previous.filter(k => !REDIBUJADOS.has(k)))(
    '%s no se tocó: dibuja lo mismo que los trazos de antes',
    key => {
      const before = antes(key);
      const now = ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid;
      let holes = 0;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          // El único cambio de la conversión: el agujero pintado es transparente.
          if (PREVIOUS[key][y][x] === PAINTED_HOLE) holes++;
          expect(now[y][x], `${key} ${x},${y}`).toBe(before[y][x]);
        }
      }
      expect(holes, `${key}: píxeles de agujero`).toBe(HOLES[key] ?? 0);
    },
  );

  it('todos los declarados como redibujados cambiaron de verdad', () => {
    const sinCambiar = [...REDIBUJADOS].filter(esIgualAAntes);
    expect(sinCambiar, 'están en REDIBUJADOS pero dibujan lo de antes').toEqual([]);
  });

  it('ninguno de los siete quedó vacío al vaciarle el agujero', () => {
    for (const key of Object.keys(HOLES)) {
      const ink = (ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid)
        .flat().filter(v => v !== 0).length;
      expect(ink, key).toBeGreaterThan(20);
    }
  });
});

/**
 * La regla que fijó la tanda de arte, escrita en `art/iconos/README.md`.
 * Lo que la sostiene es esto: un icono nuevo que la rompa no entra.
 */
describe('la regla de peso y margen', () => {
  const todos = Object.entries(ICON_REGISTRY) as Array<[string, Grid]>;
  const pintados = (m: Grid) => m.flat().filter(v => v !== 0).length;

  it.each(todos.map(([k]) => k))('%s deja 1 px libre en los cuatro bordes', key => {
    const m = ICON_REGISTRY[key as keyof typeof ICON_REGISTRY] as Grid;
    for (let i = 0; i < 16; i++) {
      expect(m[0][i], `${key}: pinta el borde de arriba en x=${i}`).toBe(0);
      expect(m[15][i], `${key}: pinta el borde de abajo en x=${i}`).toBe(0);
      expect(m[i][0], `${key}: pinta el borde izquierdo en y=${i}`).toBe(0);
      expect(m[i][15], `${key}: pinta el borde derecho en y=${i}`).toBe(0);
    }
  });

  it(`la tinta de cada uno cae entre ${TINTA.min} y ${TINTA.max} px`, () => {
    for (const [key, m] of todos) {
      const ink = pintados(m);
      expect(ink, `${key} pesa ${ink}`).toBeGreaterThanOrEqual(TINTA.min);
      expect(ink, `${key} pesa ${ink}`).toBeLessThanOrEqual(TINTA.max);
    }
  });

  it('no hay píxeles sueltos: todo trazo tiene al menos 2 px de ancho', () => {
    for (const [key, m] of todos) {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!m[y][x]) continue;
          const vecinos = (m[y - 1]?.[x] ?? 0) + (m[y + 1]?.[x] ?? 0)
            + (m[y][x - 1] ?? 0) + (m[y][x + 1] ?? 0);
          expect(vecinos, `${key} ${x},${y}: píxel suelto`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('no hay dos iconos que se confundan a 16 px', () => {
    const espejo = new Set(ESPEJOS.map(([a, b]) => [a, b].sort().join('/')));
    const flojos: string[] = [];
    for (let i = 0; i < todos.length; i++) {
      for (let j = i + 1; j < todos.length; j++) {
        const [ka, a] = todos[i];
        const [kb, b] = todos[j];
        let distintas = 0;
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) if ((a[y][x] !== 0) !== (b[y][x] !== 0)) distintas++;
        }
        const par = [ka, kb].sort().join('/');
        const minimo = espejo.has(par) ? DIFERENCIA_MINIMA_ESPEJO : DIFERENCIA_MINIMA;
        if (distintas < minimo) flojos.push(`${par} (${distintas} celdas)`);
      }
    }
    expect(flojos, 'siluetas demasiado parecidas').toEqual([]);
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
