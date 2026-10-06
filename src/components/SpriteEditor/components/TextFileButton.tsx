import React from 'react';
import { Button } from '@/components/ui/button';
import { PxUpload } from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';

/** Archivo de texto abierto + botón para abrir otro. Sólo aparece con un dibujo de texto (página /dibujo). */
export const TextFileButton = React.memo(() => {
  const textFile = useSpriteEditorStore(s => s._textFile);
  const isDirty = useSpriteEditorStore(s => s.isDirty);
  if (!textFile) return null;
  const open = () => {
    if (isDirty && !window.confirm('Hay cambios sin guardar en este dibujo. ¿Abrir otro igual?')) return;
    textFile.onOpen();
  };
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-muted-foreground max-w-[220px] truncate" title={textFile.name}>
        {textFile.name}
      </span>
      {textFile.note && (
        <span className="font-mono text-[10px] text-amber-300/80 max-w-[320px] truncate" title={textFile.note}>
          {textFile.note}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={open}
        className="font-pixel text-[9px] h-8 border-primary/30 text-green-300 hover:bg-primary/10 transition-all"
      >
        <PxUpload size={15} className="mr-2" />
        ABRIR .TXT
      </Button>
    </div>
  );
});

TextFileButton.displayName = 'TextFileButton';
