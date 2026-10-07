import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectConfig } from '@/lib/supabase';
import { PxFolder, PxSparkles } from '@/components/icons/PixelIcon';

interface CreateProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, config: ProjectConfig) => void;
  isPending: boolean;
}

const DIRECTIONALITY_OPTIONS: { id: ProjectConfig['directionality'], label: string, desc: string }[] = [
  { id: '1-way', label: '1-Way / Side-Scroller', desc: 'Ideal para juegos de plataformas o personajes estáticos.' },
  { id: '4-way', label: '4-Way / Top-Down', desc: 'Ideal para RPGs, vista aérea (Frente, Espalda, Lados).' }
];

const AESTHETICS_OPTIONS: { id: ProjectConfig['aesthetics'], label: string }[] = [
  { id: 'custom', label: 'Libre (Custom)' },
  { id: 'gameboy', label: 'Gameboy (4 colores)' },
  { id: '8-bit', label: '8-Bit Retro' },
  { id: '16-bit', label: '16-Bit SNES' },
  { id: 'fantasy', label: 'Fantasía Oscura' },
  { id: 'cyberpunk', label: 'Cyberpunk Neon' },
  { id: 'sci-fi', label: 'Sci-Fi Espacial' }
];

export function CreateProjectWizard({ isOpen, onClose, onCreate, isPending }: CreateProjectWizardProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [directionality, setDirectionality] = useState<ProjectConfig['directionality']>('1-way');
  const [aesthetics, setAesthetics] = useState<ProjectConfig['aesthetics']>('custom');

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setName('');
      setDirectionality('1-way');
      setAesthetics('custom');
    }
  }, [isOpen]);

  const handleNext = () => setStep(s => s + 1);
  const handlePrev = () => setStep(s => s - 1);
  
  const handleFinish = () => {
    onCreate(name, { directionality, aesthetics });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="nube-pagina text-primary flex items-center gap-2">
            <PxSparkles size={20} />
            NUEVO MUNDO
          </DialogTitle>
          <DialogDescription className="nube-cuerpo text-muted-foreground">
            Configura las reglas base de tu nuevo proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 min-h-[250px] flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="nube-titulo text-foreground">1. NOMBRE DEL PROYECTO</h3>
              <p className="nube-cuerpo text-muted-foreground">
                ¿Cómo se llamará este nuevo juego o colección de assets?
              </p>
              <Input
                autoFocus
                placeholder="Ej. Mi Aventura Epica..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="nube-cuerpo h-14 bg-secondary/50"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) handleNext();
                }}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="nube-titulo text-foreground">2. DIRECCIONALIDAD</h3>
              <p className="nube-cuerpo text-muted-foreground">
                ¿Cuántas perspectivas tendrán los personajes de este mundo?
              </p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                {DIRECTIONALITY_OPTIONS.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => setDirectionality(opt.id)}
                    className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${
                      directionality === opt.id 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border bg-secondary/50 hover:border-primary/50'
                    }`}
                  >
                    <div className="nube-titulo text-foreground mb-1">{opt.label}</div>
                    <div className="nube-etiqueta text-muted-foreground">{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="nube-titulo text-foreground">3. ESTÉTICA GLOBAL</h3>
              <p className="nube-cuerpo text-muted-foreground">
                Esta premisa guiará a la IA al generar nuevos sprites para este proyecto.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {AESTHETICS_OPTIONS.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => setAesthetics(opt.id)}
                    className={`cursor-pointer p-3 rounded-lg border-2 text-center transition-all ${
                      aesthetics === opt.id 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border bg-secondary/50 hover:border-primary/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="nube-cuerpo">{opt.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full border-t border-border pt-4">
          <div className="nube-cuerpo text-muted-foreground">
            Paso {step} / 3
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={handlePrev} className="nube-cuerpo">
                ATRÁS
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={handleNext} disabled={step === 1 && !name.trim()} className="nube-cuerpo">
                SIGUIENTE
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={isPending} className="nube-cuerpo bg-primary text-primary-foreground hover:brightness-110">
                {isPending ? 'CREANDO...' : 'CREAR MUNDO'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
