// How to start, for an agent that has only the engine (Khadosh/estudio#806).
//
// The package of the workshop (scripts/empaquetar.mjs) carries no docs and no
// examples: an agent in an empty folder ran `pgs project`, read «no pgs.json»
// and had to guess the file; `pgs doc font` described the glyph sheet without
// showing one. What is taught here lives in the binary, and its tests read it
// with the same schema and the same parser the commands use, so it cannot rot.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_FILE } from './project';

/** A pgs.json to start from: every field a new world needs first, valid against projectSchema. */
export const STARTER_PROJECT = {
  name: 'Mi mundo',
  says: 'Cómo se dibuja acá, en dos o tres frases: la luz, el contorno, cuántos tonos por material, qué no se hace nunca.',
  visual: {
    palette: 'art/paleta.pss.json',
    roles: { base: 'piel', light: 'luz', dark: 'sombra', outline: 'tinta' },
    ramps: { base: ['luz', 'piel', 'sombra', 'tinta'] },
    grid: 16,
    sizes: { personaje: [16, 24] as [number, number], tile: [16, 16] as [number, number] },
    light: { from: 'arriba a la izquierda' },
    outline: { use: true, color: 'tinta' },
  },
  type: { font: 'art/fuente.txt', steps: [5, 10, 15] },
};

/** What each field of the skeleton is for, in the order it shows. */
const FIELDS: [string, string][] = [
  ['name', 'el mundo, en palabras'],
  ['says', 'la prosa del estilo: lo que el lint no mide y un dibujo nuevo tiene que respetar'],
  ['visual.palette', 'la única fuente de color: un asset con los colores con nombre (abajo, cómo se crea)'],
  ['visual.roles', 'para qué es cada color, por su nombre en la paleta'],
  ['visual.ramps', 'rampas de claro a oscuro, por nombre: en sombra un color baja un paso por la suya'],
  ['visual.grid', 'el lado de un tile es múltiplo de esto (1: cualquiera)'],
  ['visual.sizes', 'los lienzos con nombre, para que nadie invente uno'],
  ['visual.light', 'de dónde viene la luz'],
  ['visual.outline', 'si hay contorno y de qué color'],
  ['type.font', 'la hoja de letras del mundo (pgs doc font trae una entera de ejemplo)'],
  ['type.steps', 'los únicos cuerpos de letra: el de diseño y sus múltiplos'],
];

/** The answer of `pgs project` where there is no pgs.json: the skeleton and the two commands its palette needs. */
export function starterText(where: string): string {
  return [
    `no ${PROJECT_FILE} in ${where} or above it. Para empezar un mundo, creá ${PROJECT_FILE} en la raíz:`,
    '',
    JSON.stringify(STARTER_PROJECT, null, 2),
    '',
    'Qué es cada campo (todos opcionales menos name; lo que no uses, sacalo):',
    ...FIELDS.map(([k, v]) => `  ${k.padEnd(15)} ${v}`),
    '',
    'La paleta tiene que existir antes que el pgs.json la nombre (los nombres son los de roles y ramps):',
    `  pgs new path=art/paleta.pss.json width=1 'palette=["#f4ecd8","#d8a47f","#7a4e3a","#2b1d24"]'`,
    `  pgs palette path=art/paleta.pss.json 'names={"1":"luz","2":"piel","3":"sombra","4":"tinta"}'`,
    'La fuente, igual: copiá la hoja de pgs doc font a art/fuente.txt, o sacá "type".',
    `Después, pgs project otra vez: lo lee y dice qué comando toma cada campo.`,
  ].join('\n');
}

/**
 * A whole glyph sheet, small enough to read: five glyphs in 5x7 cells. Copy it
 * to a .txt and `pgs font path=<it>` reads it; `font_contact` sets it.
 */
export const EXAMPLE_FONT_SHEET = `id: hola
name: Hola 5
category: ui
size: 25x7
font: cell=5x7 baseline=6 line=8 space=2 track=1
glyphs: HOLA!

@ = #ffffff tinta

==
.........................
@..@..@@..@.....@@...@...
@..@.@..@.@....@..@..@...
@@@@.@..@.@....@@@@..@...
@..@.@..@.@....@..@......
@..@..@@..@@@@.@..@..@...
.........................
`;

/**
 * Where the whole Nube 8 is (examples/tipografia/): beside the package's lib/,
 * or two up from src/headless/ in the repo. Undefined when neither carries it.
 */
export function exampleFontsDir(from = dirname(fileURLToPath(import.meta.url))): string | undefined {
  for (const up of ['..', '../..']) {
    const dir = resolve(from, up, 'examples', 'tipografia');
    if (existsSync(join(dir, 'nube_base.txt'))) return dir;
  }
  return undefined;
}

/** The part of `pgs doc font` that shows a sheet instead of describing it. */
export function fontExample(): string {
  const nube = exampleFontsDir();
  return [
    'A whole sheet to copy (a .txt; the header, one "glyphs:" row per row of cells, the legend, "==", and the rows of pixels, "." empty):',
    '',
    EXAMPLE_FONT_SHEET,
    nube
      ? `A real one, every Spanish glyph in 8x11 cells, with its README: ${join(nube, 'nube_base.txt')} (the hand-drawn base) and ${join(nube, 'nube.txt')} (with accents, from font_compose).`
      : 'A real one, every Spanish glyph: examples/tipografia/nube_base.txt of the PGS repo.',
  ].join('\n');
}
