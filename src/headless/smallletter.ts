// The small letter: a pixel font three pixels wide and five high, built in.
//
// For what is painted on things, not set on a screen: the name on a tape
// stuck on a machine, the title under a poster, a label on a box, a number on
// a door. Capitals, digits and a little punctuation; a capital is three wide
// (I is one, M and W five, N four) and five high, with one pixel between
// letters and one more for a space. It is the alphabet a voxel paint writes
// with (`VoxelPaint.text`) when it does not name a font of its own.
//
// It is a text drawing like any other font (see `font.ts`), kept here as text
// so it travels with the engine and needs no file on disk.

import { fromAscii } from './ascii';
import { buildFont, type PixelFont } from './font';

export const SMALL_LETTER = [
  'id: letra3x5',
  'name: Letra 3x5',
  'category: ui',
  'size: 80x15',
  'description: La letra chica de las cosas pintadas: carteles, cintas, etiquetas. Mayusculas, digitos y algo de puntuacion.',
  'font: cell=5x5 baseline=5 line=6 space=1 track=1',
  'glyphs: ABCDEFGHIJKLMNOP',
  'glyphs: QRSTUVWXYZ012345',
  "glyphs: 6789.,:;!?'-/+()",
  '',
  'k = #000000 tinta',
  '',
  '==',
  'kkk..kk...kkk..kk...kkk..kkk..kkk..k.k..k......k..k.k..k....k...kk..k.kkk..kkk..',
  'k.k..k.k..k....k.k..k....k....k....k.k..k......k..k.k..k....kk.kkkk.k.k.k..k.k..',
  'kkk..kk...k....k.k..kk...kk...k.k..kkk..k......k..kk...k....k.k.kk.kk.k.k..kkk..',
  'k.k..k.k..k....k.k..k....k....k.k..k.k..k....k.k..k.k..k....k...kk..k.k.k..k....',
  'k.k..kk...kkk..kk...kkk..k....kkk..k.k..k....kkk..k.k..kkk..k...kk..k.kkk..k....',
  'kkk..kkk...kk..kkk..k.k..k.k..k...kk.k..k.k..kkk...k....k...kkk..kkk..k.k..kkk..',
  'k.k..k.k..k.....k...k.k..k.k..k...kk.k..k.k....k..k.k..kk.....k....k..k.k..k....',
  'k.k..kk....k....k...k.k..k.k..k.k.k.k....k....k...k.k...k...kkk..kkk..kkk..kkk..',
  'kkk..k.k....k...k...k.k..k.k..kk.kkk.k...k...k....k.k...k...k......k....k....k..',
  '..k..k.k..kk....k...kkk...k...k...kk.k...k...kkk...k...kkk..kkk..kkk....k..kkk..',
  'kkk..kkk..kkk..kkk......................k....kkk..k...........k........k...k....',
  'k......k..k.k..k.k............k.....k...k......k..k...........k...k...k.....k...',
  'kkk....k..kkk..kkk......................k.....kk.......kkk...k...kkk..k.....k...',
  'k.k....k..k.k....k........k...k.....k.......................k.....k...k.....k...',
  'kkk....k..kkk..kkk..k....k.........k....k.....k.............k..........k...k....',
].join('\n') + '\n';

let cached: PixelFont | undefined;

/** The built-in small letter, as a font. */
export function smallLetter(): PixelFont {
  if (!cached) {
    const parsed = fromAscii(SMALL_LETTER, { sourcePath: 'letra3x5' });
    cached = buildFont(parsed.asset, parsed.layout, 'letra3x5');
  }
  return cached;
}
