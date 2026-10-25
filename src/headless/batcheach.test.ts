// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './commands';
import { batchSteps } from './batch';
import { eachCombinations, fillStep } from './batcheach';
import { parseLine } from './batchlines';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-each-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const at = (name: string) => join(dir, name);
const CERCA = join(__dirname, '../../examples/props/cerca.json');

describe('each: what one step stands for', () => {
  it('is the product of the lists, the first name outermost', () => {
    expect(eachCombinations({ quien: ['a', 'b'], giro: [0, 90] }, 'x')).toEqual([
      { quien: 'a', giro: 0 }, { quien: 'a', giro: 90 },
      { quien: 'b', giro: 0 }, { quien: 'b', giro: 90 },
    ]);
  });

  it('puts the value in every string, however deep, and leaves a {word} that is not its own', () => {
    const args = fillStep({
      rotate: '{giro}', out: 'art/silla_{giro}.pss.json', only: ['{pieza}', '{pieza}_sombra'],
      deep: { x: 'a-{pieza}' }, anims: '*_{view}', n: 3,
    }, { giro: 90, pieza: 'silla' }, 'x');
    expect(args).toEqual({
      rotate: 90, out: 'art/silla_90.pss.json', only: ['silla', 'silla_sombra'],
      deep: { x: 'a-silla' }, anims: '*_{view}', n: 3,
    });
    // a placeholder alone keeps the type: the schema sees a number, not "90"
    expect(typeof args.rotate).toBe('number');
  });

  it('goes two things together with an object, and null takes the argument out', () => {
    const steps = batchSteps([{
      command: 'voxel', model: 'm_{dir.src}.json', rotate: '{dir.rotate}', out: 'p_{dir.name}.pss.json',
      each: { dir: [{ src: 'yp', rotate: null, name: 'yp' }, { src: 'yp', rotate: 45, name: 'xpyp' }] },
    }], 'x');
    expect(steps.map(s => s.args)).toEqual([
      { model: 'm_yp.json', out: 'p_yp.pss.json' },
      { model: 'm_yp.json', rotate: 45, out: 'p_xpyp.pss.json' },
    ]);
    expect(steps[1].each).toEqual({ step: 1, vars: { dir: { src: 'yp', rotate: 45, name: 'xpyp' } } });
  });

  it('a step with no each is still the step as written', () => {
    expect(batchSteps([{ command: 'info', path: 'a' }], 'x')).toEqual([{ command: 'info', args: { path: 'a' } }]);
  });
});

describe('each: what it refuses, all at once', () => {
  const refuse = (step: Record<string, unknown>) => () => batchSteps([{ command: 'voxel', ...step }], 'r.json');

  it('a field the value does not have, naming the values', () => {
    expect(refuse({ out: '{d.nombre}', each: { d: [{ name: 'yp' }] } }))
      .toThrow(/r\.json: step 1 \(d=\{name:yp\}\): \{d\.nombre\} but d has no "nombre" \(it has name\)/);
  });

  it('an object or a null in the middle of a string', () => {
    expect(refuse({ out: 'a_{d}.json', each: { d: [{ name: 'yp' }] } })).toThrow(/cannot go in the middle of "a_\{d\}\.json"/);
    expect(refuse({ out: 'a_{g}.json', each: { g: [null] } })).toThrow(/cannot go in the middle/);
  });

  it('a name no argument uses', () => {
    expect(refuse({ out: 'a.json', each: { giro: [0, 90] } })).toThrow(/\{giro\} of "each" is in no argument/);
  });

  it('two steps that would write the same out', () => {
    expect(refuse({ out: 'a.json', model: 'm_{giro}.json', each: { giro: [0, 90] } }))
      .toThrow(/\(giro=0\) and \(giro=90\) both write out=a\.json/);
  });

  it('an each that is not names and lists', () => {
    expect(refuse({ out: '{g}', each: [0, 90] })).toThrow(/"each" is an object of names/);
    expect(refuse({ out: '{g}', each: { g: [] } })).toThrow(/each\.g must be a list with at least one value/);
    expect(refuse({ out: '{g}', each: { g: 90 } })).toThrow(/each\.g must be a list/);
    expect(refuse({ out: '{g}', each: { g: [[1, 2]] } })).toThrow(/each\.g\[0\] is a list/);
    expect(refuse({ out: '{g}', each: { 'g-1': [1] } })).toThrow(/"g-1" cannot be a name/);
  });

  it('every step that does not expand, not only the first', () => {
    expect(() => batchSteps([
      { command: 'voxel', out: 'a.json', each: { giro: [0] } },
      { command: 'info', path: 'ok' },
      { command: 'voxel', out: '{d.x}', each: { d: [{}] } },
    ], 'r.json')).toThrow(/2 step\(s\) with "each" do not expand[\s\S]*step 1:[\s\S]*step 3/);
  });

  it('outside a batch it is refused, not dropped by the schema and run once', async () => {
    await expect(runCommand('new', { path: at('a_{g}.pss.json'), width: 8, each: { g: [1, 2] } }))
      .rejects.toThrow(/"each" only works on a step of a batch/);
    expect(existsSync(at('a_{g}.pss.json'))).toBe(false);
    // the line mode goes through runCommand too
    expect(parseLine('{"command": "new", "each": {"g": [1]}}')).toMatchObject({ name: 'new' });
  });
});

describe('each: in a batch', () => {
  it('a bad value is named with its value, and nothing is written', async () => {
    await expect(runCommand('batch', {
      steps: [{ command: 'new', path: at('a_{w}.pss.json'), width: '{w}', each: { w: [8, 'ancho'] } }],
    })).rejects.toThrow(/1 of 2 step\(s\) do not check out[\s\S]*step 2 \(step 1 of the recipe, w=ancho\) new: width/);
    expect(existsSync(at('a_8.pss.json'))).toBe(false);
  });

  it('dry_run answers the recipe expanded, with the values of each step', async () => {
    const r = await runCommand('batch', {
      dry_run: true,
      steps: [
        { command: 'new', path: at('a_{w}.pss.json'), width: '{w}', each: { w: [8, 16] } },
        { command: 'info', path: at('a_8.pss.json') },
      ],
    });
    expect(r.text).toMatch(/1 · new {2}w=8\n {2}2 · new {2}w=16\n {2}3 · info\n/);
    expect((r.data as { expanded: unknown[] }).expanded).toEqual([
      { command: 'new', path: at('a_8.pss.json'), width: 8 },
      { command: 'new', path: at('a_16.pss.json'), width: 16 },
      { command: 'info', path: at('a_8.pss.json') },
    ]);
    expect(existsSync(at('a_8.pss.json'))).toBe(false);
  });

  it('four turns of a voxel model in one step are byte for byte the four steps written out', async () => {
    const giros = [0, 90, 180, 270];
    await runCommand('batch', {
      steps: giros.map(g => ({
        command: 'voxel', model: CERCA, ...(g ? { rotate: g } : {}),
        out: at(`a_${g}.pss.json`), png: at(`a_${g}.png`),
      })),
    });
    const r = await runCommand('batch', {
      steps: [{
        command: 'voxel', model: CERCA, rotate: '{g.rotate}',
        out: at('b_{g.n}.pss.json'), png: at('b_{g.n}.png'),
        each: { g: giros.map(n => ({ n, rotate: n || null })) },
      }],
    });
    expect(r.text).toMatch(/4\/4 step\(s\) done/);
    for (const g of giros) {
      for (const ext of ['pss.json', 'png']) {
        expect(readFileSync(at(`b_${g}.${ext}`)).equals(readFileSync(at(`a_${g}.${ext}`)))).toBe(true);
      }
    }
    // and the turns are really different drawings, so the test says something
    expect(readFileSync(at('b_0.png')).equals(readFileSync(at('b_90.png')))).toBe(false);
  });
});
