// Headless asset model: create and mutate a SpriteAsset without the editor,
// the store or Node. Everything here is pure data on top of src/lib/types.ts,
// so the browser can use it too (the editor opens text drawings through
// ascii.ts, which builds on this). Loading and saving files lives in asset.ts.
//
// Coordinates in this module follow the game convention: x = column, y = row.
// Frames are still stored as Frame = number[][] indexed [row][col].

import type { AnimationDef, Frame, SpriteAsset, SpriteLayer } from '../lib/types';

export interface Dims {
  width: number;
  height: number;
}

export interface CreateOptions {
  id: string;
  name?: string;
  width: number;
  height?: number;
  category?: SpriteAsset['category'];
  /** Hex colors for indices 1..n (0 is always transparent). */
  palette?: string[];
  /** How many blank frames to start with. Default 1. */
  frames?: number;
  description?: string;
}

/** Canvas size honoring the optional non-square fields. */
export function dims(asset: SpriteAsset): Dims {
  return {
    width: asset.width ?? asset.size,
    height: asset.height ?? asset.size,
  };
}

export function blankFrame(width: number, height: number): Frame {
  return Array.from({ length: height }, () => Array<number>(width).fill(0));
}

/** An empty frame the size of this asset's canvas (square or not). */
export function blankFrameLike(asset: SpriteAsset): Frame {
  const { width, height } = dims(asset);
  return blankFrame(width, height);
}

/** A color written as hex: #rgb, #rrggbb or #rrggbbaa (the # optional), or "transparent". */
export const HEX_COLOR = /^(#?[0-9a-fA-F]{3}|#?[0-9a-fA-F]{6}|#?[0-9a-fA-F]{8}|transparent)$/;

export function isHexColor(hex: unknown): hex is string {
  return typeof hex === 'string' && HEX_COLOR.test(hex.trim());
}

export const NOT_A_COLOR = 'is not a color: write it as hex, #rrggbb (or #rgb, #rrggbbaa)';

/** The color normalized, or an error that says it is not one — a typo must not enter the palette. */
export function checkedHex(hex: unknown): string {
  if (!isHexColor(hex)) throw new Error(`${JSON.stringify(hex)} ${NOT_A_COLOR}`);
  return normalizeHex(hex);
}

export function normalizeHex(hex: string): string {
  let h = hex.trim().toLowerCase();
  if (h === 'transparent') return h;
  if (!h.startsWith('#')) h = '#' + h;
  if (h.length === 4) {
    // #rgb → #rrggbb
    h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  if (h.length === 9 && h.endsWith('ff')) h = h.slice(0, 7);
  return h;
}

/**
 * Is this color on the palette? A translucent color (#rrggbbaa) counts when its
 * opaque #rrggbb is: fog or a shadow is a palette color at some opacity.
 */
export function onPalette(allowed: Set<string>, hex: string): boolean {
  const h = normalizeHex(hex);
  return allowed.has(h) || (h.length === 9 && allowed.has(h.slice(0, 7)));
}

export function createAsset(opts: CreateOptions): SpriteAsset {
  const width = opts.width;
  const height = opts.height ?? opts.width;
  const palette: Record<number, string> = {};
  const colorNames: Record<number, string> = {};
  (opts.palette ?? []).forEach((hex, i) => {
    palette[i + 1] = checkedHex(hex);
    colorNames[i + 1] = `color ${i + 1}`;
  });
  const count = Math.max(1, opts.frames ?? 1);
  const layer: SpriteLayer = {
    id: 'layer-base',
    name: 'Base',
    isVisible: true,
    isLocked: false,
    opacity: 1,
    frames: Array.from({ length: count }, () => blankFrame(width, height)),
  };
  const asset: SpriteAsset = {
    id: opts.id,
    name: opts.name ?? opts.id,
    description: opts.description ?? '',
    category: opts.category ?? 'prop',
    size: Math.max(width, height),
    palette,
    colorNames,
    layers: [layer],
    animations: [],
  };
  if (width !== height) {
    asset.width = width;
    asset.height = height;
  }
  return asset;
}

export function normalizeAsset(asset: SpriteAsset): SpriteAsset {
  if (!asset.layers || asset.layers.length === 0) {
    asset.layers = [{
      id: 'layer-base',
      name: 'Base',
      isVisible: true,
      isLocked: false,
      opacity: 1,
      frames: asset.frames ?? [],
    }];
    delete asset.frames;
  }
  if (!asset.animations) asset.animations = [];
  if (!asset.palette) asset.palette = {};
  if (!asset.colorNames) asset.colorNames = {};
  return asset;
}

export function baseLayer(asset: SpriteAsset): SpriteLayer {
  return asset.layers![0];
}

export function frameCount(asset: SpriteAsset): number {
  return baseLayer(asset).frames.length;
}

/** Palette index for a color, adding it when missing. Accepts an index too. */
export function colorIndex(asset: SpriteAsset, color: string | number): number {
  if (typeof color === 'number') {
    if (color !== 0 && !asset.palette[color]) {
      throw new Error(`palette has no color at index ${color}`);
    }
    return color;
  }
  const hex = checkedHex(color);
  if (hex === 'transparent') return 0;
  for (const [idx, value] of Object.entries(asset.palette)) {
    if (normalizeHex(value) === hex) return Number(idx);
  }
  const next = Math.max(0, ...Object.keys(asset.palette).map(Number)) + 1;
  asset.palette[next] = hex;
  asset.colorNames[next] = hex;
  return next;
}

/** Composites visible layers of one frame. No cache: safe after mutations. */
export function composite(asset: SpriteAsset, frameIndex: number): Frame {
  const { width, height } = dims(asset);
  const out = blankFrame(width, height);
  for (const layer of asset.layers ?? []) {
    if (!layer.isVisible || layer.opacity === 0) continue;
    const frame = layer.frames[frameIndex];
    if (!frame) continue;
    for (let r = 0; r < height; r++) {
      const row = frame[r];
      if (!row) continue;
      for (let c = 0; c < width; c++) {
        const v = row[c];
        if (v) out[r][c] = v;
      }
    }
  }
  return out;
}

export function getFrame(asset: SpriteAsset, index: number, layer = 0): Frame {
  const frame = asset.layers![layer]?.frames[index];
  if (!frame) throw new Error(`frame ${index} does not exist (layer ${layer})`);
  return frame;
}

export function setFrame(asset: SpriteAsset, index: number, frame: Frame, layer = 0): void {
  const target = asset.layers![layer];
  if (!target) throw new Error(`layer ${layer} does not exist`);
  while (target.frames.length <= index) {
    const { width, height } = dims(asset);
    target.frames.push(blankFrame(width, height));
  }
  target.frames[index] = frame;
}

/** Appends a frame to every layer (blank in the others). Returns its index. */
export function addFrame(asset: SpriteAsset, frame?: Frame): number {
  const { width, height } = dims(asset);
  const index = frameCount(asset);
  asset.layers!.forEach((layer, i) => {
    layer.frames.push(i === 0 && frame ? frame : blankFrame(width, height));
  });
  return index;
}

export function duplicateFrame(asset: SpriteAsset, index: number): number {
  const next = frameCount(asset);
  for (const layer of asset.layers!) {
    const src = layer.frames[index];
    layer.frames.push(src ? src.map(row => [...row]) : blankFrame(dims(asset).width, dims(asset).height));
  }
  return next;
}

export function removeFrame(asset: SpriteAsset, index: number): void {
  if (frameCount(asset) <= 1) throw new Error('an asset needs at least one frame');
  for (const layer of asset.layers!) layer.frames.splice(index, 1);
  for (const anim of asset.animations) {
    anim.frameIndices = anim.frameIndices
      .filter(i => i !== index)
      .map(i => (i > index ? i - 1 : i));
    if (anim.durations) anim.durations = anim.durations.slice(0, anim.frameIndices.length);
  }
  asset.animations = asset.animations.filter(a => a.frameIndices.length > 0);
}

export function findAnimation(asset: SpriteAsset, name: string): AnimationDef | undefined {
  return asset.animations.find(a => a.name === name);
}

/**
 * Animations whose name matches a pattern, in the order the asset has them.
 * `*` stands for any run of characters, so "*_down" picks idle_down, walk_down
 * and attack_down: the directional naming convention of a sprite pack is a
 * pattern, never hardcoded.
 */
export function matchAnimations(asset: SpriteAsset, pattern: string): AnimationDef[] {
  const rx = new RegExp('^' + pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return (asset.animations ?? []).filter(a => rx.test(a.name));
}

export interface AnimationInput {
  name: string;
  label?: string;
  frameIndices: number[];
  fps?: number;
  durations?: number[];
  loop?: boolean;
}

/** Creates or replaces an animation by name. */
export function setAnimation(asset: SpriteAsset, input: AnimationInput): AnimationDef {
  const total = frameCount(asset);
  for (const i of input.frameIndices) {
    if (i < 0 || i >= total) throw new Error(`animation ${input.name}: frame ${i} does not exist`);
  }
  if (input.durations && input.durations.length !== input.frameIndices.length) {
    throw new Error(`animation ${input.name}: durations must match frameIndices`);
  }
  const def: AnimationDef = {
    name: input.name,
    label: input.label ?? input.name.toUpperCase(),
    frameIndices: [...input.frameIndices],
  };
  if (input.fps !== undefined) def.fps = input.fps;
  if (input.durations) def.durations = [...input.durations];
  if (input.loop !== undefined) def.loop = input.loop;
  const existing = asset.animations.findIndex(a => a.name === input.name);
  if (existing >= 0) asset.animations[existing] = def;
  else asset.animations.push(def);
  return def;
}

export function removeAnimation(asset: SpriteAsset, name: string): boolean {
  const before = asset.animations.length;
  asset.animations = asset.animations.filter(a => a.name !== name);
  return asset.animations.length < before;
}

/** Duration in ms of the i-th frame of an animation. */
export function frameDuration(anim: AnimationDef, i: number): number {
  if (anim.durations && anim.durations[i] !== undefined) return anim.durations[i];
  const fps = anim.fps ?? 5;
  return Math.round(1000 / fps);
}

/** A compact, human-readable summary used by every command's result. */
export function summarize(asset: SpriteAsset) {
  const { width, height } = dims(asset);
  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    width,
    height,
    frames: frameCount(asset),
    layers: (asset.layers ?? []).map(l => l.name),
    palette: Object.fromEntries(Object.entries(asset.palette).map(([k, v]) => [k, v])),
    animations: asset.animations.map(a => ({
      name: a.name,
      frames: a.frameIndices,
      fps: a.fps,
      durations: a.durations,
      loop: a.loop ?? true,
    })),
  };
}
