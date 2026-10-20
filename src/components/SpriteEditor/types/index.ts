import { SpriteAsset } from '@/lib/types';
import { SpriteEditorState, CreateSpriteEditorStoreOptions } from '../store/types';
import type { PaintAcross } from '@/lib/paintAcross';

export const THUMB_SCALE = 4;
export const THUMB_SIZE = 16 * THUMB_SCALE;

export const AVAILABLE_ANIMS = [
  { value: 'idle_down', label: 'Idle (Down)' },
  { value: 'idle_up', label: 'Idle (Up)' },
  { value: 'idle_right', label: 'Idle (Right)' },
  { value: 'idle_left', label: 'Idle (Left)' },
  { value: 'walk_down', label: 'Walk (Down)' },
  { value: 'walk_up', label: 'Walk (Up)' },
  { value: 'walk_right', label: 'Walk (Right)' },
  { value: 'walk_left', label: 'Walk (Left)' },
  { value: 'run_down', label: 'Run (Down)' },
  { value: 'run_up', label: 'Run (Up)' },
  { value: 'run_right', label: 'Run (Right)' },
  { value: 'run_left', label: 'Run (Left)' },
  { value: 'jump', label: 'Jump' },
  { value: 'attack_down', label: 'Attack (Down)' },
  { value: 'attack_up', label: 'Attack (Up)' },
  { value: 'attack_right', label: 'Attack (Right)' },
  { value: 'attack_left', label: 'Attack (Left)' },
  { value: 'cast', label: 'Cast Spell' },
  { value: 'hurt', label: 'Hurt' },
  { value: 'die', label: 'Die' },
  { value: 'custom', label: 'Custom' },
];

export interface SpriteEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAsset: SpriteAsset;
  onSave: (asset: SpriteAsset) => void | boolean | Promise<void | boolean>;
  /** Ver `CreateSpriteEditorStoreOptions.fromTextFile`. */
  fromTextFile?: boolean;
  /** Ver `CreateSpriteEditorStoreOptions.paintAcross`. */
  paintAcross?: PaintAcross;
  /** Ver `SpriteEditorState._textFile`. */
  textFile?: { name: string; onOpen: () => void } | null;
  generatePrompt?: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
  projectId?: string;
  isIconMode?: boolean;
  iconId?: string;
}

// Re-export store types for UI components
export type { SpriteEditorState, CreateSpriteEditorStoreOptions };
