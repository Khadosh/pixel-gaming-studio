// Text drawings (the `from_ascii` / `to_ascii` format of src/headless/ascii.ts)
// in the web editor: open one as an editor asset and write it back.
//
// Opening keeps what the editor cannot hold in the asset (glyphs, "anim:"
// lines, "fit:") in a session; saving uses it, so a drawing opened and saved
// untouched is the same text. What the text format cannot store (layers, hidden
// layers, layer opacity...) is listed in `warnings` instead of being lost
// quietly.
//
// A retouch file is rebuilt from scratch on every save, so its own headers —
// "description:" above all, which is where the *why* of a hand-made pixel is
// written — travel in the session too (`RetouchHeaders`) and go back out.
//
// A drawing with a `generated_by:` header came out of a recipe and the recipe
// will write over it again. For those, saving does NOT rewrite the drawing: it
// writes the **retouch layer** beside it (a `retouch_of:` overlay in the same
// format, what `pgs variant` lays back on top), so the recipe stays the source
// and the retouch survives the next run.
//
// The same goes for a drawing made by hand that declares `base: protected`
// (src/headless/protectedbase.ts): somebody else's hand paints over it — a
// collar on the cat — and the base can still be redrawn underneath. Which
// drawings send GUARDAR to the layer is one rule, `retouchAside`, shared with
// the engine, so the two can never disagree.
//
// What the editor shows is what the drawing ends up being: the layer can paint
// a color, leave what was underneath (`.`) and **take a pixel out** (`!`), so
// rubbing out something the recipe painted is no longer a loss.

import type { Frame, GeneratedBy, SpriteAsset, SpriteLayer } from './types';
import { ERASE, fromAscii, toAscii, type AsciiLayout } from '@/headless/ascii';
import { divergenceSource, divergenceWarning, type RetouchCoverage } from '@/headless/divergence';
import { blankFrame, dims, normalizeHex } from '@/headless/assetModel';
import { retouchAside, type AsideReason } from '@/headless/protectedbase';

/** `camino.txt` → `camino.retoque.txt` (the convention the headless side shares). */
export const RETOUCH_SUFFIX = '.retoque.txt';

export function retouchNameOf(fileName: string): string {
  return fileName.replace(/\.txt$/i, '') + RETOUCH_SUFFIX;
}

export function isRetouchName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(RETOUCH_SUFFIX);
}

/**
 * The headers of a retouch file the editor cannot keep in the asset, because the
 * asset it edits is the **drawing** and the retouch is rebuilt from scratch on
 * every save. They travel in the session the way the glyphs do.
 *
 * `description:` is the one that matters most: in a retouch it is where the
 * *why* of a pixel done by hand is written — the one thing a recipe cannot
 * reconstruct — so dropping it loses more than the pixels would.
 */
export interface RetouchHeaders {
  id?: string;
  name?: string;
  category?: SpriteAsset['category'];
  /** Every `description:` line of the retouch, joined by newlines. */
  description?: string;
  /** The `fit:` header as written. */
  fit?: string;
  /** The `retouch_of:` header as written (a path the file chose, maybe not a sibling). */
  retouchOf?: string;
  /** A retouch is hand work and normally has none; if the file says one, it is kept. */
  generatedBy?: GeneratedBy;
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
  /** Set when the drawing came from a recipe. */
  generatedBy?: GeneratedBy;
  /**
   * Set when saving writes the retouch layer instead of the drawing: `generated`
   * (a recipe made it) or `base` (it declares `base: protected`).
   */
  aside?: AsideReason;
  /** The base pixels as they were opened — what a retouch is measured against. */
  base?: Frame[];
  /** Hex of each base palette index, so the retouch keeps the same glyphs. */
  basePalette?: Record<number, string>;
  /** File the retouch goes to (`<drawing>.retoque.txt`). */
  retouchName?: string;
  /** Headers of the retouch file that was opened along with the drawing, if any. */
  retouchHeaders?: RetouchHeaders;
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
  const aside = retouchAside({ generatedBy: asset.generatedBy, base: layout.base });
  if (asset.generatedBy) session.generatedBy = asset.generatedBy;
  if (aside) {
    session.aside = aside;
    session.base = flatten(asset, frameCount);
    session.basePalette = { ...asset.palette };
    session.retouchName = retouchNameOf(fileName);
  }
  return { asset: editorAsset, session };
}

/**
 * Lays a retouch file (a `retouch_of:` overlay) over an opened drawing as a
 * layer of its own, so a second session keeps the retouch already saved instead
 * of starting from the bare recipe output.
 *
 * Where the retouch says `!` the pixel comes out of the base layers of the
 * copy, because an editor layer cannot paint a hole. `session.base` stays the
 * recipe's own output, so saving again writes the same erase back.
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
      // A color the retouch left unnamed comes out of fromAscii as "color <k>",
      // its index *there*; carried over as is, it would be written back as a
      // name nobody gave it, and the retouch would change on every save.
      const name = over.colorNames?.[Number(k)];
      colorNames[i] = name && name !== `color ${k}` ? name : `color ${i}`;
      byHex.set(norm, i);
    }
    index.set(Number(k), i);
  }

  const frames = asset.layers![0].frames.length;
  // The base is copied: the holes are punched in the copy, never in what was opened.
  const under = asset.layers!.map(l => ({ ...l, frames: l.frames.map(f => f.map(row => [...row])) }));
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
            if (v === ERASE) { for (const l of under) if (l.frames[i]?.[r]?.[c]) l.frames[i][r][c] = 0; }
            else if (v) grid[r][c] = index.get(v)!;
          }
        }
      }
      return grid;
    }),
  };
  return {
    asset: { ...asset, palette, colorNames, layers: [...under, layer] },
    session: { ...session, retouchName: fileName, retouchHeaders: headersOf(over, layout) },
  };
}

/**
 * The retouch file's own headers, as it wrote them. Only `id:`, `name:` and
 * `category:` the text really declared count: `fromAscii` invents those three
 * from the file name when they are missing, and an invented one is not a header
 * to give back.
 */
function headersOf(over: SpriteAsset, layout: AsciiLayout): RetouchHeaders {
  const headers: RetouchHeaders = {};
  if (layout.header?.id) headers.id = layout.header.id;
  if (layout.header?.name) headers.name = layout.header.name;
  if (layout.header?.category) headers.category = over.category;
  if (over.description) headers.description = over.description;
  if (layout.fit) headers.fit = layout.fit;
  if (layout.retouchOf) headers.retouchOf = layout.retouchOf;
  if (over.generatedBy) headers.generatedBy = over.generatedBy;
  return headers;
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
  /** For a retouch: how much of the drawing the layer decides. */
  coverage?: RetouchCoverage;
  /**
   * For a retouch: the warning when the layer covers more than
   * `DIVERGENCE_LIMIT` of the drawing. Not in `warnings`: nothing is lost here,
   * it is a sign the corrections belong in the recipe. Never blocks the save.
   */
  divergence?: string;
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
 *
 * Three things, not two: a color paints, `.` leaves what the recipe put there
 * and `!` takes it out. A pixel rubbed out over the generated drawing used to be
 * dropped with a warning; now it is written, so what the editor shows is what
 * the drawing ends up being.
 *
 * Only the pixels are rebuilt. The headers of the retouch file that was opened
 * (`session.retouchHeaders`) are written back as they were, because the notes in
 * a retouch are the part a recipe cannot reconstruct.
 */
function saveRetouch(asset: SpriteAsset, session: TextDrawingSession): SavedTextDrawing {
  const warnings: string[] = [];
  const { width, height } = session;
  const keep = framesToKeep(asset, session);
  const current = flatten(asset, keep);
  const base = session.base ?? [];

  const palette: Record<number, string> = {};
  const colorNames: Record<number, string> = {};
  let painted = 0;
  let changed = 0;
  let erased = 0;
  let ink = 0;
  let divergent = 0;
  const frames: Frame[] = current.map((grid, i) => {
    const out = blankFrame(width, height);
    const under = base[i];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const v = grid[r][c];
        const u = under?.[r]?.[c] ?? 0;
        if (v || u) ink++;
        if (v === u) continue;
        divergent++;
        if (!v) { out[r][c] = ERASE; erased++; continue; }
        out[r][c] = v;
        painted++;
        changed++;
        if (!(v in palette)) {
          palette[v] = toHexColor(asset.palette[v]);
          if (asset.colorNames?.[v]) colorNames[v] = asset.colorNames[v];
        }
      }
    }
    return out;
  });

  // A pixel the hand painted the same color it already was is still the layer's:
  // it is in `painted` only when it differs, which is what `changed` means too.
  const coverage: RetouchCoverage = { painted, changed, erased, divergent, ink, share: ink === 0 ? 0 : divergent / ink };
  // The traffic light is about a recipe that no longer predicts its drawing; a
  // hand-made base has no recipe to move the corrections up to.
  const divergence = session.aside === 'base' ? undefined : divergenceWarning(coverage, divergenceSource(session.generatedBy?.args));
  if (painted === 0 && erased === 0) warnings.push('El retoque no tiene ningún píxel: se guarda vacío.');

  // Headers of the retouch file as it was opened win over the ones derived from
  // the drawing: the pixels are rebuilt on every save, the prose is not.
  const was = session.retouchHeaders;
  const id = was?.id ?? `${asset.id}${asset.id.endsWith('_retoque') ? '' : '_retoque'}`;
  const overlay: SpriteAsset = {
    id,
    name: was?.name ?? `Retoque de ${asset.name}`,
    description: was?.description ?? '',
    category: was?.category ?? asset.category,
    size: Math.max(width, height),
    palette,
    colorNames,
    layers: [{ id: 'layer-base', name: 'Base', isVisible: true, isLocked: false, opacity: 1, frames }],
    animations: [],
  };
  if (width !== height) { overlay.width = width; overlay.height = height; }
  if (was?.generatedBy) overlay.generatedBy = was.generatedBy;

  // Same glyphs as the drawing it retouches, so the two files read alike.
  const layout: AsciiLayout = {
    glyphs: session.layout.glyphs,
    declared: [],
    fit: was?.fit,
    retouchOf: was?.retouchOf ?? session.fileName,
    comments: 0,
  };
  const { text } = toAscii(overlay, { layout, glyphPalette: session.basePalette });
  return {
    text, warnings, kind: 'retouch',
    fileName: session.retouchName ?? retouchNameOf(session.fileName),
    coverage, ...(divergence ? { divergence } : {}),
  };
}

/** Writes the editor asset back as a text drawing, honoring the session it was opened with. */
export function saveTextDrawing(asset: SpriteAsset, session: TextDrawingSession): SavedTextDrawing {
  if (session.aside ?? session.generatedBy) return saveRetouch(asset, session);

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
