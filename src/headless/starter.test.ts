// What `pgs project` and `pgs doc font` teach where there is nothing yet (Khadosh/estudio#806):
// read with the same schema and parser the commands use, so it cannot go stale.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCommand } from './commands';
import { loadFont } from './fontfile';
import { projectSchema } from './project';
import { EXAMPLE_FONT_SHEET, STARTER_PROJECT, exampleFontsDir, starterText } from './starter';

describe('starter', () => {
  it('the skeleton is a valid pgs.json, and its roles and ramps name the colors the palette commands create', () => {
    expect(projectSchema.safeParse(STARTER_PROJECT).success).toBe(true);
    const text = starterText('/x');
    const named = [...text.matchAll(/"\d+":"([^"]+)"/g)].map(m => m[1]);
    const used = [...Object.values(STARTER_PROJECT.visual.roles), ...Object.values(STARTER_PROJECT.visual.ramps).flat()];
    for (const n of used) expect(named, n).toContain(n);
  });

  it('pgs project with no pgs.json answers the skeleton', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-starter-'));
    await expect(runCommand('project', { path: dir })).rejects.toThrow(/"palette": "art\/paleta.pss.json"[\s\S]*pgs palette path=/);
  });

  it('the example sheet reads as a font, and doc font shows it with the whole Nube', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pgs-starter-'));
    writeFileSync(join(dir, 'hola.txt'), EXAMPLE_FONT_SHEET);
    const { font } = loadFont(join(dir, 'hola.txt'), false);
    expect([...font.glyphs.keys()].length).toBe(6);
    const doc = await runCommand('doc', { command: 'font' });
    expect(doc.text).toContain(EXAMPLE_FONT_SHEET);
    expect(doc.text).toContain(join(exampleFontsDir()!, 'nube_base.txt'));
  });
});
