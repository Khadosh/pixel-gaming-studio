import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { PaletteProvider } from '@/hooks/usePalette';
import SpriteSheetCanvas from '@/components/SpriteSheetCanvas';
import { Button } from '@/components/ui/button';
import { PxX } from '@/components/icons/PixelIcon';

interface StudioSheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StudioSheetModal: React.FC<StudioSheetModalProps> = ({ open, onOpenChange }) => {
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const setEditingFrameIndex = useSpriteEditorStore(s => s.setEditingFrameIndex);
  const setViewingAnimation = useSpriteEditorStore(s => s.setViewingAnimation);

  const handleFrameClick = (animName: string, frameIndex: number) => {
    setViewingAnimation(animName);
    setEditingFrameIndex(frameIndex);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col p-6 bg-background border-border">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border">
          <div>
            <DialogTitle className="nube-titulo text-primary uppercase">Master Spritesheet Preview</DialogTitle>
            <p className="nube-etiqueta text-muted-foreground uppercase mt-1">Inspección de cohesión y flujo de animación</p>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto custom-scrollbar p-4 bg-secondary/5 rounded-lg border border-border/50 mt-4">
          <PaletteProvider defaultPalette={editedAsset.palette}>
            <div className="space-y-8">
              {/* Animation Rows */}
              {['VIEWS', ...editedAsset.animations.map(a => a.name)].map((animName) => {
                const anim = editedAsset.animations.find(a => a.name === animName);
                const frameIndices = animName === 'VIEWS' 
                  ? [0, 1, 2, 3].filter(idx => idx < (editedAsset.layers?.[0]?.frames.length || 0))
                  : (anim ? anim.frameIndices : [0]);
                
                return (
                  <div key={animName} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="nube-etiqueta text-primary/60 uppercase">{animName}</span>
                      <div className="h-[1px] flex-1 bg-border/30" />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {frameIndices.map((fIdx, i) => (
                        <div 
                          key={`${animName}-${i}`}
                          onClick={() => handleFrameClick(animName, fIdx)}
                          className="group relative cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all rounded-md overflow-hidden bg-pixel-grid"
                        >
                          <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                            <span className="nube-etiqueta text-primary drop-shadow-md">EDIT</span>
                          </div>
                          <div className="p-1">
                             <SpriteSheetCanvas 
                              asset={editedAsset} 
                              scale={3} 
                              showLabels={false}
                              transparent={true}
                              frameIndex={fIdx}
                             />
                          </div>
                          <div className="nube-etiqueta bg-secondary/40 py-0.5 px-1 text-center border-t border-border/20">
                            Frame {fIdx}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </PaletteProvider>
        </div>

        <div className="pt-4 flex justify-end">
          <p className="nube-etiqueta text-muted-foreground">
            * Haz click en cualquier frame para saltar directamente a editarlo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
