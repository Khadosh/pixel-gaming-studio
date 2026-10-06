import { createStore } from 'zustand/vanilla';
import { ensureLayerSupport } from '@/lib/layerUtils';
import { getColorName } from '@/lib/colorUtils';
import { EditorScope } from '@/components/EditorToolbar';
import { AdvancedCastSettings } from '@/lib/types';
import { SpriteEditorState, CreateSpriteEditorStoreOptions } from './types';

// Import Slices
import { createHistorySlice } from './slices/historySlice';
import { createBaseSlice } from './slices/baseSlice';
import { createLayerSlice } from './slices/layerSlice';
import { createFrameSlice } from './slices/frameSlice';
import { createPaletteSlice } from './slices/paletteSlice';
import { createAnimationSlice } from './slices/animationSlice';
import { createTransformSlice } from './slices/transformSlice';
import { createExportSlice } from './slices/exportSlice';
import { createAnatomySlice } from './slices/anatomySlice';
import { serializeAsset, deserializeAsset } from '@/lib/spriteDto';
import { decompressState } from '@/lib/storageCompression';
import { hashAssetSource } from '@/lib/hashUtils';

import { persist } from 'zustand/middleware';

export function createSpriteEditorStore(options: CreateSpriteEditorStoreOptions) {
  const DEFAULT_THEORY_PALETTE = ['#1a0c24', '#4c1e3d', '#9e3a39', '#e87e35', '#ffce5e', '#fff1c7', '#141013', '#2b1b36', '#4e2d4d', '#7d4a41', '#b37748', '#e3a857', '#fee27d', '#3e3546', '#44a362', '#91db69'];

  const initialAsset = { ...options.initialAsset };
  const currentPaletteKeys = Object.keys(initialAsset.palette || {}).filter(k => k !== '0');
  
  // If the palette is empty or very basic, inject the theory palette (not for text drawings: their palette is theirs)
  if (currentPaletteKeys.length <= 2 && !options.fromTextFile) {
    const newPalette: Record<number, string> = { 0: 'transparent' };
    const newColorNames: Record<number, string> = { 0: 'Transparent' };
    DEFAULT_THEORY_PALETTE.forEach((color, i) => {
      const key = i + 1;
      newPalette[key] = color;
      newColorNames[key] = getColorName(color);
    });
    initialAsset.palette = newPalette;
    initialAsset.colorNames = newColorNames;
  }

  const migrated = ensureLayerSupport(initialAsset);

  // Huella del asset de origen (tal como vino de la DB / del caller). Si al rehidratar
  // el snapshot local fue creado a partir de otro asset, se descarta.
  const sourceHash = hashAssetSource(options.initialAsset);
  const storageKey = `pps-editor-${options.initialAsset.id || `new-${options.projectId || 'sin-proyecto'}`}`;

  return createStore<SpriteEditorState>()(
    persist(
      (set, get) => ({
        // Compose Slices
        ...createHistorySlice(set as any, get),
        ...createBaseSlice(set as any, get),
        ...createLayerSlice(set as any, get),
        ...createFrameSlice(set as any, get),
        ...createPaletteSlice(set as any, get),
        ...createAnimationSlice(set as any, get),
        ...createTransformSlice(set as any, get),
        ...createExportSlice(set as any, get),
        ...createAnatomySlice(set as any, get),

        // --- Initial State Overrides (from options) ---
        // Un icono trae su propia paleta con nombre (base, claro, oscuro, negro,
        // acento: ver art/iconos/README.md), así que se abre con ella y no con
        // una inventada acá, que mostraba cuatro colores que el dibujo no tenía.
        editedAsset: migrated,
        activeLayerId: migrated.layers![0]?.id || null,
        editingFrameIndex: 0,
        viewingAnimation: 'base',
        assetName: options.initialAsset.name,
        isEditingName: false,
        onionSkin: false,
        showAllColors: false,
        scope: 'layer' as EditorScope,
        castSettings: { shape: 'burst', element: 'generic' } as AdvancedCastSettings,
        zoom: options.isIconMode ? 3.0 : 1.0, // Zoom in more for icons
        layerClipboard: null,
        frameClipboard: null,
        selectedAnims: [],
        isAnimGenerating: false,
        animError: null,
        leftSidebarTab: options.isIconMode ? 'layers' : 'animations',
        isDirty: false,
        canvasBg: 'dark',
        activePerspective: options.projectConfig?.directionality === '1-way' ? 'side' : 'front',
        activeSide: 'right',
        anatomySelectedOrientation: options.projectConfig?.directionality === '1-way' ? 1 : 0,
        showIsometricGrid: false,
        sketchMode: false,
        tool: 'pencil',
        activeColorKey: 1,
        brushSize: 1,
        mirrorX: false,
        isIconMode: options.isIconMode,
        iconId: options.iconId,
        _sourceHash: sourceHash,

        // Props from parent
        projectId: options.projectId,
        projectConfig: options.projectConfig,
        _onSave: options.onSave,
        _onOpenChange: options.onOpenChange,
        _previewPanelRef: options.previewPanelRef,
        _generatePrompt: options.generatePrompt,
        _onRegenerate: options.onRegenerate,
        _isGenerating: options.isGenerating,

        // Bridge initialized as null
        _pixelEditorBridge: null,
      } as SpriteEditorState),
      {
        name: storageKey,
        storage: {
          getItem: (name: string) => {
            if (options.fromTextFile) return null;
            const raw = localStorage.getItem(name);
            if (!raw) return null;
            try {
              const data = JSON.parse(raw);
              if (data.version === 'dedupe-v1') {
                data.state = decompressState(data.state);
              } else if (data.version === 'dto-v2') {
                if (data.state?.editedAsset) {
                  data.state.editedAsset = deserializeAsset(data.state.editedAsset);
                }
              }
              return data;
            } catch {
              return null;
            }
          },
          setItem: (name: string, value: any) => {
            if (options.fromTextFile) return;
            const saveToStorage = (val: any) => {
              const stateToSave = { ...val.state };
              if (stateToSave.editedAsset) {
                stateToSave.editedAsset = serializeAsset(stateToSave.editedAsset);
              }
              localStorage.setItem(name, JSON.stringify({
                version: 'dto-v2', // Upgraded from dedupe-v1
                state: stateToSave
              }));
            };

            try {
              saveToStorage(value);
            } catch (e) {
              console.warn("[Storage] LocalStorage full, attempting aggressive cleanup...", e);
              
              // Fallback 1: Clear other editor entries to make space
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && key.startsWith('pps-editor-') && key !== name) {
                    localStorage.removeItem(key);
                  }
                }
                saveToStorage(value);
              } catch {
                // Fallback 2: Clear history versions of CURRENT asset
                try {
                  const desperateValue = JSON.parse(JSON.stringify(value));
                  if (desperateValue.state?.editedAsset) {
                    desperateValue.state.editedAsset.versions = [];
                  }
                  saveToStorage(desperateValue);
                } catch {
                  // Silent fail if disk is completely full
                }
              }
            }
          },
          removeItem: (name: string) => localStorage.removeItem(name)
        } as any,
        partialize: (state) => ({ 
          editedAsset: state.editedAsset, 
          isDirty: state.isDirty,
          assetName: state.assetName,
          canvasBg: state.canvasBg,
          _sourceHash: state._sourceHash,
        } as any),
        merge: (persisted, current) => {
          const snapshot = persisted as Partial<SpriteEditorState> | undefined;
          if (!snapshot) return current;
          if (snapshot._sourceHash !== current._sourceHash) {
            console.warn(
              `[Editor] Se descartó el borrador local de "${storageKey}": el sprite cambió en la base de datos ` +
              `desde que se guardó el borrador (o el borrador es de una versión anterior de la app).`
            );
            return current;
          }
          return { ...current, ...snapshot };
        },
      }
    )
  );
}
export type SpriteEditorStore = ReturnType<typeof createSpriteEditorStore>;
export * from './types';
