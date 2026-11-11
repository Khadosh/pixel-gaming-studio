// What `pixelize` runs: the quantizer of the editor (method "quantize") or the
// tracer of a reference already in pixel art (method "trace", trace.ts).

import type { SpriteAsset } from '../lib/types';
import { composite, createAsset, loadAsset, saveAsset, summarize } from './asset';
import { pixelize } from './ai';
import { readImage } from './image';
import { fitPalette } from './ops';
import { encodePng } from './png';
import { renderFrame } from './render';
import { madeBy, relTo } from './retouch';
import { trace } from './trace';

export interface PixelizeArgs {
  png: string;
  out: string;
  size: number;
  method?: 'quantize' | 'trace';
  id?: string;
  name?: string;
  max_colors?: number;
  alpha_threshold?: number;
  remove_background?: boolean;
  fit?: string;
  category?: SpriteAsset['category'];
  crop?: boolean;
  speck_fraction?: number;
}

/** A traced image as a one-frame asset, its colors indexed from dark to light. */
export function tracedAsset(cells: Map<number, string>, size: number, o: { id: string; name?: string; category?: SpriteAsset['category'] }): SpriteAsset {
  const luma = (h: string) => 0.3 * parseInt(h.slice(1, 3), 16) + 0.59 * parseInt(h.slice(3, 5), 16) + 0.11 * parseInt(h.slice(5, 7), 16);
  const colors = [...new Set(cells.values())].sort((a, b) => luma(a) - luma(b) || (a < b ? -1 : 1));
  const asset = createAsset({ id: o.id, name: o.name, width: size, category: o.category ?? 'character', palette: colors });
  const index = new Map(colors.map((c, i) => [c, i + 1]));
  const frame = asset.layers![0].frames[0];
  for (const [p, c] of cells) frame[Math.floor(p / size)][p % size] = index.get(c)!;
  return asset;
}

export function runPixelize(a: PixelizeArgs) {
  const id = a.id ?? a.out.replace(/^.*\//, '').replace(/\.pss\.json$|\.json$/i, '');
  const image = readImage(a.png);
  const asset = a.method === 'trace'
    ? tracedAsset(trace(image, { size: a.size, maxColors: a.max_colors, removeBackground: a.remove_background }), a.size, { id, name: a.name, category: a.category })
    : pixelize(image, {
      id, name: a.name, size: a.size, maxColors: a.max_colors, alphaThreshold: a.alpha_threshold,
      removeBackground: a.remove_background, category: a.category, crop: a.crop, speckFraction: a.speck_fraction,
    });
  let table: unknown = null;
  if (a.fit) table = fitPalette(asset, Object.values(loadAsset(a.fit).palette));
  asset.generatedBy = madeBy('pixelize', {
    png: relTo(a.out, a.png), size: a.size, method: a.method === 'trace' ? 'trace' : undefined, max_colors: a.max_colors,
    fit: a.fit ? relTo(a.out, a.fit) : undefined,
  });
  saveAsset(a.out, asset);
  return { data: { fit: table, asset: summarize(asset) }, png: encodePng(renderFrame(asset, composite(asset, 0), 4)) };
}
