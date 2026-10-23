import { useMemo, useState } from 'react';
import type { Project, ProjectSprite } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { PxX, PxLoader } from '@/components/icons/PixelIcon';
import { useToast } from '@/hooks/use-toast';
import { useApplyProjectPalette } from '@/hooks/useProjectQueries';
import { PALETTE_LIBRARY } from '@/lib/assets/palettes';
import { defaultPalette, paletteFromPreset, readProjectPalette, type ProjectPalette } from '@/lib/newAsset';
import { planRepalette, remapsByIndex } from '@/lib/projectPalette';

const assets = (n: number) => (n === 1 ? '1 asset' : `${n} assets`);

/**
 * La paleta del proyecto, editable, y aplicarla a los assets que la siguen
 * (Khadosh/estudio#226). Dice cuántos cambian antes de tocar nada.
 */
export function ProjectPalettePanel({ project, sprites, onClose }: {
  project: Project;
  sprites: ProjectSprite[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const apply = useApplyProjectPalette();
  const current = readProjectPalette(project.config);
  const [draft, setDraft] = useState<ProjectPalette>(() => current ?? defaultPalette());

  const plan = useMemo(() => planRepalette(sprites, current), [sprites, current]);
  const dirty = !current || JSON.stringify(current) !== JSON.stringify(draft);

  const setColor = (i: number, hex: string) => {
    const colors = [...draft.colors];
    colors[i] = hex;
    setDraft({ ...draft, colors });
  };

  const onApply = () => {
    apply.mutate({ project, palette: draft }, {
      onSuccess: ({ changed, kept }) => {
        toast({
          title: 'Paleta del proyecto aplicada',
          description: kept
            ? `${assets(changed)} con la paleta nueva; ${kept === 1 ? '1 quedó como estaba (tiene' : `${kept} quedaron como estaban (tienen`} colores propios).`
            : `${assets(changed)} con la paleta nueva.`,
        });
        onClose();
      },
      onError: (e) => toast({ title: 'No se pudo aplicar la paleta', description: String((e as Error).message ?? e), variant: 'destructive' }),
    });
  };

  return (
    <div className="relative bg-card/80 border-2 border-primary/40 p-4 rounded-xl px-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
      <button
        onClick={onClose}
        className="absolute right-3 top-3 text-muted-foreground hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-full"
      >
        <PxX size={18} />
      </button>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <span className="nube-cuerpo text-primary uppercase w-32 shrink-0 whitespace-nowrap">Paleta</span>
        <select
          value=""
          onChange={(e) => {
            const preset = PALETTE_LIBRARY.find((p) => p.id === e.target.value);
            if (preset) setDraft(paletteFromPreset(preset));
          }}
          className="nube-cuerpo h-[54px] bg-background/80 border border-primary/30 rounded-lg px-3 text-foreground w-fit"
        >
          <option value="">{draft.name}</option>
          {PALETTE_LIBRARY.map((p) => <option key={p.id} value={p.id}>Cambiar por {p.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {draft.colors.map((c, i) => (
            <label key={i} title={`Color ${i + 1}: ${c}`} className="w-7 h-7 border border-black/40 cursor-pointer" style={{ backgroundColor: c }}>
              <input type="color" value={c.slice(0, 7)} onChange={(e) => setColor(i, e.target.value)} className="opacity-0 w-0 h-0" />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <span className="nube-etiqueta text-muted-foreground uppercase flex-1">
          {!current
            ? 'El proyecto todavía no tiene paleta: los assets nuevos van a nacer con esta.'
            : `${plan.follow.length === 1 ? 'Cambia' : 'Cambian'} ${assets(plan.follow.length)}${plan.keep.length ? ` · ${plan.keep.length === 1 ? '1 queda como está (tiene' : `${plan.keep.length} quedan como están (tienen`} colores propios)` : ''}`
              + (current && !remapsByIndex(current, draft) ? ' · cada color va al más parecido de la nueva' : '')}
        </span>
        <Button variant="ghost" onClick={() => setDraft(current ?? defaultPalette())} disabled={!dirty || apply.isPending} className="nube-cuerpo">
          DESCARTAR
        </Button>
        <Button onClick={onApply} disabled={!dirty || apply.isPending} className="nube-cuerpo bg-primary text-primary-foreground">
          {apply.isPending && <PxLoader className="animate-spin mr-2" size={14} />}
          APLICAR
        </Button>
      </div>
    </div>
  );
}
