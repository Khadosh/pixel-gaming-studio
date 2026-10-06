import React from 'react';
import { PIXEL_ICONS } from '@/components/icons/PixelIcon';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PxSearch, PxInfo, PxTerminal, PxSettings } from '@/components/icons/PixelIcon';
import { SpriteEditorModal } from '@/components/SpriteEditor';
import { ICON_COLOR_NAMES, ICON_NAMES, ICON_PALETTE, ICON_REGISTRY, type IconId } from '@/lib/icons/generated';
import { SpriteAsset } from '@/lib/types';
import { Button } from '@/components/ui/button';

const IconPreview = () => {
  const [search, setSearch] = React.useState('');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingIconId, setEditingIconId] = React.useState<string | null>(null);
  
  // Restriction: localhost only
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (!isLocalhost) {
    return <div className="flex items-center justify-center h-screen font-pixel">404 NOT FOUND</div>;
  }

  const icons = Object.entries(PIXEL_ICONS).filter(([name]) => 
    name.toLowerCase().includes(search.toLowerCase())
  );

  const handleEditIcon = (name: string) => {
    setEditingIconId(name);
    setEditorOpen(true);
  };

  // El asset que abre el editor: la misma grilla y la misma paleta con nombre
  // que tiene el dibujo en art/iconos/<id>.txt.
  const getIconAsset = (id: string): SpriteAsset => {
    const matrix = ICON_REGISTRY[id as IconId] || Array.from({ length: 16 }, () => Array(16).fill(0));
    return {
      id: `icon-${id}-${Date.now()}`, // Unique ID for every session to avoid persistence collisions
      name: ICON_NAMES[id as IconId] ?? `Icon: ${id}`,
      description: 'System Icon',
      category: 'ui',
      size: 16,
      palette: { ...ICON_PALETTE },
      colorNames: { ...ICON_COLOR_NAMES },
      layers: [{
        id: 'icon-layer',
        name: 'Icon Path',
        isVisible: true,
        isLocked: false,
        opacity: 1,
        frames: [matrix]
      }],
      animations: [],
      tags: []
    };
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 p-8 font-mono">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col gap-2 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <PxTerminal className="text-primary" size={24} />
            <h1 className="text-2xl font-bold tracking-tight uppercase">Icon Laboratory</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Explora e itera sobre los iconos pixel-art personalizados para Pixel Gaming Studio.
          </p>
        </header>

        <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-lg border border-slate-800">
          <div className="relative flex-1">
            <PxSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <Input 
              placeholder="Buscar por nombre..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-950 border-slate-800 h-10 w-full"
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest bg-slate-800 px-3 py-1 rounded">
            {icons.length} Icons
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-250px)]">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {icons.map(([name, IconComponent]) => (
              <div 
                key={name}
                className="group p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-primary/50 hover:bg-slate-800/50 transition-all flex flex-col items-center gap-4 text-center cursor-default"
              >
                <div className="flex gap-4 items-center">
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 group-hover:bg-slate-900 transition-colors">
                    {/* @ts-ignore */}
                    <IconComponent size={24} />
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 group-hover:bg-slate-900 transition-colors">
                     {/* @ts-ignore */}
                    <IconComponent size={32} />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-tight">{name}</p>
                  <p className="text-[9px] text-slate-500 font-mono">Px{name.charAt(0).toUpperCase() + name.slice(1)}</p>
                </div>

                <div className="w-full pt-4 mt-2 border-t border-slate-800/50 flex flex-col gap-2">
                  <div className="flex justify-between gap-1">
                    <div className="w-4 h-4 bg-primary rounded-sm opacity-100" />
                    <div className="w-4 h-4 bg-primary rounded-sm opacity-60" />
                    <div className="w-4 h-4 bg-primary rounded-sm opacity-30" />
                    <div className="w-4 h-4 bg-white rounded-sm opacity-10" />
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleEditIcon(name)}
                    className="w-full text-[9px] h-7 font-pixel bg-slate-950 border border-slate-800 hover:bg-primary/20 hover:text-primary transition-all gap-1.5"
                  >
                    <PxSettings size={12} /> EDIT STUDIO
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {editorOpen && editingIconId && (
          <SpriteEditorModal
            open={editorOpen}
            onOpenChange={setEditorOpen}
            initialAsset={getIconAsset(editingIconId)}
            onSave={() => {}} // No-op, we use COPY ICON DATA instead
            isIconMode={true}
            iconId={editingIconId}
          />
        )}

        {icons.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600">
            <PxInfo size={48} className="mb-4 opacity-20" />
            <p className="text-lg">No se encontraron iconos que coincidan.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default IconPreview;
