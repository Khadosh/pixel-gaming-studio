import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  PxEdit,
  PxSparkles,
  PxDownload,
  PxSave,
  PxChevronLeft,
  PxArrowLeft,
  PxLoader,
  PxCheck,
} from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { ExportMenu } from './ExportMenu';
import { ImportButton } from './ImportButton';
import { TextFileButton } from './TextFileButton';

export interface EditorHeaderProps {
  /**
   * `modal`: se renderiza dentro de un `DialogContent` (usa `DialogTitle` para accesibilidad).
   * `studio`: página completa (`/project/:projectSlug/editor/:spriteSlug`).
   */
  variant?: 'modal' | 'studio';
  /** Si se pasa, el botón de volver es un `Link` a esta ruta; si no, llama a `handleClose` del store. */
  backTo?: string;
  /** Estado de sincronización con la nube (autosave). */
  syncStatus?: { isPending: boolean; isSuccess: boolean };
}

const NameEditor: React.FC = () => {
  const assetName = useSpriteEditorStore(s => s.assetName);
  const setAssetName = useSpriteEditorStore(s => s.setAssetName);
  const setIsEditingName = useSpriteEditorStore(s => s.setIsEditingName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={assetName || ''}
      onChange={e => setAssetName(e.target.value)}
      onBlur={() => setIsEditingName(false)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Escape') setIsEditingName(false);
      }}
      className="bg-background border border-primary rounded px-2 py-1 nube-pagina uppercase text-primary outline-none w-80 focus:shadow-[0_0_10px_rgba(34,197,94,0.3)] transition-all"
    />
  );
};

/**
 * Header único del editor. Lo usan el modal (`EditorLayout` con `hideHeader=false`)
 * y la página del Studio (`SpriteStudio`), variando solo por props.
 */
export const EditorHeader = React.memo(({ variant = 'modal', backTo, syncStatus }: EditorHeaderProps) => {
  const assetName = useSpriteEditorStore(s => s.assetName);
  const isEditingName = useSpriteEditorStore(s => s.isEditingName);
  const setIsEditingName = useSpriteEditorStore(s => s.setIsEditingName);
  const generatePrompt = useSpriteEditorStore(s => s._generatePrompt);
  const onRegenerate = useSpriteEditorStore(s => s._onRegenerate);
  const isGenerating = useSpriteEditorStore(s => s._isGenerating);
  const handleSave = useSpriteEditorStore(s => s.handleSave);
  const createCheckpoint = useSpriteEditorStore(s => s.createCheckpoint);
  const handleClose = useSpriteEditorStore(s => s.handleClose);
  const isDirty = useSpriteEditorStore(s => s.isDirty);
  const isIconMode = useSpriteEditorStore(s => s.isIconMode);
  const handleExportIcon = useSpriteEditorStore(s => s.handleExportIcon);

  const handleManualSave = () => {
    createCheckpoint('Guardado Manual');
    handleSave();
  };

  const titleClass =
    'm-0 text-primary uppercase nube-pagina font-normal truncate max-w-[320px] h-9 flex items-center gap-2';
  const titleContent = (
    <>
      {assetName || 'SIN NOMBRE'}
      {isDirty && (
        <span
          className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse flex-shrink-0"
          title="Cambios sin guardar"
        />
      )}
      <PxEdit size={10} className="opacity-40 flex-shrink-0" />
    </>
  );

  const containerClass =
    variant === 'studio'
      ? 'flex-shrink-0 bg-secondary/20 border-b border-border px-4 py-2 flex items-center justify-between'
      : 'flex flex-row items-center justify-between flex-shrink-0';

  return (
    <header className={containerClass}>
      <div className="flex items-center gap-4">
        {backTo ? (
          <Link
            to={backTo}
            className="p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
            title="Volver al proyecto"
          >
            <PxArrowLeft size={16} />
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground nube-cuerpo gap-1"
          >
            <PxChevronLeft size={14} /> SALIR
          </Button>
        )}
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2 nube-etiqueta">
          <span className="text-muted-foreground opacity-50 uppercase">STUDIO</span>
          <span className="text-muted-foreground">/</span>
          <div
            className="relative cursor-text px-2 py-1 rounded transition-colors hover:bg-white/5"
            onDoubleClick={() => setIsEditingName(true)}
            title="Doble click para renombrar"
          >
            {isEditingName ? (
              <NameEditor />
            ) : variant === 'modal' ? (
              <DialogTitle className={titleClass}>{titleContent}</DialogTitle>
            ) : (
              <h1 className={titleClass}>{titleContent}</h1>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {generatePrompt && onRegenerate && (
          <div className="flex items-center gap-2">
            <span className="nube-cuerpo text-muted-foreground hidden sm:inline-block max-w-[200px] truncate">
              Prompt: "{generatePrompt}"
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="nube-cuerpo border-primary/50 text-primary hover:bg-primary/10 transition-all"
            >
              {isGenerating ? 'GENERANDO...' : 'REGENERAR'}
              {!isGenerating && <PxSparkles size={14} className="ml-1" />}
            </Button>
          </div>
        )}

        {syncStatus?.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <PxLoader size={12} className="animate-spin" />
            <span className="nube-etiqueta uppercase">Autoguardando...</span>
          </div>
        )}
        {syncStatus?.isSuccess && !syncStatus.isPending && (
          <div className="flex items-center gap-2 text-primary/60">
            <PxCheck size={12} />
            <span className="nube-etiqueta uppercase">Sincronizado</span>
          </div>
        )}

        {syncStatus && <div className="h-4 w-px bg-border mx-1" />}

        <TextFileButton />
        {!isIconMode && <ImportButton />}
        <ExportMenu />

        {isIconMode ? (
          <Button
            onClick={handleExportIcon}
            size="sm"
            className="nube-cuerpo h-8 bg-purple-600 text-white hover:bg-purple-500 border border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all"
          >
            <PxDownload size={15} className="mr-2" />
            COPY ICON DATA
          </Button>
        ) : (
          <Button
            onClick={handleManualSave}
            size="sm"
            className={`nube-cuerpo h-8 px-4 bg-green-600 text-white hover:bg-green-500 border border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all ${
              isDirty ? 'animate-pulse-glow border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.6)]' : ''
            }`}
          >
            <PxSave size={14} className="mr-2" />
            GUARDAR
          </Button>
        )}
      </div>
    </header>
  );
});

EditorHeader.displayName = 'EditorHeader';
