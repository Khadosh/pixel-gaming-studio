// Text drawings (the `from_ascii` / `to_ascii` format of src/headless/ascii.ts)
// in the web editor: open one as an editor asset and write it back.
//
// Opening keeps what the editor cannot hold in the asset (glyphs, "anim:"
// lines, "fit:") in a session; saving uses it, so a drawing opened and saved
// untouched is the same text. What the text format cannot store (layers, hidden
// layers, layer opacity...) is listed in `warnings` instead of being lost
// quietly.
//
// A drawing with a `generated_by:` header came out of a recipe and the recipe
// will write over it again. For those, saving does NOT rewrite the drawing: it
// writes the **retouch layer** beside it (a `retouch_of:` overlay in the same
// format, what `pss variant` lays back on top), so the recipe stays the source
// and the retouch survives the next run.

import type { Frame, GeneratedBy, SpriteAsset, SpriteLayer } from './types';
import { fromAscii, toAscii, type AsciiLayout } from '@/headless/ascii';
import { blankFrame, dims, normalizeHex } from '@/headless/assetModel';

/** `camino.txt` → `camino.retoque.txt` (the convention the headless side shares). */
export const RETOUCH_SUFFIX = '.retoque.txt';

export function retouchNameOf(fileName: string): string {
  return fileName.replace(/\.txt$/i, '') + RETOUCH_SUFFIX;
}

export function isRetouchName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(RETOUCH_SUFFIX);
}

export interface TextDrawingSession {
  /** File name the drawing came from (also names parse errors). */
  fileName: string;
  layout: AsciiLayout;
  /** The drawing's canvas. */
  width: number;
  height: number;
  /** Frames the text had: padding frames the editor adds past these are not written. */
  frameCount: number;
  /** Set when the drawing came from a recipe: then saving writes the retouch layer. */
  generatedBy?: GeneratedBy;
  /** The base pixels as they were opened — what a retouch is measured against. */
  base?: Frame[];
  /** Hex of each base palette index, so the retouch keeps the same glyphs. */
  basePalette?: Record<number, string>;
  /** File the retouch goes to (`<drawing>.retoque.txt`). */
  retouchName?: string;
}

export interface OpenedTextDrawing {
  asset: SpriteAsset;
  session: TextDrawingSession;
}

/** The visible layers of each frame flattened on the asset's own canvas. */
function flatten(asset: SpriteAsset, frames: number): Frame[] {
  const { width, height } = dims(asset);
  const layers = (asset.layers ?? []).filter(l => l.isVisible && l.opacity > 0);
  return Array.from({ length: frames }, (_, i) => {
    const grid = blankFrame(width, height);
    for (const l of layers) {
      const src = l.frames[i];
      if (!src) continue;
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const v = src[r]?.[c];
          if (v) grid[r][c] = v;
        }
      }
    }
    return grid;
  });
}

/** Parses a text drawing into an editor asset (its own canvas, palette with 0 = transparent). */
export function openTextDrawing(text: string, fileName: string): OpenedTextDrawing {
  const { asset, layout } = fromAscii(text, { sourcePath: fileName });
  const { width, height } = dims(asset);
  const editorAsset: SpriteAsset = {
    ...asset,
    size: Math.max(width, height),
    width,
    height,
    palette: { 0: 'transparent', ...asset.palette },
    colorNames: { 0: 'Transparent', ...asset.colorNames },
  };
  const frameCount = asset.layers![0].frames.length;
  const session: TextDrawingSession = { fileName, layout, width, height, frameCount };
  if (asset.generatedBy) {
    session.generatedBy = asset.generatedBy;
    session.base = flatten(asset, frameCount);
    session.basePalette = { ...asset.palette };
    session.retouchName = retouchNameOf(fileName);
  }
  return { asset: editorAsset, session };
}

/**
 * Lays a retouch file (a `retouch_of:` overlay) over an opened drawing as a
 * layer of its own, so a second session keeps the retouch already saved instead
 * of starting from the bare recipe output. The base layers are not touched.
 */
export function addRetouchLayer(opened: OpenedTextDrawing, text: string, fileName: string): OpenedTextDrawing {
  const { asset, session } = opened;
  const { asset: over, layout } = fromAscii(text, { sourcePath: fileName });
  if (!layout.retouchOf) throw new Error(`${fileName} no dice de qué dibujo es el retoque (falta "retouch_of:").`);
  const od = dims(over);
  if (od.width !== session.width || od.height !== session.height) {
    throw new Error(`El retoque es de ${od.width}x${od.height} y el dibujo de ${session.width}x${session.height}.`);
  }
  // The overlay's colors join the drawing's palette, by hex: a color already
  // there keeps its index, a new one gets the next free one.
  const palette = { ...asset.palette };
  const colorNames = { ...asset.colorNames };
  const byHex = new Map<string, number>();
  for (const [k, hex] of Object.entries(palette)) byHex.set(normalizeHex(hex), Number(k));
  let next = Math.max(0, ...Object.keys(palette).map(Number)) + 1;
  const index = new Map<number, number>();
  for (const [k, hex] of Object.entries(over.palette)) {
    const norm = normalizeHex(hex);
    let i = byHex.get(norm);
    if (i === undefined) {
      i = next++;
      palette[i] = norm;
      colorNames[i] = over.colorNames?.[Number(k)] ?? `color ${i}`;
      byHex.set(norm, i);
    }
    index.set(Number(k), i);
  }

  const frames = asset.layers![0].frames.length;
  const layer: SpriteLayer = {
    id: 'layer-retoque',
    name: 'retoque',
    isVisible: true,
    isLocked: false,
    opacity: 1,
    frames: Array.from({ length: frames }, (_, i) => {
      const grid = blankFrame(session.width, session.height);
      const src = over.layers![0].frames[i];
      if (src) {
        for (let r = 0; r < session.height; r++) {
          for (let c = 0; c < session.width; c++) {
            const v = src[r]?.[c];
            if (v) grid[r][c] = index.get(v)!;
          }
        }
      }
      return grid;
    }),
  };
  return {
    asset: { ...asset, palette, colorNames, layers: [...asset.layers!, layer] },
    session: { ...session, retouchName: fileName },
  };
}

export interface SavedTextDrawing {
  text: string;
  /** What the text format could not keep, in Spanish, one line each. */
  warnings: string[];
  /**
   * `drawing`: the text goes back to the file it came from. `retouch`: the
   * drawing came from a recipe, so the text is the layer on top and goes to
   * `fileName` — the drawing itself is left alone.
   */
  kind: 'drawing' | 'retouch';
  /** File the text should be written to. */
  fileName: string;
}

/** `rgba(r,g,b,a)` / `rgb(...)` → `#rrggbb[aa]`; hex colors pass through normalized. */
export function toHexColor(color: string): string {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color.trim());
  if (!m) return normalizeHex(color);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  return normalizeHex(`#${byte(+m[1])}${byte(+m[2])}${byte(+m[3])}${alpha < 1 ? byte(alpha * 255) : ''}`);
}

function hasPixels(layer: SpriteLayer): boolean {
  return layer.frames.some(f => f.some(row => row.some(v => v)));
}

/** How many frames of the editor asset the text should keep. */
function framesToKeep(asset: SpriteAsset, session: TextDrawingSession): number {
  const all = asset.layers ?? [];
  const total = all[0]?.frames.length ?? 0;
  let keep = session.frameCount;
  for (const a of asset.animations) for (const i of a.frameIndices) keep = Math.max(keep, i + 1);
  for (const l of all) l.frames.forEach((f, i) => { if (f.some(row => row.some(v => v))) keep = Math.max(keep, i + 1); });
  return Math.min(Math.max(keep, 1), total);
}

/**
 * The retouch of a generated drawing: every pixel that differs from the base as
 * it was opened, on a drawing of its own with a `retouch_of:` header. The base
 * file is not written, so the recipe can run again over it.
 */
function saveRetouch(asset: SpriteAsset, session: TextDrawingSession): SavedTextDrawing {
  const warnings: string[] = [];
  const { width, height } = session;
  const keep = framesToKeep(asset, session);
  const current = flatten(asset, keep);
  const base = session.base ?? [];

  const palette: Record<number, string> = {};
  const colorNames: Record<number, string> = {};
  let erased = 0;
  const frames: Frame[] = current.map((grid, i) => {
    const out = blankFrame(width, height);
    const under = base[i];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const v = grid[r][c];
        const u = under?.[r]?.[c] ?? 0;
        if (v === u) continue;
        if (!v) { erased++; continue; } // the overlay can only add, never rub out
        out[r][c] = v;
        if (!(v in palette)) {
          palette[v] = toHexColor(asset.palette[v]);
          if (asset.colorNames?.[v]) colorNames[v] = asset.colorNames[v];
        }
      }
    }
    return out;
  });

  if (erased > 0) {
    warnings.push(`${erased} píxel(es) borrados sobre lo generado no entran en la capa de retoque: la capa se pinta encima, no raspa. Pintalos con un color de la paleta o cambialo en la receta.`);
  }
  const painted = frames.reduce((n, f) => n + f.reduce((m, row) => m + row.filter(v => v).length, 0), 0);
  if (painted === 0) warnings.push('El retoque no tiene ningún píxel: se guarda vacío.');

  const id = `${asset.id}${asset.id.endsWith('_retoque') ? '' : '_retoque'}`;
  const overlay: SpriteAsset = {
    id,
    name: `Retoque de ${asset.name}`,
    description: '',
    category: asset.category,
    size: Math.max(width, height),
    palette,
    colorNames,
    layers: [{ id: 'layer-base', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames }],
    animations: [],
  };
  if (width !== height) { overlay.width = width; overlay.height = height; }

  // Same glyphs as the drawing it retouches, so the two files read alike.
  const layout: AsciiLayout = { glyphs: session.layout.glyphs, declared: [], retouchOf: session.fileName, comments: 0 };
  const { text } = toAscii(overlay, { layout, glyphPalette: session.basePalette });
  return { text, warnings, kind: 'retouch', fileName: session.retouchName ?? retouchNameOf(session.fileName) };
}

/** Writes the editor asset back as a text drawing, honoring the session it was opened with. */
export function saveTextDrawing(asset: SpriteAsset, session: TextDrawingSession): SavedTextDrawing {
  if (session.generatedBy) return saveRetouch(asset, session);

  const warnings: string[] = [];
  const { width, height } = session;
  const all = asset.layers ?? [];
  const painted = all.filter(hasPixels);

  const hidden = painted.filter(l => !l.isVisible || l.opacity === 0);
  for (const l of hidden) warnings.push(`La capa «${l.name}» está oculta: no se guarda.`);
  const shown = all.filter(l => l.isVisible && l.opacity > 0);
  const shownPainted = shown.filter(hasPixels);
  if (shownPainted.length > 1) {
    warnings.push(`Las ${shownPainted.length} capas visibles se aplanan en una: el texto guarda una sola capa.`);
  }
  for (const l of shownPainted) {
    if (l.opacity < 1) warnings.push(`La capa «${l.name}» tiene opacidad ${Math.round(l.opacity * 100)}%: se guarda opaca (el texto sólo guarda alfa en los colores de la paleta).`);
  }

  // Frames: keep the text's frames, anything referenced or painted; drop the editor's empty padding.
  const keep = framesToKeep(asset, session);

  let outside = 0;
  const frames: Frame[] = [];
  for (let i = 0; i < keep; i++) {
    const grid: Frame = blankFrame(width, height);
    for (const l of shown) {
      const src = l.frames[i];
      if (!src) continue;
      src.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        if (r < height && c < width) grid[r][c] = v;
        else outside++;
      }));
    }
    frames.push(grid);
  }
  if (outside > 0) {
    warnings.push(`${outside} píxeles pintados fuera del lienzo de ${width}x${height} no se guardan.`);
  }

  const palette: Record<number, string> = {};
  const colorNames: Record<number, string> = {};
  for (const [k, hex] of Object.entries(asset.palette)) {
    const i = Number(k);
    if (i === 0) continue;
    palette[i] = toHexColor(hex);
    if (asset.colorNames?.[i]) colorNames[i] = asset.colorNames[i];
  }

  const animations = asset.animations.map(a => {
    if (a.label !== undefined && /\s/.test(a.label) && a.label !== a.name.toUpperCase()) {
      warnings.push(`La etiqueta «${a.label}» de ${a.name} tiene espacios: el texto no la guarda.`);
      return { ...a, label: a.name.toUpperCase() };
    }
    return a;
  });

  if (session.layout.comments > 0) {
    warnings.push(`El archivo tenía ${session.layout.comments} línea(s) de comentario (#): no se vuelven a escribir.`);
  }
  if (asset.anatomy) warnings.push('La anatomía marcada no se guarda en el texto.');
  if (asset.tags?.length) warnings.push('Las etiquetas no se guardan en el texto.');

  const flat: SpriteAsset = {
    id: asset.id,
    name: asset.name,
    description: asset.description ?? '',
    category: asset.category,
    size: Math.max(width, height),
    palette,
    colorNames,
    layers: [{ id: 'layer-base', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames }],
    animations,
  };
  if (width !== height) { flat.width = width; flat.height = height; }

  const { text } = toAscii(flat, { layout: session.layout });
  return { text, warnings, kind: 'drawing', fileName: session.fileName };
}
