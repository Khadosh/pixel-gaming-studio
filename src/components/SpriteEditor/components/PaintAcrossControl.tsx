import React from 'react';
import { Button } from '@/components/ui/button';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { viewGroups } from '@/headless/framescope';
import type { PaintAcross } from '@/lib/paintAcross';

const ACROSS: { value: PaintAcross; label: string; title: string }[] = [
  { value: 'frame', label: 'ESTE CUADRO', title: 'Lo que pintás queda sólo en el cuadro que estás mirando.' },
  { value: 'view', label: 'TODA LA VISTA', title: 'Lo que pintás va a todos los cuadros de este lado del dibujo (quieto y caminando): no titila al moverse.' },
  { value: 'all', label: 'TODOS', title: 'Lo que pintás va a todos los cuadros del dibujo, de todos los lados.' },
];

/** Dónde cae lo que se pinta: el cuadro, su vista o todos. Sólo si el dibujo tiene más de un cuadro. */
export const PaintAcrossControl = () => {
  const asset = useSpriteEditorStore(s => s.editedAsset);
  const across = useSpriteEditorStore(s => s.paintAcross);
  const setAcross = useSpriteEditorStore(s => s.setPaintAcross);
  const textFile = useSpriteEditorStore(s => s._textFile);
  const frames = asset.layers?.[0]?.frames.length ?? 0;
  const hasViews = React.useMemo(() => viewGroups(asset).length > 0, [asset.animations]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!textFile || frames < 2) return null;
  return (
    <div className="flex-shrink-0 border-b border-border bg-secondary/20 px-2 py-1 flex items-center justify-center gap-1" role="radiogroup" aria-label="Dónde pinta el pincel">
      <span className="nube-cuerpo text-muted-foreground mr-2 whitespace-nowrap">PINTA EN</span>
      {ACROSS.filter(o => o.value !== 'view' || hasViews).map(o => (
        <Button
          key={o.value}
          variant="outline"
          size="sm"
          role="radio"
          aria-checked={across === o.value}
          title={o.title}
          onClick={() => setAcross(o.value)}
          className={`nube-cuerpo h-8 px-2 whitespace-nowrap ${across === o.value ? 'border-primary bg-primary/20 text-primary' : 'border-primary/30 text-muted-foreground'}`}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
};
