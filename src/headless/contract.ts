// The animation contract, as data.
//
// "Every character has idle, walk, attack, technique, hurt and die" is a
// decision a game makes, not a fact about pixels — and it was written out four
// times: in `character.ts` (the tags of an imported pack), in `figure.ts` (the
// pose table), in the descriptions in `commands.ts`, and a fourth time in the
// game that consumes all of it. Four copies of one table is a missing concept.
//
// So a contract is a list of names, and `{view}` in a name means one per view:
//
//   { "id": "directional",
//     "anims": ["idle_{view}", "hurt_{view}", "walk_{view}", "attack_{view}", "technique", "die"],
//     "views": ["down", "up", "left", "right"] }
//
// `figure`, `import_character` and `animate` take one (with today's as the
// default, so nothing changes without asking), and `lint contract=` answers
// whether an asset keeps it. The next game declares its own.
//
// Pure: no Node imports, so the app can use it too.

import type { SpriteAsset } from '../lib/types';

export interface AnimationContract {
  /** A name for the contract, for errors and for a project to refer to it. */
  id?: string;
  /** The animations a character must have. `{view}` expands once per view. */
  anims: string[];
  /** What `{view}` expands to. Default: the four of a top-down sprite. */
  views?: string[];
}

/** The four views of a sprite that turns, in the order a pack lays them out. */
export const VIEWS = ['down', 'up', 'left', 'right'] as const;

/**
 * A whole body drawn as one figure: no views, because the figure is posed in
 * 3/4 and the recipe picks which way it faces. What `figure` draws today.
 */
export const BODY_CONTRACT: AnimationContract = {
  id: 'body',
  anims: ['idle', 'walk', 'attack', 'technique', 'hurt', 'die'],
  views: [],
};

/**
 * A 16 px sprite that turns: four views for what turning changes, one technique
 * and one death for what it does not. What `import_character` builds today —
 * and the order is today's too, because the order of this list is the order the
 * animations land in the asset.
 */
export const DIRECTIONAL_CONTRACT: AnimationContract = {
  id: 'directional',
  anims: ['idle_{view}', 'hurt_{view}', 'walk_{view}', 'attack_{view}', 'technique', 'die'],
  views: [...VIEWS],
};

/** The contracts that come with the engine, by name. */
export const CONTRACTS: Record<string, AnimationContract> = {
  body: BODY_CONTRACT,
  directional: DIRECTIONAL_CONTRACT,
};

/** The views of a contract, defaulting to the four of a top-down sprite. */
export function contractViews(c: AnimationContract): string[] {
  return c.views ?? [...VIEWS];
}

/** Every animation name the contract asks for, in order, `{view}` expanded. */
export function contractAnims(c: AnimationContract): string[] {
  const views = contractViews(c);
  const out: string[] = [];
  for (const anim of c.anims) {
    if (!anim.includes('{view}')) { out.push(anim); continue; }
    if (!views.length) {
      throw new Error(`contract${c.id ? ` ${c.id}` : ''}: "${anim}" asks for a view and the contract declares none`);
    }
    for (const v of views) out.push(anim.split('{view}').join(v));
  }
  return out;
}

/** The view at the end of a name, or '' — `walk_down` → `down`. */
export function viewOf(name: string, views: string[]): string {
  return views.find(v => name.endsWith(`_${v}`)) ?? '';
}

/** What a name is of, with the view taken off — `walk_down` → `walk`. */
export function roleOf(name: string, views: string[]): string {
  const v = viewOf(name, views);
  return v ? name.slice(0, -(v.length + 1)) : name;
}

/**
 * The generator of the anatomy engine a contract role is made with, when the
 * contract's word for it is not the engine's: a technique is generated as a
 * cast. Roles not in here are their own generator.
 */
export const GENERATOR_OF: Record<string, string> = { technique: 'cast' };

/** The anim string `animate` wants for a contract name: `technique_up` → `cast_up`. */
export function generatorName(name: string, views: string[]): string {
  const role = roleOf(name, views);
  const gen = GENERATOR_OF[role];
  return gen ? gen + name.slice(role.length) : name;
}

export interface ContractCheck {
  /** The contract's name, for the report. */
  id: string;
  /** Animations the contract asks for that the asset has not got. */
  missing: string[];
  /** Animations the asset has that the contract does not ask for. */
  extra: string[];
  /** Animations of the contract that are there but hold no frame. */
  empty: string[];
}

/** Does this asset keep the contract? Extras are fine; what is missing is not. */
export function checkContract(asset: SpriteAsset, c: AnimationContract): ContractCheck {
  const want = contractAnims(c);
  const have = new Map((asset.animations ?? []).map(a => [a.name, a]));
  return {
    id: c.id ?? 'contract',
    missing: want.filter(n => !have.has(n)),
    extra: [...have.keys()].filter(n => !want.includes(n)),
    empty: want.filter(n => have.has(n) && !(have.get(n)!.frameIndices ?? []).length),
  };
}
