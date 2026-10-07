import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PaletteProvider, usePalette } from '@/hooks/usePalette';
import SpriteSheetCanvas from '@/components/SpriteSheetCanvas';
import SpritePreview from '@/components/SpritePreview';
import { PxDownload, PxResetRotate, PxArrowLeft, PxSave, PxLoader } from '@/components/icons/PixelIcon';
import { Button } from '@/components/ui/button';
import type { SpriteAsset } from '@/lib/types';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAsset } from '@/hooks/useAssetQueries';
import { useCreateSprite, useProject } from '@/hooks/useProjectQueries';
import { parseSpec } from '@/lib/slugUtils';

const PIXEL_SCALE = 4;
const GRID_GAP = 1;

const CATEGORY_COLORS: Record<string, string> = {
  character: '#22c55e',
  terrain:   '#3b82f6',
  prop:      '#f59e0b',
  nature:    '#10b981',
  ui:        '#a855f7',
};

function AssetDetailContent({ asset }: { asset: SpriteAsset }) {
  const { palette, setPaletteColor, resetPalette } = usePalette();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectSlug = searchParams.get('projectSlug');
  const { data: project } = useProject(projectSlug || '');
  const { toast } = useToast();
  
  const createSpriteMutation = useCreateSprite();

  const CELL_SIZE = asset.size * PIXEL_SCALE;

  const handleExportPNG = useCallback(() => {
    // Determine export layout
    const hasAnimations = asset.animations.length > 0;
    let rows: { frameIndices: number[] }[];

    if (hasAnimations) {
      rows = asset.animations.map(a => ({ frameIndices: a.frameIndices }));
    } else {
      rows = [{ frameIndices: (asset.frames || []).map((_, i) => i) }];
    }

    const maxCols = Math.max(...rows.map(r => r.frameIndices.length));
    const w = maxCols * (CELL_SIZE + GRID_GAP) - GRID_GAP;
    const h = rows.length * (CELL_SIZE + GRID_GAP) - GRID_GAP;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    rows.forEach((row, rowIdx) => {
      const y = rowIdx * (CELL_SIZE + GRID_GAP);
      row.frameIndices.forEach((frameIdx, colIdx) => {
        const x = colIdx * (CELL_SIZE + GRID_GAP);
        const frame = (asset.frames || [])[frameIdx];
        for (let fRow = 0; fRow < asset.size; fRow++) {
          for (let fCol = 0; fCol < asset.size; fCol++) {
            const val = frame[fRow][fCol];
            if (val === 0) continue;
            const color = palette[val];
            if (!color || color === 'transparent') continue;
            ctx.fillStyle = color;
            ctx.fillRect(
              x + fCol * PIXEL_SCALE,
              y + fRow * PIXEL_SCALE,
              PIXEL_SCALE,
              PIXEL_SCALE
            );
          }
        }
      });
    });

    const link = document.createElement('a');
    link.download = `${asset.id}-spritesheet.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [asset, palette, CELL_SIZE]);

  const handleSaveToProject = async () => {
    if (!project?.id) return;

    const assetDataToSave = {
      ...asset,
      palette: { ...palette } // Guardar la paleta actual
    };

    createSpriteMutation.mutate({ projectId: project.id, asset: assetDataToSave }, {
      onSuccess: () => {
        toast({ title: 'Guardado', description: 'El sprite se ha guardado en tu proyecto exitosamente.' });
        navigate(`/project/${projectSlug || project.id}`);
      },
      onError: (error: any) => {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    });
  };

  const categoryColor = CATEGORY_COLORS[asset.category] ?? '#888';
  const frameCount = asset.layers?.[0]?.frames.length || asset.frames?.length || 0;
  const animCount = asset.animations.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <div className="relative max-w-6xl mx-auto p-6 md:p-10 space-y-8">
        {/* Navigation */}
        <div className="flex items-center justify-between group/nav">
          <button
            onClick={() => navigate(-1)}
            className="nube-cuerpo flex items-center gap-2 text-muted-foreground hover:text-primary transition-all"
          >
            <PxArrowLeft size={14} className="group-hover/nav:-translate-x-1 transition-transform" />
            Volver al Catálogo
          </button>
          
          <div className="flex items-center gap-3 bg-secondary/50 border border-border px-4 py-1.5 rounded-full">
            <span className="nube-etiqueta nube-track-1 text-muted-foreground uppercase">Asset ID: {asset.id}</span>
          </div>
        </div>

        {/* Header Section */}
        <header className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="nube-pagina text-primary">
                  {asset.name.toUpperCase()}
                </h1>
                <span
                  className="nube-etiqueta inline-flex items-center px-2.5 py-1 rounded-md border shadow-sm"
                  style={{
                    color: categoryColor,
                    borderColor: `${categoryColor}40`,
                    backgroundColor: `${categoryColor}15`,
                  }}
                >
                  {asset.category.toUpperCase()}
                </span>
              </div>
              <p className="nube-cuerpo text-muted-foreground max-w-2xl">
                {asset.description || 'Este asset no tiene descripción disponible.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
               {project && (
                  <Button
                    onClick={handleSaveToProject}
                    disabled={createSpriteMutation.isPending}
                    className="nube-cuerpo bg-green-600 hover:bg-green-500 text-white px-6 h-11 border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
                  >
                    {createSpriteMutation.isPending ? <PxLoader size={14} className="animate-spin mr-2" /> : <PxSave size={14} className="mr-2" />}
                    {createSpriteMutation.isPending ? 'GUARDANDO...' : 'IMPORTAR A PROYECTO'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleExportPNG}
                  className="nube-cuerpo bg-card border-border hover:border-primary/50 text-foreground px-6 h-11 transition-all"
                >
                  <PxDownload size={14} className="mr-2" />
                  EXPORT PNG
                </Button>
            </div>
          </div>

          <div className="nube-etiqueta nube-track-1 flex items-center gap-6 text-muted-foreground uppercase pt-2">
            <span className="flex items-center gap-1.5"><span className="text-primary">●</span> {asset.size}x{asset.size} PX</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5"><span className="text-primary">●</span> {frameCount} FRAMES</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5"><span className="text-primary">●</span> {animCount} ANIMACIONES</span>
          </div>
        </header>

        {/* Main Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Canvas Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
               <div className="bg-secondary/30 px-6 py-3 border-b border-border flex items-center justify-between">
                <span className="nube-titulo text-muted-foreground uppercase">SPRITE SHEET GRID</span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                </div>
              </div>
              <div className="p-8 overflow-auto flex justify-center bg-[#050508] min-h-[400px]">
                <div className="scale-[1.5] origin-top">
                  <SpriteSheetCanvas 
                    asset={asset} 
                    // Dynamic scale to keep things visible but not overwhelming
                    scale={asset.size === 32 ? 2.5 : 4} 
                  />
                </div>
              </div>
            </div>

            {/* Tags area */}
            <div className="flex flex-wrap gap-2 pt-2">
              {(asset.tags || []).map(tag => (
                <span key={tag} className="nube-etiqueta px-3 py-1 bg-secondary/30 border border-border/50 rounded-full text-muted-foreground hover:text-primary transition-colors cursor-default">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="lg:col-span-4 space-y-8">
            {/* Animated Preview */}
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
              <div className="bg-secondary/30 px-6 py-3 border-b border-border">
                <span className="nube-titulo text-muted-foreground uppercase">PREVIEW</span>
              </div>
              <div className="p-8 flex justify-center bg-[#050508]">
                <SpritePreview asset={asset} />
              </div>
            </div>

            {/* Dynamic Palette */}
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
              <div className="bg-secondary/30 px-6 py-3 border-b border-border flex items-center justify-between">
                <span className="nube-titulo text-muted-foreground uppercase">PALETTE</span>
                <button
                  onClick={resetPalette}
                  className="nube-cuerpo flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <PxResetRotate size={10} />
                  RESET
                </button>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                {Object.entries(palette)
                  .filter(([k]) => k !== '0')
                  .map(([key, color]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative shrink-0">
                        <div
                          className="w-10 h-10 rounded border border-border shadow-sm group-hover:border-primary/60 transition-all group-hover:scale-105"
                          style={{ backgroundColor: color }}
                        />
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setPaletteColor(Number(key), e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="nube-cuerpo-apretado text-foreground truncate group-hover:text-primary transition-colors">
                          {asset.colorNames[Number(key)] || `Color ${key}`}
                        </span>
                        <span className="nube-etiqueta text-muted-foreground uppercase opacity-60">
                          {color}
                        </span>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <footer className="pt-12 pb-6 border-t border-border/30 text-center space-y-2">
           <p className="nube-etiqueta nube-track-1 text-muted-foreground/50 uppercase">
            PIXEL GAMING STUDIO — ASSET BROWSER PRO
           </p>
           <p className="nube-etiqueta text-muted-foreground/30">
            Rendered with 100% pixel precision • Canvas Engine v2.0
           </p>
        </footer>
      </div>
    </div>
  );
}
  export default function AssetDetail() {
    const { assetSlug } = useParams<{ assetSlug: string }>();
    const assetId = parseSpec(assetSlug || '');
    const navigate = useNavigate();
  
    const { data: asset, isLoading, error } = useAsset(assetId);
  
    if (isLoading) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
          <PxLoader className="animate-spin text-primary" size={32} />
          <p className="nube-cuerpo text-muted-foreground animate-pulse">CARGANDO ASSET...</p>
        </div>
      );
    }
  
    if (error || !asset) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔍</div>
          <p className="nube-titulo text-muted-foreground">
            ASSET NOT FOUND
          </p>
          <button
            onClick={() => navigate('/')}
            className="nube-cuerpo flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded border border-primary hover:brightness-110 transition-all mx-auto"
          >
            <PxArrowLeft size={14} />
            BACK TO CATALOG
          </button>
        </div>
      </div>
    );
  }

  return (
    <PaletteProvider defaultPalette={asset.palette}>
      <AssetDetailContent asset={asset} />
    </PaletteProvider>
  );
}
