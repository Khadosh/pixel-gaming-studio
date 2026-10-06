import React, { useState } from 'react';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { animate_body } from '@/lib/sprite/generators/animate_body';
import { MemberType } from '@/lib/types';
import { PxSparkles } from '@/components/icons/PixelIcon';
import { ScrollArea } from '@/components/ui/scroll-area';

type ActionType = 'desplazar' | 'expandir' | 'colapsar' | 'rotar';

const MEMBERS: { id: MemberType; label: string }[] = [
  { id: 'head', label: 'Head' },
  { id: 'torso', label: 'Torso' },
  { id: 'arm_left', label: 'Arm L' },
  { id: 'arm_right', label: 'Arm R' },
  { id: 'leg_left', label: 'Leg L' },
  { id: 'leg_right', label: 'Leg R' },
];

export function ProceduralAnimPanel() {
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const editingFrameIndex = useSpriteEditorStore(s => s.editingFrameIndex);
  const activeLayerId = useSpriteEditorStore(s => s.activeLayerId);
  const activePerspective = useSpriteEditorStore(s => s.activePerspective);
  const setEditedAsset = useSpriteEditorStore(s => s.setEditedAsset);
  const pushUndo = useSpriteEditorStore(s => s.pushUndo);

  const [selectedMembers, setSelectedMembers] = useState<MemberType[]>([]);
  const [action, setAction] = useState<ActionType>('desplazar');

  // Params
  const [dr, setDr] = useState(0);
  const [dc, setDc] = useState(0);
  const [angle, setAngle] = useState(0);
  const [pivotSide, setPivotSide] = useState<'top' | 'bottom'>('bottom');

  const orientationIdx = activePerspective === 'front' ? 0 : activePerspective === 'side' ? 1 : 2;

  const toggleMember = (m: MemberType) => {
    setSelectedMembers(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const handleApply = () => {
    if (selectedMembers.length === 0) return;

    pushUndo();

    const layerIndex = editedAsset.layers?.findIndex(l => l.id === activeLayerId);
    if (layerIndex === undefined || layerIndex === -1) return;

    const layer = editedAsset.layers![layerIndex];
    const currentFrame = layer.frames[editingFrameIndex];

    const builder = animate_body(currentFrame, editedAsset.anatomy, orientationIdx);

    if (action === 'desplazar') {
      builder.desplazar(selectedMembers, dr, dc);
    } else if (action === 'expandir') {
      builder.expandir(selectedMembers, dr);
    } else if (action === 'colapsar') {
      builder.colapsar(selectedMembers, dr, pivotSide);
    } else if (action === 'rotar') {
      builder.rotar(selectedMembers, angle, dr, dc);
    }

    const newFrame = builder.build();

    setEditedAsset(prev => {
      const newLayers = [...(prev.layers || [])];
      const newFrames = [...newLayers[layerIndex].frames];
      newFrames[editingFrameIndex] = newFrame;
      newLayers[layerIndex] = { ...newLayers[layerIndex], frames: newFrames };
      
      return { ...prev, layers: newLayers };
    });
  };

  return (
    <ScrollArea className="h-full pr-3">
      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <PxSparkles className="w-4 h-4 text-primary" />
          <h3 className="nube-titulo uppercase ">Procedural FX</h3>
        </div>

        <div className="nube-etiqueta bg-muted/50 border border-border/50 rounded p-2 text-muted-foreground flex gap-2 items-start mt-4 mb-4">
          <PxSparkles className="w-3 h-3 shrink-0" />
          <p>Esta herramienta aplica transformaciones procedurales al frame actual. Usa la anatomía configurada, o la infiere automáticamente de la pose base si no hay una definida.</p>
        </div>

        <div className="space-y-3">
          <Label className="nube-etiqueta text-muted-foreground uppercase ">Partes a Afectar</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {MEMBERS.map(m => (
              <button
                key={m.id}
                onClick={() => toggleMember(m.id)}
                className={`nube-cuerpo-apretado py-1.5 rounded transition-colors ${
                  selectedMembers.includes(m.id) 
                    ? 'bg-primary/20 text-primary border border-primary/50' 
                    : 'bg-background/40 text-muted-foreground hover:bg-white/10 border border-transparent'
                }`}
              >
                {m.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <Label className="nube-etiqueta text-muted-foreground uppercase ">Acción</Label>
          <Select value={action} onValueChange={(v: ActionType) => setAction(v)}>
            <SelectTrigger className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0f] border-primary/40">
              <SelectItem value="desplazar" className="nube-cuerpo ">MOVER (OFFSET)</SelectItem>
              <SelectItem value="rotar" className="nube-cuerpo ">ROTAR</SelectItem>
              <SelectItem value="expandir" className="nube-cuerpo ">EXPANDIR (STRETCH)</SelectItem>
              <SelectItem value="colapsar" className="nube-cuerpo ">COLAPSAR (SQUASH)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          {action === 'desplazar' && (
            <>
              <div className="space-y-1.5">
                <Label className="nube-etiqueta text-muted-foreground">OFFSET Y (DR)</Label>
                <Input type="number" value={dr} onChange={e => setDr(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="nube-etiqueta text-muted-foreground">OFFSET X (DC)</Label>
                <Input type="number" value={dc} onChange={e => setDc(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
              </div>
            </>
          )}
          {action === 'expandir' && (
            <div className="space-y-1.5 col-span-2">
              <Label className="nube-etiqueta text-muted-foreground">CANTIDAD (PÍXELES)</Label>
              <Input type="number" value={dr} onChange={e => setDr(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
            </div>
          )}
          {action === 'colapsar' && (
            <>
              <div className="space-y-1.5">
                <Label className="nube-etiqueta text-muted-foreground">CANTIDAD</Label>
                <Input type="number" value={dr} onChange={e => setDr(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="nube-etiqueta text-muted-foreground">PIVOTE</Label>
                <Select value={pivotSide} onValueChange={(v: 'top'|'bottom') => setPivotSide(v)}>
                  <SelectTrigger className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0f] border-primary/40">
                    <SelectItem value="bottom" className="nube-cuerpo ">ABAJO</SelectItem>
                    <SelectItem value="top" className="nube-cuerpo ">ARRIBA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {action === 'rotar' && (
            <>
              <div className="space-y-1.5 col-span-2">
                <Label className="nube-etiqueta text-muted-foreground">ÁNGULO (GRADOS)</Label>
                <Input type="number" value={angle} onChange={e => setAngle(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="nube-etiqueta text-muted-foreground">OFFSET Y</Label>
                <Input type="number" value={dr} onChange={e => setDr(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="nube-etiqueta text-muted-foreground">OFFSET X</Label>
                <Input type="number" value={dc} onChange={e => setDc(Number(e.target.value))} className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10" />
              </div>
            </>
          )}
        </div>

        <div className="pt-4">
          <Button
            onClick={handleApply}
            disabled={selectedMembers.length === 0}
            className="nube-cuerpo w-full h-10 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/30 transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            APLICAR AL FRAME
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
