import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PxSparkles, PxUpload, PxX, PxLoader, PxArrowLeft, PxGrid, PxImage } from '@/components/icons/PixelIcon';
import { Textarea } from '@/components/ui/textarea';
import { AI_CATEGORY_KIND, assetPalette, readProjectPalette } from '@/lib/newAsset';

interface AICreatorWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSize: number;
  aiGeneration: ReturnType<typeof import('@/hooks/useGenerateSpriteFal').useGenerateSpriteFal>;
  projectConfig?: import('@/lib/supabase').ProjectConfig;
}

type Step = 'concept' | 'style' | 'reference';

const CATEGORIES = [
  { id: 'character', label: 'PERSONAJE', icon: '🧙', desc: 'Héroes, NPCs, enemigos' },
  { id: 'creature', label: 'CRIATURA', icon: '🐉', desc: 'Monstruos, mascotas, bestias' },
  { id: 'object', label: 'OBJETO', icon: '⚔️', desc: 'Armas, ítems, props' },
  { id: 'environment', label: 'ENTORNO', icon: '🏰', desc: 'Tiles, edificios, terreno' },
  { id: 'effect', label: 'EFECTO', icon: '✨', desc: 'Partículas, magia, impacto' },
];

const STYLES = [
  { id: 'classic', label: 'CLÁSICO', desc: 'Estilo 8-bit vibrante', color: 'from-blue-500/20' },
  { id: 'dark', label: 'DARK FANTASY', desc: 'Sombrío y detallado', color: 'from-red-500/20' },
  { id: 'cyber', label: 'CYBERPUNK', desc: 'Neon y alto contraste', color: 'from-purple-500/20' },
  { id: 'cute', label: 'KAWAII', desc: 'Colores pastel y suaves', color: 'from-pink-500/20' },
  { id: 'retro', label: 'RETRO RPG', desc: 'SNES / GBA dorado', color: 'from-amber-500/20' },
  { id: 'minimal', label: 'MINIMAL', desc: 'Paleta limitada y limpia', color: 'from-slate-400/20' },
];

const STEP_INFO: Record<Step, { num: number; label: string }> = {
  concept: { num: 1, label: 'CONCEPTO' },
  style: { num: 2, label: 'ESTILO' },
  reference: { num: 3, label: 'GENERAR' },
};

export const AICreatorWizard: React.FC<AICreatorWizardProps> = ({ open, onOpenChange, projectSize, aiGeneration, projectConfig }) => {
  const [step, setStep] = useState<Step>('concept');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('character');
  const [style, setStyle] = useState('classic');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [strength, setStrength] = useState('0.65');
  const [maxColors, setMaxColors] = useState(24);

  const { generate, isGenerating, error } = aiGeneration;

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setReferenceImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, []);

  const handleGenerate = async () => {
    const isOneWay = projectConfig?.directionality === '1-way';
    const viewPrefix = isOneWay ? 'side profile view of a' : 'front view of a';
    let finalPrompt = `${viewPrefix} ${category}, ${prompt}`;
    if (projectConfig?.aesthetics && projectConfig.aesthetics !== 'custom') {
      finalPrompt += `, strictly ${projectConfig.aesthetics} pixel art aesthetic`;
    } else {
      finalPrompt += `, ${style} pixel art style`;
    }
    finalPrompt += `, high quality`;
    
    await generate(finalPrompt, projectSize, referenceImage || undefined, { 
      strength: parseFloat(strength),
      maxColors,
      projectConfig,
      category: AI_CATEGORY_KIND[category] ?? 'character',
      // Sólo si el proyecto tiene una: sin paleta propia, la IA elige sus colores.
      palette: (() => {
        const own = readProjectPalette(projectConfig);
        return own ? assetPalette(own).palette : undefined;
      })(),
    });
  };

  const hasFixedStyle = projectConfig?.aesthetics && projectConfig.aesthetics !== 'custom';
  const stepOrder: Step[] = hasFixedStyle ? ['concept', 'reference'] : ['concept', 'style', 'reference'];

  const renderStepIndicator = () => (
    <div className="flex items-center gap-1 w-full">
      {stepOrder.map((s, i) => {
        const info = STEP_INFO[s];
        const isActive = step === s;
        const isPast = stepOrder.indexOf(step) > i;
        return (
          <React.Fragment key={s}>
            <button
              onClick={() => { if (isPast) setStep(s); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
                isActive 
                  ? 'bg-primary/15 border border-primary/40' 
                  : isPast 
                    ? 'opacity-60 hover:opacity-80 cursor-pointer' 
                    : 'opacity-30 cursor-default'
              }`}
            >
              <span className={`nube-etiqueta w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                isActive 
                  ? 'bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,197,94,0.4)]' 
                  : isPast 
                    ? 'bg-primary/40 text-primary-foreground' 
                    : 'bg-secondary/60 text-muted-foreground'
              }`}>
                {isPast ? '✓' : info.num}
              </span>
              <span className={`nube-etiqueta nube-track-1 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {info.label}
              </span>
            </button>
            {i < stepOrder.length - 1 && (
              <div className={`flex-1 h-px transition-all duration-500 ${isPast ? 'bg-primary/40' : 'bg-border/40'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 'concept':
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Resolution inside wizard — read-only mirror */}
            <div className="relative p-3 rounded-xl border-2 border-primary/30 bg-primary/5">
              <div className="absolute -inset-px bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-xl blur-sm pointer-events-none" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PxGrid size={14} className="text-primary" />
                  <span className="nube-cuerpo text-primary uppercase">Resolución:</span>
                </div>
                <div className="flex items-center gap-1 bg-background/60 rounded-lg p-1 border border-primary/20">
                  {[16, 32, 64].map((s) => (
                    <span
                      key={s}
                      className={`nube-cuerpo px-2 py-1 rounded-md transition-all ${
                        projectSize === s 
                          ? 'bg-primary text-primary-foreground shadow-[0_0_8px_rgba(34,197,94,0.3)]' 
                          : 'text-muted-foreground/40'
                      }`}
                    >
                      {s}×{s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <Label className="nube-cuerpo text-foreground/80 uppercase flex items-center gap-2">
                <PxSparkles size={12} className="text-primary" />
                Describe tu creación
              </Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: Un guerrero samurái con armadura de neón, katana resplandeciente y casco con cuernos..."
                className="nube-cuerpo bg-secondary/10 border-border/60 min-h-[80px] max-h-[120px] resize-none focus-visible:ring-primary/50 focus-visible:border-primary/40 transition-all placeholder:text-muted-foreground/30"
                rows={3}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label className="nube-cuerpo text-foreground/80 uppercase">Categoría</Label>
              <div className="grid grid-cols-5 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200 ${
                      category === c.id 
                        ? 'border-primary bg-primary/10 shadow-[0_0_12px_rgba(34,197,94,0.1)]' 
                        : 'border-border/30 bg-secondary/5 hover:border-border/60 hover:bg-secondary/10'
                    }`}
                  >
                    <span className="text-[16px] leading-none">{c.icon}</span>
                    <span className={`nube-etiqueta ${category === c.id ? 'text-primary' : 'text-muted-foreground'}`}>
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={() => setStep(hasFixedStyle ? 'reference' : 'style')} 
              className="w-full mt-2 nube-cuerpo h-11" 
              disabled={!prompt.trim()}
            >
              CONTINUAR <PxArrowLeft className="ml-2 rotate-180" size={12} />
            </Button>
          </div>
        );

      case 'style':
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <Label className="nube-cuerpo text-muted-foreground uppercase text-center block">Elige un estilo visual</Label>
            <div className="grid grid-cols-2 gap-3">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left flex flex-col gap-1 bg-gradient-to-br ${s.color} to-transparent ${
                    style === s.id ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-border/40 hover:border-border'
                  }`}
                >
                  <span className="nube-cuerpo">{s.label}</span>
                  <span className="nube-etiqueta text-muted-foreground">{s.desc}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep('concept')} className="nube-cuerpo">
                <PxArrowLeft size={12} className="mr-1" /> ATRÁS
              </Button>
              <Button onClick={() => setStep('reference')} className="flex-1 nube-cuerpo h-12">
                CONTINUAR <PxArrowLeft className="ml-2 rotate-180" size={12} />
              </Button>
            </div>
          </div>
        );

      case 'reference': {
        const selectedCategory = CATEGORIES.find(c => c.id === category);
        const selectedStyle = STYLES.find(s => s.id === style);

        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Summary */}
            <div className="p-3 rounded-xl bg-secondary/10 border border-border/30 space-y-2">
              <Label className="nube-etiqueta nube-track-1 text-muted-foreground/60 uppercase">Resumen</Label>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="nube-cuerpo text-primary">{projectSize}×{projectSize}</span>
                <span className="text-border">·</span>
                <span className="nube-cuerpo text-foreground/80">{selectedCategory?.icon} {selectedCategory?.label}</span>
                <span className="text-border">·</span>
                <span className="nube-cuerpo text-foreground/80">{hasFixedStyle ? projectConfig.aesthetics.toUpperCase() : selectedStyle?.label}</span>
              </div>
              <p className="nube-cuerpo text-foreground/60 line-clamp-2">"{prompt}"</p>
            </div>

            {/* Advanced Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="nube-etiqueta text-muted-foreground/80 uppercase">Fidelidad a Referencia</Label>
                <div className="flex items-center gap-2 bg-secondary/10 p-1.5 rounded-lg border border-border/40">
                  {['0.4', '0.7', '0.9'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStrength(s)}
                      className={`nube-etiqueta flex-1 py-1.5 rounded-md transition-all ${
                        strength === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5'
                      }`}
                    >
                      {s === '0.4' ? 'ALTA' : s === '0.7' ? 'MEDIA' : 'BAJA'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="nube-etiqueta text-muted-foreground/80 uppercase">Profundidad de Color</Label>
                <div className="flex items-center gap-2 bg-secondary/10 p-1.5 rounded-lg border border-border/40">
                  {[16, 24, 32].map((c) => (
                    <button
                      key={c}
                      onClick={() => setMaxColors(c)}
                      className={`nube-etiqueta flex-1 py-1.5 rounded-md transition-all ${
                        maxColors === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Reference Image */}
            <div className="space-y-2">
              <Label className="nube-cuerpo text-foreground/80 uppercase flex items-center gap-2">
                <PxImage size={12} className="text-muted-foreground" />
                Imagen de Referencia
                <span className="nube-etiqueta text-muted-foreground/40 normal-case">(opcional)</span>
              </Label>
              
              {!referenceImage ? (
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${
                    isDragging ? 'border-primary bg-primary/5' : 'border-border/40 hover:border-border/60 bg-secondary/5'
                  }`}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleFile(file);
                    };
                    input.click();
                  }}
                >
                  <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center">
                    <PxUpload size={24} className="text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="nube-cuerpo">SOLTAR IMAGEN AQUÍ</p>
                    <p className="nube-etiqueta text-muted-foreground mt-1">O HAZ CLICK PARA EXPLORAR</p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full max-h-[300px] aspect-video rounded-2xl overflow-hidden border border-border group bg-black/20">
                  <img src={referenceImage} className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button variant="destructive" size="sm" onClick={() => setReferenceImage(null)} className="nube-cuerpo-apretado h-8">
                      <PxX size={12} className="mr-1" /> QUITAR
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {!hasFixedStyle && (
                <Button variant="ghost" onClick={() => setStep('style')} className="nube-cuerpo">
                  <PxArrowLeft size={12} className="mr-1" /> ATRÁS
                </Button>
              )}
              {hasFixedStyle && (
                <Button variant="ghost" onClick={() => setStep('concept')} className="nube-cuerpo">
                  <PxArrowLeft size={12} className="mr-1" /> ATRÁS
                </Button>
              )}
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className="flex-1 nube-cuerpo h-12 bg-primary shadow-[0_0_20px_rgba(34,197,94,0.3)]"
              >
                {isGenerating ? <PxLoader className="animate-spin mr-2" size={16} /> : <PxSparkles className="mr-2" size={16} />}
                {isGenerating ? 'MAGIA EN PROGRESO...' : 'GENERAR SPRITE'}
              </Button>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-background border-border p-0 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        {/* Top gradient bar */}
        <div className="h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        
        <div className="p-7 pb-6">
          <DialogHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <PxSparkles className="text-primary" size={20} />
              </div>
              <div>
                <DialogTitle className="nube-pagina uppercase">Generador Maestro</DialogTitle>
                <DialogDescription className="nube-etiqueta text-muted-foreground uppercase">Crea assets premium con asistencia de IA</DialogDescription>
              </div>
            </div>
            
            {/* Step Indicator */}
            {renderStepIndicator()}
          </DialogHeader>

          <div className="pt-5">
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive nube-cuerpo">
                {error}
              </div>
            )}
            {renderStep()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
