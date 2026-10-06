import type { SpriteAsset } from '@/lib/types';
import { SpriteEditorState, StoreSlice } from '../types';
import { flipHorizontal, flipVertical, rotate90 } from '@/lib/spriteTransforms';
import { dims } from '@/headless/assetModel';
import { fitFrame } from '@/lib/layerUtils';

/**
 * A whole frame turned 90 degrees and put back on the asset's canvas. rotate90
 * swaps the dimensions, so on a canvas that is not square the turned frame is
 * centered and cropped instead of changing the shape of the layer.
 */
function rotateOnCanvas(frame: number[][], asset: SpriteAsset): number[][] {
  const { width, height } = dims(asset);
  const turned = rotate90(frame);
  return turned.length === height && turned[0]?.length === width ? turned : fitFrame(turned, width, height);
}

export const createTransformSlice: StoreSlice<Partial<SpriteEditorState>> = (set, get) => ({
  handleCopy: () => {
    const state = get();
    const bridge = state._pixelEditorBridge;
    const selectionRect = bridge?.selectionRect || null;

    if (state.scope === 'layer') {
      const frame = state.editedAsset.layers!.find(l => l.id === state.activeLayerId)?.frames[state.editingFrameIndex];
      if (frame) {
        if (selectionRect) {
          const rectH = Math.round(selectionRect.h);
          const rectW = Math.round(selectionRect.w);
          const rectR = Math.round(selectionRect.r);
          const rectC = Math.round(selectionRect.c);
          
          const clip: number[][] = Array.from({ length: rectH }, () => Array(rectW).fill(0));
          for (let ir = 0; ir < rectH; ir++) {
            for (let ic = 0; ic < rectW; ic++) {
              const r = rectR + ir;
              const c = rectC + ic;
              if (r >= 0 && r < dims(state.editedAsset).height && c >= 0 && c < dims(state.editedAsset).width) {
                clip[ir][ic] = frame[r][c];
              }
            }
          }
          set({ layerClipboard: clip });
        } else {
          set({ layerClipboard: frame.map(r => [...r]) });
        }
      }
    } else {
      const clipboard: Record<string, number[][]> = {};
      state.editedAsset.layers!.forEach(l => {
        const f = l.frames[state.editingFrameIndex];
        if (selectionRect) {
          const rectH = Math.round(selectionRect.h);
          const rectW = Math.round(selectionRect.w);
          const rectR = Math.round(selectionRect.r);
          const rectC = Math.round(selectionRect.c);

          const clip: number[][] = Array.from({ length: rectH }, () => Array(rectW).fill(0));
          for (let ir = 0; ir < rectH; ir++) {
            for (let ic = 0; ic < rectW; ic++) {
              const r = rectR + ir;
              const c = rectC + ic;
              if (r >= 0 && r < dims(state.editedAsset).height && c >= 0 && c < dims(state.editedAsset).width) {
                clip[ir][ic] = f[r][c];
              }
            }
          }
          clipboard[l.id] = clip;
        } else {
          clipboard[l.id] = f.map(r => [...r]);
        }
      });
      set({ frameClipboard: clipboard });
    }
  },

  handlePaste: () => {
    const state = get();
    const bridge = state._pixelEditorBridge;
    const selectionRect = bridge?.selectionRect || null;
    const { width, height } = dims(state.editedAsset);
    const destR = Math.round(selectionRect?.r || 0);
    const destC = Math.round(selectionRect?.c || 0);

    if (state.scope === 'layer') {
      if (state.layerClipboard) {
        const baseFrame = state.editedAsset.layers!.find(l => l.id === state.activeLayerId)?.frames[state.editingFrameIndex];
        if (baseFrame && bridge) {
          const newFrame = baseFrame.map(row => [...row]);
          const clipH = state.layerClipboard.length;
          const clipW = state.layerClipboard[0].length;
          for (let r = 0; r < clipH; r++) {
            for (let c = 0; c < clipW; c++) {
              const tr = destR + r;
              const tc = destC + c;
              if (tr >= 0 && tr < height && tc >= 0 && tc < width) {
                const val = state.layerClipboard[r][c];
                if (val !== 0) newFrame[tr][tc] = val;
              }
            }
          }
          bridge.overwriteLayerFrame(newFrame);
        }
      }
    } else {
      if (state.frameClipboard) {
        set(s => ({
          editedAsset: {
            ...s.editedAsset,
            layers: s.editedAsset.layers!.map(l => {
              const clip = s.frameClipboard![l.id];
              if (clip) {
                const newFrames = [...l.frames];
                const baseF = l.frames[s.editingFrameIndex];
                const newF = baseF.map(row => [...row]);
                const clipH = clip.length;
                const clipW = clip[0].length;
                for (let r = 0; r < clipH; r++) {
                  for (let c = 0; c < clipW; c++) {
                    const tr = destR + r;
                    const tc = destC + c;
                    if (tr >= 0 && tr < height && tc >= 0 && tc < width) {
                      const val = clip[r][c];
                      if (val !== 0) newF[tr][tc] = val;
                    }
                  }
                }
                newFrames[s.editingFrameIndex] = newF;
                return { ...l, frames: newFrames };
              }
              return l;
            }),
          },
        }));
      }
    }
  },

  handleFlipH: () => {
    const state = get();
    const bridge = state._pixelEditorBridge;
    const selectionRect = bridge?.selectionRect || null;

    if (state.scope === 'layer') {
      const frame = state.editedAsset.layers!.find(l => l.id === state.activeLayerId)?.frames[state.editingFrameIndex];
      if (!frame || !bridge) return;

      if (selectionRect) {
        const rectH = Math.round(selectionRect.h);
        const rectW = Math.round(selectionRect.w);
        const rectR = Math.round(selectionRect.r);
        const rectC = Math.round(selectionRect.c);

        const newFrame = frame.map(row => [...row]);
        const snippet: number[][] = Array.from({ length: rectH }, () => Array(rectW).fill(0));
        for (let r = 0; r < rectH; r++) {
          for (let c = 0; c < rectW; c++) snippet[r][c] = frame[rectR + r][rectC + c];
        }
        const flipped = snippet.map(row => [...row].reverse());
        for (let r = 0; r < rectH; r++) {
          for (let c = 0; c < rectW; c++) newFrame[rectR + r][rectC + c] = flipped[r][c];
        }
        bridge.overwriteLayerFrame(newFrame);
      } else {
        bridge.overwriteLayerFrame(flipHorizontal(frame));
      }
    } else {
      set(s => ({
        editedAsset: {
          ...s.editedAsset,
          layers: s.editedAsset.layers!.map(l => {
            const frame = l.frames[s.editingFrameIndex];
            const newFrames = [...l.frames];
            if (selectionRect) {
              const rectH = Math.round(selectionRect.h);
              const rectW = Math.round(selectionRect.w);
              const rectR = Math.round(selectionRect.r);
              const rectC = Math.round(selectionRect.c);

              const newF = frame.map(row => [...row]);
              const snippet = Array.from({ length: rectH }, () => Array(rectW).fill(0));
              for (let r = 0; r < rectH; r++) {
                for (let c = 0; c < rectW; c++) snippet[r][c] = frame[rectR + r][rectC + c];
              }
              const flipped = snippet.map(row => [...row].reverse());
              for (let r = 0; r < rectH; r++) {
                for (let c = 0; c < rectW; c++) newF[rectR + r][rectC + c] = flipped[r][c];
              }
              newFrames[s.editingFrameIndex] = newF;
            } else {
              newFrames[s.editingFrameIndex] = flipHorizontal(frame);
            }
            return { ...l, frames: newFrames };
          }),
        },
      }));
    }
  },

  handleFlipV: () => {
    const state = get();
    const bridge = state._pixelEditorBridge;
    const selectionRect = bridge?.selectionRect || null;

    if (state.scope === 'layer') {
      const frame = state.editedAsset.layers!.find(l => l.id === state.activeLayerId)?.frames[state.editingFrameIndex];
      if (!frame || !bridge) return;

      if (selectionRect) {
        const newFrame = frame.map(row => [...row]);
        const snippet: number[][] = Array.from({ length: selectionRect.h }, () => Array(selectionRect.w).fill(0));
        for (let r = 0; r < selectionRect.h; r++) {
          for (let c = 0; c < selectionRect.w; c++) snippet[r][c] = frame[selectionRect.r + r][selectionRect.c + c];
        }
        const flipped = [...snippet].reverse();
        for (let r = 0; r < selectionRect.h; r++) {
          for (let c = 0; c < selectionRect.w; c++) newFrame[selectionRect.r + r][selectionRect.c + c] = flipped[r][c];
        }
        bridge.overwriteLayerFrame(newFrame);
      } else {
        bridge.overwriteLayerFrame(flipVertical(frame));
      }
    } else {
      set(s => ({
        editedAsset: {
          ...s.editedAsset,
          layers: s.editedAsset.layers!.map(l => {
            const frame = l.frames[s.editingFrameIndex];
            const newFrames = [...l.frames];
            if (selectionRect) {
              const rectH = Math.round(selectionRect.h);
              const rectW = Math.round(selectionRect.w);
              const rectR = Math.round(selectionRect.r);
              const rectC = Math.round(selectionRect.c);

              const newF = frame.map(row => [...row]);
              const snippet = Array.from({ length: rectH }, () => Array(rectW).fill(0));
              for (let r = 0; r < rectH; r++) {
                for (let c = 0; c < rectW; c++) snippet[r][c] = frame[rectR + r][rectC + c];
              }
              const flipped = [...snippet].reverse();
              for (let r = 0; r < rectH; r++) {
                for (let c = 0; c < rectW; c++) newF[rectR + r][rectC + c] = flipped[r][c];
              }
              newFrames[s.editingFrameIndex] = newF;
            } else {
              newFrames[s.editingFrameIndex] = flipVertical(frame);
            }
            return { ...l, frames: newFrames };
          }),
        },
      }));
    }
  },

  handleRotate: () => {
    const state = get();
    const bridge = state._pixelEditorBridge;
    const selectionRect = bridge?.selectionRect || null;

    if (state.scope === 'layer') {
      const frame = state.editedAsset.layers!.find(l => l.id === state.activeLayerId)?.frames[state.editingFrameIndex];
      if (!frame || !bridge) return;

      if (selectionRect) {
        const rectH = Math.round(selectionRect.h);
        const rectW = Math.round(selectionRect.w);
        const rectR = Math.round(selectionRect.r);
        const rectC = Math.round(selectionRect.c);

        const snippet: number[][] = Array.from({ length: rectH }, () => Array(rectW).fill(0));
        for (let r = 0; r < rectH; r++) {
          for (let c = 0; c < rectW; c++) snippet[r][c] = frame[rectR + r][rectC + c];
        }
        const rotated = rotate90(snippet);
        const newFrame = frame.map(row => [...row]);
        for (let r = 0; r < rectH; r++) {
          for (let c = 0; c < rectW; c++) newFrame[rectR + r][rectC + c] = 0;
        }
        const newH = rotated.length;
        const newW = rotated[0].length;
        for (let r = 0; r < newH; r++) {
          for (let c = 0; c < newW; c++) {
            const tr = rectR + r;
            const tc = rectC + c;
            if (tr >= 0 && tr < dims(state.editedAsset).height && tc >= 0 && tc < dims(state.editedAsset).width) newFrame[tr][tc] = rotated[r][c];
          }
        }
        bridge.overwriteLayerFrame(newFrame);
      } else {
        bridge.overwriteLayerFrame(rotateOnCanvas(frame, state.editedAsset));
      }
    } else {
      set(s => ({
        editedAsset: {
          ...s.editedAsset,
          layers: s.editedAsset.layers!.map(l => {
            const frame = l.frames[s.editingFrameIndex];
            const newFrames = [...l.frames];
            if (selectionRect) {
              const rectH = Math.round(selectionRect.h);
              const rectW = Math.round(selectionRect.w);
              const rectR = Math.round(selectionRect.r);
              const rectC = Math.round(selectionRect.c);

              const newF = frame.map(row => [...row]);
              const snippet = Array.from({ length: rectH }, () => Array(rectW).fill(0));
              for (let r = 0; r < rectH; r++) {
                for (let c = 0; c < rectW; c++) snippet[r][c] = frame[rectR + r][rectC + c];
              }
              const rotated = rotate90(snippet);
              for (let r = 0; r < rectH; r++) {
                for (let c = 0; c < rectW; c++) newF[rectR + r][rectC + c] = 0;
              }
              const newH = rotated.length;
              const newW = rotated[0].length;
              for (let r = 0; r < newH; r++) {
                for (let c = 0; c < newW; c++) {
                  const tr = rectR + r;
                  const tc = rectC + c;
                  if (tr >= 0 && tr < dims(s.editedAsset).height && tc >= 0 && tc < dims(s.editedAsset).width) newF[tr][tc] = rotated[r][c];
                }
              }
              newFrames[s.editingFrameIndex] = newF;
            } else {
              newFrames[s.editingFrameIndex] = rotateOnCanvas(frame, s.editedAsset);
            }
            return { ...l, frames: newFrames };
          }),
        },
      }));
    }
  },
});
