import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Frame, SpriteAsset } from '@/lib/types';
import type { BrushSize } from '@/components/EditorToolbar';

import { shiftFrame, getCenterOfMass, rotateFrameFree, resizeFrameNearest, findBounds } from '@/lib/spriteTransforms';
import { compositeFrame } from '@/lib/layerUtils';
import { blankFrame, dims } from '@/headless/assetModel';

export type EditorTool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'circle' | 'rotate' | 'select' | 'erase-color';
export function usePixelEditor(
  asset: SpriteAsset,
  frameIndex: number,
  activeLayerId: string | null,
  onAssetChange: (a: SpriteAsset) => void,
  scope: 'layer' | 'frame' = 'layer',
  onPushUndo?: () => void,
  externalUndo?: () => void,
  externalCanUndo?: boolean,
  tool: EditorTool = 'pencil',
  setTool: (t: EditorTool) => void = () => {},
  activeColorKey: number = 1,
  setActiveColorKey: (k: number) => void = () => {},
  brushSize: BrushSize = 1,
  setBrushSize: (s: BrushSize) => void = () => {},
  mirrorX: boolean = false,
  setMirrorX: (on: boolean | ((p: boolean) => boolean)) => void = () => {}
) {
  const [draftFrame, setDraftFrame] = useState<Frame | null>(null);
  // The canvas can be wider than it is tall (a map ground is 448x224): columns
  // are bounded by the width and rows by the height, never both by `size`.
  const { width: cols, height: rows } = dims(asset);

  const [rotationAngle, setRotationAngle] = useState<number | null>(null);
  const [rotationCenter, setRotationCenter] = useState<{ r: number; c: number; activeLayerId?: string | null } | null>(null);
  const [initialRotationAngle, setInitialRotationAngle] = useState<number>(0);
  const [selectionRect, setSelectionRect] = useState<{ r: number; c: number; w: number; h: number } | null>(null);
  const [movingSelectionPixels, setMovingSelectionPixels] = useState<Frame | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<number | null>(null);

  const isDrawing = useRef(false);
  const strokeStart = useRef<{ r: number; c: number } | null>(null);
  
  // To avoid redundant frame copies during pencil strokes
  const strokeMutableFrame = useRef<Frame | null>(null);
  const originalMovingPixels = useRef<Frame | null>(null);
  const originalSelectionRect = useRef<{ r: number; c: number; w: number; h: number } | null>(null);

  const getActiveLayerFrame = useCallback(() => {
    if (!asset.layers || asset.layers.length === 0) return asset.frames?.[frameIndex] || null;
    const layer = asset.layers.find(l => l.id === activeLayerId) || asset.layers[0];
    return layer.frames[frameIndex] || null;
  }, [asset.layers, asset.frames, activeLayerId, frameIndex]);

  const updateActiveLayerFrame = useCallback((newFrame: Frame) => {
    if (!asset.layers || asset.layers.length === 0) {
      if (!asset.frames) return;
      const newFrames = [...asset.frames];
      newFrames[frameIndex] = newFrame;
      onAssetChange({ ...asset, frames: newFrames });
      return;
    }

    const newLayers = asset.layers!.map(l => {
      if (l.id === activeLayerId || (!activeLayerId && l === asset.layers![0])) {
        const newFrames = [...l.frames];
        newFrames[frameIndex] = newFrame;
        return { ...l, frames: newFrames };
      }
      return l;
    });
    onAssetChange({ ...asset, layers: newLayers });
  }, [asset, activeLayerId, frameIndex, onAssetChange]);

  const pushUndo = useCallback(() => {
    if (onPushUndo) {
      onPushUndo();
    }
  }, [onPushUndo]);

  const undo = useCallback(() => {
    if (externalUndo) externalUndo();
  }, [externalUndo]);

  const applyPixelsToFrame = (frame: Frame, pixels: {r: number, c: number, v: number}[]) => {
    for (const { r, c, v } of pixels) {
      if (r >= 0 && r < frame.length && c >= 0 && c < (frame[r]?.length ?? 0)) {
        frame[r][c] = v;
      }
    }
  };

  const getSymmetricPixels = (r: number, c: number, v: number) => {
    const res = [{ r, c, v }];
    if (mirrorX) {
      const symC = cols - 1 - c;
      if (symC !== c) res.push({ r, c: symC, v });
    }
    return res;
  };

  const expandBrush = (r: number, c: number, v: number) => {
    const side = brushSize === 1 ? 1 : brushSize === 4 ? 2 : 4;
    const pixels = [];
    for (let dr = 0; dr < side; dr++) {
      for (let dc = 0; dc < side; dc++) {
        pixels.push(...getSymmetricPixels(r + dr, c + dc, v));
      }
    }
    return pixels;
  };

  const getLinePixels = (r0: number, c0: number, r1: number, c1: number, v: number) => {
    const pixels: {r: number, c: number, v: number}[] = [];
    const dr = Math.abs(r1 - r0), sr = r0 < r1 ? 1 : -1;
    const dc = Math.abs(c1 - c0), sc = c0 < c1 ? 1 : -1;
    let err = (dc > dr ? dc : -dr) / 2, e2;

    let currR = r0, currC = c0;
    while (true) {
      pixels.push(...expandBrush(currR, currC, v));
      if (currR === r1 && currC === c1) break;
      e2 = err;
      if (e2 > -dc) { err -= dr; currC += sc; }
      if (e2 < dr) { err += dc; currR += sr; }
    }
    return pixels;
  };

  const getShapePixels = (type: string, sr: number, sc: number, cr: number, cc: number, v: number) => {
    if (type === 'line') return getLinePixels(sr, sc, cr, cc, v);
    
    const pixels: {r: number, c: number, v: number}[] = [];
    if (type === 'rect') {
      const minR = Math.min(sr, cr), maxR = Math.max(sr, cr);
      const minC = Math.min(sc, cc), maxC = Math.max(sc, cc);
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (r === minR || r === maxR || c === minC || c === maxC) {
            pixels.push(...expandBrush(r, c, v));
          }
        }
      }
    } else if (type === 'circle') {
      const radius = Math.max(Math.abs(cr - sr), Math.abs(cc - sc));
      for (let r = sr - radius; r <= sr + radius; r++) {
        for (let c = sc - radius; c <= sc + radius; c++) {
          const dist = Math.sqrt((r - sr)**2 + (c - sc)**2);
          if (Math.abs(dist - radius) < 0.5) {
            pixels.push(...expandBrush(r, c, v));
          }
        }
      }
    }
    return pixels;
  };

  const executeFloodFill = (startR: number, startC: number) => {
    const frame = getActiveLayerFrame();
    if (!frame) return;
    const targetColor = frame[startR][startC];
    const replacementColor = tool === 'eraser' ? 0 : activeColorKey;
    if (targetColor === replacementColor) return;

    const newFrame = frame.map(row => [...row]);
    const queue = [{ r: startR, c: startC }];
    
    while (queue.length > 0) {
      const { r, c } = queue.shift()!;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (newFrame[r][c] !== targetColor) continue;
      
      newFrame[r][c] = replacementColor;
      queue.push({ r: r + 1, c }, { r: r - 1, c }, { r, c: c + 1 }, { r, c: c - 1 });
    }

    updateActiveLayerFrame(newFrame);
  };

  const executeColorReplace = (startR: number, startC: number) => {
    const frame = getActiveLayerFrame();
    if (!frame) return;
    const targetColor = frame[startR][startC];
    if (targetColor === 0) return; // Already transparent

    const newFrame = frame.map(row => 
      row.map(p => (p === targetColor ? 0 : p))
    );

    updateActiveLayerFrame(newFrame);
  };

  const stampSelection = useCallback(() => {
    if (!movingSelectionPixels) return;
    const baseFrame = getActiveLayerFrame();
    if (!baseFrame) return;

    const mergedFrame = baseFrame.map((row, r) => 
      row.map((val, c) => {
        const floatingVal = movingSelectionPixels[r]?.[c] ?? 0;
        return floatingVal !== 0 ? floatingVal : val;
      })
    );
    
    // Check if anything actually changed to avoid redundant undos
    let changed = false;
    for (let r = 0; r < mergedFrame.length && !changed; r++) {
      for (let c = 0; c < mergedFrame[r].length; c++) {
        if (mergedFrame[r][c] !== baseFrame[r][c]) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      updateActiveLayerFrame(mergedFrame);
    }
    setMovingSelectionPixels(null);
  }, [movingSelectionPixels, getActiveLayerFrame, updateActiveLayerFrame]);

  const handlePointerDown = useCallback((floatR: number, floatC: number, forceTool?: EditorTool) => {
    const frame = getActiveLayerFrame();
    if (!frame) return;
    
    const r = Math.floor(floatR);
    const c = Math.floor(floatC);
    const activeTool = forceTool || tool;
    
    if (activeTool === 'rotate') {
      isDrawing.current = true;
      
      let center;
      if (selectionRect) {
        center = { r: selectionRect.r + selectionRect.h / 2, c: selectionRect.c + selectionRect.w / 2 };
        if (!movingSelectionPixels) {
          // Lift selection before rotating
          pushUndo();
          const newFrame = frame.map(row => [...row]);
          const liftedPixels = blankFrame(cols, rows);
          for (let ir = 0; ir < Math.round(selectionRect.h); ir++) {
            for (let ic = 0; ic < Math.round(selectionRect.w); ic++) {
              const fr = Math.round(selectionRect.r) + ir;
              const fc = Math.round(selectionRect.c) + ic;
              if (fr >= 0 && fr < rows && fc >= 0 && fc < cols) {
                liftedPixels[fr][fc] = frame[fr][fc];
                newFrame[fr][fc] = 0;
              }
            }
          }
          setMovingSelectionPixels(liftedPixels);
          updateActiveLayerFrame(newFrame);
        }
      } else {
        const baseFrame = scope === 'frame' ? compositeFrame(asset, frameIndex) : getActiveLayerFrame();
        center = (baseFrame ? getCenterOfMass(baseFrame) : null) || { r: rows / 2 - 0.5, c: cols / 2 - 0.5 };
      }

      setRotationCenter({ ...center, activeLayerId: scope === 'layer' ? activeLayerId : null });
      const angle = Math.atan2(floatR - center.r, floatC - center.c);
      setInitialRotationAngle(angle);
      setRotationAngle(0);

      const f = getActiveLayerFrame();
      if (f) strokeMutableFrame.current = f.map(row => [...row]);
      return;
    }

    if (activeTool === 'select') {
      // Check for handle clicks first (using floating point precision)
      if (selectionRect) {
        const threshold = 0.8; // larger threshold for easier handle grabbing
        const handles = [
          { r: selectionRect.r, c: selectionRect.c }, // 0: TL
          { r: selectionRect.r, c: selectionRect.c + selectionRect.w }, // 1: TR
          { r: selectionRect.r + selectionRect.h, c: selectionRect.c }, // 2: BL
          { r: selectionRect.r + selectionRect.h, c: selectionRect.c + selectionRect.w }, // 3: BR
          { r: selectionRect.r, c: selectionRect.c + selectionRect.w / 2 }, // 4: TM
          { r: selectionRect.r + selectionRect.h, c: selectionRect.c + selectionRect.w / 2 }, // 5: BM
          { r: selectionRect.r + selectionRect.h / 2, c: selectionRect.c }, // 6: LM
          { r: selectionRect.r + selectionRect.h / 2, c: selectionRect.c + selectionRect.w }, // 7: RM
        ];
        
        for (let i = 0; i < handles.length; i++) {
          if (Math.abs(floatR - handles[i].r) <= threshold && Math.abs(floatC - handles[i].c) <= threshold) {
            setDraggingHandle(i);
            isDrawing.current = true;
            strokeStart.current = { r: floatR, c: floatC };
            
            // AUTO-LIFT if not already lifted
            if (!movingSelectionPixels) {
              pushUndo();
              const newFrame = frame.map(row => [...row]);
              const liftedPixels = blankFrame(cols, rows);
              for (let ir = 0; ir < Math.round(selectionRect.h); ir++) {
                for (let ic = 0; ic < Math.round(selectionRect.w); ic++) {
                  const fr = Math.round(selectionRect.r) + ir;
                  const fc = Math.round(selectionRect.c) + ic;
                  if (fr >= 0 && fr < rows && fc >= 0 && fc < cols) {
                    liftedPixels[fr][fc] = frame[fr][fc];
                    newFrame[fr][fc] = 0;
                  }
                }
              }
              setMovingSelectionPixels(liftedPixels);
              updateActiveLayerFrame(newFrame);
              originalMovingPixels.current = liftedPixels;
            } else {
              originalMovingPixels.current = movingSelectionPixels.map(row => [...row]);
            }
            
            originalSelectionRect.current = { ...selectionRect };
            return;
          }
        }
      }

      // Check if clicking inside existing selection
      if (selectionRect && floatR >= selectionRect.r && floatR < selectionRect.r + selectionRect.h && floatC >= selectionRect.c && floatC < selectionRect.c + selectionRect.w) {
        // START MOVING SELECTION
        isDrawing.current = true;
        strokeStart.current = { r: floatR, c: floatC };
        
        if (!movingSelectionPixels) {
          pushUndo();
          const newFrame = frame.map(row => [...row]);
          const liftedPixels = blankFrame(cols, rows);
          
          for (let ir = 0; ir < Math.round(selectionRect.h); ir++) {
            for (let ic = 0; ic < Math.round(selectionRect.w); ic++) {
              const fr = Math.round(selectionRect.r) + ir;
              const fc = Math.round(selectionRect.c) + ic;
              if (fr >= 0 && fr < rows && fc >= 0 && fc < cols) {
                liftedPixels[fr][fc] = frame[fr][fc];
                newFrame[fr][fc] = 0; // Clear original
              }
            }
          }
          
          setMovingSelectionPixels(liftedPixels);
          updateActiveLayerFrame(newFrame); // Update frame with cleared area
          
          originalMovingPixels.current = liftedPixels;
          originalSelectionRect.current = { ...selectionRect };
        } else {
          originalMovingPixels.current = movingSelectionPixels.map(row => [...row]);
          originalSelectionRect.current = { ...selectionRect };
        }
      } else {
        // START NEW SELECTION
        if (movingSelectionPixels) {
           // Stamp before new selection
           stampSelection(); 
        }
        isDrawing.current = true;
        strokeStart.current = { r: floatR, c: floatC };
        setSelectionRect({ r: floatR, c: floatC, w: 0.1, h: 0.1 });
        setMovingSelectionPixels(null);
      }
      return;
    }

    if (activeTool === 'picker') {
      const colorId = frame[r][c];
      if (colorId !== 0) setActiveColorKey(colorId);
      return;
    }

    pushUndo();

    if (activeTool === 'fill') {
      executeFloodFill(r, c);
      return;
    }

    if (activeTool === 'erase-color') {
      executeColorReplace(r, c);
      return;
    }

    isDrawing.current = true;
    strokeStart.current = { r, c };

    const value = activeTool === 'eraser' ? 0 : activeColorKey;
    if (activeTool === 'pencil' || activeTool === 'eraser') {
      strokeMutableFrame.current = frame.map(row => [...row]);
      applyPixelsToFrame(strokeMutableFrame.current, expandBrush(r, c, value));
      updateActiveLayerFrame(strokeMutableFrame.current);
    } else {
      // Use -1 to represent 'empty/untouched draft space' since 0 is eraser transparency
      const emptyDraft = Array.from({ length: rows }, () => Array(cols).fill(-1));
      applyPixelsToFrame(emptyDraft, expandBrush(r, c, value));
      setDraftFrame(emptyDraft);
    }
  }, [tool, activeColorKey, asset, frameIndex, getActiveLayerFrame, updateActiveLayerFrame, brushSize, mirrorX, pushUndo, executeFloodFill, expandBrush, scope, selectionRect, movingSelectionPixels, stampSelection]);

  const handlePointerMove = useCallback((floatR: number, floatC: number, forceTool?: EditorTool) => {
    const activeTool = forceTool || tool;

    if (activeTool === 'rotate' && rotationCenter) {
      const currentAngle = Math.atan2(floatR - rotationCenter.r, floatC - rotationCenter.c);
      const diff = ((currentAngle - initialRotationAngle) * 180) / Math.PI;
      setRotationAngle(diff);
      return;
    }

    if (activeTool === 'select' && strokeStart.current) {
      const dr = floatR - strokeStart.current.r;
      const dc = floatC - strokeStart.current.c;

      if (draggingHandle !== null && originalSelectionRect.current && originalMovingPixels.current) {
        // RESIZE SELECTION
        let { r: nr, c: nc, w: nw, h: nh } = originalSelectionRect.current;

        if (draggingHandle === 0) { nr += dr; nc += dc; nw -= dc; nh -= dr; } // TL
        else if (draggingHandle === 1) { nr += dr; nw += dc; nh -= dr; } // TR
        else if (draggingHandle === 2) { nc += dc; nw -= dc; nh += dr; } // BL
        else if (draggingHandle === 3) { nw += dc; nh += dr; } // BR
        else if (draggingHandle === 4) { nr += dr; nh -= dr; } // TM
        else if (draggingHandle === 5) { nh += dr; } // BM
        else if (draggingHandle === 6) { nc += dc; nw -= dc; } // LM
        else if (draggingHandle === 7) { nw += dc; } // RM

        // Ensure minimum size
        if (nw < 0.1) nw = 0.1;
        if (nh < 0.1) nh = 0.1;

        setSelectionRect({ r: nr, c: nc, w: nw, h: nh });
        
        // Extract the selected snippet from original
        const oldRect = originalSelectionRect.current;
        const snippet = Array.from({ length: Math.round(oldRect.h) }, () => Array(Math.round(oldRect.w)).fill(0));
        for (let ir = 0; ir < snippet.length; ir++) {
          for (let ic = 0; ic < snippet[0].length; ic++) {
            const fr = Math.round(oldRect.r) + ir;
            const fc = Math.round(oldRect.c) + ic;
            if (fr >= 0 && fr < rows && fc >= 0 && fc < cols) {
              snippet[ir][ic] = originalMovingPixels.current[fr][fc];
            }
          }
        }
        
        // Scale it
        const scaled = resizeFrameNearest(snippet, Math.max(1, Math.round(nw)), Math.max(1, Math.round(nh)));
        
        // Embed back into a full frame
        const newFull = blankFrame(cols, rows);
        for (let ir = 0; ir < scaled.length; ir++) {
          for (let ic = 0; ic < scaled[0].length; ic++) {
            const tr = Math.round(nr) + ir;
            const tc = Math.round(nc) + ic;
            if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) {
              newFull[tr][tc] = scaled[ir][ic];
            }
          }
        }
        setMovingSelectionPixels(newFull);
      } else if (originalMovingPixels.current && originalSelectionRect.current) {
        // MOVE EXISTING SELECTION
        const shiftedPixels = shiftFrame(originalMovingPixels.current, Math.round(dr), Math.round(dc));
        setMovingSelectionPixels(shiftedPixels);
        setSelectionRect({ 
          ...originalSelectionRect.current, 
          r: originalSelectionRect.current.r + dr, 
          c: originalSelectionRect.current.c + dc 
        });
      } else {
        // DRAW NEW SELECTION RECT
        const minR = Math.min(strokeStart.current.r, floatR);
        const maxR = Math.max(strokeStart.current.r, floatR);
        const minC = Math.min(strokeStart.current.c, floatC);
        const maxC = Math.max(strokeStart.current.c, floatC);
        setSelectionRect({
          r: minR,
          c: minC,
          w: Math.max(0.1, maxC - minC),
          h: Math.max(0.1, maxR - minR)
        });
      }
      return;
    }

    const frame = getActiveLayerFrame();
    const r = Math.floor(floatR);
    const c = Math.floor(floatC);
    if (!isDrawing.current || !strokeStart.current || !frame) return;

    const value = activeTool === 'eraser' ? 0 : activeColorKey;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      if (strokeMutableFrame.current) {
        const startR = Math.floor(strokeStart.current.r);
        const startC = Math.floor(strokeStart.current.c);
        
        // Optimize: skip if we are in the same pixel
        if (startR === r && startC === c) return;

        applyPixelsToFrame(strokeMutableFrame.current, getLinePixels(startR, startC, r, c, value));
        strokeStart.current = { r: floatR, c: floatC }; 

        updateActiveLayerFrame([...strokeMutableFrame.current.map(row => [...row])]);
      }
    } else {
      const shapeDraft = Array.from({ length: rows }, () => Array(cols).fill(-1));
      const startR = Math.floor(strokeStart.current.r);
      const startC = Math.floor(strokeStart.current.c);
      const pixels = getShapePixels(activeTool as string, startR, startC, r, c, value);
      applyPixelsToFrame(shapeDraft, pixels);
      setDraftFrame(shapeDraft);
    }
  }, [
    tool, activeColorKey, cols, rows, getActiveLayerFrame, updateActiveLayerFrame, 
    brushSize, mirrorX, getLinePixels, getShapePixels, activeLayerId, scope, 
    rotationCenter, initialRotationAngle, selectionRect, movingSelectionPixels
  ]);


  const overwriteLayerFrame = useCallback((newFrame: Frame) => {
    pushUndo(); // Save current state before overwriting
    updateActiveLayerFrame(newFrame);
  }, [updateActiveLayerFrame, pushUndo]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current) return;

    if (tool === 'rotate' && rotationCenter && rotationAngle !== null) {
      if (selectionRect && movingSelectionPixels) {
        // Rotate the floating pixels
        const rotated = rotateFrameFree(movingSelectionPixels, rotationAngle, rotationCenter);
        setMovingSelectionPixels(rotated);
      } else {
        const initial = strokeMutableFrame.current;
        if (initial) {
          if (scope === 'layer') {
            overwriteLayerFrame(rotateFrameFree(initial, rotationAngle, rotationCenter));
          } else {
            // Rotate ALL layers
            pushUndo();
            onAssetChange({
              ...asset,
              layers: asset.layers!.map(l => {
                const newFrames = [...l.frames];
                newFrames[frameIndex] = rotateFrameFree(l.frames[frameIndex], rotationAngle, rotationCenter);
                return { ...l, frames: newFrames };
              })
            });
          }
        }
      }
      isDrawing.current = false;
      setRotationAngle(null);
      setRotationCenter(null);
      strokeMutableFrame.current = null;
      return;
    }

    if (tool === 'select') {
      if (!movingSelectionPixels && !draggingHandle && selectionRect && selectionRect.w < 0.1 && selectionRect.h < 0.1) {
        // Just a click outside? Deselect.
        setSelectionRect(null);
      }
      setDraggingHandle(null);
      originalMovingPixels.current = null;
      originalSelectionRect.current = null;
      isDrawing.current = false;
      strokeStart.current = null; // CRITICAL FIX
      return;
    }

    if ((tool === 'rect' || tool === 'circle' || tool === 'line') && draftFrame) {
      const baseFrame = getActiveLayerFrame();
      if (!baseFrame) return;
      
      const mergedFrame = baseFrame.map((row, rr) => 
        row.map((col, cc) => {
          const draftVal = draftFrame[rr]?.[cc] ?? -1;
          return draftVal !== -1 ? draftVal : col;
        })
      );
      updateActiveLayerFrame(mergedFrame);
      setDraftFrame(null);
    }
    
    isDrawing.current = false;
    strokeMutableFrame.current = null;
    strokeStart.current = null;
  }, [tool, draftFrame, getActiveLayerFrame, updateActiveLayerFrame, asset, frameIndex, onAssetChange, scope, overwriteLayerFrame, pushUndo, rotationAngle, rotationCenter, selectionRect, movingSelectionPixels, draggingHandle]);
  
  const handleSetTool = useCallback((newTool: EditorTool) => {
    if (newTool !== tool) {
      if (newTool !== 'select' && newTool !== 'rotate') {
        if (movingSelectionPixels) {
          stampSelection();
        }
        setSelectionRect(null);
      }
      setTool(newTool);
    }
  }, [tool, movingSelectionPixels, stampSelection]);

  return useMemo(() => ({
    tool, setTool: handleSetTool,
    activeColorKey, setActiveColorKey,
    brushSize, setBrushSize,
    mirrorX, setMirrorX,
    draftFrame,
    handlePointerDown, handlePointerMove, handlePointerUp,
    undo, pushUndo, canUndo: externalCanUndo || false,
    overwriteLayerFrame,
    rotationAngle,
    rotationCenter,
    selectionRect,
    setSelectionRect,
    movingSelectionPixels,
    stampSelection,
    clearFloatingPixels: () => setMovingSelectionPixels(null),
  }), [
    tool, handleSetTool,
    activeColorKey, setActiveColorKey,
    brushSize, setBrushSize,
    mirrorX, setMirrorX,
    draftFrame,
    handlePointerDown, handlePointerMove, handlePointerUp,
    undo, pushUndo, externalCanUndo,
    overwriteLayerFrame,
    rotationAngle,
    rotationCenter,
    selectionRect,
    setSelectionRect,
    movingSelectionPixels,
    stampSelection
  ]);
}
