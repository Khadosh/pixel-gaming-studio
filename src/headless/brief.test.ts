// @vitest-environment node
// What MCP answers. The cut is not "does it write files?" — it is "does it
// produce text worth reading?": a command that brings its own `text` keeps it
// whole, a command in `LOOKING` keeps text *and* image, and everything else
// gets one line built from its `data`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { readRecipe } from './mapfile';
import { LOOKING, briefLine, mcpContent, oneLine } from './brief';

const FIX = join(__dirname, 'fixtures/mapas');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-brief-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** The text MCP answers for a command, as an agent reads it. */
function answer(name: string, result: Parameters<typeof mcpContent>[1]): string {
  const content = mcpContent(name, result);
  return (content.find(c => c.type === 'text') as { text: string }).text;
}

/** The ladera recipe in a temp folder, exporting beside itself. */
function ladera(): string {
  for (const f of ['ladera.json', 'visuals.json', 'paleta.pss.json']) copyFileSync(join(FIX, f), join(dir, f));
  cpSync(join(FIX, 'objetos'), join(dir, 'objetos'), { recursive: true });   // the objects its stamps draw
  const recipe = readRecipe(join(FIX, 'ladera.receta.json'));
  const path = join(dir, 'r.json');
  writeFileSync(path, JSON.stringify({
    ...recipe,
    export: { ...recipe.export, png: 'out', txt: 'txt', src: 'src', ground: undefined },
  }));
  return path;
}

describe('the rule', () => {
  it('a command that brings its own text keeps it; one that does not gets a line', () => {
    const withText = { data: { out: '/x.wav', peak_db: -3 }, text: 'sound  sec\nx  0.30' };
    expect(briefLine('sound', withText)).toBe('sound  sec\nx  0.30');
    expect(answer('sound', withText)).toBe('sound  sec\nx  0.30');
    const without = { data: { out: '/x.png', colors: 9, moved: 3, table: [1, 2, 3] } };
    expect(briefLine('png_fit', without)).toBe('ok png_fit: out=/x.png · colors=9 · moved=3');
  });

  it('oneLine always builds the line, text or not: a batch report is a line per step', () => {
    const r = { data: { out: '/x.wav' }, text: 'a long\ncontrol\ntable' };
    expect(oneLine('sound', r)).toBe('ok sound: out=/x.wav');
    expect(oneLine('draw', { data: { ascii: '..\n11' } })).toBe('ok draw: ascii=.. ⏎ 11');
  });

  it('a text that is not there is still one line, truncated', () => {
    const long = { data: { out: 'x'.repeat(400) } };
    const line = briefLine('new', long);
    expect(line.length).toBeLessThanOrEqual(240);
    expect(line.endsWith('…')).toBe(true);
  });

  it('an image still needs preview, text or no text', () => {
    const r = { data: { ok: 1 }, text: 'the table', png: Buffer.from([1, 2, 3]) };
    expect(mcpContent('sound', r).some(c => c.type === 'image')).toBe(false);
    expect(mcpContent('sound', r, true).some(c => c.type === 'image')).toBe(true);
  });
});

describe('the commands that were mute', () => {
  it('sound answers the control table, for one recipe as for a folder', async () => {
    const out = join(dir, 'golpe.wav');
    const result = await runCommand('sound', { recipe: 'examples/sonido/golpe_seco.json', out });
    expect(LOOKING.has('sound')).toBe(false);
    const text = answer('sound', result);
    expect(text).toContain('peak');
    expect(text).toContain('centroid');
    expect(text).toMatch(/golpe_seco/);
  });

  it('music answers the control table plus what the score holds', async () => {
    const out = join(dir, 'bucle.wav');
    const result = await runCommand('music', { score: 'examples/sonido/bucle_en_la.partitura', out });
    const text = answer('music', result);
    expect(text).toContain('seam ok');
    expect(text).toMatch(/compases, \d+ notas/);
  });

  it('map_from_game answers the grid, which is what a step is planned on', async () => {
    const result = await runCommand('map_from_game', {
      game: join(FIX, 'ladera.json'), out: join(dir, 'nueva.json'), visuals: join(FIX, 'visuals.json'),
    });
    const text = answer('map_from_game', result);
    // The header, the column ruler and one row per cell of the map.
    expect(text).toContain('nueva.json');
    expect(text.split('\n').length).toBeGreaterThan(10);
    expect(text).toMatch(/[.#]{10}/);
  });

  it('map_export answers which file each layer wrote', async () => {
    const result = await runCommand('map_export', { recipe: ladera() });
    const text = answer('map_export', result);
    expect(text).toContain('ground: ladera.png');
    expect(text).toContain('ladera.txt');
    expect(text).toContain('mechones');
  });

  it('to_ascii without out answers the drawing itself', async () => {
    const path = join(dir, 'a.pss.json');
    await runCommand('new', { path, id: 'a', width: 4, palette: ['#ff0000'] });
    await runCommand('draw', { path, frame: 0, ops: [{ op: 'pixel', x: 1, y: 1, color: 1 }] });
    const text = answer('to_ascii', await runCommand('to_ascii', { path }));
    expect(text).toContain('size: 4x4');
    expect(text).toContain('= #ff0000');
    // And with out it is a file, so one line is the right answer.
    const written = answer('to_ascii', await runCommand('to_ascii', { path, out: join(dir, 'a.txt') }));
    expect(written).toMatch(/^ok to_ascii: out=/);
  });

  it('font answers the metrics and the problems of a glyph sheet', async () => {
    const result = await runCommand('font', { path: 'examples/tipografia/nube.txt' });
    const text = answer('font', result);
    expect(text).toContain('glifos');
    expect(text).toContain('base');
  });

  it('grid_mask says what it made', async () => {
    const result = await runCommand('grid_mask', { grid: ['###', '#.#', '###'], cell: 8, out: join(dir, 'm.json') });
    expect(answer('grid_mask', result)).toMatch(/^grid_mask 24x24 from 3x3 cells/);
  });

  it('batch answers its report, a line per step', async () => {
    const result = await runCommand('batch', {
      steps: [{ command: 'new', path: join(dir, 'b.pss.json'), width: 4 }],
    });
    expect(answer('batch', result)).toMatch(/1 ✓ ok new:[\s\S]*1\/1 step\(s\) done/);
  });
});
