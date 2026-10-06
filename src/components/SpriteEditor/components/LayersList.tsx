import React from 'react';
import { Button } from '@/components/ui/button';
import { PxPlus, PxEye, PxEyeOff, PxEdit, PxChevronUp, PxChevronDown, PxTrash, PxArrowDownToLine } from '@/components/icons/PixelIcon';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';

export const LayersList = React.memo(() => {
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const activeLayerId = useSpriteEditorStore(s => s.activeLayerId);
  const setActiveLayerId = useSpriteEditorStore(s => s.setActiveLayerId);
  const handleAddLayer = useSpriteEditorStore(s => s.addLayer);
  const handleToggleLayerVisibility = useSpriteEditorStore(s => s.toggleLayerVisibility);
  const handleRenameLayer = useSpriteEditorStore(s => s.renameLayer);
  const handleMoveLayer = useSpriteEditorStore(s => s.moveLayer);
  const handleRemoveLayer = useSpriteEditorStore(s => s.removeLayer);
  const handleImportAssetLayer = useSpriteEditorStore(s => s.importAssetLayer);
  const handleMergeLayerDown = useSpriteEditorStore(s => s.mergeLayerDown);

  const layers = editedAsset.layers!;
  const [editingLayerId, setEditingLayerId] = React.useState<string | null>(null);
  const [tempName, setTempName] = React.useState('');

  const startEditing = (e: React.MouseEvent, id: string, initialName: string) => {
    e.stopPropagation();
    setEditingLayerId(id);
    setTempName(initialName);
  };

  const handleFinishEditing = () => {
    if (editingLayerId && tempName.trim()) {
      handleRenameLayer(editingLayerId, tempName.trim());
    }
    setEditingLayerId(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <span className="nube-titulo text-muted-foreground uppercase">LAYERS</span>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6 text-primary hover:text-green-300 hover:bg-primary/20"
            onClick={handleAddLayer}
            title="Nueva Capa Vacía"
          >
            <PxPlus size={14} />
          </Button>
        </div>

      <div className="flex flex-col gap-1 flex-1 overflow-y-auto custom-scrollbar pr-1">
        {[...layers].reverse().map((layer, revIdx) => {
          const idx = layers.length - 1 - revIdx;
          const isActive = layer.id === activeLayerId;
          const isEditing = layer.id === editingLayerId;

          return (
            <div 
              key={layer.id}
              onClick={() => setActiveLayerId(layer.id)}
              className={`group flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${
                isActive 
                  ? 'bg-primary/10 border-primary text-foreground' 
                  : 'bg-background/20 border-transparent hover:bg-secondary/40 text-muted-foreground'
              }`}
            >
              <button 
                className={`transition-colors ${isActive ? 'text-primary' : (layer.isVisible ? 'hover:text-primary' : 'text-muted-foreground/30')}`}
                onClick={(e) => { e.stopPropagation(); handleToggleLayerVisibility(layer.id); }}
              >
                {layer.isVisible ? <PxEye size={12} /> : <PxEyeOff size={12} />}
              </button>
              
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {isEditing ? (
                  <input
                    autoFocus
                    className="bg-background border border-primary rounded px-1 nube-cuerpo w-full outline-none text-foreground"
                    value={tempName}
                    onChange={e => setTempName(e.target.value)}
                    onBlur={handleFinishEditing}
                    onKeyDown={e => e.key === 'Enter' && handleFinishEditing()}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="nube-cuerpo truncate">{layer.name}</span>
                )}
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => startEditing(e, layer.id, layer.name)}
                >
                  <PxEdit size={12} />
                </button>
                <button 
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); handleMoveLayer(idx, 'up'); }}
                  disabled={idx === layers.length - 1}
                >
                  <PxChevronUp size={12} />
                </button>
                <button 
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); handleMoveLayer(idx, 'down'); }}
                  disabled={idx === 0}
                >
                  <PxChevronDown size={12} />
                </button>
                <button 
                  className="text-muted-foreground hover:text-primary disabled:opacity-20 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleMergeLayerDown(layer.id); }}
                  disabled={idx === 0}
                  title="Combinar con capa inferior"
                >
                  <PxArrowDownToLine size={12} />
                </button>
                <button 
                  className="text-destructive/70 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleRemoveLayer(layer.id); }}
                >
                  <PxTrash size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

LayersList.displayName = 'LayersList';
