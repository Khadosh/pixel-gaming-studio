import React, { useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SpriteEditorStoreProvider } from './context/SpriteEditorContext';
import { createSpriteEditorStore } from './store/useSpriteEditorStore';
import { AnimationPreviewPanelHandle } from './components/AnimationPreviewPanel';
import { SpriteEditorModalProps } from './types';
import { EditorLayout } from './components/EditorLayout';
import { CloseConfirmationDialog } from './components/CloseConfirmationDialog';
import { useStore } from 'zustand';

export const SpriteEditor: React.FC<SpriteEditorModalProps> = (props) => {
  const { open, onOpenChange, initialAsset, onSave, generatePrompt, onRegenerate, isGenerating } = props;
  const previewPanelRef = useRef<AnimationPreviewPanelHandle>(null);

  // Create Zustand store (stable reference per mount)
  const store = useMemo(() => createSpriteEditorStore({
    initialAsset,
    onSave,
    onOpenChange,
    previewPanelRef,
    generatePrompt,
    onRegenerate,
    isGenerating,
    projectId: props.projectId,
    isIconMode: props.isIconMode,
    iconId: props.iconId,
    fromTextFile: props.fromTextFile,
    paintAcross: props.paintAcross,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep props in sync with store
  useEffect(() => {
    store.setState({
      _onSave: onSave,
      _onOpenChange: onOpenChange,
      _generatePrompt: generatePrompt,
      _onRegenerate: onRegenerate,
      _isGenerating: isGenerating,
      _previewPanelRef: previewPanelRef,
      projectId: props.projectId,
      _textFile: props.textFile ?? null,
    });
  }, [store, onSave, onOpenChange, generatePrompt, onRegenerate, isGenerating, props.textFile, props.projectId]);

  // Handle asset ID change (different project opened)
  useEffect(() => {
    const state = store.getState();
    if (initialAsset.id !== state.editedAsset.id || !state.editedAsset.layers || state.editedAsset.layers.length === 0) {
      state.initFromAsset(initialAsset);
    }
  }, [initialAsset.id, store]);

  // Close confirmation logic
  const isDirty = useStore(store, s => s.isDirty);
  const handleSave = useStore(store, s => s.handleSave);
  const [showCloseConfirm, setShowCloseConfirm] = React.useState(false);

  const handleRequestClose = React.useCallback(() => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange]);

  // Sync handleClose in store
  useEffect(() => {
    store.setState({ handleClose: handleRequestClose });
  }, [store, handleRequestClose]);

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleRequestClose(); }}>
      <SpriteEditorStoreProvider store={store}>
        <DialogContent
          aria-describedby={undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed inset-0 w-screen h-screen max-w-none max-h-none flex flex-col bg-background p-0 gap-0 overflow-hidden border-none rounded-none translate-x-0 translate-y-0 [&>button]:hidden"
        >
          <EditorLayout onClose={handleRequestClose} />
        </DialogContent>

        <CloseConfirmationDialog
          open={showCloseConfirm}
          onOpenChange={setShowCloseConfirm}
          onConfirmSave={() => {
            handleSave();
            setShowCloseConfirm(false);
          }}
          onConfirmDiscard={() => {
            setShowCloseConfirm(false);
            onOpenChange(false);
          }}
        />
      </SpriteEditorStoreProvider>
    </Dialog>
  );
};
