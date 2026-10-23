import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectSprite } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { PxArrowLeft, PxPlus, PxImage, PxTrash, PxSparkles, PxLoader, PxX, PxCopy, PxEdit } from '@/components/icons/PixelIcon';
import { PaletteProvider } from '@/hooks/usePalette';
import SpriteSheetCanvas from '@/components/SpriteSheetCanvas';
import { useGenerateSpriteFal } from '@/hooks/useGenerateSpriteFal';
import type { SpriteAsset } from '@/lib/types';
import { useProject, useProjectSprites, useCreateSprite, useDeleteSprite, useUpdateProject, useUpdateProjectConfig } from '@/hooks/useProjectQueries';
import { PALETTE_LIBRARY } from '@/lib/assets/palettes';
import {
  ASSET_KINDS, CANVAS_SIZES, blankAsset, defaultPalette, kindInfo, paletteFromPreset, readProjectPalette,
  type AssetKind, type CanvasSize,
} from '@/lib/newAsset';
import { parseSpec } from '@/lib/slugUtils';
import { AICreatorWizard } from '@/components/AICreatorWizard';
import { ProjectPalettePanel } from '@/components/ProjectPalettePanel';

export default function ProjectWorkspace() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const id = parseSpec(projectSlug || '');
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: project, isLoading: isProjectLoading, error: projectError } = useProject(id);
  const { data: sprites = [], isLoading: isSpritesLoading } = useProjectSprites(project?.id);
  
  const createSpriteMutation = useCreateSprite();
  const deleteSpriteMutation = useDeleteSprite();

  // Creation panel state
  const [showCreator, setShowCreator] = useState(false);
  const [showAIWizard, setShowAIWizard] = useState(false);
  // Tipo primero, el tamaño lo sugiere el tipo, la paleta es la del proyecto (#10).
  const [assetKind, setAssetKind] = useState<AssetKind>('character');
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(kindInfo('character').size);
  /** Un preset de la biblioteca elegido en lugar de la paleta del proyecto; null = la del proyecto. */
  const [presetId, setPresetId] = useState<string | null>(null);
  const [saveAsProjectPalette, setSaveAsProjectPalette] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const updateProjectConfigMutation = useUpdateProjectConfig();
  const aiGeneration = useGenerateSpriteFal();
  const { result: generatedSprite, clear: clearGenerated } = aiGeneration;

  // Editor modal state
  const [searchQuery, setSearchQuery] = useState('');

  // When generation completes, save and navigate to studio
  useEffect(() => {
    if (generatedSprite && project?.id) {
      console.log('Generated sprite received, saving to project:', project.id);
      createSpriteMutation.mutate({ projectId: project.id, asset: generatedSprite }, {
        onSuccess: (newSprite) => {
          console.log('Sprite saved successfully, navigating...');
          clearGenerated();
          setShowCreator(false);
          setShowAIWizard(false);
          const pPath = projectSlug || id;
          const sPath = newSprite.slug;
          navigate(`/project/${pPath}/editor/${sPath}`);
        },
        onError: (err) => {
          console.error('Failed to save generated sprite:', err);
          toast({ title: 'Error al guardar', description: 'No se pudo guardar el sprite generado.', variant: 'destructive' });
        }
      });
    }
  }, [generatedSprite, project?.id, id, navigate]);

  // Handle project loading error
  useEffect(() => {
    if (projectError) {
      toast({ title: 'Error', description: (projectError as Error).message, variant: 'destructive' });
      navigate('/dashboard');
    }
  }, [projectError, toast, navigate]);

  const handleDeleteSprite = async (e: React.MouseEvent, spriteId: string) => {
    e.stopPropagation();
    if (!project?.id) return;
    
    deleteSpriteMutation.mutate({ id: spriteId, projectId: project.id }, {
      onSuccess: () => {
        toast({ title: 'Eliminado' });
      },
      onError: (error: Error) => {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    });
  };

  const handleOpenEditorForSprite = (sprite: ProjectSprite) => {
    if (!projectSlug) return;
    navigate(`/project/${projectSlug}/editor/${sprite.slug}`);
  };

  const toggleTag = (tag: string) => {
    const tokens = searchQuery.split(/\s+/).filter(Boolean);
    const tagToken = `#${tag.toLowerCase()}`;
    const index = tokens.findIndex(t => t.toLowerCase() === tagToken);
    
    if (index >= 0) {
      tokens.splice(index, 1);
    } else {
      tokens.push(tagToken);
    }
    setSearchQuery(tokens.join(' ') + (tokens.length > 0 ? ' ' : ''));
  };

  const filteredSprites = sprites.filter(s => {
    if (!searchQuery.trim()) return true;
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/);
    const asset = s.asset_data as SpriteAsset;
    
    const tagTokens = tokens.filter(t => t.startsWith('#')).map(t => t.slice(1));
    const textTokens = tokens.filter(t => !t.startsWith('#'));
    
    // AND logic for tags: all required tags must be present
    const hasAllTags = tagTokens.every(t => 
      asset.tags?.some(at => at.toLowerCase() === t) ||
      asset.category.toLowerCase() === t
    );
    
    // ANY logic for text: at least one text token matches name
    const matchesText = textTokens.length === 0 || textTokens.some(t => 
      asset.name.toLowerCase().includes(t)
    );
    
    return hasAllTags && matchesText;
  });

  const topTags = Object.entries(
    sprites.reduce((acc, s) => {
      const asset = s.asset_data as SpriteAsset;
      asset.tags?.forEach(t => {
        acc[t] = (acc[t] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>)
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const handleCloneSprite = async (e: React.MouseEvent, sprite: ProjectSprite) => {
    e.stopPropagation();
    if (!project?.id) return;
    
    const originalAsset = sprite.asset_data as SpriteAsset;
    const clonedAsset: SpriteAsset = {
      ...originalAsset,
      id: crypto.randomUUID(),
      name: `${originalAsset.name} (Copia)`
    };

    createSpriteMutation.mutate({ projectId: project.id, asset: clonedAsset }, {
      onSuccess: () => {
        toast({ title: 'Sprite clonado', description: `Se ha creado una copia de ${originalAsset.name}.` });
      },
      onError: (error: Error) => {
        toast({ title: 'Error al clonar', description: error.message, variant: 'destructive' });
      }
    });
  };

  const updateProjectMutation = useUpdateProject();
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [tempProjectName, setTempProjectName] = useState('');

  // Sync temp name when project loads
  useEffect(() => {
    if (project?.name) {
      setTempProjectName(project.name);
    }
  }, [project?.name]);

  const handleSaveProjectName = async () => {
    if (!project || !tempProjectName.trim() || tempProjectName === project.name) {
      setIsEditingProjectName(false);
      return;
    }

    try {
      const updated = await updateProjectMutation.mutateAsync({ 
        id: project.id, 
        name: tempProjectName.trim() 
      });
      setIsEditingProjectName(false);
      toast({ title: 'Proyecto actualizado' });
      
      // If slug changed, we need to navigate to the new project URL
      if (updated.slug !== projectSlug) {
        navigate(`/project/${updated.slug}`, { replace: true });
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      if (project) setTempProjectName(project.name);
    }
  };

  if (isProjectLoading || isSpritesLoading) {
    return <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary nube-cuerpo">CARGANDO WORKSPACE...</div>;
  }

  if (!project) return null;

  const projectPalette = readProjectPalette(project.config);
  const chosenPreset = presetId ? PALETTE_LIBRARY.find((p) => p.id === presetId) : undefined;
  const newPalette = chosenPreset ? paletteFromPreset(chosenPreset) : (projectPalette ?? defaultPalette());

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="nube-cuerpo flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
            >
              <PxArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              Back to Dashboard
            </button>
            
            <div className="flex items-center gap-3">
              {isEditingProjectName ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={tempProjectName}
                    onChange={(e) => setTempProjectName(e.target.value)}
                    onBlur={handleSaveProjectName}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveProjectName()}
                    className="nube-pagina h-12 w-80 bg-background border-primary"
                  />
                  {updateProjectMutation.isPending && <PxLoader className="animate-spin text-primary" size={16} />}
                </div>
              ) : (
                <h1 
                  className="nube-pagina text-foreground cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                  onClick={() => {
                    setTempProjectName(project.name);
                    setIsEditingProjectName(true);
                  }}
                  title="Click para editar nombre del proyecto"
                >
                  {project.name.toUpperCase()}
                  <PxEdit size={16} className="opacity-30 group-hover:opacity-100" />
                </h1>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => { setShowCreator(!showCreator); clearGenerated(); }}
              className="nube-cuerpo bg-primary text-primary-foreground hover:brightness-110 transition-all border border-primary shadow-[0_0_15px_rgba(34,197,94,0.2)]"
            >
              <PxSparkles size={16} className="mr-2" />
              CREAR SPRITE
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowPalette(!showPalette)}
              className="nube-cuerpo border-primary/40 text-primary"
            >
              PALETA
            </Button>
          </div>
        </div>

        {showPalette && (
          <ProjectPalettePanel project={project} sprites={sprites} onClose={() => setShowPalette(false)} />
        )}

        {/* Unified Creation Panel */}
        {showCreator && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
            {/* Lo que el asset nuevo va a ser: tipo, tamaño y paleta */}
            <div className="relative bg-card/80 border-2 border-primary/40 p-4 rounded-xl px-5 shadow-[0_0_25px_rgba(34,197,94,0.08)] space-y-4">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 rounded-xl blur-sm pointer-events-none" />
              <button
                onClick={() => { setShowCreator(false); clearGenerated(); }}
                className="absolute right-3 top-3 text-muted-foreground hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-full"
              >
                <PxX size={18} />
              </button>

              <div className="relative flex flex-col md:flex-row md:items-center gap-3">
                <span className="nube-cuerpo text-primary uppercase w-32 shrink-0 whitespace-nowrap">1 · Tipo</span>
                <div className="flex flex-wrap items-center gap-1.5 bg-background/80 rounded-lg p-1.5 border border-primary/30 w-fit">
                  {ASSET_KINDS.map((k) => (
                    <button
                      key={k.id}
                      title={k.desc}
                      onClick={() => { setAssetKind(k.id); setCanvasSize(k.size); }}
                      className={`nube-cuerpo px-4 py-2 rounded-md transition-all duration-200 ${assetKind === k.id ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(34,197,94,0.3)]' : 'text-muted-foreground hover:text-foreground hover:bg-white/10'}`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <span className="nube-etiqueta text-muted-foreground uppercase">{kindInfo(assetKind).desc}</span>
              </div>

              <div className="relative flex flex-col md:flex-row md:items-center gap-3">
                <span className="nube-cuerpo text-primary uppercase w-32 shrink-0 whitespace-nowrap">2 · Tamaño</span>
                <div className="flex items-center gap-1.5 bg-background/80 rounded-lg p-1.5 border border-primary/30 w-fit">
                  {CANVAS_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setCanvasSize(s)}
                      className={`nube-cuerpo px-4 py-2 rounded-md transition-all duration-200 ${canvasSize === s ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(34,197,94,0.3)]' : 'text-muted-foreground hover:text-foreground hover:bg-white/10'}`}
                    >
                      {s}×{s}
                    </button>
                  ))}
                </div>
                {canvasSize === kindInfo(assetKind).size && (
                  <span className="nube-etiqueta text-muted-foreground uppercase">El de {kindInfo(assetKind).label.toLowerCase()}</span>
                )}
              </div>

              <div className="relative flex flex-col md:flex-row md:items-center gap-3">
                <span className="nube-cuerpo text-primary uppercase w-32 shrink-0 whitespace-nowrap">3 · Paleta</span>
                <select
                  value={presetId ?? ''}
                  onChange={(e) => { setPresetId(e.target.value || null); setSaveAsProjectPalette(false); }}
                  className="nube-cuerpo h-[54px] bg-background/80 border border-primary/30 rounded-lg px-3 text-foreground w-fit"
                >
                  {projectPalette
                    ? <option value="">Del proyecto: {projectPalette.name}</option>
                    : <option value="">{defaultPalette().name}</option>}
                  {PALETTE_LIBRARY.filter((p) => projectPalette || p.id !== defaultPalette().from).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-0.5 max-w-xs">
                  {newPalette.colors.map((c, i) => (
                    <span key={i} className="w-4 h-4 border border-black/40" style={{ backgroundColor: c }} />
                  ))}
                </div>
                {!projectPalette && (
                  <span className="nube-etiqueta text-muted-foreground uppercase">Queda como la paleta del proyecto</span>
                )}
                {projectPalette && presetId && (
                  <label className="nube-etiqueta text-muted-foreground uppercase flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-primary" checked={saveAsProjectPalette} onChange={(e) => setSaveAsProjectPalette(e.target.checked)} />
                    Usarla de ahora en más en el proyecto
                  </label>
                )}
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Card 1: AI (Premium Violet) */}
              <div className="relative group cursor-pointer" onClick={() => setShowAIWizard(true)}>
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 shadow-[0_0_30px_rgba(168,85,247,0.15)]"></div>
                <div className="relative bg-card border border-purple-500/30 p-5 rounded-2xl flex flex-col h-full space-y-4 transition-all hover:border-purple-500/50">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="bg-purple-500/20 p-2 rounded-lg border border-purple-500/20">
                        <PxSparkles className="text-purple-400" size={18} />
                      </div>
                      <span className="nube-etiqueta bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">PREMIUM</span>
                    </div>
                    <h3 className="nube-titulo text-purple-100 pt-2">MAGIA DE IA</h3>
                    <p className="nube-cuerpo text-purple-200/60">Crea personajes, criaturas u objetos únicos con nuestro asistente de nueva generación.</p>
                  </div>
                  
                  <div className="nube-etiqueta mt-auto pt-4 flex items-center justify-between text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity">
                    <span>COMENZAR PROCESO</span>
                    <PxArrowLeft size={10} className="rotate-180" />
                  </div>
                </div>
              </div>

              {/* Card 2: Catalog (Standard Green) */}
              <div 
                onClick={() => navigate(`/catalog?projectSlug=${projectSlug}&size=${canvasSize}`)}
                className="bg-card border border-primary/20 p-5 rounded-2xl flex flex-col h-full space-y-4 hover:border-primary/50 transition-all cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="bg-primary/10 p-2 rounded-lg border border-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                    <PxImage className="text-primary" size={18} />
                  </div>
                  <h3 className="nube-titulo text-primary/90 pt-2">BIBLIOTECA</h3>
                  <p className="nube-cuerpo text-muted-foreground">Explora cientos de sprites pre-diseñados listos para tu proyecto.</p>
                </div>
                <div className="nube-etiqueta mt-auto pt-4 flex items-center justify-between text-primary opacity-60 group-hover:opacity-100 transition-opacity">
                  <span>EXPLORAR CATÁLOGO</span>
                  <PxArrowLeft size={10} className="rotate-180" />
                </div>
              </div>

              {/* Card 3: Scratch (Standard Bluish) */}
              <div 
                onClick={() => {
                  if (!project?.id) return;
                  const blank = blankAsset({ kind: assetKind, size: canvasSize, palette: newPalette });
                  // Sin paleta propia, la elegida pasa a ser la del proyecto; con una, sólo si se pidió.
                  if (!projectPalette || saveAsProjectPalette) {
                    updateProjectConfigMutation.mutate({ project, patch: { palette: newPalette } });
                  }
                  createSpriteMutation.mutate({ projectId: project.id, asset: blank }, {
                    onSuccess: (newSprite) => {
                      const pPath = projectSlug || id;
                      const sPath = newSprite.slug;
                      navigate(`/project/${pPath}/editor/${sPath}`);
                    }
                  });
                }}
                className="bg-card border border-blue-500/20 p-5 rounded-2xl flex flex-col h-full space-y-4 hover:border-blue-500/50 transition-all cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/10 w-fit group-hover:bg-blue-500/20 transition-colors">
                    <PxPlus className="text-blue-400" size={18} />
                  </div>
                  <h3 className="nube-titulo text-blue-100 pt-2">DESDE CERO</h3>
                  <p className="nube-cuerpo text-muted-foreground">Dibuja cada píxel manualmente con total control artístico sobre el lienzo.</p>
                </div>
                <div className="nube-etiqueta mt-auto pt-4 flex items-center justify-between text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity">
                  <span>LIENZO EN BLANCO</span>
                  <PxArrowLeft size={10} className="rotate-180" />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Assets Gallery Grid */}
        <div className="bg-card border border-border p-6 md:p-8 rounded-lg min-h-[50vh]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
            <div className="space-y-1">
              <h2 className="nube-titulo text-primary uppercase">GALERÍA DE ACTIVOS</h2>
              <p className="nube-etiqueta text-muted-foreground uppercase opacity-60">Gestiona y organiza tus creaciones</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
              {/* Quick Filter Chips */}
              {topTags.length > 0 && (
                <div className="flex items-center gap-2 pr-2 border-r border-border/50 hidden md:flex">
                  <span className="nube-etiqueta text-muted-foreground/40 uppercase">Top:</span>
                  {topTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`nube-etiqueta px-2 py-1 rounded border transition-all ${
                        searchQuery.toLowerCase().includes(`#${tag.toLowerCase()}`)
                          ? 'bg-primary/20 border-primary text-primary shadow-[0_0_8px_rgba(34,197,94,0.15)]'
                          : 'bg-secondary/20 border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative w-full sm:w-96 group">
                <div className="absolute -inset-0.5 bg-primary/20 rounded-lg blur opacity-0 group-focus-within:opacity-100 transition duration-300"></div>
                <div className="relative">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="BUSCAR POR NOMBRE O TAG"
                    className="nube-cuerpo bg-background border-primary/20 h-10 pl-10 border-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-all"
                  />
                  <PxSparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/40 group-focus-within:text-primary transition-colors" size={16} />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                      <PxX size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {sprites.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded text-center">
              <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
                <PxImage className="text-muted-foreground/50" />
              </div>
              <p className="nube-titulo text-muted-foreground mb-2">PROYECTO VACIO</p>
              <p className="nube-cuerpo text-muted-foreground max-w-sm mb-6">Genera un sprite con IA o agrega uno desde el catalogo.</p>
            </div>
          ) : filteredSprites.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <p className="nube-titulo text-muted-foreground mb-2">SIN RESULTADOS</p>
              <p className="nube-cuerpo text-muted-foreground">No encontramos nada que coincida con "{searchQuery}"</p>
              <Button 
                variant="link" 
                onClick={() => setSearchQuery('')}
                className="nube-cuerpo text-primary mt-2"
              >
                LIMPIAR BUSQUEDA
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredSprites.map((s) => {
                const asset = s.asset_data as SpriteAsset;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleOpenEditorForSprite(s)}
                    className="group bg-card border border-border rounded-xl overflow-hidden relative cursor-pointer hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(34,197,94,0.15)]"
                  >
                    {/* Decorative corner element like in Dashboard */}
                    <div className="absolute top-0 right-0 w-12 h-12 bg-primary/5 rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-150 z-0" />
                    
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-20">
                      <button
                        onClick={(e) => handleCloneSprite(e, s)}
                        className="p-1.5 bg-background/80 backdrop-blur-sm border border-border rounded-md text-muted-foreground hover:text-primary hover:border-primary transition-all shadow-sm"
                        title="Clonar sprite"
                      >
                        <PxCopy size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSprite(e, s.id)}
                        className="p-1.5 bg-background/80 backdrop-blur-sm border border-border rounded-md text-muted-foreground hover:text-destructive hover:border-destructive transition-all shadow-sm"
                        title="Eliminar del proyecto"
                      >
                        <PxTrash size={12} />
                      </button>
                    </div>
                    
                    {/* Preview Area - Fixed overflow-hidden with pseudo-canvas background */}
                    <div className="aspect-square bg-pixel-grid bg-fixed flex flex-col items-start justify-start p-0 relative overflow-hidden">
                      <div className="pointer-events-none origin-top-left transition-transform duration-500 group-hover:scale-[1.02]">
                        <PaletteProvider defaultPalette={asset.palette}>
                          <SpriteSheetCanvas 
                            asset={asset} 
                            scale={2} 
                            showLabels={true}
                            transparent={true}
                          />
                        </PaletteProvider>
                      </div>

                      {/* Resolution Badge - Moved from bottom info panel */}
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-background/60 backdrop-blur-md border border-border/40 rounded nube-etiqueta text-primary/70 z-10 shadow-sm">
                        {asset.size}x{asset.size}
                      </div>
                    </div>
                    
                    {/* Info Panel */}
                    <div className="p-4 border-t border-border bg-card/50 relative z-10">
                      <h3 className="nube-cuerpo text-foreground truncate mb-2 group-hover:text-primary transition-colors">
                        {asset.name.toUpperCase()}
                      </h3>
                      
                      {/* Tags display - Increased font size */}
                      {asset.tags && asset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {asset.tags.slice(0, 3).map(tag => (
                            <span 
                              key={tag}
                              className="nube-etiqueta bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded border border-border/50"
                            >
                              #{tag}
                            </span>
                          ))}
                          {asset.tags.length > 3 && (
                            <span className="nube-etiqueta text-muted-foreground/40 self-center">+{asset.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                      {(!asset.tags || asset.tags.length === 0) && (
                        <p className="nube-etiqueta text-muted-foreground/30">Sin etiquetas</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal is no longer used, we direct to Studio page */}
      <AICreatorWizard 
        open={showAIWizard} 
        onOpenChange={setShowAIWizard} 
        projectSize={canvasSize}
        aiGeneration={aiGeneration}
        projectConfig={project?.config}
      />
    </div>
  );
}
