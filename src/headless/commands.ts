// The command registry: one place that defines what the headless tools can do.
// The CLI (cli.ts) and the MCP server (mcp.ts) are thin adapters over this.
//
// Every command takes a plain object validated by a zod schema and returns a
// JSON-serializable result. Commands that touch an asset on disk take `path`
// (the asset JSON, by convention *.pss.json) and save it back when they change it.

import { dirname, resolve, basename, relative } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { writeGuarded } from './guard';
import { z } from 'zod';
import type { SpriteAsset } from '../lib/types';
import {
  addFrame, colorIndex, composite, createAsset, dims, duplicateFrame, findAnimation, frameCount,
  getFrame, loadAsset, normalizeHex, removeAnimation, removeFrame, saveAsset, setAnimation, setFrame, summarize,
} from './asset';
import { blankImage, blit, encodePng, readPng, writePng, type Rgba } from './png';
import { fitImageColors, fitPalette, knockOutColor } from './ops';
import { asciiLegend, contactSheet, paletteSheet, renderAscii, renderFrame } from './render';
import { appendAsset, exportSheet, importSheet, indexedAsset, onlyLayer } from './sheet';
import { importCharacter } from './character';
import { ANIMATION_KINDS, animateAsset, animateContract } from './animate';
import {
  BODY_CONTRACT, CONTRACTS, DIRECTIONAL_CONTRACT, checkContract, type AnimationContract,
} from './contract';
import { FIGURE_LAYERS, FIGURE_VIEWS, clipWarnings, figureAsset, figureClip, figureJoints, figureLayered, proportioned, type FigureRecipe } from './figure';
import { generateImage, hexToRgb, illustrate, loadFalKey, oklab, pixelize, pngDataUri } from './ai';
import { readImage } from './image';
import { applyAnswer, editZone, mergeOutsideZone, zoneCoverage, type ZoneSpec } from './zones';
import { cutPiece, estimateDepth, layerMap, paintedLights, splitLayers } from './backdrop';
import { checkFit, formatGeneratedBy, fromAscii, legendGlyphs, toAscii } from './ascii';
import { paintTerrain, type TerrainRecipe } from './terrain';
import { contactSheetMany, fullestFrame, lintAsset } from './inspect';
import { mapLint } from './maplint';
import { gridMask } from './gridmask';
import { areaStep, lightStep, materialSchema, pathStep, scatterStep, waterStep, type MapRecipe, type MapStep } from './maprecipe';
import { brinkStep, cliffStep, featureStep, flightStep, furnishStep, glowStep, networkStep, ropeStep, sunStep, wallStep } from './mapsteps/schema';
import { castStep, dampStep, overlookStep, strawStep, woodedgeStep } from './mapsteps/lowlandschema';
import {
  beachStep, claypanStep, ditchStep, floodwaterStep, footpathStep, linesStep, meadowStep, mudbankStep, pierStep, reedsStep,
  rocksStep, shimmerStep, slabsStep, umbraStep, wildwoodStep,
} from './mapsteps/riverbankschema';
import {
  arenaStep, ashlarStep, balustradeStep, cloudbanksStep, coursesStep, fallenStep, motesStep, overhangStep, runnerStep, sprigsStep, stairwayStep,
} from './mapsteps/terraceschema';
import { groveStep } from './mapsteps/plantschema';
import { cloudscapeStep } from './mapsteps/skyschema';
import { settleStep } from './mapsteps/settleschema';
import { closedInkOf } from './mapsteps/settle';
import { carvingsStep, cavernStep, formationStep, gloomStep, hangrootsStep, poolStep, rootladderStep, softenStep } from './mapsteps/cavernschema';
import { glenStep, cushionsStep, mudtrailStep, shingleStep, ledgeslabsStep, plungeStep, wetstonesStep, wetwoodStep, glenshadeStep, glenlitterStep, glenflowStep, boughsStep } from './mapsteps/glenschema';
import { cloudseaStep, conifersStep, cragStep, driftsStep, ledgeStep, mountainStep, pondStep, shadowsStep, shrubStep, snowfieldStep, sparklesStep, spindriftStep, stonesStep, tracksStep, trailStep, tussocksStep } from './mapsteps/alpineschema';
import { beamsStep, canesStep, outcropStep, shadeStep, thicketStep, undergrowthStep } from './mapsteps/groveschema';
import { compareImages, compareRecipe, exportDirs, exportedLayers, exportGround, exportRecipe, gameGrid, layersImage, plantedLines, readRecipe, recipeMaterials, refusedDrawings, renderRecipe, upsertStep, writeRecipe, type ExportedLayer } from './mapfile';
import { variantNames, variantWritesGround } from './mapvariant';
import { makeVariant } from './variant';
import { onCanvas, placeModels, renderVoxel, renderVoxelLayers, turnModel, voxelCanvas, voxelToScreen, type VoxelCanvas, type VoxelImage, type VoxelLight, type VoxelModel, type VoxelPaint } from './voxel';
import { stampDrawing } from './stamp';
import { facePoints, facePointsTable } from './face';
import {
  analyzeWav, prepareRecipe, readWav, recipeFiles, soundToWav, statsTable, waveformSheet, wavFiles, writeSound,
  parseScore, musicToWav, scoreFiles, writeMusic, INSTRUMENTS,
} from './sound';
import {
  applyDrawOps, applyFx, despeckle, flipH, flipV, generateFxAnimation, replaceIndex, shift, type DrawOp,
} from './ops';
import { checkPhrase, checkSheet, fontReport, glyphTable, renderSample } from './font';
import { loadFont, writeBmFont, writeComposed, writeFontVariant, writeWebFont } from './fontfile';
import { VARIANT_KINDS, variantReport } from './fontvariant';
import { batchReport, batchSteps, planBatch, runBatch, type BatchResult } from './batch';
import { applyRetouch, madeBy, relTo, retouchLine } from './retouch';
import { oneLine } from './brief';
import { commandDoc, fullSchema } from './mcpcatalog';
import { PROJECT_FILE, findProject, inheritedLine, shownProjectPath, loadProject, nearestProject, projectBrief, projectPath, projectProportions, proportionsSchema, variantForSize, worldLight } from './project';
import { resolveProportions, type ProportionBase } from './proportions';

/**
 * The phrase `font_contact` sets when nobody gives it one: every glyph Spanish
 * needs in two lines — the accents, the eñe, the opening marks, the angular
 * quotes and the long dash the dialogue of a game is made of.
 */
const SAMPLE_TEXT = 'El niño miró la estela y preguntó:\n—¿Quién grabó esto? «Nadie», dijo Hú. ¡1234567890!';

export interface CommandResult {
  /** JSON payload. */
  data: unknown;
  /** Optional PNG to show (MCP returns it as an image). */
  png?: Buffer;
  /** Optional plain text to show instead of JSON (ascii renders). */
  text?: string;
}

export interface Command<S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  name: string;
  /**
   * One sentence: what it does and what it answers. It is what the MCP catalog
   * publishes, so every agent session pays for it — keep it under 200
   * characters (`mcpcatalog.test.ts` holds the line).
   */
  description: string;
  /** The long explanation, if any: shown by `pgs help <command>` and `pgs_doc`, never in the catalog. */
  details?: string;
  schema: S;
  run: (args: z.infer<S>) => CommandResult | Promise<CommandResult>;
}

/** Keeps `args` typed from the schema inside each definition, erased in the list. */
function define<S extends z.ZodObject<z.ZodRawShape>>(cmd: Command<S>): Command {
  return cmd as unknown as Command;
}

const color = z.union([z.string(), z.number().int()]).describe('hex color ("#rrggbb", added to the palette if new) or palette index');
const category = z.enum(['character', 'terrain', 'prop', 'nature', 'ui']);
const pathArg = z.string().describe('asset JSON path (*.pss.json)');

/** Everything `anatomy` stores on an asset, in the order it is written. */
const ANATOMY_KEYS = [
  'neckRow', 'waistRow', 'kneeRow', 'ankleRow',
  'torsoLeft', 'torsoRight', 'torsoCenterCol',
  'leftArmArea', 'rightArmArea', 'leftLegArea', 'rightLegArea',
] as const;

const contractSchema = z.object({
  id: z.string().optional(),
  anims: z.array(z.string()).min(1).describe('animation names; "{view}" expands once per view'),
  views: z.array(z.string()).optional().describe('what "{view}" expands to (default down, up, left, right)'),
});

const contractArg = z.union([z.string(), contractSchema]).describe(
  `the animation contract: a built-in name (${Object.keys(CONTRACTS).join(', ')}), a JSON file with { anims, views }, or the object itself`,
);

/** The contract a command was given, or the one it has always used. */
function readContract(spec: string | z.infer<typeof contractSchema> | undefined, fallback: AnimationContract): AnimationContract {
  if (spec === undefined) return fallback;
  if (typeof spec !== 'string') return contractSchema.parse(spec);
  if (CONTRACTS[spec]) return CONTRACTS[spec];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(spec, 'utf8'));
  } catch (err) {
    throw new Error(`contract "${spec}" is neither a built-in (${Object.keys(CONTRACTS).join(', ')}) nor a readable JSON file: ${(err as Error).message}`);
  }
  const obj = raw && typeof raw === 'object' && 'contract' in (raw as object) ? (raw as { contract: unknown }).contract : raw;
  const parsed = contractSchema.safeParse(obj);
  if (!parsed.success) {
    throw new Error(`contract ${basename(spec)}: ${parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  }
  return { id: parsed.data.id ?? basename(spec).replace(/\.json$/i, ''), ...parsed.data };
}

const proportionsArg = z.union([z.boolean(), z.string(), z.record(z.string(), z.unknown())]).describe(
  'proportion map (default: from pgs.json); a variant name, a JSON path or false',
);

/**
 * The proportion map a command works with. Unlike every other style knob,
 * this one **inherits**: a project that declared where its chins go should not
 * have to say it again on each call. What is passed explicitly wins, and the
 * command says in its output where the map came from — a style that works by
 * magic is the thing `pgs.json` was written to end.
 */
function readProportions(
  near: string,
  spec: boolean | string | Record<string, unknown> | undefined,
  size?: { width: number; height: number },
): { map?: ProportionBase; from?: string; project?: string; variant?: string } {
  if (spec === false) return {};
  if (spec && typeof spec === 'object') {
    return { map: proportionsSchema.parse(spec) as ProportionBase, from: 'the argument' };
  }
  if (typeof spec === 'string' && (spec.endsWith('.json') || spec.includes('/'))) {
    const raw = JSON.parse(readFileSync(spec, 'utf8')) as Record<string, unknown>;
    const obj = 'proportions' in raw ? raw.proportions : raw;
    return { map: proportionsSchema.parse(obj) as ProportionBase, from: basename(spec) };
  }
  const file = findProject(near);
  if (!file) {
    if (typeof spec === 'string') throw new Error(`proportions "${spec}": no pgs.json above ${near} to take a variant from`);
    return {};
  }
  const project = loadProject(file);
  const map = projectProportions(project.style);
  if (!map) {
    if (typeof spec === 'string' || spec === true) throw new Error(`${relTo(process.cwd(), file)} declares no visual.proportions`);
    return {};
  }
  const variant = typeof spec === 'string' ? spec
    : size ? variantForSize(project.style, size.width, size.height) : undefined;
  if (typeof spec === 'string' && !map.variants?.[spec]) {
    throw new Error(`proportions "${spec}" is not a variant of ${relTo(process.cwd(), file)} (it has ${Object.keys(map.variants ?? {}).join(', ') || 'none'})`);
  }
  return {
    map: resolveProportions(map, variant),
    from: `${relTo(process.cwd(), file)}${variant ? ` (${variant})` : ''}`,
    project: file,
    variant,
  };
}

interface LintWorld { file: string; palette?: string[]; contract?: AnimationContract }

/**
 * What `lint` takes from the nearest pgs.json of an asset when it is not
 * passed: the palette (`visual.palette`, a palette asset) and the animation
 * contract (`visual.contract`, a built-in name or a JSON file). Cached per
 * project file, since a lint of a folder reads the same one fifty times.
 */
function lintWorld(near: string, cache: Map<string, LintWorld>): LintWorld | undefined {
  const file = findProject(near);
  if (!file) return undefined;
  const hit = cache.get(file);
  if (hit) return hit;
  const project = loadProject(file);
  const v = project.style.visual ?? {};
  const world: LintWorld = { file };
  if (v.palette) world.palette = Object.values(loadAsset(projectPath(project, v.palette)).palette);
  if (v.contract) world.contract = readContract(CONTRACTS[v.contract] ? v.contract : projectPath(project, v.contract), BODY_CONTRACT);
  cache.set(file, world);
  return world;
}

/**
 * The glyph sheet a font command works on: the one passed, or `type.font` of
 * the nearest pgs.json above where it runs. When the sheet is the world's own
 * font, the world's bodies (`type.steps`) come with it. `line` is the one line
 * the answer carries when anything was inherited.
 */
function worldFont(path?: string): { path: string; project?: string; what?: string[]; steps?: number[]; line?: string } {
  const project = nearestProject(path ?? process.cwd());
  const declared = project?.style.type?.font ? projectPath(project, project.style.type.font) : undefined;
  if (!path) {
    if (!project) throw new Error(`no path, and no pgs.json above ${process.cwd()} to take type.font from`);
    if (!declared) throw new Error(`no path, and ${shownProjectPath(project.file)} declares no type.font`);
    return { path: declared, project: project.file, what: [`fuente ${project.style.type!.font}`], steps: project.style.type?.steps,
      line: inheritedLine(project.file, [`fuente ${project.style.type!.font}`]) };
  }
  const own = !!declared && resolve(path) === declared;
  return { path, ...(own && project ? { project: project.file, steps: project.style.type?.steps } : {}) };
}

/** The whole-number scales a font shows the world's bodies at, and the bodies that are not one. */
function stepScales(steps: number[], design: number): { scales: number[]; off: number[] } {
  const scales: number[] = []; const off: number[] = [];
  for (const st of steps) (st % design === 0 && st > 0 ? scales : off).push(st / design);
  return { scales: [...new Set(scales)], off: off.map(k => Math.round(k * design)) };
}

/**
 * The drawings on a box's faces, ready to render: a text drawing (`draw`) read
 * into colors (its color names when the model's palette has them with the same
 * hex, else the hex), and, unless it glows, the shade of each color the drawing
 * does not give: one step down its ramp in the palette (the darker color
 * nearest in OKLab hue and chroma, the least darker of those). Only where the
 * material itself darkens on that face (top to its shade, lit side to dark
 * side): a material of one tone keeps the drawing as drawn.
 */
function paintsOf(
  paint: NonNullable<VoxelModel['boxes'][number]['paint']>,
  material: VoxelModel['materials'][string] | undefined,
  byName: Map<string, string>, hexOf: (c: string) => string,
): NonNullable<VoxelModel['boxes'][number]['paint']> {
  const out: NonNullable<VoxelModel['boxes'][number]['paint']> = {};
  const L = (c: string) => oklab(hexToRgb(hexOf(c)));
  const named = [...byName.entries()].map(([name, hex]) => ({ name, lab: oklab(hexToRgb(hex)) }));
  for (const [face, raw] of Object.entries(paint)) {
    if (!raw) continue;
    let p: VoxelPaint = { ...raw };
    if (p.draw) {
      let parsed;
      try { parsed = fromAscii(readFileSync(p.draw, 'utf8'), { sourcePath: p.draw }); } catch (err) { throw new Error(`voxel: paint ${face} ${p.draw}: ${(err as Error).message}`); }
      const { asset } = parsed;
      const frame = p.frame ?? 0;
      if (frame < 0 || frame >= frameCount(asset)) throw new Error(`voxel: paint ${face} ${p.draw}: frame ${frame} is not in the drawing (${frameCount(asset)} frames)`);
      const colorOf = (i: number) => {
        const hex = normalizeHex(asset.palette[i]);
        const name = asset.colorNames?.[i];
        return name && byName.get(name)?.toLowerCase() === hex.toLowerCase() ? name : hex.toLowerCase();
      };
      p = { ...p, pixels: composite(asset, frame).map(row => row.map(i => (i ? colorOf(i) : null))) };
      delete p.draw;
    }
    if (!p.glow && material) {
      const colors = new Set<string>(p.pixels ? p.pixels.flat().filter((c): c is string => !!c) : Object.values(p.glyphs ?? {}));
      const [lit, dark] = face === 'top' ? [material.top, material.shade ?? material.left] : [material.left, material.right];
      const drop = L(lit)[0] - L(dark)[0];
      const shade: Record<string, string> = { ...p.shade };
      for (const c of colors) {
        if (shade[c] || drop < 0.01) continue;
        // One step down its own ramp: the darker color nearest in hue and
        // chroma, and of those the least darker (a skin goes to a skin in
        // shade, not to the darkest brown).
        const [l, a, b] = L(c);
        let best: string | undefined, bestD = Infinity;
        for (const n of named) {
          if (n.lab[0] > l - 0.04) continue;
          const d = Math.hypot(n.lab[1] - a, n.lab[2] - b) + 0.3 * (l - n.lab[0]);
          if (d < bestD) { bestD = d; best = n.name; }
        }
        if (best) shade[c] = best;
      }
      if (Object.keys(shade).length) p.shade = shade;
    }
    out[face as keyof typeof out] = p;
  }
  return out;
}

function withAsset(path: string, fn: (asset: SpriteAsset) => unknown): CommandResult {
  const asset = loadAsset(path);
  const extra = fn(asset);
  saveAsset(path, asset);
  const data = summarize(asset);
  return { data: extra === undefined ? data : { ...(typeof extra === 'object' && extra ? extra : { result: extra }), asset: data } };
}

const drawOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('pixel'), x: z.number().int(), y: z.number().int(), color }),
  z.object({ op: z.literal('pixels'), points: z.array(z.tuple([z.number().int(), z.number().int()])), color }),
  z.object({ op: z.literal('line'), x0: z.number().int(), y0: z.number().int(), x1: z.number().int(), y1: z.number().int(), color }),
  z.object({ op: z.literal('rect'), x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int(), color, fill: z.boolean().optional() }),
  z.object({ op: z.literal('circle'), x: z.number().int(), y: z.number().int(), radius: z.number(), color, fill: z.boolean().optional() }),
  z.object({ op: z.literal('fill'), x: z.number().int(), y: z.number().int(), color }),
  z.object({ op: z.literal('replace'), from: color, to: color }),
  z.object({ op: z.literal('clear') }),
]);

const zoneArgs = {
  rect: z.array(z.number()).length(4).optional().describe('zone [x0, y0, x1, y1] in fractions of the image (0..1)'),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional().describe('zone [[x, y], …] in fractions of the image'),
  mask: z.string().optional().describe('zone as an image (PNG or JPEG): light / opaque is inside; resampled to the image'),
  invert: z.boolean().optional().describe('everything but the zone'),
};

function zoneSpec(a: { rect?: number[]; polygon?: [number, number][]; mask?: string; invert?: boolean }): ZoneSpec | null {
  if (!a.rect && !a.polygon && !a.mask) return null;
  return { rect: a.rect, polygon: a.polygon, mask: a.mask ? readImage(a.mask) : undefined, invert: a.invert };
}

const fxShape = z.enum(['burst', 'beam', 'sparks', 'pulse', 'circle', 'glow', 'bolt']);

/** map_lint of a recipe: renders it and checks the ground inside the map and each other layer. */
function lintRecipe(path: string, variant?: string): CommandResult {
  const r = renderRecipe(path, { stderr: false, variant });
  const materials = recipeMaterials(r, path);
  const palette = Object.values(r.colors);
  const [ox, oy] = r.map.origin;
  const [mx, my] = r.recipe.margin ?? [0, 0];
  const cell = r.map.cell;
  const area = { x: ox, y: oy, w: r.map.width - 2 * mx * cell, h: r.map.height - 2 * my * cell };
  // the materials the recipe leaves out of the shape rules (`lint.skip`), by what each ground px was painted as
  const skip = new Set(r.recipe.lint?.skip ?? []);
  const ignore = skip.size ? Uint8Array.from(r.map.kind, k => (skip.has(k) ? 1 : 0)) : undefined;
  const reports: Record<string, ReturnType<typeof mapLint>> = {};
  // the old light a recipe with a sun still declares goes in the answer, not on stderr (the MCP never shows stderr)
  const lines: string[] = (r.warnings ?? []).map(w => `⚠ ${w}`);
  for (const [name, layer] of Object.entries(r.map.layers)) {
    const ground = name === 'ground';
    const rep = mapLint(layersImage([layer], r.colors), {
      area: ground ? area : undefined, palette, materials, ground, architecture: r.recipe.lint?.architecture, cell,
      ignore: ground ? ignore : undefined,
    });
    reports[name] = rep;
    lines.push(`${rep.problems.length ? '✗' : '✓'} ${name}`, ...rep.problems.map(p => `    ${p}`));
    if (ground) lines.push(`    ${rep.loose} lone px in ${rep.changes} material changes`);
  }
  // the stamps that stand on a base all of ink (a ball of rock put there, not a rock in the ground): over 10 %, said
  const ink = closedInkOf(r.map);
  if (ink && ink.total) {
    const share = ink.closed / ink.total;
    if (reports.ground) reports.ground.closedInk = { ...ink, share };
    lines.push(`${share > 0.1 ? '⚠' : '✓'} stamps closed by ink below: ${ink.closed} of ${ink.total} (${Math.round(share * 100)} %)${share > 0.1 ? ` over 10 %: settle them (step settle)${ink.ids.length ? `; ${ink.ids.slice(0, 4).join(', ')}` : ''}` : ''}`);
  }
  if (r.world) lines.push(r.world);
  return { data: reports, text: lines.join('\n') };
}

export const commands: Command[] = [
  define({
    name: 'new',
    description: 'Create an empty asset JSON with a canvas size and an optional palette.',
    schema: z.object({
      path: pathArg,
      id: z.string().optional().describe('defaults to the file name without .pss.json'),
      name: z.string().optional(),
      width: z.number().int().positive(),
      height: z.number().int().positive().optional().describe('defaults to width'),
      category: category.optional(),
      palette: z.array(z.string()).optional().describe('hex colors for indices 1..n'),
      frames: z.number().int().positive().optional().describe('blank frames to start with (default 1)'),
      description: z.string().optional(),
    }),
    run: (a) => {
      const id = a.id ?? basename(a.path).replace(/\.pss\.json$|\.json$/i, '');
      const asset = createAsset({ ...a, id });
      saveAsset(a.path, asset);
      return { data: summarize(asset) };
    },
  }),
  define({
    name: 'project',
    description: 'The drawing style of the project a path belongs to (nearest pgs.json): prose and lintable numbers. Read it before drawing in a new project.',
    details: 'How things are drawn **here**: the style of the project a path belongs to, read from the nearest pgs.json walking up. The prose says how to make a new asset; the numbers are what a lint can check. Read it before drawing anything in a project you did not set up.',
    schema: z.object({
      path: z.string().optional().describe('a file or folder inside the project; default the working directory'),
    }),
    run: (a) => {
      const from = a.path ?? process.cwd();
      const file = findProject(from);
      if (!file) throw new Error(`no ${PROJECT_FILE} in ${resolve(from)} or above it`);
      const project = loadProject(file);
      const pal = project.style.visual?.palette;
      const png = pal ? encodePng(paletteSheet(loadAsset(projectPath(project, pal)).palette)) : undefined;
      return { data: { file: project.file, ...project.style }, text: projectBrief(project), png };
    },
  }),
  define({
    name: 'info',
    description: 'Summary of an asset: size, frames, palette, animations.',
    schema: z.object({ path: pathArg }),
    run: (a) => ({ data: summarize(loadAsset(a.path)) }),
  }),
  define({
    name: 'inspect',
    description: 'Everything about an asset (size, frames, layers, palette, animations) as JSON: the detail the writing commands leave out.',
    details: 'Everything about an asset (size, frames, layers, palette, animations), as JSON. Over MCP the commands that write answer one line; this is the detail.',
    schema: z.object({ path: pathArg }),
    run: (a) => ({ data: summarize(loadAsset(a.path)) }),
  }),
  define({
    name: 'ascii',
    description: 'A frame as text ("." transparent, one glyph per palette index) with a legend. The cheapest way to look at pixels.',
    schema: z.object({
      path: pathArg,
      frame: z.number().int().nonnegative().optional().describe('default 0'),
      animation: z.string().optional().describe('render every frame of this animation instead'),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const legend = asciiLegend(asset);
      let text: string;
      if (a.animation) {
        const anim = findAnimation(asset, a.animation);
        if (!anim) throw new Error(`no animation "${a.animation}"`);
        text = anim.frameIndices
          .map((f, i) => `frame ${f} (${a.animation} #${i})\n${renderAscii(composite(asset, f))}`)
          .join('\n\n');
      } else {
        const f = a.frame ?? 0;
        text = `frame ${f}\n${renderAscii(composite(asset, f))}`;
      }
      return { data: { legend }, text: `${text}\n\n${legend}` };
    },
  }),
  define({
    name: 'render',
    description: 'Render to PNG at a scale: one frame, one animation, or a contact sheet with every animation (default). Returns the image.',
    schema: z.object({
      path: pathArg,
      out: z.string().optional().describe('PNG path; when omitted the image is only returned'),
      scale: z.number().int().positive().optional().describe('default 4'),
      frame: z.number().int().nonnegative().optional(),
      animation: z.string().optional(),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const scale = a.scale ?? 4;
      let png: Buffer;
      if (a.frame !== undefined) {
        png = encodePng(renderFrame(asset, composite(asset, a.frame), scale));
      } else if (a.animation) {
        const anim = findAnimation(asset, a.animation);
        if (!anim) throw new Error(`no animation "${a.animation}"`);
        const only: SpriteAsset = { ...asset, animations: [anim] };
        png = encodePng(contactSheet(only, { scale }));
      } else {
        png = encodePng(contactSheet(asset, { scale }));
      }
      if (a.out) {
        mkdirSync(dirname(a.out), { recursive: true });
        writeGuarded(a.out, png);
      }
      return { data: { out: a.out ?? null, scale, bytes: png.length }, png };
    },
  }),
  define({
    name: 'import_sheet',
    description: 'Cut a PNG sprite sheet on a grid into an asset, colors exact; tags map frames to animations; into= appends to an existing asset.',
    details: 'Cut a PNG sprite sheet on a grid into an asset, keeping every color exactly. Tags map grid frames to animations ("row:N", "col:N" or a list, row-major). With "into", the frames are appended to that existing asset (same frame size; palette merged by hex).',
    schema: z.object({
      png: z.string(),
      out: pathArg,
      into: pathArg.optional().describe('existing asset to append into; defaults to a new asset at out'),
      frame_width: z.number().int().positive(),
      frame_height: z.number().int().positive(),
      margin: z.number().int().nonnegative().optional(),
      spacing: z.number().int().nonnegative().optional(),
      alpha_threshold: z.number().int().min(1).max(255).optional(),
      id: z.string().optional(),
      name: z.string().optional(),
      category: category.optional(),
      skip_empty: z.boolean().optional(),
      tags: z.array(z.object({
        name: z.string(),
        frames: z.union([z.array(z.number().int().nonnegative()), z.string()]),
        fps: z.number().positive().optional(),
        durations: z.array(z.number().positive()).optional(),
        loop: z.boolean().optional(),
      })).optional(),
    }),
    run: (a) => {
      const { asset, columns, rows } = importSheet({
        png: a.png,
        into: a.into ? loadAsset(a.into) : undefined,
        frameWidth: a.frame_width,
        frameHeight: a.frame_height,
        margin: a.margin,
        spacing: a.spacing,
        alphaThreshold: a.alpha_threshold,
        id: a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, ''),
        name: a.name,
        category: a.category,
        skipEmpty: a.skip_empty,
        tags: a.tags,
      });
      // With `into` this is one cut appended to an asset built elsewhere, so the
      // header would claim a drawing it did not make on its own.
      if (!a.into) {
        asset.generatedBy = madeBy('import_sheet', {
          png: relTo(a.out, a.png), frame_width: a.frame_width, frame_height: a.frame_height,
          margin: a.margin, spacing: a.spacing,
        });
      }
      saveAsset(a.out, asset);
      return { data: { grid: { columns, rows }, asset: summarize(asset) } };
    },
  }),
  define({
    name: 'import_character',
    description: 'Import a whole character from a pack folder into one asset with the animations of a contract (default: directional).',
    details: 'Import a whole character from a pack folder in one go, with the animations an animation contract asks for — by default the "directional" one: idle/hurt/walk/attack per view (down, up, left, right) plus technique and die. The contract (which animations must exist and what they are called) is the game\'s and is a parameter; the layout (where this pack keeps each of them) is the pack\'s: "ninja_separate" = Idle/Walk/Attack/Special1/Dead PNGs, "ninja_sheet" = one SpriteSheet.png, 4 columns × N step rows. A name the layout cannot make stops the import naming it.',
    schema: z.object({
      dir: z.string().describe('folder with the PNGs'),
      out: pathArg,
      layout: z.enum(['ninja_separate', 'ninja_sheet']),
      contract: contractArg.optional().describe('which animations to build and what to call them (default: directional)'),
      id: z.string().optional(),
      name: z.string().optional(),
      frame_size: z.number().int().positive().optional().describe('default 16'),
      walk_fps: z.number().positive().optional(),
      attack_ms: z.number().positive().optional(),
      hurt_ms: z.number().positive().optional(),
      technique_ms: z.number().positive().optional(),
      die_ms: z.number().positive().optional(),
    }),
    run: (a) => {
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      const contract = readContract(a.contract, DIRECTIONAL_CONTRACT);
      const { asset, sheets, anims } = importCharacter({
        dir: a.dir, layout: a.layout, id, name: a.name, frameSize: a.frame_size, contract,
        walkFps: a.walk_fps, attackMs: a.attack_ms, hurtMs: a.hurt_ms, techniqueMs: a.technique_ms, dieMs: a.die_ms,
      });
      asset.generatedBy = madeBy('import_character', {
        dir: relTo(a.out, a.dir), layout: a.layout, frame_size: a.frame_size,
        contract: typeof a.contract === 'string' ? a.contract : contract.id,
      });
      saveAsset(a.out, asset);
      const check = checkContract(asset, contract);
      return { data: { sheets, contract: check.id, anims, missing: check.missing, asset: summarize(asset) } };
    },
  }),
  define({
    name: 'animate',
    description: 'Generate animations from one base pose with the anatomy engine (anim, or every one of a contract); appends and tags the frames.',
    details: `Generate an animation from one base pose with the anatomy engine (${ANIMATION_KINDS.join(', ')}), optionally with a direction suffix ("walk_down", "attack_left": left is generated as right and flipped). Appends the frames and tags them. Use "anatomy" (or the asset's) to fix where neck, waist, knees and ankles are when the automatic guess is off. With "contract" instead of "anim" it grows **every** animation an animation contract asks for (a technique is generated as a cast) and answers which ones it could not and why — a sit has no generator, a view with no base pose has nowhere to grow from. For a contract with views give "base_from" ("idle_{view}"): each view grows out of its own pose, and a view "left" with no pose grows out of the right one, mirrored. The engine only moves a person standing (a head, two arms, two legs): a base that does not read as one (wider than tall, a head or a tail at one end, ears, widest below the middle when as tall as wide) is refused with what was measured, nothing written; draw it by hand, or declare the body with anatomy or proportions and it is animated with a warning. "frames" keeps fewer frames of a loop: the idle its distinct poses (2 = rest and settle), a walk or a run evenly.`,
    schema: z.object({
      path: pathArg,
      base: z.number().int().nonnegative().optional().describe('frame index of the base pose'),
      anim: z.string().optional(),
      contract: contractArg.optional().describe('grow every animation of this contract instead of one anim'),
      base_from: z.string().optional().describe('with contract: the base pose animation of each view ("idle_{view}")'),
      overwrite: z.boolean().optional().describe('with contract: regenerate animations the asset already has (default: skip them)'),
      name: z.string().optional().describe('tag name (default: anim)'),
      fps: z.number().positive().optional(),
      frames: z.number().int().positive().optional().describe('how many frames, for idle, walk or run (idle: 1 to 4; default: the whole cycle)'),
      loop: z.boolean().optional(),
      glow: color.optional().describe('glow color for cast'),
      anatomy: z.object({
        neckRow: z.number().int().optional(), waistRow: z.number().int().optional(),
        kneeRow: z.number().int().optional(), ankleRow: z.number().int().optional(),
        torsoLeft: z.number().int().optional(), torsoRight: z.number().int().optional(),
        torsoCenterCol: z.number().int().optional(),
        leftArmArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(), rightArmArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(),
        leftLegArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(), rightLegArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(),
      }).optional(),
      proportions: proportionsArg.optional(),
    }),
    run: (a) => {
      if (a.anim && a.contract) throw new Error('animate takes anim or contract, not both');
      if (!a.anim && !a.contract) throw new Error('animate needs anim or contract');
      // The map is read once, for the asset's canvas: the engine then knows
      // where the neck and the torso columns are instead of taking whatever
      // sticks out sideways for an arm.
      const sized = dims(loadAsset(a.path));
      const prop = readProportions(a.path, a.proportions, sized);
      // a map passed on purpose says "this is a body": an inherited one is the project's people, not this drawing
      const bodyDeclared = a.proportions !== undefined && a.proportions !== false && !!prop.map;
      const warnings: string[] = [];
      if (a.anim) {
        if (a.base === undefined) throw new Error('animate needs base: the frame index of the pose to grow from');
        const anim = a.anim;
        const base = a.base;
        return withAsset(a.path, asset => ({
          frames: animateAsset(asset, { ...a, anim, base, proportions: prop.map, bodyDeclared, warnings }),
          ...(prop.from ? { proportions: prop.from } : {}),
          ...(warnings.length ? { warnings } : {}),
        }));
      }
      if (a.frames !== undefined) throw new Error('animate: frames goes with anim, not with contract');
      const contract = readContract(a.contract, BODY_CONTRACT);
      return withAsset(a.path, asset => {
        const r = animateContract(asset, contract, {
          base: a.base, baseFrom: a.base_from, fps: a.fps, glow: a.glow, anatomy: a.anatomy,
          proportions: prop.map, overwrite: a.overwrite, bodyDeclared,
        });
        return {
          contract: contract.id ?? 'contract',
          ...(prop.from ? { proportions: prop.from } : {}),
          made: r.made.map(m => `${m.anim} (${m.frames})`),
          skipped: r.skipped.map(s => `${s.anim}: ${s.why}`),
          ...(r.warnings.length ? { warnings: r.warnings } : {}),
        };
      });
    },
  }),
  define({
    name: 'figure',
    description: 'Draw a full-body fighter from a rig recipe in a view (front, back, side, side_left or a diagonal) with every animation of its contract. See docs/figure.md.',
    details: 'Draw a full-body fighter from a rig in 3/4 (view "front": turned to the lower left, a rival; "back": from behind turned to the upper right, your side of a diagonal battle; "side"/"side_left": in profile, facing right/left; the diagonals front_right, front_left, back_right, back_left turn the drawn head and the parts from the views beside them) with every animation of the contract (idle, walk, attack, technique, hurt, die), or only the ones in the recipe field anims (which also takes sit: cross-legged, hands in the lap, breathing in and out; and lotus: the same seat with the hands on the knees, still). The recipe sets build (build.spread opens the knees: about 1.4 for a lotus seen from the front), skin, hair style (short, topknot, ponytail, long, messy, bun) and band, hat (cap, turban), beard, top and sleeves (long, none, wide, rolled; cover_hands), an old body (build.stoop, build.neck, build.leg_length) and a cane held in one hand that plants and lifts with each step, robe skirt, sash, pants, shoes and the technique glow, each as one color or three tones [light, mid, shade]. stance "upright" stands square and walks in a real cycle (a map sprite). Drawn parts: head_art per view and attachments (art hung from a joint, per view, behind or in front; "at" places a part cut from a drawing where it was cut; side_left mirrors the side parts). Each frame is drawn whole (the head never comes off), shaded and outlined.',
    schema: z.object({
      recipe: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('recipe JSON path, or the recipe object'),
      out: pathArg,
      view: z.enum(FIGURE_VIEWS).optional().describe('overrides the recipe view'),
      contract: contractArg.optional().describe('animation contract; overrides the recipe one (default: body)'),
      proportions: proportionsArg.optional(),
      id: z.string().optional(),
      joints: z.boolean().optional().describe('also answer where each joint falls (x, y in px) in the standing frame (idle, first frame) of this view: to measure a posture, such as how far a stoop tilts the head-hip axis'),
      layers: z.union([z.boolean(), z.literal('complete')]).optional().describe('one asset layer per body layer (cuerpo, pelo, ropa, faja, adornos, arma…) that composites to the same frames; answers their stacking order in this view and each color\'s material and tone. "complete": each layer drawn whole (the robe under the arm, the head under the hair), to swap one for another figure\'s'),
      order: z.array(z.enum(FIGURE_LAYERS)).optional().describe('with layers "complete": the stacking order to complete against, bottom to top'),
    }),
    run: (a) => {
      const raw = typeof a.recipe === 'string' ? JSON.parse(readFileSync(a.recipe, 'utf8')) : a.recipe;
      const rec = { ...(raw as unknown as FigureRecipe) };
      if (a.view) rec.view = a.view;
      // The recipe may name a built-in contract, point at a JSON file or spell
      // the object out; the command resolves it, so figure.ts stays pure.
      const declared = (raw as { contract?: string | z.infer<typeof contractSchema> }).contract;
      if (a.contract !== undefined) rec.contract = readContract(a.contract, BODY_CONTRACT);
      else if (declared !== undefined) rec.contract = readContract(declared, BODY_CONTRACT);
      rec.id = a.id ?? rec.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      // The proportion map, same as the contract: the command resolves it so
      // figure.ts stays pure. The canvas picks the variant, so a project that
      // calls 16x32 "chibi" gets the chibi build without saying so.
      const prop = readProportions(a.out, a.proportions, { width: rec.width ?? 48, height: rec.height ?? 48 });
      if (prop.map) rec.proportions = prop.map;
      if (a.order && a.layers !== 'complete') throw new Error('figure: order goes with layers "complete"');
      // a figure its own canvas cuts is not a figure that was drawn: say what falls off and what fits it
      const clipped = clipWarnings(rec, figureClip(rec));
      const layered = a.layers ? figureLayered(rec, { complete: a.layers === 'complete', order: a.order }) : undefined;
      const asset = layered?.asset ?? figureAsset(rec);
      asset.generatedBy = madeBy('figure', {
        recipe: typeof a.recipe === 'string' ? relTo(a.out, a.recipe) : undefined,
        view: rec.view, contract: typeof a.contract === 'string' ? a.contract : rec.contract?.id,
        ...(a.layers ? { layers: a.layers } : {}),
      });
      saveAsset(a.out, asset);
      return {
        data: {
          ...summarize(asset), ...(prop.from ? { proportions: prop.from, heads: proportioned(rec).build?.heads } : {}),
          ...(a.joints ? { joints: figureJoints(rec, 'idle', 0) } : {}),
          ...(layered ? { layers: { order: layered.order, materials: layered.materials, tones: layered.tones } } : {}),
          ...(clipped.length ? { warnings: clipped } : {}),
        },
      };
    },
  }),
  define({
    name: 'voxel',
    description: 'Boxes with materials → isometric 2:1 pixel art (furniture, a room): one tone per face, tiles, shadows, a one-pixel contour, a drawing on a face (paint); split in layers for what stands between.',
    details: 'Render a voxel model (a JSON: "materials" by name, each with the palette color of its top, left and right face, an optional "edge" rim, "shade" (top in shadow) and "tile" {size:[x,y], alt, joint} for a floor; "boxes", each {at:[x,y,z], size:[w,d,h], material, layer?, paint?}, at negative too (a figure modelled around its foot at (0,0,0)); "paint" puts a drawing on a face of the box (a poster, a screen, a pinball glass, a face on a head), by face: top, left (+y), right (+x), or -x/-y (they show once the box turns), each {draw: a PGS text drawing beside the model, frame?} or {rows:[...], glyphs:{g: color}} ("." and " " leave the face) or {pixels:[[color|null]]}, plus at:[column,row] from the face\'s top-left (a side\'s row 0 is its top, columns left to right as seen; a top\'s row 0 is its far edge, columns along +x), one unit per pixel, projected like the rest (on a top every pixel of the drawing gets one of the screen, though 2:1 shows a plain top one unit in two), turning with the box under rotate (a poster on +y turned 90 is on +x); it takes the light of its face: as drawn on the top and the lit side, and on the side in shadow and in cast shadow one step down each color\'s own ramp in the palette (the darker color nearest in hue and chroma), unless "shade" {color: darker} says it or the material is one tone there; "glow": true keeps it as drawn everywhere (a screen, a backlit glass); optional "outline" color or false, "light" upper_left|upper_right, "shadows" true; optional "pivot" [x,y,z], the point the model stands on and turns about (default (0,0,0)), and "rotate" 90|180|270, the whole model turned about it; optional "palette", an asset whose color names the materials use; optional "place", other models inside this one, each {model: path beside this one, at:[x,y,z] where its (0,0,0) goes, id?, layer?, loose?, rotate?}, laid out as its boxes so a room draws the light and shadows of its furniture; with loose: true and a layer of its own, a piece the game moves: the room is drawn without it, its layer is the piece alone and whole (in the room\'s light where it was placed), and <layer>_sombra the shadow it casts on the back layer in the room\'s shadow tones, listed in lugar.json as loose; rotate: 90, 180 or 270 turns the piece about the vertical in its corner, what faced the left now facing the right, the light staying put) in the classic 2:1 isometric projection: x goes down-right, y down-left, z up, a box 16 wide is a 32 px diamond. A room is the same thing: a floor slab with tiles, walls as boxes, a door as a gap, the front wall cut low. Writes the asset ("out", a .pss.json) with generated_by, and optionally its text drawing ("txt") and a PNG ("png", at "scale"); when <txt>.retoque.txt is there (the hand pass), it goes on top of the asset and the PNG and the answer says how much of the drawing it decides (retouch=false skips it), so running the recipe again keeps it. With layers=true, <out>.lugar.json with the canvas, the layers and the pixel where world (0,0,0) lands (to stand a piece of furniture on a tile; "pivot" too, the pixel of the model\'s pivot, when it has one), and, when the boxes are in more than one layer, each layer alone on the same canvas (<out>.<layer>.pss.json and .png), so the game draws the back, then what stands in the room, then the front (screen = origin + (x - y, (x + y) / 2 - z)). only=<layer> (or several, comma-separated) writes just those layers and the lugar.json, not the whole nor the other layers: a figure drawn inside a room for its light and its cut, of which only its own layer is wanted. rotate=90|180|270 turns the whole model about its pivot on top of its own "rotate": the four views of a figure from one model (+y comes to face +x; the light stays). frames=[model, model, …] instead of model: the frames of an animation, each drawn as model would be and laid on the smallest canvas they all fit with their (0,0,0) on the same pixel, written as one asset with that many frames and an animation at fps (default 8), the PNG as a strip left to right (frame i at x = i * width), and with layers each layer the same way; lugar.json says frames and fps. Colors are palette names (or hex). Without "palette" in the model the palette is the nearest pgs.json\'s visual.palette, and without "light" its visual.light.from when it is upper_left or upper_right; the answer says what it took.',
    schema: z.object({
      model: z.string().optional().describe('voxel model JSON (or "frames")'),
      frames: z.array(z.string()).min(1).optional().describe('voxel models, one per frame of an animation: one canvas, one origin, one asset with that many frames and a PNG strip'),
      fps: z.number().positive().optional().describe('with frames: the speed of the animation (default 8)'),
      out: z.string().describe('asset JSON to write (*.pss.json); with only, the stem of the layer files'),
      txt: z.string().optional().describe('also write the text drawing here'),
      png: z.string().optional().describe('also write a PNG here'),
      scale: z.number().int().positive().optional().describe('PNG scale (default 1)'),
      layers: z.boolean().optional().describe('also write each layer alone, on the same canvas, and <out>.lugar.json'),
      only: z.union([z.string(), z.array(z.string())]).optional().describe('write only these layers (and the lugar.json), not the whole: a name, comma-separated names or a list'),
      rotate: z.number().int().optional().describe('turn the whole model about its pivot: 90, 180 or 270 degrees (+y comes to face +x)'),
      retouch: z.boolean().optional().describe('false: do not lay <txt>.retoque.txt on top (default: lay it when it is there)'),
    }),
    run: (a) => {
      if (!a.model === !a.frames) throw new Error('voxel: give "model" (one model) or "frames" (the models of an animation), one of the two');
      const paths = a.frames ?? [a.model!];
      const animated = !!a.frames;
      const only = a.only === undefined ? undefined : (Array.isArray(a.only) ? a.only : a.only.split(',')).map(s => s.trim()).filter(Boolean);
      if (only && !only.length) throw new Error('voxel: only names no layer');
      if (a.txt && (animated || only)) throw new Error('voxel: txt is the text drawing of one whole model; with frames or only there is none (draw it in a step of its own)');
      const layered = !!a.layers || !!only;
      const read = (path: string) => {
        const m = JSON.parse(readFileSync(path, 'utf8')) as VoxelModel & { palette?: string };
        // A drawing on a face is read beside the model that names it, wherever that model is placed.
        for (const b of m.boxes ?? []) {
          for (const p of Object.values(b.paint ?? {})) if (p?.draw) p.draw = resolve(dirname(path), p.draw);
        }
        return m;
      };
      const took: string[] = [];
      const notes: string[] = [];
      const project = nearestProject(dirname(resolve(a.out)));
      const loadOne = (modelPath: string) => {
        const raw = read(modelPath);
        // What a model places is read beside it, and what that places beside it.
        const where = new Map<string, string>();
        let model = placeModels(raw, (path, chain) => {
          const from = chain.length ? where.get(chain[chain.length - 1])! : modelPath;
          const full = resolve(dirname(from), path);
          where.set(path, full);
          try { return read(full); } catch (err) { throw new Error(`voxel: place ${path}: ${(err as Error).message}`); }
        }) as VoxelModel & { palette?: string };
        model.palette = raw.palette;
        const take = (what: string) => { if (!took.includes(what)) took.push(what); };
        let palettePath = model.palette ? resolve(dirname(modelPath), model.palette) : undefined;
        if (!palettePath && project?.style.visual?.palette) {
          palettePath = projectPath(project, project.style.visual.palette);
          take(`paleta ${project.style.visual.palette}`);
        }
        if (!model.light && project?.style.visual?.light?.from) {
          const from = project.style.visual.light.from.trim().toLowerCase().replace(/[\s-]+/g, '_');
          const iso = ({ upper_left: 'upper_left', top_left: 'upper_left', arriba_izquierda: 'upper_left', upper_right: 'upper_right', top_right: 'upper_right', arriba_derecha: 'upper_right' } as Record<string, VoxelLight>)[from];
          if (iso) { model.light = iso; take(`luz ${project.style.visual.light.from}`); }
          else {
            const note = `la luz del mundo («${project.style.visual.light.from}») no es una de las dos isométricas (upper_left, upper_right): se usa upper_left`;
            if (!notes.includes(note)) notes.push(note);
          }
        }
        const byName = new Map<string, string>();
        if (palettePath) {
          const pal = loadAsset(palettePath);
          for (const [k, hex] of Object.entries(pal.palette)) {
            const name = pal.colorNames?.[Number(k)];
            if (name) byName.set(name, hex);
          }
        }
        const hexOf = (c: string) => {
          if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
          if (!palettePath) throw new Error(`voxel: color "${c}" is a name, and the model names no "palette" and there is no pgs.json with visual.palette above out`);
          const hex = byName.get(c);
          if (!hex) throw new Error(`voxel: color "${c}" is not a name in ${basename(palettePath)}`);
          return hex;
        };
        model = { ...model, boxes: model.boxes.map(b => (b.paint ? { ...b, paint: paintsOf(b.paint, model.materials[b.material], byName, hexOf) } : b)) };
        if (a.rotate) model = turnModel(model, a.rotate);
        return { model, hexOf };
      };
      const loaded = paths.map(loadOne);
      const model = loaded[0].model;
      const renders = loaded.map(({ model: m }) => (layered ? renderVoxelLayers(m) : { whole: renderVoxel(m), layers: {} as Record<string, VoxelImage>, loose: [] as string[] }));
      const names = [...new Set(renders.flatMap(r => Object.keys(r.layers)))];
      const looseAll = [...new Set(renders.flatMap(r => r.loose))];
      if (only) {
        const missing = only.filter(n => !names.includes(n));
        if (missing.length) throw new Error(`voxel: only ${missing.join(', ')}: the model has no such layer (it has ${names.join(', ')})`);
      }
      // The frames of an animation on one canvas, their (0, 0, 0) on one pixel.
      const canvas = animated ? voxelCanvas(renders.map(r => r.whole)) : undefined;
      const blank = (c: VoxelCanvas): VoxelImage => ({
        width: c.width, height: c.height, origin: [...c.origin],
        pixels: Array.from({ length: c.height }, () => Array(c.width).fill(undefined)),
        hits: Array.from({ length: c.height }, () => Array(c.width).fill(undefined)),
      });
      const wholes = renders.map(r => (canvas ? onCanvas(r.whole, canvas) : r.whole));
      const layerFrames = (name: string) => renders.map(r => (canvas ? (r.layers[name] ? onCanvas(r.layers[name], canvas) : blank(canvas)) : r.layers[name]));
      const img = wholes[0];
      // One name, one color: frames that call the same name two colors are refused.
      const hexByColor = new Map<string, string>();
      const learn = (im: VoxelImage, hexOf: (c: string) => string) => {
        for (const c of new Set(im.pixels.flat())) {
          if (!c) continue;
          const hex = hexOf(c);
          const was = hexByColor.get(c);
          if (was && was !== hex) throw new Error(`voxel: color "${c}" is ${was} in one frame and ${hex} in another (one palette for all the frames)`);
          hexByColor.set(c, hex);
        }
      };
      renders.forEach((r, i) => { learn(r.whole, loaded[i].hexOf); for (const im of Object.values(r.layers)) learn(im, loaded[i].hexOf); });
      const hexOf = (c: string) => hexByColor.get(c) ?? loaded[0].hexOf(c);
      const stem = a.out.replace(/\.pss\.json$|\.json$/i, '');
      const id = animated ? basename(stem) : model.id;
      const made = (outPath: string) => ({
        ...(animated ? { frames: paths.map(p => relTo(outPath, p)).join(',') } : { model: relTo(outPath, a.model!) }),
        ...(a.layers ? { layers: 'true' } : {}),
        ...(only ? { only: only.join(',') } : {}),
        ...(a.rotate ? { rotate: a.rotate } : {}),
      });
      const toAsset = (ims: VoxelImage[], assetId: string, name: string, outPath: string) => {
        const used = [...new Set(ims.flatMap(im => im.pixels.flat()).filter((c): c is string => !!c))];
        const hexes = [...new Set(used.map(hexOf))];
        const asset = createAsset({ id: assetId, name, width: ims[0].width, height: ims[0].height, category: 'prop', palette: hexes, frames: ims.length });
        used.forEach(c => { if (!/^#/.test(c)) asset.colorNames[hexes.indexOf(hexOf(c)) + 1] = c; });
        const frames = ims.map(im => im.pixels.map(row => row.map(c => (c ? hexes.indexOf(hexOf(c)) + 1 : 0))));
        frames.forEach((f, i) => setFrame(asset, i, f));
        asset.generatedBy = madeBy('voxel', made(outPath));
        if (animated) asset.animations = [{ name: assetId, label: assetId.toUpperCase(), frameIndices: frames.map((_, i) => i), fps: a.fps ?? 8, loop: true }];
        return { asset, frames, colors: hexes.length };
      };
      // A strip, frame i at x = i * width: what a game cuts by its frame count.
      const pngOf = (asset: SpriteAsset, frames: number[][][]) => {
        const s = a.scale ?? 1;
        if (frames.length === 1) return renderFrame(asset, frames[0], s);
        const w = img.width * s;
        const strip = blankImage(w * frames.length, img.height * s);
        frames.forEach((f, i) => blit(strip, renderFrame(asset, f, s), i * w, 0));
        return strip;
      };
      const whole = toAsset(wholes, id, animated ? id : model.name ?? model.id, a.out);
      // The text drawing is what the model makes, untouched; the hand pass
      // lives beside it (<txt>.retoque.txt) and goes on top of the asset and
      // the PNG, so running the recipe again keeps it.
      let finished = whole.asset;
      let retouched: string | undefined;
      if (a.txt) {
        const tg = { ...whole.asset, generatedBy: madeBy('voxel', { model: relTo(a.txt, a.model!) }) };
        writeGuarded(a.txt, toAscii(tg).text);
        if (a.retouch !== false) {
          const applied = applyRetouch(whole.asset, a.txt);
          if (applied.retouch) {
            finished = applied.asset;
            retouched = retouchLine(applied.retouch);
            if (applied.retouch.warning) notes.push(applied.retouch.warning);
          }
        }
      }
      if (!only) {
        saveAsset(a.out, finished);
        if (a.png) writePng(a.png, animated ? pngOf(finished, whole.frames) : renderFrame(finished, composite(finished, 0), a.scale ?? 1));
      }
      const written: Record<string, string> = {};
      if (layered) {
        // One layer is the whole: no files apart (unless asked for by name),
        // but the place file all the same, so the game can stand a piece of
        // furniture on a tile.
        const writing = only ?? (names.length > 1 ? names : []);
        for (const name of writing) {
          const path = `${stem}.${name}.pss.json`;
          const one = toAsset(layerFrames(name), `${id}_${name}`, `${animated ? id : model.name ?? model.id} (${name})`, path);
          saveAsset(path, one.asset);
          if (a.png) writePng(a.png.replace(/\.png$/i, '') + `.${name}.png`, pngOf(one.asset, one.frames));
          written[name] = path;
        }
        const pivots = loaded.map(l => JSON.stringify(l.model.pivot ?? null));
        if (new Set(pivots).size > 1) throw new Error('voxel: the frames have different pivots (one pivot for the whole animation)');
        const pivot = model.pivot ? voxelToScreen(img.origin, model.pivot) : undefined;
        const listed = only ?? names;
        const loose = looseAll.filter(n => listed.includes(n));
        writeGuarded(`${stem}.lugar.json`, JSON.stringify({
          id, width: img.width, height: img.height, origin: img.origin,
          ...(pivot ? { pivot } : {}),
          ...(animated ? { frames: paths.length, fps: a.fps ?? 8, strip: 'frame i at x = i * width in the PNG' } : {}),
          layers: listed, ...(loose.length ? { loose } : {}), light: model.light ?? 'upper_left',
          screen: 'x_px = origin[0] + x - y; y_px = origin[1] + (x + y) / 2 - z',
        }, null, 1) + '\n');
      }
      const boxes = loaded.reduce((n, l) => n + l.model.boxes.length, 0);
      const size = `${img.width}x${img.height} px`;
      const lines = [animated
        ? `voxel ${id}: ${paths.length} cuadros de ${size} (mismo lienzo; origen ${img.origin.join(',')}), ${boxes} cajas, ${whole.colors} colores → ${only ? 'sólo capas' : a.out}`
        : `voxel ${model.id}: ${size}, ${boxes} cajas, ${whole.colors} colores → ${only ? 'sólo capas' : a.out}`];
      if (retouched) lines.push(retouched + (Object.keys(written).length ? ' (sólo en el todo: las capas van sin retoque)' : ''));
      if (Object.keys(written).length) lines.push(`capas: ${Object.keys(written).join(', ')} (mismo lienzo; origen ${img.origin.join(',')})`);
      if (took.length && project) lines.push(inheritedLine(project.file, took));
      lines.push(...notes);
      return { data: { ...summarize(whole.asset), boxes, origin: img.origin, layers: written }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'anatomy',
    description: 'Store the body plan (neck, waist, knee, ankle rows; torso columns; limb boxes) on the asset so every animate call uses it.',
    details: 'Store the body plan on the asset (neck, waist, knee and ankle rows in pixels from the top; the torso columns; and, when the guess is still wrong, the box of each arm and each leg) so every "animate" call uses it. The columns matter as much as the rows: the engine takes whatever sticks out sideways of the torso for an arm, so a sword hilt over the shoulder or a gourd at the hip gets swung as if it were one, and the real sleeve, being inside the torso, never moves.',
    schema: z.object({
      path: pathArg,
      neckRow: z.number().int().optional(), waistRow: z.number().int().optional(),
      kneeRow: z.number().int().optional(), ankleRow: z.number().int().optional(),
      torsoLeft: z.number().int().optional().describe('first column of the torso; what is left of it is the arm'),
      torsoRight: z.number().int().optional().describe('last column of the torso; what is right of it is the arm'),
      torsoCenterCol: z.number().int().optional(),
      leftArmArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional().describe('{startR,endR,startC,endC}: the box this member lives in'),
      rightArmArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(),
      leftLegArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(),
      rightLegArea: z.object({ startR: z.number().int(), endR: z.number().int(), startC: z.number().int(), endC: z.number().int() }).optional(),
      clear: z.boolean().optional(),
    }),
    run: (a) => withAsset(a.path, asset => {
      if (a.clear) { delete asset.anatomy; return { anatomy: null }; }
      asset.anatomy = { ...(asset.anatomy ?? {}), mode: 'humanoid' };
      for (const k of ANATOMY_KEYS) if (a[k] !== undefined) (asset.anatomy as Record<string, unknown>)[k] = a[k];
      return { anatomy: asset.anatomy };
    }),
  }),
  define({
    name: 'pixelize',
    description: 'Turn any PNG into a one-frame pixel-art asset: grid sampling, flat background removed, colors quantized; fit= maps to a palette.',
    details: 'Turn any PNG (an AI render, a photo of a drawing) into a one-frame pixel-art asset: samples it on a square grid, removes a flat background (lime green or the dominant corner color) and quantizes the colors. "fit" maps the result onto another asset\'s palette afterwards.',
    schema: z.object({
      png: z.string(),
      out: pathArg,
      size: z.number().int().min(4).max(256).describe('output grid, e.g. 32'),
      id: z.string().optional(),
      name: z.string().optional(),
      max_colors: z.number().int().min(2).max(64).optional().describe('default 16'),
      alpha_threshold: z.number().int().min(0).max(255).optional(),
      remove_background: z.boolean().optional().describe('default true'),
      fit: pathArg.optional().describe('asset whose palette to fit the result to'),
      category: category.optional(),
      crop: z.boolean().optional().describe('crop to the figure before sampling (default true)'),
      speck_fraction: z.number().min(0).max(1).optional().describe('blobs under this fraction of the largest vanish (default 0.01)'),
    }),
    run: (a) => {
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      const asset = pixelize(readImage(a.png), {
        id, name: a.name, size: a.size, maxColors: a.max_colors, alphaThreshold: a.alpha_threshold,
        removeBackground: a.remove_background, category: a.category, crop: a.crop, speckFraction: a.speck_fraction,
      });
      let table: unknown = null;
      if (a.fit) table = fitPalette(asset, Object.values(loadAsset(a.fit).palette));
      asset.generatedBy = madeBy('pixelize', {
        png: relTo(a.out, a.png), size: a.size, max_colors: a.max_colors,
        fit: a.fit ? relTo(a.out, a.fit) : undefined,
      });
      saveAsset(a.out, asset);
      return { data: { fit: table, asset: summarize(asset) }, png: encodePng(renderFrame(asset, composite(asset, 0), 4)) };
    },
  }),
  define({
    name: 'illustrate',
    description: 'Turn a PNG into a full-bleed width x height illustration (cover crop around a focus, averaged cells, median cut, optional fit).',
    details: 'Turn a PNG into a full-bleed illustration of width x height (a card picture, a book plate): unlike pixelize nothing is cropped to the figure and no background is removed. The render is cut to the aspect around focus_x/focus_y ("cover"), every cell averages the pixels under it, colors are reduced with median cut, "fit" maps them onto a palette and "despeckle" passes clean lone pixels.',
    schema: z.object({
      png: z.string(),
      out: pathArg,
      width: z.number().int().min(4).max(512).describe("up to 512: a 320 x 180 battle backdrop fits"),
      height: z.number().int().min(4).max(512),
      id: z.string().optional(),
      name: z.string().optional(),
      max_colors: z.number().int().min(2).max(64).optional().describe('default 16'),
      focus_x: z.number().min(0).max(1).optional().describe('0 left … 1 right (default 0.5)'),
      focus_y: z.number().min(0).max(1).optional().describe('0 top … 1 bottom (default 0.5)'),
      fit: pathArg.optional().describe('asset whose palette to fit the result to'),
      despeckle: z.number().int().min(0).max(10).optional().describe('despeckle passes after fitting (default 0)'),
      sample: z.enum(['average', 'mode']).optional().describe('average (default) or mode: the color most pixels of the cell share'),
      outline: z.number().min(0).max(1).optional().describe('keep dark lines: a cell this dark-covered (0..1) takes the dark (default off)'),
      background: z.enum(['keep', 'flat']).optional().describe('flat: the background (border colors flooded inwards) becomes one color'),
      contour: z.string().optional().describe('hex: a 1 px contour around the subject, inside its edge'),
      background_tolerance: z.number().min(0).max(255).optional().describe('RGB distance that still counts as background (default 48)'),
      zoom: z.number().min(1).max(8).optional().describe('crop closer than cover around the focus: 1.5 keeps 2/3 of each side (default 1)'),
      accent: z.number().min(0).max(1).optional().describe('keep bright accents: a cell this vivid-covered (0..1) goes vivid (default off)'),
      quantize: z.enum(['median', 'palette']).optional().describe('median (default): median cut, then fit; palette: straight to the fit palette'),
      dither: z.number().min(0).max(1).optional().describe('ordered 4x4 dithering between the two nearest close colors, 0..1 (default off): in-between tones for a wide scene; use no despeckle with it'),
      dither_reach: z.number().min(0).max(1).optional().describe('OKLab distance under which two colors may dither (default 0.12)'),
      category: category.optional(),
      base: pathArg.optional().describe('earlier illustration of the same size: only cells inside the zone are redrawn'),
      ...zoneArgs,
    }),
    run: (a) => {
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      if (a.quantize === 'palette' && !a.fit) throw new Error('quantize=palette needs fit=<asset with the palette>');
      const zone = zoneSpec(a);
      if (a.base && !zone) throw new Error('base needs a zone: rect, polygon or mask');
      const source = readImage(a.png);
      const asset = illustrate(source, {
        id, name: a.name, width: a.width, height: a.height, maxColors: a.max_colors,
        focusX: a.focus_x, focusY: a.focus_y, category: a.category, sample: a.sample, outline: a.outline, background: a.background, contour: a.contour, backgroundTolerance: a.background_tolerance,
        accent: a.accent, zoom: a.zoom, dither: a.dither, ditherReach: a.dither_reach, palette: a.quantize === 'palette' ? Object.values(loadAsset(a.fit!).palette).filter(h => /^#?[0-9a-f]{6}/i.test(String(h))) : undefined,
      });
      let table: unknown = null;
      if (a.fit) table = fitPalette(asset, Object.values(loadAsset(a.fit).palette));
      let changed = 0;
      if (a.despeckle) {
        const f = getFrame(asset, 0, 0);
        for (let pass = 0; pass < a.despeckle; pass++) changed += despeckle(f, 1, 5);
        setFrame(asset, 0, f, 0);
      }
      let redrawn: number | null = null;
      if (a.base && zone) redrawn = mergeOutsideZone(asset, loadAsset(a.base), zone, source, { focusX: a.focus_x, focusY: a.focus_y, zoom: a.zoom });
      asset.generatedBy = madeBy('illustrate', {
        png: relTo(a.out, a.png), width: a.width, height: a.height, max_colors: a.max_colors,
        fit: a.fit ? relTo(a.out, a.fit) : undefined,
      });
      saveAsset(a.out, asset);
      return { data: { fit: table, despeckled: changed, redrawn, asset: summarize(asset) }, png: encodePng(renderFrame(asset, composite(asset, 0), 4)) };
    },
  }),
  define({
    name: 'generate',
    description: 'Ask fal.ai for an image from a prompt and save it as PNG (needs FAL_AI_KEY). Chain with pixelize or illustrate.',
    details: 'Ask fal.ai for an image from a prompt (the same pixel-art wrapper prompt the editor uses; "raw" sends the prompt untouched) and save it as PNG. Needs FAL_AI_KEY in the environment or in supabase/functions/.env. Chain with pixelize to get an asset.',
    schema: z.object({
      prompt: z.string().min(3),
      out: z.string().describe('PNG path'),
      image_url: z.string().url().optional().describe('reference image for image-to-image'),
      image: z.string().optional().describe('local PNG as image-to-image reference: fix a render with an instruction'),
      palette: z.array(z.string()).optional(),
      perspective: z.string().optional().describe('e.g. "top-down"'),
      raw: z.boolean().optional(),
      image_size: z.enum(['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9']).optional()
        .describe('fal image size (default square_hd); a landscape scene for a card picture'),
    }),
    run: async (a) => {
      const key = loadFalKey();
      const img = await generateImage({ prompt: a.prompt, imageUrl: a.image ? pngDataUri(readFileSync(a.image)) : a.image_url, palette: a.palette, perspective: a.perspective, raw: a.raw, imageSize: a.image_size }, key);
      mkdirSync(dirname(a.out), { recursive: true });
      writeGuarded(a.out, img.bytes);
      return { data: { out: resolve(a.out), model: img.model, prompt: img.prompt, bytes: img.bytes.length } };
    },
  }),
  define({
    name: 'edit_zone',
    description: 'Redo one zone of a render with the edit model and an instruction, blended back only inside the zone (needs FAL_AI_KEY).',
    details: 'Redo one zone of a render with the edit model and an instruction ("close this opening with rock and roots"): the zone (rect, polygon or mask, in fractions of the image) plus some context goes to the model, and its answer (PNG or JPEG) is blended back only inside the zone, with a soft edge; the rest stays byte for byte. Then illustrate the result with base=<the old illustration> and the same zone to redraw only those cells. Needs FAL_AI_KEY like generate.',
    schema: z.object({
      png: z.string().describe('the render to fix (PNG or JPEG)'),
      out: z.string().describe('PNG path for the fixed render'),
      prompt: z.string().min(3).optional().describe('what to put in the zone (not needed with from_answer)'),
      ...zoneArgs,
      feather: z.number().min(0).max(64).optional().describe('soft edge in pixels (default 1.5 % of the short side)'),
      context: z.number().min(0).max(4).optional().describe('picture around the zone the model sees, fraction of the zone (default 0.25; 4 = the whole picture)'),
      match: z.boolean().optional().describe('bring the answer to the grade of the picture outside the zone (default true): the model regrades everything'),
      changed: z.number().min(0).max(1).optional().describe('keep the base where the answer barely changed it (OKLab distance under this, fading in up to twice it; try 0.05): to add something to a sky without regrading the sky around it'),
      local: z.number().min(0).max(512).optional().describe('regrade the answer locally, radius in px: takes off the broad light drift the model adds to a sky, keeps what is small and new (pair with changed)'),
      haze: z.number().min(0).max(1).optional().describe('push what comes back into the distance: mix it with the picture under it by this much (0.5 = half shows through; default 0)'),
      from_answer: z.string().optional().describe('a model answer saved before (answer=): blend it again (another feather, match) without asking the model'),
      answer: z.string().optional().describe('also save the model answer as it came (brought to the size it was sent), to check it'),
    }),
    run: async (a) => {
      const zone = zoneSpec(a);
      if (!zone) throw new Error('edit_zone needs a zone: rect, polygon or mask');
      const opts = { feather: a.feather, context: a.context, match: a.match, changed: a.changed, haze: a.haze, local: a.local };
      if (a.from_answer) {
        const again = applyAnswer(readImage(a.png), zone, readImage(a.from_answer), opts);
        writePng(a.out, again.image);
        return { data: { out: resolve(a.out), model: null, sent: again.box } };
      }
      if (!a.prompt) throw new Error('edit_zone needs prompt (what to put in the zone)');
      const fixed = await editZone(readImage(a.png), zone, a.prompt, loadFalKey(), fetch, opts);
      writePng(a.out, fixed.image);
      if (a.answer) writePng(a.answer, fixed.patch);
      return { data: { out: resolve(a.out), model: fixed.model, sent: fixed.box } };
    },
  }),
  define({
    name: 'depth',
    description: 'A depth map of a render from a depth model on fal (light near, dark far), to feed layers. Needs FAL_AI_KEY.',
    details: 'A depth map of a render (PNG or JPEG) from a monocular depth model on fal: light is near, dark is far. Feed it to layers. Needs FAL_AI_KEY like generate.',
    schema: z.object({
      png: z.string(),
      out: z.string().describe('PNG path for the depth map'),
    }),
    run: async (a) => {
      const depth = await estimateDepth(readFileSync(a.png), loadFalKey());
      writePng(a.out, depth);
      return { data: { out: resolve(a.out), width: depth.width, height: depth.height } };
    },
  }),
  define({
    name: 'layers',
    description: 'Split a full-bleed illustration into far-to-near alpha layers for parallax, from the depth map of its render.',
    details: 'Split a full-bleed illustration (a battle backdrop) in depth layers for parallax, from a depth map of the render it came from (depth; light near) cut with the same focus and zoom illustrate used. outs lists the layer assets far to near; the farthest is opaque, each nearer one only has its cells (alpha elsewhere), and every layer is painted on a few cells under the nearer ones so sliding them apart opens no hole.',
    schema: z.object({
      path: pathArg.describe('the illustration'),
      depth: z.string().describe('depth map (PNG or JPEG) of the render the illustration came from'),
      outs: z.array(z.string()).min(2).max(6).describe('layer asset paths, far to near'),
      cuts: z.array(z.number().min(0).max(1)).optional().describe('normalized depth cuts, one less than outs (default evenly spaced)'),
      focus_x: z.number().min(0).max(1).optional(),
      focus_y: z.number().min(0).max(1).optional(),
      zoom: z.number().min(1).max(8).optional(),
      smooth: z.number().int().min(0).max(8).optional().describe('mode-filter passes over the layer map (default 2)'),
      fill: z.number().int().min(0).max(64).optional().describe('cells painted on under nearer layers (default 6; the farthest is filled whole)'),
      invert: z.boolean().optional().describe('dark is near'),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const { width, height } = dims(asset);
      const n = a.outs.length;
      const cuts = a.cuts ?? Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
      if (cuts.length !== n - 1) throw new Error(`${n} layers need ${n - 1} cuts, got ${cuts.length}`);
      const map = layerMap(readImage(a.depth), width, height, { cuts, focusX: a.focus_x, focusY: a.focus_y, zoom: a.zoom, smooth: a.smooth, invert: a.invert });
      const layers = splitLayers(asset, map, a.fill ?? 6);
      const share = Array.from({ length: n }, (_, k) => map.flat().filter(v => v === k).length / (width * height));
      a.outs.forEach((out, k) => {
        const layer = layers[k] ?? splitLayers(asset, map.map(r => r.map(() => 0)))[0];
        layer.id = basename(out).replace(/\.pss\.json$|\.json$/i, '');
        layer.generatedBy = madeBy('layers', { path: relTo(out, a.path), depth: relTo(out, a.depth), plane: k });
        saveAsset(out, layer);
      });
      return { data: { layers: a.outs.map((o, k) => ({ out: resolve(o), share: Math.round(share[k] * 1000) / 1000 })) } };
    },
  }),
  define({
    name: 'lights',
    description: 'Find the light sources a picture painted (center, color, glow radius) and write them as JSON next to it.',
    details: 'The light sources a picture painted (torches, lanterns, a glowing window): bright vivid cores, merged when close, with center (fraction and pixels), painted color and glow radius in pixels (where the light around falls back to the dark of the picture). Writes them as JSON next to the picture so a game lights its scene where the picture says.',
    schema: z.object({
      path: pathArg,
      out: z.string().describe('JSON path'),
      colors: z.array(z.string()).optional().describe('hex colors that are light (default: any bright vivid color)'),
      min_lightness: z.number().min(0).max(1).optional().describe('OKLab lightness of a light without colors (default 0.78)'),
      min_chroma: z.number().min(0).max(0.5).optional().describe('OKLab chroma of a light without colors (default 0.07)'),
      min_cells: z.number().int().min(1).optional().describe('smallest core (default 3)'),
      merge: z.number().min(0).optional().describe('cores whose boxes are this many pixels apart or less are one light (default 4)'),
      max_y: z.number().min(0).max(1).optional().describe('only look above this row fraction (default 1)'),
    }),
    run: (a) => {
      const found = paintedLights(loadAsset(a.path), { colors: a.colors, minLightness: a.min_lightness, minChroma: a.min_chroma, minCells: a.min_cells, merge: a.merge, maxY: a.max_y });
      mkdirSync(dirname(a.out), { recursive: true });
      writeGuarded(a.out, JSON.stringify(found, null, 2) + '\n');
      return { data: { out: resolve(a.out), lights: found.lights } };
    },
  }),
  define({
    name: 'cutout',
    description: 'Cut a moving piece (clouds, a flame) out of a still picture by zone and color filter; base_out is the picture with the hole filled.',
    details: 'Cut a moving piece out of a still picture (the clouds of a battle backdrop, a waterfall, a boat, the flame of a torch): the cells inside a zone (rect, polygon or mask, in fractions of the picture) whose color passes the filter (colors, lightness) go to out, transparent elsewhere; base_out is the picture with that hole painted over by the nearest uncut cell of the row or column, so the piece can drift a few pixels or blink without a copy of itself showing underneath. Chain several: each base_out is the next path.',
    schema: z.object({
      path: pathArg.describe('the picture'),
      out: z.string().describe('asset path for the piece'),
      base_out: z.string().optional().describe('asset path for the picture without the piece'),
      ...zoneArgs,
      colors: z.array(z.string()).optional().describe('only these hex colors are cut (default: every color in the zone)'),
      min_lightness: z.number().min(0).max(1).optional().describe('OKLab lightness a cut color needs at least'),
      max_lightness: z.number().min(0).max(1).optional().describe('OKLab lightness a cut color has at most'),
      grow: z.number().int().min(0).max(8).optional().describe('grow the cut this many pixels inside the zone (default 0)'),
      fill: z.enum(['row', 'column', 'none']).optional().describe('how base_out paints the hole (default row)'),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const { width, height } = dims(asset);
      const zone = zoneSpec(a);
      if (!zone) throw new Error('cutout needs a zone: rect, polygon or mask');
      const { piece, base, cells } = cutPiece(asset, zoneCoverage(zone, width, height), {
        colors: a.colors, minLightness: a.min_lightness, maxLightness: a.max_lightness, grow: a.grow, fill: a.fill,
      });
      piece.id = basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      piece.generatedBy = madeBy('cutout', { path: relTo(a.out, a.path) });
      saveAsset(a.out, piece);
      if (a.base_out) {
        base.id = basename(a.base_out).replace(/\.pss\.json$|\.json$/i, '');
        base.generatedBy = madeBy('cutout', { path: relTo(a.base_out, a.path), hole: true });
        saveAsset(a.base_out, base);
      }
      return { data: { out: resolve(a.out), base_out: a.base_out ? resolve(a.base_out) : undefined, cells, share: Math.round(cells / (width * height) * 1000) / 1000 } };
    },
  }),
  define({
    name: 'terrain',
    description: 'Paint a whole map ground from a grid of letters (one material per cell) with meandering borders; deterministic by seed.',
    details: 'Paint the whole ground of a map as one picture from a grid of letters (one material per cell), so borders meander instead of stepping cell by cell: each pixel takes the material that weighs most around it, sampled at a point moved by smooth noise (wobble). Materials have tones (dark to light) picked in wide patches with a dither only at the seams, a layer (water low, mud mid, grass high) that gives a cast rim under a higher bank, the bank face (lip) on its south side, an edge band (foam) and fringe blades over the line; depth picks a tone by distance to the shore; stamps drop pebbles or flowers away from the border; decals put a stamp at a fixed place (the stones of a ford); shadows (ellipses in cells) darken a tone. pieces writes sparse dashes over some materials to <out>_<id>.pss.json for a game to animate (glints, current). The recipe is a JSON file or inline object; deterministic by seed.',
    schema: z.object({
      recipe: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('recipe JSON path, or the recipe object: {cell, grid, materials, seed, wobble, wobble_scale, shadows, decals, shade, pieces}'),
      out: pathArg,
      fit: pathArg.optional().describe('palette asset every color must belong to; its color names are copied'),
      id: z.string().optional().describe('asset id (default: the out file name)'),
      preview: z.boolean().optional().describe('return the picture at 2x'),
    }),
    run: (a) => {
      const recipe = (typeof a.recipe === 'string' ? JSON.parse(readFileSync(a.recipe, 'utf8')) : a.recipe) as TerrainRecipe;
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      let names: Record<string, string> | undefined;
      let allowed: Set<string> | undefined;
      if (a.fit) {
        const pal = loadAsset(a.fit);
        names = {};
        allowed = new Set();
        for (const [k, hex] of Object.entries(pal.palette)) {
          const n = normalizeHex(hex);
          allowed.add(n.slice(0, 7));
          names[n] = pal.colorNames?.[Number(k)] ?? n;
        }
      }
      const result = paintTerrain(recipe, { id, names });
      const all = [result.asset, ...result.pieces.map(p => p.asset)];
      if (allowed) {
        for (const asset of all) for (const hex of Object.values(asset.palette)) {
          if (!allowed.has(normalizeHex(hex).slice(0, 7))) throw new Error(`terrain: ${hex} is not in ${basename(a.fit!)}`);
        }
      }
      const by = (carrier: string, piece?: string) => madeBy('terrain', {
        recipe: typeof a.recipe === 'string' ? relTo(carrier, a.recipe) : undefined,
        fit: a.fit ? relTo(carrier, a.fit) : undefined, piece,
      });
      result.asset.generatedBy = by(a.out);
      saveAsset(a.out, result.asset);
      const written: Record<string, number> = {};
      for (const p of result.pieces) {
        const path = a.out.replace(/\.pss\.json$/i, '') + `_${p.id}.pss.json`;
        p.asset.generatedBy = by(path, p.id);
        saveAsset(path, p.asset);
        written[resolve(path)] = p.cells;
      }
      const { width, height } = dims(result.asset);
      return {
        data: { out: resolve(a.out), size: [width, height], colors: Object.keys(result.asset.palette).length, share: result.share, pieces: written },
        png: a.preview ? encodePng(renderFrame(result.asset, composite(result.asset, 0), 2)) : undefined,
      };
    },
  }),
  define({
    name: 'from_ascii',
    description: 'Create or replace an asset from a text drawing (header, legend, frames); into= appends its frames to an asset. Inverse of to_ascii.',
    details: 'Create or replace an asset from a text drawing: a header (id, name, category, size, description, fit, anchor: x,y — the pixel that sits where the drawing is placed —, anim lines), a legend "glyph = #hex [name]" ("." transparent) and one or more frames, each after a "== <anim> <pos>" line. Rows of different length, unknown glyphs, sizes that do not match and (with fit) colors off the palette fail with the line. With "into", the frames and animations are appended to an existing asset instead (a pose drawn apart joins a character). A drawing that declares "base: protected" is a hand-made base someone else retouches: its <drawing>.retoque.txt, if there is one, is laid over it on a layer "retoque" ("!" takes a pixel out), so the retouch survives a change of the base; retouch=false leaves it out. The inverse of to_ascii.',
    schema: z.object({
      txt: z.string().optional().describe('text file path'),
      text: z.string().optional().describe('the text itself, instead of txt'),
      out: pathArg,
      fit: pathArg.optional().describe('asset whose palette every color must belong to (overrides the "fit:" header)'),
      id: z.string().optional().describe('when the header has none (default: the txt file name)'),
      into: pathArg.optional().describe('existing asset (same frame size) to append frames and animations to; writes out'),
      retouch: z.boolean().optional().describe('false: a "base: protected" drawing comes without its .retoque.txt'),
    }),
    run: (a) => {
      if (!a.txt && a.text === undefined) throw new Error('from_ascii needs txt or text');
      const text = a.text ?? readFileSync(a.txt!, 'utf8');
      const { asset: drawn, fit, layout } = fromAscii(text, {
        sourcePath: a.txt, defaultId: a.id ?? (a.txt ? undefined : basename(a.out).replace(/\.pss\.json$|\.json$/i, '')),
      });
      const fitPath = a.fit ?? fit;
      if (fitPath) {
        try {
          checkFit(drawn, Object.values(loadAsset(fitPath).palette), basename(fitPath), legendGlyphs(text));
        } catch (err) {
          throw new Error(`${a.txt ? basename(a.txt) : 'text'}: ${(err as Error).message}`);
        }
      }
      // A declared base comes with the hand that painted over it: its
      // .retoque.txt is laid on a layer of its own, on the base as it is today.
      const retouched = layout.base && a.txt && a.retouch !== false ? applyRetouch(drawn, a.txt, { base: true }) : { asset: drawn };
      const asset = retouched.asset;
      const result = a.into ? appendAsset(loadAsset(a.into), asset) : asset;
      saveAsset(a.out, result);
      return {
        data: { ...summarize(result), ...(retouched.retouch ? { retouch: retouchLine(retouched.retouch) } : {}) },
        png: encodePng(contactSheet(asset, { scale: 4 })),
      };
    },
  }),
  define({
    name: 'variant',
    description: 'Copy an asset to out with a new id and paint changes on a layer on top (overlay text drawing and/or ops); answers what it changes.',
    details: 'Make a variant of an asset without touching it: copy "path" to "out" with a new id, add a layer on top and paint the changes there — an "overlay" text drawing in the from_ascii format (every glyph but "." is laid over the base) and/or drawing "ops". The base layers are copied as they are, so after the base changes the same call rebuilds the variant. Returns how many pixels the variant paints, how many of those differ from the base, how many it takes out and what share of the drawing it decides.',
    schema: z.object({
      path: pathArg.describe('the base asset (read, never written)'),
      out: pathArg.describe('where the variant goes'),
      id: z.string().optional().describe('default: the out file name without .pss.json'),
      name: z.string().optional(),
      layer: z.string().optional().describe('name of the layer with the changes (default "variante")'),
      frame: z.number().int().nonnegative().optional().describe('first frame the overlay and ops land on (default 0)'),
      overlay: z.string().optional().describe('text file with the overlay drawing'),
      overlay_text: z.string().optional().describe('the overlay drawing itself, instead of overlay'),
      ops: z.array(drawOpSchema).optional(),
      fit: pathArg.optional().describe('asset whose palette every overlay color must belong to'),
    }),
    run: (a) => {
      if (resolve(a.path) === resolve(a.out)) throw new Error('variant: out must be a different file from path (the base is never overwritten)');
      if (!a.overlay && a.overlay_text === undefined && !a.ops?.length) throw new Error('variant needs overlay, overlay_text or ops');
      const overlay = a.overlay_text ?? (a.overlay ? readFileSync(a.overlay, 'utf8') : undefined);
      if (overlay !== undefined && a.fit) {
        const { asset: over } = fromAscii(overlay, { sourcePath: a.overlay });
        try {
          checkFit(over, Object.values(loadAsset(a.fit).palette), basename(a.fit), legendGlyphs(overlay));
        } catch (err) {
          throw new Error(`${a.overlay ? basename(a.overlay) : 'overlay'}: ${(err as Error).message}`);
        }
      }
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      const { asset, painted, changed, erased, share } = makeVariant(loadAsset(a.path), {
        id, name: a.name, layer: a.layer, frame: a.frame, ops: a.ops as DrawOp[] | undefined,
        overlay, overlaySource: a.overlay,
      });
      asset.generatedBy = madeBy('variant', {
        path: relTo(a.out, a.path), overlay: a.overlay ? relTo(a.out, a.overlay) : undefined,
      });
      saveAsset(a.out, asset);
      return {
        data: { painted, changed, erased, share: Math.round(share * 100) / 100, asset: summarize(asset) },
        png: encodePng(contactSheet(asset, { scale: 4 })),
      };
    },
  }),
  define({
    name: 'stamp',
    description: 'Stamp a directional drawing (one frame per view) over every frame of a character, following the head; answers what it painted.',
    details: 'Stamp a directional drawing over a character built elsewhere: a garment on a borrowed body. The drawing (from_ascii format, the size of the sprite) holds one frame per view, each after its own "== <view>" line, where "." leaves what was already there; every frame of every animation of that view gets it, shifted with the head (the first row of the frame with any pixel) so it follows the bob of the walk. At 16 px this is what tells apart three characters that share a body from a pack. The naming convention is a parameter: "anims" picks which animations a view covers and "anchor" the one whose first frame sets the reference head. Returns, per view, the animations it reached and how many frames and pixels it painted.',
    schema: z.object({
      path: pathArg.describe('the character, stamped in place'),
      txt: z.string().optional().describe('text file with the drawing'),
      text: z.string().optional().describe('the drawing itself, instead of txt'),
      fit: pathArg.optional().describe('asset whose palette every color of the drawing must belong to'),
      anims: z.string().optional().describe('animations a view covers, "*" = anything (default "*_{view}")'),
      anchor: z.string().optional().describe('animation whose first frame sets the reference head (default "idle_{view}")'),
      align: z.enum(['head', 'none']).optional().describe('"head" (default): follow the head of each frame; "none": never shift'),
      layer: z.number().int().nonnegative().optional().describe('layer the stamp is painted on (default 0, the base)'),
      preview: z.boolean().optional().describe('return the contact sheet of the stamped character'),
    }),
    run: (a) => {
      if (!a.txt && a.text === undefined) throw new Error('stamp needs txt or text');
      const text = a.text ?? readFileSync(a.txt!, 'utf8');
      const { asset: drawing, fit } = fromAscii(text, { sourcePath: a.txt, defaultId: 'stamp' });
      const fitPath = a.fit ?? fit;
      if (fitPath) {
        try {
          checkFit(drawing, Object.values(loadAsset(fitPath).palette), basename(fitPath), legendGlyphs(text));
        } catch (err) {
          throw new Error(`${a.txt ? basename(a.txt) : 'text'}: ${(err as Error).message}`);
        }
      }
      if ((drawing.animations ?? []).length === 0) {
        throw new Error(`${a.txt ? basename(a.txt) : 'the drawing'} has no "== <view>" animation: a stamp needs one frame per view`);
      }
      const asset = loadAsset(a.path);
      const result = stampDrawing(asset, {
        drawing, anims: a.anims, anchor: a.anchor, align: a.align, layer: a.layer,
      });
      saveAsset(a.path, asset);
      return {
        data: result,
        png: a.preview ? encodePng(contactSheet(asset, { scale: 4 })) : undefined,
      };
    },
  }),
  define({
    name: 'face_points',
    description: 'Find the eyes, hairline and skin of a sprite frame by frame, for things that must land on a moving head. Draws nothing.',
    details: 'Find the face on a sprite nobody drew for you, frame by frame: the eyes (ink with skin on both sides, two facing the camera and one in profile), the hairline (hair with the shade of the forehead under it, with how many rows of hair sit above that shade) and the skin (every pixel of it and its box, so what is painted stays off the outline). The colors are parameters, the view of each frame comes from the animations ("anims", "*_{view}" by default), and nothing is drawn — it is what a moustache, a headband, glasses, a scar or a tear need in order to land on a head that bobs with the walk and turns with the direction.',
    schema: z.object({
      path: pathArg,
      skin: z.array(z.string()).optional().describe('skin colors, lit and shaded; with "ink", the eyes and the skin box are reported'),
      ink: z.array(z.string()).optional().describe('outline / eye colors'),
      hair: z.array(z.string()).optional().describe('hair colors; with "forehead", the hairline is reported'),
      forehead: z.array(z.string()).optional().describe('the shade of the forehead right under the hairline'),
      anims: z.string().optional().describe('animations a view covers, "*" being anything (default "*_{view}")'),
      views: z.array(z.string()).optional().describe('views looked for, in order (default down, up, left, right)'),
      table: z.boolean().optional().describe('one line per frame for a terminal, instead of JSON'),
    }),
    run: (a) => {
      const result = facePoints(loadAsset(a.path), a);
      return { data: result, text: a.table ? facePointsTable(result) : undefined };
    },
  }),
  define({
    name: 'to_ascii',
    description: 'Write an asset as a from_ascii text drawing (exact round trip); generated_by=false makes it the hand-drawn source.',
    details: 'Write an asset in the from_ascii text format (header, legend, every frame with its animation slots), so it can be edited as text and rebuilt exactly. Multi-layer assets are flattened. "glyphs_from" gives each color the glyph of its index in another palette, so files on the same palette share glyphs. Whatever the asset says made it travels along in the "generated_by:" header; pass generated_by=false to drop it, which is how a drawing a command made becomes the hand-drawn source of itself (no header means drawn by hand, and from then on a recipe will not write over it). It never writes over a drawing that declares "base: protected" (a hand-made base someone retouches: the retouch goes to its .retoque.txt) unless force=true; no command does.',
    schema: z.object({
      path: pathArg,
      out: z.string().optional().describe('text file to write; when omitted the text is only returned'),
      glyphs_from: pathArg.optional().describe('asset whose palette indices pick the glyphs'),
      generated_by: z.boolean().optional().describe('false: no "generated_by:" header, so the drawing counts as hand-drawn'),
      force: z.boolean().optional().describe('write out even if it declares "base: protected"'),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      if (a.generated_by === false) delete asset.generatedBy;
      const { text, flattened } = toAscii(asset, { glyphPalette: a.glyphs_from ? loadAsset(a.glyphs_from).palette : undefined });
      if (a.out) writeGuarded(a.out, text, a.force);
      return { data: { out: a.out ? resolve(a.out) : null, flattened }, text: a.out ? undefined : text };
    },
  }),
  define({
    name: 'contact',
    description: 'Control sheet: assets side by side at a scale on a background and a grid, named, next to a reference sprite. Returns the PNG.',
    details: 'Control sheet: several assets side by side at an integer scale on a background color (semi-transparent pixels composited over it, or added with blend=add for lights), over a grid of N px anchored at their feet, each named underneath and with a reference asset (the player) standing next to it to compare sizes. Returns the PNG.',
    schema: z.object({
      paths: z.array(z.string()).min(1).describe('asset JSON paths'),
      ref: pathArg.optional().describe('reference asset shown next to each one'),
      ref_frame: z.number().int().nonnegative().optional(),
      frame: z.union([z.number().int().nonnegative(), z.literal('fullest')]).optional()
        .describe('frame of each asset (default 0), or "fullest": its most painted frame'),
      scale: z.number().int().positive().optional().describe('default 4'),
      background: z.string().optional().describe('hex (default #a6c778, grass)'),
      grid: z.number().int().nonnegative().optional().describe('grid every N asset px (default 16, 0 = none)'),
      columns: z.number().int().positive().optional().describe('assets per row (default up to 8)'),
      blend: z.enum(['over', 'add']).optional().describe('over (default): composite as in a game; add: sum (a light halo, on dark)'),
      out: z.string().optional().describe('PNG path; when omitted the image is only returned'),
    }),
    run: (a) => {
      const items = a.paths.map(p => {
        const asset = loadAsset(p);
        const frame = a.frame === 'fullest' ? fullestFrame(asset) : Math.min(a.frame ?? 0, frameCount(asset) - 1);
        return { asset, frame };
      });
      const img = contactSheetMany(items, {
        scale: a.scale, background: a.background, grid: a.grid, columns: a.columns, blend: a.blend,
        reference: a.ref ? { asset: loadAsset(a.ref), frame: a.ref_frame } : undefined,
      });
      const png = encodePng(img);
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeGuarded(a.out, png); }
      return { data: { out: a.out ? resolve(a.out) : null, assets: items.length, width: img.width, height: img.height }, png };
    },
  }),
  define({
    name: 'lint',
    description: 'Check assets without changing them: off-palette colors, tile sides off grid, tile lone pixels, detached pieces, missing contract animations, tile seams.',
    details: 'Check one or more assets without changing them: colors off a palette; on a tile ("tile", "tiles" or category terrain) sides that are not a multiple of "grid" and lone pixels (the despeckle rule, as a report; on a sprite only with "lone": its lone pixels are mostly drawn on purpose, and it keeps its own size); with "pieces" detached pieces (a group of pixels that does not touch the body in a frame: a crown split off by a transparent row), with "contract" the animations an animation contract asks for that the asset has not got (or has empty; extras are fine) and, for tiles, left/right and top/bottom edges that do not meet when repeated (or leave transparent gaps). Left out, palette, contract and proportions come from the nearest pgs.json of each asset (visual.palette, visual.contract, visual.proportions) and the answer says what it took and from where; an inherited contract skips tiles and assets with no animation at all (contract_ids= names them in). What is passed wins.',
    schema: z.object({
      paths: z.array(z.string()).min(1),
      contract: contractArg.optional().describe('the animation contract to keep (default: visual.contract of pgs.json)'),
      contract_ids: z.array(z.string()).optional().describe('asset ids (or paths) the contract applies to (default: all of them)'),
      palette: pathArg.optional().describe('asset whose palette is the allowed set (default: visual.palette of pgs.json)'),
      colors: z.array(z.string()).optional().describe('allowed hex colors, instead of (or added to) palette'),
      grid: z.number().int().positive().optional(),
      tile: z.boolean().optional().describe('check seams on every asset'),
      tiles: z.array(z.string()).optional().describe('asset ids (or paths) to check as tiles'),
      pieces: z.union([z.boolean(), z.number().int().min(1)]).optional()
        .describe('report detached pieces of at least this many px (true = 4) on every asset'),
      lone: z.boolean().optional().describe('lone pixels on sprites too (always on tiles)'),
      pieces_ids: z.array(z.string()).optional().describe('asset ids (or paths) to check for detached pieces'),
      strength: z.number().int().min(1).max(3).optional(),
      majority: z.number().int().min(3).max(8).optional(),
      proportions: proportionsArg.optional(),
      proportions_ids: z.array(z.string()).optional().describe('asset ids (or paths) the proportion map applies to (default: all of them)'),
    }),
    run: (a) => {
      let explicitPalette: string[] | undefined = a.colors;
      if (a.palette) explicitPalette = (explicitPalette ?? []).concat(Object.values(loadAsset(a.palette).palette));
      const paletteGiven = a.palette !== undefined || a.colors !== undefined;
      const tiles = new Set(a.tiles ?? []);
      const contract = a.contract !== undefined ? readContract(a.contract, BODY_CONTRACT) : undefined;
      // What is not passed comes from the nearest pgs.json of each asset, and
      // the answer says what and from where (#26).
      const worlds = new Map<string, LintWorld>();
      const inherited = new Map<string, Set<string>>();
      const took = (file: string, what: string) => {
        if (!inherited.has(file)) inherited.set(file, new Set());
        inherited.get(file)!.add(what);
      };
      const unlooked = new Map<string, string[]>();
      const reports = a.paths.map(p => {
        const asset = loadAsset(p);
        const listed = a.contract_ids?.some(id => id === asset.id || id === p);
        const onIt = !a.contract_ids || !!listed;
        const sized = dims(asset);
        const onMap = !a.proportions_ids || a.proportions_ids.some(id => id === asset.id || id === p);
        const prop = onMap ? readProportions(p, a.proportions, sized) : {};
        if (prop.project) took(prop.project, `proporciones${prop.variant ? ` (${prop.variant})` : ''}`);
        const tileLike = !!a.tile || tiles.has(asset.id) || tiles.has(p) || asset.category === 'terrain';
        const world = paletteGiven && contract ? undefined : lintWorld(p, worlds);
        let palette = explicitPalette;
        if (!paletteGiven && world?.palette) { palette = world.palette; took(world.file, 'paleta'); }
        let assetContract = onIt ? contract : undefined;
        if (!contract && world?.contract && onIt) {
          // An inherited contract is for characters: a tile, or a still with
          // no animation at all (a prop, a portrait), is left out and said so.
          // contract_ids= puts one in by name.
          const still = !(asset.animations ?? []).length;
          if (!listed && (tileLike || still)) {
            const why = tileLike ? 'tiles' : 'sin animaciones';
            unlooked.set(why, [...(unlooked.get(why) ?? []), asset.id]);
          } else {
            assetContract = world.contract;
            took(world.file, `contrato (${world.contract.id ?? 'contract'})`);
          }
        }
        return lintAsset(asset, {
          palette, grid: a.grid, strength: a.strength, majority: a.majority, lone: a.lone,
          proportions: prop.map,
          contract: assetContract,
          tile: a.tile || tiles.has(asset.id) || tiles.has(p),
          pieces: a.pieces || ((a.pieces_ids ?? []).some(id => id === asset.id || id === p) ? true : undefined),
        });
      });
      const bad = reports.filter(r => r.warnings.length);
      const lines = reports.map(r => r.warnings.length
        ? `✗ ${r.id} (${r.width}x${r.height})\n${r.warnings.map(w => `    ${w}`).join('\n')}`
        : `✓ ${r.id} (${r.width}x${r.height})`);
      // What the proportion map did NOT look at, and why: a profile whose
      // widths were never measured must not read as a clean profile.
      const skipped = new Map<string, string>();
      for (const r of reports) {
        for (const p of r.proportions ?? []) for (const s2 of p.report.skipped) skipped.set(`${s2.what}: ${s2.why}`, '');
      }
      if (inherited.size) lines.push('', ...[...inherited].map(([file, what]) => inheritedLine(file, [...what])));
      for (const [why, ids] of unlooked) lines.push(`  · contrato sin mirar en ${why === 'tiles' ? 'los tiles' : 'los que no tienen animaciones'}: ${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ` y ${ids.length - 4} más` : ''} (contract_ids= para incluirlos)`);
      for (const k of skipped.keys()) lines.push(`  · sin mirar ${k}`);
      lines.push('', `${reports.length - bad.length}/${reports.length} clean`);
      return { data: { clean: reports.length - bad.length, total: reports.length, reports }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'map_lint',
    description: 'Lint a painted map ground PNG against the map style rules (alpha, palette, straight borders, repeated cells, blur). Answers the problems.',
    details: 'Check a painted map ground (a PNG) against the map style rules, without changing it: alpha only 0 or 255 and no holes inside the map, colors on a palette, no border between two materials running straight along a row or column for more than max_straight px (skipped with architecture: walls and terraces are straight), no more than a third of the cells identical to their neighbours, and no blurred border (lone pixels of a material inside another over max_loose of the material changes; a one-pixel diagonal is a line). Materials are named groups of hex colors; any other color is an accent and takes its left neighbour\'s material. ground=false checks a layer (only alpha and palette).',
    schema: z.object({
      png: z.string().optional().describe('the painted ground (PNG)'),
      recipe: z.string().optional().describe('a map recipe instead of png: renders it and checks the ground and every layer'),
      variant: z.string().optional().describe('with recipe: one of its variants'),
      area: z.array(z.number().int()).length(4).optional().describe('the map inside the picture [x, y, w, h] in px (default: all of it)'),
      palette: pathArg.optional().describe('asset whose palette is the allowed set'),
      colors: z.array(z.string()).optional().describe('allowed hex colors, instead of (or added to) palette'),
      materials: z.union([z.string(), z.record(z.string(), z.array(z.string()))]).optional()
        .describe('material name → hex colors, or a JSON path with that object'),
      ground: z.boolean().optional().describe('a ground (default) or a layer'),
      architecture: z.boolean().optional().describe('straight borders are fine'),
      cell: z.number().int().positive().optional(),
      max_straight: z.number().int().positive().optional(),
      max_loose: z.number().min(0).max(1).optional(),
    }),
    run: (a) => {
      if (a.recipe) return lintRecipe(a.recipe, a.variant);
      if (!a.png) throw new Error('map_lint: png or recipe');
      let palette: string[] | undefined = a.colors;
      if (a.palette) palette = (palette ?? []).concat(Object.values(loadAsset(a.palette).palette));
      const materials = typeof a.materials === 'string'
        ? JSON.parse(readFileSync(a.materials, 'utf8')) as Record<string, string[]> : a.materials;
      const area = a.area ? { x: a.area[0], y: a.area[1], w: a.area[2], h: a.area[3] } : undefined;
      const r = mapLint(readImage(a.png!), {
        area, palette, materials, ground: a.ground, architecture: a.architecture, cell: a.cell,
        maxStraight: a.max_straight, maxLoose: a.max_loose,
      });
      const head = r.problems.length ? `✗ ${basename(a.png!)}` : `✓ ${basename(a.png!)}`;
      const tail = `    ${r.loose} lone px in ${r.changes} material changes`;
      return { data: r, text: [head, ...r.problems.map(p => `    ${p}`), tail].join('\n') };
    },
  }),
  define({
    name: 'grid_mask',
    description: 'Turn a grid of cell letters into a per-pixel organic shape (round corners, meandering borders) and write it to out.',
    details: 'The organic autotile: turn a grid of cells (one letter per cell: wall, floor, water…) into a per-pixel shape, one letter per pixel, for a drawing script to paint, so the grid does not show. Each pixel takes the letter that weighs most in a window of round px around a point moved by smooth noise (wobble): corners come out cut round and borders meander. keep {letter: inset px} guarantees the middle of every cell of that letter (a one-cell corridor never closes); clean passes remove lone pixels and one-pixel bites, so the border is a line and never a dither. Deterministic by seed; writes {width, height, rows} to out.',
    schema: z.object({
      grid: z.union([z.string(), z.array(z.string())]).describe('rows of cells (one letter per cell), or a JSON path with that array or {grid}'),
      cell: z.number().int().positive().optional(),
      round: z.number().int().positive().optional().describe('window radius px (default cell/3)'),
      wobble: z.number().min(0).optional().describe('how far borders wander, px (default 3)'),
      wobble_scale: z.number().positive().optional().describe('size of a bump, px (default 9)'),
      seed: z.number().int().optional(),
      keep: z.record(z.string(), z.number().int().nonnegative()).optional().describe('letter → inset px kept in each of its cells'),
      clean: z.number().int().nonnegative().optional().describe('cleaning passes (default 2)'),
      out: z.string().optional().describe('JSON path for {width, height, rows}'),
    }),
    run: (a) => {
      let grid: string[];
      if (typeof a.grid === 'string') {
        const raw = JSON.parse(readFileSync(a.grid, 'utf8')) as string[] | { grid: string[] };
        grid = Array.isArray(raw) ? raw : raw.grid;
      } else grid = a.grid;
      const m = gridMask({ grid, cell: a.cell, round: a.round, wobble: a.wobble, wobble_scale: a.wobble_scale,
        seed: a.seed, keep: a.keep, clean: a.clean });
      if (a.out) {
        mkdirSync(dirname(resolve(a.out)), { recursive: true });
        writeGuarded(a.out, JSON.stringify(m));
      }
      const text = `grid_mask ${m.width}x${m.height} from ${grid[0].length}x${grid.length} cells${a.out ? ` -> ${basename(a.out)}` : ''}`;
      return { data: a.out ? { width: m.width, height: m.height } : m, text };
    },
  }),
  define({
    name: 'map_from_game',
    description: 'Start or refresh a map recipe from the game\'s map JSON (grid, decor, palette, light); answers the grid as text. See docs/map_recipes.md.',
    details: 'Start (or refresh) a map recipe from the game\'s map JSON: the grid (width, height, "." walkable, "#" wall, "D" decor, "E" exit), the decor with size and shadow from the visuals JSON, the margin painted around it, the palette of color names and the light. Materials and steps already in the recipe are kept. Answers the grid as text, to plan where paths and areas go (cells, (0,0) top-left).',
    schema: z.object({
      game: z.string().describe('the game map JSON (data/world/<map>.json)'),
      out: z.string().describe('the recipe JSON to write'),
      visuals: z.string().optional().describe('the game visuals JSON (decor sizes and shadows)'),
      palette: pathArg.optional().describe('palette asset with the color names'),
      margin: z.tuple([z.number().int(), z.number().int()]).optional(),
      cell: z.number().int().positive().optional(),
      seed: z.number().int().optional(),
      light: z.tuple([z.number(), z.number()]).optional().describe('where shadows fall (default [1, 1])'),
      id: z.string().optional().describe('export id (default: the map file name)'),
    }),
    run: (a) => {
      const g = gameGrid(a.game, a.visuals);
      const rel = (p?: string) => (p ? relative(dirname(resolve(a.out)), resolve(p)) || '.' : undefined);
      let prev: Partial<MapRecipe> = {};
      try { prev = readRecipe(a.out); } catch { /* a new recipe */ }
      // A new recipe in a world that says where its light comes from is left
      // without a light of its own, so it takes the world's every time it is
      // painted (renderRecipe) instead of a copy that goes stale (#26).
      const world = a.light === undefined && prev.light === undefined ? nearestProject(a.out) : undefined;
      const worldDir = world ? worldLight(world.style) : {};
      const recipe: MapRecipe = {
        ...prev,
        game: rel(a.game)!,
        visuals: rel(a.visuals) ?? prev.visuals,
        palette: rel(a.palette) ?? prev.palette,
        cell: a.cell ?? prev.cell ?? 16,
        margin: a.margin ?? prev.margin ?? [0, 0],
        seed: a.seed ?? prev.seed ?? 0,
        light: a.light ?? prev.light ?? (worldDir.dir ? undefined : [1, 1]),
        materials: prev.materials ?? {},
        steps: prev.steps ?? [],
        export: prev.export ?? { id: a.id ?? basename(a.game).replace(/\.json$/i, '') },
      };
      writeRecipe(a.out, recipe);
      const head = `${basename(a.out)}: ${g.width}x${g.height} cells, margin ${recipe.margin!.join('x')}, ${g.decor?.length ?? 0} decor, ${recipe.steps.length} steps`;
      const cols = '    ' + Array.from({ length: g.width }, (_, u) => String(u % 10)).join('');
      const lightLine = world && worldDir.dir ? [inheritedLine(world.file, [`luz ${worldDir.from} (la receta no la declara: la toma al pintarse)`])] : [];
      const text = [head, ...lightLine, cols, ...g.grid.map((r, v) => String(v).padStart(3) + ' ' + r)].join('\n');
      return { data: { out: resolve(a.out), width: g.width, height: g.height, decor: g.decor?.length ?? 0, steps: recipe.steps.length }, text };
    },
  }),
  define({
    name: 'map_material',
    description: 'Add or replace a material of a map recipe: a ramp of palette names dark to light and a texture.',
    details: 'Add or replace a material of a map recipe: a ramp of palette color names from dark to light and a texture (patches: grass or snow, light patches along the light; mottled: earth; canopy: forest crowns; grain: stone, 8 tones ink to highlight, with moss; slabs: laid stones; flat; water: [deep, mid, shallow, foam, glint]). shade_max and shade_min bound what a shadow does to it.',
    schema: materialSchema.extend({ recipe: z.string().describe('the recipe JSON'), name: z.string() }),
    run: (a) => {
      const { recipe: path, name, ...m } = a;
      const recipe = readRecipe(path);
      recipe.materials[name] = materialSchema.parse(m);
      writeRecipe(path, recipe);
      return { data: { recipe: resolve(path), material: name, tones: m.ramp.length, materials: Object.keys(recipe.materials).length } };
    },
  }),
  ...([
    ['map_area', areaStep, 'Add or replace (by id) an area step: paint a material on a shape (all, blobs, grid cells, rect, outside edge, poke); face= raises it.', 'Add or replace (by id) an area step of a map recipe: paint a material on a shape (all; blobs [u, v, rx, ry, wobble] in cells; cells of the game grid through grid_mask; rect; outside of the map, a forest edge on sides "lrtb"; poke: crowns poking in from an outside area, on another layer like "front"). face: N px raises it (a south face, moss on the lit lip, holes at its foot).'],
    ['map_path', pathStep, 'Add or replace (by id) a path step: a ribbon through points whose width breathes, with banks, ruts, tufts and stairs.', 'Add or replace (by id) a path step of a map recipe: a Catmull-Rom ribbon through points in cells whose half width breathes (width [px, breathing px], widen where people open up), clearings and side tongues that reach what matters, the bank shadow on the light side and a lit lip on the far grass, ruts, tufts creeping in, and stone stairs where it climbs.'],
    ['map_water', waterStep, 'Add or replace (by id) a water step on a shape: depth bands, banks and reflection, foam, waves and glints on their layer.', 'Add or replace (by id) a water step of a map recipe: on a shape, bands by distance to the shore (shallow, mid, deep in long streaks), the high bank face and its dark reflection, broken foam on the low shore, waves, and glints on a layer the game animates.'],
    ['map_light', lightStep, 'Add a light step: the shadows cast by decor, landmarks, outside edges and raised faces, one step down each ramp.', 'Add a light step to a map recipe: shadows cast down-light by the decor and landmarks of the game (a scalloped crown and a trunk stripe for tall things, a small one for low things with a shadow), by the edge of outside areas and by the faces of raised areas (long, deeper at the foot), one step down each material ramp, cleaned so they are drawn shapes. crowns: a grove tree casts a round soft shadow at its foot, two tones deep in its core.'],
    ['map_scatter', scatterStep, 'Add a scatter step: tufts, flowers, pebbles, dew, boulders or stamps (rows of glyphs or draw= a text drawing) by rules.', 'Add a scatter step to a map recipe: tufts (tips on a layer that sways), flowers in groups, pebbles (more in the clearings of a path), dew (dots on a layer that twinkles), boulders at fixed places, or a stamp at fixed places (rows of glyphs, or draw= a text drawing in a file of its own, whose every color must be in the palette of the recipe); by tries, spacing, near or far from materials, only on some materials, never on walkable cells with walkable: false.'],
    ['map_cliff', cliffStep, 'Add or replace (by id) a cliff step: the map ends at a plateau lip over a sea of mist with far peaks.', 'Add or replace (by id) a cliff step of a map recipe: the map ends at the lip of a plateau (on the left); beyond it, far below, a sea of mist and clouds with far peaks rising from it (pines on top, clouds at their feet), the rock face falling from the lip with cracks and lit edges, grass hanging over the lip and loose stones on it.'],
    ['map_brink', brinkStep, 'Add or replace (by id) a brink: the south edge of a sky island (lip, slab rock face, hanging grass, haze, waterfalls).', 'Add or replace (by id) a brink: the south edge of an island in the sky. The ground ends at a wavy lip; under it the rock face falls in vertical slabs lit from the left, dark at the foot, with grass hanging over the lip in curtains; past the foot the haze far below (a cloudbanks step with within paints the same sky there again), clouds hiding the foot, and waterfalls pouring over the lip into them, their streaks on a layer that flows. skip leaves a stairway painted before alone.'],
    ['map_flight', flightStep, 'Add or replace (by id) a flight of stone steps: down, climb (worn), or edge (the stair of a brink).', 'Add or replace (by id) a flight of stone steps: down (treads stacked from the top of the picture to a row, between two low walls, grass at the foot of each) or climb (treads side by side rising to the right, between two walls, cut into a forest and darker in its shade). worn: the climb as stone with weight: lit noses, the flank in shadow under the treads climbing in steps, a low wall, its shadow, worn stones and moss. edge: the stair of a brink, born on a cell of the brow and going up or down by the face in short flights with landings and breaks, rock at both sides, lost in mist or rock, never over the grass.'],
    ['map_feature', featureStep, 'Add or replace (by id) a carved thing on the ground: dais, slab, roots, ring, frost or ash.', 'Add or replace (by id) a carved thing on the ground: dais (a round stone platform with a south face, lit lip, carved ring, the eight trigrams and a carved center, and a shadow that changes the material it lands on; as a bagua: octagon, its own eight trigrams and a yin-yang), slab (an old stone with cut corners, a crack and moss on the lit corner), roots (from the foot of a trunk into the earth), ring (a forgotten formation: flat mossy stones in a ring with a worn groove), frost (a broken band of frost around something) or ash (the ash of a fire).'],
    ['map_network', networkStep, 'Add or replace (by id) a net of trodden earth (roads and squares of a village) as one piece, with banks and ruts.', 'Add or replace (by id) a net of trodden earth (the roads and squares of a village) as one piece: roads through points in cells whose half width breathes, organic blobs added and cut (islands of grass), cleaned once, courts counted as earth; trodden and darker near the road centers with broken ruts, dry dust away from them; the bank shadow on the light side, a lit lip on the grass across and tufts creeping in.'],
    ['map_rope', ropeStep, 'Add or replace (by id) a sagging rope across the map, in front of people, with lanterns or flags hanging from it.', 'Add or replace (by id) a rope tied across the map on a layer in front of people, sagging in the middle, with things hanging from it (lanterns, flags) as rows of glyphs.'],
    ['map_wall', wallStep, 'Add or replace (by id) a straight wall of a room in a px rect: face on or from above, windows, doors, its shadow.', 'Add or replace (by id) a straight wall of a room in a rect of px: seen face on (a back wall: bands from the top, plaster lit and in shade, a wainscot of boards, lattice windows with paper lit from behind and lacquered columns) or from above (a side or front wall: the beam across); doors cut it and get a stone sill (with the day outside on a layer), and it casts its shadow on the floor along it. layer: the wall goes on that layer over people (a beam or a lintel on "techos") and its shadow stays on the floor.'],
    ['map_furnish', furnishStep, 'Add or replace (by id) what room furniture leaves on the floor: rug or short shadows at the foot of the decor.', 'Add or replace (by id) what the furniture of a room leaves on the floor: rug (a reed mat with rounded corners and a cloth border under each table) or shadows (short cold shadows at the foot of the decor; under the light of the recipe, a sun or a lamp, thrown by it into the one mask; without it down-right, stacking, by shape).'],
    ['map_glow', glowStep, 'Add or replace (by id) a light that brightens the floor: a pool, a door fan or a polygon, toned per material.', 'Add or replace (by id) a light that brightens the floor it covers (a lamp, the fan of an open door, the patch of a window): a pool around at (r: [core, edge] px), a fan from at (fan: [dx, dy, aperture°, width px at the opening]) or a polygon of cells; tones steps lighter at the core, fewer out to the edge of r, and fading in over edge px from the sides of a fan or polygon; every ring and side bitten inward by smooth noise (fray), never a ruled line, never a px past the shape. A lit px climbs the ramp ramps names for its material (a material name or a list of colors: its tone there is its tone on its own ramp plus the light; repeat a color to make a material take the light slower; even: tones over the base light as the base, so a ring is one color and only the darker marks, joints and cracks, show through), else the recipe lighten table. on: only those materials; layer: the lit colors go to that layer (a light the game switches on with when) over the finished ground, shadows included. Without layer it lightens the ground where it runs: shadows laid after it still darken it.'],
    ['map_thicket', thicketStep, 'Add or replace (by id) a thicket: wall cells as dark thicket around a walkable floor with an organic border.', 'Add or replace (by id) a thicket step: the wall cells of the game grid (and the margin) are a dark thicket and the rest a walkable floor whose border is the smoothed grid plus noise (a curve, not the grid), with round clearings; the floor painted with its material (moss and leaf litter), damp and darker by the thicket. Later steps (canes, shade, beams, an outcrop, a network inside it) read it by id.'],
    ['map_outcrop', outcropStep, 'Add or replace (by id) a rock outcrop leaning on a thicket, with mossy stones piled on top.', 'Add or replace (by id) a rock outcrop leaning on a thicket: ellipses of rock with a south face (dark veins), streaks and moss on its lit rim, and big mossy stones piled on top, back to front.'],
    ['map_undergrowth', undergrowthStep, 'Add an undergrowth step: inside a thicket, leaves by its border, dark depths and fallen leaves.', 'Add an undergrowth step: inside a thicket, leaves by its border, dark depths and fallen leaves.'],
    ['map_canes', canesStep, 'Add a canes step: bamboo canes on a front layer, born in thicket wall cells, with leaves that sway; never over people.', 'Add a canes step: bamboo canes drawn one by one on a layer in front of people (three px wide in front, two behind, one deep; nodes, joints, a thin tip) with leaves like spears on two layers that sway out of step. Each cane is born in a wall cell of a thicket and rises, so it only covers cells behind its foot; it never covers a cell where someone stands (clear cells and the decor), stays low over a trail and passes tall in front in some places.'],
    ['map_shade', shadeStep, 'Add a shade step: shadows a thicket and other casters lay down-light on the floor, and ovals under landmarks.', 'Add a shade step: the shadows a thicket (and other casters, a rock) cast down-light on the floor, deeper at the foot, cleaned; and soft ovals under the landmarks, stacking.'],
    ['map_beams', beamsStep, 'Add a beams step: beams of light between the canes onto a thicket floor, on their own layer, with motes.', 'Add a beams step: beams of light falling between the canes onto the floor of a thicket, down-light, tapering, cut in spots by the leaves above, two tones lighter in the core, on a layer of their own (the game shows it only by day), with motes of dust on another layer.'],
    ['map_snowfield', snowfieldStep, 'Add or replace (by id) a snowfield: snow with shaded hollows and lit crests, or snow above a wavy cover line.', 'Add or replace (by id) a snowfield: snow over the whole picture, almost smooth, with hollows in violet shade (the upper border deeper, the lower lip lit), lit crests and frost dashes; with cover, snow only above a wavy line (grass showing through near it, old patches of snow below it, small scraps dropped) and the grass texture under it, with the lip of the snow. Its id names the line for the ledge, the conifers and the slush of a trail.'],
    ['map_ledge', ledgeStep, 'Add a ledge: one side (l or r) ends at a lip over a narrow dark rock face, leaving room for a cloudsea.', 'Add a ledge: one side of the map (l or r) ends at a lip (a cornice of snow, or earth below a snowfield line) with a narrow dark rock face with cracks; beyond it is left for a cloudsea step.'],
    ['map_cloudsea', cloudseaStep, 'Add a cloudsea beyond a ledge: violet depths, banks of cloud puffs and floating peaks.', 'Add a cloudsea: what lies beyond a ledge, far below: violet depths in streaks, banks of big cloud puffs (lit on top, cold shade below) and peaks that float (columns of rock with snow and a small pine on top, clouds hiding their feet).'],
    ['map_crag', cragStep, 'Add a crag: rock masses in 3/4 from a height field, snow on top, slabbed south faces, optional veins, cleft, cave and icicles.', 'Add a crag: masses of rock by a height field seen in 3/4, the highest one rules each spot; snow gathers on top (its lip lit, dripping down the face), steep tops show rock, the south face split in vertical slabs lit from the left with violet shade on the right, an outline; optional shadow (laid by the next shadows step), veins of qi climbing the face (their light on a layer that flows), a cleft, a cave mouth with icicles, faces recolored (ice) and icicles at its foot. With `relief: {}` its lajas are wider (`facets`) and each turns to the light of the recipe (lit on the side of the sun, a deeper core under the lip on the side away), with a rim of light inside the lit edge and `cracks` down some lajas in the ink; the snow, the seams, veins and colors stay. `top_colors` recolors its top like `face_colors` its faces, or with "ramp" shades the rock of its top (and its snow) from the ramp of its material by the light of the recipe (a slope toward the sun up, away down; with relief, in planes).'],
    ['map_drifts', driftsStep, 'Add or replace (by id) drifts: mounds of snow lit on the sun side, banked against rocks and trunks.', 'Add or replace (by id) drifts: snow with a shape. A height field over the snow (on): free mounds long upwind and short on the lee (wind), fixed ones (at), and banks heaped against the things with a foot laid before (rocks, trunks, posts: as settle reads them) and the materials of against.kinds (the rock of a crag); shaded by the light of the recipe on the snow ramp (the side to the sun keeps the snow and its crest takes the lit tone, the side away one and two down), with no outline. Put it after the crags and the trees, before settle.'],
    ['map_mountain', mountainStep, 'Add a mountain wall on the left side: crags piled beyond the map edge, darker further away.', 'Add a mountain wall on the left side: sixty crags piled beyond the map edge, one and two tones darker the further away, and the snow beyond the edge two tones darker.'],
    ['map_conifers', conifersStep, 'Add a wall of snowy conifers on the right side, deeper rows darker, the front trees on a front layer.', 'Add a wall of snowy conifers on the right side: firs in rows from the edge in, snow on their skirts, deeper rows violet and black; the front trees by the edge go on a layer in front of people; above a snowfield line the floor of the forest is snow in shadow.'],
    ['map_trail', trailStep, 'Add or replace (by id) a trail of curves and blobs: earth, trodden snow channel or wind-swept slabs.', 'Add or replace (by id) a trail made of curves (half width base + waves) and blobs: earth (packed earth with a dark bank up-left, stones, a lit lip on the grass and slush where it enters the snow), trodden (a channel in the snow: dark inside up-left, lit lip down-right, heaped snow outside, footprints in pairs) or slabs (wind-swept rock in slabs, snow covering it in places and in some joints, its shadow on the snow).'],
    ['map_tracks', tracksStep, 'Add tracks along a curve: paws in a line or boots in pairs.', 'Add tracks along a curve over some materials: paws in a line (a wolf, a goat: 2 × 2 holes with a lit lip) or boots in pairs.'],
    ['map_pond', pondStep, 'Add frozen ponds: smooth ice with sky streaks, a snow step, a lit lip and cracks.', 'Add frozen ponds: smooth ice with the sky in diagonal streaks, a step of snow on the upper border, a lit lip below, and two or three broken cracks.'],
    ['map_shrub', shrubStep, 'Add low snowy shrubs at fixed places.', 'Add low shrubs (a juniper of four clumps with snow on top) at fixed places.'],
    ['map_shadows', shadowsStep, 'Add a shadows step: lays the pending crag shadows, decor shadows and fixed casts, one step darker.', 'Add a shadows step: lays down the shadows the crags left pending, those of the decor (a pine: a scalloped crown and the stripe of its trunk; a big thing: an oval) and fixed scalloped casts, cleaned, one step darker by the recipe shade table, on the materials that receive them.'],
    ['map_tussocks', tussocksStep, 'Add tussocks of cold grass whose tips sway, more by material edges, some dry.', 'Add tussocks of cold grass: small tufts whose tips go on a layer that sways, more by the edges of other materials, some dry (gold stems, sand tips).'],
    ['map_stones', stonesStep, 'Add stones poking out of the snow: a grey px and its shadow.', 'Add stones poking out of the snow: a grey px and its shadow.'],
    ['map_sparkles', sparklesStep, 'Add sparkles on a twinkling layer: single px on light snow and ice, kept apart.', 'Add sparkles on a layer that twinkles: one px (sometimes two) on light snow and ice, never close to another.'],
    ['map_spindrift', spindriftStep, 'Add spindrift on a flowing layer: flat streaks of wind-lifted snow.', 'Add spindrift on a layer that flows: snow lifted by the wind in flat streaks of 2 to 6 px.'],
    ['map_straw', strawStep, 'Add straw to a dry grass: patches of vertical strands, specks on the darker grass.', 'Add straw to a dry grass: patches of it (away from the border of the grass) lying in vertical strands, lighter on top; on the darker grass only strands and specks.'],
    ['map_overlook', overlookStep, 'Add an overlook on the left: a lip over a hazy plain of parcels, a river and a road far below.', 'Add an overlook on the left: the land ends at a wavy lip (lit lip, dark under it, a narrow dark face) and beyond it, far below in the haze, a plain of big pale parcels on a skewed grid with lighter borders, a river winding down and a road going away.'],
    ['map_woodedge', woodedgeStep, 'Add or replace (by id) a wood past the right, top and bottom of the map, its shade reaching in.', 'Add or replace (by id) a wood past the right, top and bottom of the map: crowns lit up-left with a line against what is behind, darker deeper in, never on a road net; past the edge the earth and the grass go into its shade. Its id is the edge a poke area pokes crowns in from.'],
    ['map_damp', dampStep, 'Add damp earth: an organic blob of wet dark earth on a road net.', 'Add damp earth where water spilt: an organic blob of wet and dark earth on a road net, away from its border.'],
    ['map_cast', castStep, 'Add a cast step: every opaque px of the decor and standing stamps casts a shadow down-light by its height.', 'Add a cast step: every opaque px of the decor (its silhouette, from the recipe sprites folder) and of what stands (stamps with stands) casts a shadow down-light by its height above its foot, cleaned, one step darker by the recipe shade table, never on the decor itself.'],
    ['map_lines', linesStep, 'Add named wavy lines across the map (river shores) that shapes and river steps read by name.', 'Add named wavy lines across the map (the shores of a river): a row in cells plus waves along x. A shape {between: [top, bottom]} and the river steps read them by name.'],
    ['map_wildwood', wildwoodStep, 'Add the wood in silhouette around the map, darker deeper in, never between two lines.', 'Add the wood in silhouette around the map: crowns packed by how far the land is past the sides, the top (with a gap for a road) and a bottom line, darker deeper in, never between two lines (the river).'],
    ['map_beach', beachStep, 'Add a sand beach between two lines: wet and dry sand, the grass lip, stones and shells.', 'Add a sand beach between two lines: wet sand by the water, dry sand in two tones, the lip of the grass on top, lone stones, shells with their shadow.'],
    ['map_mudbank', mudbankStep, 'Add a bank of wet mud under a line (the far shore), toned by distance to the water.', 'Add a bank of wet mud under a line (the far shore): a band of wavy depth in tones by how far from the water.'],
    ['map_footpath', footpathStep, 'Add footpaths of trodden earth: breathing ribbons and blobs with shaded edge, ruts and a lit lip.', 'Add footpaths of trodden earth: ribbons that breathe and blobs in one mask, kept off some materials and off the river, cleaned; the edge up-left in shadow, earth in three tones with specks and ruts by the middle, a lit lip on the grass, and darker sand where they cross a beach.'],
    ['map_pier', pierStep, 'Add a pier: planks, side beams, its shadow on the water and pilings with ripples.', 'Add a pier: planks across with uneven ends and joints in shadow, the long beams at its sides in the water, its shadow on the water, and pilings with a ripple at their foot.'],
    ['map_reeds', reedsStep, 'Add reeds stalk by stalk, in clumps or along a shore line; tips sway on their layer.', 'Add reeds stalk by stalk: clumps at places or a row along a shore line; stalks lit on the left, bent leaves and cattails; the tips sway on their layer, clumps in the water stand whole in front of people.'],
    ['map_rocks', rocksStep, 'Add rocks with volume (lit, cold face, moss, cracks) and their shadow.', 'Add rocks with volume (lit up-left, a cold face, moss on top, a crack in the big ones) and the oval of their shadow down-right. With `relief: {}` the body is a height field of facets shaded from the light of the recipe (its `dir`, or a lamp\'s `source`): a plane of light on top and toward the sun, the far side in shadow with a deeper core under a crest, a 1 px rim on the lit edge, cracks in the deepest tone. Same silhouette, outline and shadow (mapsteps/rockform.ts).'],
    ['map_umbra', umbraStep, 'Add shade on some materials: wavy ovals (an eave) and bands (a roof), one or two steps darker.', 'Add shade on some materials: ovals with a wavy border (the shadow of an eave) and bands with a wavy top (the shadow of a roof), one or two steps darker by the recipe shade table.'],
    ['map_meadow', meadowStep, 'Add tufts or flowers on a grass, by their own random draws.', 'Add tufts (leaves on the ground, tips on a layer that sways, ten px apart) or flowers (two colors and a stem) on a grass by their own draws, not the shared stream.'],
    ['map_shimmer', shimmerStep, 'Add glints (twinkling layer) and current streaks (flowing layer) to a water mask.', 'Add glints (a layer that twinkles, bright where the sun is) and streaks of current (rows of the deep water one step lighter, a layer that flows) to a water mask.'],
    ['map_slabs', slabsStep, 'Add laid slabs in an organic blob: stretched Voronoi cells with lit lip, dark edge and mossy joints.', 'Add laid slabs in an organic blob: Voronoi cells stretched sideways, a lit lip up-left, a dark edge down-right, joints with moss.'],
    ['map_ditch', ditchStep, 'Add a dry ditch from the water down the map: a winding earth trench between lips of laid stones.', 'Add a dry ditch from the water down the map: a winding trench of earth with the shadow of its left wall and stones, between lips of laid stones.'],
    ['map_claypan', claypanStep, 'Add a dry pond: cracked mud plates, a rim of mossy stones and a walk of slabs across.', 'Add a dry pond: a rounded square of cracked mud in Voronoi plates (lit lips, dark cracks, darker by the rim), a rim of mossy stones, and a walk of slabs across it with its face over the mud.'],
    ['map_floodwater', floodwaterStep, 'Add the water that returns to dry masks (a ditch, a pond) on a layer of its own.', 'Add the water that comes back to dry masks (a ditch, a pond) on a layer of its own: bands by depth, the dark border under the upper edge and its reflection, foam at the lower edge, ripples.'],
    ['map_cloudbanks', cloudbanksStep, 'Add a sea of clouds seen from above filling the picture: haze, long banks and floating peaks.', 'Add the sea of clouds seen from above, filling the picture: a haze, rows of long flat banks (domed lumpy tops lit, cold bellies), floating peaks of rock with ledges and flat pines on top, and banks hiding their feet.'],
    ['map_ashlar', ashlarStep, 'Add the ashlar face of a raised terrace: stone courses in shade sinking into clouds, moss from the curb.', 'Add the ashlar face of a raised terrace: courses of stones in the shade with staggered joints, darker down to its foot, the foot sinking into the clouds and moss hanging from the curb.'],
    ['map_courses', coursesStep, 'Add big stones laid in courses over a box: staggered joints, lit lips, worn where people walk, moss.', 'Add big stones laid in courses over a box: slabs of different lengths, joints staggered row to row, a lit lip up-left, a light joint, worn (lighter) where people walk, moss in the joints by the sides and a few cracks.'],
    ['map_runner', runnerStep, 'Add a runner of long slabs end to end (a walk up to an arena).', 'Add a runner of long slabs end to end (a walk up to an arena): two slabs a row with the joint staggered, lit noses, lighter in the middle.'],
    ['map_arena', arenaStep, 'Add the round arena of a duel: an oval dais with curb, rings of slabs, a bronze ring and scuffs.', 'Add the round arena of a duel: a low oval dais with its step face to the south, a curb of voussoirs with bronze studs, two rings of slabs in rays, the worn band, a disc with a bronze ring set in it, and scuffs.'],
    ['map_balustrade', balustradeStep, 'Add lacquered balustrades on stone curbs, front and side views; they stand up for the cast step.', 'Add lacquered balustrades on stone curbs: along rows seen from the front (handrail, balusters, posts with gold finials, openings and a hatch), and the side rails seen from above; they stand up for the cast step.'],
    ['map_stairway', stairwayStep, 'Add a stairway down to the bottom of the picture between low walls; worn= reads as stone, worn.rock cuts a cliff.', 'Add a stairway going down to the bottom of the picture between two low walls: lit noses, risers in shadow, darker tread by tread. worn: treads that read as stone (lit tread, a brighter nose, the riser in shadow with a dark foot), staggered joints, sunk stones and chipped noses, moss in some joints, walls with their cap and outline, the shadow on the ground beside; worn.rock cuts it into the rock of a cliff from the lip down.'],
    ['map_sprigs', sprigsStep, 'Add little sprigs out of mossy joints, tips on a swaying layer.', 'Add little sprigs growing out of mossy joints (the tips on a layer that sways), by the shared random stream.'],
    ['map_fallen', fallenStep, 'Add a few dry leaves blown against the sides of a courses step.', 'Add a few dry leaves blown against the sides (inside the edge band of a courses step), by the shared random stream.'],
    ['map_motes', motesStep, 'Add twinkling motes of light over some colors, apart from each other.', 'Add motes of light that twinkle (on a layer) over some colors, apart from each other, by the shared random stream.'],
    ['map_overhang', overhangStep, 'Add a cliff pine branch reaching over the picture on a front layer, with its shadow on the ground.', 'Add the branch of a cliff pine reaching over the picture on a front layer: a tapering trunk with bark, flat lumpy crowns, and its shadow on the ground.'],
    ['map_grove', groveStep, 'Plant a grove of broadleaves, pines, crags (mountain pines), plums, ginkgos, willows or bushes at given feet or by density in a mask; crowns on a front layer.', 'Plant a grove: round broadleaves, pines, a few plums, golden ginkgos (a fan of small clusters on a straight pale trunk) and willows (a low dome falling in curtains almost to the ground) drawn by one hand (lumps with a one pixel outline lit from the upper left, tiers that hang over each other, barked trunks flared at the foot), at given feet or by density and salt inside a mask (the band of forest inside the lip of an island), never on a walkable cell unless asked. Trunks on the ground, crowns on a front layer, back to front by the row of the foot; a later light step casts their shadows. Bushes (kind bush) have no trunk and sit on the ground layer; drape hangs green from the lip of a cliff under a crown that leans over it.'],
    ['map_cloudscape', cloudscapeStep, 'Add the sky around an island seen from above: karst peaks plane after plane, cumulus masses and wisps.', 'Add the sky around an island seen from above, filling the picture: a deep sky in soft patches, ranges of karst peaks plane after plane (far ones pale and blue, near ones dark with green on top) with clouds at their feet, masses of cumulus of very different sizes (few big, many small: lumps on lumps lit from the upper left, a cold belly, a crease where one lump sits in front of another, wisps trailing from a side) and thin wisps in the open sky. drift puts the clouds on a layer the game moves; within paints the same sky again past the foot of a brink.'],
    ['map_cavern', cavernStep, 'Add a cave: grid walls as faceted rock with lit lips and south faces over a cracked stone floor.', 'Add a cave: the walls of the game grid as a mass of rock (grid_mask: round corners, wandering borders, every corridor kept open) seen from above in dark facets with an outline and a lit lip; its south faces over the floor below (a lit edge, strata, a vein, wet glints on a layer, a dark foot); a cold stone floor in cracked slabs, dark at the foot of the walls, with loose pebbles. Exits go on into the margin; shafts go up black. The cave steps that follow read it.'],
    ['map_hangroots', hangrootsStep, 'Add roots down the south faces of a cavern, with rootlets, drips and hanging roots on a front layer.', 'Add roots coming down the south faces of a cavern (cells chosen by the cell noise): a thick root out of the rock, sometimes a thin one braided, rootlets on the floor, earth that came down; some drip (a thread on a layer that flows, a puddle with a glint), some hang thin roots on a front layer where nobody stands below.'],
    ['map_carvings', carvingsStep, 'Add carved inscriptions on the south faces of a cavern.', 'Add inscriptions carved in the south faces of a cavern: a smoothed slab with its lit edge and columns of illegible 3×3 strokes, on fixed cells, cells inside a box and cells by the cell noise.'],
    ['map_rootladder', rootladderStep, 'Add a ladder of roots coming down a cavern shaft from the top of the picture.', 'Add a ladder of roots coming down a shaft of a cavern from the top of the picture: two twisted rails, uneven rungs, lost in the dark up there.'],
    ['map_pool', poolStep, 'Add a still dark pool on a cavern floor, with reflected veins and glints on a layer.', 'Add a still dark pool on the floor of a cavern: reflected veins, a lit upper shore, a dark lower shore, glints in streaks on a layer.'],
    ['map_formation', formationStep, 'Add a formation diagram carved in a cavern floor, and the same lit with qi on its own layer.', 'Add a formation diagram carved in a cavern floor (two rings, the eight trigrams, eight spokes) and the same lit with qi on a layer of its own, inside a room box (export.windows cuts the patch there).'],
    ['map_gloom', gloomStep, 'Add the dark past the map border: everything darkens into black and moving layers go away there.', 'Add the dark past the border of the map, or out of an area (area: a mask id): everything darkens step by step into the black (the recipe shade table), and the glints, drops and front layers go away where it is dark. It needs no cavern (salt and darkest then its own).'],
    ['map_soften', softenStep, 'Add a softening pass: lone pixels of a material inside another become an accent of its value.', 'Add a softening pass: a lone pixel of a material inside another becomes an accent of its value (by an accent table), so the lint sees no blur.'],
    ['map_glen', glenStep, 'Add the layout of a glen at the foot of a waterfall, as masks only (pool, stream, river, earth, ledge, beach).', 'Add the layout of a glen at the foot of a waterfall, as masks only: a plunge pool of organic blobs, the stream that leaves it, a river under a line, trodden earth (roads and clearings), a ledge of slabs and a gravel beach under another line, kept apart. The glen steps that follow paint them.'],
    ['map_cushions', cushionsStep, 'Add wet moss cushions by the water of a glen.', 'Add wet moss cushions by the water of a glen: a cleaned noisy band near the shore painted a deep green over the grass.'],
    ['map_mudtrail', mudtrailStep, 'Add the wet earth trail of a glen: shaded border, mottled tones, ruts, the grass lip and tufts.', 'Add the wet earth trail of a glen: the border in shadow, mottled in three tones at 5 px, wetter near the water, grains, ruts beside the middle, the lit lip of the grass and tufts creeping in.'],
    ['map_shingle', shingleStep, 'Add the gravel beach of a glen: earth face, wet gravel, dry sand, the grass lip over it.', 'Add the gravel beach of a glen: a face of earth under the grass above, wet gravel by the water, dry sand and light in between, a dark lip of the grass over it.'],
    ['map_ledgeslabs', ledgeslabsStep, 'Add a ledge of wet slabs on the glen ledge, with moss in and on the joints.', 'Add a ledge of wet slabs (stretched Voronoi) on the glen ledge: lit lip, dark joint, moss in the joints and climbing the slabs, a dark border right and below.'],
    ['map_plunge', plungeStep, 'Add the water of a glen: river, pool and stream by depth, banks, foam and rings at the foot of the fall.', 'Add the water of a glen: the river by depth under its line with a deep channel, the pool and stream by distance to the shore; high banks show a face of earth or rock and cast a cold shadow, the water licks the beach, foam on the low shore, pebbles under the shallows, rings of foam at the foot of the fall.'],
    ['map_wetstones', wetstonesStep, 'Add wet stones in and by water (a glen, a water curve, a pool), with foam upstream and a wake.', 'Add wet stones in and by water, each with foam on its upstream side and a wake downstream: the water of a glen by default, or any (water: mask ids or materials, a water curve, a pool), flowing along flow ([1, 0]: right).'],
    ['map_wetwood', wetwoodStep, 'Add the wet wood on the sides of a glen, crowns by depth, darkening the trail and shore into it.', 'Add the wet wood on the sides of a glen: crowns by depth past two wavy edges, never on the earth nor near the river, the near ones on the sunny half lit; past the edge the trail and shore darken into the wood; above the map it closes.'],
    ['map_glenshade', glenshadeStep, 'Add the cold shadows of a glen cast down-right: ovals under the decor and the rim of the wood.', 'Add the cold shadows of a glen, cast down-right: lobed ovals under the decor by sprite prefix (trees with a trunk, deep ones), more ovals, the rim of the wood on the left; cleaned once, one step darker.'],
    ['map_glenlitter', glenlitterStep, 'Add the small things of a glen: tufts, pale flowers, pebbles, puddles, fallen leaves.', 'Add the small things of a glen by the shared random stream: tufts (tips on a layer that sways), pale flowers by the water, pebbles and puddles that reflect the sky on the earth, pebbles on the beach, fallen leaves near the trees.'],
    ['map_glenflow', glenflowStep, 'Add what moves on the water of a glen, each on its layer: glints, foam, streaks.', 'Add what moves on the water of a glen, each on its layer: glints (white in the sun), the foam of the fall twinkling, streaks down the stream and along the river.'],
    ['map_boughs', boughsStep, 'Add boughs of the wet wood reaching in front of people from both edges of a glen, with moss.', 'Add boughs of the wet wood reaching in front of people from both edges of a glen (a front layer), apart, never over the earth nor the river, with moss hanging from them.'],
    ['map_sun', sunStep, 'Add or replace (by id) the sun through the windows of a wall, sheared onto the floor on its own layer.', 'Add or replace (by id) the sun that comes in through the windows of a wall: each window sheared onto the floor, down and to the right, with the shadow of its lattice, a few tones lighter, on a layer of its own (the game shows it only by day).'],
    ['map_settle', settleStep, 'Add or replace (by id) a settle: what stands sits in the ground (sink, no ink below, ring, tufts, wet, moss).', 'Add or replace (by id) a settle step: the things with a foot laid before it (stamps that stand, rocks, boulders, wet stones, trunks of a grove, posts of a fence, pilings of a pier, walls of a building; its targets by step id, step name or kind) sit in the ground instead of on it. Sink: the lowest px go under a bitten ground line. Ink: the outline of the lower quarter takes the deepest tone of the thing, less toward the sides. Ring: an occlusion ring a tone down the ground, wider below than at the sides, frayed, whatever the sun does. Tufts: blades of the grass around over the edge of the foot (pebbles on earth). Wet, with water at the foot: a wet band two tones down, foam where it meets the water, the thing mirrored into the water in its tones, dithered and broken. Moss (only when asked, moss: true), with the foot in shaded grass: on the side away from the sun. Each rule off with false (sink 0). By default every thing laid before it but buildings (name them in targets). Put it last, after the light and the scatters: a scatter after it could land on the ground a foot gave back. Without a settle step a recipe paints what it painted.'],
  ] as const).map(([name, schema, description, details]) => define({
    name,
    description,
    details,
    schema: (schema as unknown as typeof areaStep).omit({ step: true }).extend({
      recipe: z.string().describe('the recipe JSON'),
      index: z.number().int().nonnegative().optional().describe('insert at this position (default: last, or in place of the step with the same id)'),
    }),
    run: (a) => {
      const { recipe, index, ...rest } = a as unknown as { recipe: string; index?: number } & Record<string, unknown>;
      const step = { step: name.replace('map_', ''), ...rest } as unknown as MapStep;
      const r = upsertStep(recipe, step, index);
      return { data: { recipe: resolve(recipe), step: step.step, index: r.index, steps: r.steps } };
    },
  })),
  define({
    name: 'map_render',
    description: 'Run a map recipe and write the picture (every layer or only some, at a scale). Deterministic.',
    details: 'Run a map recipe and write the picture: every layer painted one over the other (or only `layers`, bottom first), at `scale`. Deterministic: the same recipe gives the same pixels.',
    schema: z.object({
      recipe: z.string().describe('the recipe JSON'),
      out: z.string().describe('PNG path'),
      layers: z.array(z.string()).optional().describe('layers to show, bottom first (default all, ground first)'),
      scale: z.number().int().positive().optional(),
      variant: z.string().optional().describe('one of the recipe variants (a door open or closed)'),
    }),
    run: (a) => {
      const r = renderRecipe(a.recipe, { variant: a.variant });
      const names = a.layers ?? ['ground', ...Object.keys(r.map.layers).filter(n => n !== 'ground')];
      const layers = names.map(n => { const l = r.map.layers[n]; if (!l) throw new Error(`map_render: no layer "${n}"`); return l; });
      const img = layersImage(layers, r.colors, a.scale ?? 1);
      writePng(a.out, img);
      const data = { out: resolve(a.out), ...(a.variant ? { variant: a.variant } : {}), size: [r.map.width, r.map.height], origin: r.map.origin, layers: names, colors: new Set(layers.flatMap(l => l.used())).size };
      // The line of the world's light, when there is one, goes under the usual line.
      return { data, png: encodePng(img), ...(r.world ? { text: `${basename(a.out)}${a.variant ? ` (${a.variant})` : ''}: ${r.map.width}x${r.map.height}, ${names.length} capa(s) (${names.join(', ')}), ${data.colors} colores\n${r.world}` } : {}) };
    },
  }),
  define({
    name: 'map_export',
    description: 'Run a map recipe and write what the game reads: per layer a PNG + Aseprite JSON, a text drawing and an asset; keeps retouches.',
    details: 'Run a map recipe and write what the game reads: one PNG per layer (<dir>/<id><suffix>.png; the ground has no suffix) with its Aseprite JSON, the text drawing of each (txt, from_ascii format: the source the game rebuilds from) and its .pss.json (src). Folders default to export.png / export.txt / export.src of the recipe. export.ground writes painting, margen, vivo and copas into the game map (only the keys that changed). Every drawing is written with a "generated_by: map_export recipe= layer=" header, and a drawing that says something else (or nothing, meaning it was drawn by hand) stops the export instead of being overwritten: pass force to overwrite it anyway. The retouch of each drawing (<drawing>.retoque.txt, what the editor saves) is laid back on a layer of its own over the regenerated layer, so a retouch survives running the recipe again; retouch=false skips it. The retouch wins over the recipe: where it says "!" the pixel comes out. Every retouch reports what it paints, what it takes out and what share of the drawing it decides, and over a fifth it warns that the corrections belong in the recipe. trees writes where every tree (not bush) of the groves stands: its grove, the foot of its trunk on the picture (px) and in the game map (cells), its kind and [crown width, height] px, back to front (the same list goes in the answer as trees). When the recipe declares export.layers only those layers are written (the answer names the ones left out). variant exports one state of the recipe (recipe.variants: steps removed, changed and added by id) as <id>_<name>, its drawings saying variant= in generated_by; "*" exports the base and every variant, all checked before the first file is written. A variant writes the game map ground only when it declares its own export.ground.',
    schema: z.object({
      recipe: z.string().describe('the recipe JSON'),
      dir: z.string().optional().describe('folder for the PNGs (default export.png of the recipe)'),
      assets: z.boolean().optional().describe('also <dir>/<id>.pss.json'),
      txt: z.string().optional().describe('folder for the text drawings (default export.txt)'),
      src: z.string().optional().describe('folder for the .pss.json rebuilt from each text drawing (default export.src)'),
      sheet: z.boolean().optional().describe('write the Aseprite JSON next to each PNG (default: if export.png)'),
      ground: z.boolean().optional().describe('write export.ground into the game map (default true)'),
      force: z.boolean().optional().describe('overwrite a drawing even when it was drawn by hand or made by another recipe'),
      retouch: z.boolean().optional().describe('lay each <drawing>.retoque.txt back on top (default true)'),
      trees: z.string().optional().describe('JSON file for every tree the groves planted: foot px and cell, kind, size'),
      variant: z.string().optional().describe('one of the recipe variants; "*": the base and every one'),
    }),
    run: (a) => {
      // "*" is the base and then each variant, in the order the recipe writes them
      const wanted = a.variant === '*' ? [undefined, ...variantNames(readRecipe(a.recipe))] : [a.variant];
      const lines: string[] = [];
      const files: ExportedLayer[] = [];
      let ground: ReturnType<typeof exportGround> = null;
      // every state rendered and checked before the first file is written: a refused drawing stops all of them
      const renders = wanted.map(variant => renderRecipe(a.recipe, { variant }));
      const refused = renders.flatMap(x => refusedDrawings(x, { txt: exportDirs(x, a.recipe, a).txt, recipe: a.recipe, force: a.force }));
      if (refused.length) throw new Error(`map_export: not writing ${refused.length} drawing(s):\n  ${refused.join('\n  ')}`);
      let r!: ReturnType<typeof renderRecipe>;
      for (const [k, variant] of wanted.entries()) {
        r = renders[k];
        const dirs = exportDirs(r, a.recipe, a);
        // a variant is checked whole before anything is written, like a recipe
        const mine = exportRecipe(r, dirs.dir, {
          assets: a.assets, txt: dirs.txt, src: dirs.src, sheet: a.sheet ?? (!a.dir && !!r.recipe.export?.png),
          recipe: a.recipe, force: a.force, retouch: a.retouch,
        });
        files.push(...mine.map(f => (variant ? { ...f, variant } : f)));
        if (wanted.length > 1) lines.push(variant ? `variant ${variant}:` : 'base:');
        lines.push(...mine.flatMap(f => [
          `${f.layer}: ${basename(f.png)}${f.txt ? ` + ${basename(f.txt)}` : ''}${f.src ? ` + ${basename(f.src)}` : ''}${f.retouch ? ` + ${retouchLine(f.retouch)}` : ''}`,
          ...(f.retouch?.warning ? [`  ${f.retouch.warning}`] : []),
        ]));
        const { skipped } = exportedLayers(r);
        if (skipped.length) lines.push(`not exported (not in export.layers): ${skipped.join(', ')}`);
        // the game map's ground is the base's: a variant writes it only when it declares its own
        const g = a.ground === false || !variantWritesGround(readRecipe(a.recipe), variant) ? null : exportGround(r, a.recipe);
        if (g) { ground = g; lines.push(`${basename(g.file)}: ${g.written.length ? g.written.join(', ') : 'nothing changed'}`); }
      }
      lines.push(...plantedLines(r.map));
      if (r.world) lines.push(r.world);
      // where each tree stands, as data (#172 of unwritten-dao: a chain makes the trunk a wall without probing)
      const trees = r.map.trees ?? [];
      if (a.trees) {
        mkdirSync(dirname(resolve(a.trees)), { recursive: true });
        writeGuarded(a.trees, JSON.stringify({ recipe: basename(a.recipe), origin: r.map.origin, cell: r.map.cell, trees }, null, 1) + '\n');
        lines.push(`trees: ${trees.length} → ${basename(a.trees)}`);
      }
      return { data: { files, ground, planted: r.map.planted, trees }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'map_compare',
    description: 'Compare a map recipe with the drawing it replaces (or two PNGs): side-by-side picture and how many pixels differ.',
    details: 'Check a map recipe against the drawing it replaces (or two PNGs): writes the reference, the recipe and the differences side by side (every pixel that differs in magenta over the dimmed reference) and answers how many pixels differ and their share. With layers, one picture per layer (<out>_<layer>.png).',
    schema: z.object({
      recipe: z.string().optional().describe('the recipe JSON'),
      ref: z.string().optional().describe('reference PNG of the ground (or of the one layer asked)'),
      refs: z.record(z.string(), z.string()).optional().describe('layer → reference PNG, to compare several layers'),
      layer: z.string().optional().describe('the recipe layer compared with ref (default ground)'),
      a: z.string().optional().describe('instead of a recipe: first PNG'),
      b: z.string().optional().describe('second PNG'),
      out: z.string().describe('PNG path of the comparison (for refs, the ground; the other layers get _<layer>)'),
      scale: z.number().int().positive().optional(),
    }),
    run: (a) => {
      const scaled = (img: Rgba) => { const s = a.scale ?? 1; if (s === 1) return img; const o = blankImage(img.width * s, img.height * s);
        for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) { const i = ((Math.floor(y / s)) * img.width + Math.floor(x / s)) * 4, k = (y * o.width + x) * 4; for (let c = 0; c < 4; c++) o.data[k + c] = img.data[i + c]; }
        return o; };
      const rows: { layer: string; differ: number; share: number; out: string }[] = [];
      const images: Rgba[] = [];
      let world: string | undefined;
      if (a.a && a.b) {
        const c = compareImages(readPng(a.a), readPng(a.b));
        writePng(a.out, scaled(c.image));
        images.push(scaled(c.image));
        rows.push({ layer: 'png', differ: c.differ, share: c.share, out: resolve(a.out) });
      } else {
        if (!a.recipe) throw new Error('map_compare: recipe (with ref or refs), or a and b');
        const r = renderRecipe(a.recipe);
        world = r.world;
        const refs = a.refs ?? { [a.layer ?? 'ground']: a.ref ?? '' };
        for (const [layer, ref] of Object.entries(refs)) {
          if (!ref) throw new Error('map_compare: ref');
          const c = compareRecipe(r, ref, layer);
          const out = layer === 'ground' || !a.refs ? a.out : a.out.replace(/\.png$/i, '') + `_${layer}.png`;
          writePng(out, scaled(c.image));
          images.push(scaled(c.image));
          rows.push({ layer, differ: c.differ, share: c.share, out: resolve(out) });
        }
      }
      return {
        data: { layers: rows },
        text: [...rows.map(x => `${x.layer}: ${x.differ} px differ (${(x.share * 100).toFixed(2)} %)`), ...(world ? [world] : [])].join('\n'),
        // One comparison comes back as the picture too: the number says how much
        // differs, only the magenta says where.
        png: images.length === 1 ? encodePng(images[0]) : undefined,
      };
    },
  }),
  define({
    name: 'export_sheet',
    description: 'Write a 1:1 PNG sheet plus an Aseprite-style JSON (frame rects, durations, frameTags); layout rows = one animation per row.',
    details: 'Write a 1:1 PNG sheet plus an Aseprite-style JSON (frames with rects and durations, frameTags with loop). Layout "rows" puts one animation per row.',
    schema: z.object({
      path: pathArg,
      out: z.string().describe('PNG path'),
      meta: z.string().optional().describe('JSON path; default: same as out with .json'),
      scale: z.number().int().positive().optional(),
      spacing: z.number().int().nonnegative().optional(),
      layout: z.enum(['rows', 'strip']).optional(),
      layer: z.union([z.string(), z.number().int().nonnegative()]).optional().describe('export only this layer (name or index), same frames and tags'),
      indexed: z.boolean().optional().describe('pixel = gray n, the n-th color of meta.ramp (lightest first): one sheet, many palettes'),
    }),
    run: (a) => {
      const whole = loadAsset(a.path);
      const one = a.layer !== undefined ? onlyLayer(whole, a.layer) : whole;
      const idx = a.indexed ? indexedAsset(one) : undefined;
      const asset = idx?.asset ?? one;
      const metaPath = a.meta ?? a.out.replace(/\.png$/i, '') + '.json';
      const { image, meta } = exportSheet(asset, {
        imageName: basename(a.out), scale: a.scale, spacing: a.spacing, layout: a.layout, ramp: idx?.ramp,
        // The PNG has nowhere to carry it, so the pair's header lives in the JSON.
        generatedBy: formatGeneratedBy(madeBy('export_sheet', {
          path: relTo(metaPath, a.path), scale: a.scale, spacing: a.spacing, layout: a.layout,
          layer: a.layer, indexed: a.indexed,
        })),
      });
      writePng(a.out, image);
      mkdirSync(dirname(metaPath), { recursive: true });
      writeGuarded(metaPath, JSON.stringify(meta, null, 1) + '\n');
      return {
        data: {
          png: resolve(a.out), meta: resolve(metaPath),
          size: meta.meta.size, frames: meta.frames.length,
          tags: meta.meta.frameTags.map(t => `${t.name} ${t.from}-${t.to}${t.loop ? ' loop' : ''}`),
        },
      };
    },
  }),
  define({
    name: 'draw',
    description: 'Apply drawing ops (pixel, pixels, line, rect, circle, fill, replace, clear) to one frame. x = column, y = row, origin top-left.',
    schema: z.object({
      path: pathArg,
      frame: z.number().int().nonnegative(),
      layer: z.number().int().nonnegative().optional(),
      ops: z.array(drawOpSchema).min(1),
    }),
    run: (a) => withAsset(a.path, asset => {
      applyDrawOps(asset, a.frame, a.ops as DrawOp[], a.layer ?? 0);
      return { ascii: renderAscii(composite(asset, a.frame)) };
    }),
  }),
  define({
    name: 'fx',
    description: 'Stamp a procedural effect (burst, beam, sparks, pulse, circle, glow) on one frame.',
    schema: z.object({
      path: pathArg,
      frame: z.number().int().nonnegative(),
      shape: fxShape,
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      intensity: z.number().min(0).max(1),
      color,
      light: color.optional(),
      dark: color.optional(),
      radius: z.number().positive().optional(),
      seed: z.number().int().optional(),
      x2: z.number().int().optional().describe('bolt end column'),
      y2: z.number().int().optional().describe('bolt end row'),
    }),
    run: (a) => withAsset(a.path, asset => {
      const frame = applyFx(asset, getFrame(asset, a.frame), a);
      setFrame(asset, a.frame, frame);
      return { ascii: renderAscii(composite(asset, a.frame)) };
    }),
  }),
  define({
    name: 'fx_anim',
    description: 'Generate an effect animation: N new frames of a shape at a moving intensity (grow, fade, grow_fade, flat), tagged by name.',
    details: 'Generate a whole effect animation: N new frames with the shape at a moving intensity (grow, fade, grow_fade, flat), tagged by name.',
    schema: z.object({
      path: pathArg,
      name: z.string(),
      shape: fxShape,
      frames: z.number().int().min(1).max(64),
      curve: z.enum(['grow', 'fade', 'grow_fade', 'flat']).optional(),
      peak: z.number().min(0).max(1).optional(),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      color,
      light: color.optional(),
      dark: color.optional(),
      radius: z.number().positive().optional(),
      seed: z.number().int().optional(),
      x2: z.number().int().optional(),
      y2: z.number().int().optional(),
      fps: z.number().positive().optional(),
      loop: z.boolean().optional(),
    }),
    run: (a) => withAsset(a.path, asset => ({ frames: generateFxAnimation(asset, a) })),
  }),
  define({
    name: 'palette',
    description: 'Set, add or rename palette colors. Indices start at 1; 0 is transparent.',
    schema: z.object({
      path: pathArg,
      set: z.record(z.string(), z.string()).optional().describe('{index: hex} to change existing colors'),
      add: z.array(z.string()).optional().describe('hex colors to append'),
      names: z.record(z.string(), z.string()).optional().describe('{index: name}'),
      map: z.record(z.string(), z.string()).optional().describe('{fromHex: toHex}: recolor by value'),
    }),
    run: (a) => withAsset(a.path, asset => {
      for (const [from, to] of Object.entries(a.map ?? {})) {
        const f = normalizeHex(from);
        for (const [k, hex] of Object.entries(asset.palette)) {
          if (normalizeHex(hex) === f) asset.palette[Number(k)] = normalizeHex(to);
        }
      }
      for (const [k, hex] of Object.entries(a.set ?? {})) {
        const idx = Number(k);
        if (!asset.palette[idx]) throw new Error(`no color at index ${idx}`);
        asset.palette[idx] = normalizeHex(hex);
      }
      const added = (a.add ?? []).map(hex => colorIndex(asset, hex));
      for (const [k, name] of Object.entries(a.names ?? {})) asset.colorNames[Number(k)] = name;
      return { added };
    }),
  }),
  define({
    name: 'palette_fit',
    description: 'Map every color of an asset to the nearest of a target palette (map= forces some); pixels untouched. Answers the table.',
    details: 'Map every color of the asset to the nearest color of a target palette (another asset\'s palette, or a list of hex). "map" forces specific colors (fromHex → toHex). Returns the table of what went where; pixels are untouched, only the palette changes.',
    schema: z.object({
      path: pathArg,
      target: pathArg.optional().describe('asset whose palette is the target'),
      colors: z.array(z.string()).optional().describe('target colors as hex, instead of target'),
      map: z.record(z.string(), z.string()).optional().describe('{fromHex: toHex} forced mappings'),
    }),
    run: (a) => withAsset(a.path, asset => {
      let colors = a.colors ?? [];
      if (a.target) colors = colors.concat(Object.values(loadAsset(a.target).palette));
      if (colors.length === 0) throw new Error('palette_fit needs target or colors');
      const table = fitPalette(asset, colors, a.map ?? {});
      return { table, moved: table.filter(t => t.from !== t.to).length };
    }),
  }),
  define({
    name: 'png_fit',
    description: 'Recolor a PNG to a target palette without touching its layout (map= forces some); alpha kept. Answers the table.',
    details: 'Recolor a PNG (a tileset, any image) to a target palette without touching its layout: every color goes to its forced mapping ("map") or to the nearest target color; alpha is kept. Returns the table of what went where.',
    schema: z.object({
      png: z.string(),
      out: z.string().describe('PNG path (may be the same file)'),
      target: pathArg.optional().describe('asset whose palette is the target'),
      colors: z.array(z.string()).optional(),
      map: z.record(z.string(), z.string()).optional().describe('{fromHex: toHex} forced mappings'),
      regions: z.array(z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().positive(), h: z.number().int().positive() })).optional().describe('only recolor inside these rects (pixels); default: the whole image'),
    }),
    run: (a) => {
      let colors = a.colors ?? [];
      if (a.target) colors = colors.concat(Object.values(loadAsset(a.target).palette));
      if (colors.length === 0) throw new Error('png_fit needs target or colors');
      const img = readImage(a.png);
      const table = fitImageColors(img, colors, a.map ?? {}, a.regions);
      writePng(a.out, img);
      return { data: { out: resolve(a.out), colors: table.length, moved: table.filter(t => t.from !== t.to).length, table } };
    },
  }),
  define({
    name: 'png_knockout',
    description: 'Make transparent the pixels of one color connected to the border of each region of a PNG; inner islands stay.',
    details: 'Make transparent, in a PNG, the pixels of one color that touch the border of each region (flood from the edges); islands of that color inside stay. For tileset pieces with background baked around them. Regions [{x,y,w,h}] in pixels; default: the whole image.',
    schema: z.object({
      png: z.string(),
      out: z.string(),
      color: z.string(),
      regions: z.array(z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().positive(), h: z.number().int().positive() })).optional(),
    }),
    run: (a) => {
      const img = readImage(a.png);
      const removed = knockOutColor(img, a.color, a.regions);
      writePng(a.out, img);
      return { data: { out: resolve(a.out), removed, regions: a.regions?.length ?? 1 } };
    },
  }),
  define({
    name: 'palette_show',
    description: 'Render the palette of an asset as swatches (one white dot per index along the top of each cell). Returns the image.',
    schema: z.object({
      path: pathArg,
      out: z.string().optional(),
      cell: z.number().int().positive().optional().describe('swatch size in px (default 24)'),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const png = encodePng(paletteSheet(asset.palette, a.cell ?? 24));
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeGuarded(a.out, png); }
      return { data: { palette: asset.palette, names: asset.colorNames, out: a.out ?? null }, png };
    },
  }),
  define({
    name: 'remap',
    description: 'Replace one palette index by another in the pixels of some or all frames.',
    schema: z.object({
      path: pathArg,
      from: color,
      to: color,
      frames: z.array(z.number().int().nonnegative()).optional().describe('default: all'),
    }),
    run: (a) => withAsset(a.path, asset => {
      const from = colorIndex(asset, a.from), to = colorIndex(asset, a.to);
      const targets = a.frames ?? Array.from({ length: frameCount(asset) }, (_, i) => i);
      let n = 0;
      for (const layer of asset.layers!) {
        for (const i of targets) if (layer.frames[i]) n += replaceIndex(layer.frames[i], from, to);
      }
      return { replaced: n };
    }),
  }),
  define({
    name: 'frames',
    description: 'Add blank frames, duplicate one, or remove one (animations are re-indexed).',
    schema: z.object({
      path: pathArg,
      action: z.enum(['add', 'duplicate', 'remove']),
      index: z.number().int().nonnegative().optional().describe('for duplicate/remove'),
      count: z.number().int().positive().optional().describe('for add (default 1)'),
    }),
    run: (a) => withAsset(a.path, asset => {
      switch (a.action) {
        case 'add': {
          const added: number[] = [];
          for (let i = 0; i < (a.count ?? 1); i++) added.push(addFrame(asset));
          return { added };
        }
        case 'duplicate':
          if (a.index === undefined) throw new Error('duplicate needs index');
          return { added: [duplicateFrame(asset, a.index)] };
        case 'remove':
          if (a.index === undefined) throw new Error('remove needs index');
          removeFrame(asset, a.index);
          return { removed: a.index };
      }
    }),
  }),
  define({
    name: 'anim',
    description: 'Create or replace an animation (a named list of frame indices with fps or per-frame durations), or remove it.',
    schema: z.object({
      path: pathArg,
      name: z.string(),
      frames: z.array(z.number().int().nonnegative()).optional(),
      fps: z.number().positive().optional(),
      durations: z.array(z.number().positive()).optional().describe('ms per frame'),
      loop: z.boolean().optional(),
      label: z.string().optional(),
      remove: z.boolean().optional(),
    }),
    run: (a) => withAsset(a.path, asset => {
      if (a.remove) return { removed: removeAnimation(asset, a.name) };
      if (!a.frames) throw new Error('anim needs frames (or remove: true)');
      setAnimation(asset, { name: a.name, frameIndices: a.frames, fps: a.fps, durations: a.durations, loop: a.loop, label: a.label });
      return undefined;
    }),
  }),
  define({
    name: 'transform',
    description: 'flip_h, flip_v or shift (dx, dy) one frame or every frame, on every layer.',
    details: 'Flip (flip_h, flip_v) or shift (dx, dy) one frame or every frame. It acts on every layer of the frame, so a layer on top (a retouch, a variant) stays on what it was painted over; "layer" moves only that one. Answers how many layers it moved when more than one.',
    schema: z.object({
      path: pathArg,
      op: z.enum(['flip_h', 'flip_v', 'shift']),
      frame: z.number().int().nonnegative().optional().describe('default: every frame'),
      dx: z.number().int().optional(),
      dy: z.number().int().optional(),
      layer: z.number().int().nonnegative().optional().describe('only this layer (default: every layer)'),
    }),
    run: (a) => withAsset(a.path, asset => {
      const count = asset.layers!.length;
      if (a.layer !== undefined && a.layer >= count) {
        throw new Error(`transform: layer ${a.layer} does not exist (the asset has ${count} layer${count === 1 ? '' : 's'}, 0 to ${count - 1}); leave layer out to move every layer`);
      }
      const layers = a.layer !== undefined ? [a.layer] : asset.layers!.map((_, k) => k);
      const targets = a.frame !== undefined ? [a.frame] : Array.from({ length: frameCount(asset) }, (_, i) => i);
      if (a.frame !== undefined) getFrame(asset, a.frame, a.layer ?? 0); // a frame that does not exist fails, as before
      for (const i of targets) {
        for (const k of layers) {
          // A layer shorter than the base has nothing in this frame to move.
          if (a.layer === undefined && !asset.layers![k].frames[i]) continue;
          const f = getFrame(asset, i, k);
          const out = a.op === 'flip_h' ? flipH(f) : a.op === 'flip_v' ? flipV(f) : shift(f, a.dx ?? 0, a.dy ?? 0);
          setFrame(asset, i, out, k);
        }
      }
      return layers.length > 1 ? { frames: targets, layers: layers.length } : { frames: targets };
    }),
  }),
  define({
    name: 'despeckle',
    description: 'Clean lone pixels: each takes the color most of its 8 neighbours agree on; lines and outlines survive.',
    details: 'Clean the noise a pixelized render leaves: every lone pixel (fewer than "strength" of its 8 neighbours share its color) takes the color most of its neighbours agree on. Lines and outlines survive. Run it on one frame or every frame, with "passes" repetitions.',
    schema: z.object({
      path: pathArg,
      frame: z.number().int().nonnegative().optional().describe('default: every frame'),
      strength: z.number().int().min(1).max(3).optional().describe('1 lone pixels only (default), 2 also dash ends'),
      majority: z.number().int().min(3).max(8).optional().describe('neighbours that must agree (default 5)'),
      passes: z.number().int().min(1).max(10).optional(),
      layer: z.number().int().nonnegative().optional(),
    }),
    run: (a) => withAsset(a.path, asset => {
      const targets = a.frame !== undefined ? [a.frame] : Array.from({ length: frameCount(asset) }, (_, i) => i);
      let changed = 0;
      for (const i of targets) {
        const f = getFrame(asset, i, a.layer ?? 0);
        for (let pass = 0; pass < (a.passes ?? 1); pass++) changed += despeckle(f, a.strength ?? 1, a.majority ?? 5);
        setFrame(asset, i, f, a.layer ?? 0);
      }
      return { frames: targets, changed, ascii: targets.length === 1 ? renderAscii(composite(asset, targets[0])) : undefined };
    }),
  }),
  define({
    name: 'resize',
    description: 'Change the canvas size, anchoring the current pixels (default top-left). Frames larger than the new canvas are cropped.',
    schema: z.object({
      path: pathArg,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      anchor: z.enum(['top_left', 'center']).optional(),
    }),
    run: (a) => withAsset(a.path, asset => {
      const old = dims(asset);
      const ox = a.anchor === 'center' ? Math.floor((a.width - old.width) / 2) : 0;
      const oy = a.anchor === 'center' ? Math.floor((a.height - old.height) / 2) : 0;
      for (const layer of asset.layers!) {
        layer.frames = layer.frames.map(frame => {
          const out = Array.from({ length: a.height }, () => Array<number>(a.width).fill(0));
          for (let y = 0; y < old.height; y++) {
            for (let x = 0; x < old.width; x++) {
              const v = frame[y]?.[x] ?? 0;
              const nx = x + ox, ny = y + oy;
              if (v && nx >= 0 && ny >= 0 && nx < a.width && ny < a.height) out[ny][nx] = v;
            }
          }
          return out;
        });
      }
      asset.size = Math.max(a.width, a.height);
      if (a.width === a.height) { delete asset.width; delete asset.height; }
      else { asset.width = a.width; asset.height = a.height; }
      return { from: old, to: { width: a.width, height: a.height } };
    }),
  }),
  define({
    name: 'sound',
    description: 'Synthesize a sound recipe (JSON: oscillators, noise, pluck, filters, envelopes, echo) into a WAV; answers the sound_contact checks.',
    details: 'Synthesize a sound from a recipe (JSON: layers of oscillators, noise, Karplus-Strong pluck or crackle, with filters, ADSR, LFOs, echo and scattered events; seeded, loop: true splices the end into the start) into a WAV, PCM 16 bit mono at 22050 or 44100 Hz. recipe = a file, a directory of recipes (each to out_dir/<file>.wav) or the recipe object itself. A freq can be a note ("G5", or [t, "G5"] points). What a recipe does not say comes from sound of the nearest pgs.json: rate, and for its notes tuning (Hz of A4) and scale (notes outside it are warned about); the answer says what it took. What the recipe says wins. Returns the same checks as sound_contact.',
    schema: z.object({
      recipe: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('recipe file, directory of *.json recipes, or the recipe object'),
      out: z.string().optional().describe('WAV path (one recipe)'),
      out_dir: z.string().optional().describe('directory for the WAVs (named after each recipe file)'),
    }),
    run: (a) => {
      // What the recipes do not say comes from `sound` of the nearest
      // pgs.json (the rate; the tuning and the scale of their notes), and the
      // answer says it (#26).
      const near = typeof a.recipe === 'string' ? a.recipe : process.cwd();
      const project = nearestProject(near);
      const world = project?.style.sound ?? {};
      const tail = (rows: { name: string; inherited: string[]; style: string[] }[]) => {
        const lines: string[] = [];
        const took = [...new Set(rows.flatMap(r => r.inherited))];
        if (took.length && project) lines.push(inheritedLine(project.file, took));
        for (const r of rows) for (const w of r.style) lines.push(`  ⚠ ${r.name}: ${w}`);
        return lines.length ? `\n\n${lines.join('\n')}` : '';
      };
      if (typeof a.recipe !== 'string') {
        if (!a.out) throw new Error('out is required with an inline recipe');
        const prepared = prepareRecipe(a.recipe, world);
        const res = soundToWav(prepared.recipe);
        mkdirSync(dirname(a.out), { recursive: true });
        writeGuarded(a.out, res.wav);
        const row = { name: res.stats.name, inherited: prepared.inherited, style: prepared.warnings };
        return {
          data: { out: resolve(a.out), limited: res.limited, ...res.stats, inherited: prepared.inherited, style: prepared.warnings },
          text: statsTable([res.stats]) + tail([row]),
        };
      }
      const files = recipeFiles(a.recipe);
      if (files.length === 1 && a.out) {
        // The table for one sound too: the check is the answer, and a line
        // rebuilt from `data` is where it used to get lost over MCP.
        const row = writeSound(files[0], a.out, world);
        return { data: row, text: statsTable([row]) + tail([row]) };
      }
      if (!a.out_dir) throw new Error('out_dir is required for a directory of recipes (or out for a single one)');
      const rows = files.map(f => writeSound(f, resolve(a.out_dir!, basename(f).replace(/\.json$/, '.wav')), world));
      return { data: { written: rows.length, sounds: rows }, text: statsTable(rows) + tail(rows) };
    },
  }),
  define({
    name: 'music',
    description: 'Render a .partitura score (plucked and struck instruments) into a WAV; answers the sound_contact checks plus bars and notes.',
    details: 'Render a score (.partitura: text with tempo, meter, instruments and voices of notes like `A3 q`, `E4 h.`, rests, repeats, dynamics, grace notes, seeded humanizing, a small room; `loop: si` folds the tails onto the start so it loops without a seam) into a WAV, PCM 16 bit mono. Instruments are plucked and struck only: ' + Object.keys(INSTRUMENTS).join(', ') + ', or a JSON next to the score. score = a file, a directory of .partitura (each to out_dir/<file>.wav) or the score text itself. Returns the same checks as sound_contact plus bars and notes.',
    schema: z.object({
      score: z.string().describe('a .partitura file, a directory of them, or the score text (with a newline)'),
      out: z.string().optional().describe('WAV path (one score)'),
      out_dir: z.string().optional().describe('directory for the WAVs (named after each score file)'),
    }),
    run: (a) => {
      if (a.score.includes('\n')) {
        if (!a.out) throw new Error('out is required with an inline score');
        const res = musicToWav(parseScore(a.score, a.out.replace(/\.wav$/i, '.partitura')));
        mkdirSync(dirname(a.out), { recursive: true });
        writeGuarded(a.out, res.wav);
        return {
          data: { out: resolve(a.out), limited: res.limited, bars: res.bars, notes: res.notes, ...res.stats },
          text: `${statsTable([res.stats])}\n\n${res.bars} compases, ${res.notes} notas`,
        };
      }
      const files = scoreFiles(a.score);
      if (files.length === 1 && a.out) {
        const row = writeMusic(files[0], a.out);
        return { data: row, text: `${statsTable([row])}\n\n${row.bars} compases, ${row.notes} notas` };
      }
      if (!a.out_dir) throw new Error('out_dir is required for a directory of scores (or out for a single one)');
      const rows = files.map(f => writeMusic(f, resolve(a.out_dir!, basename(f).replace(/\.partitura$/, '.wav'))));
      return { data: { written: rows.length, pieces: rows }, text: statsTable(rows) };
    },
  }),
  define({
    name: 'sound_contact',
    description: 'Check WAVs without listening: duration, peak, RMS, DC, centroid, loop seam, silence at the ends, clicks; out= adds a PNG.',
    details: 'Check WAVs without listening: duration, peak and RMS (dBFS), DC offset, spectral centroid (low wind vs high chime), whether a loop splices without a jump, whether a one-shot starts and ends at silence, clicks. Prints a table; with out, also a PNG of waveform strips.',
    schema: z.object({
      paths: z.array(z.string()).min(1).describe('WAV files or directories of WAVs'),
      out: z.string().optional().describe('PNG path for the waveform sheet'),
    }),
    run: (a) => {
      const files = wavFiles(a.paths);
      const items = files.map(f => {
        const wav = readWav(f);
        return { name: basename(f).replace(/\.wav$/i, ''), wav, stats: analyzeWav(basename(f).replace(/\.wav$/i, ''), wav) };
      });
      const rows = items.map(it => it.stats);
      let png: Buffer | undefined;
      if (a.out && items.length) {
        png = encodePng(waveformSheet(items));
        mkdirSync(dirname(a.out), { recursive: true });
        writeGuarded(a.out, png);
      }
      const bad = rows.filter(r => r.warnings.length > 0).length;
      return { data: { sounds: rows, warnings: bad, out: a.out ? resolve(a.out) : null }, text: `${statsTable(rows)}\n\n${rows.length} sounds, ${bad} with warnings` };
    },
  }),
  define({
    name: 'font',
    description: 'Read a pixel font glyph sheet (a text drawing) and answer its metrics; with out, write it as an AngelCode BMFont (.fnt + PNG).',
    details: 'Read a pixel font — a glyph sheet: a text drawing whose canvas is a grid of cells, one glyph per cell, with "font: cell=WxH baseline= line= space= track=", "glyphs:" rows naming the characters of each row of cells, and optional "advance:"/"kern:" — and with out, write it as an AngelCode BMFont (.fnt + its page PNG), which Godot 4 loads with FontFile.load_bitmap_font() or imports on its own. The advance of a glyph is its ink plus track, so the drawing is the metric. A sheet a recipe wrote takes its <drawing>.retoque.txt on top. Returns the metrics and, with table, a line per glyph.',
    schema: z.object({
      path: z.string().optional().describe('the glyph sheet (.txt); default: type.font of the nearest pgs.json'),
      out: z.string().optional().describe('BMFont path (.fnt); the page PNG goes beside it with the same name'),
      ink: z.string().optional().describe('hex: paint the page in this one color (white: an engine can tint it)'),
      godot_import: z.boolean().optional().describe('also write the <out>.import Godot wants (scaling_mode=1)'),
      retouch: z.boolean().optional().describe('false to ignore the <drawing>.retoque.txt layer'),
      table: z.boolean().optional().describe('a line per glyph: cell, ink box and advance'),
    }),
    run: (a) => {
      const sheet = worldFont(a.path);
      const loaded = loadFont(sheet.path, a.retouch !== false);
      const font = loaded.font;
      const written = a.out ? writeBmFont(font, a.out, a.ink, a.godot_import === true) : undefined;
      const check = checkSheet(font);
      const data = {
        id: font.id,
        glyphs: font.glyphs.size,
        kernings: font.kern.size,
        ...font.metrics,
        retouch: loaded.retouch ?? null,
        problems: check.problems,
        ...(written ?? {}),
      };
      const lines = [
        `${font.id} · celda ${font.metrics.cellW}x${font.metrics.cellH} · ${font.glyphs.size} glifos · base ${font.metrics.baseline} · línea ${font.metrics.line} · espacio ${font.metrics.space} · track ${font.metrics.track}`,
        ...(loaded.retouch ? [`retoque · ${retouchLine(loaded.retouch)}`] : []),
        ...(loaded.retouch?.warning ? [loaded.retouch.warning] : []),
        ...check.problems.map(p => `✗ ${p}`),
        ...check.notes.map(n => `· ${n}`),
        ...(written ? [`→ ${written.fnt}`, `→ ${written.png}`, ...(written.import ? [`→ ${written.import}`] : [])] : []),
        ...(sheet.line ? [sheet.line] : []),
        ...(a.table ? ['', glyphTable(font)] : []),
      ];
      return { data: { ...data, ...(sheet.what ? { inherited: sheet.what } : {}) }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'font_web',
    description: 'Write a glyph sheet as a TrueType font (.ttf) plus its @font-face, pixel-exact at whole multiples of the design size.',
    details: 'The same glyph sheet out as a font a **browser** loads: a TrueType (.ttf) plus the @font-face that uses it. BMFont is for an engine and no browser reads it, so a web project made with PGS had to borrow a font from somewhere else. The advances are the ones the drawing measured, the same numbers BMFont carries, and every painted pixel becomes an exact square in the outline, so at the design body and its whole multiples (8, 16, 24 for a font drawn on an 8-wide cell) every edge lands on a whole screen pixel and there is no antialiasing to turn off. em= moves the design body; the default is the cell width.',
    schema: z.object({
      path: z.string().optional().describe('the glyph sheet (.txt); default: type.font of the nearest pgs.json'),
      out: z.string().describe('the font file (.ttf)'),
      css: z.string().optional().describe('also write the @font-face snippet here (.css), naming the font file beside it'),
      family: z.string().optional().describe('CSS family name (default: the name of the sheet)'),
      em: z.number().int().positive().optional().describe('drawing pixels in the em square (default: the cell width)'),
      retouch: z.boolean().optional().describe('false to ignore the <drawing>.retoque.txt layer'),
      table: z.boolean().optional().describe('a line per glyph: cell, ink box and advance'),
    }),
    run: (a) => {
      const sheet = worldFont(a.path);
      const loaded = loadFont(sheet.path, a.retouch !== false);
      const font = loaded.font;
      const written = writeWebFont(font, a.out, { css: a.css, em: a.em, family: a.family });
      const check = checkSheet(font);
      const { ttf: _ttf, advances: _advances, css: _css, ...data } = written;
      const lines = [
        `${font.id} · «${written.family}» · ${written.glyphs} glifos · em ${written.em} px (${written.unitsPerEm} unidades) · cuerpos ${written.sizes.join(', ')} px · ${written.contours} rectángulos · ${written.bytes} bytes`,
        `  línea: ascenso ${written.ascent} + descenso ${written.descent} + hueco ${written.lineGap} = ${written.ascent + written.descent + written.lineGap} px`,
        ...(loaded.retouch ? [`retoque · ${retouchLine(loaded.retouch)}`] : []),
        ...(loaded.retouch?.warning ? [loaded.retouch.warning] : []),
        ...check.problems.map(p => `✗ ${p}`),
        `→ ${written.ttf_path}`,
        ...(written.css_path ? [`→ ${written.css_path}`] : []),
        ...(sheet.line ? [sheet.line] : []),
        ...(a.table ? ['', glyphTable(font)] : []),
      ];
      return { data: { ...data, advances: written.advances, problems: check.problems, retouch: loaded.retouch ?? null }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'font_contact',
    description: 'Set a phrase with a pixel font at whole scales: the image plus what to look at (missing glyphs, touching pairs, stray ink).',
    details: 'Look at a pixel font without eyes: sets a phrase with it at whole-number scales and answers the image plus what has to be looked at — characters of the phrase the font has no glyph for, the width and the rows of the cell the ink really uses, pairs of letters that touch with no pixel between them, cells with ink that no "glyphs:" row claims, glyphs that fill the cell or cross the baseline. This is the control sheet of typography, the way contact is for sprites and sound_contact for WAVs.',
    schema: z.object({
      path: z.string().optional().describe('the glyph sheet (.txt); default: type.font of the nearest pgs.json'),
      text: z.string().optional().describe('the phrase (newlines start a line); default: one that uses every Spanish glyph'),
      scale: z.union([z.number().int().positive(), z.array(z.number().int().positive()).min(1)]).optional().describe('whole-number scale, or several stacked (default 1, 2, 3)'),
      out: z.string().optional().describe('PNG path for the sample'),
      background: z.string().optional().describe('hex behind the text (default a dark page)'),
      color: z.string().optional().describe('hex for the ink (default: the colors the sheet is drawn in)'),
      guides: z.boolean().optional().describe('paint the baseline of every line'),
      retouch: z.boolean().optional().describe('false to ignore the <drawing>.retoque.txt layer'),
      table: z.boolean().optional().describe('also a line per glyph'),
    }),
    run: (a) => {
      const sheet = worldFont(a.path);
      const loaded = loadFont(sheet.path, a.retouch !== false);
      const font = loaded.font;
      const text = a.text ?? SAMPLE_TEXT;
      // The bodies the world allows (type.steps) are the scales to look at,
      // when the sheet is the world's own font: each step over the design size.
      const steps = a.scale === undefined && sheet.steps ? stepScales(sheet.steps, font.metrics.cellW) : undefined;
      const inheritedWhat = [...(sheet.what ?? []), ...(steps?.scales.length ? [`cuerpos ${sheet.steps!.join(', ')} px (${steps.scales.map(k => `${k}x`).join(', ')})`] : [])];
      const scales = a.scale === undefined ? (steps?.scales.length ? steps.scales : [1, 2, 3]) : Array.isArray(a.scale) ? a.scale : [a.scale];
      const check = checkPhrase(font, text);
      const img = renderSample(font, text, {
        scales,
        background: a.background ?? '#1b1a21',
        color: a.color,
        guides: a.guides,
      });
      const png = encodePng(img);
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeGuarded(a.out, png); }
      const report = fontReport(font, check, scales);
      return {
        data: {
          id: font.id, ...font.metrics, glyphs: font.glyphs.size,
          width: check.width, height: check.height, ink_rows: check.inkRows,
          missing: check.missing, touching: check.touching,
          problems: check.problems, notes: check.notes,
          retouch: loaded.retouch ?? null,
          out: a.out ? resolve(a.out) : null,
        },
        text: [
          a.table ? `${report}\n\n${glyphTable(font)}` : report,
          ...(loaded.retouch ? [`retoque · ${retouchLine(loaded.retouch)}`] : []),
          ...(loaded.retouch?.warning ? [loaded.retouch.warning] : []),
          ...(inheritedWhat.length ? [inheritedLine(sheet.project!, inheritedWhat)] : []),
          ...(steps?.off.length ? [`  · cuerpos que no son múltiplo entero de ${font.metrics.cellW} px: ${steps.off.join(', ')} (no se muestran)`] : []),
        ].join('\n'),
        png,
      };
    },
  }),
  define({
    name: 'font_compose',
    description: 'Build a glyph sheet from a hand-drawn base plus derived glyphs (accents, eñe, turned ¿ ¡, mirrored); keeps the retouch.',
    details: 'Build a glyph sheet out of another: every row of a hand-drawn base, then the glyphs a spec derives from it — a letter with a mark stamped over it (the accents and the eñe of Spanish), a glyph turned 180° (¿ ¡) or mirrored. The drawing it writes carries generated_by: font_compose, so a hand pass goes to <drawing>.retoque.txt and survives running this again, and it refuses to overwrite a drawing made by hand or by another recipe (force to do it anyway). It answers what the retouch beside the sheet paints and takes out, and warns when the hand decides more than a fifth of the drawing.',
    schema: z.object({
      spec: z.string().describe('the compose spec (JSON: base, glyphs: [{ char, over|turn|flip, mark, row, dx, dy, align, advance }])'),
      out: z.string().describe('the sheet it writes (a .txt text drawing)'),
      force: z.boolean().optional().describe('overwrite a drawing this command did not make'),
    }),
    run: (a) => {
      const data = writeComposed(a.spec, a.out, a.force === true);
      const lines = [
        `${basename(data.out)}: ${data.glyphs} glifos (${data.composed} derivados en ${data.rows} fila(s)), ${data.size}`,
        ...(data.retouch ? [`retoque · ${retouchLine(data.retouch)}`] : []),
        ...(data.retouch?.warning ? [data.retouch.warning] : []),
      ];
      return { data, text: lines.join('\n') };
    },
  }),
  define({
    name: 'font_variant',
    description: 'Derive a glyph sheet (outline, shadow, bold) from another; advances follow the ink. Answers which counterforms closed or narrowed.',
    details: 'Derive a whole glyph sheet from another one: outline (dilate the ink and subtract it: the letter comes out hollow), shadow (a copy of the ink offset underneath, in a color of its own) or bold (the smear: the ink unioned with itself moved a pixel over). Same machine as font_compose, one step further, and the same contract: the sheet it writes carries generated_by: font_variant, a hand pass goes to <sheet>.retoque.txt and survives running it again, it refuses to overwrite a drawing made by hand or by another recipe (force to do it anyway), and it says how much of the drawing the retouch beside it decides. **The advance recalculates itself for free**, because the advance of a glyph is its ink plus track: a fatter letter takes more room and the metric follows with no table to keep in sync — which is also why the gap between two letters is preserved and an outline can never glue two of them together. The cell, the baseline and the line grow to fit, so nothing is clipped and the leading is the one the base had. What is not free is the counterform: at a small cell a smear of one pixel fills in every white that was one pixel wide, so this measures the counterforms of every glyph before and after and **answers which ones closed, which narrowed and which are down to a single pixel** — the letters to go and fix by hand. A counterform is a white of the glyph\'s ink box boxed in along one axis, so the open gaps of an "m", the aperture of a "c" and the channels of an "E" count as much as the bowl of an "o": an "m" that filled in has no hole to lose and is still unreadable.',
    schema: z.object({
      path: z.string().describe('the base glyph sheet (a .txt text drawing)'),
      out: z.string().describe('the derived sheet it writes (a .txt text drawing)'),
      kind: z.enum(VARIANT_KINDS).describe('outline: dilate and subtract; shadow: an offset copy underneath; bold: the smear'),
      dx: z.number().int().optional().describe('shadow/bold: pixels to the right (negative: left). Default 1'),
      dy: z.number().int().optional().describe('shadow/bold: pixels down (negative: up). Default 1 for a shadow, 0 for the smear'),
      color: z.string().optional().describe('shadow: its hex (default: the ink of the sheet at half brightness)'),
      id: z.string().optional().describe('id of the new sheet (default: <base id>_<kind>)'),
      name: z.string().optional().describe('name of the new sheet (default: <base name> contorno/sombra/negrita)'),
      force: z.boolean().optional().describe('overwrite a drawing this command did not make'),
    }),
    run: (a) => {
      const data = writeFontVariant(a.path, a.out, {
        kind: a.kind, dx: a.dx, dy: a.dy, color: a.color, id: a.id, name: a.name,
      }, a.force === true);
      const lines = [
        variantReport(data, basename(data.out)),
        `  ${basename(data.out)}: ${data.size}, ${data.sheet_glyphs} glifos`,
        ...(data.retouch ? [`retoque · ${retouchLine(data.retouch)}`] : []),
        ...(data.retouch && data.closed.length
          ? [`  con el retoque encima siguen cerrados: ${data.closed_after_retouch.length ? data.closed_after_retouch.join(' ') : 'ninguno'}`]
          : []),
        ...(data.retouch?.warning ? [data.retouch.warning] : []),
      ];
      return { data, text: lines.join('\n') };
    },
  }),
  define({
    name: 'doc',
    description: 'The whole documentation of one command: its long description and every field, nested ones included, with type and description.',
    details: 'The MCP catalog carries one sentence per tool and only the short top-level field descriptions (mcpcatalog.ts): every session pays for it. The rest lives in the zod schema of the command, and this reads it from there, so it cannot go stale.',
    schema: z.object({
      command: z.string().describe('the command name (pgs_ or pss_ prefix allowed)'),
    }),
    run: (a) => {
      const name = a.command.replace(/^(pgs|pss)_/, '');
      // a map step by its own name (settle, glow…) is its map_ command
      const cmd = findCommand(name) ?? findCommand(`map_${name}`);
      if (!cmd) throw new Error(`unknown command "${name}". Known: ${commands.map(c => c.name).join(', ')}`);
      return { data: { command: cmd.name, schema: fullSchema(cmd) }, text: commandDoc(cmd) };
    },
  }),
  define({
    name: 'batch',
    description: 'Run a list of commands as one transaction: every step is checked before any runs; answers a line per step. dry_run, keep_going.',
    details: 'Run a whole recipe of commands as one transaction, in this process: a list of steps, each { "command": "<name>", …its arguments }, inline or in a JSON file (the array, or an object with "steps"). Every step is checked against its command\'s schema **before any of them runs**, and a step that does not check out stops the batch with every problem named at once and nothing written — which is the point: on its own, a call validates itself, writes its files and leaves, so a typo in step nine leaves half a recipe on disk. Answers a line per step saying what it did. Paths are relative to where you run it, as on the command line. dry_run only checks; keep_going runs them all and reports every failure instead of stopping at the first (independent steps: a folder of drawings). A batch cannot contain a batch.',
    schema: z.object({
      steps: z.array(z.record(z.string(), z.unknown())).min(1).optional()
        .describe('the steps: [{ "command": "from_ascii", "txt": "a.txt", "out": "a.pss.json" }, …]'),
      recipe: z.string().optional().describe('a JSON file with the steps (the array, or { "steps": [...] }), instead of steps'),
      dry_run: z.boolean().optional().describe('check every step and write nothing'),
      keep_going: z.boolean().optional().describe('run every step and report every failure, instead of stopping at the first'),
    }),
    run: async (a) => {
      if (!a.steps && !a.recipe) throw new Error('batch needs steps or recipe');
      if (a.steps && a.recipe) throw new Error('batch takes steps or recipe, not both');
      const where = a.recipe ? basename(a.recipe) : 'batch';
      const raw = a.recipe ? JSON.parse(readFileSync(a.recipe, 'utf8')) : a.steps;
      const planned = planBatch(batchSteps(raw, where), findCommand);
      if (a.dry_run) {
        const dry: BatchResult = {
          total: planned.length, done: 0, failed: 0, skipped: planned.length,
          steps: planned.map(s => ({ index: s.index, command: s.command, ok: true })),
        };
        return { data: { ...dry, dry_run: true }, text: batchReport(dry, true) };
      }
      // `oneLine`, not `briefLine`: a report is a line per step, so a step that
      // brings its own text (map_export, sound) is summarized, not pasted in.
      const result = await runBatch(planned, { line: oneLine, keepGoing: a.keep_going === true });
      if (result.failed) {
        throw new Error(`${result.failed} of ${result.total} step(s) failed\n${batchReport(result)}`);
      }
      return { data: result, text: batchReport(result) };
    },
  }),
];

export function findCommand(name: string): Command | undefined {
  return commands.find(c => c.name === name);
}

export async function runCommand(name: string, rawArgs: unknown): Promise<CommandResult> {
  const cmd = findCommand(name);
  if (!cmd) throw new Error(`unknown command "${name}". Known: ${commands.map(c => c.name).join(', ')}`);
  const parsed = cmd.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`invalid arguments for ${name}: ${issues}`);
  }
  return await cmd.run(parsed.data);
}
