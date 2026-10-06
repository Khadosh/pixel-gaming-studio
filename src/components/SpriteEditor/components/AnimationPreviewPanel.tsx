import React, { forwardRef, useImperativeHandle } from 'react';
import { PxPlay, PxPause, PxPlus, PxMinus } from '@/components/icons/PixelIcon';
import { useAssetPreview } from '@/hooks/useAssetPreview';
import SpritePreview from '@/components/SpritePreview';
import { PaletteProvider } from '@/hooks/usePalette';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { dims } from '@/headless/assetModel';

export interface AnimationPreviewPanelHandle {
  setIsPlaying: (playing: boolean) => void;
}

export type PreviewSize = 'small' | 'medium' | 'large';

export const AnimationPreviewPanel = React.memo(forwardRef<AnimationPreviewPanelHandle, object>(
  (_, ref) => {
    const editedAsset = useSpriteEditorStore(s => s.editedAsset);
    const viewingAnimation = useSpriteEditorStore(s => s.viewingAnimation);
    const editingFrameIndex = useSpriteEditorStore(s => s.editingFrameIndex);
    const { currentFrame, isPlaying, setIsPlaying, fps, setFps } = useAssetPreview(editedAsset, viewingAnimation, editingFrameIndex);

    const [size, setSize] = React.useState<PreviewSize>(() => {
      try {
        return (localStorage.getItem('pps-preview-size') as PreviewSize) || 'medium';
      } catch {
        return 'medium';
      }
    });

    const cycleSize = React.useCallback(() => {
      setSize(prev => {
        let next: PreviewSize = 'medium';
        if (prev === 'small') next = 'medium';
        else if (prev === 'medium') next = 'large';
        else if (prev === 'large') next = 'small';

        try { localStorage.setItem('pps-preview-size', next); } catch { /* localStorage no disponible */ }
        return next;
      });
    }, []);

    useImperativeHandle(ref, () => ({
      setIsPlaying,
    }), [setIsPlaying]);

    const { width: assetWidth, height: assetHeight } = dims(editedAsset);

    // Calculate scaling based on size
    const getScale = () => {
      // Use target visual sizes (80, 180, 320) but ensure integer scaling
      // and at least 1x to avoid 0 scale on large assets. The longest side is
      // what has to fit, so a 512x320 drawing is not cropped.
      const target = size === 'small' ? 80 : size === 'medium' ? 180 : 320;
      return Math.max(1, Math.floor(target / Math.max(1, assetWidth, assetHeight)));
    };

    const scale = getScale();
    const canvasWidth = assetWidth * scale;
    const canvasHeight = assetHeight * scale;
    const isSmall = size === 'small';
    const isLarge = size === 'large';
    // A square canvas keeps the old square preview box untouched; a non-square
    // one gets a box its exact shape so nothing is cropped.
    const isSquare = assetWidth === assetHeight;

    // Calculate container dimensions to fit the canvas + padding exactly (hug content)
    const padding = isSmall ? 4 : 16;
    const panelWidth = canvasWidth + padding;

    return (
      <div
        className={`flex flex-col transition-all duration-300 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto origin-bottom-right ${isSmall ? 'p-0.5 gap-0' : 'p-2 gap-2'
          }`}
        style={{
          width: `${panelWidth}px`,
          minWidth: isSmall ? '80px' : isLarge ? '280px' : '160px'
        }}
      >
        {/* PREVIEW AREA */}
        <div
          className={`flex items-center justify-center bg-black/40 rounded-lg relative overflow-hidden group cursor-pointer border border-white/5 ${isSquare ? 'aspect-square' : ''}`}
          style={isSquare ? undefined : { width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
          onClick={isSmall ? cycleSize : undefined}
        >
          <PaletteProvider defaultPalette={editedAsset.palette}>
            <SpritePreview
              asset={editedAsset}
              animationName={viewingAnimation}
              scale={scale}
              showLabel={false}
              currentFrameOverride={currentFrame}
            />
          </PaletteProvider>

          {/* Size Indicator */}
          {!isSmall && (
            <div className="absolute top-1 left-1 flex items-center gap-1 px-1 py-0.5 rounded bg-black/80 border border-white/10 pointer-events-none">
              <span className="font-mono text-[8px] text-primary/80">{scale}x</span>
            </div>
          )}

          {/* Controls Toggle Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              cycleSize();
            }}
            className={`absolute top-1 right-1 p-1 rounded-md bg-black/80 border border-white/10 text-white/40 hover:text-primary hover:border-primary/50 transition-all ${isSmall ? 'opacity-0 group-hover:opacity-100 scale-75' : 'opacity-100'
              }`}
            title="Cambiar tamaño"
          >
            {isSmall ? <PxPlus size={10} /> : isLarge ? <PxMinus size={12} /> : <PxPlus size={12} />}
          </button>
        </div>

        {/* CONTROLS (Hidden in small mode) */}
        {!isSmall && (
          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex-1 flex items-center justify-center h-8 rounded-lg border transition-all active:scale-95 ${isPlaying
                ? 'bg-primary/20 text-primary border-primary/40 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10'
                }`}
            >
              {isPlaying ? <PxPause size={14} /> : <PxPlay size={14} />}
              {isLarge && <span className="ml-1.5 font-pixel text-[7px] uppercase tracking-widest">{isPlaying ? 'PAUSA' : 'PLAY'}</span>}
            </button>

            <div className="flex items-center gap-2 bg-black/40 rounded-lg px-2 h-8 border border-white/5">
              <div className="flex flex-col items-center leading-none">
                <span className="font-mono text-[10px] font-bold text-primary">{fps}</span>
                <span className="font-pixel text-[5px] text-muted-foreground uppercase opacity-30">fps</span>
              </div>
              <div className="flex flex-col -gap-1">
                <button onClick={() => setFps(Math.min(24, fps + 1))} className="text-muted-foreground hover:text-primary transition-colors p-0.5"><PxPlus size={6} /></button>
                <button onClick={() => setFps(Math.max(1, fps - 1))} className="text-muted-foreground hover:text-primary transition-colors p-0.5"><PxMinus size={6} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
));

AnimationPreviewPanel.displayName = 'AnimationPreviewPanel';
