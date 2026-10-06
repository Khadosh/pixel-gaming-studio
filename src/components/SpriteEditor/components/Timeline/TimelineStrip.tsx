import React from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import { compositeFrame } from '@/lib/layerUtils';
import { dims } from '@/headless/assetModel';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { useSpriteEditorStore } from '../../context/SpriteEditorContext';
import { selectVisibleFramesIndices, selectFrameLabels } from '../../store/derived';
import { FrameThumb } from './FrameThumb';
import { SortableFrameThumb } from './SortableFrameThumb';

interface TimelineStripProps {
  sensors: any;
}

export const TimelineStrip = React.memo(({ sensors }: TimelineStripProps) => {
  const editedAsset = useSpriteEditorStore(s => s.editedAsset);
  const editingFrameIndex = useSpriteEditorStore(s => s.editingFrameIndex);
  const setEditingFrameIndex = useSpriteEditorStore(s => s.setEditingFrameIndex);
  const visibleFramesIndices = useSpriteEditorStore(useShallow(selectVisibleFramesIndices));
  const frameLabels = useSpriteEditorStore(useShallow(selectFrameLabels));
  const handleDuplicateFrame = useSpriteEditorStore(s => s.duplicateFrame);
  const handleDeleteFrame = useSpriteEditorStore(s => s.deleteFrame);
  const handleInsertEmptyFrame = useSpriteEditorStore(s => s.insertEmptyFrame);
  const handleDragEnd = useSpriteEditorStore(s => s.handleDragEnd);
  const { width: assetWidth, height: assetHeight } = dims(editedAsset);

  return (
    <div className="flex-1 min-w-0 max-w-full overflow-hidden flex flex-col bg-secondary/20 p-2 rounded-lg border border-border">
      {visibleFramesIndices.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleFramesIndices.map((i: number) => i.toString())} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-4 overflow-x-auto custom-scrollbar flex-1 pb-1 px-2 items-center min-h-[90px]">
              {visibleFramesIndices.map((frameIndex: number) => (
                <SortableFrameThumb key={frameIndex} frameIndex={frameIndex}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div>
                        <FrameThumb
                          frame={compositeFrame(editedAsset, frameIndex)}
                          palette={editedAsset.palette}
                          width={assetWidth}
                          height={assetHeight}
                          isActive={frameIndex === editingFrameIndex}
                          label={frameLabels[frameIndex]}
                          onClick={() => setEditingFrameIndex(frameIndex)}
                        />
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleDuplicateFrame(frameIndex)}>
                        Duplicar Frame
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleInsertEmptyFrame(frameIndex)}>
                        Insertar Vacío (Después)
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem disabled={frameIndex === 0} onClick={() => handleDeleteFrame(frameIndex)} className="text-red-500 hover:text-red-400">
                        Eliminar Frame
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </SortableFrameThumb>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <span className="nube-cuerpo text-muted-foreground">SIN FRAMES</span>
      )}
    </div>
  );
});

TimelineStrip.displayName = 'TimelineStrip';
