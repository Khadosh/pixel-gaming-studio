import React, { useCallback, useRef, useState } from 'react';
import { SpriteEditorModal } from '@/components/SpriteEditor';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { SpriteAsset } from '@/lib/types';
import { addRetouchLayer, isRetouchName, openTextDrawing, saveTextDrawing, type TextDrawingSession } from '@/lib/textDrawing';
import { canWriteInPlace, pickTextFiles, saveTextFileAs, writeTextFile, type LocalTextFile, type WritableFileHandle } from '@/lib/textFileAccess';

interface OpenDrawing {
  /** Remounts the editor (and its store) on every file opened. */
  key: number;
  asset: SpriteAsset;
  session: TextDrawingSession;
  file: Pick<LocalTextFile, 'name' | 'handle'>;
  /** Where the retouch goes, once we know it (the handle appears after the first save). */
  retouch?: { name: string; handle?: WritableFileHandle };
}

/**
 * /dibujo: abre un dibujo de texto (formato `from_ascii`, src/headless/ascii.ts) en el editor
 * y lo guarda de vuelta al mismo .txt. No usa la nube: el archivo es la verdad.
 *
 * Si el dibujo trae `generated_by:` (lo hizo una receta), GUARDAR no lo pisa: escribe la
 * **capa de retoque** al lado (`<dibujo>.retoque.txt`), que la receta vuelve a poner encima.
 * Se pueden abrir los dos archivos juntos para seguir un retoque empezado.
 */
const TextDrawing = () => {
  const { toast } = useToast();
  const [drawing, setDrawing] = useState<OpenDrawing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const answerWarnings = useRef<((go: boolean) => void) | null>(null);
  const counter = useRef(0);

  const load = useCallback((files: Pick<LocalTextFile, 'name' | 'text' | 'handle'>[]) => {
    try {
      const base = files.find(f => !isRetouchName(f.name));
      if (!base) throw new Error('Elegí el dibujo: lo que abriste es sólo una capa de retoque (.retoque.txt).');
      let opened = openTextDrawing(base.text, base.name);
      const retouchFile = files.find(f => f !== base);
      if (retouchFile) opened = addRetouchLayer(opened, retouchFile.text, retouchFile.name);
      counter.current += 1;
      setDrawing({
        key: counter.current,
        asset: opened.asset,
        session: opened.session,
        file: base,
        retouch: opened.session.retouchName
          ? { name: opened.session.retouchName, handle: retouchFile?.handle }
          : undefined,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDrawing(null);
    }
  }, []);

  const openFile = useCallback(async () => {
    try {
      const files = await pickTextFiles();
      if (files.length) load(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [load]);

  const openPasted = () => {
    const id = /^id:\s*(\S+)/m.exec(pasted)?.[1];
    load([{ name: `${id ?? 'dibujo'}.txt`, text: pasted }]);
  };

  const confirmWarnings = (list: string[]) => new Promise<boolean>(resolve => {
    answerWarnings.current = resolve;
    setWarnings(list);
  });

  const closeWarnings = (go: boolean) => {
    answerWarnings.current?.(go);
    answerWarnings.current = null;
    setWarnings(null);
  };

  const handleSave = useCallback(async (asset: SpriteAsset): Promise<boolean> => {
    if (!drawing) return false;
    let saved;
    try {
      saved = saveTextDrawing(asset, drawing.session);
    } catch (err) {
      toast({ title: 'No se pudo pasar a texto', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      return false;
    }
    if (saved.warnings.length && !(await confirmWarnings(saved.warnings))) return false;
    try {
      if (saved.kind === 'retouch') {
        // El dibujo lo hizo una receta: no se toca. Lo que se guarda es la capa de encima.
        const target = drawing.retouch ?? { name: saved.fileName };
        let how: 'written' | 'downloaded';
        if (target.handle) {
          how = await writeTextFile({ name: target.name, handle: target.handle }, saved.text);
        } else {
          const res = await saveTextFileAs(target.name, saved.text);
          how = res.how;
          if (res.handle) setDrawing(d => (d ? { ...d, retouch: { name: target.name, handle: res.handle } } : d));
        }
        const c = saved.coverage;
        const cuanto = c ? ` Tapa ${c.painted} px pintados${c.erased ? ` y ${c.erased} borrados` : ''} (${Math.round(c.share * 100)}% del dibujo).` : '';
        toast({
          title: how === 'written' ? 'Retoque guardado' : 'Retoque descargado',
          description: `${drawing.file.name} lo pintó una receta, así que queda intacto: el retoque va en ${target.name} y la receta lo vuelve a poner encima.${cuanto}`,
        });
        // El semáforo de divergencia: no impide nada, avisa que las correcciones
        // ya son tantas que convendría subirlas a la receta.
        if (saved.divergence) {
          toast({ title: 'El retoque ya tapa demasiado', description: saved.divergence, variant: 'destructive' });
        }
        return true;
      }
      const how = await writeTextFile(drawing.file, saved.text);
      drawing.session.layout.comments = 0; // what was lost is already said
      toast(how === 'written'
        ? { title: 'Guardado', description: `${drawing.file.name} quedó escrito en su lugar.` }
        : { title: 'Descargado', description: `${drawing.file.name} bajó como descarga: este navegador no deja escribir el archivo original.` });
      return true;
    } catch (err) {
      toast({ title: 'Error al guardar', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      return false;
    }
  }, [drawing, toast]);

  const textFile = React.useMemo(
    () => (drawing
      ? {
        name: drawing.file.name,
        onOpen: openFile,
        note: drawing.session.generatedBy
          ? `lo generó ${drawing.session.generatedBy.by}: GUARDAR escribe ${drawing.retouch?.name ?? 'el retoque'}`
          : undefined,
      }
      : null),
    [drawing, openFile],
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2 border-b border-border pb-4">
          <h1 className="font-pixel text-sm text-primary uppercase">Dibujo de texto</h1>
          <p className="text-sm text-muted-foreground">
            Abrí un <code>.txt</code> del formato de <code>pss from_ascii</code> (tamaño, paleta, cuadros y animaciones),
            retocalo con el mouse y GUARDAR lo escribe de vuelta.{' '}
            {canWriteInPlace()
              ? 'Este navegador escribe el mismo archivo.'
              : 'Este navegador no deja escribir el archivo: GUARDAR lo descarga con el mismo nombre.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Si el dibujo lo hizo una receta (trae <code>generated_by:</code>), GUARDAR no lo pisa: escribe la capa de
            retoque <code>.retoque.txt</code> al lado, y la receta la vuelve a poner encima cada vez que corre.
            Para seguir un retoque ya empezado, elegí el dibujo <em>y</em> su <code>.retoque.txt</code> juntos.
            Lo que ves acá es lo que queda: la capa pinta, deja pasar lo de abajo y también <strong>saca</strong>
            píxeles (el glifo <code>!</code>), así que borrar algo que pintó la receta no se pierde.
          </p>
        </header>

        <Button onClick={openFile} className="font-pixel text-[10px]">ABRIR .TXT</Button>

        <div className="space-y-2">
          <label htmlFor="pasted" className="text-sm text-muted-foreground">O pegá el texto del dibujo:</label>
          <Textarea
            id="pasted"
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder={'id: farol\nsize: 16x32\nk = #15120f tinta\n\n== idle 0\n....'}
          />
          <Button variant="outline" onClick={openPasted} disabled={!pasted.trim()} className="font-pixel text-[10px]">
            ABRIR LO PEGADO
          </Button>
        </div>

        {error && (
          <pre className="whitespace-pre-wrap text-sm text-destructive border border-destructive/40 rounded p-3">{error}</pre>
        )}
      </div>

      {drawing && (
        <SpriteEditorModal
          key={drawing.key}
          open
          onOpenChange={open => { if (!open) setDrawing(null); }}
          initialAsset={drawing.asset}
          onSave={handleSave}
          fromTextFile
          textFile={textFile}
        />
      )}

      <AlertDialog open={warnings !== null} onOpenChange={open => { if (!open) closeWarnings(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El texto no guarda todo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc pl-5 space-y-1 text-left">
                {(warnings ?? []).map(w => <li key={w}>{w}</li>)}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeWarnings(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeWarnings(true)}>Guardar igual</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TextDrawing;
