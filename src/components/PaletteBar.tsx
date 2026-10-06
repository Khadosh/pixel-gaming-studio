import React from 'react';
import { PxPlus, PxX } from '@/components/icons/PixelIcon';

interface PaletteBarProps {
  palette: Record<number, string>;
  colorNames: Record<number, string>;
  activeColorKey: number;
  onSelectColor: (key: number) => void;
  onChangeColor: (key: number, color: string) => void;
  onAddColor?: () => void;
  onRemoveColor?: (key: number) => void;
  onRenameColor?: (key: number, name: string) => void;
}

export default React.memo(function PaletteBar({
  palette,
  colorNames,
  activeColorKey,
  onSelectColor,
  onChangeColor,
  onAddColor,
  onRemoveColor,
  onRenameColor,
}: PaletteBarProps) {
  const [editingKey, setEditingKey] = React.useState<number | null>(null);
  const [tempName, setTempName] = React.useState('');

  const handleFinishEditing = () => {
    if (editingKey !== null && tempName.trim() && onRenameColor) {
      onRenameColor(editingKey, tempName.trim());
    }
    setEditingKey(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishEditing();
    if (e.key === 'Escape') setEditingKey(null);
  };

  return (
    <div className="flex flex-col gap-1">
      {Object.entries(palette)
        .filter(([k]) => k !== '0')
        .map(([key, color]) => {
          const k = Number(key);
          const isActive = k === activeColorKey;
          const isEditing = k === editingKey;

          return (
            <div
              key={key}
              onClick={() => onSelectColor(k)}
              onDoubleClick={(e) => {
                const input = e.currentTarget.querySelector('input[type="color"]') as HTMLInputElement;
                if (input) input.click();
              }}
              className={`group flex items-center gap-3 relative p-1.5 rounded border transition-colors cursor-pointer select-none overflow-hidden w-full ${
                isActive
                  ? 'bg-purple-600/20 border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                  : 'bg-background/50 border-transparent hover:border-border'
              }`}
              title="Click para SELECCIONAR | Doble Click para EDITAR"
            >
              <div
                className={`flex-shrink-0 relative w-6 h-6 rounded-sm border-2 transition-all ${
                  isActive ? 'border-white' : 'border-border'
                }`}
                style={{ backgroundColor: color }}
              />
              
              {isEditing ? (
                <input
                  autoFocus
                  className="flex-1 w-full min-w-0 bg-transparent border-none outline-none nube-cuerpo-apretado px-0 h-5 text-purple-300"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={handleFinishEditing}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className={`flex-1 nube-cuerpo-apretado h-5 flex items-center transition-colors truncate ${isActive ? 'text-purple-300' : 'text-muted-foreground'}`}
                  onDoubleClick={(e) => {
                    if (onRenameColor) {
                      e.stopPropagation();
                      setEditingKey(k);
                      setTempName(colorNames[k] || key);
                    }
                  }}
                >
                  {colorNames[k] || key}
                </span>
              )}
              
              <input
                type="color"
                value={color}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onChangeColor(k, e.target.value)}
                className="absolute opacity-0 w-0 h-0 select-none pointer-events-none"
                tabIndex={-1}
              />

              {onRemoveColor && isActive && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveColor(k); }}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  title="Eliminar color"
                >
                  <PxX size={12} />
                </button>
              )}
            </div>
          );
        })}
      {onAddColor && (
        <button
          onClick={onAddColor}
          className="w-full py-2 rounded-sm border-2 border-dashed border-border hover:border-purple-500 text-muted-foreground hover:text-purple-400 flex items-center justify-center transition-all bg-background/30"
          title="Agregar color"
        >
          <PxPlus size={14} className="mr-1" />
          <span className="nube-cuerpo-apretado">NUEVO COLOR</span>
        </button>
      )}
    </div>
  );
});
