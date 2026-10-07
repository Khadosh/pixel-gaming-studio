import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  PxImage, 
  PxLayers, 
  PxCheck, 
  PxTrash,
  PxChevronRight
} from '@/components/icons/PixelIcon';
import { imageToPixelData, PixelizeResult } from '@/lib/imageToPixelData';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { PALETTE_LIBRARY } from '@/lib/assets/palettes';
import { AVAILABLE_ANIMS } from '../types';
import { DecodedGif, DecodedGifFrame } from '@/lib/gifUtils';
import { Frame, AnimationDef, SpriteLayer } from '@/lib/types';
import { blankFrameLike, dims } from '@/headless/assetModel';

interface GifImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decodedGif: DecodedGif;
  fileName: string;
}

interface Mapping {
  id: string;
  indices: number[];
  animValue: string;
  orientation: number; // 0: Front, 1: Side, 2: Back
}

type PaletteMode = 'auto' | 'sprite' | 'library';

export const GifImportWizard: React.FC<GifImportWizardProps> = ({ 
  open, 
  onOpenChange, 
  decodedGif,
  fileName
}) => {
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const spritePalette = useSpriteEditorStore(s => s.editedAsset.palette);
  const setEditedAsset = useSpriteEditorStore(s => s.setEditedAsset);
  const pushUndo = useSpriteEditorStore(s => s.pushUndo);

  // The canvas we are importing into, which may be non-square.
  const { width: assetWidth, height: assetHeight } = dims(editedAsset);
  const assetLongest = Math.max(1, assetWidth, assetHeight);

  // Selection state
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  
  // Assignment form
  const [targetOrientation, setTargetOrientation] = useState<string>("0");
  const [targetAnim, setTargetAnim] = useState<string>('');

  // Auto-select first valid animation when orientation changes
  useEffect(() => {
    const suffix = targetOrientation === "0" ? "_down" : targetOrientation === "1" ? "_right" : "_up";
    const filtered = AVAILABLE_ANIMS.filter(a => a.value.endsWith(suffix) || a.value === 'hurt' || a.value === 'die');
    if (filtered.length > 0 && !filtered.some(f => f.value === targetAnim)) {
      setTargetAnim(filtered[0].value);
    }
  }, [targetOrientation, targetAnim]);

  // Pixelization settings
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('auto');
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(PALETTE_LIBRARY[0].id);
  const [maxColors, setMaxColors] = useState(16);
  const [alphaThreshold, setAlphaThreshold] = useState(128);
  const [removeBackground, setRemoveBackground] = useState(true);

  const [previewFrameIdx, setPreviewFrameIdx] = useState(0);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Memoized Data ─────────────────────────────────────────────────

  const targetLibraryPalette = useMemo(() => {
    const preset = PALETTE_LIBRARY.find(p => p.id === selectedLibraryId);
    if (!preset) return null;
    const palette: Record<number, string> = { 0: 'transparent' };
    preset.colors.forEach((hex, i) => {
      palette[i + 1] = hex;
    });
    return palette;
  }, [selectedLibraryId]);

  // ─── Frame Processing ─────────────────────────────────────────────

  const pixelizeFrame = useCallback((imageData: ImageData): PixelizeResult => {
    // We need to resize to the canvas size first
    const canvas = document.createElement('canvas');
    canvas.width = assetWidth;
    canvas.height = assetHeight;
    const ctx = canvas.getContext('2d')!;
    
    // Scale the image to fit the canvas, keeping its aspect ratio
    const scale = Math.min(assetWidth / imageData.width, assetHeight / imageData.height);
    const w = imageData.width * scale;
    const h = imageData.height * scale;
    
    // Create temp canvas for the original ImageData
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, (assetWidth - w) / 2, (assetHeight - h) / 2, w, h);

    const resizedData = ctx.getImageData(0, 0, assetWidth, assetHeight);

    let fixedPalette = undefined;
    if (paletteMode === 'sprite') fixedPalette = spritePalette;
    if (paletteMode === 'library') fixedPalette = targetLibraryPalette;

    return imageToPixelData(resizedData, {
      targetWidth: assetWidth,
      targetHeight: assetHeight,
      maxColors,
      alphaThreshold,
      fixedPalette: fixedPalette as Record<number, string>,
      removeBackground
    });
  }, [assetWidth, assetHeight, paletteMode, spritePalette, targetLibraryPalette, maxColors, alphaThreshold, removeBackground]);

  // ─── Rendering ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !decodedGif.frames[previewFrameIdx]) return;
    
    const pixelResult = pixelizeFrame(decodedGif.frames[previewFrameIdx].imageData);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Letterbox inside the square preview: the offsets are 0 when square.
    const pxSize = canvas.width / assetLongest;
    const offsetX = (canvas.width - assetWidth * pxSize) / 2;
    const offsetY = (canvas.height - assetHeight * pxSize) / 2;
    pixelResult.frame.forEach((row: (number | null)[], r: number) => {
      row.forEach((p: number | null, c: number) => {
        if (p !== null && p > 0) {
          ctx.fillStyle = pixelResult.palette[p];
          ctx.fillRect(offsetX + c * pxSize, offsetY + r * pxSize, pxSize, pxSize);
        }
      });
    });
  }, [previewFrameIdx, decodedGif, assetWidth, assetHeight, assetLongest, paletteMode, spritePalette, targetLibraryPalette, maxColors, alphaThreshold, pixelizeFrame]);

  // ─── Actions ──────────────────────────────────────────────────────

  const handleFrameClick = (idx: number, e: React.MouseEvent) => {
    setPreviewFrameIdx(idx);
    
    if (e.shiftKey && selectedIndices.length > 0) {
      const lastSelected = selectedIndices[selectedIndices.length - 1];
      const start = Math.min(lastSelected, idx);
      const end = Math.max(lastSelected, idx);
      const range: number[] = [];
      for (let i = start; i <= end; i++) {
        if (!selectedIndices.includes(i)) range.push(i);
      }
      setSelectedIndices(prev => [...prev, ...range].sort((a, b) => a - b));
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedIndices(prev => 
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort((a, b) => a - b)
      );
    } else {
      setSelectedIndices([idx]);
    }
  };

  const addMapping = () => {
    if (selectedIndices.length === 0) return;
    const newMapping: Mapping = {
      id: crypto.randomUUID(),
      indices: [...selectedIndices],
      animValue: targetAnim,
      orientation: parseInt(targetOrientation)
    };
    setMappings([...mappings, newMapping]);
    setSelectedIndices([]);
  };

  const removeMapping = (id: string) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  const handleImport = () => {
    pushUndo();
    
    setEditedAsset(prevAsset => {
      const newAsset = JSON.parse(JSON.stringify(prevAsset));
      const newLayerId = `layer-gif-${Date.now()}`;
      const newLayer: SpriteLayer = {
        id: newLayerId,
        name: `Imported GIF (${fileName})`,
        isVisible: true,
        isLocked: false,
        opacity: 1,
        frames: Array.from({ length: prevAsset.layers?.[0]?.frames.length ?? 0 }, () => 
          blankFrameLike(prevAsset)
        ),
        paletteIds: []
      };

      // Ensure global palette is updated
      const globalPalette = { ...newAsset.palette };
      const globalColorNames = { ...newAsset.colorNames };

      const processedMappings = mappings.map(mapping => {
        const frames: Frame[] = [];
        for (const i of mapping.indices) {
          const result = pixelizeFrame(decodedGif.frames[i].imageData);
          
          // Merge palettes
          Object.entries(result.palette).forEach(([idx, hex]) => {
            if (hex === 'transparent') return;
            const existingIdx = Object.entries(globalPalette).find(([_, h]) => h === hex)?.[0];
            if (!existingIdx) {
              const nextIdx = Math.max(0, ...Object.keys(globalPalette).map(Number)) + 1;
              globalPalette[nextIdx] = hex;
              globalColorNames[nextIdx] = result.colorNames[Number(idx)];
            }
          });

          // Remap frame pixels to global indices
          const remappedFrame: Frame = result.frame.map((row: (number | null)[]) => 
            row.map((p: number | null) => {
              if (p === null || p === 0) return 0;
              const hex = result.palette[p];
              const globalIdx = Object.entries(globalPalette).find(([_, h]) => h === hex)?.[0];
              return globalIdx ? Number(globalIdx) : 0;
            })
          );
          frames.push(remappedFrame);
        }
        return { ...mapping, processedFrames: frames };
      });

      // Inject frames into layers and create animations
      processedMappings.forEach(mapping => {
        const startIndex = newLayer.frames.length;
        newLayer.frames.push(...mapping.processedFrames);

        // Update all other layers with empty frames to maintain alignment
        newAsset.layers.forEach((layer: SpriteLayer) => {
          if (layer.id === newLayerId) return;
          for (let i = 0; i < mapping.processedFrames.length; i++) {
            layer.frames.push(blankFrameLike(prevAsset));
          }
        });

        // Add AnimationDef
        const frameIndices = Array.from({ length: mapping.processedFrames.length }, (_, i) => startIndex + i);
        const animDef: AnimationDef = {
          name: mapping.animValue,
          label: mapping.animValue.replace(/_/g, ' ').toUpperCase(),
          frameIndices: frameIndices,
          fps: 10
        };

        const existingAnimIdx = newAsset.animations.findIndex((a: AnimationDef) => a.name === animDef.name);
        if (existingAnimIdx >= 0) {
          newAsset.animations[existingAnimIdx] = animDef;
        } else {
          newAsset.animations.push(animDef);
        }
      });

      newAsset.layers.push(newLayer);
      newAsset.palette = globalPalette;
      newAsset.colorNames = globalColorNames;

      return newAsset;
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[950px] max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0">
        <DialogHeader className="px-6 pt-6 border-b border-white/5 pb-4 relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <PxLayers className="text-primary" size={24} />
            </div>
            <div>
              <DialogTitle className="nube-pagina text-primary uppercase drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                GIF Reverse Engineer
              </DialogTitle>
              <DialogDescription className="nube-cuerpo text-muted-foreground uppercase mt-1">
                Extraé animaciones y capas de tu archivo GIF ({fileName}.gif)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-0 flex-1 overflow-hidden">
          {/* Left: GIF Timeline & Mapping List */}
          <div className="flex flex-col gap-4 p-6 overflow-hidden">
            <div className="bg-background/50 border border-border/50 rounded-lg p-3 shrink-0">
              <Label className="nube-etiqueta uppercase text-muted-foreground mb-2 block">Línea de Tiempo del GIF ({decodedGif.frames.length} frames)</Label>
              <ScrollArea className="w-full whitespace-nowrap rounded-md border border-white/5 bg-black/20">
                <div className="flex p-2 gap-2">
                  {decodedGif.frames.map((frame, idx) => {
                    const isSelected = selectedIndices.includes(idx);
                    const isMapped = mappings.some(m => m.indices.includes(idx));
                    
                    return (
                      <div 
                        key={idx}
                        onClick={(e) => handleFrameClick(idx, e)}
                        className={`relative w-16 h-16 rounded cursor-pointer transition-all duration-200 border-2 shrink-0 overflow-hidden ${
                          isSelected ? 'border-primary scale-105 z-10 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 
                          isMapped ? 'border-amber-500/50 opacity-80' : 'border-transparent hover:border-white/20'
                        }`}
                      >
                        <canvas 
                          ref={(el) => {
                            if (el) {
                              const ctx = el.getContext('2d')!;
                              ctx.imageSmoothingEnabled = false;
                              ctx.clearRect(0, 0, 64, 64);
                              
                              const scale = Math.min(64 / frame.imageData.width, 64 / frame.imageData.height);
                              const w = frame.imageData.width * scale;
                              const h = frame.imageData.height * scale;
                              
                              const temp = document.createElement('canvas');
                              temp.width = frame.imageData.width;
                              temp.height = frame.imageData.height;
                              temp.getContext('2d')!.putImageData(frame.imageData, 0, 0);
                              
                              ctx.drawImage(temp, (64-w)/2, (64-h)/2, w, h);
                            }
                          }}
                          width={64}
                          height={64}
                          className="w-full h-full object-contain"
                        />
                        <div className="nube-etiqueta-apretada absolute top-0 left-0 bg-black/60 px-1 py-0.5 text-white">{idx}</div>
                        {isMapped && (
                          <div className="absolute bottom-0 right-0 bg-amber-500 text-black px-1 rounded-tl">
                            <PxCheck size={8} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>

            <div className="bg-primary/5 border border-primary/10 p-4 rounded-lg shadow-inner space-y-3">
              <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="nube-etiqueta uppercase text-primary/70">Orientación</Label>
                <Select value={targetOrientation} onValueChange={setTargetOrientation}>
                  <SelectTrigger className="nube-cuerpo-apretado h-8 uppercase bg-background/50 border-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="0" className="nube-cuerpo uppercase">Frente (Front)</SelectItem>
                    <SelectItem value="1" className="nube-cuerpo uppercase">Perfil (Side)</SelectItem>
                    <SelectItem value="2" className="nube-cuerpo uppercase">Espalda (Back)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="nube-etiqueta uppercase text-primary/70">Animación Destino</Label>
                <Select value={targetAnim} onValueChange={setTargetAnim}>
                  <SelectTrigger className="nube-cuerpo-apretado h-8 uppercase bg-background/50 border-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {(() => {
                      const suffix = targetOrientation === "0" ? "_down" : targetOrientation === "1" ? "_right" : "_up";
                      return AVAILABLE_ANIMS
                        .filter(a => a.value.endsWith(suffix) || a.value === 'hurt' || a.value === 'die')
                        .map(a => (
                          <SelectItem key={a.value} value={a.value} className="nube-cuerpo uppercase">{a.label}</SelectItem>
                        ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              </div>
              <Button 
                disabled={selectedIndices.length === 0}
                onClick={addMapping}
                className="nube-cuerpo-apretado h-8 w-full bg-primary hover:bg-primary/90 text-primary-foreground uppercase px-4 gap-2"
              >
                <PxCheck size={12} />
                Asignar
              </Button>
            </div>

            <div className="flex-1 border border-border/40 rounded-lg overflow-hidden flex flex-col min-h-0 bg-black/10">
              <div className="bg-muted/30 px-3 py-2 border-b border-border/40 flex justify-between items-center shrink-0">
                <span className="nube-titulo uppercase text-muted-foreground">Mapeos Actuales</span>
                <Badge variant="outline" className="nube-etiqueta uppercase">{mappings.length} asignaciones</Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                  {mappings.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center py-8 opacity-30">
                      <PxImage size={32} />
                      <span className="nube-cuerpo uppercase mt-2">No hay mapeos definidos</span>
                    </div>
                  )}
                  {mappings.map(m => {
                    const animLabel = AVAILABLE_ANIMS.find(a => a.value === m.animValue)?.label;
                    const orientLabel = m.orientation === 0 ? 'Front' : m.orientation === 1 ? 'Side' : 'Back';
                    return (
                      <div key={m.id} className="flex items-center justify-between bg-card border border-border/60 p-2 rounded group hover:border-primary/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="nube-cuerpo-apretado uppercase text-primary">{animLabel}</span>
                            <span className="nube-etiqueta text-muted-foreground uppercase">{orientLabel} • {m.indices.length} frames ({m.indices.join(',')})</span>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMapping(m.id)}
                        >
                          <PxTrash size={12} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Right: Pixel Preview & Final Settings */}
          <div className="flex flex-col gap-4 border-l border-white/5 p-6 bg-black/5 overflow-y-auto">
            <div className="flex flex-col gap-2 items-center justify-center p-4 border border-primary/20 bg-primary/5 rounded-lg">
              <span className="nube-etiqueta nube-track-1 uppercase text-primary/70">Previsualización Px</span>
              <div className="border-4 border-black bg-black/40 p-1 rounded-sm shadow-2xl relative">
                <canvas ref={previewCanvasRef} width={160} height={160} className="w-40 h-40 block image-rendering-pixelated" />
                <div className="nube-etiqueta absolute -bottom-2 -right-2 bg-primary text-black px-1.5 py-1 rounded shadow-lg">
                  {previewFrameIdx}
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="nube-etiqueta uppercase text-muted-foreground px-1">Modo de Color</Label>
                <Tabs value={paletteMode} onValueChange={(v) => setPaletteMode(v as PaletteMode)} className="w-full">
                  <TabsList className="grid grid-cols-3 w-full h-8 p-1 bg-black/20">
                    <TabsTrigger value="auto" className="nube-etiqueta h-6 uppercase">Auto</TabsTrigger>
                    <TabsTrigger value="sprite" className="nube-etiqueta h-6 uppercase">Actual</TabsTrigger>
                    <TabsTrigger value="library" className="nube-etiqueta h-6 uppercase">Librería</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {paletteMode === 'library' && (
                <div className="space-y-2">
                  <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
                    <SelectTrigger className="nube-cuerpo-apretado h-8 bg-background/50 border-border/40">
                      <SelectValue placeholder="Elegir paleta..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      {PALETTE_LIBRARY.map(p => (
                        <SelectItem key={p.id} value={p.id} className="nube-cuerpo uppercase">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {paletteMode === 'auto' && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between">
                    <Label className="nube-etiqueta uppercase text-muted-foreground px-1">Máx Colores</Label>
                    <span className="nube-etiqueta text-primary">{maxColors}</span>
                  </div>
                  <Slider value={[maxColors]} min={2} max={32} onValueChange={([v]) => setMaxColors(v)} className="py-2" />
                </div>
              )}

              <div className="space-y-1 pt-1">
                <div className="flex justify-between">
                  <Label className="nube-etiqueta uppercase text-muted-foreground px-1">Alpha Threshold</Label>
                  <span className="nube-etiqueta text-primary">{alphaThreshold}</span>
                </div>
                <Slider value={[alphaThreshold]} min={0} max={255} onValueChange={([v]) => setAlphaThreshold(v)} className="py-2" />
              </div>

              <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg mt-2">
                <Label className="nube-etiqueta uppercase text-primary/70 cursor-pointer" htmlFor="gif-remove-bg">Eliminar Fondo</Label>
                <input 
                  id="gif-remove-bg"
                  type="checkbox" 
                  checked={removeBackground} 
                  onChange={(e) => setRemoveBackground(e.target.checked)}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-white/5 relative z-10 sm:justify-between sm:flex-wrap gap-3 items-center shrink-0 bg-card">
          <div className="nube-etiqueta flex items-center gap-2 text-muted-foreground/40 uppercase flex-1 min-w-[200px]">
             <PxChevronRight size={12} className="text-primary/40" />
             Asegurate de que las dimensiones coincidan con el canvas ({assetWidth}x{assetHeight})
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" className="nube-cuerpo-apretado h-8 px-4 uppercase hover:bg-white/5" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              className="nube-cuerpo-apretado h-8 px-6 uppercase bg-primary hover:bg-primary/90 text-primary-foreground shadow-[4px_4px_0px_rgba(0,0,0,0.3)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_rgba(0,0,0,0.4)] transition-all disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
              onClick={handleImport}
              disabled={mappings.length === 0}
            >
              Finalizar Ingeniería Inversa
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
