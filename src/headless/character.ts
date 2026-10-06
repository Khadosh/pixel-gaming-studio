// Importing a whole character from a pack's sheets in one go, with the names an
// animation contract asks for (`contract.ts`: by default the directional one,
// idle/hurt/walk/attack per view plus technique and die).
//
// Two tables, and they are different kinds of thing: the **contract** says
// which animations have to exist and what they are called, and the **layout**
// says where a given pack keeps each of them. The first one belongs to the game,
// the second one to the pack, so a game with another contract does not need a
// new layout and a pack with another sheet does not need a new contract.
//
// The first layout is the Ninja Adventure convention: separate PNGs, 4 columns
// = down, up, left, right; Walk has 4 rows of steps; Special1 and Dead are
// single frames.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SpriteAsset } from '../lib/types';
import { importSheet, type TagInput } from './sheet';
import { DIRECTIONAL_CONTRACT, contractAnims, contractViews, roleOf, viewOf, type AnimationContract } from './contract';

export type CharacterLayout = 'ninja_separate' | 'ninja_sheet';

export interface ImportCharacterOptions {
  /** Directory holding the pack's PNGs. */
  dir: string;
  layout: CharacterLayout;
  id: string;
  name?: string;
  frameSize?: number;
  /** Which animations to build and what to call them. Default: directional. */
  contract?: AnimationContract;
  /** ms for attack / hurt / technique / die single frames. */
  attackMs?: number;
  hurtMs?: number;
  techniqueMs?: number;
  dieMs?: number;
  walkFps?: number;
}

type Timing = Required<Pick<ImportCharacterOptions, 'attackMs' | 'hurtMs' | 'techniqueMs' | 'dieMs' | 'walkFps'>>;

/** Where one role of the contract lives in a pack, and how it is cut. */
interface RoleSpec {
  file: string;
  /** One tag per view, given the view's index in the contract. */
  perView?: (viewIndex: number) => Omit<TagInput, 'name'>;
  /** One tag for a role with no view. */
  whole?: () => Omit<TagInput, 'name'>;
  /** A sheet a pack may not ship (a creature with no technique). */
  optional?: boolean;
}

function ninjaSeparate(o: Timing): Record<string, RoleSpec> {
  return {
    idle: { file: 'Idle.png', perView: i => ({ frames: [i], fps: 1 }) },
    hurt: { file: 'Idle.png', perView: i => ({ frames: [i], durations: [o.hurtMs], loop: false }) },
    walk: { file: 'Walk.png', perView: i => ({ frames: `col:${i}`, fps: o.walkFps }) },
    attack: { file: 'Attack.png', perView: i => ({ frames: [i], durations: [o.attackMs], loop: false }) },
    technique: { file: 'Special1.png', whole: () => ({ frames: [0], durations: [o.techniqueMs], loop: false }), optional: true },
    die: { file: 'Dead.png', whole: () => ({ frames: [0], durations: [o.dieMs], loop: false }), optional: true },
  };
}

/** One sheet: 4 columns (views) × N rows (steps). Attack uses the middle step. */
function ninjaSheet(o: Timing, rows: number): Record<string, RoleSpec> {
  const mid = Math.min(2, rows - 1);
  const file = 'SpriteSheet.png';
  return {
    idle: { file, perView: i => ({ frames: [i], fps: 1 }) },
    hurt: { file, perView: i => ({ frames: [i], durations: [o.hurtMs], loop: false }) },
    walk: { file, perView: i => ({ frames: `col:${i}`, fps: o.walkFps }) },
    attack: { file, perView: i => ({ frames: [mid * 4 + i, i], durations: [o.attackMs, o.attackMs], loop: false }) },
    technique: { file, whole: () => ({ frames: [mid * 4, (rows - 1) * 4], durations: [o.techniqueMs, o.techniqueMs], loop: false }) },
    die: { file, whole: () => ({ frames: [0], durations: [o.dieMs], loop: false }) },
  };
}

interface SheetStep { file: string; tags: TagInput[]; optional?: boolean }

/**
 * The sheets to cut and the tags to put on them, so that the asset ends up with
 * exactly the animations the contract asks for. A name the layout cannot make
 * stops the import naming it: the contract is a promise, not a preference.
 */
function plan(roles: Record<string, RoleSpec>, contract: AnimationContract, layout: string): SheetStep[] {
  const views = contractViews(contract);
  const steps: SheetStep[] = [];
  const byFile = new Map<string, SheetStep>();
  for (const name of contractAnims(contract)) {
    const role = roleOf(name, views);
    const spec = roles[role];
    if (!spec) {
      throw new Error(`layout "${layout}" has no sheet for "${role}" (it knows ${Object.keys(roles).join(', ')})`);
    }
    const view = viewOf(name, views);
    const made = view ? spec.perView?.(views.indexOf(view)) : spec.whole?.();
    if (!made) {
      throw new Error(view
        ? `layout "${layout}" cuts "${role}" whole, not one per view, so it cannot make "${name}"`
        : `layout "${layout}" cuts "${role}" one per view, so it cannot make "${name}" without one`);
    }
    let step = byFile.get(spec.file);
    if (!step) {
      step = { file: spec.file, tags: [], optional: spec.optional };
      byFile.set(spec.file, step);
      steps.push(step);
    }
    // A sheet several roles share is only optional if every one of them is.
    if (!spec.optional) step.optional = false;
    step.tags.push({ name, ...made });
  }
  return steps;
}

export function importCharacter(opts: ImportCharacterOptions): { asset: SpriteAsset; sheets: string[]; anims: string[] } {
  const size = opts.frameSize ?? 16;
  const timing: Timing = {
    attackMs: opts.attackMs ?? 330, hurtMs: opts.hurtMs ?? 250,
    techniqueMs: opts.techniqueMs ?? 500, dieMs: opts.dieMs ?? 1000, walkFps: opts.walkFps ?? 8,
  };
  const contract = opts.contract ?? DIRECTIONAL_CONTRACT;
  let roles: Record<string, RoleSpec>;
  if (opts.layout === 'ninja_separate') {
    roles = ninjaSeparate(timing);
  } else {
    // Rows of the single sheet decide the walk length.
    const probe = importSheet({ png: join(opts.dir, 'SpriteSheet.png'), frameWidth: size, frameHeight: size });
    roles = ninjaSheet(timing, probe.rows);
  }
  const steps = plan(roles, contract, opts.layout);
  let asset: SpriteAsset | undefined;
  const used: string[] = [];
  for (const step of steps) {
    const png = join(opts.dir, step.file);
    if (!existsSync(png)) {
      if (step.optional) continue;
      throw new Error(`missing ${png}`);
    }
    const r = importSheet({
      png, into: asset, frameWidth: size, frameHeight: size,
      id: opts.id, name: opts.name ?? opts.id, category: 'character', tags: step.tags,
    });
    asset = r.asset;
    used.push(step.file);
  }
  if (!asset) throw new Error('no sheets found');
  return { asset, sheets: used, anims: asset.animations.map(a => a.name) };
}
