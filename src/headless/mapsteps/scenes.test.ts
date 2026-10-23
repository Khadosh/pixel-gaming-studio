// Every scene map step says which place of the first game it is an example of,
// and the families agree with the recipes of those places (Khadosh/pixel-gaming-studio#1).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commands, runCommand } from '../commands';
import { commandDoc, isSceneStep } from '../mcpcatalog';
import { SCENE_FAMILIES, sceneFamilyOf } from './scenes';

const FIX = join(__dirname, '../fixtures/mapas');
const recipes = Object.fromEntries(readdirSync(FIX).filter(f => f.endsWith('.receta.json')).map(f => [
  f.replace('.receta.json', ''),
  new Set<string>((JSON.parse(readFileSync(join(FIX, f), 'utf8')).steps as { step: string }[]).map(s => s.step)),
]));

describe('scene families', () => {
  it('every scene step has one family, and a family names only scene steps', () => {
    const scene = commands.filter(c => isSceneStep(c.name)).map(c => c.name.slice(4));
    const listed = SCENE_FAMILIES.flatMap(f => f.steps);
    expect(new Set(listed).size, 'a step in two families').toBe(listed.length);
    expect([...listed].sort()).toEqual([...scene].sort());
    expect(new Set(SCENE_FAMILIES.map(f => f.id)).size).toBe(SCENE_FAMILIES.length);
  });

  it('a family lists the recipes that use its steps, and only real ones', () => {
    for (const f of SCENE_FAMILIES) {
      for (const m of f.maps) {
        expect(recipes[m], `${f.id}: no recipe ${m}`).toBeDefined();
        expect(f.steps.some(s => recipes[m].has(s)), `${f.id}: ${m} uses none of its steps`).toBe(true);
      }
    }
    for (const [map, steps] of Object.entries(recipes)) {
      for (const s of steps) {
        const f = sceneFamilyOf(s);
        if (f) expect(f.maps, `${map} uses ${s} of ${f.id}`).toContain(map);
      }
    }
  });

  it('pgs_doc says the family of a scene step and lists the families as "escenas"', async () => {
    const grove = commands.find(c => c.name === 'map_grove')!;
    expect(commandDoc(grove)).toMatch(/Scene step .*family forja/);
    expect(commandDoc(commands.find(c => c.name === 'map_area')!)).not.toMatch(/Scene step/);
    const doc = await runCommand('doc', { command: 'pgs_escenas' });
    for (const f of SCENE_FAMILIES) expect(doc.text).toContain(`${f.id} — ${f.name}`);
  });
});
