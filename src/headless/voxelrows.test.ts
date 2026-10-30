// voxel debug=filas (Khadosh/pixel-gaming-studio#56): where each row of a
// drawing on a round shape falls, read off the render and numbered.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVoxel, turnModel, type VoxelModel } from './voxel';
import { readPng } from './png';
import { rowsModel, rowsSeen, readMark } from './voxelrows';
import { runCommand } from './commands';

const SKIN = { top: '#f0c8a0', left: '#d8a880', right: '#b08060' };
// A head: a sphere of 10 with a face on +y (eyes on row 4, mouth on row 7) and a crown drawn on its top.
const head = (): VoxelModel => ({
  id: 'cabeza', outline: '#200810',
  materials: { piel: SKIN },
  boxes: [{
    id: 'cara', at: [0, 0, 0], size: [10, 10, 10], material: 'piel', shape: 'sphere',
    paint: {
      left: { rows: ['..........', '..........', '..........', '..........', '..k....k..', '..........', '..........', '...kkkk...'], glyphs: { k: '#200810' } },
      top: { rows: ['kkkkkkkkkk'], glyphs: { k: '#202020' } },
    },
  }],
});

describe('voxel debug=filas', () => {
  it('swaps a side of a round shape for its rows, the whole face, and greys its top', () => {
    const { model, faces } = rowsModel(head());
    expect(faces).toEqual([{ box: 0, id: 'cara', face: '+y', rows: 10, at: 0 }]);
    const paint = model.boxes[0].paint!;
    // The top is laid unit by unit: grey, not numbered.
    expect(readMark(paint.top!.pixels![0][0])).toEqual({ box: 0, face: 'top', row: -1, ink: true });
    const px = paint['+y']!.pixels!;
    expect(px.length).toBe(10);
    expect(readMark(px[4][2])).toEqual({ box: 0, face: '+y', row: 4, ink: true });
    expect(readMark(px[4][3])).toEqual({ box: 0, face: '+y', row: 4, ink: false });
    // Rows past the drawing are rows of the face all the same.
    expect(readMark(px[9][0])?.row).toBe(9);
  });

  it('reads off the render where each row lands: seen from the front, top to bottom and in order', () => {
    const { model, faces } = rowsModel(head());
    const img = renderVoxel(turnModel(model, 45));
    const [seen] = rowsSeen(img, faces);
    const firsts = seen.screen.filter(ys => ys.length).map(ys => ys[0]);
    expect(firsts.length).toBeGreaterThan(5);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    // From behind only its top edge shows, over the crown; the mouth does not.
    const back = rowsSeen(renderVoxel(turnModel(model, 225)), faces)[0];
    expect(back.screen[7]).toEqual([]);
    expect(back.screen.filter(ys => ys.length).length).toBeLessThanOrEqual(2);
  });

  it('writes the sheet and only the sheet, with a line per turn, and leaves the plain render untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'filas-'));
    writeFileSync(join(dir, 'cabeza.voxel.json'), JSON.stringify(head()));
    const plain = renderVoxel(head());
    const res = await runCommand('voxel', { model: join(dir, 'cabeza.voxel.json'), out: join(dir, 'cabeza.pss.json'), debug: 'filas' });
    expect(existsSync(join(dir, 'cabeza.pss.json'))).toBe(false);
    const sheet = readPng(join(dir, 'cabeza.filas.png'));
    expect(sheet.width).toBeGreaterThan(plain.width * 12 * 4);
    const lines = res.text!.split('\n');
    expect(lines.filter(l => l.startsWith('giro ')).length).toBe(8);
    expect(res.text).toMatch(/giro 45 · cara \+y: fila→y 3→\d+ 4→/);
    // The top drawing takes the rows above the eyes: said, not left to guess.
    expect(res.text).toMatch(/giro 45 · cara \+y: .* no se ven: 0-2/);
    expect(res.text).toMatch(/cara también tiene dibujo arriba/);
    // One turn when rotate asks for it, and the same rows as the eighth of the eight.
    const one = await runCommand('voxel', { model: join(dir, 'cabeza.voxel.json'), out: join(dir, 'cabeza.pss.json'), png: join(dir, 'uno.png'), debug: 'filas', rotate: 45 });
    const at45 = (t: string) => t.split('\n').find(l => l.startsWith('giro 45 '));
    expect(at45(one.text!)).toBe(at45(res.text!));
    expect(one.text!.split('\n').filter(l => l.startsWith('giro ')).length).toBe(1);
  });

  it('says no where there is nothing to look at, or more than one model', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'filas-'));
    const flat = { ...head(), boxes: [{ ...head().boxes[0], shape: undefined }] };
    writeFileSync(join(dir, 'caja.voxel.json'), JSON.stringify(flat));
    await expect(runCommand('voxel', { model: join(dir, 'caja.voxel.json'), out: join(dir, 'c.pss.json'), debug: 'filas' })).rejects.toThrow(/no drawing on a side of a round shape/);
    writeFileSync(join(dir, 'cabeza.voxel.json'), JSON.stringify(head()));
    await expect(runCommand('voxel', { model: join(dir, 'cabeza.voxel.json'), out: join(dir, 'c.pss.json'), debug: 'filas', layers: true })).rejects.toThrow(/debug=filas looks at one model/);
  });
});
