import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, toJson, fromJson, Project, ProjectSprite, ProjectConfig, Json } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { SpriteAsset } from '@/lib/types';
import { serializeAsset, deserializeAsset, SpriteAssetDTO } from '@/lib/spriteDto';
import { createSpec, slugify } from '@/lib/slugUtils';

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (userId: string) => [...projectKeys.lists(), { userId }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

export const spriteKeys = {
  all: ['sprites'] as const,
  lists: (projectId: string) => [...spriteKeys.all, 'list', projectId] as const,
  details: () => [...spriteKeys.all, 'detail'] as const,
  detail: (id: string) => [...spriteKeys.details(), id] as const,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (id: string) => UUID_RE.test(id);

/** Límite a partir del cual se descarta `versions` para poder guardar (bytes de JSON). */
const MAX_SAVE_BYTES = 500 * 1024;
/** Límite a partir del cual se descarta `versions` al cargar. */
const MAX_LOAD_BYTES = 1024 * 1024;

function notifyVersionsPurged(action: 'guardar' | 'cargar') {
  toast({
    title: 'Historial de versiones descartado',
    description: `El sprite superaba el tamaño máximo: se descartó el historial de versiones para poder ${action}.`,
  });
}

/** Convierte una fila de `project_sprites` (asset_data serializado) al tipo de dominio. */
function rowToProjectSprite(row: { id: string; slug: string; project_id: string; created_at: string; updated_at: string }, dto: SpriteAssetDTO | Json): ProjectSprite {
  const asset = deserializeAsset(dto);
  return {
    id: row.id,
    project_id: row.project_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slug: row.slug || asset.slug || row.id,
    asset_data: asset,
    name: asset.name || 'Sin nombre',
  };
}

// --- Projects Hooks ---

export function useProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: projectKeys.list(user?.id || ''),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Project[];
    },
    enabled: !!user,
  });
}

export function useProject(idOrSlug?: string) {
  return useQuery({
    queryKey: projectKeys.detail(idOrSlug || ''),
    queryFn: async () => {
      if (!idOrSlug) throw new Error('Project ID or Slug is required');

      const query = supabase.from('projects').select('*');
      if (isUUID(idOrSlug)) {
        query.eq('id', idOrSlug);
      } else {
        query.eq('slug', idOrSlug);
      }

      const { data, error } = await query.single();
      if (error) throw error;
      return data as Project;
    },
    enabled: !!idOrSlug,
  });
}

/** Busca un slug libre en `projects`, agregando un sufijo numérico si hace falta. */
/** SQLSTATE 23505: violación de unique (por ejemplo `projects_user_id_slug_key`). */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/**
 * Busca un slug libre en `projects` para el usuario. El unique real es `(user_id, slug)`,
 * así que otro usuario puede tener el mismo slug. `attempt` permite reintentar tras un 23505
 * (carrera entre el chequeo y el insert) arrancando desde un sufijo distinto.
 */
async function uniqueProjectSlug(name: string, userId: string, excludeId?: string, attempt = 0) {
  const baseSlug = slugify(name) || 'untitled';
  let counter = attempt;
  let slug = counter === 0 ? baseSlug : `${baseSlug}-${counter}`;

  for (;;) {
    let query = supabase.from('projects').select('id').eq('user_id', userId).eq('slug', slug);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return slug;
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

/** Ejecuta `run(slug)` reintentando con un slug nuevo si la DB responde 23505. */
async function withUniqueProjectSlug<T>(
  name: string,
  userId: string,
  run: (slug: string) => Promise<T>,
  excludeId?: string,
) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueProjectSlug(name, userId, excludeId, attempt);
    try {
      return await run(slug);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS - 1) throw error;
    }
  }
}

/** Busca un slug libre en `project_sprites` dentro de un proyecto. */
async function uniqueSpriteSlug(projectId: string, baseSlug: string, excludeId?: string) {
  let slug = baseSlug;
  let counter = 1;

  for (;;) {
    let query = supabase.from('project_sprites').select('id').eq('project_id', projectId).eq('slug', slug);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return slug;
    slug = `${baseSlug}-${counter++}`;
  }
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, config }: { name: string; config: ProjectConfig }) => {
      if (!user) throw new Error('User not authenticated');

      return withUniqueProjectSlug(name, user.id, async (slug) => {
        const { data, error } = await supabase
          .from('projects')
          .insert([{ name, user_id: user.id, slug, config }])
          .select()
          .single();

        if (error) throw error;
        return data as Project;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!user) throw new Error('User not authenticated');

      return withUniqueProjectSlug(name, user.id, async (slug) => {
        const { data, error } = await supabase
          .from('projects')
          .update({ name, slug })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data as Project;
      }, id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(data.slug) });
    },
  });
}

/** Pisa campos del `config` de un proyecto, conservando los demás. */
export function useUpdateProjectConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ project, patch }: { project: Project; patch: Partial<ProjectConfig> }) => {
      const config = toJson({ ...project.config, ...patch });
      const { data, error } = await supabase
        .from('projects')
        .update({ config })
        .eq('id', project.id)
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(data.slug) });
    },
  });
}

// --- Sprites Hooks ---

/**
 * Claves de `asset_data` que necesita el listado del workspace (miniatura, nombre, tags, clonado).
 * Se excluye deliberadamente `versions`, que es lo que hace pesado el JSON.
 */
const LIST_ASSET_KEYS = [
  'id', 'name', 'description', 'category', 'size', 'slug',
  'palette', 'colorNames', 'frames', 'layers', 'animations', 'tags', 'anatomy',
] as const;
type ListAssetKey = typeof LIST_ASSET_KEYS[number];

const SPRITE_LIST_SELECT = [
  'id', 'slug', 'project_id', 'created_at', 'updated_at',
  ...LIST_ASSET_KEYS.map(k => `asset_${k}:asset_data->${k}`),
].join(', ');

type SpriteListRow = {
  id: string;
  slug: string;
  project_id: string;
  created_at: string;
  updated_at: string;
} & Record<`asset_${ListAssetKey}`, Json | null>;

export function useProjectSprites(projectId?: string) {
  return useQuery({
    queryKey: spriteKeys.lists(projectId || ''),
    queryFn: async (): Promise<ProjectSprite[]> => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('project_sprites')
        .select(SPRITE_LIST_SELECT)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .overrideTypes<SpriteListRow[], { merge: false }>();

      if (error) throw error;
      return (data || []).map(row => {
        const dto: Record<string, Json> = {};
        for (const key of LIST_ASSET_KEYS) {
          const value = row[`asset_${key}`];
          if (value !== null && value !== undefined) dto[key] = value;
        }
        return rowToProjectSprite(row, dto);
      });
    },
    enabled: !!projectId,
  });
}

export function useSprite(idOrSlug?: string, projectId?: string) {
  return useQuery({
    queryKey: [...spriteKeys.detail(idOrSlug || ''), projectId],
    queryFn: async (): Promise<ProjectSprite | null> => {
      if (!idOrSlug) throw new Error('Sprite ID or Slug is required');

      const query = supabase.from('project_sprites').select('*');

      if (isUUID(idOrSlug)) {
        query.eq('id', idOrSlug);
      } else {
        query.eq('slug', idOrSlug);
        // ONLY filter by project_id if it's a valid UUID to avoid Postgres errors
        if (projectId && isUUID(projectId)) {
          query.eq('project_id', projectId);
        }
      }

      const { data, error } = await query.single();
      if (error) throw error;
      if (!data) return null;

      let dto = fromJson<SpriteAssetDTO>(data.asset_data);

      // AUTO-CLEAN: If the sprite is massive (>1MB), purge history immediately on load
      if (JSON.stringify(dto).length > MAX_LOAD_BYTES && dto.versions?.length) {
        dto = { ...dto, versions: [] };
        notifyVersionsPurged('cargar');
      }

      return rowToProjectSprite(data, dto);
    },
    enabled: !!idOrSlug && (isUUID(idOrSlug) || (!!projectId && isUUID(projectId))),
  });
}

/** Aplica el slug al asset y descarta `versions` si el JSON supera el límite de guardado. */
function prepareAssetForSave(asset: SpriteAsset, slug: string): SpriteAssetDTO {
  const assetToSave: SpriteAsset = { ...asset, slug };
  if (JSON.stringify(assetToSave).length > MAX_SAVE_BYTES && assetToSave.versions?.length) {
    assetToSave.versions = [];
    notifyVersionsPurged('guardar');
  }
  return serializeAsset(assetToSave);
}

export function useCreateSprite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, asset }: { projectId: string; asset: SpriteAsset }) => {
      // Generate initial slug for the sprite (scoped to project)
      const slug = await uniqueSpriteSlug(projectId, createSpec('', asset.name || 'new sprite'));
      const compressedAsset = prepareAssetForSave(asset, slug);

      const { data, error: insertError } = await supabase
        .from('project_sprites')
        .insert([{
          project_id: projectId,
          asset_data: toJson(compressedAsset),
          slug, // CRITICAL: Include the physical column
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      return rowToProjectSprite(data, data.asset_data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists(variables.projectId) });
    },
  });
}

export function useUpdateSprite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId, asset }: { id: string; projectId: string; asset: SpriteAsset }) => {
      // 1. Fetch current state to check if we need to update slug
      const { data: current } = await supabase
        .from('project_sprites')
        .select('slug, asset_data')
        .eq('id', id)
        .single();

      const currentAsset = current?.asset_data ? deserializeAsset(current.asset_data) : null;
      const nameChanged = currentAsset?.name !== asset.name;

      // Determine the slug
      let slug = current?.slug || currentAsset?.slug || id;
      if (nameChanged) {
        slug = await uniqueSpriteSlug(projectId, createSpec(id, asset.name), id);
      }

      // 2. Prepare asset to save with the correct slug and size safety
      const compressedAsset = prepareAssetForSave(asset, slug);

      // 3. Perform the update
      const { error } = await supabase
        .from('project_sprites')
        .update({
          asset_data: toJson(compressedAsset),
          slug, // CRITICAL: Sync the physical column
        })
        .eq('id', id);

      if (error) throw error;

      return {
        slugChanged: nameChanged,
        newSlug: slug,
        id
      };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: spriteKeys.detail(variables.id) });
      if (data?.slugChanged) {
        queryClient.invalidateQueries({ queryKey: spriteKeys.detail(data.newSlug) });
      }
    },
  });
}

export function useDeleteSprite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await supabase
        .from('project_sprites')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: spriteKeys.lists(variables.projectId) });
    },
  });
}
