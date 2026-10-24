// A map recipe painted for a top-down game, stood up in a 2:1 isometric picture (#238 of the studio, from the
// patio). The study of #235 showed what projecting the painted picture does: what lies on the ground moves
// well, what stands (a wall, a trunk, the face of a planter) lies down on it, and the grain of the grass smears.
// So nothing is projected as a picture here: the recipe is painted again and each px goes where its part goes.
//
// - The ground is the recipe without the things that stand, painted as always and laid on the 2:1 floor: every px
//   of the picture asks which px of the world is under it, so the joints of tiles follow the diamond and no px is
//   left out. Where it lies is the world's; how it is textured is the screen's: the grain of a grass or a mottled
//   stone is drawn again on the picture (one px stays one px) and keeps the light and glow the world gave it.
// - A face (the front of the house, the face of a planter, a fence; recipe.iso.stand) is up from its foot line as
//   many px as it is drawn above it: each column climbs half a px per px, as a wall along x does in 2:1.
// - The top of something raised (recipe.iso.raise) lies on the floor h px up, and shows the side facing right that
//   the top-down view never drew (its face one tone down).
// - A thing that stands (every scatter stamp, or a group of steps on one foot: a tree) keeps its drawing and moves
//   to where its foot lands: a drawing seen from the front reads the same in both views.
// - What is in front hides what is behind by the depth of its foot (x + y of the world): one depth per px, the
//   nearest wins, whatever layer or step painted it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { exportDirs, layersImage, recipeGame, renderRecipe } from './mapfile';
import { paintMap, Layer, type PaintedMap } from './mappaint';
import type { MapGame, MapMaterial, MapRecipe } from './maprecipe';
import { blankImage, writePng, type Rgba } from './png';

type Part =
  | { kind: 'ground' }
  | { kind: 'stand'; fy: number; n: number }
  | { kind: 'raise'; h: number; n: number }
  | { kind: 'group'; ax: number; ay: number; n: number }
  | { kind: 'sprite'; h: number };

export interface IsoPicture {
  /** The isometric picture, every part in it, nearest on top. */
  picture: Layer;
  /** Only the ground, on the same picture (transparent where there is none). */
  ground: Layer;
  /** Where the world's (0, 0) px lands on the picture. */
  origin: [number, number];
  /** How many px went each way: the ground and each kind of part. */
  parts: Record<string, number>;
  /**
   * Who hides a figure that walks the world, px by px of the picture: the far corner of the floor box of the thing
   * drawn there (its largest x and y, world px), -1 on the ground. A figure standing at (x, y) is behind that px
   * when x < its x and y < its y: in front of a box is past its right or its bottom edge (in 2:1, nearer).
   */
  hides: { x: Int32Array; y: Int32Array };
  /** Where each part was drawn top-down and how it stands: the game moves a point of the top-down map by them. */
  zones: IsoZone[];
}

/** A part as the game needs it: what it is, the rectangle it was drawn in top-down [x0, y0, x1, y1) and its rule. */
export type IsoZone =
  | { kind: 'stand'; rect: [number, number, number, number]; foot: number }
  | { kind: 'raise'; rect: [number, number, number, number]; h: number }
  | { kind: 'group'; rect: [number, number, number, number]; at: [number, number] };

/** Textures drawn again on the screen: their grain is of the px, not of the world. The rest (tiles, planks,
 *  flagstones…) are laid in the world, so their joints follow the floor. */
const SCREEN_TEXTURES = new Set(['patches', 'mottled', 'grain']);

const matches = (id: string | undefined, pats: string[]) =>
  !!id && pats.some(p => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p));

/** What each step of the recipe is in the isometric picture. */
export function isoParts(recipe: MapRecipe): Part[] {
  const iso = recipe.iso ?? {}, cell = recipe.cell ?? 16;
  const [mx, my] = recipe.margin ?? [0, 0];
  return recipe.steps.map((st): Part => {
    const id = 'id' in st ? st.id : undefined;
    const stamp = st.step === 'scatter' && !matches(id, iso.flat ?? []);
    const stand = iso.stand?.find(s => matches(id, s.steps));
    if (stand) return { kind: 'stand', fy: (my + stand.foot) * cell, n: iso.stand!.indexOf(stand) };
    const n = iso.raise?.findIndex(s => matches(id, s.steps)) ?? -1;
    if (n >= 0) return stamp ? { kind: 'sprite', h: iso.raise![n].h } : { kind: 'raise', h: iso.raise![n].h, n };
    const group = iso.group?.find(s => matches(id, s.steps));
    if (group) return { kind: 'group', ax: (mx + group.at[0]) * cell, ay: (my + group.at[1]) * cell, n: iso.group!.indexOf(group) };
    if (stamp) return { kind: 'sprite', h: 0 };
    return { kind: 'ground' };
  });
}

/** The 2:1 projection of a world px (x right, y down the map, z up): one px along x is one across and half down. */
export const isoOf = (x: number, y: number, z = 0): [number, number] => [x - y, (x + y) / 2 - z];

export function isoMap(recipe: MapRecipe, game: MapGame, colors?: Record<string, string>): IsoPicture {
  const parts = isoParts(recipe), iso = recipe.iso ?? {};
  // the ground: the recipe without what stands (what was under the house front, the planter, the trunk is ground too)
  const groundRecipe: MapRecipe = { ...recipe, steps: recipe.steps.filter((_, i) => parts[i].kind === 'ground') };
  const G = paintMap(groundRecipe, game, colors);
  // the same ground with the screen textures flat: what the light and the glows did to each px, without its grain
  const screenMats = Object.entries(recipe.materials).filter(([, m]) => SCREEN_TEXTURES.has(m.texture ?? ''));
  const flatMats: Record<string, MapMaterial> = { ...recipe.materials };
  for (const [n, m] of screenMats) flatMats[n] = { ...m, texture: 'flat' };
  const Gf = screenMats.length ? paintMap({ ...groundRecipe, materials: flatMats }, game, colors) : null;
  // what stands: the faces, tops and groups painted without the stamps (a flower that stands up off the planter
  // leaves the planter whole under it), and the stamps from the whole recipe
  const B: PaintedMap = paintMap({ ...recipe, steps: recipe.steps.filter((_, i) => parts[i].kind !== 'sprite') }, game, colors, { owners: true });
  const F: PaintedMap = paintMap(recipe, game, colors, { owners: true });
  const W = F.width, H = F.height;
  // B's steps are the recipe's without the stamps: back to the recipe's index
  const bIndex = recipe.steps.map((_, i) => i).filter(i => parts[i].kind !== 'sprite');

  const shadeOf = (c: string, n = 1): string => {
    for (const m of Object.values(recipe.materials)) {
      const i = m.ramp.indexOf(c);
      if (i >= 0) return m.ramp[Math.max(0, i - n)];
    }
    return c;
  };

  // every px of what stands, where it lands and how near it is
  // and the floor box of what it is part of (its far corner, see `hides`), filled in as the px are read
  interface Box { mx: number; my: number }
  interface Px { sx: number; sy: number; c: string; d: number; b: Box }
  const standing: Px[] = [];
  const boxes = new Map<string, Box>();
  const boxOf = (key: string, my: number): Box => { let b = boxes.get(key); if (!b) boxes.set(key, (b = { mx: -1, my })); return b; };
  // the px a group paints on the ground layer (its foot is read from them once they are all read)
  const groupFoot = new Map<number, number[]>();
  // where each part was drawn: [x0, y0, x1, y1)
  const drawn = new Map<string, [number, number, number, number]>();
  const grow = (key: string, x: number, y: number) => {
    const r = drawn.get(key);
    if (!r) drawn.set(key, [x, y, x + 1, y + 1]);
    else { r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], y); r[2] = Math.max(r[2], x + 1); r[3] = Math.max(r[3], y + 1); }
  };
  const count: Record<string, number> = {};
  const add = (kind: string, p: Px) => { standing.push(p); count[kind] = (count[kind] ?? 0) + 1; };
  // raise n → its top in the world, and every px over it (its own and the stamps standing on it): what is solid
  const tops = new Map<number, { h: number; px: Map<number, string>; solid: Set<number> }>();
  const onTop = (h: number) => [...tops.values()].find(t => t.h === h);
  const layerNames = ['ground', ...Object.keys(F.layers).filter(n => n !== 'ground')];
  const faces = new Map<number, number>();   // px of the faces, by index (the side of a raised thing reads them)
  for (const name of layerNames) {
    const L = F.layers[name], own = F.owners![name], LB = B.layers[name], ownB = B.owners![name];
    if (!own) continue;
    const sprites = new Map<number, number[]>();
    for (let k = 0; k < L.px.length; k++) {
      const i = own[k];
      if (L.px[k] !== null && i >= 0 && parts[i].kind === 'sprite') { const list = sprites.get(i) ?? []; list.push(k); sprites.set(i, list); }
      if (!LB || !ownB) continue;
      const c = LB.px[k], ib = ownB[k];
      if (c === null || ib < 0) continue;
      const part = parts[bIndex[ib]], x = k % W, y = Math.floor(k / W);
      if (part.kind === 'stand') {
        const [sx, sy] = isoOf(x + 0.5, part.fy, part.fy - y - 0.5);
        const b = boxOf(`stand${part.n}`, part.fy);
        b.mx = Math.max(b.mx, x + 1);
        grow(`stand${part.n}`, x, y);
        add('stand', { sx: Math.floor(sx), sy: Math.floor(sy), c, d: x + part.fy, b });
        faces.set(k, bIndex[ib]);
      } else if (part.kind === 'group') {
        const [ax, ay] = isoOf(part.ax, part.ay);
        grow(`group${part.n}`, x, y);
        // on the ground layer it stands on its foot (a trunk); on a layer over the figures it spreads (a crown)
        const key = name === 'ground' ? `group${part.n}` : `crown${part.n}`;
        if (name === 'ground') { const f = groupFoot.get(part.n) ?? []; f.push(k); groupFoot.set(part.n, f); } else grow(key, x, y);
        add('group', { sx: Math.round(x - part.ax + ax), sy: Math.round(y - part.ay + ay), c, d: part.ax + part.ay, b: boxOf(key, part.ay) });
      } else if (part.kind === 'raise') {
        // drawn h px above where it lies
        const t = tops.get(part.n) ?? { h: part.h, px: new Map(), solid: new Set() };
        if (y + part.h < H) { t.px.set((y + part.h) * W + x, c); t.solid.add((y + part.h) * W + x); }
        const b = boxOf(`raise${part.n}`, -1);
        b.mx = Math.max(b.mx, x + 1); b.my = Math.max(b.my, y + part.h + 1);
        grow(`raise${part.n}`, x, y);
        tops.set(part.n, t);
      }
    }
    // each stamp of a scatter step stands on its own foot: the middle of the bottom row of its blot of ink
    for (const [i, ks] of sprites) {
      const h = (parts[i] as { h: number }).h;
      if (h) for (const k of ks) onTop(h)?.solid.add(k + h * W);
      for (const blot of blots(ks, W)) {
        let bottom = -1;
        for (const k of blot) bottom = Math.max(bottom, Math.floor(k / W));
        const row = blot.filter(k => Math.floor(k / W) === bottom).map(k => k % W);
        const ax = (Math.min(...row) + Math.max(...row) + 1) / 2, ay = bottom + 1;
        const [fx, fy] = isoOf(ax, ay + h, h);
        const b = { mx: Math.max(...row) + 1, my: ay + h };
        for (const k of blot) {
          const x = k % W, y = Math.floor(k / W);
          add('sprite', { sx: Math.round(x - ax + fx), sy: Math.round(y - ay + fy), c: L.px[k]!, d: ax + ay + h, b });
        }
      }
    }
  }

  // the side of a raised thing that faces right: the top-down view never drew it
  for (const [n, t] of tops) {
    const side = iso.raise![n].side;
    // the face the recipe drew for it, read along its width (its columns repeat) and up from its foot
    const own = side ? [...faces].filter(([, i]) => matches(stepId(recipe, i), side)).map(([k]) => k) : [];
    const xs = own.map(k => k % W), ys = own.map(k => Math.floor(k / W));
    const x0 = Math.min(...xs), wide = Math.max(...xs) - x0 + 1, y1 = Math.max(...ys);
    const faceAt = (along: number, z: number): string | null => {
      if (!own.length) return null;
      const k = (y1 - z) * W + x0 + (along % wide);
      return faces.has(k) ? B.layers.ground.px[k] : null;
    };
    for (const [k, top] of t.px) {
      const x = k % W, y = Math.floor(k / W);
      if (t.solid.has(k + 1) || x + 1 >= W) continue;
      for (let z = 0; z < t.h; z++) {
        const [sx, sy] = isoOf(x + 1, y + 0.5, z + 0.5);
        const face = faceAt(y, z);
        add('side', { sx: Math.floor(sx), sy: Math.floor(sy), c: face ? shadeOf(face, 1) : shadeOf(top, 2), d: x + 1 + y, b: boxOf(`raise${n}`, -1) });
      }
    }
  }

  iso.group?.forEach((_, n) => {
    // what a group paints on the ground takes the floor of its foot (the roots of a trunk: its ink in the last 4
    // rows): a figure is behind it only past where it ends
    const ks = groupFoot.get(n), b = boxes.get(`group${n}`);
    if (ks && b) {
      const bottom = Math.max(...ks.map(k => Math.floor(k / W)));
      b.mx = Math.max(...ks.filter(k => Math.floor(k / W) > bottom - 4).map(k => k % W)) + 1;
    }
    // what it paints over the figures (a crown) takes the floor it spreads over: as wide as it was drawn, and a
    // quarter of that past its foot (a crown seen from above); a figure behind that is under the crown
    const r = drawn.get(`crown${n}`), c = boxes.get(`crown${n}`);
    if (r && c) { c.mx = r[2]; c.my += Math.round((r[2] - r[0]) / 4); }
  });

  // the picture: the floor's diamond, and above it as high as anything stands
  let minY = 0, minX = -H, maxX = W, maxY = (W + H) / 2;
  for (const p of standing) { minY = Math.min(minY, p.sy); minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx + 1); maxY = Math.max(maxY, p.sy + 1); }
  for (const t of tops.values()) minY = Math.min(minY, -t.h);
  const ox = -Math.floor(minX), oy = -Math.floor(minY);
  const PW = Math.ceil(maxX) + ox, PH = Math.ceil(maxY) + oy;
  const picture = new Layer(PW, PH), ground = new Layer(PW, PH);
  const depth = new Float64Array(PW * PH).fill(-Infinity);
  const hides = { x: new Int32Array(PW * PH).fill(-1), y: new Int32Array(PW * PH).fill(-1) };

  // the screen textures, drawn on a field the size of the picture: one per material that has one
  const field = new Map<string, Layer>();
  const cell = recipe.cell ?? 16;
  for (const [n] of screenMats) {
    const fw = Math.ceil(PW / cell), fh = Math.ceil(PH / cell);
    const g: MapGame = { width: fw, height: fh, grid: Array.from({ length: fh }, () => '.'.repeat(fw)) } as MapGame;
    const R: MapRecipe = { ...recipe, margin: [0, 0], steps: [{ step: 'area', material: n, shape: 'all' }] as MapRecipe['steps'], variants: undefined, iso: undefined };
    field.set(n, paintMap(R, g, colors).layers.ground);
  }
  const idx = (m: MapMaterial, c: string | null) => (c === null ? -1 : m.ramp.indexOf(c));

  // which world px is under a px of the picture, on the plane z
  const under = (sx: number, sy: number, z: number): [number, number] => {
    const a = sx - ox + 0.5, b = 2 * (sy - oy + 0.5 + z);
    return [Math.floor((a + b) / 2), Math.floor((b - a) / 2)];
  };
  let groundPx = 0;
  for (let sy = 0; sy < PH; sy++) for (let sx = 0; sx < PW; sx++) {
    const [x, y] = under(sx, sy, 0);
    let c = G.layers.ground.get(x, y);
    if (c === null) continue;
    const kind = G.kind[y * W + x], tex = kind ? field.get(kind) : undefined;
    if (tex && Gf) {
      // the grain of the screen, moved as many tones as the light moved this px in the world
      const m = recipe.materials[kind], base = m.base ?? Math.floor(m.ramp.length / 2);
      const lit = idx(m, Gf.layers.ground.get(x, y)), grain = idx(m, tex.get(sx, sy));
      if (lit >= 0 && grain >= 0) c = m.ramp[Math.max(0, Math.min(m.ramp.length - 1, grain + lit - base))];
    }
    ground.set(sx, sy, c); picture.set(sx, sy, c); groundPx++;
  }
  count.ground = groundPx;
  // the tops of raised things, each on its own plane
  for (const [n, t] of tops) {
    const b = boxOf(`raise${n}`, -1);
    for (let sy = 0; sy < PH; sy++) for (let sx = 0; sx < PW; sx++) {
      const [x, y] = under(sx, sy, t.h);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = t.px.get(y * W + x);
      if (c === undefined) continue;
      const d = x + y, j = sy * PW + sx;
      if (d < depth[j]) continue;
      depth[j] = d; picture.set(sx, sy, c); count.raise = (count.raise ?? 0) + 1;
      hides.x[j] = b.mx; hides.y[j] = b.my;
    }
  }
  for (const p of standing) {
    const sx = p.sx + ox, sy = p.sy + oy, j = sy * PW + sx;
    if (sx < 0 || sy < 0 || sx >= PW || sy >= PH || p.d < depth[j]) continue;
    depth[j] = p.d; picture.set(sx, sy, p.c);
    hides.x[j] = p.b.mx; hides.y[j] = p.b.my;
  }
  const zones: IsoZone[] = [];
  iso.stand?.forEach((st, n) => { const r = drawn.get(`stand${n}`); if (r) zones.push({ kind: 'stand', rect: r, foot: ((recipe.margin ?? [0, 0])[1] + st.foot) * cell }); });
  iso.raise?.forEach((st, n) => { const r = drawn.get(`raise${n}`); if (r) zones.push({ kind: 'raise', rect: r, h: st.h }); });
  iso.group?.forEach((st, n) => {
    const r = drawn.get(`group${n}`), [mx, my] = recipe.margin ?? [0, 0];
    if (r) zones.push({ kind: 'group', rect: r, at: [(mx + st.at[0]) * cell, (my + st.at[1]) * cell] });
  });
  return { picture, ground, origin: [ox, oy], parts: count, hides, zones };
}

const stepId = (recipe: MapRecipe, i: number): string | undefined => {
  const st = recipe.steps[i];
  return 'id' in st ? st.id : undefined;
};

/** The 8-connected blots of a set of px (indexes into a picture `w` wide). */
function blots(ks: number[], w: number): number[][] {
  const left = new Set(ks), out: number[][] = [];
  for (const k0 of ks) {
    if (!left.has(k0)) continue;
    left.delete(k0);
    const blot = [k0], todo = [k0];
    while (todo.length) {
      const k = todo.pop()!, x = k % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const n = k + dy * w + dx;
        if (left.has(n)) { left.delete(n); blot.push(n); todo.push(n); }
      }
    }
    out.push(blot);
  }
  return out;
}

/**
 * Who hides a figure, as a picture the game reads with its shader: per px, R and G the low byte of x and y of the
 * far corner of the box (see `hides`), B the high bits (x in 0–3, y in 4–6) and bit 7 set where something stands.
 */
export function hidesImage(iso: IsoPicture): Rgba {
  const { w, h } = iso.picture, img = blankImage(w, h);
  for (let j = 0; j < w * h; j++) {
    const x = iso.hides.x[j], y = iso.hides.y[j];
    if (x < 0) continue;
    img.data[j * 4] = x & 255; img.data[j * 4 + 1] = Math.max(0, y) & 255;
    img.data[j * 4 + 2] = 128 | ((x >> 8) & 15) | (((Math.max(0, y) >> 8) & 7) << 4); img.data[j * 4 + 3] = 255;
  }
  return img;
}

/** map_export projection=iso: for each state, <id>_iso.png (the picture), <id>_iso_tapa.png (who hides) and
 *  <id>_iso.json (where the world's origin lands, the size, the zones). */
export function exportIso(recipePath: string, variants: (string | undefined)[], dirGiven?: string) {
  const lines: string[] = [], files: string[] = [];
  const renders = variants.map(variant => renderRecipe(recipePath, { variant }));
  for (const [k, variant] of variants.entries()) {
    const r = renders[k];
    const dir = exportDirs(r, recipePath, { dir: dirGiven }).dir;
    const id = `${r.recipe.export?.id ?? 'mapa'}_iso`;
    const iso = isoMap(r.recipe, recipeGame(r.recipe, recipePath), r.colors);
    mkdirSync(dir, { recursive: true });
    const png = join(dir, `${id}.png`), tapa = join(dir, `${id}_tapa.png`), json = join(dir, `${id}.json`);
    writePng(png, layersImage([iso.picture], r.colors));
    writePng(tapa, hidesImage(iso));
    writeFileSync(json, JSON.stringify({
      generated_by: `map_export recipe=${basename(recipePath)} projection=iso${variant ? ` variant=${variant}` : ''}`,
      size: [iso.picture.w, iso.picture.h], origin: iso.origin, cell: r.map.cell,
      projection: 'screen = origin + (x - y, (x + y) / 2 - z), world px',
      tapa: 'R, G: low byte of x, y of the far corner of the floor box of what stands there; B: bit 7 something stands, bits 0-3 high x, 4-6 high y. A figure at (x, y) is behind when x < box x and y < box y',
      zones: iso.zones,
    }, null, 1) + '\n');
    files.push(png, tapa, json);
    lines.push(`${variant ? `${variant}: ` : ''}${basename(png)} ${iso.picture.w}x${iso.picture.h} + ${basename(tapa)} + ${basename(json)} (${iso.zones.length} zones)`);
  }
  return { data: { files }, text: lines.join('\n') };
}
