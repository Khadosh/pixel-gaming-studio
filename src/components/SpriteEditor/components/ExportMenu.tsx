import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { PxDownload, PxImage, PxFileVideo, PxHardDrive, PxLayers } from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { selectActiveLayer } from '../store/derived';

const isLocalhost = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const ITEM_CLASS = 'cursor-pointer gap-2 focus:bg-primary/10 focus:text-primary transition-colors';

/**
 * Dropdown "EXPORTAR" compartido por el header del Studio y el del modal.
 * Lee todo del store: no recibe callbacks por props.
 */
export const ExportMenu = React.memo(() => {
  const handleExportPNG = useSpriteEditorStore(s => s.handleExportPNG);
  const handleExportLayerPNG = useSpriteEditorStore(s => s.handleExportLayerPNG);
  const handleExportGIF = useSpriteEditorStore(s => s.handleExportGIF);
  const handleExportJSON = useSpriteEditorStore(s => s.handleExportJSON);
  const viewingAnimation = useSpriteEditorStore(s => s.viewingAnimation);
  const activeLayerName = useSpriteEditorStore(s => selectActiveLayer(s)?.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="nube-cuerpo h-8 border-primary/30 text-green-300 hover:bg-primary/10 transition-all"
        >
          <PxDownload size={15} className="mr-2" />
          EXPORTAR
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-border nube-cuerpo">
        <DropdownMenuLabel className="text-muted-foreground nube-etiqueta nube-track-1 uppercase px-2 py-1.5">
          Opciones de Exportación
        </DropdownMenuLabel>

        <DropdownMenuItem onSelect={() => handleExportPNG()} className={ITEM_CLASS}>
          <PxImage size={14} />
          PNG SPRITE SHEET
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => handleExportPNG({ includeLabels: true })} className={ITEM_CLASS}>
          <PxHardDrive size={14} />
          PNG CON ETIQUETAS
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => handleExportLayerPNG()} disabled={!activeLayerName} className={ITEM_CLASS}>
          <PxLayers size={14} />
          <span className="truncate">
            PNG LAYER ACTUAL{activeLayerName ? ` (${activeLayerName.toUpperCase()})` : ''}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem onSelect={() => handleExportGIF()} className={ITEM_CLASS}>
          <PxFileVideo size={14} />
          EXPORTAR GIF ({viewingAnimation.toUpperCase()})
        </DropdownMenuItem>

        {isLocalhost() && (
          <>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onSelect={() => handleExportJSON()}
              className="cursor-pointer gap-2 text-amber-400 focus:bg-amber-400/10 focus:text-amber-300 transition-colors"
            >
              DEBUG: COPIAR JSON
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

ExportMenu.displayName = 'ExportMenu';
