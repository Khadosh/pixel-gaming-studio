import { SpriteEditorState, StoreSlice } from '../types';
import { stringifyAsset } from '@/lib/assetJson';
import { exportAsPNG, exportAsGIF, exportLayerAsPNG } from '../../utils/exportUtils';

export const createExportSlice: StoreSlice<Partial<SpriteEditorState>> = (set, get) => ({
  handleExportPNG: (options) => {
    const state = get();
    exportAsPNG(state.editedAsset, options);
  },

  handleExportLayerPNG: () => {
    const state = get();
    const layer = (state.editedAsset.layers || []).find(l => l.id === state.activeLayerId);
    if (!layer) {
      alert('No hay un layer activo para exportar.');
      return;
    }
    exportLayerAsPNG(state.editedAsset, layer, state.editingFrameIndex);
  },

  handleExportGIF: async () => {
    const state = get();
    const anim = (state.editedAsset.animations || []).find(a => a.name === state.viewingAnimation);
    const fps = anim?.fps || 10;
    await exportAsGIF(state.editedAsset, state.viewingAnimation, fps);
  },

  handleExportJSON: () => {
    const state = get();
    const json = stringifyAsset(state.editedAsset);
    navigator.clipboard.writeText(json).then(() => {
      alert('Asset JSON copiado al portapapeles (DEBUG)');
    }).catch(err => {
      console.error('Error al copiar JSON:', err);
    });
  },
  
  handleExportIcon: () => {
    const state = get();
    const iconId = state.iconId || 'new_icon';
    // Get first frame of first layer
    const matrix = state.editedAsset.layers?.[0]?.frames?.[0];
    if (!matrix) {
      alert('No hay un frame para exportar como icono.');
      return;
    }
    
    // Format as a proper JS array string
    const matrixStr = JSON.stringify(matrix)
      .replace(/\],\[/g, '],\n    [')
      .replace('[[', '[\n    [')
      .replace(']]', ']\n  ]');
      
    const code = `  ${iconId}: ${matrixStr},`;
    
    navigator.clipboard.writeText(code).then(() => {
      alert(`Datos del icono '${iconId}' copiados al portapapeles.\n\nEl dibujo manda: pasá los cambios a art/iconos/<id>.txt y corré "npm run icons".`);
    }).catch(err => {
      console.error('Error al copiar datos del icono:', err);
    });
  },
});
