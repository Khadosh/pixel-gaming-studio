import React, { useState } from 'react';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  PxUndo, PxCheck, PxPlus, PxTrash, 
  PxClock, PxLoader 
} from '@/components/icons/PixelIcon';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';

const EMPTY_VERSIONS: any[] = [];
export const HistoryPanel = () => {
  const versions = useSpriteEditorStore(s => s.editedAsset.versions || EMPTY_VERSIONS);
  const createCheckpoint = useSpriteEditorStore(s => s.createCheckpoint);
  const restoreCheckpoint = useSpriteEditorStore(s => s.restoreCheckpoint);
  const clearHistory = useSpriteEditorStore(s => s.clearHistory);
  
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    createCheckpoint(newName || undefined);
    setNewName('');
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="nube-titulo text-primary uppercase flex items-center gap-1.5 whitespace-nowrap">
            <PxClock size={14} />
            Historial Cloud
          </h3>
          <Button 
            variant="destructive" 
            size="sm" 
            className="nube-etiqueta h-6 px-1.5 gap-0.5 flex-shrink-0"
            onClick={() => {
              if (confirm('¿PURGAR TODO EL HISTORIAL? Esto eliminará todas las versiones para recuperar rendimiento.')) {
                clearHistory();
              }
            }}
          >
            <PxTrash size={10} /> PURGA
          </Button>
        </div>
        <p className="nube-etiqueta text-muted-foreground uppercase ">
          Crea puntos de restauración manual antes de cambios críticos.
        </p>
      </div>

      <div className="flex-shrink-0 flex gap-2">
        <Input 
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre del punto..."
          className="nube-cuerpo-apretado h-8 bg-secondary/20 border-border"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <Button 
          size="icon" 
          className="h-8 w-8 shrink-0" 
          onClick={handleCreate}
          title="Guardar Checkpoint"
        >
          <PxPlus size={16} />
        </Button>
      </div>

      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-2 py-2">
          {versions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 opacity-30 grayscale">
              <PxClock size={32} />
              <span className="nube-cuerpo uppercase ">Sin versiones</span>
            </div>
          ) : (
            versions.map((ver: any) => (
              <div 
                key={ver.id}
                className="group p-3 bg-secondary/20 rounded-lg border border-border/50 hover:border-primary/50 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="nube-cuerpo text-foreground truncate uppercase">{ver.name}</p>
                    <p className="nube-etiqueta text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(ver.timestamp), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-primary hover:bg-primary/20 shrink-0"
                    onClick={() => restoreCheckpoint(ver.id)}
                    title="Restaurar esta versión"
                  >
                    <PxUndo size={14} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {versions.length > 0 && (
        <div className="flex-shrink-0 pt-4 border-t border-border">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full h-9 border-primary/20 text-primary hover:bg-primary/5 gap-2 group">
                <PxCheck size={14} className="group-hover:scale-110 transition-transform" />
                <span className="nube-cuerpo uppercase">Confirmar Cambios</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="nube-titulo uppercase">¿Confirmar Versión Final?</AlertDialogTitle>
                <AlertDialogDescription className="nube-cuerpo ">
                  Esto limpiará todos los checkpoints temporales de esta sesión. Los cambios ya están sincronizados en la nube.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="nube-cuerpo uppercase">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={clearHistory} className="nube-cuerpo uppercase bg-primary text-primary-foreground">
                  Confirmar y Limpiar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="nube-etiqueta text-center text-muted-foreground mt-2 uppercase opacity-50">
            * Máximo 10 versiones por sprite
          </p>
        </div>
      )}
    </div>
  );
};
