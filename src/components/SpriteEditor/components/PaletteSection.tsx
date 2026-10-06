import React from 'react';
import { useShallow } from 'zustand/shallow';
import PaletteBar from '@/components/PaletteBar';
import { useSpriteEditorStore } from '../context/SpriteEditorContext';
import { selectFilteredPalette } from '../store/derived';
import { ScrollArea } from '@/components/ui/scroll-area';

export const PaletteSection = React.memo(() => {
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const showAllColors = useSpriteEditorStore(s => s.showAllColors);
  const setShowAllColors = useSpriteEditorStore(s => s.setShowAllColors);
  const filteredPalette = useSpriteEditorStore(useShallow(selectFilteredPalette));

  const activeColorKey = useSpriteEditorStore(s => s.activeColorKey);
  const setActiveColorKey = useSpriteEditorStore(s => s.setActiveColorKey);
  const handleChangeColor = useSpriteEditorStore(s => s.changeColor);
  const handleAddColor = useSpriteEditorStore(s => s.addColor);
  const handleRemoveColor = useSpriteEditorStore(s => s.removeColor);
  const handleRenameColor = useSpriteEditorStore(s => s.renameColor);

  return (
    <ScrollArea className="h-full pr-3">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
         <span className="nube-titulo text-muted-foreground uppercase opacity-50 whitespace-nowrap">Paleta Activa</span>
        <button
          onClick={() => setShowAllColors(!showAllColors)}
          className={`nube-etiqueta px-2 py-0.5 rounded border transition-colors ${showAllColors ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground'}`}
        >
          {showAllColors ? 'ALL' : 'SCOPE'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        <PaletteBar
          palette={filteredPalette}
          colorNames={editedAsset.colorNames}
          activeColorKey={activeColorKey}
          onSelectColor={setActiveColorKey || (() => { })}
          onChangeColor={handleChangeColor}
          onAddColor={handleAddColor}
          onRemoveColor={handleRemoveColor}
          onRenameColor={handleRenameColor}
        />
      </div>
    </ScrollArea>
  );
});

PaletteSection.displayName = 'PaletteSection';
