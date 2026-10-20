import React, { useRef, useEffect, useMemo } from 'react';
import { Frame, SpriteAsset } from '@/lib/types';
import { onlyFrameChanged, spreadEdit } from '@/lib/paintAcross';
import EditorToolbar from '@/components/EditorToolbar';
import SpritePixelEditor from '@/components/SpritePixelEditor';
import { useSpriteEditorStore, useSpriteEditorStoreApi } from '../context/SpriteEditorContext';
import { selectOnionGhostFrames, selectPerspectiveReferenceFrame } from '../store/derived';
import { usePixelEditor } from '@/hooks/usePixelEditor';
import { useEditorEffects } from '../hooks/useEditorEffects';
import { useAnimationGenerationBridge } from '../hooks/useAnimationGeneration';
import { usePerspectiveGenerationBridge } from '../hooks/usePerspectiveGeneration';
import { EditorHeader } from './EditorHeader';
import { PaintAcrossControl } from './PaintAcrossControl';
import { LayersList } from './LayersList';
import { PaletteSection } from './PaletteSection';
import { MetadataPanel } from './MetadataPanel';
import { AnatomyPanel } from './AnatomyPanel';
import { ProceduralAnimPanel } from './ProceduralAnimPanel';
import { AnimationLibrary } from './AnimationLibrary';
import { TimelineStrip } from './Timeline/TimelineStrip';
import { AnimationPreviewPanel, AnimationPreviewPanelHandle } from './AnimationPreviewPanel';
import { ZoomControl } from './ZoomControl';
import { PaletteProvider } from '@/hooks/usePalette';
import { DrawingToolbar } from '@/components/DrawingToolbar';
import { EditorSidebarNavigator } from './EditorSidebarNavigator';
import { PaletteLibrary } from './PaletteLibrary';
import { AssetLibrary } from './AssetLibrary';
import { StudioSheetModal } from './StudioSheetModal';
import { HistoryPanel } from './HistoryPanel';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';

interface EditorLayoutProps {
  onClose?: () => void;
  hideHeader?: boolean;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({ hideHeader = false }) => {
  const store = useSpriteEditorStoreApi();
  const previewPanelRef = useRef<AnimationPreviewPanelHandle>(null);
  const [showStudioSheet, setShowStudioSheet] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // AI generation bridge
  const { handleGenerateAnimationsAI } = useAnimationGenerationBridge(store);
  const { handleGeneratePerspectiveAI, handleDownloadReferenceImage } = usePerspectiveGenerationBridge(store);

  // Subscribe to store values needed by usePixelEditor
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const editingFrameIndex = useSpriteEditorStore(s => s.editingFrameIndex);
  const activeLayerId = useSpriteEditorStore(s => s.activeLayerId);
  const scope = useSpriteEditorStore(s => s.scope);
  const pushUndo = useSpriteEditorStore(s => s.pushUndo);
  const undo = useSpriteEditorStore(s => s.undo);
  const redo = useSpriteEditorStore(s => s.redo);
  const canUndo = useSpriteEditorStore(s => s.canUndo);
  const canRedo = useSpriteEditorStore(s => s.canRedo);

  // Painting across frames (#43): the frame a stroke is being drawn on is
  // mutated in place between pointer moves, so what it was before the last
  // change is kept here, tied to the very frame object it describes.
  const lastStroke = useRef<{ frame: Frame; before: Frame } | null>(null);
  const handleAssetChange = React.useCallback((updated: SpriteAsset) => {
    const s = store.getState();
    const layer = Math.max(0, (updated.layers ?? []).findIndex(l => l.id === s.activeLayerId));
    const frame = s.editingFrameIndex;
    const now = updated.layers?.[layer]?.frames[frame];
    if (s.paintAcross === 'frame' || !now || !onlyFrameChanged(s.editedAsset, updated, layer, frame)) {
      lastStroke.current = null;
      s.setEditedAsset(updated);
      return;
    }
    const was = s.editedAsset.layers![layer].frames[frame];
    const before = lastStroke.current?.frame === was ? lastStroke.current.before : was === now ? null : was;
    lastStroke.current = { frame: now, before: now.map(row => [...row]) };
    s.setEditedAsset(before ? spreadEdit(updated, layer, frame, before, now, s.paintAcross) : updated);
  }, [store]);

  const tool = useSpriteEditorStore(s => s.tool);
  const setTool = useSpriteEditorStore(s => s.setTool);
  const activeColorKey = useSpriteEditorStore(s => s.activeColorKey);
  const setActiveColorKey = useSpriteEditorStore(s => s.setActiveColorKey);
  const brushSize = useSpriteEditorStore(s => s.brushSize);
  const setBrushSize = useSpriteEditorStore(s => s.setBrushSize);
  const mirrorX = useSpriteEditorStore(s => s.mirrorX);
  const setMirrorX = useSpriteEditorStore(s => s.setMirrorX);

  // Pixel editor hook (local drawing state with refs)
  const pixelEditor = usePixelEditor(
    editedAsset, 
    editingFrameIndex, 
    activeLayerId, 
    handleAssetChange, 
    scope, 
    pushUndo, 
    undo, 
    canUndo,
    tool,
    setTool,
    activeColorKey,
    setActiveColorKey,
    brushSize,
    setBrushSize,
    mirrorX,
    setMirrorX
  );

  // Sync pixel editor bridge to store
  const bridge = useMemo(() => ({
    setTool: setTool,
    setActiveColorKey: setActiveColorKey,
    setBrushSize: setBrushSize,
    setMirrorX: setMirrorX,
    draftFrame: pixelEditor.draftFrame,
    handlePointerDown: pixelEditor.handlePointerDown,
    handlePointerMove: pixelEditor.handlePointerMove,
    handlePointerUp: pixelEditor.handlePointerUp,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    overwriteLayerFrame: pixelEditor.overwriteLayerFrame,
    rotationAngle: pixelEditor.rotationAngle,
    rotationCenter: pixelEditor.rotationCenter,
    selectionRect: pixelEditor.selectionRect,
    setSelectionRect: pixelEditor.setSelectionRect,
    movingSelectionPixels: pixelEditor.movingSelectionPixels,
    stampSelection: pixelEditor.stampSelection,
    clearFloatingPixels: pixelEditor.clearFloatingPixels,
    _handleGenerateAnimationsAI: handleGenerateAnimationsAI,
    _handleGeneratePerspectiveAI: handleGeneratePerspectiveAI,
    _handleDownloadReferenceImage: handleDownloadReferenceImage,
  }), [
    tool, setTool,
    activeColorKey, setActiveColorKey,
    brushSize, setBrushSize,
    mirrorX, setMirrorX,
    pixelEditor.draftFrame,
    pixelEditor.handlePointerDown, pixelEditor.handlePointerMove, pixelEditor.handlePointerUp,
    undo, redo, canUndo, canRedo,
    pixelEditor.overwriteLayerFrame,
    pixelEditor.rotationAngle,
    pixelEditor.rotationCenter,
    pixelEditor.selectionRect,
    pixelEditor.setSelectionRect,
    pixelEditor.movingSelectionPixels,
    pixelEditor.stampSelection,
    pixelEditor.clearFloatingPixels,
    handleGenerateAnimationsAI,
    handleGeneratePerspectiveAI,
    handleDownloadReferenceImage
  ]);

  // Sync pixel editor bridge to store
  useEffect(() => {
    store.getState().setPixelEditorBridge(bridge);
  }, [bridge, store]);

  // Store-derived state for render
  const zoom = useSpriteEditorStore(s => s.zoom);
  const setZoom = useSpriteEditorStore(s => s.setZoom);
  const onionSkin = useSpriteEditorStore(s => s.onionSkin);
  const setOnionSkin = useSpriteEditorStore(s => s.setOnionSkin);
  const showIsometricGrid = useSpriteEditorStore(s => s.showIsometricGrid);
  const setShowIsometricGrid = useSpriteEditorStore(s => s.setShowIsometricGrid);
  const handleCopy = useSpriteEditorStore(s => s.handleCopy);
  const handlePaste = useSpriteEditorStore(s => s.handlePaste);
  const handleFlipH = useSpriteEditorStore(s => s.handleFlipH);
  const handleFlipV = useSpriteEditorStore(s => s.handleFlipV);
  const handleRotate = useSpriteEditorStore(s => s.handleRotate);
  const canvasBg = useSpriteEditorStore(s => s.canvasBg);
  const setCanvasBg = useSpriteEditorStore(s => s.setCanvasBg);
  const leftSidebarTab = useSpriteEditorStore(s => s.leftSidebarTab);
  const onionGhostFrames = useSpriteEditorStore(useShallow(selectOnionGhostFrames));
  const perspectiveReferenceFrame = useSpriteEditorStore(useShallow(selectPerspectiveReferenceFrame));
  const sketchMode = useSpriteEditorStore(s => s.sketchMode);
  const setSketchMode = useSpriteEditorStore(s => s.setSketchMode);

  // Effects (keyboard shortcuts, side-effects)
  useEditorEffects(store);

  const handleAnatomyChange = React.useCallback((updates: any) => {
    store.getState().setEditedAsset((prev: any) => ({
      ...prev,
      anatomy: { ...prev.anatomy, ...updates }
    }));
  }, [store]);

  const toggleOnionSkin = React.useCallback(() => (setOnionSkin as any)((prev: boolean) => !prev), [setOnionSkin]);
  const toggleIsometricGrid = React.useCallback(() => (setShowIsometricGrid as any)((prev: boolean) => !prev), [setShowIsometricGrid]);
  const toggleCanvasBg = React.useCallback(() => (setCanvasBg as any)((prev: 'light' | 'dark') => (prev === 'light' ? 'dark' : 'light')), [setCanvasBg]);
  const toggleMirrorX = React.useCallback(() => (pixelEditor.setMirrorX as any)((prev: boolean) => !prev), [pixelEditor.setMirrorX]);
  const toggleSketchMode = React.useCallback(() => (setSketchMode as any)((prev: boolean) => !prev), [setSketchMode]);
  const openStudioSheet = React.useCallback(() => setShowStudioSheet(true), []);


  return (
    <PaletteProvider defaultPalette={editedAsset.palette}>
      <div className="nube-cuerpo flex-1 flex flex-col min-h-0 bg-background p-3 gap-3 overflow-hidden relative">
        {!hideHeader && <EditorHeader />}

        {/* MAIN BODY: 3 Columns */}
        <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
          {/* LEFT SIDEBAR */}
          <div className="w-[240px] min-w-[240px] flex-shrink-0 flex flex-col bg-secondary/10 rounded-lg border border-border p-3 overflow-hidden">
            <PaletteSection />
          </div>

          {/* CENTER: Canvas */}
          <div className="flex-1 min-w-0 bg-black/40 rounded-lg border border-border flex flex-col overflow-hidden relative">
            <div className="flex-shrink-0 border-b border-border bg-secondary/30 p-2 flex justify-center">
              <EditorToolbar
                tool={pixelEditor.tool}
                onToolChange={pixelEditor.setTool}
                brushSize={pixelEditor.brushSize}
                onBrushSizeChange={pixelEditor.setBrushSize}
                canUndo={canUndo}
                onUndo={undo}
                canRedo={canRedo}
                onRedo={redo}
                onionSkin={onionSkin}
                onToggleOnionSkin={toggleOnionSkin}
                showIsometricGrid={showIsometricGrid}
                onToggleIsometricGrid={toggleIsometricGrid}
                mirrorX={pixelEditor.mirrorX}
                onToggleMirrorX={toggleMirrorX}
                scope={scope}
                onScopeChange={store.getState().setScope}
                onCopy={handleCopy}
                onPaste={handlePaste}
                onFlipH={handleFlipH}
                onFlipV={handleFlipV}
                onRotate={handleRotate}
                canvasBg={canvasBg}
                onToggleCanvasBg={toggleCanvasBg}
                sketchMode={sketchMode}
                onToggleSketchMode={toggleSketchMode}
                onOpenStudioSheet={openStudioSheet}
              />
            </div>
            <PaintAcrossControl />
            <div className="flex-1 flex flex-row overflow-hidden relative">
              <div className="flex-shrink-0 flex items-center p-2">
                <DrawingToolbar tool={pixelEditor.tool} onToolChange={pixelEditor.setTool} />
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar relative bg-[#0a0a0f] p-4">
                <div className="min-w-full min-h-full flex items-center justify-center p-20">
                  <SpritePixelEditor
                    asset={editedAsset}
                    frameIndex={editingFrameIndex}
                    activeColorKey={pixelEditor.activeColorKey}
                    activeLayerId={activeLayerId}
                    tool={pixelEditor.tool}
                    brushSize={pixelEditor.brushSize}
                    onPointerDown={pixelEditor.handlePointerDown}
                    onPointerMove={pixelEditor.handlePointerMove}
                    onPointerUp={pixelEditor.handlePointerUp}
                    draftFrame={pixelEditor.draftFrame}
                    rotationAngle={pixelEditor.rotationAngle}
                    rotationCenter={pixelEditor.rotationCenter}
                    onionSkinPrevFrame={onionGhostFrames.prev}
                    onionSkinNextFrame={onionGhostFrames.next}
                    zoom={zoom}
                    setZoom={setZoom}
                    selectionRect={pixelEditor.selectionRect}
                    movingSelectionPixels={pixelEditor.movingSelectionPixels}
                    canvasBg={canvasBg}
                    leftSidebarTab={leftSidebarTab}
                    onAnatomyChange={handleAnatomyChange}
                    onPushUndo={pushUndo}
                    showIsometricGrid={showIsometricGrid}
                    referenceFrame={perspectiveReferenceFrame}
                    anatomyActiveMemberId={useSpriteEditorStore(s => s.anatomyActiveMemberId)}
                    anatomyIsSelectionMode={useSpriteEditorStore(s => s.anatomyIsSelectionMode)}
                    onToggleMemberPixel={store.getState().toggleMemberPixel}
                    anatomySelectedOrientation={useSpriteEditorStore(s => s.anatomySelectedOrientation)}
                    anatomyShowAllMasks={useSpriteEditorStore(s => s.anatomyShowAllMasks)}
                  />
                </div>
              </div>
              <ZoomControl />
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="w-[350px] min-w-[350px] flex-shrink-0 flex flex-col bg-secondary/10 rounded-lg border border-border overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {leftSidebarTab && (
                  <div className="flex-1 overflow-hidden flex flex-col p-3">
                    {leftSidebarTab === 'layers' && <LayersList />}
                    {leftSidebarTab === 'animations' && <AnimationLibrary />}
                    {leftSidebarTab === 'anatomy' && <AnatomyPanel />}
                    {leftSidebarTab === 'procedural' && <ProceduralAnimPanel />}
                    {leftSidebarTab === 'themes' && <PaletteLibrary />}
                    {leftSidebarTab === 'assets' && <AssetLibrary />}
                    {leftSidebarTab === 'history' && <HistoryPanel />}
                    {leftSidebarTab === 'config' && <MetadataPanel />}
                  </div>
                )}
              </div>
              <EditorSidebarNavigator />
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex flex-row items-center justify-between pt-2 border-t border-border gap-3 flex-shrink-0 relative">
          <TimelineStrip sensors={sensors} />

          {/* FLOATING PREVIEW BOX - Fixed to bottom-right, grows top-left */}
          <div className="absolute right-[60px] bottom-[10px] z-50 pointer-events-auto flex flex-col items-end">
            <AnimationPreviewPanel ref={previewPanelRef} />
          </div>
        </div>

        <StudioSheetModal open={showStudioSheet} onOpenChange={setShowStudioSheet} />
      </div>
    </PaletteProvider>
  );
};
