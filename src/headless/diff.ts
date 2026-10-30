// `pgs diff`: what changed between two drawings, or two folders of them
// (Khadosh/pixel-gaming-studio#52). Every new engine moved drawings nobody had
// touched and nothing said so; the check was built by hand each time with `cmp`
// or numpy, and once PIL's `getbbox` called "equal" two pictures 7,439 pixels
// apart. This is the count done once, the way `map_compare` already did it for
// one map: a pixel differs when its alpha differs or, seen in both, any of its
// colors does (two transparent pixels are equal whatever RGB they carry).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blankImage, blit, readPng, type Rgba } from './png';
import { compareImages } from './mapfile';
import { drawText, textWidth } from './inspect';

export interface PixelDiff {
  width: number;
  height: number;
  /** Pixels that differ, alpha or color. */
  differ: number;
  /** Of those, the ones whose alpha differs (appeared, vanished, or another opacity). */
  alpha: number;
  share: number;
  /** The box that holds every differing pixel, or null when none does. */
  box: { x: number; y: number; w: number; h: number } | null;
}

/** Two pictures of the same size, pixel by pixel. */
export function pixelDiff(a: Rgba, b: Rgba): PixelDiff {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`diff: sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height})`);
  const { width: w, height: h } = a;
  let differ = 0, alpha = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const aa = a.data[i + 3], ba = b.data[i + 3];
    if (aa === 0 && ba === 0) continue;
    if (aa !== ba) alpha++;
    else if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) continue;
    differ++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { width: w, height: h, differ, alpha, share: differ / (w * h), box: differ ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

/** Lines of `a` missing in `b` and the other way round, counted as multisets (order is not looked at). */
export function lineDiff(a: string, b: string): { removed: number; added: number } {
  const count = new Map<string, number>();
  for (const l of a.split('\n')) count.set(l, (count.get(l) ?? 0) + 1);
  let added = 0;
  for (const l of b.split('\n')) {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1); else added++;
  }
  let removed = 0;
  for (const n of count.values()) removed += n;
  return { removed, added };
}

export type FileChange =
  | { path: string; kind: 'pixels'; diff: PixelDiff }
  | { path: string; kind: 'size'; a: [number, number]; b: [number, number] }
  | { path: string; kind: 'text'; removed: number; added: number }
  | { path: string; kind: 'bytes'; a: number; b: number };

export interface TreeDiff {
  files: number;
  same: number;
  /** PNGs whose bytes differ and pixels do not (another encoder, metadata): counted in `same`. */
  samePixels: string[];
  changed: FileChange[];
  onlyA: string[];
  onlyB: string[];
}

const SKIP = new Set(['.git', 'node_modules']);

function walk(root: string, only: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const go = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((p, q) => (p.name < q.name ? -1 : 1))) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) go(full); continue; }
      if (!e.isFile()) continue;
      const rel = relative(root, full).split('\\').join('/');
      if (only.length && !only.some(p => matchesPath(rel, p))) continue;
      out.set(rel, full);
    }
  };
  go(root);
  return out;
}

/** `only`: a piece of the path, or a whole-path pattern with `*` and `?` (`*` crosses folders). */
export function matchesPath(rel: string, pattern: string): boolean {
  if (!/[*?]/.test(pattern)) return rel.includes(pattern);
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(rel);
}

const isPng = (p: string) => /\.png$/i.test(p);
const looksText = (buf: Buffer) => !buf.subarray(0, 8192).includes(0);

/** One file against another: null when equal (bytes, or pixels for a PNG). */
export function compareFiles(rel: string, pa: string, pb: string): FileChange | 'same-pixels' | null {
  const ba = readFileSync(pa), bb = readFileSync(pb);
  if (ba.equals(bb)) return null;
  if (isPng(rel)) {
    let ia: Rgba, ib: Rgba;
    try { ia = readPng(pa); ib = readPng(pb); } catch { return { path: rel, kind: 'bytes', a: ba.length, b: bb.length }; }
    if (ia.width !== ib.width || ia.height !== ib.height) return { path: rel, kind: 'size', a: [ia.width, ia.height], b: [ib.width, ib.height] };
    const d = pixelDiff(ia, ib);
    return d.differ ? { path: rel, kind: 'pixels', diff: d } : 'same-pixels';
  }
  if (looksText(ba) && looksText(bb)) return { path: rel, kind: 'text', ...lineDiff(ba.toString('utf8'), bb.toString('utf8')) };
  return { path: rel, kind: 'bytes', a: ba.length, b: bb.length };
}

/** Two files or two folders (every file under them, `.git` and `node_modules` left out). */
export function diffPaths(a: string, b: string, only: string[] = []): TreeDiff {
  const da = statSync(a).isDirectory(), db = statSync(b).isDirectory();
  if (da !== db) throw new Error(`diff: ${da ? 'a' : 'b'} is a folder and ${da ? 'b' : 'a'} is not`);
  const fa = da ? walk(a, only) : new Map([[a.split('/').pop()!, a]]);
  const fb = db ? walk(b, only) : new Map([[a.split('/').pop()!, b]]);
  const out: TreeDiff = { files: 0, same: 0, samePixels: [], changed: [], onlyA: [], onlyB: [] };
  for (const rel of [...new Set([...fa.keys(), ...fb.keys()])].sort()) {
    out.files++;
    const pa = fa.get(rel), pb = fb.get(rel);
    if (!pb) { out.onlyA.push(rel); continue; }
    if (!pa) { out.onlyB.push(rel); continue; }
    const c = compareFiles(rel, pa, pb);
    if (c === null) out.same++;
    else if (c === 'same-pixels') { out.same++; out.samePixels.push(rel); }
    else out.changed.push(c);
  }
  return out;
}

export function changeLine(c: FileChange): string {
  switch (c.kind) {
    case 'pixels': {
      const d = c.diff, box = d.box!;
      const pct = d.share * 100;
      return `${c.path}: ${d.differ} px differ (${pct < 0.01 ? '<0.01' : pct.toFixed(2)} %)${d.alpha ? `, ${d.alpha} in alpha` : ''} · in ${box.x},${box.y} ${box.w}x${box.h} of ${d.width}x${d.height}`;
    }
    case 'size': return `${c.path}: size ${c.a[0]}x${c.a[1]} → ${c.b[0]}x${c.b[1]}`;
    case 'text': return `${c.path}: −${c.removed} +${c.added} lines`;
    case 'bytes': return `${c.path}: bytes differ (${c.a} → ${c.b} bytes)`;
  }
}

export function diffText(t: TreeDiff, a: string, b: string): string {
  const lines = [
    `a = ${a} · b = ${b}`,
    `${t.files} files: ${t.same} equal, ${t.changed.length} differ, ${t.onlyA.length} only in a, ${t.onlyB.length} only in b`,
    ...t.changed.map(c => '  ' + changeLine(c)),
    ...t.onlyA.map(p => `  only in a: ${p}`),
    ...t.onlyB.map(p => `  only in b: ${p}`),
  ];
  if (t.samePixels.length) lines.push(`  (${t.samePixels.length} PNG with other bytes and the same pixels, counted equal)`);
  return lines.join('\n');
}

// ── The sheet ──────────────────────────────────────────────────────────

const BG: [number, number, number, number] = [21, 18, 15, 255];
const INK: [number, number, number, number] = [230, 220, 200, 255];
const SHEET_W = 1200, PANEL_H = 160, MARGIN = 6, GAP = 8, LABEL = 2, CROP_OVER = 64;

function crop(img: Rgba, x: number, y: number, w: number, h: number): Rgba {
  const o = blankImage(w, h);
  for (let r = 0; r < h; r++) o.data.set(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4), r * w * 4);
  return o;
}

function scaleUp(img: Rgba, s: number): Rgba {
  if (s === 1) return img;
  const o = blankImage(img.width * s, img.height * s);
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
    const i = (Math.floor(y / s) * img.width + Math.floor(x / s)) * 4, k = (y * o.width + x) * 4;
    for (let c = 0; c < 4; c++) o.data[k + c] = img.data[i + c];
  }
  return o;
}

/**
 * One row per drawing that changed, at most `max`: a, b and the differences
 * (`compareImages`: in magenta over a dimmed), whole for a sprite and, along a
 * side over CROP_OVER, cut to the box of what changed plus a margin, so seven
 * pixels on a contour are seen and not lost in a room,
 * and blown up by a whole number to about PANEL_H. A change of size shows a
 * and b whole. Answers null when no PNG changed.
 */
export function diffSheet(t: TreeDiff, read: (rel: string, side: 'a' | 'b') => Rgba, max = 20): { image: Rgba; rows: number } | null {
  const rows: { label: string; panel: Rgba }[] = [];
  for (const c of t.changed) {
    if (rows.length >= max) break;
    if (c.kind !== 'pixels' && c.kind !== 'size') continue;
    const ia = read(c.path, 'a'), ib = read(c.path, 'b');
    let panel: Rgba;
    if (c.kind === 'pixels') {
      const box = c.diff.box!;
      // A sprite is shown whole; only a side over CROP_OVER is cut to the box.
      const x = ia.width > CROP_OVER ? Math.max(0, box.x - MARGIN) : 0, y = ia.height > CROP_OVER ? Math.max(0, box.y - MARGIN) : 0;
      const w = (ia.width > CROP_OVER ? Math.min(ia.width, box.x + box.w + MARGIN) : ia.width) - x;
      const h = (ia.height > CROP_OVER ? Math.min(ia.height, box.y + box.h + MARGIN) : ia.height) - y;
      const cmp = compareImages(crop(ia, x, y, w, h), crop(ib, x, y, w, h), 2);
      const s = Math.max(1, Math.min(Math.floor(PANEL_H / h), Math.floor(SHEET_W / cmp.image.width), 8));
      panel = scaleUp(cmp.image, s);
    } else {
      const w = ia.width + GAP + ib.width, h = Math.max(ia.height, ib.height);
      const pair = blankImage(w, h, BG);
      blit(pair, ia, 0, 0);
      blit(pair, ib, ia.width + GAP, 0);
      const s = Math.max(1, Math.min(Math.floor(PANEL_H / h), Math.floor(SHEET_W / w), 8));
      panel = scaleUp(pair, s);
    }
    // The 3×5 font has letters, digits and _-./() only.
    const label = c.kind === 'pixels' ? `${c.path}  ${c.diff.differ} px${c.diff.alpha ? ` (${c.diff.alpha} alpha)` : ''}` : `${c.path}  size ${c.a[0]}x${c.a[1]} - ${c.b[0]}x${c.b[1]}`;
    rows.push({ label, panel });
  }
  if (!rows.length) return null;
  const labelH = 5 * LABEL + 4;
  const width = Math.max(...rows.map(r => Math.max(r.panel.width, textWidth(r.label, LABEL)))) + GAP * 2;
  const height = rows.reduce((s, r) => s + labelH + r.panel.height + GAP, GAP);
  const image = blankImage(width, height, BG);
  let y = GAP;
  for (const r of rows) {
    drawText(image, r.label, GAP, y, LABEL, INK);
    y += labelH;
    blit(image, r.panel, GAP, y);
    y += r.panel.height + GAP;
  }
  return { image, rows: rows.length };
}
