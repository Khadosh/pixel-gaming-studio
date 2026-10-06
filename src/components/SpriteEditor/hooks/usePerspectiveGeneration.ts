import { useCallback } from 'react';
import { useGeneratePerspectiveAI } from '@/hooks/useGeneratePerspectiveAI';
import { frameToDataUrl } from '@/lib/layerUtils';
import { SpriteEditorStore } from '../store/useSpriteEditorStore';
import { dims } from '@/headless/assetModel';

export function usePerspectiveGenerationBridge(store: SpriteEditorStore) {
  const { generate, isGenerating, error } = useGeneratePerspectiveAI();

  const handleGeneratePerspectiveAI = useCallback(async () => {
    const state = store.getState();
    const { editedAsset, activePerspective, activeSide } = state;
    
    // 1. Get the Front Frame as reference
    const frontFrame = editedAsset.layers![0].frames[0];
    const referenceImageUrl = frameToDataUrl(frontFrame, editedAsset.palette, dims(editedAsset).width, 16, dims(editedAsset).height);

    // 2. Determine target index and prompt based on perspective
    let perspectiveName = 'side view';
    if (activePerspective === 'back') perspectiveName = 'back view';
    else if (activePerspective === 'side' && activeSide === 'left') perspectiveName = 'left side view';
    else if (activePerspective === 'side') perspectiveName = 'right side view';

    const prompt = `Professional pixel art sprite of ${perspectiveName} of the character from the reference image, matching exactly the same design, style and outfit.`;

    state.setIsAnimGenerating(true);
    state.setAnimError(null);

    try {
      // Pass size and reference image with fixed palette to force consistency
      const result = await generate(prompt, editedAsset.size, referenceImageUrl, {
        strength: 0.6,
        maxColors: 32,
        fixedPalette: editedAsset.palette,
        projectConfig: state.projectConfig
      });
      
      if (result && result.frame) {
        state.pushUndo();
        state.setEditedAsset(prev => {
          // Since we used fixedPalette in generate(), result.frame already uses prev.palette indices
          const newLayers = prev.layers!.map((layer, lIdx) => {
            const newFrames = [...layer.frames];
            if (lIdx === 0) {
              newFrames[state.editingFrameIndex] = result.frame;
            }
            return { ...layer, frames: newFrames };
          });
          
          return { 
            ...prev, 
            layers: newLayers
          };
        });
        
        state.setIsDirty(true);
      }
    } catch (err: any) {
      state.setAnimError(err.message);
    } finally {
      state.setIsAnimGenerating(false);
    }
  }, [store, generate]);

  const handleDownloadReferenceImage = useCallback(() => {
    const state = store.getState();
    const { editedAsset } = state;
    const frontFrame = editedAsset.layers![0].frames[0];
    const dataUrl = frameToDataUrl(frontFrame, editedAsset.palette, dims(editedAsset).width, 16, dims(editedAsset).height);
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `debug-reference-${editedAsset.name || 'sprite'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [store]);

  return {
    handleGeneratePerspectiveAI,
    handleDownloadReferenceImage,
    isGenerating,
    error
  };
}
