import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { SpriteAsset } from '@/lib/types';
import type { ProjectPalette } from '@/lib/newAsset';

export type { Database, Json };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisá .env o .env.local (ver .env.example).');
}

/**
 * Único cliente de Supabase de la app, tipado con el esquema de `src/integrations/supabase/types.ts`.
 * Sin .env apunta al stack local por defecto en vez de romper la app entera: lo que no usa la nube
 * (/dibujo, /icon-preview) sigue andando y lo demás falla al pedir datos.
 */
export const supabase = createClient<Database>(supabaseUrl || 'http://127.0.0.1:54321', supabaseAnonKey || 'sin-configurar', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ---------------------------------------------------------------------------
// Tipos de dominio derivados del esquema
// ---------------------------------------------------------------------------

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectSpriteRow = Database['public']['Tables']['project_sprites']['Row'];

/** Configuración de proyecto (columna JSONB `projects.config`). */
export type ProjectConfig = {
  directionality: '1-way' | '4-way';
  aesthetics: '8-bit' | '16-bit' | 'gameboy' | 'fantasy' | 'sci-fi' | 'cyberpunk' | 'custom';
  /** La paleta con la que nacen los assets nuevos del proyecto (leerla con `readProjectPalette`). */
  palette?: ProjectPalette;
};

/** Fila de `projects` con `config` ya tipada. */
export type Project = Omit<ProjectRow, 'config'> & { config: ProjectConfig };

/**
 * Fila de `project_sprites` con `asset_data` deserializada (ver `spriteDto.ts`)
 * y `name` derivado del asset para el listado.
 */
export type ProjectSprite = Omit<ProjectSpriteRow, 'asset_data'> & {
  asset_data: SpriteAsset;
  name: string;
};

/**
 * Frontera JSON → columna JSONB. Los DTOs de sprite son JSON plano, pero al ser
 * interfaces TypeScript no puede probarlos estructuralmente contra `Json`.
 * Este es el único punto donde se hace ese cast.
 */
export function toJson<T extends object>(value: T): Json {
  return value as unknown as Json;
}

/** Frontera inversa: columna JSONB → DTO. Mismo criterio que `toJson`. */
export function fromJson<T extends object>(value: Json): T {
  return value as unknown as T;
}
