import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { PxFolder, PxLogOut, PxPlus, PxSparkles } from '@/components/icons/PixelIcon';
import { useProjects, useCreateProject } from '@/hooks/useProjectQueries';
import { createSpec } from '@/lib/slugUtils';
import { CreateProjectWizard } from '@/components/Dashboard/CreateProjectWizard';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useProjects();
  const createProjectMutation = useCreateProject();
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const handleCreateProject = async (name: string, config: import('@/lib/supabase').ProjectConfig) => {
    if (createProjectMutation.isPending) return;

    createProjectMutation.mutate({ name: name.trim(), config }, {
      onSuccess: () => {
        setIsWizardOpen(false);
        toast({ title: 'Mundo creado', description: 'Tu nuevo proyecto está listo.' });
      },
      onError: (error: any) => {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar Minimalista */}
      <nav className="border-b border-border bg-card/50 backdrop-blur top-0 sticky z-10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-primary text-[10px]">✦</span>
          </div>
          <span className="font-pixel text-primary text-xs tracking-wider">PIXEL GAMING STUDIO</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground font-mono text-[10px] hidden sm:inline-block">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-white transition-colors">
            <PxLogOut size={16} className="mr-2" />
            <span className="font-mono text-xs">Logout</span>
          </Button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        
        {/* Create Project Section */}
        <section className="mb-12 bg-card border border-border p-6 rounded-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="font-pixel text-foreground tracking-wider text-sm mb-2">TUS PROYECTOS</h2>
              <p className="text-muted-foreground font-mono text-xs max-w-lg">
                Crea un proyecto para empezar a guardar, organizar y editar tus colecciones de pixel art generadas.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsWizardOpen(true)} className="bg-primary text-primary-foreground font-pixel text-[10px] whitespace-nowrap border border-primary hover:brightness-110">
                <PxSparkles size={14} className="mr-2" />
                NUEVO MUNDO
              </Button>
            </div>
          </div>
        </section>

        <CreateProjectWizard 
          isOpen={isWizardOpen} 
          onClose={() => setIsWizardOpen(false)} 
          onCreate={handleCreateProject}
          isPending={createProjectMutation.isPending}
        />

        {/* Projects Grid */}
        <section>
          {isLoading ? (
            <div className="text-center py-20 font-pixel text-muted-foreground text-xs animate-pulse">
              CARGANDO PROYECTOS...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/20">
              <PxFolder className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="font-pixel text-muted-foreground text-xs mb-2">NINGUN PROYECTO AUN</p>
              <p className="font-mono text-muted-foreground text-[10px]">Escribe un nombre arriba y crea tu primer workspace.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div 
                  key={project.id}
                  onClick={() => navigate(`/project/${project.slug}`)}
                  className="group bg-card border border-border p-5 rounded-lg hover:border-primary/50 transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-[0_0_15px_rgba(34,197,94,0.1)] relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150" />
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-secondary border border-border rounded-md text-primary group-hover:text-primary-foreground group-hover:bg-primary transition-colors">
                      <PxFolder size={18} />
                    </div>
                  </div>
                  <h3 className="font-mono font-bold text-lg text-foreground mb-1 group-hover:text-primary transition-colors line-clamp-1">
                    {project.name}
                  </h3>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    Creado {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
