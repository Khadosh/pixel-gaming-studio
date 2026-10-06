// A project is a folder with a `pgs.json` in it, and the style it holds is
// what tells an agent how things are drawn here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PROJECT_FILE, findProject, loadProject, projectBrief, projectPath } from './project';
import { runCommand } from './commands';

const STYLE = {
  name: 'Proyecto de prueba',
  says: 'Terroso y sobrio.\nSiluetas gruesas.',
  visual: {
    grid: 1,
    sizes: { icon: [16, 16], tile: [16, 16] },
    light: { from: 'upper_left', strength: 'soft' },
    dither: { use: false },
    contract: 'body',
  },
  type: { font: 'art/nube.txt', steps: [8, 16, 24] },
};

describe('project', () => {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pgs-project-'));
    writeFileSync(join(dir, PROJECT_FILE), JSON.stringify(STYLE));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('finds the project from a folder deep inside it', () => {
    const deep = join(dir, 'art', 'iconos');
    mkdirSync(deep, { recursive: true });
    expect(findProject(deep)).toBe(join(dir, PROJECT_FILE));
  });

  it('finds it from a file, not only from a folder', () => {
    const file = join(dir, 'art', 'un_icono.txt');
    mkdirSync(join(dir, 'art'));
    writeFileSync(file, 'x');
    expect(findProject(file)).toBe(join(dir, PROJECT_FILE));
  });

  it('finds it from a path that does not exist yet, looking next to it', () => {
    expect(findProject(join(dir, 'art', 'todavia_no.txt'))).toBe(join(dir, PROJECT_FILE));
  });

  // Up and not down on purpose: a folder that holds projects is not one.
  it('does not walk down, and gives up at the root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'pgs-nada-'));
    try {
      expect(findProject(outside)).toBeUndefined();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('says which field is wrong instead of failing blank', () => {
    writeFileSync(join(dir, PROJECT_FILE), JSON.stringify({ name: 'x', type: { steps: [8, 0] } }));
    expect(() => loadProject(join(dir, PROJECT_FILE))).toThrow(/type\.steps\.1/);
  });

  it('says it is not JSON when it is not JSON', () => {
    writeFileSync(join(dir, PROJECT_FILE), '{ roto');
    expect(() => loadProject(join(dir, PROJECT_FILE))).toThrow(/not valid JSON/);
  });

  it('resolves the paths of the style against the project folder, not the working directory', () => {
    const p = loadProject(join(dir, PROJECT_FILE));
    expect(projectPath(p, 'art/nube.txt')).toBe(resolve(dir, 'art/nube.txt'));
    expect(projectPath(p, '/un/absoluto.txt')).toBe('/un/absoluto.txt');
  });

  // The brief is what an agent reads when it enters. Both halves have to be in
  // it: the prose that says how to make a new one, and the numbers a lint checks.
  it('reads out the prose and the numbers', () => {
    const text = projectBrief(loadProject(join(dir, PROJECT_FILE)));
    expect(text).toContain('Proyecto de prueba');
    expect(text).toContain('Siluetas gruesas.');
    expect(text).toContain('icon 16x16');
    expect(text).toContain('8, 16, 24 px');
    expect(text).toContain('body');
  });

  it('the command answers with the brief as text', async () => {
    const out = await runCommand('project', { path: dir });
    expect(out.text).toContain('Proyecto de prueba');
    expect((out.data as { name: string }).name).toBe('Proyecto de prueba');
  });

  it('the command says where it looked when there is no project', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'pgs-nada-'));
    try {
      await expect(runCommand('project', { path: outside })).rejects.toThrow(new RegExp(PROJECT_FILE));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

// The control that matters: PGS is its own first client. If the real file does
// not load, the format does not work, however green the made-up ones are.
describe('the pgs.json of PGS itself', () => {
  it('loads, and says what it is for', () => {
    const file = findProject(resolve(__dirname, '..', '..'));
    expect(file).toBeTruthy();
    const project = loadProject(file!);
    expect(project.style.name).toBe('Pixel Gaming Studio');
    const text = projectBrief(project);
    expect(text).toContain('Letra');
    expect(text).toContain('8, 16, 24 px');
  });
});
