import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PixelWarningIcon } from './PixelWarningIcon';
import { PxUpload, PxImage } from '@/components/icons/PixelIcon';
import { imageToPixelData, PixelizeResult } from '@/lib/imageToPixelData';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { PALETTE_LIBRARY } from '@/lib/assets/palettes';
import { decodeGif, DecodedGif } from '@/lib/gifUtils';
import { GifImportWizard } from './GifImportWizard';
import { dims } from '@/headless/assetModel';

interface ImportImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImagePosition {
  x: number;
  y: number;
  scale: number;
}

type PaletteMode = 'auto' | 'sprite' | 'library';

/** Longest side, in CSS pixels, of the placement box. */
const CANVAS_DISPLAY_SIZE = 320; 
const DEBOUNCE_MS = 150;
const PIXEL_PREVIEW_SIZE = 128;

export const ImportImageModal: React.FC<ImportImageModalProps> = ({ open, onOpenChange }) => {
  const importAssetLayer = useSpriteEditorStore(s => s.importAssetLayer);
  const spritePalette = useSpriteEditorStore(s => s.editedAsset.palette);
  const activeLayerId = useSpriteEditorStore(s => s.activeLayerId);
  const editingFrameIndex = useSpriteEditorStore(s => s.editingFrameIndex);
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const pushUndo = useSpriteEditorStore(s => s.pushUndo);
  const overwriteLayerFrame = useSpriteEditorStore(s => s._pixelEditorBridge?.overwriteLayerFrame);

  // Source image
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState<string>('');

  // Position & scale
  const [position, setPosition] = useState<ImagePosition>({ x: 0, y: 0, scale: 1 });
  const [isDragOver, setIsDragOver] = useState(false);

  // Mode & Options
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('auto');
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(PALETTE_LIBRARY[0].id);
  const [maxColors, setMaxColors] = useState(16);
  const [alphaThreshold, setAlphaThreshold] = useState(128);
  const [removeBackground, setRemoveBackground] = useState(true);

  // Result
  const [pixelResult, setPixelResult] = useState<PixelizeResult | null>(null);

  // GIF Wizard State
  const [decodedGif, setDecodedGif] = useState<DecodedGif | null>(null);
  const [showGifWizard, setShowGifWizard] = useState(false);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The canvas we are importing into, which may be non-square.
  const { width: assetWidth, height: assetHeight } = dims(editedAsset);
  const assetLongest = Math.max(1, assetWidth, assetHeight);
  const isSquareAsset = assetWidth === assetHeight;
  // The placement box keeps the canvas aspect ratio, so one display→asset
  // ratio still describes both axes (and equals the old one when square).
  const displayWidth = (CANVAS_DISPLAY_SIZE * assetWidth) / assetLongest;
  const displayHeight = (CANVAS_DISPLAY_SIZE * assetHeight) / assetLongest;
  const displayToAsset = assetLongest / CANVAS_DISPLAY_SIZE;

  // ─── Helpers ───────────────────────────────────────────────────────

  const isCurrentFrameEmpty = useMemo(() => {
    const layer = editedAsset.layers?.find(l => l.id === activeLayerId);
    const frame = layer?.frames[editingFrameIndex];
    if (!frame) return true;
    return frame.every(row => row.every(p => p === 0));
  }, [editedAsset, activeLayerId, editingFrameIndex]);

  const targetLibraryPalette = useMemo(() => {
    const preset = PALETTE_LIBRARY.find(p => p.id === selectedLibraryId);
    if (!preset) return null;
    const palette: Record<number, string> = { 0: 'transparent' };
    preset.colors.forEach((hex, i) => {
      palette[i + 1] = hex;
    });
    return palette;
  }, [selectedLibraryId]);

  // ─── File Loading ─────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.type === 'image/gif') {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeGif(arrayBuffer);
      setDecodedGif(decoded);
      setFileName(file.name.replace(/\.[^/.]+$/, ''));
      setShowGifWizard(true);
      onOpenChange(false); // Close the main import modal to show the wizard
      return;
    }

    if (!file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      setSourceImage(img);
      setFileName(file.name.replace(/\.[^/.]+$/, ''));
      const maxDim = Math.max(img.width, img.height);
      const initialScale = (Math.min(displayWidth, displayHeight) * 0.8) / maxDim;
      setPosition({
        x: (displayWidth - img.width * initialScale) / 2,
        y: (displayHeight - img.height * initialScale) / 2,
        scale: initialScale,
      });
    };
    img.src = URL.createObjectURL(file);
  }, [onOpenChange, displayWidth, displayHeight]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ─── Interaction ──────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!sourceImage) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { x: position.x, y: position.y };
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setPosition(prev => ({
      ...prev,
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    }));
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setPosition(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(10, prev.scale * delta))
    }));
  };

  // ─── Pixelization Engine Loop ─────────────────────────────────────

  useEffect(() => {
    if (!sourceImage) {
      setPixelResult(null);
      return;
    }

    const timer = setTimeout(() => {
      const offscreen = document.createElement('canvas');
      offscreen.width = assetWidth;
      offscreen.height = assetHeight;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sourceImage,
        position.x * displayToAsset,
        position.y * displayToAsset,
        sourceImage.width * position.scale * displayToAsset,
        sourceImage.height * position.scale * displayToAsset
      );

      const imgData = ctx.getImageData(0, 0, assetWidth, assetHeight);
      
      let fixedPalette = undefined;
      if (paletteMode === 'sprite') fixedPalette = spritePalette;
      if (paletteMode === 'library') fixedPalette = targetLibraryPalette;

      const result = imageToPixelData(imgData, {
        targetWidth: assetWidth,
        targetHeight: assetHeight,
        maxColors,
        alphaThreshold,
        fixedPalette: fixedPalette as Record<number, string>,
        removeBackground
      });

      setPixelResult(result);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [sourceImage, position, assetWidth, assetHeight, displayToAsset, maxColors, alphaThreshold, paletteMode, spritePalette, targetLibraryPalette, removeBackground]);

  // ─── Canvas Rendering ─────────────────────────────────────────────

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1e1e22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Image
    if (sourceImage) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sourceImage, position.x, position.y, sourceImage.width * position.scale, sourceImage.height * position.scale);
    }

    // Grid Overlay
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }, [sourceImage, position, assetWidth, assetHeight]);

  useEffect(() => {
    const canvas = pixelPreviewCanvasRef.current;
    if (!canvas || !pixelResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Letterbox inside the square preview: the offsets are 0 when square.
    const pxSize = PIXEL_PREVIEW_SIZE / assetLongest;
    const offsetX = (PIXEL_PREVIEW_SIZE - assetWidth * pxSize) / 2;
    const offsetY = (PIXEL_PREVIEW_SIZE - assetHeight * pxSize) / 2;
    pixelResult.frame.forEach((row: (number | null)[], r: number) => {
      row.forEach((p: number | null, c: number) => {
        if (p !== null && p > 0) {
          ctx.fillStyle = pixelResult.palette[p];
          ctx.fillRect(offsetX + c * pxSize, offsetY + r * pxSize, pxSize, pxSize);
        }
      });
    });
  }, [pixelResult, assetWidth, assetHeight, assetLongest]);

  // ─── Import Logic ─────────────────────────────────────────────────

  const handleImport = (mode: 'new_layer' | 'overwrite') => {
    if (!pixelResult) return;

    if (mode === 'new_layer') {
      importAssetLayer({
        name: fileName || 'Imported',
        frame: pixelResult.frame,
        palette: pixelResult.palette,
        colorNames: pixelResult.colorNames
      });
    } else if (mode === 'overwrite' && overwriteLayerFrame) {
      pushUndo();
      importAssetLayer({
        name: fileName || 'Imported',
        frame: pixelResult.frame,
        palette: pixelResult.palette,
        colorNames: pixelResult.colorNames
      });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border">
        <DialogHeader className="border-b border-white/5 pb-4 mb-4 relative z-10">
          <DialogTitle className="nube-pagina text-primary uppercase drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
            Importar Imagen
          </DialogTitle>
          <DialogDescription className="sr-only">
            Selecciona una imagen para pixelarla e importarla como una nueva capa o reemplazar el frame actual.
          </DialogDescription>
        </DialogHeader>

        <div className="absolute inset-0 bg-pixel-grid opacity-10 pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Side: Preview & Controls */}
          <div className="flex flex-col gap-4">
            {!sourceImage ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative aspect-square border border-dashed rounded-lg flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all duration-300 ${
                  isDragOver 
                    ? 'border-primary bg-primary/20 scale-[1.02] shadow-[0_0_30px_rgba(34,197,94,0.2)]' 
                    : 'border-primary/20 bg-primary/5 hover:bg-primary/[0.08] text-muted-foreground'
                }`}
              >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
                
                <div className="relative z-10 flex flex-col items-center gap-4">
                  <div className={`p-4 rounded-full transition-all duration-500 ${isDragOver ? 'bg-primary/30 scale-110 rotate-12 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-primary/10'}`}>
                    <PxUpload size={48} className={isDragOver ? 'text-primary' : 'text-primary/60'} />
                  </div>
                  <div className="flex flex-col items-center gap-1.5 text-center px-6">
                    <span className={`nube-cuerpo uppercase transition-colors ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}>
                      {isDragOver ? '¡SUELTA PARA PIXELAR!' : 'Subir Imagen Fuente'}
                    </span>
                    <span className="nube-etiqueta text-muted-foreground/60 uppercase opacity-70">
                      Arrastrá tu archivo o hacé click
                    </span>
                  </div>
                </div>

                {/* Decorative corners */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-primary/30" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-primary/30" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-primary/30" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-primary/30" />
              </div>
            ) : (
              <div 
                className={`relative border-2 rounded overflow-hidden shadow-inner transition-colors ${isSquareAsset ? 'aspect-square' : ''} ${
                  isDragOver ? 'border-primary border-dashed shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-border'
                }`}
                style={isSquareAsset ? undefined : { aspectRatio: `${assetWidth} / ${assetHeight}` }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <canvas 
                  ref={previewCanvasRef} 
                  width={Math.round(displayWidth)} 
                  height={Math.round(displayHeight)}
                  className="w-full h-full cursor-move"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => isDragging.current = false}
                  onWheel={handleWheel}
                />
                <div className="nube-etiqueta absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 rounded text-white">
                  {Math.round(position.scale * 100)}% Zoom
                </div>
              </div>
            )}
            
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <Label className="nube-etiqueta uppercase text-muted-foreground px-1">Escala</Label>
                <Slider value={[position.scale * 100]} min={10} max={400} onValueChange={([v]) => setPosition(p => ({...p, scale: v/100}))} />
              </div>
              <div className="space-y-1">
                <Label className="nube-etiqueta uppercase text-muted-foreground px-1">Transparencia</Label>
                <Slider value={[alphaThreshold]} min={0} max={255} onValueChange={([v]) => setAlphaThreshold(v)} />
              </div>
              
              <div className="flex items-center justify-between p-2 bg-background/40 border border-border/40 rounded mt-1">
                <Label className="nube-etiqueta uppercase text-muted-foreground cursor-pointer" htmlFor="remove-bg">Eliminar Fondo</Label>
                <input 
                  id="remove-bg"
                  type="checkbox" 
                  checked={removeBackground} 
                  onChange={(e) => setRemoveBackground(e.target.checked)}
                  className="w-3 h-3 accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right Side: Palette & Result */}
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="nube-etiqueta uppercase text-muted-foreground">Modo de Color</Label>
              <Tabs value={paletteMode} onValueChange={(v) => setPaletteMode(v as PaletteMode)} className="w-full">
                <TabsList className="grid grid-cols-3 w-full h-8 p-1">
                  <TabsTrigger value="auto" className="nube-etiqueta h-6 uppercase">Auto</TabsTrigger>
                  <TabsTrigger value="sprite" className="nube-etiqueta h-6 uppercase">Actual</TabsTrigger>
                  <TabsTrigger value="library" className="nube-etiqueta h-6 uppercase">Librería</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {paletteMode === 'library' && (
              <div className="space-y-2">
                <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
                  <SelectTrigger className="nube-cuerpo-apretado h-8 bg-background/50">
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
              <div className="space-y-1">
                <Label className="nube-etiqueta uppercase text-muted-foreground px-1">Máx Colores ({maxColors})</Label>
                <Slider value={[maxColors]} min={2} max={32} onValueChange={([v]) => setMaxColors(v)} />
              </div>
            )}

            <div className="flex flex-col gap-2 items-center justify-center p-4 border border-border/50 bg-background/30 rounded-lg">
              <span className="nube-etiqueta uppercase text-muted-foreground">Vista Previa Pixelada</span>
              <div className="border border-primary/20 p-1 bg-black/20 rounded">
                <canvas ref={pixelPreviewCanvasRef} width={PIXEL_PREVIEW_SIZE} height={PIXEL_PREVIEW_SIZE} className="w-32 h-32 block image-rendering-pixelated" />
              </div>
            </div>

            {!isCurrentFrameEmpty && sourceImage && (
              <Alert className="bg-amber-900/20 border-amber-500/50 py-2">
                <PixelWarningIcon size={14} className="text-amber-500" />
                <AlertDescription className="nube-etiqueta text-amber-200 uppercase">
                  El frame actual no está vacío. ¿Querés reemplazarlo o usar un nuevo layer?
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-white/5 relative z-10">
          <div className="nube-etiqueta flex items-center gap-2 text-muted-foreground/40 uppercase">
            <PxImage size={12} className="opacity-50" />
            Formatos: PNG, JPG, GIF
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="nube-cuerpo-apretado h-8 px-4 uppercase hover:bg-white/5" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            
            {!isCurrentFrameEmpty && sourceImage && (
              <Button 
                variant="outline" 
                className="nube-cuerpo-apretado h-8 px-4 uppercase border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                onClick={() => handleImport('overwrite')}
              >
                Sobrescribir
              </Button>
            )}

            <Button 
              className="nube-cuerpo-apretado h-8 px-6 uppercase bg-primary hover:bg-primary/90 text-primary-foreground shadow-[2px_2px_0px_rgba(0,0,0,0.3)] active:translate-y-0.5 active:shadow-none"
              onClick={() => handleImport(isCurrentFrameEmpty ? 'overwrite' : 'new_layer')}
              disabled={!sourceImage}
            >
              {isCurrentFrameEmpty || !sourceImage ? 'Importar' : 'Nuevo Layer'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {decodedGif && (
        <GifImportWizard 
          open={showGifWizard} 
          onOpenChange={setShowGifWizard} 
          decodedGif={decodedGif} 
          fileName={fileName}
        />
      )}
    </Dialog>
  );
};
