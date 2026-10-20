import { normalizeTags, normalizeTag } from '@/lib/tagUtils';
import { SpriteEditorState, StoreSlice } from '../types';
import { blankFrameLike } from '@/headless/assetModel';

export const createBaseSlice: StoreSlice<Partial<SpriteEditorState>> = (set, get) => ({
  // Setters
  setEditedAsset: (assetOrFn) => set(state => ({
    editedAsset: typeof assetOrFn === 'function' ? assetOrFn(state.editedAsset) : assetOrFn,
  })),
  setAnatomySelectedOrientation: (idx) => set(() => {
    let p: 'front' | 'side' | 'back' = 'front';
    if (idx === 1 || idx === 3) p = 'side';
    else if (idx === 2) p = 'back';
    return { 
      anatomySelectedOrientation: idx, 
      editingFrameIndex: idx,
      activePerspective: p
    };
  }),
  setEditingFrameIndex: (idx) => set({ editingFrameIndex: idx }),
  setViewingAnimation: (name) => set({ viewingAnimation: name }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setAssetName: (name) => set(state => ({ 
    assetName: name, 
    editedAsset: { ...state.editedAsset, name },
    isDirty: true 
  })),
  setIsEditingName: (editing) => set({ isEditingName: editing }),
  setOnionSkin: (onOrFn) => set(s => ({ 
    onionSkin: typeof onOrFn === 'function' ? onOrFn(s.onionSkin) : onOrFn 
  })),
  setShowAllColors: (onOrFn) => set(s => ({ 
    showAllColors: typeof onOrFn === 'function' ? onOrFn(s.showAllColors) : onOrFn 
  })),
  setScope: (scope) => set({ scope }),
  setPaintAcross: (paintAcross) => set({ paintAcross }),
  setCastSettings: (settingsOrFn) => set(state => ({
    castSettings: typeof settingsOrFn === 'function' ? settingsOrFn(state.castSettings) : settingsOrFn,
  })),
  setZoom: (zOrFn) => set(state => ({
    zoom: typeof zOrFn === 'function' ? zOrFn(state.zoom) : zOrFn,
  })),
  setSelectedAnims: (animsOrFn) => set(state => ({
    selectedAnims: typeof animsOrFn === 'function' ? animsOrFn(state.selectedAnims) : animsOrFn,
  })),
  setIsAnimGenerating: (g) => set({ isAnimGenerating: g }),
  setAnimError: (e) => set({ animError: e }),
  setPixelEditorBridge: (bridge) => set({ _pixelEditorBridge: bridge }),
  setLeftSidebarTab: (tab) => set((s) => ({ 
    leftSidebarTab: s.leftSidebarTab === tab ? null : tab 
  })),
  setCanvasBg: (bgOrFn) => set(s => ({ 
    canvasBg: typeof bgOrFn === 'function' ? bgOrFn(s.canvasBg) : bgOrFn 
  })),
  setActivePerspective: (p) => set(s => {
    let idx = 0;
    if (p === 'side') idx = s.activeSide === 'right' ? 1 : 3;
    else if (p === 'back') idx = 2;
    
    const layers = s.editedAsset.layers || [];
    const currentMaxIdx = (layers[0]?.frames.length || 0) - 1;
    
    // Find best idle animation for this perspective
    let targetAnim = 'base';
    const idleMap: Record<string, string> = {
      'front': 'idle_down',
      'back': 'idle_up',
      'side': s.activeSide === 'right' ? 'idle_right' : 'idle_left'
    };
    const desiredIdle = idleMap[p];
    if (s.editedAsset.animations?.some(a => a.name === desiredIdle)) {
      targetAnim = desiredIdle;
    }

    if (idx > currentMaxIdx) {
      const newLayers = layers.map(layer => {
        const newFrames = [...layer.frames];
        while (newFrames.length <= idx) {
          newFrames.push(blankFrameLike(s.editedAsset));
        }
        return { ...layer, frames: newFrames };
      });
      return { 
        activePerspective: p, 
        editingFrameIndex: idx,
        editedAsset: { ...s.editedAsset, layers: newLayers },
        viewingAnimation: targetAnim,
        anatomySelectedOrientation: idx,
        isDirty: true
      };
    }
    
    return { 
      activePerspective: p, 
      editingFrameIndex: idx, 
      viewingAnimation: targetAnim,
      anatomySelectedOrientation: idx
    };
  }),
  setActiveSide: (side) => set(s => {
    const isSide = s.activePerspective === 'side';
    let targetIdx = s.editingFrameIndex;
    let newAsset = s.editedAsset;
    let dirty = s.isDirty;

    if (isSide) {
      targetIdx = side === 'right' ? 1 : 3;
      const layers = s.editedAsset.layers || [];
      const currentMaxIdx = (layers[0]?.frames.length || 0) - 1;
      
      if (targetIdx > currentMaxIdx) {
        const newLayers = layers.map(layer => {
          const newFrames = [...layer.frames];
          while (newFrames.length <= targetIdx) {
            newFrames.push(blankFrameLike(s.editedAsset));
          }
          return { ...layer, frames: newFrames };
        });
        newAsset = { ...s.editedAsset, layers: newLayers };
        dirty = true;
      }
    }

    // Update animation too if it's idle
    let targetAnim = s.viewingAnimation;
    if (isSide) {
      const desiredIdle = side === 'right' ? 'idle_right' : 'idle_left';
      if (s.editedAsset.animations?.some(a => a.name === desiredIdle)) {
        targetAnim = desiredIdle;
      }
    }

    return { 
      activeSide: side, 
      editingFrameIndex: targetIdx,
      editedAsset: newAsset,
      viewingAnimation: targetAnim,
      anatomySelectedOrientation: targetIdx,
      isDirty: dirty
    };
  }),
  setShowIsometricGrid: (onOrFn: boolean | ((prev: boolean) => boolean)) => set(s => ({ 
    showIsometricGrid: typeof onOrFn === 'function' ? onOrFn(s.showIsometricGrid) : onOrFn 
  })),
  setSketchMode: (onOrFn: boolean | ((prev: boolean) => boolean)) => set(s => ({ 
    sketchMode: typeof onOrFn === 'function' ? onOrFn(s.sketchMode) : onOrFn 
  })),
  setMirrorX: (onOrFn: boolean | ((prev: boolean) => boolean)) => set(s => ({ 
    mirrorX: typeof onOrFn === 'function' ? onOrFn(s.mirrorX) : onOrFn 
  })),
  setBrushSize: (size) => set({ brushSize: size }),
  setTool: (tool) => set({ tool }),
  setActiveColorKey: (key) => set({ activeColorKey: key }),

  setCategory: (category) => set(state => ({
    editedAsset: { ...state.editedAsset, category },
    isDirty: true
  })),

  setDescription: (description) => set(state => ({
    editedAsset: { ...state.editedAsset, description },
    isDirty: true
  })),

  setTags: (tags) => set(state => ({
    editedAsset: { ...state.editedAsset, tags: normalizeTags(tags) },
    isDirty: true
  })),

  addTag: (tag) => set(state => {
    const newTag = normalizeTag(tag);
    if (!newTag) return state;
    const currentTags = state.editedAsset.tags || [];
    if (currentTags.includes(newTag)) return state;
    
    return {
      editedAsset: { ...state.editedAsset, tags: [...currentTags, newTag] },
      isDirty: true
    };
  }),

  removeTag: (tag) => set(state => ({
    editedAsset: {
      ...state.editedAsset,
      tags: (state.editedAsset.tags || []).filter(t => t !== tag)
    },
    isDirty: true
  })),

  // Meta actions
  handleSave: () => {
    const state = get();
    const result = state._onSave({ ...state.editedAsset, name: state.assetName });
    if (result instanceof Promise) {
      result.then(ok => { if (ok !== false) set({ isDirty: false }); }, () => {});
    } else if (result !== false) {
      set({ isDirty: false });
    }
  },

  handleClose: () => {
    const state = get();
    state._onOpenChange(false);
  },

  initFromAsset: (asset) => {
    // Note: ensureLayerSupport will be called in the composition factory
    set({
      assetName: asset.name,
      editingFrameIndex: 0,
      activePerspective: 'front',
      activeSide: 'right',
      showIsometricGrid: false,
      sketchMode: false,
      viewingAnimation: 'base',
      isDirty: false,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
  },

  createCheckpoint: (name?: string) => set(state => {
    const versions = state.editedAsset.versions || [];
    const assetCopy = JSON.parse(JSON.stringify(state.editedAsset));
    
    // CRITICAL: Clear versions in the copy to prevent exponential recursion
    assetCopy.versions = [];
    
    const newVersion = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      name: name || `Versión ${versions.length + 1}`,
      asset: assetCopy
    };
    
    const updatedVersions = [newVersion, ...versions].slice(0, 10);
    
    return {
      editedAsset: { ...state.editedAsset, versions: updatedVersions },
      isDirty: true
    };
  }),

  restoreCheckpoint: (versionId: string) => set(state => {
    const version = (state.editedAsset.versions || []).find((v: any) => v.id === versionId);
    if (!version) return state;
    
    return {
      editedAsset: { ...version.asset, versions: state.editedAsset.versions },
      isDirty: true,
      past: [],
      future: [],
    };
  }),

  clearHistory: () => set(state => {
    console.log('[History] Clearing all version checkpoints...');
    return {
      editedAsset: { ...state.editedAsset, versions: [] },
      isDirty: true
    };
  }),
});
