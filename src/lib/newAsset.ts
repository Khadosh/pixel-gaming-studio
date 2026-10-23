/**
 * Un asset nuevo «desde cero»: tipo primero, tamaño después, la paleta del
 * proyecto (Khadosh/pixel-gaming-studio#10).
 *
 * Antes todo asset nuevo nacía `character` con una paleta de monigote (piel,
 * pelo, camisa, espada) escrita en la página. Ahora el tipo lo elige quien
 * crea, el tipo sugiere el tamaño y la paleta sale del proyecto
 * (`projects.config.palette`); si el proyecto todavía no tiene, de la
 * biblioteca, y esa elección pasa a ser la del proyecto.
 *
 * Puro: sin React ni Supabase, para que la página y los tests lo compartan.
 */
import type { SpriteAsset } from '@/lib/types';
import type { PalettePreset } from '@/lib/assets/palettes';
import { PALETTE_LIBRARY } from '@/lib/assets/palettes';

export type AssetKind = SpriteAsset['category'];

export interface AssetKindInfo {
  id: AssetKind;
  label: string;
  desc: string;
  /** El tamaño que sugiere el tipo; quien crea lo puede pisar. */
  size: CanvasSize;
}

export const CANVAS_SIZES = [16, 32, 64, 128] as const;
export type CanvasSize = (typeof CANVAS_SIZES)[number];

export const ASSET_KINDS: AssetKindInfo[] = [
  { id: 'character', label: 'PERSONAJE', desc: 'Héroes, NPCs, enemigos', size: 32 },
  { id: 'prop', label: 'OBJETO', desc: 'Armas, muebles, ítems', size: 16 },
  { id: 'terrain', label: 'TERRENO', desc: 'Suelos y tiles que repiten', size: 16 },
  { id: 'nature', label: 'NATURALEZA', desc: 'Árboles, rocas, plantas', size: 32 },
  { id: 'ui', label: 'INTERFAZ', desc: 'Iconos, botones, marcos', size: 16 },
];

export function kindInfo(kind: AssetKind): AssetKindInfo {
  return ASSET_KINDS.find((k) => k.id === kind) ?? ASSET_KINDS[0];
}

/** La paleta de un proyecto, como se guarda en `projects.config.palette`. */
export type ProjectPalette = {
  /** De qué preset de la biblioteca salió, si salió de uno. */
  from?: string;
  name: string;
  /** Hex sin el transparente: el color 1 es `colors[0]`. */
  colors: string[];
  /** Nombre de cada color, en el mismo orden; los que falten se numeran. */
  names?: string[];
};

/** La paleta que se ofrece cuando el proyecto todavía no tiene una. */
export const DEFAULT_PRESET_ID = 'retro_pico8';

export function paletteFromPreset(preset: PalettePreset): ProjectPalette {
  return { from: preset.id, name: preset.name, colors: [...preset.colors] };
}

export function defaultPalette(): ProjectPalette {
  const preset = PALETTE_LIBRARY.find((p) => p.id === DEFAULT_PRESET_ID) ?? PALETTE_LIBRARY[0];
  return paletteFromPreset(preset);
}

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/**
 * La paleta guardada en el config de un proyecto, o nada si no tiene o lo que
 * hay no es una paleta (el config es jsonb: puede traer cualquier cosa).
 */
export function readProjectPalette(config: unknown): ProjectPalette | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const p = (config as { palette?: unknown }).palette;
  if (!p || typeof p !== 'object') return undefined;
  const { colors, name, names, from } = p as Record<string, unknown>;
  if (!Array.isArray(colors) || colors.length === 0) return undefined;
  if (!colors.every((c) => typeof c === 'string' && HEX.test(c))) return undefined;
  return {
    ...(typeof from === 'string' ? { from } : {}),
    name: typeof name === 'string' && name ? name : 'Paleta del proyecto',
    colors: colors as string[],
    ...(Array.isArray(names) && names.every((n) => typeof n === 'string') ? { names: names as string[] } : {}),
  };
}

/** La paleta en el formato del asset: índice 0 transparente, nombres por índice. */
export function assetPalette(palette: ProjectPalette): Pick<SpriteAsset, 'palette' | 'colorNames'> {
  const out: Record<number, string> = { 0: 'transparent' };
  const colorNames: Record<number, string> = {};
  palette.colors.forEach((hex, i) => {
    out[i + 1] = hex;
    colorNames[i + 1] = palette.names?.[i] || `Color ${i + 1}`;
  });
  return { palette: out, colorNames };
}

const NEW_NAME: Record<AssetKind, string> = {
  character: 'Personaje nuevo',
  prop: 'Objeto nuevo',
  terrain: 'Terreno nuevo',
  nature: 'Naturaleza nueva',
  ui: 'Interfaz nueva',
};

/** Un asset en blanco del tipo, el tamaño y la paleta dados. */
export function blankAsset(opts: {
  kind: AssetKind;
  size: number;
  palette: ProjectPalette;
  id?: string;
}): SpriteAsset {
  const { kind, size, palette } = opts;
  return {
    id: opts.id ?? crypto.randomUUID(),
    name: NEW_NAME[kind],
    description: '',
    category: kind,
    size,
    ...assetPalette(palette),
    layers: [{
      id: 'layer-1',
      name: 'Base',
      isVisible: true,
      isLocked: false,
      opacity: 1,
      frames: [Array.from({ length: size }, () => Array(size).fill(0))],
    }],
    animations: [],
    tags: [],
  };
}

/** Lo que el asistente de IA llama tipo, en las categorías de un asset. */
export const AI_CATEGORY_KIND: Record<string, AssetKind> = {
  character: 'character',
  creature: 'character',
  object: 'prop',
  environment: 'terrain',
  effect: 'prop',
};
