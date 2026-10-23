// The scene map steps, by the place of the first game they were made for.
//
// PGS is an engine that makes the assets of a game, not a collection of them
// (Khadosh/pixel-gaming-studio#1). Most `map_*` steps are not engine: they are
// ports of the drawing scripts of The Unwritten Dao, cut into steps by a scene
// («wet moss cushions» is a part of one map, not a concept of pixel art). They
// stay, as **examples**: each one belongs to a family, the place it was made
// for, and the recipes of that place (src/headless/fixtures/mapas/) are the
// example of how its steps go together. Measured on those recipes: of the 85
// scene steps 57 are used by one recipe only, and the ones used by two or three
// are shared by sister maps of one place (the summit and the high summit, the
// two river banks, the three roots of the pine). The family is the unit, not
// the step; a new map of that place starts from its recipes.
//
// `isSceneStep` (mcpcatalog.ts) says which steps are out of the base catalog;
// this says where each of them comes from, and the test makes every scene step
// say it. A new `map_*` either joins MAP_CORE (it generalizes) or a family here.
// Read for people in docs/mapas/escenas.md.

export interface SceneFamily {
  /** The id `pgs help escenas` and `pgs_doc { command: "escenas" }` list it by. */
  id: string;
  /** The place of the first game, as the game calls it. */
  name: string;
  /** What the place is, in one line. */
  what: string;
  /** The recipes of the first game that paint it (fixtures/mapas/<map>.receta.json). */
  maps: string[];
  /** Its scene steps, without the `map_` of the command. */
  steps: string[];
}

/** The game the scene steps were ported from. */
export const SCENE_GAME = 'The Unwritten Dao';

export const SCENE_FAMILIES: readonly SceneFamily[] = [
  {
    id: 'cumbre', name: 'La cumbre', what: 'a snowy summit over a sea of clouds: crags, conifers, trails, frozen ponds',
    maps: ['cumbre', 'cumbre_alta'],
    steps: ['snowfield', 'ledge', 'cloudsea', 'crag', 'drifts', 'mountain', 'conifers', 'trail', 'tracks', 'pond', 'shrub', 'shadows', 'tussocks', 'stones', 'sparkles', 'spindrift'],
  },
  {
    id: 'orilla', name: 'La orilla', what: 'a river bank: beach, mud, reeds, a pier on pilings, the wood around it',
    maps: ['embarcadero', 'otra_orilla'],
    steps: ['wildwood', 'beach', 'mudbank', 'footpath', 'pier', 'reeds', 'rocks', 'umbra', 'meadow', 'shimmer', 'slabs', 'ditch', 'claypan', 'floodwater'],
  },
  {
    id: 'rio_arriba', name: 'Río arriba', what: 'a glen at the foot of a waterfall: plunge pool, wet moss, gravel, wet stones',
    maps: ['rio_arriba'],
    steps: ['glen', 'cushions', 'mudtrail', 'shingle', 'ledgeslabs', 'plunge', 'wetstones', 'wetwood', 'glenshade', 'glenlitter', 'glenflow', 'boughs'],
  },
  {
    id: 'raices', name: 'Las raíces del pino', what: 'a cave lit by a torch: roots down the faces, carvings, a pool',
    maps: ['raices_agua', 'raices_boca', 'raices_nicho'],
    steps: ['cavern', 'hangroots', 'carvings', 'rootladder', 'pool', 'formation', 'gloom', 'soften'],
  },
  {
    id: 'terraza', name: 'La terraza del duelo', what: 'a terrace in the sky: ashlar, the arena of a duel, balustrades, a stairway',
    maps: ['terraza'],
    steps: ['cloudbanks', 'ashlar', 'courses', 'runner', 'arena', 'balustrade', 'stairway', 'sprigs', 'fallen', 'motes', 'overhang'],
  },
  {
    id: 'bosque', name: 'El bosque de bambú', what: 'a floor carved out of a thicket: bamboo canes, an outcrop, beams of light',
    maps: ['bosque'],
    steps: ['thicket', 'outcrop', 'undergrowth', 'canes', 'shade', 'beams'],
  },
  {
    id: 'secta', name: 'La secta', what: 'an island in the sky: the cliff, its brink, flights of steps, the clouds around',
    maps: ['secta'],
    steps: ['cliff', 'brink', 'flight', 'cloudscape'],
  },
  {
    id: 'interiores', name: 'La casa de té y el cuarto de la vela', what: 'rooms: walls, furniture, the sun through a window, a candle',
    maps: ['casa_de_te', 'cuarto_vela'],
    steps: ['wall', 'furnish', 'sun', 'glow'],
  },
  {
    id: 'camino', name: 'El camino de abajo', what: 'a dry lowland road: straw, the lip over the plain, the wood past the edge',
    maps: ['camino'],
    steps: ['straw', 'overlook', 'woodedge', 'damp'],
  },
  {
    id: 'aldea', name: 'La aldea', what: 'a village: the rope of lanterns over its roads',
    maps: ['aldea'],
    steps: ['rope'],
  },
  {
    id: 'forja', name: 'La forja', what: 'a forge: its buildings, a fence and the grove around them',
    maps: ['forja'],
    steps: ['grove'],
  },
  {
    // Used by places of more than one family: the first candidates to MAP_CORE
    // (docs/diseno/mapas_inteligentes.md), still with the names of the first game.
    id: 'compartidos', name: 'Compartidos', what: 'scene steps more than one place uses: roads, carved things, cast shadows, shore lines',
    maps: ['aldea', 'bosque', 'camino', 'secta', 'forja', 'terraza', 'embarcadero', 'otra_orilla', 'rio_arriba'],
    steps: ['network', 'feature', 'cast', 'lines'],
  },
];

/** The family of a scene step (`map_grove` or `grove`), if it has one. */
export function sceneFamilyOf(name: string): SceneFamily | undefined {
  const step = name.replace(/^map_/, '');
  return SCENE_FAMILIES.find(f => f.steps.includes(step));
}

/** The line `pgs help map_x` and `pgs_doc` give a scene step: what it is an example of. */
export function sceneLine(name: string): string | undefined {
  const f = sceneFamilyOf(name);
  if (!f) return undefined;
  return `Scene step (an example, not engine): family ${f.id}, «${f.name}» of ${SCENE_GAME}; its recipes: ${f.maps.join(', ')} (src/headless/fixtures/mapas/). pgs help escenas lists the families.`;
}

/** Every family with its maps and steps: `pgs help escenas`, `pgs_doc { command: "escenas" }`. */
export function scenesDoc(): string {
  const lines = [
    `Scene map steps: ports of the drawing scripts of ${SCENE_GAME}, kept as examples, by the place they were made for.`,
    'A new map of one of these places starts from its recipes (src/headless/fixtures/mapas/<map>.receta.json);',
    'a new place is composed with the core steps (map_area, map_path, map_water, map_scatter, map_light, map_settle…).',
    'Not in the base MCP catalog: pgs_doc { command } documents each, pgs_batch runs them, bin/pgs-mcp --maps lists them.',
    'More in docs/mapas/escenas.md.',
    '',
  ];
  for (const f of SCENE_FAMILIES) {
    lines.push(`${f.id} — ${f.name}: ${f.what}`);
    lines.push(`  maps:  ${f.maps.join(', ')}`);
    lines.push(`  steps: ${f.steps.map(s => `map_${s}`).join(' ')}`);
  }
  return lines.join('\n');
}
