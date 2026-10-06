/**
 * `npm run icons`: los dibujos de `art/iconos/*.txt` → `src/lib/icons/generated.ts`.
 *
 * Los dibujos son la verdad; el módulo es derivado. Un icono es un asset de PGS:
 * se abre en el editor, se retoca, se guarda, y esto lo vuelve a bajar a código.
 *
 * Cada dibujo declara los cinco papeles del icono como entradas de paleta con
 * nombre (base, claro, oscuro, negro, acento). El índice de la grilla que sale
 * acá es el **papel**, no el índice de la paleta del dibujo: se resuelve por el
 * nombre del color, así que reordenar la paleta en el editor no rompe nada.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromAscii } from '../src/headless/ascii.ts';
import { dims } from '../src/headless/assetModel.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWINGS = join(ROOT, 'art/iconos');
const OUT = join(ROOT, 'src/lib/icons/generated.ts');

/** Papel → índice de la grilla, el mismo que lee `matrixToSvgPaths`. */
export const PAPERS = ['base', 'claro', 'oscuro', 'negro', 'acento'] as const;
export type Paper = (typeof PAPERS)[number];

/** El color de cada papel en los dibujos: lo que ve el editor, y el espejo de las variables CSS. */
export const PAPER_HEX: Record<Paper, string> = {
  base: '#d7dbd7',    // var(--px-base) = currentColor; acá, el color de texto de la app
  claro: '#ffffff40', // var(--px-light)
  oscuro: '#00000040', // var(--px-dark)
  negro: '#00000066', // var(--px-black)
  acento: '#ffffff',  // var(--px-accent)
};

export interface BuiltIcon {
  /** Clave del icono en el registro y en `PIXEL_ICONS` (camelCase). */
  key: string;
  /** Id del dibujo y nombre del archivo (snake_case). */
  id: string;
  name: string;
  matrix: number[][];
}

const snakeToCamel = (id: string) => id.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Lee los dibujos y devuelve la grilla de papeles de cada uno, ordenados por clave. */
export function buildIcons(dir = DRAWINGS): BuiltIcon[] {
  const files = readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
  const icons: BuiltIcon[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const { asset } = fromAscii(readFileSync(path, 'utf8'), { sourcePath: path });
    const { width, height } = dims(asset);
    if (width !== 16 || height !== 16) throw new Error(`${file}: los iconos son de 16x16, no ${width}x${height}`);
    const frames = asset.layers?.[0]?.frames ?? [];
    if (frames.length !== 1) throw new Error(`${file}: un icono es un solo frame, tiene ${frames.length}`);

    // Índice de la paleta del dibujo → papel, por el nombre del color.
    const paperOf = new Map<number, number>();
    for (const [key, hex] of Object.entries(asset.palette)) {
      const index = Number(key);
      if (index === 0) continue;
      const name = (asset.colorNames?.[index] ?? '').toLowerCase() as Paper;
      const paper = PAPERS.indexOf(name);
      if (paper < 0) throw new Error(`${file}: el color ${hex} no dice qué papel es (${PAPERS.join(', ')})`);
      if (PAPER_HEX[name] !== hex) throw new Error(`${file}: "${name}" es ${PAPER_HEX[name]}, el dibujo dice ${hex}`);
      paperOf.set(index, paper + 1);
    }

    const matrix = frames[0].map(row => row.map(v => {
      if (v === 0) return 0;
      const paper = paperOf.get(v);
      if (paper === undefined) throw new Error(`${file}: un pixel usa el color ${v}, que no está en la paleta`);
      return paper;
    }));
    icons.push({ key: snakeToCamel(asset.id), id: asset.id, name: asset.name, matrix });
  }
  icons.sort((a, b) => a.key.localeCompare(b.key));
  return icons;
}

function render(icons: BuiltIcon[]): string {
  const body = icons.map(i => {
    const rows = i.matrix.map(r => `    [${r.join(',')}],`).join('\n');
    return `  /** ${i.name} — art/iconos/${i.id}.txt */\n  ${i.key}: [\n${rows}\n  ],`;
  }).join('\n');
  const names = icons.map(i => `  ${i.key}: ${JSON.stringify(i.name)},`).join('\n');
  return `/**
 * GENERADO por \`npm run icons\` desde art/iconos/*.txt — no editar a mano.
 *
 * Los dibujos son la verdad: para cambiar un icono se abre su .txt en el editor
 * (/dibujo) o a mano, se guarda y se vuelve a correr \`npm run icons\`.
 *
 * Cada número es un papel, no un color: 0 transparente, ${PAPERS.map((p, i) => `${i + 1} ${p}`).join(', ')}.
 * \`matrixToSvgPaths\` los pasa a trazos SVG y \`PixelIcon\` les pone las variables
 * CSS (--px-base = currentColor, --px-light, --px-dark, --px-black, --px-accent),
 * así que un icono sigue tomando el color del texto donde está.
 */
import type { IconMatrix } from './iconParser';

/** El color de cada papel en los dibujos (el espejo de las variables CSS). */
export const ICON_PALETTE: Record<number, string> = {
  0: 'transparent',
${PAPERS.map((p, i) => `  ${i + 1}: '${PAPER_HEX[p]}',`).join('\n')}
};

/** El nombre de cada papel, como lo dicen los dibujos. */
export const ICON_COLOR_NAMES: Record<number, string> = {
  0: 'transparente',
${PAPERS.map((p, i) => `  ${i + 1}: '${p}',`).join('\n')}
};

export const ICON_REGISTRY = {
${body}
} satisfies Record<string, IconMatrix>;

export type IconId = keyof typeof ICON_REGISTRY;

/** El nombre de cada icono, para quien los liste. */
export const ICON_NAMES: Record<IconId, string> = {
${names}
};
`;
}

/** El texto de `src/lib/icons/generated.ts` para estos dibujos. */
export function generatedModule(icons = buildIcons()): string {
  return render(icons);
}

// Sólo cuando se corre como script: el test importa `buildIcons` sin escribir nada.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const icons = buildIcons();
  writeFileSync(OUT, render(icons));
  console.log(`${icons.length} iconos → ${OUT.replace(ROOT + '/', '')}`);
}
