import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useProject, useSprite, useUpdateSprite } from '@/hooks/useProjectQueries';
import { SpriteEditorStoreProvider } from '@/components/SpriteEditor/context/SpriteEditorContext';
import { createSpriteEditorStore, SpriteEditorStore } from '@/components/SpriteEditor/store/useSpriteEditorStore';
import { EditorLayout } from '@/components/SpriteEditor/components/EditorLayout';
import { EditorHeader } from '@/components/SpriteEditor/components/EditorHeader';
import { AnimationPreviewPanelHandle } from '@/components/SpriteEditor/components/AnimationPreviewPanel';
import { SpriteAsset } from '@/lib/types';
import { PxLoader } from '@/components/icons/PixelIcon';
import { useToast } from '@/hooks/use-toast';
import { parseSpec } from '@/lib/slugUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SpriteStudio() {
  const { projectSlug, spriteSlug } = useParams<{ projectSlug: string; spriteSlug: string }>();
  const projectId = parseSpec(projectSlug || '');
  const spriteId = parseSpec(spriteSlug || '');
  const navigate = useNavigate();
  const { toast } = useToast();
  const previewPanelRef = useRef<AnimationPreviewPanelHandle>(null);

  // 1. Load Project and then Sprite Data
  const { data: project, isLoading: isProjectLoading } = useProject(projectSlug);
  const { data: sprite, isLoading: isSpriteLoading, error } = useSprite(spriteId, project?.id);

  const isLoading = isProjectLoading || isSpriteLoading;
  const updateSpriteMutation = useUpdateSprite();

  // 2. Local State for Store
  const [store, setStore] = useState<SpriteEditorStore | null>(null);

  // Reset store ONLY if we switch to a completely different sprite record
  useEffect(() => {
    if (sprite && store) {
      const storeAssetId = store.getState().editedAsset.id;
      const incomingAssetId = sprite.asset_data.id;
      if (storeAssetId !== incomingAssetId) {
        setStore(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite?.id]);

  // Initialize store once sprite is loaded
  useEffect(() => {
    if (sprite && !store) {
      const realProjectId = sprite.project_id || projectId;
      const newStore = createSpriteEditorStore({
        initialAsset: sprite.asset_data,
        projectId: realProjectId,
        projectConfig: project?.config,
        onSave: (asset) => {
          handleManualSave(asset);
        },
        onOpenChange: (open) => {
          if (!open) navigate(`/project/${projectSlug}`);
        },
        previewPanelRef,
      });

      // Force overrides for 1-way projects to avoid cached localStorage overriding them
      if (project?.config?.directionality === '1-way') {
        newStore.setState({
          activePerspective: 'side',
          anatomySelectedOrientation: 1,
          editingFrameIndex: 0,
          viewingAnimation: 'base'
        });
      }

      setStore(newStore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, store, projectId, projectSlug, navigate]);

  // Handle Manual Save
  const handleManualSave = async (asset: SpriteAsset) => {
    const realSpriteId = sprite?.id || spriteId;
    const realProjectId = sprite?.project_id || projectId;

    if (!realSpriteId || !realProjectId) return;

    try {
      const result = await updateSpriteMutation.mutateAsync({
        id: realSpriteId,
        projectId: realProjectId,
        asset
      });

      if (result?.slugChanged && result.newSlug) {
        navigate(`/project/${projectSlug}/editor/${result.newSlug}`, { replace: true });
      }

      toast({ title: 'Checkpoint guardado', description: 'Nueva versión creada en la nube.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error al guardar', description: message, variant: 'destructive' });
    }
  };

  // 3. Debounced Autosave
  useEffect(() => {
    if (!store) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const unsub = store.subscribe((state, prevState) => {
      if (state.editedAsset !== prevState.editedAsset && state.isDirty) {
        const realSpriteId = sprite?.id;
        const realProjectId = sprite?.project_id || projectId;

        if (!realSpriteId || !UUID_RE.test(realSpriteId)) {
          console.warn('[Autosave] Skipping save, no valid UUID yet');
          return;
        }

        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          try {
            const result = await updateSpriteMutation.mutateAsync({
              id: realSpriteId,
              projectId: realProjectId,
              asset: state.editedAsset
            });

            store.getState().setIsDirty(false);

            if (result?.slugChanged && result.newSlug) {
              navigate(`/project/${projectSlug}/editor/${result.newSlug}`, { replace: true });
            }
          } catch (err) {
            console.error('Autosave failed:', err);
          }
        }, 3000);
      }
    });

    return () => {
      unsub();
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, spriteId, projectId]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center gap-4">
        <PxLoader className="animate-spin text-primary" size={32} />
        <span className="nube-cuerpo text-muted-foreground uppercase animate-pulse">
          Cargando Studio...
        </span>
      </div>
    );
  }

  if (error || !sprite) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center gap-4">
        <span className="nube-titulo text-destructive uppercase">Error al cargar el sprite</span>
        <Link to={`/project/${projectSlug}`} className="text-primary hover:underline nube-cuerpo">
          Volver al proyecto
        </Link>
      </div>
    );
  }

  if (!store) return null;

  return (
    <SpriteEditorStoreProvider store={store}>
      <div className="nube-cuerpo h-screen w-screen flex flex-col overflow-hidden bg-background">
        <EditorHeader
          variant="studio"
          backTo={`/project/${projectSlug}`}
          syncStatus={{
            isPending: updateSpriteMutation.isPending,
            isSuccess: updateSpriteMutation.isSuccess,
          }}
        />
        <EditorLayout hideHeader={true} />
      </div>
    </SpriteEditorStoreProvider>
  );
}
