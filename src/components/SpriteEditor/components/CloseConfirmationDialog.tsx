import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PxSave, PxTrash, PxXCircle } from '@/components/icons/PixelIcon';
import { PixelWarningIcon } from './PixelWarningIcon';

interface CloseConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSave: () => void;
  onConfirmDiscard: () => void;
}

export const CloseConfirmationDialog: React.FC<CloseConfirmationDialogProps> = ({
  open,
  onOpenChange,
  onConfirmSave,
  onConfirmDiscard,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[400px] border-[6px] border-primary bg-card p-8 shadow-[12px_12px_0_0_rgba(0,0,0,0.6)] select-none animate-in fade-in zoom-in duration-200">
        <AlertDialogHeader className="space-y-6">
          <div className="flex justify-center py-2">
            <div className="w-20 h-20 bg-destructive/10 border-[6px] border-destructive flex items-center justify-center shadow-[6px_6px_0_0_rgba(239,68,68,0.2)]">
              <PixelWarningIcon size={48} color="hsl(var(--destructive))" markColor="white" />
            </div>
          </div>
          <AlertDialogTitle className="nube-titulo text-center text-primary">
            ¡ALERTA! <br/>
            TRABAJO NO GUARDADO
          </AlertDialogTitle>
          <AlertDialogDescription className="nube-cuerpo text-center text-muted-foreground uppercase">
            ¿Deseas guardar tus píxeles antes de retirarte o prefieres descartar el progreso actual?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 mt-8">
          <Button
            onClick={onConfirmSave}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground nube-cuerpo h-14 border-b-4 border-r-4 border-primary/40 rounded-none shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.4)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all uppercase px-6"
          >
            <div className="w-8 flex justify-center shrink-0">
              <PxSave size={18} />
            </div>
            <span className="flex-1 text-center pr-8">GUARDAR Y SALIR</span>
          </Button>

          <Button
            variant="destructive"
            onClick={onConfirmDiscard}
            className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground nube-cuerpo h-14 border-b-4 border-r-4 border-destructive/40 rounded-none shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.4)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all uppercase px-6"
          >
            <div className="w-8 flex justify-center shrink-0">
              <PxTrash size={18} />
            </div>
            <span className="flex-1 text-center pr-8">DESCARTAR CAMBIOS</span>
          </Button>

          <AlertDialogCancel asChild>
            <Button
              variant="outline"
              className="w-full nube-cuerpo h-12 border-[4px] border-muted-foreground/30 text-muted-foreground hover:bg-secondary rounded-none shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all uppercase mt-2 px-6"
            >
              <div className="w-8 flex justify-center shrink-0">
                <PxXCircle size={16} />
              </div>
              <span className="flex-1 text-center pr-8">SEGUIR EDITANDO</span>
            </Button>
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
