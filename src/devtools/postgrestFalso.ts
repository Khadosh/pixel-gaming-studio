/**
 * Un Supabase falso en memoria, para mirar la app con cuenta sin Docker ni base
 * (`scripts/mirar_app.mjs`, Khadosh/estudio#227). Contesta lo que pide el cliente
 * de `src/lib/supabase.ts`: PostgREST (`/rest/v1/<tabla>`) con `select`, filtros,
 * `order`, `.single()` y las escrituras, y lo justo de `/auth/v1` para que una
 * sesión falsa siga viva. Lo que se escribe se aplica a la memoria y se anota.
 *
 * Es puro (sin red ni disco) y sin alias `@/`: el script lo importa directo con
 * el `.ts` de Node 24, y se prueba en `postgrestFalso.test.ts`.
 */

export type Fila = Record<string, unknown>;
export type Tablas = Record<string, Fila[]>;

export interface Pedido {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}

export interface Respuesta {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Escritura {
  metodo: 'POST' | 'PATCH' | 'DELETE';
  tabla: string;
  filtros: Record<string, string>;
  cuerpo: unknown;
  filas: number;
}

export interface Usuario {
  id: string;
  email: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function responder(status: number, data: unknown, extra: Record<string, string> = {}): Respuesta {
  return { status, headers: { ...JSON_HEADERS, ...extra }, body: data === undefined ? '' : JSON.stringify(data) };
}

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

// ---------------------------------------------------------------------------
// select
// ---------------------------------------------------------------------------

/** Una columna pedida: `*`, `col`, `alias:col`, `col->clave`, `alias:col->>clave`. */
interface Columna { alias: string; columna: string; camino: string[]; todo?: boolean }

export function leerSelect(select: string | null): Columna[] {
  if (!select) return [{ alias: '*', columna: '*', camino: [], todo: true }];
  return select.split(',').map(s => s.trim()).filter(Boolean).map(parte => {
    if (parte === '*') return { alias: '*', columna: '*', camino: [], todo: true };
    if (parte.includes('(')) throw new Error(`select con tablas anidadas no está soportado: ${parte}`);
    const dosPuntos = parte.indexOf(':');
    const alias = dosPuntos >= 0 ? parte.slice(0, dosPuntos) : null;
    const expr = dosPuntos >= 0 ? parte.slice(dosPuntos + 1) : parte;
    const [columna, ...camino] = expr.split(/->>?/);
    return { alias: alias ?? (camino.length ? camino[camino.length - 1] : columna), columna, camino };
  });
}

function proyectar(fila: Fila, columnas: Columna[]): Fila {
  const out: Fila = {};
  for (const c of columnas) {
    if (c.todo) { Object.assign(out, fila); continue; }
    let v: unknown = fila[c.columna];
    for (const k of c.camino) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
    out[c.alias] = v === undefined ? null : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// filtros y orden
// ---------------------------------------------------------------------------

const NO_FILTROS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);

function cumple(fila: Fila, columna: string, filtro: string): boolean {
  const punto = filtro.indexOf('.');
  const op = filtro.slice(0, punto);
  const valor = filtro.slice(punto + 1);
  const v = fila[columna];
  const texto = v === null || v === undefined ? null : String(v);
  switch (op) {
    case 'eq': return texto === valor;
    case 'neq': return texto !== valor;
    case 'is': return valor === 'null' ? texto === null : texto === valor;
    case 'in': return valor.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(texto ?? '');
    default: throw new Error(`filtro no soportado: ${columna}=${filtro}`);
  }
}

function filtrar(filas: Fila[], filtros: Record<string, string>): Fila[] {
  return filas.filter(f => Object.entries(filtros).every(([c, filtro]) => cumple(f, c, filtro)));
}

function ordenar(filas: Fila[], order: string | null): Fila[] {
  if (!order) return filas;
  const claves = order.split(',').map(o => {
    const [columna, dir] = o.split('.');
    return { columna, desc: dir === 'desc' };
  });
  return [...filas].sort((a, b) => {
    for (const { columna, desc } of claves) {
      const x = String(a[columna] ?? ''), y = String(b[columna] ?? '');
      if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// el falso
// ---------------------------------------------------------------------------

export interface OpcionesFalso {
  usuario: Usuario;
  /** La hora que llevan las filas nuevas o cambiadas (fija para que las capturas salgan iguales). */
  ahora?: string;
}

export function crearSupabaseFalso(tablas: Tablas, { usuario, ahora = '2026-10-23T12:00:00.000Z' }: OpcionesFalso) {
  const escrito: Escritura[] = [];
  let siguiente = 1_000_000;

  function rest(pedido: Pedido, url: URL, tabla: string): Respuesta {
    if (!(tabla in tablas)) return responder(404, { code: '42P01', message: `relation "public.${tabla}" does not exist` });
    const filtros: Record<string, string> = {};
    for (const [k, v] of url.searchParams) if (!NO_FILTROS.has(k)) filtros[k] = v;
    const columnas = leerSelect(url.searchParams.get('select'));
    const headers = Object.fromEntries(Object.entries(pedido.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const unaSola = (headers['accept'] ?? '').includes('application/vnd.pgrst.object+json');
    const devolver = (headers['prefer'] ?? '').includes('return=representation');
    const metodo = pedido.method.toUpperCase();

    const contestar = (filas: Fila[], status = 200): Respuesta => {
      const vistas = filas.map(f => proyectar(f, columnas));
      if (!unaSola) return responder(status, vistas);
      if (vistas.length !== 1) {
        return responder(406, {
          code: 'PGRST116',
          details: `The result contains ${vistas.length} rows`,
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned',
        });
      }
      return responder(status, vistas[0]);
    };

    if (metodo === 'GET' || metodo === 'HEAD') {
      let filas = ordenar(filtrar(tablas[tabla], filtros), url.searchParams.get('order'));
      const limit = url.searchParams.get('limit');
      if (limit) filas = filas.slice(0, Number(limit));
      return contestar(filas);
    }

    const cuerpo = pedido.body ? JSON.parse(pedido.body) : null;
    if (metodo === 'POST') {
      const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((f: Fila) => ({
        id: uuid(siguiente++), created_at: ahora, updated_at: ahora, ...f,
      }));
      tablas[tabla].push(...nuevas);
      escrito.push({ metodo, tabla, filtros, cuerpo, filas: nuevas.length });
      return devolver ? contestar(nuevas, 201) : responder(201, undefined);
    }
    if (metodo === 'PATCH') {
      const cambiadas = filtrar(tablas[tabla], filtros);
      for (const f of cambiadas) Object.assign(f, cuerpo, { updated_at: ahora });
      escrito.push({ metodo, tabla, filtros, cuerpo, filas: cambiadas.length });
      return devolver ? contestar(cambiadas) : responder(204, undefined);
    }
    if (metodo === 'DELETE') {
      const borradas = filtrar(tablas[tabla], filtros);
      tablas[tabla] = tablas[tabla].filter(f => !borradas.includes(f));
      escrito.push({ metodo, tabla, filtros, cuerpo, filas: borradas.length });
      return devolver ? contestar(borradas) : responder(204, undefined);
    }
    return responder(405, { message: `método no soportado: ${metodo}` });
  }

  function auth(url: URL): Respuesta {
    const camino = url.pathname.replace(/^\/auth\/v1/, '');
    if (camino === '/user') return responder(200, usuarioSupabase(usuario));
    if (camino === '/token') return responder(200, sesionFalsa(usuario));
    if (camino === '/logout') return responder(204, undefined);
    return responder(404, { message: `auth falso: ${camino} no está` });
  }

  return {
    tablas,
    escrito,
    /** Contesta un pedido al Supabase falso; la URL puede ser absoluta o sólo el camino. */
    responder(pedido: Pedido): Respuesta {
      const url = new URL(pedido.url, 'http://127.0.0.1:54321');
      if (pedido.method.toUpperCase() === 'OPTIONS') return { status: 204, headers: {}, body: '' };
      const rest_ = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
      if (rest_) {
        try {
          return rest(pedido, url, rest_[1]);
        } catch (e) {
          return responder(400, { code: 'FALSO', message: String((e as Error).message) });
        }
      }
      if (url.pathname.startsWith('/auth/v1')) return auth(url);
      return responder(404, { message: `el Supabase falso no contesta ${url.pathname}` });
    },
  };
}

// ---------------------------------------------------------------------------
// sesión
// ---------------------------------------------------------------------------

function base64url(texto: string): string {
  const b64 = typeof btoa === 'function' ? btoa(texto) : Buffer.from(texto).toString('base64');
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function usuarioSupabase(u: Usuario) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    app_metadata: { provider: 'email' }, user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * Una sesión que el cliente de Supabase acepta sin preguntar: un JWT con `exp`
 * dentro de diez años (la firma no se mira del lado del navegador).
 */
export function sesionFalsa(u: Usuario, ahoraSeg = Math.floor(Date.UTC(2026, 9, 23) / 1000)) {
  const exp = ahoraSeg + 10 * 365 * 24 * 3600;
  const jwt = [
    base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64url(JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp })),
    'falsa',
  ].join('.');
  return {
    access_token: jwt, refresh_token: 'falso', token_type: 'bearer',
    expires_in: exp - ahoraSeg, expires_at: exp, user: usuarioSupabase(u),
  };
}

/** Dónde guarda la sesión el cliente: `sb-<primer pedazo del host>-auth-token`. */
export function claveDeSesion(supabaseUrl = 'http://127.0.0.1:54321'): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

// ---------------------------------------------------------------------------
// datos de ejemplo → tablas
// ---------------------------------------------------------------------------

export interface DatosProyecto {
  name: string;
  slug?: string;
  config?: Record<string, unknown>;
  /** Cada sprite: la ruta a un `.pss.json` (relativa al archivo de datos) o `{ slug?, asset }`. */
  sprites?: Array<string | { slug?: string; asset: Fila }>;
}

export interface Datos {
  usuario?: Partial<Usuario>;
  proyectos: DatosProyecto[];
}

const aSlug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sin-nombre';

/**
 * Arma `projects` y `project_sprites` desde un archivo de datos. `leer` trae un
 * `.pss.json` por su ruta (el script lo lee del disco; el test, de memoria). Los
 * ids salen en orden, así dos corridas con los mismos datos dan las mismas filas.
 */
export function tablasDeDatos(datos: Datos, leer: (ruta: string) => Fila): { tablas: Tablas; usuario: Usuario } {
  const usuario: Usuario = {
    id: datos.usuario?.id ?? uuid(1),
    email: datos.usuario?.email ?? 'mirar@pgs.test',
  };
  const tablas: Tablas = { projects: [], project_sprites: [] };
  let n = 100;
  const fecha = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
  for (const p of datos.proyectos ?? []) {
    const id = uuid(n++);
    tablas.projects.push({
      id, user_id: usuario.id, name: p.name, slug: p.slug ?? aSlug(p.name),
      config: p.config ?? { directionality: '1-way', aesthetics: '16-bit' },
      created_at: fecha(n), updated_at: fecha(n),
    });
    for (const s of p.sprites ?? []) {
      const asset = typeof s === 'string' ? leer(s) : s.asset;
      const base = typeof s === 'string' ? s.split('/').pop()!.replace(/\.pss\.json$|\.json$/, '') : undefined;
      const slug = (typeof s === 'object' && s.slug) || (asset.slug as string | undefined) || aSlug(base ?? String(asset.name ?? 'sprite'));
      tablas.project_sprites.push({
        id: uuid(n++), project_id: id, slug, asset_data: { ...asset, slug },
        created_at: fecha(n), updated_at: fecha(n),
      });
    }
  }
  return { tablas, usuario };
}
