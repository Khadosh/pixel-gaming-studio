import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PxUpload } from '@/components/icons/PixelIcon';
import { ImportImageModal } from './ImportImageModal';

/** Botón "IMPORTAR" + su modal, compartido por ambos headers. */
export const ImportButton = React.memo(() => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="nube-cuerpo h-8 border-primary/30 text-green-300 hover:bg-primary/10 transition-all"
        onClick={() => setOpen(true)}
      >
        <PxUpload size={15} className="mr-2" />
        IMPORTAR
      </Button>
      <ImportImageModal open={open} onOpenChange={setOpen} />
    </>
  );
});

ImportButton.displayName = 'ImportButton';
