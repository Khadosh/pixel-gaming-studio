import { useEffect } from 'react';
import type { SpriteEditorStore } from '../store/useSpriteEditorStore';
import { selectFrameCount } from '../store/derived';
import { dims } from '@/headless/assetModel';

/**
 * Side-effects and keyboard shortcuts for the SpriteEditor.
 * Extracted from the old useSpriteEditor orchestrator hook.
 */
export function useEditorEffects(store: SpriteEditorStore) {
  // Clamp editingFrameIndex when frameCount changes
  useEffect(() => {
    const unsub = store.subscribe((state, prev) => {
      const frameCount = selectFrameCount(state);
      if (state.editingFrameIndex >= frameCount && frameCount > 0) {
        store.getState().setEditingFrameIndex(0);
      }
    });
    return unsub;
  }, [store]);

  // Reset state when a different asset is loaded (initialAsset.id changes)
  // This is handled by SpriteEditor.tsx via initFromAsset

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      const state = store.getState();
      const bridge = state._pixelEditorBridge;
      if (!bridge) return;

      switch (e.key.toLowerCase()) {
        case 'b': state.setTool('pencil'); break;
        case 'e': state.setTool('eraser'); break;
        case 'i': state.setTool('picker'); break;
        case 'g': state.setTool('fill'); break;
        case 'v':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.handlePaste();
          } else {
            state.setTool('select');
          }
          break;
        case 'r': state.setTool('rotate'); break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.handleSave();
          } else {
            state.setTool('select');
          }
          break;
        case 'm': state.setMirrorX((prev: boolean) => !prev); break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              state.redo();
            } else {
              state.undo();
            }
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.redo();
          }
          break;
        case 'c':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.handleCopy();
          }
          break;
        case 'o':
          state.setOnionSkin(!state.onionSkin);
          break;
        case 'escape':
          bridge.setSelectionRect(null);
          break;
        case 'backspace':
        case 'delete':
          if (state.tool === 'select' && bridge.selectionRect) {
            e.preventDefault();
            if (bridge.movingSelectionPixels) {
              bridge.clearFloatingPixels();
            } else {
              const baseFrame = state.editedAsset.layers!.find(l => l.id === state.activeLayerId)?.frames[state.editingFrameIndex];
              if (baseFrame) {
                const selRect = bridge.selectionRect;
                const newFrame = baseFrame.map(row => [...row]);
                for (let r = Math.round(selRect.r); r < Math.round(selRect.r + selRect.h); r++) {
                  for (let c = Math.round(selRect.c); c < Math.round(selRect.c + selRect.w); c++) {
                    if (r >= 0 && r < dims(state.editedAsset).height && c >= 0 && c < dims(state.editedAsset).width) {
                      newFrame[r][c] = 0;
                    }
                  }
                }
                bridge.overwriteLayerFrame(newFrame);
              }
            }
            bridge.setSelectionRect(null);
          }
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.setZoom((prev: number) => Math.min(prev + 0.1, 8));
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.setZoom((prev: number) => Math.max(prev - 0.1, 0.1));
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            state.setZoom(1.0);
          }
          break;
        case '[':
          e.preventDefault();
          state.setBrushSize(state.brushSize === 16 ? 4 : 1);
          break;
        case ']':
          e.preventDefault();
          state.setBrushSize(state.brushSize === 1 ? 4 : 16);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);
}
