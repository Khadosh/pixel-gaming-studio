import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { PxArrowLeft } from '@/components/icons/PixelIcon';

type AuthView = 'login' | 'signup' | 'forgot-password' | 'reset-password';

export default function Auth() {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isRecoveryMode, setRecoveryMode } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'signup') {
      setView('signup');
    } else if (mode === 'login') {
      setView('login');
    }
  }, []);

  useEffect(() => {
    if (isRecoveryMode) {
      setView('reset-password');
    }
  }, [isRecoveryMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (view === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/dashboard');
      } else if (view === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: '¡Registro exitoso!',
          description: 'Revisa tu correo para confirmar tu cuenta.',
        });
      } else if (view === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast({
          title: 'Correo enviado',
          description: 'Si la cuenta existe, recibirás un enlace para recuperar tu contraseña.',
        });
        setView('login');
      } else if (view === 'reset-password') {
        const { error } = await supabase.auth.updateUser({
          password: password,
        });
        if (error) throw error;
        toast({
          title: 'Contraseña actualizada',
          description: 'Tu contraseña ha sido cambiada con éxito. Ya puedes iniciar sesión.',
        });
        setRecoveryMode(false);
        setView('login');
      }
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Ha ocurrido un error inesperado.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (view) {
      case 'signup': return 'Crea tu cuenta';
      case 'forgot-password': return 'Recuperar contraseña';
      case 'reset-password': return 'Nueva contraseña';
      default: return '¡Bienvenido de nuevo!';
    }
  };

  const getSubtitle = () => {
    switch (view) {
      case 'signup': return 'Únete a la comunidad de artistas pixel y guarda tus proyectos.';
      case 'forgot-password': return 'Ingresa tu email y te enviaremos un enlace de recuperación.';
      case 'reset-password': return 'Ingresa tu nueva contraseña para acceder a tu cuenta.';
      default: return 'Inicia sesión para acceder a tu estudio de assets.';
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, hsl(142 72% 50%) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <button
        onClick={() => navigate('/')}
        className="nube-cuerpo absolute top-8 left-8 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
      >
        <PxArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        Volver al inicio
      </button>

      <div className="w-full max-w-md bg-card border border-border p-8 rounded-lg shadow-xl relative z-10">
        <div className="text-center mb-8">
          <h1 className="nube-pagina text-primary mb-2">
            PIXEL GAMING STUDIO
          </h1>
          <h2 className="nube-titulo text-foreground mb-1 uppercase">
            {getTitle()}
          </h2>
          <p className="nube-cuerpo text-muted-foreground">
            {getSubtitle()}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          {view !== 'reset-password' && (
            <div className="space-y-2">
              <Label htmlFor="email" className="nube-etiqueta nube-track-1 text-muted-foreground uppercase">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="pixel@hero.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="nube-cuerpo h-12 bg-secondary/50"
              />
            </div>
          )}
          
          {view !== 'forgot-password' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="nube-etiqueta nube-track-1 text-muted-foreground uppercase">
                  {view === 'reset-password' ? 'Nueva Contraseña' : 'Contraseña'}
                </Label>
                {view === 'login' && (
                  <button
                    type="button"
                    onClick={() => setView('forgot-password')}
                    className="nube-etiqueta text-muted-foreground hover:text-primary transition-colors uppercase"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                className="nube-cuerpo h-12 bg-secondary/50"
              />
            </div>
          )}

          <Button type="submit" className="nube-cuerpo w-full h-12 bg-primary hover:bg-primary/80 transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]" disabled={loading}>
            {loading ? 'PROCESANDO...' : 
             view === 'forgot-password' ? 'ENVIAR ENLACE' : 
             view === 'reset-password' ? 'ACTUALIZAR CONTRASEÑA' : 
             view === 'signup' ? 'REGISTRARSE' : 'INICIAR SESION'}
          </Button>
        </form>

        <div className="mt-8 text-center flex flex-col gap-3">
          {view === 'login' && (
            <button
              onClick={() => setView('signup')}
              className="nube-cuerpo text-muted-foreground hover:text-primary transition-colors"
            >
              ¿No tienes cuenta? Regístrate aquí
            </button>
          )}
          {(view === 'signup' || view === 'forgot-password' || (view === 'reset-password' && !isRecoveryMode)) && (
            <button
              onClick={() => setView('login')}
              className="nube-cuerpo text-muted-foreground hover:text-primary transition-colors"
            >
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
