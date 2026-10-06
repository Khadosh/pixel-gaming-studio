import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AssetCard from '@/components/AssetCard';
import CategoryFilter from '@/components/CategoryFilter';
import { PxArrowLeft, PxLoader, PxX } from '@/components/icons/PixelIcon';
import { useAssets, useAssetCategoryCounts } from '@/hooks/useAssetQueries';

export default function Catalog() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const projectSlug = searchParams.get('projectSlug');
  const sizeParam = searchParams.get('size');
  const activeSize = sizeParam ? parseInt(sizeParam) : undefined;
  
  const navigate = useNavigate();

  const { data: filteredAssets = [], isLoading: isAssetsLoading } = useAssets(activeCategory, activeSize);
  const { data: assetCounts = {}, isLoading: isCountsLoading } = useAssetCategoryCounts(activeSize);

  const totalAssets = Object.values(assetCounts).reduce((sum, count) => sum + count, 0);

  const clearSizeFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('size');
    setSearchParams(newParams);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Subtle grid background pattern */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <div className="relative max-w-6xl mx-auto px-4 py-8 md:px-8 md:py-12 space-y-8">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(projectSlug ? `/project/${projectSlug}` : '/dashboard')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors font-mono group"
          >
            <PxArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            {projectSlug ? 'Volver al Proyecto' : 'Volver al Dashboard'}
          </button>

          {activeSize && (
            <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.05)]">
              <span className="font-pixel text-[9px] text-primary tracking-wider uppercase">Filtro: {activeSize}x{activeSize}</span>
              <button 
                onClick={clearSizeFilter}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Limpiar filtro de tamaño"
              >
                <PxX size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Header */}
        <header className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30 flex items-center justify-center shadow-[0_0_10px_rgba(34,197,94,0.1)]">
              <span className="text-primary text-sm">✦</span>
            </div>
            <h1 className="font-pixel text-primary text-base md:text-lg tracking-wider">
              PIXEL GAMING STUDIO
            </h1>
            <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30 flex items-center justify-center shadow-[0_0_10px_rgba(34,197,94,0.1)]">
              <span className="text-primary text-sm">✦</span>
            </div>
          </div>
          <p className="text-muted-foreground text-sm font-mono max-w-lg mx-auto">
            Browse, preview, and export pixel art assets — characters, terrain, props, and more.
          </p>
        </header>

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-muted-foreground uppercase tracking-widest bg-secondary/20 py-2 rounded-lg border border-border/50">
          <span className="flex items-center gap-1.5"><span className="text-primary">●</span> {totalAssets} assets</span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5"><span className="text-primary">●</span> {activeSize ? `${activeSize}x${activeSize}` : 'All sizes'}</span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5"><span className="text-primary">●</span> PNG EXPORT</span>
        </div>

        {/* Category filters */}
        <div className="flex justify-center">
          {isCountsLoading ? (
            <div className="h-10 flex items-center"><PxLoader className="animate-spin text-primary" size={20} /></div>
          ) : (
            <CategoryFilter
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              assetCounts={assetCounts}
            />
          )}
        </div>

        {/* Asset grid */}
        {isAssetsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
             <div className="relative">
               <PxLoader className="animate-spin text-primary" size={40} />
               <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
             </div>
             <p className="font-pixel text-[10px] text-muted-foreground animate-pulse tracking-widest">CARGANDO ASSETS...</p>
          </div>
        ) : filteredAssets.length > 0 ? (
          <div className="space-y-12">
            {[16, 32].map(size => {
              const assetsOfSize = filteredAssets.filter(a => a.size === size);
              if (assetsOfSize.length === 0) return null;

              return (
                <section key={size} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <h2 className="font-pixel text-[12px] text-primary tracking-widest bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg">
                      {size}x{size} ASSETS
                    </h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {assetsOfSize.map(asset => (
                      <AssetCard key={asset.id} asset={asset} projectSlug={projectSlug || undefined} />
                    ))}
                  </div>
                </section>
              );
            })}
            
            {/* Handle other potential sizes dynamicly if they exist */}
            {(() => {
              const otherSizes = [...new Set(filteredAssets.map(a => a.size))].filter(s => s !== 16 && s !== 32);
              return otherSizes.map(size => {
                const assetsOfSize = filteredAssets.filter(a => a.size === size);
                return (
                  <section key={size} className="space-y-6">
                    <div className="flex items-center gap-4">
                      <h2 className="font-pixel text-[12px] text-primary tracking-widest bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg">
                        {size}x{size} ASSETS
                      </h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {assetsOfSize.map(asset => (
                        <AssetCard key={asset.id} asset={asset} projectSlug={projectSlug || undefined} />
                      ))}
                    </div>
                  </section>
                );
              });
            })()}
          </div>
        ) : (
          <div className="text-center py-20 space-y-4 bg-secondary/10 rounded-xl border border-dashed border-border">
            <div className="text-4xl opacity-50">🏗</div>
            <p className="font-pixel text-[10px] text-muted-foreground tracking-wider uppercase">
              NO ASSETS FOUND
            </p>
            <p className="text-sm text-muted-foreground font-mono max-w-xs mx-auto">
              No hay assets disponibles en esta categoria {activeSize ? `para el tamaño ${activeSize}x${activeSize}` : ''}.
            </p>
            {activeSize && (
              <button 
                onClick={clearSizeFilter}
                className="font-pixel text-[9px] text-primary hover:underline"
              >
                MOSTRAR TODOS LOS TAMAÑOS
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-[10px] text-muted-foreground font-mono pb-8 pt-8 border-t border-border/30 space-y-2">
          <p className="tracking-widest">{totalAssets} assets • {Object.keys(assetCounts).length} categories • {activeSize ? `${activeSize}x${activeSize}` : 'Mixed resolutions'}</p>
          <p className="text-muted-foreground/30 uppercase">Pixel Gaming Studio — Pro Edition</p>
        </footer>
      </div>
    </div>
  );
}
