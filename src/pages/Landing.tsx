import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import SpriteSheetCanvas from '@/components/SpriteSheetCanvas';
import SpritePreview from '@/components/SpritePreview';
import { warrior, treasureChest, waterTile } from '@/lib/assets';
import { PaletteProvider } from '@/hooks/usePalette';

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleStart = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth?mode=signup');
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, hsl(142 72% 50%) 2px, transparent 2px)',
        backgroundSize: '32px 32px',
      }} />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />

      {/* Top Navbar */}
      <nav className="relative z-10 flex items-center justify-between p-6 md:px-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-primary text-sm">✦</span>
          </div>
          <span className="nube-titulo text-primary">PIXEL GAMING STUDIO</span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="nube-cuerpo text-muted-foreground hover:text-white" onClick={() => navigate('/catalog')}>
            Live Catalog
          </Button>
          <Button onClick={() => navigate(user ? '/dashboard' : '/auth?mode=login')} className="nube-cuerpo bg-primary/20 text-primary border border-primary/50 hover:bg-primary hover:text-primary-foreground transition-all">
            {user ? 'DASHBOARD' : 'LOGIN'}
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-20 pb-24 text-center">
        <div className="nube-etiqueta inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full border border-primary/30 bg-primary/10 text-primary">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Supabase + IA Ready
        </div>

        <h1 className="nube-pagina nube-track-2 text-foreground mb-6 max-w-4xl mx-auto drop-shadow-lg">
          CREA Y GESTIONA <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
            TUS PIXEL ARTS
          </span>
        </h1>

        <p className="nube-cuerpo text-muted-foreground max-w-xl mx-auto mb-12">
          El catálogo definitivo para generar, almacenar y editar assets de videojuegos 2D estilo retro. Prototipea rápido copiando templates a tu proyecto y edita la paleta a tu gusto.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20 animate-fade-in-up">
          <Button 
            onClick={handleStart} 
            className="nube-cuerpo px-8 h-14 bg-primary hover:bg-primary/80 text-primary-foreground shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all hover:scale-105"
          >
            COMENZAR GRATIS
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/catalog')} 
            className="nube-cuerpo px-8 h-14 border-border hover:border-primary/50 text-foreground hover:bg-secondary/50 transition-all"
          >
            VER EJEMPLOS
          </Button>
        </div>

        {/* Live Examples Grid */}
        <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 opacity-90 hover:opacity-100 transition-opacity">
          
          {/* Example 1: Animated Warrior */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 transform rotate-1 hover:rotate-0 hover:border-primary/50 transition-all hover:shadow-[0_0_30px_rgba(34,197,94,0.1)]">
            <h3 className="nube-titulo text-muted-foreground">Animado (Humanoid)</h3>
            <div className="scale-150 transform origin-top my-4 pointer-events-none">
              <PaletteProvider defaultPalette={warrior.palette}>
                <SpritePreview asset={warrior} />
              </PaletteProvider>
            </div>
          </div>

          {/* Example 2: Treasure Chest */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 transform -rotate-1 hover:rotate-0 hover:-translate-y-2 hover:border-blue-500/50 transition-all hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]">
            <h3 className="nube-titulo text-muted-foreground">Animado (Prop)</h3>
            <div className="scale-150 transform origin-top my-4 pointer-events-none">
              <PaletteProvider defaultPalette={treasureChest.palette}>
                <SpritePreview asset={treasureChest} />
              </PaletteProvider>
            </div>
          </div>

          {/* Example 3: Water Tile */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 transform rotate-2 hover:rotate-0 hover:translate-y-2 hover:border-emerald-500/50 transition-all hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]">
            <h3 className="nube-titulo text-muted-foreground">Animado (Terrain)</h3>
            <div className="scale-150 transform origin-top my-4 pointer-events-none">
              <PaletteProvider defaultPalette={waterTile.palette}>
                <SpritePreview asset={waterTile} />
              </PaletteProvider>
            </div>
          </div>
          
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border mt-20 pt-8 pb-12 flex flex-col items-center">
        <p className="nube-cuerpo text-muted-foreground">
          Generación Dinámica con IA — Próximamente (Etapa 2)
        </p>
      </footer>
    </div>
  );
}
