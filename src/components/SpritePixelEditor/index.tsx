import { useRef, useState } from 'react';
import type { SpriteAsset } from '@/lib/types';
import { dims } from '@/headless/assetModel';
import { useCanvasRender } from './hooks/useCanvasRender';
import { usePixelInteraction } from './hooks/usePixelInteraction';
import { EditorCanvas } from './components/EditorCanvas';

interface SpritePixelEditorProps {
  asset: SpriteAsset;
  frameIndex: number;
  activeColorKey: number;
  activeLayerId: string | null;
  tool: string;
  onPointerDown: (row: number, col: number, forceTool?: any) => void;
  onPointerMove: (row: number, col: number, forceTool?: any) => void;
  onPointerUp: () => void;
  brushSize: number;
  onionSkinPrevFrame?: number[][];
  onionSkinNextFrame?: number[][];
  draftFrame?: number[][] | null;
  rotationAngle?: number | null;
  rotationCenter?: { r: number; c: number; activeLayerId?: string | null } | null;
  zoom: number;
  setZoom: (z: number | ((prev: number) => number)) => void;
  selectionRect?: { r: number; c: number; w: number; h: number } | null;
  movingSelectionPixels?: number[][] | null;
  canvasBg: 'light' | 'dark';
  leftSidebarTab?: string | null;
  onAnatomyChange?: (updates: Partial<import('@/lib/types').AnatomyConfig>) => void;
  onPushUndo?: () => void;
  showIsometricGrid?: boolean;
  referenceFrame?: number[][] | null;
  anatomyActiveMemberId?: string | null;
  anatomyIsSelectionMode?: boolean;
  onToggleMemberPixel?: (r: number, c: number, force?: boolean) => void;
  anatomySelectedOrientation?: number;
  anatomyShowAllMasks?: boolean;
}

export default function SpritePixelEditor(props: SpritePixelEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [hoveringBone, setHoveringBone] = useState<string | null>(null);
  const [draggingBone, setDraggingBone] = useState<string | null>(null);

  const PIXEL_SCALE = 16 * props.zoom;
  // The canvas keeps the asset's shape (a map ground is 448x224, not a square).
  const { width: cols, height: rows } = dims(props.asset);

  // Drawing Logic
  useCanvasRender({
    ...props,
    canvasRef,
    hoveringBone,
    draggingBone,
  });

  // Interaction Logic
  const { handlePointerDown, handlePointerMove, handlePointerUp } = usePixelInteraction({
    ...props,
    canvasRef,
    setHoveringBone,
    setDraggingBone,
    setHoverCell,
    draggingBone,
  });

  const activeBone = draggingBone || hoveringBone;
  const cursor = activeBone ? (activeBone.includes('L') || activeBone.includes('R') || activeBone.includes('C') ? 'col-resize' : 'row-resize') : 'crosshair';

  return (
    <EditorCanvas
      canvasRef={canvasRef}
      width={cols * PIXEL_SCALE}
      height={rows * PIXEL_SCALE}
      setZoom={props.setZoom}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => setHoverCell(null)}
      cursor={cursor}
    />
  );
}
