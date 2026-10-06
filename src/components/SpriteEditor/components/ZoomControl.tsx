import React from 'react';
import { PxMinus, PxPlus, PxResetRotate } from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ZoomControl: React.FC = () => {
  const zoom = useSpriteEditorStore(s => s.zoom);
  const setZoom = useSpriteEditorStore(s => s.setZoom);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 8));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.1));
  const handleReset = () => setZoom(1.0);

  const percentage = Math.round(zoom * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 p-1.5 rounded-full shadow-2xl z-50 transition-all hover:bg-black/70 group">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              <PxMinus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="nube-cuerpo border-border">Zoom Out (Ctrl -)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleReset}
              className="px-2 min-w-[64px] nube-cuerpo-apretado text-white/90 hover:text-primary transition-colors text-center"
            >
              {percentage}%
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="nube-cuerpo border-border">Reset Zoom (Ctrl 0)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              <PxPlus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="nube-cuerpo border-border">Zoom In (Ctrl +)</TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-white/10 mx-1 group-hover:bg-white/20 transition-colors" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleReset}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              <PxResetRotate size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="nube-cuerpo border-border">Reset Zoom</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
