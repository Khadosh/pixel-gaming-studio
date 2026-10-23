// @vitest-environment node
// What the commands take from the nearest pgs.json when they are not told
// (#26): lint the palette and the contract, sound the rate and for its notes
// the tuning and the scale, font and font_contact the font and its bodies,
// the map recipes the light. Each one says it in one line, and what is
// passed explicitly always wins.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAsset, saveAsset, setAnimation } from './asset';
import { runCommand } from './commands';
import { renderRecipe, readRecipe } from './mapfile';
import { prepareRecipe, decodeWav, parseScore, renderScore } from './sound';
import { parseScale } from './sound/notes';
import { worldLight } from './project';
import type { MapRecipe } from './maprecipe';

const ROOT = process.cwd();
const PGS = join(ROOT, 'bin/pgs');
const MAPS = join(ROOT, 'src/headless/fixtures/mapas');
const FONT = join(ROOT, 'examples/tipografia/nube.txt');

let world: string;
const at = (...p: string[]) => join(world, ...p);

/** A world: a palette, a contract of its own, a light, a font with its bodies and a sound block. */
function makeWorld(extra: Record<string, unknown> = {}) {
  mkdirSync(at('art/src'), { recursive: true });
  saveAsset(at('art/paleta.pss.json'), createAsset({ id: 'paleta', width: 4, palette: ['#112233', '#445566'] }));
  writeFileSync(at('art/contrato.json'), JSON.stringify({ id: 'mundo', anims: ['idle_{view}', 'walk_{view}'], views: ['down', 'up'] }));
  copyFileSync(FONT, at('art/nube.txt'));
  copyFileSync(join(MAPS, 'paleta.pss.json'), at('art/mapas.pss.json'));
  writeFileSync(at('pgs.json'), JSON.stringify({
    name: 'Mundo de prueba',
    visual: { palette: 'art/paleta.pss.json', contract: 'art/contrato.json', light: { from: 'lower_right', strength: 'soft' } },
    type: { font: 'art/nube.txt', steps: [8, 16] },
    sound: { rate: 44100, tuning: 432, scale: 'mayor_pentatonica' },
    ...extra,
  }));
}

/** A character off the world's palette, with one animation (so the contract is for it). */
function character(path: string) {
  const a = createAsset({ id: 'bicho', width: 8, palette: ['#ff00ff'] });
  a.layers![0].frames[0][2][2] = 1;
  setAnimation(a, { name: 'idle', frameIndices: [0] });
  saveAsset(path, a);
}

beforeEach(() => { world = mkdtempSync(join(tmpdir(), 'pgs-mundo-')); makeWorld(); });
afterEach(() => { rmSync(world, { recursive: true, force: true }); });

describe('lint inherits the palette and the contract of the world', () => {
  it('takes both from the nearest pgs.json above the asset, and says so', async () => {
    character(at('art/src/bicho.pss.json'));
    const r = await runCommand('lint', { paths: [at('art/src/bicho.pss.json')] });
    expect(r.text).toMatch(/color #ff00ff is off the palette/);
    expect(r.text).toMatch(/contract mundo: no animation idle_down, idle_up, walk_down, walk_up/);
    expect(r.text).toMatch(/^heredado de .*pgs\.json: paleta, contrato \(mundo\)$/m);
  });

  it('a tile and a still with no animation are left out of the inherited contract, and said', async () => {
    saveAsset(at('art/src/piso.pss.json'), createAsset({ id: 'piso', width: 16, category: 'terrain', palette: ['#112233'] }));
    saveAsset(at('art/src/farol.pss.json'), createAsset({ id: 'farol', width: 8, palette: ['#112233'] }));
    const r = await runCommand('lint', { paths: [at('art/src/piso.pss.json'), at('art/src/farol.pss.json')] });
    expect(r.text).not.toMatch(/contract mundo/);
    expect(r.text).toMatch(/contrato sin mirar en los tiles: piso/);
    expect(r.text).toMatch(/contrato sin mirar en los que no tienen animaciones: farol/);
    // …and contract_ids names one in
    const named = await runCommand('lint', { paths: [at('art/src/farol.pss.json')], contract_ids: ['farol'] });
    expect(named.text).toMatch(/contract mundo: no animation/);
  });

  it('what is passed wins: palette, colors and contract', async () => {
    character(at('art/src/bicho.pss.json'));
    const p = at('art/src/bicho.pss.json');
    const colors = await runCommand('lint', { paths: [p], colors: ['#ff00ff'] });
    expect(colors.text).not.toMatch(/off the palette/);
    expect(colors.text).toMatch(/heredado de .*: contrato \(mundo\)$/m);
    const contract = await runCommand('lint', { paths: [p], contract: 'body' });
    expect(contract.text).toMatch(/contract body: no animation walk/);
    expect(contract.text).not.toMatch(/contract mundo/);
    expect(contract.text).toMatch(/heredado de .*: paleta$/m);
    const both = await runCommand('lint', { paths: [p], palette: at('art/src/bicho.pss.json'), contract: 'body' });
    expect(both.text).not.toMatch(/heredado/);
  });

  it('outside a world it inherits nothing and says nothing', async () => {
    const out = mkdtempSync(join(tmpdir(), 'pgs-sin-mundo-'));
    try {
      character(join(out, 'bicho.pss.json'));
      const r = await runCommand('lint', { paths: [join(out, 'bicho.pss.json')] });
      expect(r.text).not.toMatch(/heredado|off the palette|contract/);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe('sound inherits the rate, and for its notes the tuning and the scale', () => {
  const recipe = (extra: Record<string, unknown> = {}) => ({
    duration: 0.2, layers: [{ source: { type: 'sine', freq: 'A4' }, envelope: { release: 0.05 } }], ...extra,
  });

  it('a recipe without rate is written at the world rate, and the answer says it', async () => {
    mkdirSync(at('art/sonido'), { recursive: true });
    writeFileSync(at('art/sonido/la.json'), JSON.stringify(recipe()));
    const r = await runCommand('sound', { recipe: at('art/sonido/la.json'), out: at('out/la.wav') });
    expect(decodeWav(readFileSync(at('out/la.wav'))).rate).toBe(44100);
    expect(r.text).toMatch(/^heredado de .*pgs\.json: muestreo 44100 Hz, afinación 432 Hz, escala mayor_pentatonica$/m);
  });

  it('a note is Hz with the tuning of the world, and one off its scale is warned about', () => {
    const p = prepareRecipe({ ...recipe(), layers: [
      { source: { type: 'sine', freq: 'A4' } },
      { source: { type: 'sine', freq: [[0, 'C5'], [0.1, 'F5']] } },
    ] }, { tuning: 432, scale: 'mayor_pentatonica' });
    expect(p.recipe.layers[0].source!.freq).toBe(432);
    expect((p.recipe.layers[1].source!.freq as number[][])[0][1]).toBeCloseTo(432 * Math.pow(2, 3 / 12), 6);
    expect(p.warnings).toEqual(['notas fuera de la escala mayor_pentatonica: F5']);
  });

  it('what the recipe says wins: its rate, its tuning, its scale', async () => {
    mkdirSync(at('art/sonido'), { recursive: true });
    writeFileSync(at('art/sonido/la.json'), JSON.stringify(recipe({ rate: 22050, tuning: 440, scale: 'la menor' })));
    const r = await runCommand('sound', { recipe: at('art/sonido/la.json'), out: at('out/la.wav') });
    expect(decodeWav(readFileSync(at('out/la.wav'))).rate).toBe(22050);
    expect(r.text).not.toMatch(/heredado/);
    expect(prepareRecipe(recipe({ tuning: 440 }), { tuning: 432 }).recipe.layers[0].source!.freq).toBe(440);
  });

  it('a world rate a WAV cannot have stops it, naming the way out', () => {
    expect(() => prepareRecipe(recipe(), { rate: 48000 })).toThrow(/sound\.rate 48000.*say rate in the recipe/);
  });

  it('a string that is not a note stops it, naming where', () => {
    expect(() => prepareRecipe({ ...recipe(), layers: [{ source: { type: 'sine', freq: 'sol5' } }] })).toThrow(/layers\[0\]\.source\.freq: «sol5» no es una nota/);
  });

  it('scales: a tonic in either language, and an unknown one said', () => {
    expect([...parseScale('la menor').scale!.classes].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect([...parseScale('mayor_pentatonica').scale!.classes].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
    expect([...parseScale('G major').scale!.classes].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(parseScale('lidia').error).toMatch(/desconocida/);
  });
});

describe('font and font_contact take the font of the world (the binary, run from inside the world)', () => {
  // The real condition: a game calls the binary standing in its own folder,
  // with no path, which is the call that failed in el patio (F2).
  const pgs = (...args: string[]) => execFileSync(PGS, args, { encoding: 'utf8', cwd: world });

  it('font_contact with no path sets the world font at its bodies (8 and 16 px: 1x and 2x)', () => {
    const out = pgs('font_contact', `out=${at('muestra.png')}`);
    expect(out).toMatch(/a 1x, 2x$/m);
    expect(out).toMatch(/^heredado de \.\/pgs\.json: fuente art\/nube8?\.txt, cuerpos 8, 16 px \(1x, 2x\)$/m);
  });

  it('font with no path reads the world font and says so', () => {
    const out = pgs('font');
    expect(out).toMatch(/^nube · celda 8x11/m);
    expect(out).toMatch(/^heredado de \.\/pgs\.json: fuente art\/nube\.txt$/m);
  });

  it('a font passed by path wins, and the world bodies are not its own', () => {
    copyFileSync(FONT, at('otra.txt'));
    const out = pgs('font_contact', 'path=otra.txt');
    expect(out).toMatch(/a 1x, 2x, 3x$/m);
    expect(out).not.toMatch(/heredado/);
    expect(pgs('font_contact', 'path=art/nube.txt', 'scale=3')).not.toMatch(/heredado|2x/);
  });

  it('a world with no font says what is missing', async () => {
    makeWorld({ type: { steps: [8] } });
    expect(() => execFileSync(PGS, ['font'], { encoding: 'utf8', cwd: world, stdio: 'pipe' })).toThrow(/declares no type\.font/);
  });
});

describe('the light of the world reaches the map recipes that do not declare one', () => {
  const GRASS = ['túnica noche', 'hoja sombra', 'hoja', 'bambú', 'hoja clara', 'bambú claro', 'pasto'];
  const grid = Array.from({ length: 8 }, () => '.'.repeat(12));
  const write = (name: string, light?: MapRecipe['light']) => {
    const recipe: MapRecipe = {
      game: { width: 12, height: 8, grid, decor: [{ sprite: 'pino', at: [6, 4], size: [2, 3] }] },
      palette: '../mapas.pss.json', margin: [1, 1], ...(light ? { light } : {}),
      materials: { grass: { ramp: GRASS, texture: 'patches', shade_min: 1 } },
      steps: [{ step: 'area', material: 'grass', shape: 'all' }, { step: 'light' }],
    };
    mkdirSync(at('art/recetas'), { recursive: true });
    writeFileSync(at('art/recetas', name), JSON.stringify(recipe));
    return at('art/recetas', name);
  };
  const px = (path: string) => renderRecipe(path, { stderr: false }).map.layers.ground.px.join(',');

  it('lower_right is shadows toward the upper left, and the words are checked', () => {
    expect(worldLight({ name: 'x', visual: { light: { from: 'lower_right' } } }).dir).toEqual([-1, -1]);
    expect(worldLight({ name: 'x', visual: { light: { from: 'arriba izquierda' } } }).dir).toEqual([1, 1]);
    expect(worldLight({ name: 'x', visual: { light: { from: 'dusk' } } }).error).toMatch(/no es una dirección/);
  });

  it('a recipe with no light paints with the world light (the same pixels as declaring it) and says so', async () => {
    const bare = write('sin_luz.json');
    const r = renderRecipe(bare, { stderr: false });
    expect(r.recipe.light).toEqual([-1, -1]);
    expect(r.world).toMatch(/^heredado de .*pgs\.json: luz lower_right \(sombras hacia \[-1, -1\]\)$/);
    expect(px(bare)).toBe(px(write('declarada.json', [-1, -1])));
    expect(px(bare)).not.toBe(px(write('otra.json', [1, 1])));   // the light does something here
    const out = await runCommand('map_render', { recipe: bare, out: at('out/m.png') });
    expect(out.text).toMatch(/^heredado de .*: luz lower_right/m);
    const lint = await runCommand('map_lint', { recipe: bare });
    expect(lint.text).toMatch(/^heredado de .*: luz lower_right/m);
  });

  it('a recipe that declares its light keeps it, and the answer says the two disagree', async () => {
    const own = write('propia.json', [1, 1]);
    const r = renderRecipe(own, { stderr: false });
    expect(r.recipe.light).toEqual([1, 1]);
    expect(r.world).toMatch(/la receta declara su luz \(sombras hacia \[1, 1\]\) y .*pgs\.json dice lower_right .*: gana la receta/);
    expect(renderRecipe(write('igual.json', [-1, -0.6]), { stderr: false }).world).toBeUndefined();
  });

  it('map_from_game leaves a new recipe without a light of its own in a world that has one', async () => {
    copyFileSync(join(MAPS, 'aldea.json'), at('aldea.json'));
    const out = at('art/recetas/aldea.receta.json');
    const r = await runCommand('map_from_game', { game: at('aldea.json'), out });
    expect(readRecipe(out).light).toBeUndefined();
    expect(r.text).toMatch(/^heredado de .*: luz lower_right \(la receta no la declara: la toma al pintarse\)$/m);
    const lit = await runCommand('map_from_game', { game: at('aldea.json'), out: at('art/recetas/b.json'), light: [1, 1] });
    expect(readRecipe(at('art/recetas/b.json')).light).toEqual([1, 1]);
    expect(lit.text).not.toMatch(/heredado/);
  });
});

// ── What the world still did not give (#36) ─────────────────────────────

describe('lint inherits the grid and the named sizes', () => {
  beforeEach(() => makeWorld({ visual: { palette: 'art/paleta.pss.json', grid: 16, sizes: { bicho: [8, 8], nena: [8, 16] } } }));
  const sprite = (id: string, w: number, h = w, extra: Partial<Parameters<typeof createAsset>[0]> = {}) => {
    const p = at(`art/src/${id}.pss.json`);
    saveAsset(p, createAsset({ id, width: w, height: h, palette: ['#112233'], ...extra }));
    return p;
  };

  it('a sprite of none of the sizes is said, naming them; one of them is not', async () => {
    const r = await runCommand('lint', { paths: [sprite('raro', 12), sprite('bicho', 8), sprite('nena', 8, 16)] });
    expect(r.text).toMatch(/✗ raro \(12x12\)\n {4}size 12x12 is none of the world's \(bicho 8x8, nena 8x16\)/);
    expect(r.text).toMatch(/✓ bicho/);
    expect(r.text).toMatch(/✓ nena/);
    expect(r.text).toMatch(/^heredado de .*pgs\.json: paleta, tamaños$/m);
  });

  it('a tile answers to the grid instead, and a map made by map_export to neither', async () => {
    const tile = sprite('piso', 20, 16, { category: 'terrain' });
    const map = at('art/src/mapa.pss.json');
    const m = createAsset({ id: 'mapa', width: 40, height: 24, palette: ['#112233'] });
    m.generatedBy = { by: 'map_export', args: { recipe: 'x.json', layer: 'ground' } };
    saveAsset(map, m);
    const r = await runCommand('lint', { paths: [tile, map] });
    expect(r.text).toMatch(/size 20x16 is not a multiple of 16/);
    expect(r.text).not.toMatch(/none of the world's/);
    expect(r.text).toMatch(/heredado de .*: paleta, grilla 16$/m);
  });

  it('what is passed wins', async () => {
    const r = await runCommand('lint', { paths: [sprite('raro', 12)], sizes: { retrato: [12, 12] } });
    expect(r.text).toMatch(/✓ raro/);
    expect(r.text).not.toMatch(/tamaños/);
  });
});

describe('one contract per class of sprite', () => {
  beforeEach(() => {
    makeWorld({ visual: {
      palette: 'art/paleta.pss.json', sizes: { bicho: [8, 8], gato: [12, 12] },
      contract: { gato: 'art/contrato.json', bicho: 'art/asoma.json', iconos: null },
    } });
    writeFileSync(at('art/asoma.json'), JSON.stringify({ id: 'asoma', anims: ['escondido', 'asomado'], views: [] }));
  });
  const animated = (id: string, w: number, anims: string[]) => {
    const a = createAsset({ id, width: w, palette: ['#112233'] });
    for (const name of anims) setAnimation(a, { name, frameIndices: [0] });
    const p = at(`art/src/${id}.pss.json`);
    saveAsset(p, a);
    return p;
  };

  it('the canvas picks the class by its size, the id first; null and no class are left out, and said', async () => {
    const r = await runCommand('lint', { paths: [
      animated('sapo', 8, ['escondido', 'asomado']),
      animated('gato', 12, ['idle_down']),
      animated('iconos', 8, ['perro', 'pato']),
      animated('nena', 10, ['idle_down']),
    ] });
    expect(r.text).toMatch(/✓ sapo/);
    expect(r.text).toMatch(/✗ gato \(12x12\)\n {4}contract mundo: no animation idle_up, walk_down, walk_up/);
    expect(r.text).toMatch(/✓ iconos/);
    expect(r.text).toMatch(/✗ nena \(10x10\)\n {4}size 10x10 is none of the world's \(bicho 8x8, gato 12x12\)/);
    expect(r.text).toMatch(/heredado de .*: paleta, tamaños, contrato \(bicho: asoma\), contrato \(gato: mundo\)$/m);
    expect(r.text).toMatch(/contrato sin mirar en la clase iconos \(declarada sin contrato\): iconos/);
    expect(r.text).toMatch(/contrato sin mirar en los que no son de ninguna clase: nena/);
  });

  it('pgs project shows the classes', async () => {
    const r = await runCommand('project', { path: world });
    expect(r.text).toMatch(/contrato +gato=art\/contrato\.json · bicho=art\/asoma\.json · iconos=ninguno/);
    expect(r.text).toMatch(/Quién lee cada campo/);
    expect(r.text).toMatch(/visual\.sizes +lint/);
  });
});

describe('from_ascii takes the palette of the world as its fit, and warns instead of stopping', () => {
  const drawing = (hex: string, header = '') => `id: punto\n${header}a = ${hex}\n==\n.a\na.\n`;

  it('a color off the world palette is a warning, the asset is written, and the answer says where it came from', async () => {
    writeFileSync(at('art/punto.txt'), drawing('#ff00ff'));
    const r = await runCommand('from_ascii', { txt: at('art/punto.txt'), out: at('art/src/punto.pss.json') });
    const d = r.data as { warnings?: string[]; inherited?: string };
    expect(d.warnings).toEqual(['punto.txt: not in the palette of art/paleta.pss.json: "a" = #ff00ff']);
    expect(d.inherited).toMatch(/^heredado de .*pgs\.json: paleta$/);
    expect(readFileSync(at('art/src/punto.pss.json'), 'utf8')).toMatch(/ff00ff/);
  });

  it('on the palette it only says it inherited; fit (header or argument) still stops, and outside a world nothing', async () => {
    writeFileSync(at('art/bien.txt'), drawing('#112233'));
    const ok = await runCommand('from_ascii', { txt: at('art/bien.txt'), out: at('art/src/bien.pss.json') });
    expect((ok.data as { warnings?: string[] }).warnings).toBeUndefined();
    expect((ok.data as { inherited?: string }).inherited).toMatch(/paleta/);
    writeFileSync(at('art/fit.txt'), drawing('#ff00ff', 'fit: paleta.pss.json\n'));
    await expect(runCommand('from_ascii', { txt: at('art/fit.txt'), out: at('art/src/fit.pss.json') })).rejects.toThrow(/not in the palette of paleta\.pss\.json/);
    const out = mkdtempSync(join(tmpdir(), 'pgs-sin-mundo-'));
    try {
      writeFileSync(join(out, 'p.txt'), drawing('#ff00ff'));
      const r = await runCommand('from_ascii', { txt: join(out, 'p.txt'), out: join(out, 'p.pss.json') });
      expect(r.data).not.toHaveProperty('inherited');
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe('music inherits the rate and the tuning, and its notes are checked against the scale', () => {
  const score = (head = '') => `${head}tempo: 120\nvoz a = citara\nA4 q C5 q F5 h |\n`;

  it('a score that does not say them takes them from the world, and says so; an off-scale note is warned about', async () => {
    mkdirSync(at('art/musica'), { recursive: true });
    writeFileSync(at('art/musica/tema.partitura'), score());
    const r = await runCommand('music', { score: at('art/musica/tema.partitura'), out: at('out/tema.wav') });
    expect(decodeWav(readFileSync(at('out/tema.wav'))).rate).toBe(44100);
    expect(r.text).toMatch(/^heredado de .*pgs\.json: muestreo 44100 Hz, afinación 432 Hz, escala mayor_pentatonica$/m);
    expect(r.text).toMatch(/⚠ tema\.wav: notas fuera de la escala mayor_pentatonica: F5/);
  });

  it('what the score says wins, and the tuning moves the pitch', async () => {
    mkdirSync(at('art/musica'), { recursive: true });
    writeFileSync(at('art/musica/propia.partitura'), score('frecuencia: 22050\nafinación: 440\n'));
    const r = await runCommand('music', { score: at('art/musica/propia.partitura'), out: at('out/propia.wav') });
    expect(decodeWav(readFileSync(at('out/propia.wav'))).rate).toBe(22050);
    expect(r.text).toMatch(/heredado de .*: escala mayor_pentatonica$/m);
    expect(r.text).not.toMatch(/muestreo|afinación 432/);
    const at440 = renderScore(parseScore(score('frecuencia: 22050\n'))).samples;
    const at432 = renderScore({ ...parseScore(score('frecuencia: 22050\n')), tuning: 432 }).samples;
    expect(Buffer.from(at432.buffer).equals(Buffer.from(at440.buffer))).toBe(false);
  });
});

describe('sound: lengths with a name, and the materials of the world', () => {
  const world = { lengths: { short: 0.08, long: 1.2 }, materials: ['madera', 'tela'] };
  const recipe = (extra: Record<string, unknown> = {}) => ({ layers: [{ source: { type: 'noise' }, length: 'short' }], ...extra });

  it('a duration, a start or a length can be a name of sound.lengths, and the answer says it', () => {
    const p = prepareRecipe(recipe({ duration: 'long' }), world);
    expect(p.recipe.duration).toBe(1.2);
    expect(p.recipe.layers[0].length).toBe(0.08);
    expect(p.inherited).toEqual(['largos short 0.08s, long 1.2s']);
  });

  it('a name the world does not have stops it, naming the ones it has', () => {
    expect(() => prepareRecipe(recipe({ duration: 'medio' }), world)).toThrow(/duration: «medio» no es un número de segundos ni un largo del mundo \(short 0\.08s, long 1\.2s\)/);
    expect(() => prepareRecipe(recipe({ duration: 'long' }), {})).toThrow(/el mundo no declara sound\.lengths/);
  });

  it('a material outside the world is warned about, one of it is not', () => {
    expect(prepareRecipe(recipe({ duration: 0.2, material: 'metal' }), world).warnings).toEqual(['material «metal» no es de este mundo (madera, tela)']);
    expect(prepareRecipe(recipe({ duration: 0.2, material: 'madera' }), world).warnings).toEqual([]);
  });
});

describe('the fixed molds of a light step follow the light', () => {
  // A block in the middle of a flat field: lit from the left its shadow falls
  // right of it, lit from the right (the recipe's or the world's) it falls left.
  const field = (light: [number, number], blocks = true) => {
    const recipe: MapRecipe = {
      game: { width: 12, height: 8, grid: Array.from({ length: 8 }, () => '.'.repeat(12)) },
      palette: '../mapas.pss.json', margin: [0, 0], light,
      materials: { grass: { ramp: ['hoja sombra', 'hoja', 'hoja clara'], texture: 'flat' } },
      steps: [{ step: 'area', material: 'grass', shape: 'all' }, { step: 'light', decor: false, trees: false, faces: false, ...(blocks ? { blocks: [[5, 7, 4, 6, 0.5, 3, 4]] } : {}) }],
    };
    mkdirSync(at('art/recetas'), { recursive: true });
    const p = at('art/recetas', `campo_${light.join('_')}_${blocks}.json`);
    writeFileSync(p, JSON.stringify(recipe));
    return renderRecipe(p, { stderr: false }).map.layers.ground.px;
  };
  const shadowSides = (light: [number, number]) => {
    const lit = field(light, false), shaded = field(light);
    const W = 12 * 16, mid = 6 * 16;
    let left = 0, right = 0;
    shaded.forEach((c, i) => { if (c !== lit[i]) { if (i % W < mid) left++; else right++; } });
    return { left, right };
  };

  it('from the left the shadow is right of the block, from the right it is its mirror', () => {
    const fromLeft = shadowSides([1, 1]), fromRight = shadowSides([-1, 1]);
    expect(fromLeft.right).toBeGreaterThan(fromLeft.left);
    expect(fromRight.left).toBe(fromLeft.right);
    expect(fromRight.right).toBe(fromLeft.left);
  });
});
