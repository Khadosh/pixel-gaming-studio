import { useNavigate } from 'react-router-dom';
import type { SpriteAsset } from '@/lib/types';
import SpriteSheetCanvas from './SpriteSheetCanvas';
import { PaletteProvider } from '@/hooks/usePalette';

const CATEGORY_COLORS: Record<string, string> = {
  character: '#22c55e',
  terrain:   '#3b82f6',
  prop:      '#f59e0b',
  nature:    '#10b981',
  ui:        '#a855f7',
};

const CATEGORY_LABELS: Record<string, string> = {
  character: 'Character',
  terrain:   'Terrain',
  prop:      'Prop',
  nature:    'Nature',
  ui:        'UI',
};

interface AssetCardProps {
  asset: SpriteAsset;
  projectSlug?: string;
}

export default function AssetCard({ asset, projectSlug }: AssetCardProps) {
  const navigate = useNavigate();
  const frameCount = asset.layers?.[0]?.frames.length || asset.frames?.length || 0;
  const categoryColor = CATEGORY_COLORS[asset.category] ?? '#888';

  return (
    <button
      id={`asset-card-${asset.id}`}
      onClick={() => {
        const query = projectSlug ? `?projectSlug=${projectSlug}` : '';
        // El id, no el slug del nombre: el catálogo se busca por id
        // (`getAssetById`) y "WARRIOR (16PX)" nunca fue `warrior16`.
        navigate(`/asset/${encodeURIComponent(asset.id)}${query}`);
      }}
      className="group w-full text-left bg-card rounded-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_25px_rgba(34,197,94,0.15)] hover:-translate-y-1 overflow-hidden cursor-pointer flex flex-col relative"
    >
      {/* Decorative corner element */}
      <div className="absolute top-0 right-0 w-12 h-12 bg-primary/5 rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-150 z-0" />

      {/* Preview area: Professional dark background to match canvas */}
      <div className="w-full flex-1 flex items-center justify-center p-6 bg-[#050508] min-h-[180px] overflow-hidden border-b border-white/5 relative z-10">
        <div className="transform transition-all duration-700 group-hover:scale-105 group-hover:brightness-110">
           <PaletteProvider defaultPalette={asset.palette}>
             <SpriteSheetCanvas
              asset={asset}
              // Scale logic: characters get slightly smaller scale to fit labels comfortably
              scale={asset.animations.length > 4 ? 2 : 2.5}
              showLabels={true}
            />
           </PaletteProvider>
        </div>
      </div>

      {/* Info panel */}
      <div className="p-4 bg-card/80 backdrop-blur-sm relative z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-pixel text-[10px] text-foreground tracking-wider group-hover:text-primary transition-colors truncate pr-2">
            {asset.name.toUpperCase()}
          </h3>
          <span
            className="inline-flex items-center px-2 py-0.5 text-[7px] font-pixel rounded-sm border shrink-0 opacity-80"
            style={{
              color: categoryColor,
              borderColor: `${categoryColor}40`,
              backgroundColor: `${categoryColor}10`,
            }}
          >
            {CATEGORY_LABELS[asset.category]}
          </span>
        </div>
        
        <p className="text-[9px] text-muted-foreground font-mono leading-relaxed line-clamp-2 h-[2.4em] opacity-60 mb-3">
          {asset.description || 'No description provided.'}
        </p>

        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8px] text-primary/60 font-bold">
              {asset.size}x{asset.size}
            </span>
            <span className="text-white/10">|</span>
            <span className="font-mono text-[8px] text-muted-foreground">
              {frameCount} FRAMES
            </span>
          </div>
          {asset.animations.length > 0 && (
            <span className="font-mono text-[8px] text-emerald-500/60 font-bold">
              {asset.animations.length} ANIMS
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
