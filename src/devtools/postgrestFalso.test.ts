// El Supabase falso de scripts/mirar_app.mjs (Khadosh/estudio#227), probado con
// el cliente de verdad: las mismas consultas que arma useProjectQueries.ts, por
// un fetch que le contesta el falso en vez de la red.
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { crearSupabaseFalso, tablasDeDatos, sesionFalsa, claveDeSesion, leerSelect, type Datos } from './postgrestFalso';

const SPRITE = { id: 'farol', name: 'Farol', size: 4, width: 4, height: 4, palette: { 1: '#ffcc00' }, layers: [{ id: 'l', name: 'base', frames: [[[0, 1, 1, 0]]] }], animations: [] };

const DATOS: Datos = {
  proyectos: [
    { name: 'Pueblo Chico', config: { directionality: '1-way', aesthetics: '16-bit', palette: { name: 'p', colors: ['#000000', '#ffcc00'] } }, sprites: ['sprites/farol.pss.json', { slug: 'cajon', asset: { ...SPRITE, id: 'cajon', name: 'Cajón' } }] },
    { name: 'Otro', sprites: [] },
  ],
};

let clientes = 0;
function cliente() {
  const { tablas, usuario } = tablasDeDatos(DATOS, ruta => {
    expect(ruta).toBe('sprites/farol.pss.json');
    return structuredClone(SPRITE);
  });
  const falso = crearSupabaseFalso(tablas, { usuario });
  const fetchFalso: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const r = falso.responder({ method: init?.method ?? 'GET', url, headers, body: (init?.body as string | undefined) ?? null });
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
  };
  const supabase = createClient('http://127.0.0.1:54321', 'falsa', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `prueba-${++clientes}` },
    global: { fetch: fetchFalso },
  });
  return { supabase, falso, usuario };
}

describe('Supabase falso', () => {
  it('arma los proyectos y sprites del archivo de datos, con slug del nombre o del archivo', () => {
    const { falso } = cliente();
    expect(falso.tablas.projects.map(p => p.slug)).toEqual(['pueblo-chico', 'otro']);
    expect(falso.tablas.project_sprites.map(s => s.slug)).toEqual(['farol', 'cajon']);
    expect((falso.tablas.project_sprites[0].asset_data as { slug: string }).slug).toBe('farol');
  });

  it('da un proyecto por slug con .single() y corta si no hay uno solo', async () => {
    const { supabase } = cliente();
    const { data, error } = await supabase.from('projects').select('*').eq('slug', 'pueblo-chico').single();
    expect(error).toBeNull();
    expect(data.name).toBe('Pueblo Chico');
    const nada = await supabase.from('projects').select('*').eq('slug', 'no-esta').single();
    expect(nada.error?.code).toBe('PGRST116');
    const libre = await supabase.from('projects').select('id').eq('slug', 'no-esta').maybeSingle();
    expect(libre).toMatchObject({ data: null, error: null });
  });

  it('contesta el select de columnas sueltas del listado, ordenado', async () => {
    const { supabase, falso } = cliente();
    const proyecto = falso.tablas.projects[0];
    const { data, error } = await supabase.from('project_sprites')
      .select('id, slug, asset_name:asset_data->name, asset_palette:asset_data->palette, asset_versions:asset_data->versions')
      .eq('project_id', proyecto.id as string)
      .order('created_at', { ascending: false });
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ slug: 'cajon', asset_name: 'Cajón', asset_palette: { 1: '#ffcc00' }, asset_versions: null }),
      expect.objectContaining({ slug: 'farol', asset_name: 'Farol' }),
    ]);
  });

  it('aplica y anota lo que se escribe', async () => {
    const { supabase, falso, usuario } = cliente();
    const proyecto = falso.tablas.projects[0];
    const upd = await supabase.from('projects').update({ config: { aesthetics: '8-bit' } }).eq('id', proyecto.id as string).select().single();
    expect(upd.error).toBeNull();
    expect(upd.data.config).toEqual({ aesthetics: '8-bit' });

    const ins = await supabase.from('project_sprites').insert([{ project_id: proyecto.id, slug: 'nuevo', asset_data: SPRITE }]).select().single();
    expect(ins.error).toBeNull();
    expect(ins.data.id).toMatch(/^[0-9a-f-]{36}$/);

    const del = await supabase.from('project_sprites').delete().eq('slug', 'farol');
    expect(del.error).toBeNull();

    expect(falso.escrito.map(e => [e.metodo, e.tabla, e.filas])).toEqual([
      ['PATCH', 'projects', 1], ['POST', 'project_sprites', 1], ['DELETE', 'project_sprites', 1],
    ]);
    expect(falso.escrito[0].filtros).toEqual({ id: `eq.${proyecto.id}` });
    expect(falso.tablas.project_sprites.map(s => s.slug)).toEqual(['cajon', 'nuevo']);
    expect(falso.tablas.projects[0].user_id).toBe(usuario.id);
  });

  it('dice lo que no sabe contestar en vez de devolver vacío', async () => {
    const { supabase } = cliente();
    const r = await supabase.from('project_sprites').select('id, projects(name)');
    expect(r.error?.message).toMatch(/anidadas/);
    const t = await supabase.from('no_existe').select('*');
    expect(t.error?.code).toBe('42P01');
  });

  it('la sesión falsa la acepta el cliente y sigue sin refrescar', async () => {
    const usuario = { id: '00000000-0000-4000-8000-000000000001', email: 'a@b.c' };
    const sesion = sesionFalsa(usuario);
    expect(claveDeSesion()).toBe('sb-127-auth-token');
    const guardado = new Map([[claveDeSesion(), JSON.stringify(sesion)]]);
    const supabase = createClient('http://127.0.0.1:54321', 'falsa', {
      auth: {
        persistSession: true, autoRefreshToken: false, storageKey: claveDeSesion(),
        storage: { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => { guardado.set(k, v); }, removeItem: k => { guardado.delete(k); } },
      },
      global: { fetch: async () => { throw new Error('no tenía que salir a la red'); } },
    });
    const { data } = await supabase.auth.getSession();
    expect(data.session?.user.id).toBe(usuario.id);
  });

  it('lee alias y caminos del select', () => {
    expect(leerSelect('a:b->c, d->>e, *')).toEqual([
      { alias: 'a', columna: 'b', camino: ['c'] },
      { alias: 'e', columna: 'd', camino: ['e'] },
      { alias: '*', columna: '*', camino: [], todo: true },
    ]);
  });
});
