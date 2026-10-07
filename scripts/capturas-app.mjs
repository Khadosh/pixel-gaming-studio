// Capturas 1:1 de las pantallas de la app, para comparar antes y después de un
// cambio de interfaz. Todas salen a 1440x900 salvo las que dicen otra cosa, que
// es el tamaño con el que se sacaron las de `docs/tipografia-app/antes-app/`.
//
//   npm run dev                                   (en otra terminal, puerto 8080)
//   node scripts/capturas-app.mjs docs/tipografia-app/despues-app
//   node scripts/capturas-app.mjs /tmp/x catalogo ficha-asset   # sólo algunas
//
// Las pantallas con sesión se sacan con una cuenta de prueba que el script da de
// alta solo contra el Supabase local (127.0.0.1); queda en `.capturas-cuenta.json`,
// que no se versiona. Borralo para empezar con una cuenta nueva y vacía.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8080';
const OUT = process.argv[2];
const ONLY = process.argv.slice(3);
fs.mkdirSync(OUT, { recursive: true });

const WIDE = { width: 1440, height: 900 };

/** @type {Array<{name:string, w?:number, h?:number, full?:boolean, go:(p:import('@playwright/test').Page)=>Promise<void>}>} */
const SHOTS = [
  { name: 'landing', full: true, go: async p => { await p.goto(`${BASE}/`); await p.waitForTimeout(1200); } },
  { name: 'auth-login', go: async p => { await p.goto(`${BASE}/auth`); await p.waitForTimeout(800); } },
  { name: 'auth-signup', go: async p => {
      await p.goto(`${BASE}/auth`); await p.waitForTimeout(500);
      await p.getByText(/Reg[ií]strate aqu[ií]/i).click(); await p.waitForTimeout(600);
    } },
  { name: 'angosto-1100-auth', w: 1100, h: 900, go: async p => { await p.goto(`${BASE}/auth`); await p.waitForTimeout(800); } },
  { name: 'angosto-900-auth', w: 900, h: 900, go: async p => { await p.goto(`${BASE}/auth`); await p.waitForTimeout(800); } },
  { name: 'catalogo', full: true, go: async p => { await p.goto(`${BASE}/catalog`); await p.waitForTimeout(2500); } },
  { name: 'angosto-1100-catalogo', w: 1100, h: 900, go: async p => { await p.goto(`${BASE}/catalog`); await p.waitForTimeout(2500); } },
  { name: 'angosto-900-catalogo', w: 900, h: 900, go: async p => { await p.goto(`${BASE}/catalog`); await p.waitForTimeout(2500); } },
  // El enlace del catálogo a la ficha está roto (ver issue aparte): se entra por id.
  { name: 'ficha-asset', go: async p => { await p.goto(`${BASE}/asset/warrior`); await p.waitForTimeout(2000); } },
  { name: 'ficha-asset-completa', full: true, go: async p => { await p.goto(`${BASE}/asset/warrior`); await p.waitForTimeout(2000); } },
  { name: 'ficha-asset-16', go: async p => { await p.goto(`${BASE}/asset/coin16`); await p.waitForTimeout(2000); } },
  { name: 'icon-preview', go: async p => { await p.goto(`${BASE}/icon-preview`); await p.waitForTimeout(1500); } },
  { name: 'dibujo-de-texto', go: async p => { await p.goto(`${BASE}/dibujo`); await p.waitForTimeout(1200); } },
  { name: 'no-encontrado', go: async p => { await p.goto(`${BASE}/esto-no-existe`); await p.waitForTimeout(800); } },
  { name: 'dashboard', auth: 'vacio', go: async p => { await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500); } },
  { name: 'dashboard-vacio', auth: 'vacio', go: async p => { await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500); } },
  { name: 'dashboard-asistente-proyecto', auth: 'vacio', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByRole('button', { name: /NUEVO MUNDO/ }).click(); await p.waitForTimeout(700);
    } },
  { name: 'dashboard-asistente-proyecto-paso2', auth: 'vacio', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByRole('button', { name: /NUEVO MUNDO/ }).click(); await p.waitForTimeout(500);
      await p.getByPlaceholder('Ej. Mi Aventura Epica...').fill('Tipografía Nube 8');
      await p.getByRole('button', { name: 'SIGUIENTE' }).click(); await p.waitForTimeout(700);
    } },
  { name: 'dashboard-asistente-proyecto-paso3', auth: 'vacio', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByRole('button', { name: /NUEVO MUNDO/ }).click(); await p.waitForTimeout(500);
      await p.getByPlaceholder('Ej. Mi Aventura Epica...').fill('Tipografía Nube 8');
      await p.getByRole('button', { name: 'SIGUIENTE' }).click(); await p.waitForTimeout(400);
      await p.getByRole('button', { name: 'SIGUIENTE' }).click(); await p.waitForTimeout(700);
    } },
  { name: 'workspace', auth: 'proyecto', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByText('Tipografía Nube 8').first().click(); await p.waitForTimeout(2500);
    } },
  { name: 'workspace-creador', auth: 'proyecto', full: true, go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByText('Tipografía Nube 8').first().click(); await p.waitForTimeout(2000);
      await p.getByRole('button', { name: /CREAR SPRITE/ }).click(); await p.waitForTimeout(900);
    } },
  { name: 'asistente-ia-concepto', auth: 'proyecto', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByText('Tipografía Nube 8').first().click(); await p.waitForTimeout(2000);
      await p.getByRole('button', { name: /CREAR SPRITE/ }).click(); await p.waitForTimeout(700);
      await p.getByText('MAGIA DE IA').click(); await p.waitForTimeout(900);
    } },
  { name: 'asistente-ia-concepto-lleno', auth: 'proyecto', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByText('Tipografía Nube 8').first().click(); await p.waitForTimeout(2000);
      await p.getByRole('button', { name: /CREAR SPRITE/ }).click(); await p.waitForTimeout(700);
      await p.getByText('MAGIA DE IA').click(); await p.waitForTimeout(700);
      await p.getByRole('textbox').first().fill('Un guerrero samurái con armadura de neón, katana resplandeciente y casco con cuernos');
      await p.waitForTimeout(500);
    } },
  { name: 'asistente-ia-estilo', auth: 'proyecto', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByText('Tipografía Nube 8').first().click(); await p.waitForTimeout(2000);
      await p.getByRole('button', { name: /CREAR SPRITE/ }).click(); await p.waitForTimeout(700);
      await p.getByText('MAGIA DE IA').click(); await p.waitForTimeout(700);
      await p.getByRole('textbox').first().fill('Un guerrero samurái con armadura de neón');
      await p.getByRole('button', { name: /CONTINUAR/ }).click(); await p.waitForTimeout(900);
    } },
  { name: 'asistente-ia-referencia', auth: 'proyecto', go: async p => {
      await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1500);
      await p.getByText('Tipografía Nube 8').first().click(); await p.waitForTimeout(2000);
      await p.getByRole('button', { name: /CREAR SPRITE/ }).click(); await p.waitForTimeout(700);
      await p.getByText('MAGIA DE IA').click(); await p.waitForTimeout(700);
      await p.getByRole('textbox').first().fill('Un guerrero samurái con armadura de neón');
      await p.getByRole('button', { name: /CONTINUAR/ }).click(); await p.waitForTimeout(600);
      await p.getByRole('button', { name: /CONTINUAR/ }).click(); await p.waitForTimeout(900);
    } },
];

// --- cuenta de prueba, sólo contra el Supabase local de 127.0.0.1 -----------
const CUENTA_PATH = new URL('../.capturas-cuenta.json', import.meta.url);
if (!fs.existsSync(CUENTA_PATH)) {
  const r = () => Math.random().toString(36).slice(2, 10);
  fs.writeFileSync(CUENTA_PATH, JSON.stringify({ email: `tipografia.${r()}@pgs.test`, password: `pgs-${r()}-${r()}` }, null, 2));
}
const CUENTA = JSON.parse(fs.readFileSync(CUENTA_PATH, 'utf8'));
let cuentaLista = false;

async function registrar(page) {
  // Alta de una cuenta de prueba contra el Supabase local (127.0.0.1:54421).
  await page.goto(`${BASE}/auth?mode=signup`);
  await page.getByLabel(/^Email$/i).fill(CUENTA.email);
  await page.getByLabel(/Contraseña/i).fill(CUENTA.password);
  await page.getByRole('button', { name: 'REGISTRARSE' }).click();
  await page.waitForTimeout(3000);
}

async function entrar(page) {
  if (!cuentaLista) { await registrar(page); cuentaLista = true; }
  await page.goto(`${BASE}/auth`);
  await page.getByLabel(/^Email$/i).fill(CUENTA.email);
  await page.getByLabel(/Contraseña/i).fill(CUENTA.password);
  await page.getByRole('button', { name: 'INICIAR SESION' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1200);
}

async function crearProyecto(page) {
  if (await page.getByText('Tipografía Nube 8').count() > 0) return;
  await page.getByRole('button', { name: /NUEVO MUNDO/ }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Ej. Mi Aventura Epica...').fill('Tipografía Nube 8');
  await page.getByRole('button', { name: 'SIGUIENTE' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'SIGUIENTE' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'CREAR MUNDO' }).click();
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch();
for (const shot of SHOTS) {
  if (ONLY.length && !ONLY.includes(shot.name)) continue;
  const ctx = await browser.newContext({
    viewport: { width: shot.w ?? WIDE.width, height: shot.h ?? WIDE.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  try {
    if (shot.auth) {
      await entrar(page);
      if (shot.auth === 'proyecto') await crearProyecto(page);
    }
    await shot.go(page);
    // los sprites se pintan en <canvas>: esperar a que alguno deje de estar vacío
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${shot.name}.png`), fullPage: !!shot.full });
    console.log('ok', shot.name);
  } catch (e) {
    console.log('FALLO', shot.name, String(e).split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
