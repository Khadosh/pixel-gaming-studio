// The disk side of map recipes: read the game's map JSON into a grid, load and
// save a recipe, resolve color names through the palette, turn painted layers
// into PNGs and assets. The painting itself is mappaint.ts (pure).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { createAsset, getFrame, loadAsset, normalizeHex, saveAsset } from './asset';
import { fromAscii, toAscii } from './ascii';
import { exportSheet } from './sheet';
import { blankImage, readPng, writePng, type Rgba } from './png';
import { Layer, paintMap, type PaintedMap } from './mappaint';
import { gameSchema, recipeSchema, stepSchema, type MapGame, type MapRecipe, type MapStep } from './maprecipe';

interface GameMapJson {
  width: number;
  height: number;
  wall_rects?: [number, number, number, number][];
  walls?: [number, number][];
  decor?: { sprite: string; at: [number, number]; when?: unknown; offset?: [number, number] }[];
  landmarks?: { at: [number, number]; action?: string; visual?: { sprite?: string; offset?: [number, number] }; when?: unknown }[];
}

interface VisualsJson { decor?: Record<string, { size?: [number, number]; shadow?: boolean | string; pss?: string }> }

const at = (base: string, p: string) => (isAbsolute(p) ? p : resolve(dirname(base), p));

/** The silhouette of a sprite PNG (its first frame, w × h px): rows of "#" and ".". */
function silhouette(png: string, w: number, h: number): string[] {
  const img = readPng(png);
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 0 ? '#' : '.')).join(''));
}

/**
 * The game's map JSON as a grid: "." walkable, "#" wall, "D" decor, "E" exit; decor with size and shadow
 * (and, with a sprites folder, the silhouette of each one whose PNG is there).
 */
export function gameGrid(mapPath: string, visualsPath?: string, sprites?: { dir: string; cell: number }): MapGame {
  const map = JSON.parse(readFileSync(mapPath, 'utf8')) as GameMapJson;
  const vis = visualsPath && existsSync(visualsPath) ? (JSON.parse(readFileSync(visualsPath, 'utf8')) as VisualsJson) : {};
  const rows = Array.from({ length: map.height }, () => Array(map.width).fill('.'));
  const put = (u: number, v: number, ch: string) => { if (v >= 0 && u >= 0 && v < map.height && u < map.width) rows[v][u] = ch; };
  for (const [x, y, w, h] of map.wall_rects ?? []) for (let v = y; v < y + h; v++) for (let u = x; u < x + w; u++) put(u, v, '#');
  for (const [u, v] of map.walls ?? []) put(u, v, '#');
  const decor: MapGame['decor'] = [];
  const add = (sprite: string, pos: [number, number], when: unknown, landmark = false, offset?: [number, number]) => {
    const d = vis.decor?.[sprite] ?? {};
    const png = sprites && d.pss ? resolve(sprites.dir, d.pss + '.png') : null;
    const [w, h] = d.size ?? [1, 1];
    const mask = png && existsSync(png) ? silhouette(png, w * sprites!.cell, h * sprites!.cell) : undefined;
    decor.push({ sprite, at: pos, size: d.size, shadow: d.shadow, ...(when ? { when } : {}), ...(landmark ? { landmark } : {}), ...(offset ? { offset } : {}), ...(mask ? { mask } : {}) });
  };
  for (const d of map.decor ?? []) {
    add(d.sprite, d.at, d.when, false, d.offset);
    if (!d.when && rows[d.at[1]]?.[d.at[0]] === '.') put(d.at[0], d.at[1], 'D');
  }
  for (const l of map.landmarks ?? []) {
    if (l.visual?.sprite) add(l.visual.sprite, l.at, l.when, true, l.visual.offset);
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
  return gameGrid(at(recipePath, recipe.game), recipe.visuals ? at(recipePath, recipe.visuals) : undefined,
    recipe.sprites ? { dir: at(recipePath, recipe.sprites), cell: recipe.cell ?? 16 } : undefined);
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

/** A layer as it is written: the whole picture, or only the map (no margin) when export.crop names it. */
export function outputLayer(r: RenderedRecipe, name: string): Layer {
  const l = r.map.layers[name];
  if (!l || !r.recipe.export?.crop?.includes(name)) return l;
  const [ox, oy] = r.map.origin, w = l.w - 2 * ox, h = l.h - 2 * oy;
  const out = new Layer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.px[y * w + x] = l.px[(y + oy) * l.w + x + ox];
  return out;
}

export interface ExportedLayer { layer: string; png: string; asset?: string; txt?: string; src?: string }

export interface ExportOptions {
  /** Write <dir>/<id>.pss.json next to each PNG. */
  assets?: boolean;
  /** Folder for the text drawings (from_ascii format). */
  txt?: string;
  /** Folder for the .pss.json of each layer, rebuilt from its text drawing (what `from_ascii` would write). */
  src?: string;
  /** Write the Aseprite JSON next to each PNG (what `export_sheet` writes). */
  sheet?: boolean;
}

/**
 * Writes every layer: <dir>/<id><suffix>.png and, if asked, the .pss.json, the
 * text drawing and the sheet JSON. With a text drawing, the asset and the PNG
 * are rebuilt from that text, so they are byte for byte what the game's
 * pipeline (from_ascii + export_sheet) makes of it.
 */
export function exportRecipe(r: RenderedRecipe, dir: string, opts: ExportOptions = {}): ExportedLayer[] {
  const id = r.recipe.export?.id ?? 'mapa';
  const suffixes = r.recipe.export?.layers ?? {};
  const names = r.recipe.export?.names ?? {};
  const out: ExportedLayer[] = [];
  for (const name of Object.keys(r.map.layers)) {
    const layer = outputLayer(r, name);
    const suffix = suffixes[name] ?? (name === 'ground' ? '' : `_${name}`);
    const lid = id + suffix;
    const png = resolve(dir, `${lid}.png`);
    let asset = layerAsset(layer, r.colors, lid, names[name] ?? lid, `capa ${name} del mapa ${id}, pintada por receta (pss map_export): no se edita a mano`);
    const item: ExportedLayer = { layer: name, png };
    if (opts.txt) {
      item.txt = resolve(opts.txt, `${lid}.txt`);
      mkdirSync(dirname(item.txt), { recursive: true });
      const text = toAscii(asset).text;
      writeFileSync(item.txt, text);
      asset = fromAscii(text, { sourcePath: item.txt }).asset;
    }
    if (opts.assets) { item.asset = resolve(dir, `${lid}.pss.json`); saveAsset(item.asset, asset); }
    if (opts.src) { item.src = resolve(opts.src, `${lid}.pss.json`); saveAsset(item.src, asset); }
    mkdirSync(dirname(png), { recursive: true });
    if (opts.sheet) {
      const { image, meta } = exportSheet(asset, { imageName: basename(png) });
      writePng(png, image);
      writeFileSync(png.replace(/\.png$/i, '') + '.json', JSON.stringify(meta, null, 1) + '\n');
    } else writePng(png, layersImage([layer], r.colors));
    out.push(item);
  }
  return out;
}

/** The export folders of a recipe (relative to it), overridden by what the caller passes. */
export function exportDirs(r: RenderedRecipe, recipePath: string, given: { dir?: string; txt?: string; src?: string }): { dir: string; txt?: string; src?: string } {
  const e = r.recipe.export ?? { id: 'mapa' };
  const dir = given.dir ?? (e.png ? at(recipePath, e.png) : undefined);
  if (!dir) throw new Error('map_export: dir (or export.png in the recipe)');
  return { dir, txt: given.txt ?? (e.txt ? at(recipePath, e.txt) : undefined), src: given.src ?? (e.src ? at(recipePath, e.src) : undefined) };
}

// ------------------------------------------------------------------ the game map's ground

type Span = { start: number; end: number };

/** Positions of a JSON text: for the object at `path`, its braces and each key's value span. */
function objectSpans(text: string, path: string[]): { open: number; close: number; keys: Map<string, Span & { keyStart: number }> } {
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? '')) i++; };
  const str = (): string => { const s0 = i; i++; while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1; i++; return JSON.parse(text.slice(s0, i)) as string; };
  const skip = (): void => {
    ws();
    const c = text[i];
    if (c === '"') { str(); return; }
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++; ws();
      if (text[i] === close) { i++; return; }
      for (;;) {
        if (c === '{') { ws(); str(); ws(); i++; }
        skip(); ws();
        if (text[i] === ',') { i++; continue; }
        i++; return;
      }
    }
    while (i < text.length && !/[,\]}\s]/.test(text[i])) i++;
  };
  const object = (want: string[]): ReturnType<typeof objectSpans> => {
    ws();
    if (text[i] !== '{') throw new Error('map_export: the game map ground is not an object');
    const open = i;
    i++;
    const keys = new Map<string, Span & { keyStart: number }>();
    ws();
    if (text[i] === '}') return { open, close: i, keys };
    for (;;) {
      ws();
      const keyStart = i, key = str();
      ws(); i++; ws();
      if (want.length && key === want[0]) return object(want.slice(1));
      const start = i;
      skip();
      keys.set(key, { keyStart, start, end: i });
      ws();
      if (text[i] === ',') { i++; continue; }
      if (want.length) throw new Error(`map_export: the game map has no "${want[0]}"`);
      return { open, close: i, keys };
    }
  };
  return object(path);
}

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Writes keys into an object of a JSON file (the ground of a game map) without
 * rewriting the rest of the file: only a key whose value changed is replaced
 * (indented like its neighbours), a new one goes last. Returns the keys written.
 */
export function writeJsonKeys(path: string, at: string[], values: Record<string, unknown>): string[] {
  let text = readFileSync(path, 'utf8');
  const data = JSON.parse(text) as Record<string, unknown>;
  let obj: Record<string, unknown> = data;
  for (const k of at) obj = (obj?.[k] ?? {}) as Record<string, unknown>;
  const changed = Object.keys(values).filter(k => !deepEqual(obj[k], values[k]));
  for (const key of changed) {
    const spans = objectSpans(text, at);
    const lineStart = text.lastIndexOf('\n', spans.open) + 1;
    const indent = ' '.repeat(text.slice(lineStart).search(/\S/)) + '  ';
    const body = JSON.stringify(values[key], null, 2).replace(/\n/g, '\n' + indent);
    const span = spans.keys.get(key);
    if (span) text = text.slice(0, span.start) + body + text.slice(span.end);
    else {
      let end = spans.close;
      while (/\s/.test(text[end - 1])) end--;
      const empty = spans.keys.size === 0;
      text = text.slice(0, end) + (empty ? '' : ',') + '\n' + indent + JSON.stringify(key) + ': ' + body + text.slice(end);
    }
  }
  if (changed.length) writeFileSync(path, text);
  return changed;
}

/** Writes export.ground of a recipe into its game map (margen defaults to the recipe margin). */
export function exportGround(r: RenderedRecipe, recipePath: string): { file: string; written: string[] } | null {
  const e = r.recipe.export;
  if (!e?.ground) return null;
  const file = e.game ? at(recipePath, e.game) : typeof r.recipe.game === 'string' ? at(recipePath, r.recipe.game) : null;
  if (!file) throw new Error('map_export: export.ground needs export.game (the recipe game is not a file)');
  const values: Record<string, unknown> = { ...e.ground };
  if (!('margen' in values) && r.recipe.margin) values.margen = r.recipe.margin;
  const where = e.ground_at ?? 'ground';
  return { file, written: writeJsonKeys(file, where ? [where] : [], values) };
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

// ------------------------------------------------------------------ compare

export interface MapComparison { width: number; height: number; differ: number; share: number; image: Rgba }

/**
 * Two pictures of a map side by side and a third panel with the differences:
 * the first picture dimmed and every pixel that differs (color or alpha) in
 * magenta. To check a recipe against the drawing it replaces.
 */
export function compareImages(a: Rgba, b: Rgba, gap = 8): MapComparison {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`map_compare: sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height})`);
  const { width: w, height: h } = a;
  const out = blankImage(w * 3 + gap * 2, h, [21, 18, 15, 255]);
  let differ = 0;
  const put = (img: Rgba, dx: number, x: number, y: number, rgba: ArrayLike<number>) => {
    const k = (y * img.width + x + dx) * 4;
    for (let c = 0; c < 4; c++) img.data[k + c] = rgba[c];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const pa = a.data.subarray(i, i + 4), pb = b.data.subarray(i, i + 4);
    if (pa[3]) put(out, 0, x, y, pa);
    if (pb[3]) put(out, w + gap, x, y, pb);
    const same = pa[3] === 0 && pb[3] === 0 ? true : pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2] && pa[3] === pb[3];
    if (!same) { differ++; put(out, 2 * (w + gap), x, y, [255, 0, 255, 255]); }
    else put(out, 2 * (w + gap), x, y, [Math.round(pa[0] * 0.35 + 21), Math.round(pa[1] * 0.35 + 18), Math.round(pa[2] * 0.35 + 15), 255]);
  }
  return { width: w, height: h, differ, share: differ / (w * h), image: out };
}

/** A recipe layer (default the ground) against a reference PNG (the drawing it replaces). */
export function compareRecipe(r: RenderedRecipe, refPath: string, layer = 'ground'): MapComparison {
  const l = outputLayer(r, layer);
  if (!l) throw new Error(`map_compare: no layer "${layer}"`);
  return compareImages(readPng(refPath), layersImage([l], r.colors));
}
