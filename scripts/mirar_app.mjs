// Mirar una pantalla de la app con cuenta (el workspace, el editor de sprites)
// sin Docker ni Supabase (Khadosh/estudio#227). Levanta vite en un puerto libre,
// entra con una sesión falsa, contesta las llamadas a Supabase desde un archivo
// de datos (src/devtools/postgrestFalso.ts), saca la captura y apaga todo.
//
//   node scripts/mirar_app.mjs <ruta> <datos.json> [salida.png] [opciones]
//   node scripts/mirar_app.mjs /project/pueblo-chico examples/mirar_app/datos.json /tmp/ws.png
//   node scripts/mirar_app.mjs /project/pueblo-chico/editor/farol examples/mirar_app/datos.json /tmp/ed.png
//
// Opciones:
//   --ancho=1440 --alto=900   tamaño de la ventana
//   --completa                captura de la página entera, no sólo la ventana
//   --esperar=2500            ms de espera antes de la captura (los canvas)
//   --pasos=<archivo.mjs>     un módulo cuyo `export default async (page) => {}`
//                             hace algo antes de la captura (clics, teclas)
//   --tope=180                segundos máximos de todo: después corta y apaga vite
//
// Deja la captura en <salida.png> y lo que la página escribió (POST, PATCH,
// DELETE, con sus filtros y cuerpos) en <salida>.escrito.json, y lo resume por
// pantalla junto con los errores de la consola. Nada sale a la red: lo que no
// es vite, el Supabase falso o las fuentes de Google se corta y se anota.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearSupabaseFalso, tablasDeDatos, sesionFalsa, claveDeSesion } from '../src/devtools/postgrestFalso.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE = 'http://127.0.0.1:54321';

const args = process.argv.slice(2);
const opciones = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const [ruta, datosRuta, salidaArg] = args.filter(a => !a.startsWith('--'));
if (!ruta || !datosRuta) {
  console.error('uso: node scripts/mirar_app.mjs <ruta> <datos.json> [salida.png] [--ancho= --alto= --completa --esperar= --pasos= --tope=]');
  process.exit(2);
}
const salida = path.resolve(salidaArg ?? 'mirar_app.png');
const salidaEscrito = salida.replace(/\.png$/i, '') + '.escrito.json';

// --- los datos ----------------------------------------------------------------
const datosAbs = path.resolve(datosRuta);
const datos = JSON.parse(fs.readFileSync(datosAbs, 'utf8'));
const { tablas, usuario } = tablasDeDatos(datos, r => JSON.parse(fs.readFileSync(path.resolve(path.dirname(datosAbs), r), 'utf8')));
const falso = crearSupabaseFalso(tablas, { usuario });

// --- vite, siempre con su apagado ----------------------------------------------
const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer();
  s.once('error', mal);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const puerto = await puertoLibre();
const BASE = `http://127.0.0.1:${puerto}`;
let vite = null;
let navegador = null;
let apagado = false;

async function apagar(codigo) {
  if (apagado) return;
  apagado = true;
  try { await navegador?.close(); } catch { /* ya estaba cerrado */ }
  if (vite && vite.exitCode === null) {
    vite.kill('SIGTERM');
    await new Promise(ok => { const t = setTimeout(() => { vite.kill('SIGKILL'); ok(); }, 3000); vite.once('exit', () => { clearTimeout(t); ok(); }); });
  }
  process.exit(codigo);
}
process.on('SIGINT', () => apagar(130));
process.on('SIGTERM', () => apagar(143));
const tope = setTimeout(() => { console.error(`FALLO: pasó el tope de ${opciones.tope ?? 180} s`); apagar(1); }, Number(opciones.tope ?? 180) * 1000);

// El .env de la carpeta (si hay) apuntaría a otra base: lo del entorno le gana.
vite = spawn(process.execPath, [path.join(RAIZ, 'node_modules/vite/bin/vite.js'), '--port', String(puerto), '--strictPort', '--host', '127.0.0.1'], {
  cwd: RAIZ,
  env: { ...process.env, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'falsa' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let viteLog = '';
vite.stdout.on('data', d => { viteLog += d; });
vite.stderr.on('data', d => { viteLog += d; });
vite.once('exit', c => { if (!apagado) { console.error(`FALLO: vite se cerró (${c})\n${viteLog}`); apagar(1); } });

async function esperarVite() {
  for (let i = 0; i < 600; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* todavía no */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`vite no contestó en ${BASE}\n${viteLog}`);
}

// --- la página -----------------------------------------------------------------
const consola = [];
const bloqueado = [];
try {
  await esperarVite();
  navegador = await chromium.launch();
  const ctx = await navegador.newContext({
    viewport: { width: Number(opciones.ancho ?? 1440), height: Number(opciones.alto ?? 900) },
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(([clave, sesion]) => {
    localStorage.setItem(clave, sesion);
  }, [claveDeSesion(SUPABASE), JSON.stringify(sesionFalsa(usuario))]);
  await ctx.route('**/*', async route => {
    const pedido = route.request();
    const url = new URL(pedido.url());
    if (url.origin === SUPABASE) {
      const r = falso.responder({ method: pedido.method(), url: pedido.url(), headers: pedido.headers(), body: pedido.postData() });
      return route.fulfill({ status: r.status, headers: { ...r.headers, 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: r.body });
    }
    if (url.origin === BASE) return route.continue();
    if (pedido.method() === 'GET' && /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return route.continue();
    bloqueado.push(`${pedido.method()} ${pedido.url()}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consola.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => consola.push(`pageerror: ${e.message}`));

  await page.goto(BASE + ruta);
  await page.waitForLoadState('networkidle').catch(() => {});
  if (opciones.pasos) {
    const pasos = await import(pathToFileURL(path.resolve(String(opciones.pasos))).href);
    await pasos.default(page, { falso, BASE });
  }
  await page.waitForTimeout(Number(opciones.esperar ?? 2500));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  await page.screenshot({ path: salida, fullPage: !!opciones.completa });
  const final = new URL(page.url()).pathname;

  fs.writeFileSync(salidaEscrito, JSON.stringify(falso.escrito, null, 2) + '\n');
  console.log(`captura: ${salida}${final !== ruta ? `  (la página terminó en ${final})` : ''}`);
  console.log(`escrito: ${salidaEscrito} (${falso.escrito.length})`);
  for (const e of falso.escrito) console.log(`  ${e.metodo} ${e.tabla} ${JSON.stringify(e.filtros)} → ${e.filas} fila(s); campos: ${Object.keys(Array.isArray(e.cuerpo) ? e.cuerpo[0] ?? {} : e.cuerpo ?? {}).join(', ')}`);
  if (bloqueado.length) console.log(`cortado (no sale a la red): ${bloqueado.length}\n  ${bloqueado.join('\n  ')}`);
  if (consola.length) console.log(`consola: ${consola.length}\n  ${consola.join('\n  ')}`);
  if (final === '/auth') { console.error('FALLO: la página mandó al login (la sesión falsa no entró)'); await apagar(1); }
  clearTimeout(tope);
  await apagar(0);
} catch (e) {
  console.error(`FALLO: ${String(e?.stack ?? e)}`);
  await apagar(1);
}
