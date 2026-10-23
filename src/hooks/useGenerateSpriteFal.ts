import { useState } from 'react';
import type { SpriteAsset } from '@/lib/types';
import type { ProjectConfig } from '@/lib/supabase';
import { ensureLayerSupport } from '@/lib/layerUtils';
import { useAuth } from '@/hooks/useAuth';
import { useOptionalSpriteEditorStoreApi } from '@/components/SpriteEditor/context/SpriteEditorContext';
import { invokeAiFunction, pixelizeImageUrl } from '@/lib/aiFunctions';

interface GenerateState {
  isGenerating: boolean;
  error: string | null;
  result: SpriteAsset | null;
}

export function useGenerateSpriteFal() {
  const { session } = useAuth();

  // Null fuera del editor (por ejemplo en ProjectWorkspace): se usa la paleta/config de `options`.
  const storeApi = useOptionalSpriteEditorStoreApi();

  const [state, setState] = useState<GenerateState>({
    isGenerating: false,
    error: null,
    result: null,
  });

  const generate = async (
    prompt: string,
    size: number = 64,
    referenceImageUrl?: string,
    options?: {
      strength?: number;
      maxColors?: number;
      projectConfig?: ProjectConfig;
      /** De qué tipo es el asset que sale (default: personaje). */
      category?: SpriteAsset['category'];
      /** Paleta a sugerirle al modelo fuera del editor (la del proyecto). */
      palette?: Record<number, string>;
    }
  ) => {
    setState({ isGenerating: true, error: null, result: null });

    const currentPalette = storeApi ? storeApi.getState().editedAsset.palette : (options?.palette ?? null);
    const projectConfig = storeApi ? storeApi.getState().projectConfig : options?.projectConfig;

    try {
      // Step 1: Call Edge Function
      const { imageUrl } = await invokeAiFunction<{ imageUrl: string }>('generate-sprite-fal', {
        prompt,
        size,
        image_url: referenceImageUrl,
        palette: currentPalette,
        strength: options?.strength ?? 0.75,
        maxColors: options?.maxColors ?? 24,
        projectConfig,
      }, session);

      // Step 2: Load the image and pixelize it
      const pixelizedData = await pixelizeImageUrl(imageUrl, size, options?.maxColors ?? 24);

      const cleanName = prompt
        .replace(/front view of a (character|creature|object|environment|effect),\s*/i, '')
        .split(',')[0]
        .trim();

      const sprite: SpriteAsset = {
        id: crypto.randomUUID(),
        name: cleanName.slice(0, 40) || 'AI Generated',
        description: prompt,
        category: options?.category ?? 'character',
        size,
        palette: pixelizedData.palette,
        colorNames: pixelizedData.colorNames,
        frames: [pixelizedData.frame],
        animations: [],
      };

      const finalSprite = ensureLayerSupport(sprite);
      setState({ isGenerating: false, error: null, result: finalSprite });
      return finalSprite;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error generating sprite with Fal';
      setState({ isGenerating: false, error: message, result: null });
      return null;
    }
  };

  const clear = () => {
    setState({ isGenerating: false, error: null, result: null });
  };

  return { ...state, generate, clear };
}
