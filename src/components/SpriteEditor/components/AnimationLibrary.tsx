import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PxSparkles, PxSettings, PxTrash, PxEdit, PxCheck, PxX, PxCopy, PxImage } from '@/components/icons/PixelIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSpriteEditorStore, useSpriteEditorStoreApi } from '../context/SpriteEditorContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AVAILABLE_ANIMS } from '../types';
import { CastElement, CastShape, AnimationDef } from '@/lib/types';

export const AnimationLibrary = React.memo(() => {
  const projectConfig = useSpriteEditorStore(s => s.projectConfig);
  const isOneWay = projectConfig?.directionality === '1-way';
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const viewingAnimation = useSpriteEditorStore(s => s.viewingAnimation);
  const setViewingAnimation = useSpriteEditorStore(s => s.setViewingAnimation);
  const setEditingFrameIndex = useSpriteEditorStore(s => s.setEditingFrameIndex);
  const handleGenerateAnimations = useSpriteEditorStore(s => s.generateAnimations);
  const handleRenameAnimation = useSpriteEditorStore(s => s.renameAnimation);
  const handleRemoveAnimation = useSpriteEditorStore(s => s.removeAnimation);
  const isGenerating = useSpriteEditorStore(s => s._isGenerating);
  const isAnimGenerating = useSpriteEditorStore(s => s.isAnimGenerating);
  const castSettings = useSpriteEditorStore(s => s.castSettings);
  const setCastSettings = useSpriteEditorStore(s => s.setCastSettings);
  const animError = useSpriteEditorStore(s => s.animError);
  const activePerspective = useSpriteEditorStore(s => s.activePerspective);
  const setActivePerspective = useSpriteEditorStore(s => s.setActivePerspective);
  const handleMirrorSide = useSpriteEditorStore(s => s.handleMirrorSide);
  const activeSide = useSpriteEditorStore(s => s.activeSide);
  const setActiveSide = useSpriteEditorStore(s => s.setActiveSide);
  const sketchMode = useSpriteEditorStore(s => s.sketchMode);
  const setSketchMode = useSpriteEditorStore(s => s.setSketchMode);
  const storeApi = useSpriteEditorStoreApi();

  const [genType, setGenType] = useState<string>('idle_down');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [customNameInput, setCustomNameInput] = useState('');

  const startEditing = (name: string, label: string) => {
    setEditingName(name);
    setNewName(label);
  };

  const saveName = (name: string) => {
    if (newName.trim()) {
      handleRenameAnimation(name, newName);
    }
    setEditingName(null);
  };

  // Sync genType with perspective changes
  React.useEffect(() => {
    const perspectiveSuffixMap: Record<string, string> = {
      'front': 'down',
      'back': 'up',
      'side': activeSide === 'right' ? 'right' : 'left'
    };
    const suffix = perspectiveSuffixMap[activePerspective];
    const newGenType = `idle_${suffix}`;
    
    // Check if this type exists in AVAILABLE_ANIMS
    if (AVAILABLE_ANIMS.some(a => a.value === newGenType)) {
      setGenType(newGenType);
    }
  }, [activePerspective, activeSide]);

  const handleGenerateAI = async (type: string) => {
    // Access the bridge function stored on the store by SpriteEditor.tsx
    const fn = storeApi.getState()._pixelEditorBridge?._handleGenerateAnimationsAI;
    if (fn) await fn(type);
  };

  // Filter animations based on perspective
  const filteredAnims = AVAILABLE_ANIMS.filter(a => {
    if (a.value === 'hurt' || a.value === 'die' || a.value === 'custom') return true;
    if (activePerspective === 'front') return a.value.endsWith('_down');
    if (activePerspective === 'side') {
      return activeSide === 'right' ? a.value.endsWith('_right') : a.value.endsWith('_left');
    }
    if (activePerspective === 'back') return a.value.endsWith('_up');
    return true;
  });

  return (
    <ScrollArea className="h-full pr-3">
      <div className="space-y-6">
      
        {!isOneWay && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="nube-titulo text-primary uppercase">Perspectiva Activa</span>
          </div>
        </div>
        )}
        
        <div className="space-y-3">
          {!isOneWay && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'front', label: 'FRONT' },
              { id: 'side', label: 'SIDE' },
              { id: 'back', label: 'BACK' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePerspective(p.id as any);
                }}
                className={`nube-cuerpo-apretado py-1.5 rounded transition-all uppercase flex justify-center items-center gap-1 ${
                  activePerspective === p.id 
                    ? 'bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,197,94,0.3)] scale-102 z-10' 
                    : 'bg-black/40 text-muted-foreground hover:text-white hover:bg-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {activePerspective === 'side' && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-black/30 border border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex-1 grid grid-cols-2 gap-1">
                <button
                  onClick={() => setActiveSide('right')}
                  className={`nube-etiqueta py-1 rounded transition-all uppercase ${activeSide === 'right' ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-white'}`}
                >
                  RIGHT
                </button>
                <button
                  onClick={() => setActiveSide('left')}
                  className={`nube-etiqueta py-1 rounded transition-all uppercase ${activeSide === 'left' ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-white'}`}
                >
                  LEFT
                </button>
              </div>
              
              <div className="w-px h-4 bg-primary/20 mx-1" />
              
              <Button 
                variant="ghost" 
                size="sm" 
                className="nube-etiqueta h-6 px-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 flex gap-1 items-center shrink-0"
                onClick={handleMirrorSide}
              >
                <PxCopy size={10} />
                ESPEJAR R{'->'}L
              </Button>
            </div>
          )}

          {activePerspective !== 'front' && (
            <div className="flex gap-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <Button 
                variant="outline" 
                size="sm" 
                className="nube-cuerpo-apretado flex-1 h-8 bg-primary/5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 flex gap-2 items-center"
                onClick={() => storeApi.getState().generatePerspectiveAI()}
                disabled={isGenerating || isAnimGenerating}
              >
                <PxSparkles size={11} className={isAnimGenerating ? 'animate-spin' : ''} />
                {isAnimGenerating ? 'GENERANDO...' : 'GENERAR DESDE FRONT'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="w-8 h-8 bg-secondary/20 border-border text-muted-foreground hover:text-primary hover:border-primary/30 shrink-0"
                onClick={() => storeApi.getState()._pixelEditorBridge?._handleDownloadReferenceImage?.()}
                title="Debug: Exportar imagen de referencia"
              >
                <PxImage size={12} />
              </Button>
            </div>
          )}
          </>
          )}
        </div>
      {/* SECTION: GENERATION PANEL - MOVED TO TOP */}
      <div className="space-y-3">
        <span className="nube-etiqueta nube-track-1 text-muted-foreground block opacity-50 uppercase">Generar Nueva</span>
        
        <div className="space-y-3 p-3 rounded-md bg-black/20 border border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select value={genType} onValueChange={setGenType}>
                <SelectTrigger className="nube-cuerpo-apretado h-8 bg-background/50 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0f] border-primary/40">
                  {filteredAnims.map(a => (
                    <SelectItem key={a.value} value={a.value} className="nube-cuerpo ">{a.label.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {genType === 'cast' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 hover:text-primary border border-white/5">
                    <PxSettings size={14} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 bg-[#0a0a0f] border-primary/30 p-3 space-y-3 shadow-2xl" side="left">
                  <div className="space-y-1">
                    <label className="nube-etiqueta text-primary uppercase ">Elemento</label>
                    <Select 
                      value={castSettings.element} 
                      onValueChange={(val: CastElement) => setCastSettings(prev => ({ ...prev, element: val }))}
                    >
                      <SelectTrigger className="nube-cuerpo-apretado h-7 bg-black/40 border-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0a0a0f] border-primary/40">
                        <SelectItem value="generic" className="nube-cuerpo ">GENERIC</SelectItem>
                        <SelectItem value="fire" className="nube-cuerpo text-orange-400">FIRE</SelectItem>
                        <SelectItem value="water" className="nube-cuerpo text-blue-400">WATER</SelectItem>
                        <SelectItem value="electric" className="nube-cuerpo text-yellow-300">ELECTRIC</SelectItem>
                        <SelectItem value="nature" className="nube-cuerpo text-green-400">NATURE</SelectItem>
                        <SelectItem value="ice" className="nube-cuerpo text-cyan-200">ICE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="nube-etiqueta text-primary uppercase ">Forma</label>
                    <Select 
                      value={castSettings.shape} 
                      onValueChange={(val: CastShape) => setCastSettings(prev => ({ ...prev, shape: val }))}
                    >
                      <SelectTrigger className="nube-cuerpo-apretado h-7 bg-black/40 border-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0a0a0f] border-primary/40">
                        <SelectItem value="burst" className="nube-cuerpo ">BURST</SelectItem>
                        <SelectItem value="circle" className="nube-cuerpo ">CIRCLE</SelectItem>
                        <SelectItem value="beam" className="nube-cuerpo ">BEAM</SelectItem>
                        <SelectItem value="spark" className="nube-cuerpo ">SPARKS</SelectItem>
                        <SelectItem value="pulse" className="nube-cuerpo ">PULSE</SelectItem>
                        <SelectItem value="random" className="nube-cuerpo ">RANDOM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {genType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customNameInput}
                onChange={(e) => setCustomNameInput(e.target.value)}
                placeholder="Nombre de animación..."
                className="nube-cuerpo-apretado flex-1 bg-black/40 border border-white/10 outline-none text-primary p-2 h-8 rounded"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {genType !== 'custom' ? (
              <>
                <Button
                  onClick={() => handleGenerateAnimations(genType)}
                  disabled={isGenerating || isAnimGenerating}
                  className="nube-cuerpo-apretado px-2 bg-secondary/30 text-foreground hover:bg-secondary/50 border border-white/5 h-8 transition-all"
                >
                  QUICK
                </Button>
                <Button
                  onClick={() => handleGenerateAI(genType)}
                  disabled={isGenerating || isAnimGenerating}
                  className="nube-cuerpo-apretado flex-1 min-w-0 bg-primary text-primary-foreground hover:brightness-110 border border-primary h-8 shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all overflow-hidden"
                >
                  <PxSparkles size={11} className="mr-1 shrink-0" />
                  <span className="truncate">{isAnimGenerating ? '...' : 'IA GENERATE'}</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  if (customNameInput.trim()) {
                    storeApi.getState().generateCustomAnimation(customNameInput.trim());
                    setCustomNameInput('');
                  }
                }}
                disabled={!customNameInput.trim()}
                className="nube-cuerpo-apretado flex-1 min-w-0 bg-blue-600 text-white hover:bg-blue-500 border border-blue-400 h-8 shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all overflow-hidden"
              >
                CREATE CUSTOM
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-border/50" />

      {/* SECTION: SAVED ANIMATIONS - MOVED TO BOTTOM */}
      <div className="space-y-3">
        <span className="nube-etiqueta nube-track-1 text-muted-foreground block opacity-50 uppercase">Animaciones Guardadas</span>
        
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              setViewingAnimation('base');
              // Maintain current orientation frame
              let idx = 0;
              if (!isOneWay) {
                if (activePerspective === 'side') idx = activeSide === 'right' ? 1 : 3;
                else if (activePerspective === 'back') idx = 2;
              }
              setEditingFrameIndex(idx);
            }}
            className={`nube-cuerpo px-3 py-2 rounded border transition-all flex items-center justify-between group ${viewingAnimation === 'base'
              ? 'bg-primary/10 border-primary text-primary shadow-[0_0_10px_rgba(34,197,94,0.1)]'
              : 'bg-secondary/10 border-border text-muted-foreground hover:border-primary/30'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.6)] shrink-0" />
              <span>BASE ({activePerspective.toUpperCase()})</span>
            </div>
          </button>

          {editedAsset.animations.filter((anim: any) => {
            const isDirectional = anim.name.endsWith('_down') || anim.name.endsWith('_up') || anim.name.endsWith('_right') || anim.name.endsWith('_left');
            if (!isDirectional) return true;
            if (activePerspective === 'front') return anim.name.endsWith('_down');
            if (activePerspective === 'back') return anim.name.endsWith('_up');
            if (activePerspective === 'side') {
              return activeSide === 'right' ? anim.name.endsWith('_right') : anim.name.endsWith('_left');
            }
            return true;
          }).map((anim: any) => {
            const isViewing = viewingAnimation === anim.name;
            const isEditing = editingName === anim.name;
            
            return (
              <div 
                key={anim.name}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded border transition-all cursor-pointer ${isViewing 
                  ? 'bg-primary/5 border-primary shadow-[inset_0_0_10px_rgba(34,197,94,0.05)]' 
                  : 'bg-secondary/5 border-border hover:border-primary/20'
                }`}
                onClick={() => {
                  setViewingAnimation(anim.name);
                  if (anim.frameIndices.length > 0) setEditingFrameIndex(anim.frameIndices[0]);
                }}
              >
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                  
                  {isEditing ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName(anim.name);
                          if (e.key === 'Escape') setEditingName(null);
                        }}
                        className="nube-cuerpo-apretado bg-black/40 border-none outline-none text-primary w-full p-0 h-5"
                      />
                      <button onClick={() => saveName(anim.name)} className="text-emerald-500"><PxCheck size={10} /></button>
                      <button onClick={() => setEditingName(null)} className="text-red-400"><PxX size={10} /></button>
                    </div>
                  ) : (
                    <span className={`nube-cuerpo truncate ${isViewing ? 'text-primary' : 'text-muted-foreground/80'}`}>
                      {anim.label.toUpperCase()}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isEditing && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); startEditing(anim.name, anim.label); }}
                      className="p-1 hover:text-primary transition-colors text-muted-foreground/50"
                    >
                      <PxEdit size={10} />
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRemoveAnimation(anim.name); }}
                    className="p-1 hover:text-destructive transition-colors text-muted-foreground/50"
                  >
                    <PxTrash size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {animError && (
        <div className="nube-cuerpo text-red-400 mt-2 p-2 rounded bg-red-400/5 border border-red-400/10 whitespace-pre-wrap">{animError}</div>
      )}
      </div>
    </ScrollArea>
  );
});

AnimationLibrary.displayName = 'AnimationLibrary';
