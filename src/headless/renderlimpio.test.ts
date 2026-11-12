// `render` de un dibujo de un cuadro sale como es, listo para una página
// (Khadosh/estudio#807: en la planilla de D&D cada ícono salió con damero).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { readPng } from './png';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-render-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const alpha = (path: string, x: number, y: number) => {
  const img = readPng(path);
  return img.data[(y * img.width + x) * 4 + 3];
};

async function icono(): Promise<string> {
  const path = join(dir, 'icono.pss.json');
  await runCommand('new', { path, width: 16, palette: ['#a0522d'] });
  await runCommand('draw', { path, frame: 0, ops: [{ op: 'rect', x: 4, y: 4, w: 8, h: 8, color: '#a0522d' }] });
  return path;
}

describe('render of a one-frame drawing', () => {
  it('without frame gives the drawing alone: its size, transparent around it', async () => {
    const path = await icono();
    const out = join(dir, 'x.png');
    const r = await runCommand('render', { path, out, scale: 1 });
    const img = readPng(out);
    expect([img.width, img.height]).toEqual([16, 16]);
    expect(alpha(out, 0, 0)).toBe(0);
    expect(alpha(out, 4, 4)).toBe(255);
    expect((r.data as { kind: string }).kind).toBe('frame');
  });

  it('sheet=true still gives the contact sheet, and says how to get the drawing alone', async () => {
    const path = await icono();
    const out = join(dir, 'hoja.png');
    const r = await runCommand('render', { path, out, scale: 1, sheet: true });
    const img = readPng(out);
    expect([img.width, img.height]).toEqual([20, 20]);
    expect(alpha(out, 0, 0)).toBe(255);
    expect((r.data as { note: string }).note).toMatch(/frame=0/);
  });

  it('a drawing of several frames keeps the contact sheet by default', async () => {
    const path = await icono();
    await runCommand('frames', { path, action: 'add' });
    const out = join(dir, 'dos.png');
    const r = await runCommand('render', { path, out, scale: 1 });
    expect(readPng(out).width).toBe(2 * 16 + 3 * 2);
    expect((r.data as { kind: string }).kind).toBe('sheet');
  });
});
