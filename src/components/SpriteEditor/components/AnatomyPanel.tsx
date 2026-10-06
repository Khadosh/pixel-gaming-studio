import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { RefreshCcw, User, Settings2, Boxes, MousePointer2 } from 'lucide-react';
import { PxBone } from '@/components/icons/PixelIcon';
import type { AnatomyConfig, MemberType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { dims } from '@/headless/assetModel';

const DEFAULT_MEMBERS: { type: MemberType, label: string }[] = [
  { type: 'head', label: 'Head' },
  { type: 'torso', label: 'Torso' },
  { type: 'arm_left', label: 'Left Arm' },
  { type: 'arm_right', label: 'Right Arm' },
  { type: 'leg_left', label: 'Left Leg' },
  { type: 'leg_right', label: 'Right Leg' },
];

export function AnatomyPanel() {
  const projectConfig = useSpriteEditorStore(s => s.projectConfig);
  const isOneWay = projectConfig?.directionality === '1-way';
  const asset = useSpriteEditorStore(s => s.editedAsset);
  const setEditedAsset = useSpriteEditorStore(s => s.setEditedAsset);
  const selectedOrientation = useSpriteEditorStore(s => s.anatomySelectedOrientation);
  const setSelectedOrientation = useSpriteEditorStore(s => s.setAnatomySelectedOrientation);
  const activeMemberId = useSpriteEditorStore(s => s.anatomyActiveMemberId);
  const setActiveMemberId = useSpriteEditorStore(s => s.setAnatomyActiveMemberId);
  const isSelectionMode = useSpriteEditorStore(s => s.anatomyIsSelectionMode);
  const setIsSelectionMode = useSpriteEditorStore(s => s.setAnatomyIsSelectionMode);
  const fillMemberGaps = useSpriteEditorStore(s => s.fillMemberGaps);

  if (!asset) return null;

  const anatomy = asset.anatomy || { mode: 'auto' };
  const { mode = 'auto' } = anatomy;
  // Rows are bounded by the canvas height, columns by its width.
  const { width: assetWidth, height: assetHeight } = dims(asset);

  const handleUpdate = (updates: Partial<AnatomyConfig> | null) => {
    const newAnatomy = updates === null ? undefined : { ...anatomy, ...updates };
    setEditedAsset(prev => ({ ...prev, anatomy: newAnatomy }));
  };

  const setMode = (m: 'auto' | 'humanoid' | 'custom') => {
    handleUpdate({ mode: m });
  };

  const initOrientation = () => {
    const orientations = { ...(anatomy.orientations || {}) };
    orientations[selectedOrientation] = {
      members: DEFAULT_MEMBERS.map(m => ({
        id: `${m.type}_${selectedOrientation}`,
        type: m.type,
        label: m.label,
        area: { startR: 0, endR: 0, startC: 0, endC: 0 },
        pivot: { r: 0, c: 0 },
        pixels: []
      }))
    };
    handleUpdate({ orientations });
  };

  const currentOrientation = anatomy.orientations?.[selectedOrientation];
  const members = currentOrientation?.members || [];

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PxBone className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Anatomy Engine</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => handleUpdate(null)}
          title="Reset to Defaults"
        >
          <RefreshCcw className="w-3 h-3" />
        </Button>
      </div>

      <div className="grid grid-cols-3 p-1 bg-background/50 rounded-md gap-1">
        {(['auto', 'humanoid', 'custom'] as const).map(m => (
          <Button
            key={m}
            variant={mode === m ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-[10px] gap-1 capitalize px-1"
            onClick={() => setMode(m)}
          >
            {m === 'auto' && <Settings2 className="w-3 h-3 flex-shrink-0" />}
            {m === 'humanoid' && <User className="w-3 h-3 flex-shrink-0" />}
            {m === 'custom' && <Boxes className="w-3 h-3 flex-shrink-0" />}
            <span className="truncate">{m}</span>
          </Button>
        ))}
      </div>

      {/* ORIENTATION TABS */}
      {!isOneWay && (
        <div className="flex border-b border-border/50 gap-4 mt-2">
          {([0, 1, 2] as const).map(idx => (
            <button
              key={idx}
              className={cn(
                "pb-1 text-[10px] font-bold uppercase transition-colors border-b-2",
                selectedOrientation === idx
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
              onClick={() => setSelectedOrientation(idx)}
            >
              {idx === 0 ? 'Front' : idx === 1 ? 'Side' : 'Back'}
            </button>
          ))}
        </div>
      )}
      {isOneWay && (
        <div className="flex border-b border-border/50 gap-4 mt-2">
          <div className="pb-1 text-[10px] font-bold uppercase text-primary border-b-2 border-primary">
            Side Profile (1-Way)
          </div>
        </div>
      )}

      {mode === 'custom' ? (
        <div className="space-y-4 pt-2">
          {!currentOrientation ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-[10px] text-muted-foreground">No limb configuration for this view.</p>
              <Button size="sm" className="h-7 text-[10px] px-4" onClick={initOrientation}>
                Initialize Dismemberment
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Limbs & Segments</span>
                {activeMemberId && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 text-[10px] gap-1.5 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                      onClick={() => fillMemberGaps()}
                      title="Fill enclosed area"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      Fill Mask
                    </Button>
                    <Button
                      size="sm"
                      variant={isSelectionMode ? "default" : "outline"}
                      className={cn(
                        "h-7 flex-1 text-[10px] gap-1.5",
                        isSelectionMode ? "bg-sky-500 hover:bg-sky-600 border-transparent text-white" : "text-muted-foreground"
                      )}
                      onClick={() => setIsSelectionMode(!isSelectionMode)}
                    >
                      <MousePointer2 className="w-3 h-3" />
                      {isSelectionMode ? "Painting..." : "Select Pixels"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-1">
                {members.map(member => (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center justify-between p-1.5 rounded-md border transition-all cursor-pointer",
                      activeMemberId === member.id
                        ? "bg-primary/10 border-primary/40"
                        : "bg-background/40 border-transparent hover:border-border/50"
                    )}
                    onClick={() => {
                      setActiveMemberId(member.id);
                      if (activeMemberId !== member.id) setIsSelectionMode(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        member.type.includes('arm') ? "bg-sky-400" :
                          member.type.includes('leg') ? "bg-pink-400" :
                            member.type === 'head' ? "bg-yellow-400" : "bg-orange-400"
                      )} />
                      <span className="text-[11px] font-medium">{member.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">
                        {member.pixels?.length || 0} px
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {isSelectionMode && (
                <div className="bg-sky-500/10 border border-sky-500/30 rounded p-2 text-[9px] text-sky-200 mt-2">
                  <p className="font-bold mb-1">Pixel Selection Active:</p>
                  <p>Click pixels on the canvas to add/remove them from <b>{members.find(m => m.id === activeMemberId)?.label}</b>.</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {/* LEGACY SLIDERS FOR AUTO/HUMANOID MODES */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-sky-400/80 uppercase tracking-tighter">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Core Hierarchy</span>
            </div>

            <div className="space-y-3">
              <SliderLabel label="Head Base (Neck)" value={anatomy.neckRow} />
              <Slider
                value={[anatomy.neckRow ?? Math.floor(assetHeight * 0.35)]}
                max={assetHeight - 1} step={1}
                onValueChange={([v]) => handleUpdate({ neckRow: v })}
              />

              <SliderLabel label="Torso Base (Waist)" value={anatomy.waistRow} />
              <Slider
                value={[anatomy.waistRow ?? Math.floor(assetHeight * 0.7)]}
                max={assetHeight - 1} step={1}
                onValueChange={([v]) => handleUpdate({ waistRow: v })}
              />
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-border/10">
            <div className="flex items-center gap-2 text-[11px] font-bold text-purple-400/80 uppercase tracking-tighter">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>Limb Constraints</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] text-purple-400">Torso L</Label>
                <Slider value={[anatomy.torsoLeft ?? 0]} max={assetWidth - 1} onValueChange={([v]) => handleUpdate({ torsoLeft: v })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-orange-400">Torso R</Label>
                <Slider value={[anatomy.torsoRight ?? assetWidth - 1]} max={assetWidth - 1} onValueChange={([v]) => handleUpdate({ torsoRight: v })} />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <SliderLabel label="Knee Level" value={anatomy.kneeRow} />
              <Slider
                value={[anatomy.kneeRow ?? Math.floor(assetHeight * 0.85)]}
                max={assetHeight - 1} step={1}
                onValueChange={([v]) => handleUpdate({ kneeRow: v })}
              />

              <SliderLabel label="Ankle Level" value={anatomy.ankleRow} />
              <Slider
                value={[anatomy.ankleRow ?? Math.floor(assetHeight * 0.95)]}
                max={assetHeight - 1} step={1}
                onValueChange={([v]) => handleUpdate({ ankleRow: v })}
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-muted/50 border border-border/50 rounded p-2 text-[9px] text-muted-foreground flex gap-2 items-start mt-4 italic">
        <Settings2 className="w-3 h-3 shrink-0" />
        <p>Configuring anatomy in the <b>BASE</b> orientation (Front/Side/Back) will allow for advanced limb manipulation in animation frames.</p>
      </div>
    </div>
  );
}

function SliderLabel({ label, value }: { label: string, value?: number }) {
  return (
    <div className="flex justify-between items-center text-[10px]">
      <Label className="font-medium text-muted-foreground">{label}</Label>
      <span className="font-mono bg-background px-1 rounded">{value ?? 'AUTO'}</span>
    </div>
  );
}
