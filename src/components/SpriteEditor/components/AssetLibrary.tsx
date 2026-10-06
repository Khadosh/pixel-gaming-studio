import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PxSword, PxSearch, PxPackage, PxUser, PxGrid, PxChevronRight } from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { PROP_LIBRARY } from '@/lib/assets/props';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjectSprites } from '@/hooks/useProjectQueries';
import { compositeFrame } from '@/lib/layerUtils';
import type { SpriteAsset } from '@/lib/types';
import { dims } from '@/headless/assetModel';

/**
 * A source drawing can become a layer of the target canvas when it fits inside
 * it and is strictly smaller than it: same rule for 16x16 into 32x32 as for a
 * 16x16 prop into a 448x224 map. A canvas of 16x16 or less accepts nothing,
 * which is the old "no composition on a 16x16 lienzo" rule.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure rule, tested on its own
export function fitsInside(
  source: { width: number; height: number },
  target: { width: number; height: number },
): boolean {
  if (source.width > target.width || source.height > target.height) return false;
  return source.width < target.width || source.height < target.height;
}


export const AssetLibrary = () => {
  const importAssetLayer = useSpriteEditorStore(s => s.importAssetLayer);
  const projectId = useSpriteEditorStore(s => s.projectId);
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const [search, setSearch] = useState('');
  
  const { data: userSprites = [] } = useProjectSprites(projectId);

  // The target canvas, which may be non-square (a 448x224 map, say).
  const target = dims(editedAsset);
  // Nothing fits inside a canvas of 16x16 or less, so imports stay off there.
  const canImportAnything = fitsInside({ width: 16, height: 16 }, target)
    || userSprites.some(s => fitsInside(dims(s.asset_data as SpriteAsset), target));

  const filteredProps = PROP_LIBRARY.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                         p.category.toLowerCase().includes(search.toLowerCase());
    // Props are 16x16 drawings: show them whenever they fit in the canvas.
    const sizeAllowed = p.data16 !== undefined && fitsInside({ width: 16, height: 16 }, target);
    return matchesSearch && sizeAllowed;
  });

  const filteredUserSprites = userSprites.filter(s => {
    const asset = s.asset_data as SpriteAsset;
    const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase()) ||
                         asset.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const sizeAllowed = fitsInside(dims(asset), target);
    return matchesSearch && sizeAllowed;
  });

  const handleImportProp = (propId: string) => {
    const prop = PROP_LIBRARY.find(p => p.id === propId);
    if (!prop || !prop.data16) return;
    if (!fitsInside({ width: 16, height: 16 }, target)) return;

    importAssetLayer({
      name: prop.name,
      frame: prop.data16,
      palette: prop.palette,
      colorNames: prop.colorNames
    });
  };

  const handleImportUserSprite = (sprite: any) => {
    const asset = sprite.asset_data as SpriteAsset;
    if (!fitsInside(dims(asset), target)) return; // double check

    const frame = compositeFrame(asset, 0);
    importAssetLayer({
      name: asset.name,
      frame,
      palette: asset.palette,
      colorNames: asset.colorNames
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background/20 rounded-md border border-border/40">
      <div className="p-3 border-b border-border bg-secondary/10 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-pixel text-[10px] text-primary flex items-center gap-2">
            <PxPackage size={12} /> NAVEGADOR DE ASSETS
          </h3>
        </div>

        {!canImportAnything ? (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <p className="text-[7px] font-pixel text-yellow-500/80 leading-tight uppercase">
              Nada entra en un lienzo de {target.width}x{target.height}.
            </p>
          </div>
        ) : (
          <div className="relative">
            <PxSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
            <Input 
              placeholder="Buscar por nombre..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-[10px] bg-background/40 border-border/60 font-mono"
            />
          </div>
        )}
      </div>

      <Tabs defaultValue="essentials" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-2 shrink-0">
          <TabsList className="grid w-full grid-cols-2 h-7 bg-secondary/20">
            <TabsTrigger value="essentials" className="text-[8px] font-pixel px-0" disabled={!canImportAnything}>ESENCIALES</TabsTrigger>
            <TabsTrigger value="user" className="text-[8px] font-pixel px-0" disabled={!canImportAnything}>MIS SPRITES</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="essentials" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              {['weapon', 'shield', 'accessory', 'item', 'nature', 'terrain'].map(category => {
                const items = filteredProps.filter(p => p.category === category);
                if (items.length === 0) return null;

                return (
                  <div key={category} className="space-y-1.5">
                    <h4 className="font-pixel text-[7px] text-muted-foreground/40 uppercase tracking-widest pl-1 flex items-center gap-1.5 border-l border-primary/20 ml-1">
                      {category}s
                    </h4>
                    <div className="grid gap-1">
                      {items.map(prop => (
                        <button
                          key={prop.id}
                          disabled={!canImportAnything}
                          onClick={() => handleImportProp(prop.id)}
                          className="w-full text-left p-2 rounded border border-border/40 bg-background/20 hover:border-primary/40 hover:bg-primary/5 text-[9px] font-pixel text-muted-foreground/80 hover:text-primary transition-all flex items-center justify-between group disabled:opacity-50"
                        >
                          <span className="truncate">{prop.name.toUpperCase()}</span>
                          <PxChevronRight size={10} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {canImportAnything && filteredProps.length === 0 && (
                <div className="py-8 text-center opacity-30">
                  <PxPackage className="mx-auto mb-2" size={20} />
                  <p className="text-[8px] font-pixel">SIN RESULTADOS</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="user" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {filteredUserSprites.map(sprite => {
                const asset = sprite.asset_data as SpriteAsset;
                return (
                  <button
                    key={sprite.id}
                    onClick={() => handleImportUserSprite(sprite)}
                    disabled={!canImportAnything}
                    className="w-full text-left p-2 rounded border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-3 group disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded bg-black/40 border border-border/20 overflow-hidden flex items-center justify-center shrink-0">
                      <PxGrid size={14} className="text-muted-foreground/40" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-pixel text-muted-foreground group-hover:text-primary truncate uppercase">
                        {asset.name}
                      </p>
                      <p className="text-[7px] font-mono text-muted-foreground/40 truncate">
                        {dims(asset).width}x{dims(asset).height} • {asset.category}
                      </p>
                    </div>
                    <PxChevronRight size={10} className="opacity-0 group-hover:opacity-100 transition-all text-primary" />
                  </button>
                );
              })}
              {canImportAnything && filteredUserSprites.length === 0 && (
                <div className="py-8 text-center opacity-30">
                  <PxUser className="mx-auto mb-2" size={20} />
                  <p className="text-[8px] font-pixel">NO HAY SPRITES QUE ENTREN</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
