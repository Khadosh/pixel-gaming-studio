// The disk side of map recipes: read the game's map JSON into a grid, load and
// save a recipe, resolve color names through the palette, turn painted layers
// into PNGs and assets. The painting itself is mappaint.ts (pure).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { createAsset, getFrame, loadAsset, normalizeHex, saveAsset } from './asset';
import { toAscii } from './ascii';
import { blankImage, writePng, type Rgba } from './png';
import { paintMap, type Layer, type PaintedMap } from './mappaint';
import { gameSchema, recipeSchema, stepSchema, type MapGame, type MapRecipe, type MapStep } from './maprecipe';

interface GameMapJson {
  width: number;
  height: number;
  wall_rects?: [number, number, number, number][];
  walls?: [number, number][];
  decor?: { sprite: string; at: [number, number]; when?: unknown }[];
  landmarks?: { at: [number, number]; action?: string; visual?: { sprite?: string }; when?: unknown }[];
}

interface VisualsJson { decor?: Record<string, { size?: [number, number]; shadow?: boolean | string }> }

const at = (base: string, p: string) => (isAbsolute(p) ? p : resolve(dirname(base), p));

/** The game's map JSON as a grid: "." walkable, "#" wall, "D" decor, "E" exit; decor with size and shadow. */
export function gameGrid(mapPath: string, visualsPath?: string): MapGame {
  const map = JSON.parse(readFileSync(mapPath, 'utf8')) as GameMapJson;
  const vis = visualsPath && existsSync(visualsPath) ? (JSON.parse(readFileSync(visualsPath, 'utf8')) as VisualsJson) : {};
  const rows = Array.from({ length: map.height }, () => Array(map.width).fill('.'));
  const put = (u: number, v: number, ch: string) => { if (v >= 0 && u >= 0 && v < map.height && u < map.width) rows[v][u] = ch; };
  for (const [x, y, w, h] of map.wall_rects ?? []) for (let v = y; v < y + h; v++) for (let u = x; u < x + w; u++) put(u, v, '#');
  for (const [u, v] of map.walls ?? []) put(u, v, '#');
  const decor: MapGame['decor'] = [];
  const add = (sprite: string, pos: [number, number], when: unknown) => {
    const d = vis.decor?.[sprite] ?? {};
    decor.push({ sprite, at: pos, size: d.size, shadow: d.shadow, ...(when ? { when } : {}) });
  };
  for (const d of map.decor ?? []) {
    add(d.sprite, d.at, d.when);
    if (!d.when && rows[d.at[1]]?.[d.at[0]] === '.') put(d.at[0], d.at[1], 'D');
  }
  for (const l of map.landmarks ?? []) {
    if (l.visual?.sprite) add(l.visual.sprite, l.at, l.when);
    if (l.action === 'travel') put(l.at[0], l.at[1], 'E');
  }
  return gameSchema.parse({ width: map.width, height: map.height, grid: rows.map(r => r.join('')), decor });
}

export function readRecipe(path: string): MapRecipe {
  return recipeSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeRecipe(path: string, recipe: MapRecipe): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(recipe, null, 2) + '\n');
}

/** Adds or replaces a step (by id, or at an index) and saves the recipe. */
export function upsertStep(path: string, step: MapStep, index?: number): { index: number; steps: number } {
  const recipe = readRecipe(path);
  const parsed = stepSchema.parse(step);
  const id = 'id' in parsed ? parsed.id : undefined;
  let i = id ? recipe.steps.findIndex(s => 'id' in s && s.id === id) : -1;
  if (index !== undefined && i < 0) { recipe.steps.splice(index, 0, parsed); i = index; }
  else if (i >= 0) recipe.steps[i] = parsed;
  else { recipe.steps.push(parsed); i = recipe.steps.length - 1; }
  writeRecipe(path, recipe);
  return { index: i, steps: recipe.steps.length };
}

/** Color name → "#rrggbb", from the recipe's palette and its extra colors. */
export function recipeColors(recipe: MapRecipe, recipePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (recipe.palette) {
    const pal = loadAsset(at(recipePath, recipe.palette));
    for (const [k, hex] of Object.entries(pal.palette)) {
      const name = pal.colorNames?.[Number(k)];
      if (name) out[name] = normalizeHex(hex).slice(0, 7);
    }
  }
  for (const [n, hex] of Object.entries(recipe.colors ?? {})) out[n] = normalizeHex(hex).slice(0, 7);
  return out;
}

export function recipeGame(recipe: MapRecipe, recipePath: string): MapGame {
  if (typeof recipe.game !== 'string') return recipe.game;
  return gameGrid(at(recipePath, recipe.game), recipe.visuals ? at(recipePath, recipe.visuals) : undefined);
}

export interface RenderedRecipe { recipe: MapRecipe; map: PaintedMap; colors: Record<string, string> }

export function renderRecipe(path: string): RenderedRecipe {
  const recipe = readRecipe(path);
  const colors = recipeColors(recipe, path);
  const map = paintMap(recipe, recipeGame(recipe, path));
  for (const [name, layer] of Object.entries(map.layers)) {
    const missing = layer.used().filter(c => !colors[c]);
    if (missing.length) throw new Error(`map: layer ${name} uses colors with no hex (not in the palette): ${missing.join(', ')}`);
  }
  return { recipe, map, colors };
}

const hexRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Layers painted one over the other into an image (the first is at the bottom). */
export function layersImage(layers: Layer[], colors: Record<string, string>, scale = 1): Rgba {
  const { w, h } = layers[0];
  const img = blankImage(w * scale, h * scale);
  for (const layer of layers) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = layer.px[y * w + x];
      if (c === null) continue;
      const [r, g, b] = hexRgb(colors[c]);
      for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
        const k = ((y * scale + j) * w * scale + x * scale + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
  }
  return img;
}

/** One layer as a one-frame asset whose palette is the colors it uses, with their names. */
export function layerAsset(layer: Layer, colors: Record<string, string>, id: string, name: string, description: string): SpriteAsset {
  const used = layer.used();
  const asset = createAsset({ id, name, width: layer.w, height: layer.h, category: 'terrain', palette: used.map(c => colors[c]), description });
  used.forEach((c, i) => { asset.colorNames[i + 1] = c; });
  const index = new Map(used.map((c, i) => [c, i + 1]));
  const frame = getFrame(asset, 0);
  for (let y = 0; y < layer.h; y++) for (let x = 0; x < layer.w; x++) {
    const c = layer.px[y * layer.w + x];
    if (c !== null) frame[y][x] = index.get(c)!;
  }
  return asset;
}

export interface ExportedLayer { layer: string; png: string; asset?: string; txt?: string }

/** Writes every layer: <dir>/<id><suffix>.png and, if asked, the .pss.json and the text drawing. */
export function exportRecipe(r: RenderedRecipe, dir: string, opts: { assets?: boolean; txt?: string } = {}): ExportedLayer[] {
  const id = r.recipe.export?.id ?? 'mapa';
  const suffixes = r.recipe.export?.layers ?? {};
  const out: ExportedLayer[] = [];
  for (const [name, layer] of Object.entries(r.map.layers)) {
    const suffix = suffixes[name] ?? (name === 'ground' ? '' : `_${name}`);
    const lid = id + suffix;
    const png = resolve(dir, `${lid}.png`);
    writePng(png, layersImage([layer], r.colors));
    const item: ExportedLayer = { layer: name, png };
    if (opts.assets || opts.txt) {
      const asset = layerAsset(layer, r.colors, lid, lid, `capa ${name} del mapa ${id}, pintada por receta (pss map_export)`);
      if (opts.assets) { item.asset = resolve(dir, `${lid}.pss.json`); saveAsset(item.asset, asset); }
      if (opts.txt) {
        item.txt = resolve(opts.txt, `${lid}.txt`);
        mkdirSync(dirname(item.txt), { recursive: true });
        writeFileSync(item.txt, toAscii(asset).text);
      }
    }
    out.push(item);
  }
  return out;
}

/** The materials of a recipe as name → hex colors, for map_lint. */
export function recipeMaterials(r: RenderedRecipe, recipePath: string): Record<string, string[]> {
  const given = r.recipe.lint?.materials;
  if (typeof given === 'string') return JSON.parse(readFileSync(at(recipePath, given), 'utf8')) as Record<string, string[]>;
  if (given) return given;
  const seen = new Set<string>(), out: Record<string, string[]> = {};
  for (const [name, m] of Object.entries(r.recipe.materials)) {
    out[name] = m.ramp.map(c => r.colors[c]).filter(h => h && !seen.has(h));
    out[name].forEach(h => seen.add(h));
  }
  return out;
}
