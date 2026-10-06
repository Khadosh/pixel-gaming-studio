import React from 'react';
import { ICON_REGISTRY, type IconId } from '@/lib/icons/generated';
import { matrixToSvgPaths } from '@/lib/icons/iconParser';

export interface PixelIconProps {
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number; // ignored, kept for Lucide compat
}

/**
 * El envoltorio de todos los iconos. Define los cinco papeles como variables
 * CSS: el base es `currentColor`, así que un icono toma el color del texto
 * donde esté y sigue cambiando con el tema.
 */
const Px: React.FC<PixelIconProps & { children: React.ReactNode }> = ({
  size = 16, color = 'currentColor', className = '', children
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{
      shapeRendering: 'crispEdges',
      // @ts-ignore
      '--px-base': color,
      '--px-light': 'rgba(255, 255, 255, 0.25)',
      '--px-dark': 'rgba(0, 0, 0, 0.25)',
      '--px-black': 'rgba(0, 0, 0, 0.4)',
      '--px-accent': '#ffffff', // High contrast accent (for index 5)
    }}
  >
    {children}
  </svg>
);

/**
 * Un icono, dibujado desde su grilla: `matrixToSvgPaths` la pasa a trazos SVG,
 * uno por papel, así que el icono sigue siendo vectorial y nítido a cualquier
 * tamaño aunque su fuente de verdad sea un dibujo de 16x16 píxeles
 * (`art/iconos/<id>.txt`).
 */
export const DynamicPx: React.FC<PixelIconProps & { iconId: IconId }> = ({ iconId, ...p }) => {
  const matrix = ICON_REGISTRY[iconId];
  if (!matrix) return null;

  const paths = matrixToSvgPaths(matrix);

  return (
    <Px {...p}>
      {paths.primary && <path d={paths.primary} fill="var(--px-base)" />}
      {paths.light && <path d={paths.light} fill="var(--px-light)" />}
      {paths.dark && <path d={paths.dark} fill="var(--px-dark)" />}
      {paths.black && <path d={paths.black} fill="var(--px-black)" />}
      {paths.accent && <path d={paths.accent} fill="var(--px-accent)" />}
    </Px>
  );
};

// ─── Los 63 iconos ───────────────────────────────────
// Cada uno es un dibujo de PGS en art/iconos/. Para cambiar el arte se toca el
// dibujo (en el editor o a mano) y se corre `npm run icons`; acá no hay píxeles.

export const PxPencil: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="pencil" />
);

export const PxEraser: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="eraser" />
);

export const PxFill: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="fill" />
);

export const PxPipette: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="pipette" />
);

export const PxLine: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="line" />
);

export const PxRect: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="rect" />
);

export const PxCircle: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="circle" />
);

export const PxSelect: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="select" />
);

export const PxTransform: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="transform" />
);

export const PxRotateCw: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="rotateCw" />
);

export const PxFlipH: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="flipH" />
);

export const PxFlipV: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="flipV" />
);

export const PxMirror: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="mirror" />
);

export const PxClock: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="clock" />
);

export const PxCopy: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="copy" />
);

export const PxPaste: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="paste" />
);

export const PxUndo: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="undo" />
);

export const PxRedo: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="redo" />
);

export const PxPlus: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="plus" />
);

export const PxMinus: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="minus" />
);

export const PxX: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="x" />
);

export const PxCheck: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="check" />
);

export const PxTrash: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="trash" />
);

export const PxEye: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="eye" />
);

export const PxEyeOff: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="eyeOff" />
);

export const PxLayers: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="layers" />
);

export const PxSun: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="sun" />
);

export const PxMoon: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="moon" />
);

export const PxSave: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="save" />
);

export const PxDownload: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="download" />
);

export const PxSearch: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="search" />
);

export const PxSparkles: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="sparkles" />
);

export const PxArrowLeft: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="arrowLeft" />
);

export const PxChevronLeft: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="chevronLeft" />
);

export const PxChevronRight: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="chevronRight" />
);

export const PxChevronUp: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="chevronUp" />
);

export const PxChevronDown: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="chevronDown" />
);

export const PxPlay: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="play" />
);

export const PxPause: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="pause" />
);

export const PxFilm: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="film" />
);

export const PxPalette: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="palette" />
);

export const PxSword: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="sword" />
);

export const PxSettings: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="settings" />
);

export const PxImage: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="image" />
);

export const PxFileVideo: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="fileVideo" />
);

export const PxHardDrive: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="hardDrive" />
);

export const PxTag: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="tag" />
);

export const PxHash: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="hash" />
);

export const PxUser: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="user" />
);

export const PxPackage: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="package" />
);

export const PxGrid: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="grid" />
);

export const PxEdit: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="edit" />
);

export const PxArrowDownToLine: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="arrowDownToLine" />
);

export const PxLoader: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="loader" />
);

export const PxXCircle: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="xCircle" />
);

export const PxMonitor: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="monitor" />
);

export const PxResetRotate: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="resetRotate" />
);

export const PxBone: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="bone" />
);

export const PxFolder: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="folder" />
);

export const PxLogOut: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="logOut" />
);

export const PxUpload: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="upload" />
);

export const PxInfo: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="info" />
);

export const PxTerminal: React.FC<PixelIconProps> = (p) => (
  <DynamicPx {...p} iconId="terminal" />
);

// ─── Convenience map for dynamic lookup ──────────────

export const PIXEL_ICONS = {
  pencil: PxPencil,
  eraser: PxEraser,
  fill: PxFill,
  pipette: PxPipette,
  line: PxLine,
  rect: PxRect,
  circle: PxCircle,
  select: PxSelect,
  transform: PxTransform,
  rotateCw: PxRotateCw,
  flipH: PxFlipH,
  flipV: PxFlipV,
  mirror: PxMirror,
  clock: PxClock,
  copy: PxCopy,
  paste: PxPaste,
  undo: PxUndo,
  redo: PxRedo,
  plus: PxPlus,
  minus: PxMinus,
  x: PxX,
  check: PxCheck,
  trash: PxTrash,
  eye: PxEye,
  eyeOff: PxEyeOff,
  layers: PxLayers,
  sun: PxSun,
  moon: PxMoon,
  save: PxSave,
  download: PxDownload,
  search: PxSearch,
  sparkles: PxSparkles,
  arrowLeft: PxArrowLeft,
  chevronLeft: PxChevronLeft,
  chevronRight: PxChevronRight,
  chevronUp: PxChevronUp,
  chevronDown: PxChevronDown,
  play: PxPlay,
  pause: PxPause,
  film: PxFilm,
  palette: PxPalette,
  sword: PxSword,
  settings: PxSettings,
  image: PxImage,
  fileVideo: PxFileVideo,
  hardDrive: PxHardDrive,
  tag: PxTag,
  hash: PxHash,
  user: PxUser,
  package: PxPackage,
  grid: PxGrid,
  edit: PxEdit,
  arrowDownToLine: PxArrowDownToLine,
  loader: PxLoader,
  xCircle: PxXCircle,
  monitor: PxMonitor,
  resetRotate: PxResetRotate,
  bone: PxBone,
  folder: PxFolder,
  logOut: PxLogOut,
  upload: PxUpload,
  info: PxInfo,
  terminal: PxTerminal,
} as const;
