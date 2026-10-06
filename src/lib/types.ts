// Core types for the Pixel Gaming Studio asset system.
// Designed to be JSON-serializable for future LLM generation.

/** A single frame of pixel art — a 2D grid where each number maps to a palette color. */
export type Frame = number[][];

/** A layer within a sprite asset. */
export interface SpriteLayer {
  id: string;
  name: string;
  isVisible: boolean;
  isLocked: boolean;
  opacity: number; // 0.0 to 1.0
  // Frames [0], [1], and [2] are strictly reserved for Front, Side, and Back canonical bases.
  frames: Frame[];
  paletteIds?: number[]; // Added for layer-specific palette filtering
}

/** Defines a named animation as a sequence of frame indices. */
export interface AnimationDef {
  /** Machine-readable name, e.g. 'idle', 'walk' */
  name: string;
  /** Display label, e.g. 'IDLE', 'WALK' */
  label: string;
  /** Indices into SpriteAsset.layers[0].frames[] — allows frame reuse */
  frameIndices: number[];
  /** Playback speed in frames per second. Default: 5 (200ms per frame) */
  fps?: number;
  /** Optional per-frame duration in ms, aligned with frameIndices. Wins over fps when present. */
  durations?: number[];
  /** Whether the animation loops. Default: true. */
  loop?: boolean;
}

export type MemberType = 'head' | 'torso' | 'arm_left' | 'arm_right' | 'leg_left' | 'leg_right' | 'tail' | 'wing' | 'prop';

export interface MemberConfig {
  id: string;
  type: MemberType;
  label: string;
  /** Bounding box of the member relative to the canvas (fallback) */
  area: { startR: number; endR: number; startC: number; endC: number };
  /** Exact pixel coordinates that belong to this member (for precision selection) */
  pixels?: { r: number; c: number }[];
  /** Pivot point for rotation/scaling */
  pivot: { r: number; c: number };
  /** Optional parent member ID for hierarchical movement */
  parentId?: string;
}

export interface OrientationAnatomy {
  members: MemberConfig[];
}

export type AnatomyConfig = {
  /** Mode of the anatomy system */
  mode?: 'auto' | 'humanoid' | 'custom';
  
  // Legacy/Shortcut fields (kept for compatibility and ease of use)
  neckRow?: number;
  waistRow?: number;
  ankleRow?: number;
  torsoLeft?: number;
  torsoRight?: number;
  torsoCenterCol?: number;
  kneeRow?: number;
  leftArmArea?: { startR: number; endR: number; startC: number; endC: number };
  rightArmArea?: { startR: number; endR: number; startC: number; endC: number };
  leftLegArea?: { startR: number; endR: number; startC: number; endC: number };
  rightLegArea?: { startR: number; endR: number; startC: number; endC: number };
  
  // Orientation-specific member configurations (Key: frame index, e.g. 0=Front, 1=Side, 2=Back)
  orientations?: Record<number, OrientationAnatomy>;
  
  // Global Member-based system (fallback or default)
  members?: MemberConfig[];
};

/**
 * What made this asset, as data instead of a sentence in `description`: the
 * command and the arguments needed to make it again. An asset without it was
 * drawn by hand, so a command about to overwrite it can say so first.
 */
export interface GeneratedBy {
  /** The command that wrote it, e.g. 'map_export', 'variant', 'figure'. */
  by: string;
  /** Its arguments in the order they were written, e.g. `{ recipe, layer }`. No spaces in a value. */
  args: Record<string, string>;
}

/** A complete sprite asset with its own palette, layers, and optional animations. */
export interface SpriteAsset {
  /** Unique identifier, used in URLs */
  id: string;
  /** Display name */
  name: string;
  /** Short description of the asset */
  description: string;
  /** Asset category for catalog filtering */
  category: 'character' | 'terrain' | 'prop' | 'nature' | 'ui';
  
  /** Grid size in pixels (width = height). Typically 16 or 32. */
  size: number;
  /**
   * Optional non-square canvas. When present they win over `size`; when absent,
   * width = height = size. Today only the headless tools (src/headless) honor
   * them; the web editor still assumes a square canvas.
   */
  width?: number;
  height?: number;
  /** Unique URL-friendly identifier */
  slug?: string;
  /** Color palette: number → hex color string. 0 is always transparent. */
  palette: Record<number, string>;
  /** Human-readable names for each palette color (for the palette editor) */
  colorNames: Record<number, string>;
  
  /** [DEPRECATED] All unique frames for this asset. Moved to layers. */
  frames?: Frame[];
  
  /** All layers for this asset (auto-populated from frames if missing) */
  layers?: SpriteLayer[];
  
  /** Animation definitions. Empty array = static asset (single frame). */
  animations: AnimationDef[];
  /**
   * Set when a command generated this asset (see `GeneratedBy`). Absent means
   * hand-drawn: running a recipe over it would be overwriting someone's work.
   */
  generatedBy?: GeneratedBy;
  /** Optional tags for search/filtering */
  tags?: string[];
  /** Manual anatomical markers (Bones) for procedural animation overrides */
  anatomy?: AnatomyConfig;
  /** Version history / Checkpoints */
  versions?: {
    id: string;
    timestamp: string;
    name: string;
    asset: any;
  }[];
}

/** Configuration for advanced procedural cast animations */
export type CastShape = 'circle' | 'burst' | 'beam' | 'spark' | 'pulse' | 'random';
export type CastElement = 'fire' | 'water' | 'electric' | 'nature' | 'ice' | 'generic';

export interface AdvancedCastSettings {
  shape: CastShape;
  element: CastElement;
  color?: string; // Optional hex override
}

/** Category metadata for the catalog UI */
export interface CategoryInfo {
  id: SpriteAsset['category'] | 'all';
  label: string;
  icon: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'all',       label: 'All',        icon: '✦' },
  { id: 'character',  label: 'Characters', icon: '⚔' },
  { id: 'terrain',    label: 'Terrain',    icon: '▦' },
  { id: 'prop',       label: 'Props',      icon: '◆' },
  { id: 'nature',     label: 'Nature',     icon: '♣' },
  { id: 'ui',         label: 'UI',         icon: '♥' },
];
