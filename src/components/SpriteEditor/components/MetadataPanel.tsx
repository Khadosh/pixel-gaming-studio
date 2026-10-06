import React, { useState } from 'react';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { PxSettings, PxTag, PxPlus, PxX, PxSparkles, PxHash } from '@/components/icons/PixelIcon';
import { getSuggestedTags, normalizeTag } from '@/lib/tagUtils';
import { CATEGORIES } from '@/lib/types';

export const MetadataPanel = () => {
  const asset = useSpriteEditorStore(s => s.editedAsset);
  const setCategory = useSpriteEditorStore(s => s.setCategory);
  const setDescription = useSpriteEditorStore(s => s.setDescription);
  const addTag = useSpriteEditorStore(s => s.addTag);
  const removeTag = useSpriteEditorStore(s => s.removeTag);
  const assetName = useSpriteEditorStore(s => s.assetName);
  const setAssetName = useSpriteEditorStore(s => s.setAssetName);

  const [newTag, setNewTag] = useState('');

  const currentTags = asset.tags || [];
  const suggestedTags = getSuggestedTags(asset.category, currentTags);

  const handleAddTag = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTag.trim()) return;
    addTag(newTag);
    setNewTag('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border bg-secondary/10 shrink-0">
        <h3 className="nube-titulo text-primary flex items-center gap-2">
          <PxSettings size={12} /> CONFIGURACIÓN
        </h3>
        <p className="nube-etiqueta text-muted-foreground mt-0.5 uppercase ">
          Metadatos y Etiquetas del Asset
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Basic Info Section */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="nube-etiqueta nube-track-1 text-muted-foreground uppercase pl-1">
                Nombre del Arte
              </label>
              <Input 
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                className="nube-cuerpo h-9 bg-background/40 border-border focus:border-primary/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="nube-etiqueta nube-track-1 text-muted-foreground uppercase pl-1">
                Categoría
              </label>
              <Select value={asset.category} onValueChange={(val: any) => setCategory(val)}>
                <SelectTrigger className="nube-cuerpo h-9 bg-background/40 border-border">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                    <SelectItem key={cat.id} value={cat.id} className="nube-cuerpo focus:bg-primary/20">
                      {cat.label.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="nube-etiqueta nube-track-1 text-muted-foreground uppercase pl-1">
                Descripción
              </label>
              <Textarea 
                value={asset.description || ''}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe este sprite..."
                className="nube-cuerpo min-h-[96px] bg-background/40 border-border focus:border-primary/40 resize-none"
              />
            </div>
          </div>

          <div className="h-px bg-border/50" />

          {/* Tags Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="nube-etiqueta nube-track-1 text-muted-foreground uppercase pl-1 flex items-center gap-2">
                <PxTag size={10} /> Etiquetas (Tags)
              </label>
              <span className="nube-etiqueta text-muted-foreground/50 ">
                {currentTags.length}/10
              </span>
            </div>

            <form onSubmit={handleAddTag} className="flex gap-2">
              <div className="relative flex-1">
                <PxHash size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <Input 
                  value={newTag}
                  onChange={(e) => setNewTag(normalizeTag(e.target.value))}
                  placeholder="nueva-tag"
                  className="nube-cuerpo-apretado h-8 pl-8 bg-background/40 border-border focus:border-primary/40"
                  maxLength={20}
                />
              </div>
              <Button 
                type="submit" 
                variant="secondary" 
                size="sm" 
                className="h-8 px-3 hover:bg-primary/20 hover:text-primary transition-colors"
                disabled={!newTag || currentTags.length >= 10}
              >
                <PxPlus size={14} />
              </Button>
            </form>

            {/* Current Tags */}
            <div className="flex flex-wrap gap-1.5">
              {currentTags.map(tag => (
                <Badge 
                  key={tag}
                  variant="secondary"
                  className="nube-etiqueta px-2 py-0.5 bg-secondary/50 border-border text-muted-foreground flex items-center gap-1 group truncate max-w-[120px]"
                >
                  #{tag}
                  <button 
                    onClick={() => removeTag(tag)}
                    className="hover:text-destructive transition-colors ml-0.5"
                  >
                    <PxX size={10} />
                  </button>
                </Badge>
              ))}
              {currentTags.length === 0 && (
                <p className="nube-etiqueta text-muted-foreground/40 p-2 border border-dashed border-border/50 rounded-md w-full text-center">
                  Sin etiquetas aún
                </p>
              )}
            </div>

            {/* Suggested Tags */}
            {suggestedTags.length > 0 && currentTags.length < 10 && (
              <div className="space-y-2 pt-2">
                <span className="nube-etiqueta nube-track-1 text-muted-foreground/60 uppercase pl-1 flex items-center gap-1.5">
                  <PxSparkles size={8} /> Sugerencias
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTags.slice(0, 8).map(tag => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="nube-etiqueta px-2 py-0.5 rounded-full border border-border bg-background/20 text-muted-foreground/60 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
