// The command registry: one place that defines what the headless tools can do.
// The CLI (cli.ts) and the MCP server (mcp.ts) are thin adapters over this.
//
// Every command takes a plain object validated by a zod schema and returns a
// JSON-serializable result. Commands that touch an asset on disk take `path`
// (the asset JSON, by convention *.pss.json) and save it back when they change it.

import { dirname, resolve, basename, relative } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { SpriteAsset } from '../lib/types';
import {
  addFrame, colorIndex, composite, createAsset, dims, duplicateFrame, findAnimation, frameCount,
  getFrame, loadAsset, normalizeHex, removeAnimation, removeFrame, saveAsset, setAnimation, setFrame, summarize,
} from './asset';
import { blankImage, encodePng, readPng, writePng, type Rgba } from './png';
import { fitImageColors, fitPalette, knockOutColor } from './ops';
import { asciiLegend, contactSheet, paletteSheet, renderAscii, renderFrame } from './render';
import { appendAsset, exportSheet, importSheet } from './sheet';
import { importCharacter } from './character';
import { ANIMATION_KINDS, animateAsset } from './animate';
import { figureAsset, type FigureRecipe } from './figure';
import { generateImage, illustrate, loadFalKey, pixelize, pngDataUri } from './ai';
import { readImage } from './image';
import { applyAnswer, editZone, mergeOutsideZone, zoneCoverage, type ZoneSpec } from './zones';
import { cutPiece, estimateDepth, layerMap, paintedLights, splitLayers } from './backdrop';
import { checkFit, fromAscii, legendGlyphs, toAscii } from './ascii';
import { paintTerrain, type TerrainRecipe } from './terrain';
import { contactSheetMany, fullestFrame, lintAsset } from './inspect';
import { mapLint } from './maplint';
import { gridMask } from './gridmask';
import { areaStep, lightStep, materialSchema, pathStep, scatterStep, waterStep, type MapRecipe, type MapStep } from './maprecipe';
import { cliffStep, featureStep, flightStep, furnishStep, networkStep, ropeStep, sunStep, wallStep } from './mapsteps/schema';
import { castStep, dampStep, overlookStep, strawStep, woodedgeStep } from './mapsteps/lowlandschema';
import {
  beachStep, claypanStep, ditchStep, floodwaterStep, footpathStep, linesStep, meadowStep, mudbankStep, pierStep, reedsStep,
  rocksStep, shimmerStep, slabsStep, umbraStep, wildwoodStep,
} from './mapsteps/riverbankschema';
import {
  arenaStep, ashlarStep, balustradeStep, cloudbanksStep, coursesStep, fallenStep, motesStep, overhangStep, runnerStep, sprigsStep, stairwayStep,
} from './mapsteps/terraceschema';
import { carvingsStep, cavernStep, formationStep, gloomStep, hangrootsStep, poolStep, rootladderStep, softenStep } from './mapsteps/cavernschema';
import { glenStep, cushionsStep, mudtrailStep, shingleStep, ledgeslabsStep, plungeStep, wetstonesStep, wetwoodStep, glenshadeStep, glenlitterStep, glenflowStep, boughsStep } from './mapsteps/glenschema';
import { cloudseaStep, conifersStep, cragStep, ledgeStep, mountainStep, pondStep, shadowsStep, shrubStep, snowfieldStep, sparklesStep, spindriftStep, stonesStep, tracksStep, trailStep, tussocksStep } from './mapsteps/alpineschema';
import { beamsStep, canesStep, outcropStep, shadeStep, thicketStep, undergrowthStep } from './mapsteps/groveschema';
import { compareImages, compareRecipe, exportDirs, exportGround, exportRecipe, gameGrid, layersImage, readRecipe, recipeMaterials, renderRecipe, upsertStep, writeRecipe } from './mapfile';
import { makeVariant } from './variant';
import { stampDrawing } from './stamp';
import { facePoints, facePointsTable } from './face';
import {
  analyzeWav, parseRecipe, readWav, recipeFiles, soundToWav, statsTable, waveformSheet, wavFiles, writeSound,
  parseScore, musicToWav, scoreFiles, writeMusic, INSTRUMENTS,
} from './sound';
import {
  applyDrawOps, applyFx, despeckle, flipH, flipV, generateFxAnimation, replaceIndex, shift, type DrawOp,
} from './ops';
import { checkPhrase, checkSheet, fontReport, glyphTable, renderSample } from './font';
import { loadFont, writeBmFont, writeComposed } from './fontfile';

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
  description: string;
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
function lintRecipe(path: string): CommandResult {
  const r = renderRecipe(path);
  const materials = recipeMaterials(r, path);
  const palette = Object.values(r.colors);
  const [ox, oy] = r.map.origin;
  const [mx, my] = r.recipe.margin ?? [0, 0];
  const cell = r.map.cell;
  const area = { x: ox, y: oy, w: r.map.width - 2 * mx * cell, h: r.map.height - 2 * my * cell };
  const reports: Record<string, ReturnType<typeof mapLint>> = {};
  const lines: string[] = [];
  for (const [name, layer] of Object.entries(r.map.layers)) {
    const ground = name === 'ground';
    const rep = mapLint(layersImage([layer], r.colors), {
      area: ground ? area : undefined, palette, materials, ground, architecture: r.recipe.lint?.architecture, cell,
    });
    reports[name] = rep;
    lines.push(`${rep.problems.length ? '✗' : '✓'} ${name}`, ...rep.problems.map(p => `    ${p}`));
    if (ground) lines.push(`    ${rep.loose} lone px in ${rep.changes} material changes`);
  }
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
    name: 'info',
    description: 'Summary of an asset: size, frames, palette, animations.',
    schema: z.object({ path: pathArg }),
    run: (a) => ({ data: summarize(loadAsset(a.path)) }),
  }),
  define({
    name: 'inspect',
    description: 'Everything about an asset (size, frames, layers, palette, animations), as JSON. Over MCP the commands that write answer one line; this is the detail.',
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
        writeFileSync(a.out, png);
      }
      return { data: { out: a.out ?? null, scale, bytes: png.length }, png };
    },
  }),
  define({
    name: 'import_sheet',
    description: 'Cut a PNG sprite sheet on a grid into an asset, keeping every color exactly. Tags map grid frames to animations ("row:N", "col:N" or a list, row-major). With "into", the frames are appended to that existing asset (same frame size; palette merged by hex).',
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
      saveAsset(a.out, asset);
      return { data: { grid: { columns, rows }, asset: summarize(asset) } };
    },
  }),
  define({
    name: 'import_character',
    description: 'Import a whole character from a pack folder in one go, with the standard tags (idle/walk/attack/hurt per direction: down, up, left, right; plus technique and die). Layout "ninja_separate": Idle/Walk/Attack/Special1/Dead PNGs. "ninja_sheet": one SpriteSheet.png, 4 columns × N step rows.',
    schema: z.object({
      dir: z.string().describe('folder with the PNGs'),
      out: pathArg,
      layout: z.enum(['ninja_separate', 'ninja_sheet']),
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
      const { asset, sheets } = importCharacter({
        dir: a.dir, layout: a.layout, id, name: a.name, frameSize: a.frame_size,
        walkFps: a.walk_fps, attackMs: a.attack_ms, hurtMs: a.hurt_ms, techniqueMs: a.technique_ms, dieMs: a.die_ms,
      });
      saveAsset(a.out, asset);
      return { data: { sheets, asset: summarize(asset) } };
    },
  }),
  define({
    name: 'animate',
    description: `Generate an animation from one base pose with the anatomy engine (${ANIMATION_KINDS.join(', ')}), optionally with a direction suffix ("walk_down", "attack_left": left is generated as right and flipped). Appends the frames and tags them. Use "anatomy" (or the asset's) to fix where neck, waist, knees and ankles are when the automatic guess is off.`,
    schema: z.object({
      path: pathArg,
      base: z.number().int().nonnegative().describe('frame index of the base pose'),
      anim: z.string(),
      name: z.string().optional().describe('tag name (default: anim)'),
      fps: z.number().positive().optional(),
      loop: z.boolean().optional(),
      glow: color.optional().describe('glow color for cast'),
      anatomy: z.object({
        neckRow: z.number().int().optional(), waistRow: z.number().int().optional(),
        kneeRow: z.number().int().optional(), ankleRow: z.number().int().optional(),
      }).optional(),
    }),
    run: (a) => withAsset(a.path, asset => ({ frames: animateAsset(asset, a) })),
  }),
  define({
    name: 'figure',
    description: 'Draw a full-body fighter from a rig in 3/4 (view "front": turned to the lower left, a rival; "back": from behind turned to the upper right, your side of a diagonal battle) with every animation of the contract (idle, walk, attack, technique, hurt, die), or only the ones in the recipe field anims (which also takes sit: cross-legged, hands in the lap, breathing in and out; and lotus: the same seat with the hands on the knees, still). The recipe sets build (build.spread opens the knees: about 1.4 for a lotus seen from the front), skin, hair style (short, topknot, ponytail, long, messy, bun) and band, hat (cap, turban), beard, top and sleeves (long, none, wide), robe skirt, sash, pants, shoes and the technique glow, each as one color or three tones [light, mid, shade]. Each frame is drawn whole (the head never comes off), shaded and outlined.',
    schema: z.object({
      recipe: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('recipe JSON path, or the recipe object'),
      out: pathArg,
      view: z.enum(['front', 'back']).optional().describe('overrides the recipe view'),
      id: z.string().optional(),
    }),
    run: (a) => {
      const raw = typeof a.recipe === 'string' ? JSON.parse(readFileSync(a.recipe, 'utf8')) : a.recipe;
      const rec = { ...(raw as unknown as FigureRecipe) };
      if (a.view) rec.view = a.view;
      rec.id = a.id ?? rec.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      const asset = figureAsset(rec);
      saveAsset(a.out, asset);
      return { data: summarize(asset) };
    },
  }),
  define({
    name: 'anatomy',
    description: 'Store body rows on the asset (neck, waist, knee, ankle, in pixels from the top) so every "animate" call uses them.',
    schema: z.object({
      path: pathArg,
      neckRow: z.number().int().optional(), waistRow: z.number().int().optional(),
      kneeRow: z.number().int().optional(), ankleRow: z.number().int().optional(),
      clear: z.boolean().optional(),
    }),
    run: (a) => withAsset(a.path, asset => {
      if (a.clear) { delete asset.anatomy; return { anatomy: null }; }
      asset.anatomy = { ...(asset.anatomy ?? {}), mode: 'humanoid' };
      for (const k of ['neckRow', 'waistRow', 'kneeRow', 'ankleRow'] as const) if (a[k] !== undefined) asset.anatomy[k] = a[k];
      return { anatomy: asset.anatomy };
    }),
  }),
  define({
    name: 'pixelize',
    description: 'Turn any PNG (an AI render, a photo of a drawing) into a one-frame pixel-art asset: samples it on a square grid, removes a flat background (lime green or the dominant corner color) and quantizes the colors. "fit" maps the result onto another asset\'s palette afterwards.',
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
      speck_fraction: z.number().min(0).max(1).optional().describe('blobs smaller than this fraction of the largest are specks and vanish (default 0.01)'),
    }),
    run: (a) => {
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      const asset = pixelize(readImage(a.png), {
        id, name: a.name, size: a.size, maxColors: a.max_colors, alphaThreshold: a.alpha_threshold,
        removeBackground: a.remove_background, category: a.category, crop: a.crop, speckFraction: a.speck_fraction,
      });
      let table: unknown = null;
      if (a.fit) table = fitPalette(asset, Object.values(loadAsset(a.fit).palette));
      saveAsset(a.out, asset);
      return { data: { fit: table, asset: summarize(asset) }, png: encodePng(renderFrame(asset, composite(asset, 0), 4)) };
    },
  }),
  define({
    name: 'illustrate',
    description: 'Turn a PNG into a full-bleed illustration of width x height (a card picture, a book plate): unlike pixelize nothing is cropped to the figure and no background is removed. The render is cut to the aspect around focus_x/focus_y ("cover"), every cell averages the pixels under it, colors are reduced with median cut, "fit" maps them onto a palette and "despeckle" passes clean lone pixels.',
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
      accent: z.number().min(0).max(1).optional().describe('keep bright accents: a cell this vivid-covered (0..1) takes the vivid color (default off)'),
      quantize: z.enum(['median', 'palette']).optional().describe('median (default): median cut, then fit; palette: cells go straight to the fit palette (small vivid areas keep their color)'),
      dither: z.number().min(0).max(1).optional().describe('ordered 4x4 dithering between the two nearest close colors, 0..1 (default off): in-between tones for a wide scene; use no despeckle with it'),
      dither_reach: z.number().min(0).max(1).optional().describe('OKLab distance under which two colors may dither (default 0.12)'),
      category: category.optional(),
      base: pathArg.optional().describe('an earlier illustration of the same size: only the cells inside the zone (rect, polygon or mask, in fractions of the render) are redrawn, the rest keeps base'),
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
      saveAsset(a.out, asset);
      return { data: { fit: table, despeckled: changed, redrawn, asset: summarize(asset) }, png: encodePng(renderFrame(asset, composite(asset, 0), 4)) };
    },
  }),
  define({
    name: 'generate',
    description: 'Ask fal.ai for an image from a prompt (the same pixel-art wrapper prompt the editor uses; "raw" sends the prompt untouched) and save it as PNG. Needs FAL_AI_KEY in the environment or in supabase/functions/.env. Chain with pixelize to get an asset.',
    schema: z.object({
      prompt: z.string().min(3),
      out: z.string().describe('PNG path'),
      image_url: z.string().url().optional().describe('reference image for image-to-image'),
      image: z.string().optional().describe('a local PNG as the reference for image-to-image (sent as a data URI): fix a render with an instruction ("close the opening with rock") instead of rolling again'),
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
      writeFileSync(a.out, img.bytes);
      return { data: { out: resolve(a.out), model: img.model, prompt: img.prompt, bytes: img.bytes.length } };
    },
  }),
  define({
    name: 'edit_zone',
    description: 'Redo one zone of a render with the edit model and an instruction ("close this opening with rock and roots"): the zone (rect, polygon or mask, in fractions of the image) plus some context goes to the model, and its answer (PNG or JPEG) is blended back only inside the zone, with a soft edge; the rest stays byte for byte. Then illustrate the result with base=<the old illustration> and the same zone to redraw only those cells. Needs FAL_AI_KEY like generate.',
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
    description: 'A depth map of a render (PNG or JPEG) from a monocular depth model on fal: light is near, dark is far. Feed it to layers. Needs FAL_AI_KEY like generate.',
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
    description: 'Split a full-bleed illustration (a battle backdrop) in depth layers for parallax, from a depth map of the render it came from (depth; light near) cut with the same focus and zoom illustrate used. outs lists the layer assets far to near; the farthest is opaque, each nearer one only has its cells (alpha elsewhere), and every layer is painted on a few cells under the nearer ones so sliding them apart opens no hole.',
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
        saveAsset(out, layer);
      });
      return { data: { layers: a.outs.map((o, k) => ({ out: resolve(o), share: Math.round(share[k] * 1000) / 1000 })) } };
    },
  }),
  define({
    name: 'lights',
    description: 'The light sources a picture painted (torches, lanterns, a glowing window): bright vivid cores, merged when close, with center (fraction and pixels), painted color and glow radius in pixels (where the light around falls back to the dark of the picture). Writes them as JSON next to the picture so a game lights its scene where the picture says.',
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
      writeFileSync(a.out, JSON.stringify(found, null, 2) + '\n');
      return { data: { out: resolve(a.out), lights: found.lights } };
    },
  }),
  define({
    name: 'cutout',
    description: 'Cut a moving piece out of a still picture (the clouds of a battle backdrop, a waterfall, a boat, the flame of a torch): the cells inside a zone (rect, polygon or mask, in fractions of the picture) whose color passes the filter (colors, lightness) go to out, transparent elsewhere; base_out is the picture with that hole painted over by the nearest uncut cell of the row or column, so the piece can drift a few pixels or blink without a copy of itself showing underneath. Chain several: each base_out is the next path.',
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
      saveAsset(a.out, piece);
      if (a.base_out) {
        base.id = basename(a.base_out).replace(/\.pss\.json$|\.json$/i, '');
        saveAsset(a.base_out, base);
      }
      return { data: { out: resolve(a.out), base_out: a.base_out ? resolve(a.base_out) : undefined, cells, share: Math.round(cells / (width * height) * 1000) / 1000 } };
    },
  }),
  define({
    name: 'terrain',
    description: 'Paint the whole ground of a map as one picture from a grid of letters (one material per cell), so borders meander instead of stepping cell by cell: each pixel takes the material that weighs most around it, sampled at a point moved by smooth noise (wobble). Materials have tones (dark to light) picked in wide patches with a dither only at the seams, a layer (water low, mud mid, grass high) that gives a cast rim under a higher bank, the bank face (lip) on its south side, an edge band (foam) and fringe blades over the line; depth picks a tone by distance to the shore; stamps drop pebbles or flowers away from the border; decals put a stamp at a fixed place (the stones of a ford); shadows (ellipses in cells) darken a tone. pieces writes sparse dashes over some materials to <out>_<id>.pss.json for a game to animate (glints, current). The recipe is a JSON file or inline object; deterministic by seed.',
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
      saveAsset(a.out, result.asset);
      const written: Record<string, number> = {};
      for (const p of result.pieces) {
        const path = a.out.replace(/\.pss\.json$/i, '') + `_${p.id}.pss.json`;
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
    description: 'Create or replace an asset from a text drawing: a header (id, name, category, size, description, fit, anim lines), a legend "glyph = #hex [name]" ("." transparent) and one or more frames, each after a "== <anim> <pos>" line. Rows of different length, unknown glyphs, sizes that do not match and (with fit) colors off the palette fail with the line. With "into", the frames and animations are appended to an existing asset instead (a pose drawn apart joins a character). The inverse of to_ascii.',
    schema: z.object({
      txt: z.string().optional().describe('text file path'),
      text: z.string().optional().describe('the text itself, instead of txt'),
      out: pathArg,
      fit: pathArg.optional().describe('asset whose palette every color must belong to (overrides the "fit:" header)'),
      id: z.string().optional().describe('when the header has none (default: the txt file name)'),
      into: pathArg.optional().describe('existing asset (same frame size) to append the drawing to: its frames go after the ones there and its animations come along, shifted (a pose drawn apart joins a character built elsewhere); out is written with the result'),
    }),
    run: (a) => {
      if (!a.txt && a.text === undefined) throw new Error('from_ascii needs txt or text');
      const text = a.text ?? readFileSync(a.txt!, 'utf8');
      const { asset, fit } = fromAscii(text, {
        sourcePath: a.txt, defaultId: a.id ?? (a.txt ? undefined : basename(a.out).replace(/\.pss\.json$|\.json$/i, '')),
      });
      const fitPath = a.fit ?? fit;
      if (fitPath) {
        try {
          checkFit(asset, Object.values(loadAsset(fitPath).palette), basename(fitPath), legendGlyphs(text));
        } catch (err) {
          throw new Error(`${a.txt ? basename(a.txt) : 'text'}: ${(err as Error).message}`);
        }
      }
      const result = a.into ? appendAsset(loadAsset(a.into), asset) : asset;
      saveAsset(a.out, result);
      return { data: summarize(result), png: encodePng(contactSheet(asset, { scale: 4 })) };
    },
  }),
  define({
    name: 'variant',
    description: 'Make a variant of an asset without touching it: copy "path" to "out" with a new id, add a layer on top and paint the changes there — an "overlay" text drawing in the from_ascii format (every glyph but "." is laid over the base) and/or drawing "ops". The base layers are copied as they are, so after the base changes the same call rebuilds the variant. Returns how many pixels the variant paints and how many of those differ from the base.',
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
      const { asset, painted, changed } = makeVariant(loadAsset(a.path), {
        id, name: a.name, layer: a.layer, frame: a.frame, ops: a.ops as DrawOp[] | undefined,
        overlay, overlaySource: a.overlay,
      });
      saveAsset(a.out, asset);
      return { data: { painted, changed, asset: summarize(asset) }, png: encodePng(contactSheet(asset, { scale: 4 })) };
    },
  }),
  define({
    name: 'stamp',
    description: 'Stamp a directional drawing over a character built elsewhere: a garment on a borrowed body. The drawing (from_ascii format, the size of the sprite) holds one frame per view, each after its own "== <view>" line, where "." leaves what was already there; every frame of every animation of that view gets it, shifted with the head (the first row of the frame with any pixel) so it follows the bob of the walk. At 16 px this is what tells apart three characters that share a body from a pack. The naming convention is a parameter: "anims" picks which animations a view covers and "anchor" the one whose first frame sets the reference head. Returns, per view, the animations it reached and how many frames and pixels it painted.',
    schema: z.object({
      path: pathArg.describe('the character, stamped in place'),
      txt: z.string().optional().describe('text file with the drawing'),
      text: z.string().optional().describe('the drawing itself, instead of txt'),
      fit: pathArg.optional().describe('asset whose palette every color of the drawing must belong to'),
      anims: z.string().optional().describe('animations a view covers, "*" being anything (default "*_{view}": idle_down, walk_down, …)'),
      anchor: z.string().optional().describe('animation whose first frame sets the reference head row (default "idle_{view}"); a view without it is skipped'),
      align: z.enum(['head', 'none']).optional().describe('"head" (default) shifts the stamp with the head of each frame; "none" never shifts it'),
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
    description: 'Find the face on a sprite nobody drew for you, frame by frame: the eyes (ink with skin on both sides, two facing the camera and one in profile), the hairline (hair with the shade of the forehead under it, with how many rows of hair sit above that shade) and the skin (every pixel of it and its box, so what is painted stays off the outline). The colors are parameters, the view of each frame comes from the animations ("anims", "*_{view}" by default), and nothing is drawn — it is what a moustache, a headband, glasses, a scar or a tear need in order to land on a head that bobs with the walk and turns with the direction.',
    schema: z.object({
      path: pathArg,
      skin: z.array(z.string()).optional().describe('skin colors, lit and shaded; with "ink", the eyes and the skin box are reported'),
      ink: z.array(z.string()).optional().describe('outline / eye colors'),
      hair: z.array(z.string()).optional().describe('hair colors; with "forehead", the hairline is reported'),
      forehead: z.array(z.string()).optional().describe('the shade of the forehead right under the hairline'),
      anims: z.string().optional().describe('animations a view covers, "*" being anything (default "*_{view}")'),
      views: z.array(z.string()).optional().describe('views looked for, in order (default down, up, left, right)'),
      table: z.boolean().optional().describe('answer one line per frame to read in a terminal instead of the JSON a script needs'),
    }),
    run: (a) => {
      const result = facePoints(loadAsset(a.path), a);
      return { data: result, text: a.table ? facePointsTable(result) : undefined };
    },
  }),
  define({
    name: 'to_ascii',
    description: 'Write an asset in the from_ascii text format (header, legend, every frame with its animation slots), so it can be edited as text and rebuilt exactly. Multi-layer assets are flattened. "glyphs_from" gives each color the glyph of its index in another palette, so files on the same palette share glyphs.',
    schema: z.object({
      path: pathArg,
      out: z.string().optional().describe('text file to write; when omitted the text is only returned'),
      glyphs_from: pathArg.optional().describe('asset whose palette indices pick the glyphs'),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const { text, flattened } = toAscii(asset, { glyphPalette: a.glyphs_from ? loadAsset(a.glyphs_from).palette : undefined });
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, text); }
      return { data: { out: a.out ? resolve(a.out) : null, flattened }, text: a.out ? undefined : text };
    },
  }),
  define({
    name: 'contact',
    description: 'Control sheet: several assets side by side at an integer scale on a background color (semi-transparent pixels composited over it, or added with blend=add for lights), over a grid of N px anchored at their feet, each named underneath and with a reference asset (the player) standing next to it to compare sizes. Returns the PNG.',
    schema: z.object({
      paths: z.array(z.string()).min(1).describe('asset JSON paths'),
      ref: pathArg.optional().describe('reference asset shown next to each one'),
      ref_frame: z.number().int().nonnegative().optional(),
      frame: z.union([z.number().int().nonnegative(), z.literal('fullest')]).optional()
        .describe('frame of each asset (default 0), or "fullest": the frame with the most painted pixels of each one (an effect that grows from a dot)'),
      scale: z.number().int().positive().optional().describe('default 4'),
      background: z.string().optional().describe('hex (default #a6c778, grass)'),
      grid: z.number().int().nonnegative().optional().describe('grid every N asset px (default 16, 0 = none)'),
      columns: z.number().int().positive().optional().describe('assets per row (default up to 8)'),
      blend: z.enum(['over', 'add']).optional().describe('over (default): semi-transparent pixels composite over the background as in a game; add: sum them, to preview a light halo (use a dark background)'),
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
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, png); }
      return { data: { out: a.out ? resolve(a.out) : null, assets: items.length, width: img.width, height: img.height }, png };
    },
  }),
  define({
    name: 'lint',
    description: 'Check one or more assets without changing them: colors off a palette, sides that are not a multiple of "grid", lone pixels (the despeckle rule, as a report), with "pieces" detached pieces (a group of pixels that does not touch the body in a frame: a crown split off by a transparent row) and, for tiles, left/right and top/bottom edges that do not meet when repeated (or leave transparent gaps).',
    schema: z.object({
      paths: z.array(z.string()).min(1),
      palette: pathArg.optional().describe('asset whose palette is the allowed set'),
      colors: z.array(z.string()).optional().describe('allowed hex colors, instead of (or added to) palette'),
      grid: z.number().int().positive().optional(),
      tile: z.boolean().optional().describe('check seams on every asset'),
      tiles: z.array(z.string()).optional().describe('asset ids (or paths) to check as tiles'),
      pieces: z.union([z.boolean(), z.number().int().min(1)]).optional()
        .describe('report detached pieces of at least this many px (true = 4) on every asset'),
      pieces_ids: z.array(z.string()).optional().describe('asset ids (or paths) to check for detached pieces'),
      strength: z.number().int().min(1).max(3).optional(),
      majority: z.number().int().min(3).max(8).optional(),
    }),
    run: (a) => {
      let palette: string[] | undefined = a.colors;
      if (a.palette) palette = (palette ?? []).concat(Object.values(loadAsset(a.palette).palette));
      const tiles = new Set(a.tiles ?? []);
      const reports = a.paths.map(p => {
        const asset = loadAsset(p);
        return lintAsset(asset, {
          palette, grid: a.grid, strength: a.strength, majority: a.majority,
          tile: a.tile || tiles.has(asset.id) || tiles.has(p),
          pieces: a.pieces || ((a.pieces_ids ?? []).some(id => id === asset.id || id === p) ? true : undefined),
        });
      });
      const bad = reports.filter(r => r.warnings.length);
      const lines = reports.map(r => r.warnings.length
        ? `✗ ${r.id} (${r.width}x${r.height})\n${r.warnings.map(w => `    ${w}`).join('\n')}`
        : `✓ ${r.id} (${r.width}x${r.height})`);
      lines.push('', `${reports.length - bad.length}/${reports.length} clean`);
      return { data: { clean: reports.length - bad.length, total: reports.length, reports }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'map_lint',
    description: 'Check a painted map ground (a PNG) against the map style rules, without changing it: alpha only 0 or 255 and no holes inside the map, colors on a palette, no border between two materials running straight along a row or column for more than max_straight px (skipped with architecture: walls and terraces are straight), no more than a third of the cells identical to their neighbours, and no blurred border (lone pixels of a material inside another over max_loose of the material changes; a one-pixel diagonal is a line). Materials are named groups of hex colors; any other color is an accent and takes its left neighbour\'s material. ground=false checks a layer (only alpha and palette).',
    schema: z.object({
      png: z.string().optional().describe('the painted ground (PNG)'),
      recipe: z.string().optional().describe('a map recipe instead of png: renders it and checks the ground and every layer'),
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
      if (a.recipe) return lintRecipe(a.recipe);
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
    description: 'The organic autotile: turn a grid of cells (one letter per cell: wall, floor, water…) into a per-pixel shape, one letter per pixel, for a drawing script to paint, so the grid does not show. Each pixel takes the letter that weighs most in a window of round px around a point moved by smooth noise (wobble): corners come out cut round and borders meander. keep {letter: inset px} guarantees the middle of every cell of that letter (a one-cell corridor never closes); clean passes remove lone pixels and one-pixel bites, so the border is a line and never a dither. Deterministic by seed; writes {width, height, rows} to out.',
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
        writeFileSync(a.out, JSON.stringify(m));
      }
      const text = `grid_mask ${m.width}x${m.height} from ${grid[0].length}x${grid.length} cells${a.out ? ` -> ${basename(a.out)}` : ''}`;
      return { data: a.out ? { width: m.width, height: m.height } : m, text };
    },
  }),
  define({
    name: 'map_from_game',
    description: 'Start (or refresh) a map recipe from the game\'s map JSON: the grid (width, height, "." walkable, "#" wall, "D" decor, "E" exit), the decor with size and shadow from the visuals JSON, the margin painted around it, the palette of color names and the light. Materials and steps already in the recipe are kept. Answers the grid as text, to plan where paths and areas go (cells, (0,0) top-left).',
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
      const recipe: MapRecipe = {
        ...prev,
        game: rel(a.game)!,
        visuals: rel(a.visuals) ?? prev.visuals,
        palette: rel(a.palette) ?? prev.palette,
        cell: a.cell ?? prev.cell ?? 16,
        margin: a.margin ?? prev.margin ?? [0, 0],
        seed: a.seed ?? prev.seed ?? 0,
        light: a.light ?? prev.light ?? [1, 1],
        materials: prev.materials ?? {},
        steps: prev.steps ?? [],
        export: prev.export ?? { id: a.id ?? basename(a.game).replace(/\.json$/i, '') },
      };
      writeRecipe(a.out, recipe);
      const head = `${basename(a.out)}: ${g.width}x${g.height} cells, margin ${recipe.margin!.join('x')}, ${g.decor?.length ?? 0} decor, ${recipe.steps.length} steps`;
      const cols = '    ' + Array.from({ length: g.width }, (_, u) => String(u % 10)).join('');
      const text = [head, cols, ...g.grid.map((r, v) => String(v).padStart(3) + ' ' + r)].join('\n');
      return { data: { out: resolve(a.out), width: g.width, height: g.height, decor: g.decor?.length ?? 0, steps: recipe.steps.length }, text };
    },
  }),
  define({
    name: 'map_material',
    description: 'Add or replace a material of a map recipe: a ramp of palette color names from dark to light and a texture (patches: grass or snow, light patches along the light; mottled: earth; canopy: forest crowns; grain: stone, 8 tones ink to highlight, with moss; slabs: laid stones; flat; water: [deep, mid, shallow, foam, glint]). shade_max and shade_min bound what a shadow does to it.',
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
    ['map_area', areaStep, 'Add or replace (by id) an area step of a map recipe: paint a material on a shape (all; blobs [u, v, rx, ry, wobble] in cells; cells of the game grid through grid_mask; rect; outside of the map, a forest edge on sides "lrtb"; poke: crowns poking in from an outside area, on another layer like "front"). face: N px raises it (a south face, moss on the lit lip, holes at its foot).'],
    ['map_path', pathStep, 'Add or replace (by id) a path step of a map recipe: a Catmull-Rom ribbon through points in cells whose half width breathes (width [px, breathing px], widen where people open up), clearings and side tongues that reach what matters, the bank shadow on the light side and a lit lip on the far grass, ruts, tufts creeping in, and stone stairs where it climbs.'],
    ['map_water', waterStep, 'Add or replace (by id) a water step of a map recipe: on a shape, bands by distance to the shore (shallow, mid, deep in long streaks), the high bank face and its dark reflection, broken foam on the low shore, waves, and glints on a layer the game animates.'],
    ['map_light', lightStep, 'Add a light step to a map recipe: shadows cast down-light by the decor and landmarks of the game (a scalloped crown and a trunk stripe for tall things, a small one for low things with a shadow), by the edge of outside areas and by the faces of raised areas (long, deeper at the foot), one step down each material ramp, cleaned so they are drawn shapes.'],
    ['map_scatter', scatterStep, 'Add a scatter step to a map recipe: tufts (tips on a layer that sways), flowers in groups, pebbles (more in the clearings of a path), dew (dots on a layer that twinkles), boulders at fixed places, or a stamp (rows of glyphs) at fixed places; by tries, spacing, near or far from materials, only on some materials, never on walkable cells with walkable: false.'],
    ['map_cliff', cliffStep, 'Add or replace (by id) a cliff step of a map recipe: the map ends at the lip of a plateau (on the left); beyond it, far below, a sea of mist and clouds with far peaks rising from it (pines on top, clouds at their feet), the rock face falling from the lip with cracks and lit edges, grass hanging over the lip and loose stones on it.'],
    ['map_flight', flightStep, 'Add or replace (by id) a flight of stone steps: down (treads stacked from the top of the picture to a row, between two low walls, grass at the foot of each) or climb (treads side by side rising to the right, between two walls, cut into a forest and darker in its shade).'],
    ['map_feature', featureStep, 'Add or replace (by id) a carved thing on the ground: dais (a round stone platform with a south face, lit lip, carved ring, the eight trigrams and a carved center, and a shadow that changes the material it lands on), slab (an old stone with cut corners, a crack and moss on the lit corner), roots (from the foot of a trunk into the earth), ring (a forgotten formation: flat mossy stones in a ring with a worn groove), frost (a broken band of frost around something) or ash (the ash of a fire).'],
    ['map_network', networkStep, 'Add or replace (by id) a net of trodden earth (the roads and squares of a village) as one piece: roads through points in cells whose half width breathes, organic blobs added and cut (islands of grass), cleaned once, courts counted as earth; trodden and darker near the road centers with broken ruts, dry dust away from them; the bank shadow on the light side, a lit lip on the grass across and tufts creeping in.'],
    ['map_rope', ropeStep, 'Add or replace (by id) a rope tied across the map on a layer in front of people, sagging in the middle, with things hanging from it (lanterns, flags) as rows of glyphs.'],
    ['map_wall', wallStep, 'Add or replace (by id) a straight wall of a room in a rect of px: seen face on (a back wall: bands from the top, plaster lit and in shade, a wainscot of boards, lattice windows with paper lit from behind and lacquered columns) or from above (a side or front wall: the beam across); doors cut it and get a stone sill (with the day outside on a layer), and it casts its shadow on the floor along it.'],
    ['map_furnish', furnishStep, 'Add or replace (by id) what the furniture of a room leaves on the floor: rug (a reed mat with rounded corners and a cloth border under each table) or shadows (short cold shadows at the foot of the decor, down-right, stacking).'],
    ['map_thicket', thicketStep, 'Add or replace (by id) a thicket step: the wall cells of the game grid (and the margin) are a dark thicket and the rest a walkable floor whose border is the smoothed grid plus noise (a curve, not the grid), with round clearings; the floor painted with its material (moss and leaf litter), damp and darker by the thicket. Later steps (canes, shade, beams, an outcrop, a network inside it) read it by id.'],
    ['map_outcrop', outcropStep, 'Add or replace (by id) a rock outcrop leaning on a thicket: ellipses of rock with a south face (dark veins), streaks and moss on its lit rim, and big mossy stones piled on top, back to front.'],
    ['map_undergrowth', undergrowthStep, 'Add an undergrowth step: inside a thicket, leaves by its border, dark depths and fallen leaves.'],
    ['map_canes', canesStep, 'Add a canes step: bamboo canes drawn one by one on a layer in front of people (three px wide in front, two behind, one deep; nodes, joints, a thin tip) with leaves like spears on two layers that sway out of step. Each cane is born in a wall cell of a thicket and rises, so it only covers cells behind its foot; it never covers a cell where someone stands (clear cells and the decor), stays low over a trail and passes tall in front in some places.'],
    ['map_shade', shadeStep, 'Add a shade step: the shadows a thicket (and other casters, a rock) cast down-light on the floor, deeper at the foot, cleaned; and soft ovals under the landmarks, stacking.'],
    ['map_beams', beamsStep, 'Add a beams step: beams of light falling between the canes onto the floor of a thicket, down-light, tapering, cut in spots by the leaves above, two tones lighter in the core, on a layer of their own (the game shows it only by day), with motes of dust on another layer.'],
    ['map_snowfield', snowfieldStep, 'Add or replace (by id) a snowfield: snow over the whole picture, almost smooth, with hollows in violet shade (the upper border deeper, the lower lip lit), lit crests and frost dashes; with cover, snow only above a wavy line (grass showing through near it, old patches of snow below it, small scraps dropped) and the grass texture under it, with the lip of the snow. Its id names the line for the ledge, the conifers and the slush of a trail.'],
    ['map_ledge', ledgeStep, 'Add a ledge: one side of the map (l or r) ends at a lip (a cornice of snow, or earth below a snowfield line) with a narrow dark rock face with cracks; beyond it is left for a cloudsea step.'],
    ['map_cloudsea', cloudseaStep, 'Add a cloudsea: what lies beyond a ledge, far below: violet depths in streaks, banks of big cloud puffs (lit on top, cold shade below) and peaks that float (columns of rock with snow and a small pine on top, clouds hiding their feet).'],
    ['map_crag', cragStep, 'Add a crag: masses of rock by a height field seen in 3/4, the highest one rules each spot; snow gathers on top (its lip lit, dripping down the face), steep tops show rock, the south face split in vertical slabs lit from the left with violet shade on the right, an outline; optional shadow (laid by the next shadows step), veins of qi climbing the face (their light on a layer that flows), a cleft, a cave mouth with icicles, faces recolored (ice) and icicles at its foot.'],
    ['map_mountain', mountainStep, 'Add a mountain wall on the left side: sixty crags piled beyond the map edge, one and two tones darker the further away, and the snow beyond the edge two tones darker.'],
    ['map_conifers', conifersStep, 'Add a wall of snowy conifers on the right side: firs in rows from the edge in, snow on their skirts, deeper rows violet and black; the front trees by the edge go on a layer in front of people; above a snowfield line the floor of the forest is snow in shadow.'],
    ['map_trail', trailStep, 'Add or replace (by id) a trail made of curves (half width base + waves) and blobs: earth (packed earth with a dark bank up-left, stones, a lit lip on the grass and slush where it enters the snow), trodden (a channel in the snow: dark inside up-left, lit lip down-right, heaped snow outside, footprints in pairs) or slabs (wind-swept rock in slabs, snow covering it in places and in some joints, its shadow on the snow).'],
    ['map_tracks', tracksStep, 'Add tracks along a curve over some materials: paws in a line (a wolf, a goat: 2 × 2 holes with a lit lip) or boots in pairs.'],
    ['map_pond', pondStep, 'Add frozen ponds: smooth ice with the sky in diagonal streaks, a step of snow on the upper border, a lit lip below, and two or three broken cracks.'],
    ['map_shrub', shrubStep, 'Add low shrubs (a juniper of four clumps with snow on top) at fixed places.'],
    ['map_shadows', shadowsStep, 'Add a shadows step: lays down the shadows the crags left pending, those of the decor (a pine: a scalloped crown and the stripe of its trunk; a big thing: an oval) and fixed scalloped casts, cleaned, one step darker by the recipe shade table, on the materials that receive them.'],
    ['map_tussocks', tussocksStep, 'Add tussocks of cold grass: small tufts whose tips go on a layer that sways, more by the edges of other materials, some dry (gold stems, sand tips).'],
    ['map_stones', stonesStep, 'Add stones poking out of the snow: a grey px and its shadow.'],
    ['map_sparkles', sparklesStep, 'Add sparkles on a layer that twinkles: one px (sometimes two) on light snow and ice, never close to another.'],
    ['map_spindrift', spindriftStep, 'Add spindrift on a layer that flows: snow lifted by the wind in flat streaks of 2 to 6 px.'],
    ['map_straw', strawStep, 'Add straw to a dry grass: patches of it (away from the border of the grass) lying in vertical strands, lighter on top; on the darker grass only strands and specks.'],
    ['map_overlook', overlookStep, 'Add an overlook on the left: the land ends at a wavy lip (lit lip, dark under it, a narrow dark face) and beyond it, far below in the haze, a plain of big pale parcels on a skewed grid with lighter borders, a river winding down and a road going away.'],
    ['map_woodedge', woodedgeStep, 'Add or replace (by id) a wood past the right, top and bottom of the map: crowns lit up-left with a line against what is behind, darker deeper in, never on a road net; past the edge the earth and the grass go into its shade. Its id is the edge a poke area pokes crowns in from.'],
    ['map_damp', dampStep, 'Add damp earth where water spilt: an organic blob of wet and dark earth on a road net, away from its border.'],
    ['map_cast', castStep, 'Add a cast step: every opaque px of the decor (its silhouette, from the recipe sprites folder) and of what stands (stamps with stands) casts a shadow down-light by its height above its foot, cleaned, one step darker by the recipe shade table, never on the decor itself.'],
    ['map_lines', linesStep, 'Add named wavy lines across the map (the shores of a river): a row in cells plus waves along x. A shape {between: [top, bottom]} and the river steps read them by name.'],
    ['map_wildwood', wildwoodStep, 'Add the wood in silhouette around the map: crowns packed by how far the land is past the sides, the top (with a gap for a road) and a bottom line, darker deeper in, never between two lines (the river).'],
    ['map_beach', beachStep, 'Add a sand beach between two lines: wet sand by the water, dry sand in two tones, the lip of the grass on top, lone stones, shells with their shadow.'],
    ['map_mudbank', mudbankStep, 'Add a bank of wet mud under a line (the far shore): a band of wavy depth in tones by how far from the water.'],
    ['map_footpath', footpathStep, 'Add footpaths of trodden earth: ribbons that breathe and blobs in one mask, kept off some materials and off the river, cleaned; the edge up-left in shadow, earth in three tones with specks and ruts by the middle, a lit lip on the grass, and darker sand where they cross a beach.'],
    ['map_pier', pierStep, 'Add a pier: planks across with uneven ends and joints in shadow, the long beams at its sides in the water, its shadow on the water, and pilings with a ripple at their foot.'],
    ['map_reeds', reedsStep, 'Add reeds stalk by stalk: clumps at places or a row along a shore line; stalks lit on the left, bent leaves and cattails; the tips sway on their layer, clumps in the water stand whole in front of people.'],
    ['map_rocks', rocksStep, 'Add rocks with volume (lit up-left, a cold face, moss on top, a crack in the big ones) and the oval of their shadow down-right.'],
    ['map_umbra', umbraStep, 'Add shade on some materials: ovals with a wavy border (the shadow of an eave) and bands with a wavy top (the shadow of a roof), one or two steps darker by the recipe shade table.'],
    ['map_meadow', meadowStep, 'Add tufts (leaves on the ground, tips on a layer that sways, ten px apart) or flowers (two colors and a stem) on a grass by their own draws, not the shared stream.'],
    ['map_shimmer', shimmerStep, 'Add glints (a layer that twinkles, bright where the sun is) and streaks of current (rows of the deep water one step lighter, a layer that flows) to a water mask.'],
    ['map_slabs', slabsStep, 'Add laid slabs in an organic blob: Voronoi cells stretched sideways, a lit lip up-left, a dark edge down-right, joints with moss.'],
    ['map_ditch', ditchStep, 'Add a dry ditch from the water down the map: a winding trench of earth with the shadow of its left wall and stones, between lips of laid stones.'],
    ['map_claypan', claypanStep, 'Add a dry pond: a rounded square of cracked mud in Voronoi plates (lit lips, dark cracks, darker by the rim), a rim of mossy stones, and a walk of slabs across it with its face over the mud.'],
    ['map_floodwater', floodwaterStep, 'Add the water that comes back to dry masks (a ditch, a pond) on a layer of its own: bands by depth, the dark border under the upper edge and its reflection, foam at the lower edge, ripples.'],
    ['map_cloudbanks', cloudbanksStep, 'Add the sea of clouds seen from above, filling the picture: a haze, rows of long flat banks (domed lumpy tops lit, cold bellies), floating peaks of rock with ledges and flat pines on top, and banks hiding their feet.'],
    ['map_ashlar', ashlarStep, 'Add the ashlar face of a raised terrace: courses of stones in the shade with staggered joints, darker down to its foot, the foot sinking into the clouds and moss hanging from the curb.'],
    ['map_courses', coursesStep, 'Add big stones laid in courses over a box: slabs of different lengths, joints staggered row to row, a lit lip up-left, a light joint, worn (lighter) where people walk, moss in the joints by the sides and a few cracks.'],
    ['map_runner', runnerStep, 'Add a runner of long slabs end to end (a walk up to an arena): two slabs a row with the joint staggered, lit noses, lighter in the middle.'],
    ['map_arena', arenaStep, 'Add the round arena of a duel: a low oval dais with its step face to the south, a curb of voussoirs with bronze studs, two rings of slabs in rays, the worn band, a disc with a bronze ring set in it, and scuffs.'],
    ['map_balustrade', balustradeStep, 'Add lacquered balustrades on stone curbs: along rows seen from the front (handrail, balusters, posts with gold finials, openings and a hatch), and the side rails seen from above; they stand up for the cast step.'],
    ['map_stairway', stairwayStep, 'Add a stairway going down to the bottom of the picture between two low walls: lit noses, risers in shadow, darker tread by tread.'],
    ['map_sprigs', sprigsStep, 'Add little sprigs growing out of mossy joints (the tips on a layer that sways), by the shared random stream.'],
    ['map_fallen', fallenStep, 'Add a few dry leaves blown against the sides (inside the edge band of a courses step), by the shared random stream.'],
    ['map_motes', motesStep, 'Add motes of light that twinkle (on a layer) over some colors, apart from each other, by the shared random stream.'],
    ['map_overhang', overhangStep, 'Add the branch of a cliff pine reaching over the picture on a front layer: a tapering trunk with bark, flat lumpy crowns, and its shadow on the ground.'],
    ['map_cavern', cavernStep, 'Add a cave: the walls of the game grid as a mass of rock (grid_mask: round corners, wandering borders, every corridor kept open) seen from above in dark facets with an outline and a lit lip; its south faces over the floor below (a lit edge, strata, a vein, wet glints on a layer, a dark foot); a cold stone floor in cracked slabs, dark at the foot of the walls, with loose pebbles. Exits go on into the margin; shafts go up black. The cave steps that follow read it.'],
    ['map_hangroots', hangrootsStep, 'Add roots coming down the south faces of a cavern (cells chosen by the cell noise): a thick root out of the rock, sometimes a thin one braided, rootlets on the floor, earth that came down; some drip (a thread on a layer that flows, a puddle with a glint), some hang thin roots on a front layer where nobody stands below.'],
    ['map_carvings', carvingsStep, 'Add inscriptions carved in the south faces of a cavern: a smoothed slab with its lit edge and columns of illegible 3×3 strokes, on fixed cells, cells inside a box and cells by the cell noise.'],
    ['map_rootladder', rootladderStep, 'Add a ladder of roots coming down a shaft of a cavern from the top of the picture: two twisted rails, uneven rungs, lost in the dark up there.'],
    ['map_pool', poolStep, 'Add a still dark pool on the floor of a cavern: reflected veins, a lit upper shore, a dark lower shore, glints in streaks on a layer.'],
    ['map_formation', formationStep, 'Add a formation diagram carved in a cavern floor (two rings, the eight trigrams, eight spokes) and the same lit with qi on a layer of its own, inside a room box (export.windows cuts the patch there).'],
    ['map_gloom', gloomStep, 'Add the dark past the border of the map: everything darkens step by step into the black (the recipe shade table), and the glints, drops and front layers go away where it is dark.'],
    ['map_soften', softenStep, 'Add a softening pass: a lone pixel of a material inside another becomes an accent of its value (by an accent table), so the lint sees no blur.'],
    ['map_glen', glenStep, 'Add the layout of a glen at the foot of a waterfall, as masks only: a plunge pool of organic blobs, the stream that leaves it, a river under a line, trodden earth (roads and clearings), a ledge of slabs and a gravel beach under another line, kept apart. The glen steps that follow paint them.'],
    ['map_cushions', cushionsStep, 'Add wet moss cushions by the water of a glen: a cleaned noisy band near the shore painted a deep green over the grass.'],
    ['map_mudtrail', mudtrailStep, 'Add the wet earth trail of a glen: the border in shadow, mottled in three tones at 5 px, wetter near the water, grains, ruts beside the middle, the lit lip of the grass and tufts creeping in.'],
    ['map_shingle', shingleStep, 'Add the gravel beach of a glen: a face of earth under the grass above, wet gravel by the water, dry sand and light in between, a dark lip of the grass over it.'],
    ['map_ledgeslabs', ledgeslabsStep, 'Add a ledge of wet slabs (stretched Voronoi) on the glen ledge: lit lip, dark joint, moss in the joints and climbing the slabs, a dark border right and below.'],
    ['map_plunge', plungeStep, 'Add the water of a glen: the river by depth under its line with a deep channel, the pool and stream by distance to the shore; high banks show a face of earth or rock and cast a cold shadow, the water licks the beach, foam on the low shore, pebbles under the shallows, rings of foam at the foot of the fall.'],
    ['map_wetstones', wetstonesStep, 'Add wet stones in and by the water of a glen, each with foam on its upstream side and a wake to the right.'],
    ['map_wetwood', wetwoodStep, 'Add the wet wood on the sides of a glen: crowns by depth past two wavy edges, never on the earth nor near the river, the near ones on the sunny half lit; past the edge the trail and shore darken into the wood; above the map it closes.'],
    ['map_glenshade', glenshadeStep, 'Add the cold shadows of a glen, cast down-right: lobed ovals under the decor by sprite prefix (trees with a trunk, deep ones), more ovals, the rim of the wood on the left; cleaned once, one step darker.'],
    ['map_glenlitter', glenlitterStep, 'Add the small things of a glen by the shared random stream: tufts (tips on a layer that sways), pale flowers by the water, pebbles and puddles that reflect the sky on the earth, pebbles on the beach, fallen leaves near the trees.'],
    ['map_glenflow', glenflowStep, 'Add what moves on the water of a glen, each on its layer: glints (white in the sun), the foam of the fall twinkling, streaks down the stream and along the river.'],
    ['map_boughs', boughsStep, 'Add boughs of the wet wood reaching in front of people from both edges of a glen (a front layer), apart, never over the earth nor the river, with moss hanging from them.'],
    ['map_sun', sunStep, 'Add or replace (by id) the sun that comes in through the windows of a wall: each window sheared onto the floor, down and to the right, with the shadow of its lattice, a few tones lighter, on a layer of its own (the game shows it only by day).'],
  ] as const).map(([name, schema, description]) => define({
    name,
    description,
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
    description: 'Run a map recipe and write the picture: every layer painted one over the other (or only `layers`, bottom first), at `scale`. Deterministic: the same recipe gives the same pixels.',
    schema: z.object({
      recipe: z.string().describe('the recipe JSON'),
      out: z.string().describe('PNG path'),
      layers: z.array(z.string()).optional().describe('layers to show, bottom first (default all, ground first)'),
      scale: z.number().int().positive().optional(),
    }),
    run: (a) => {
      const r = renderRecipe(a.recipe);
      const names = a.layers ?? ['ground', ...Object.keys(r.map.layers).filter(n => n !== 'ground')];
      const layers = names.map(n => { const l = r.map.layers[n]; if (!l) throw new Error(`map_render: no layer "${n}"`); return l; });
      const img = layersImage(layers, r.colors, a.scale ?? 1);
      writePng(a.out, img);
      return {
        data: { out: resolve(a.out), size: [r.map.width, r.map.height], origin: r.map.origin, layers: names, colors: new Set(layers.flatMap(l => l.used())).size },
        png: encodePng(img),
      };
    },
  }),
  define({
    name: 'map_export',
    description: 'Run a map recipe and write what the game reads: one PNG per layer (<dir>/<id><suffix>.png; the ground has no suffix) with its Aseprite JSON, the text drawing of each (txt, from_ascii format: the source the game rebuilds from) and its .pss.json (src). Folders default to export.png / export.txt / export.src of the recipe. export.ground writes painting, margen, vivo and copas into the game map (only the keys that changed). Every drawing is written with a "generated_by: map_export recipe= layer=" header, and a drawing that says something else (or nothing, meaning it was drawn by hand) stops the export instead of being overwritten: pass force to overwrite it anyway. The retouch of each drawing (<drawing>.retoque.txt, what the editor saves) is laid back on a layer of its own over the regenerated layer, so a retouch survives running the recipe again; retouch=false skips it.',
    schema: z.object({
      recipe: z.string().describe('the recipe JSON'),
      dir: z.string().optional().describe('folder for the PNGs (default export.png of the recipe)'),
      assets: z.boolean().optional().describe('also <dir>/<id>.pss.json'),
      txt: z.string().optional().describe('folder for the text drawings (default export.txt)'),
      src: z.string().optional().describe('folder for the .pss.json rebuilt from each text drawing (default export.src)'),
      sheet: z.boolean().optional().describe('write the Aseprite JSON next to each PNG (default true when the recipe says export.png)'),
      ground: z.boolean().optional().describe('write export.ground into the game map (default true)'),
      force: z.boolean().optional().describe('overwrite a drawing even when it was drawn by hand or made by another recipe'),
      retouch: z.boolean().optional().describe('lay the retouch of each drawing (<drawing>.retoque.txt) back on top (default true)'),
    }),
    run: (a) => {
      const r = renderRecipe(a.recipe);
      const dirs = exportDirs(r, a.recipe, a);
      const files = exportRecipe(r, dirs.dir, {
        assets: a.assets, txt: dirs.txt, src: dirs.src, sheet: a.sheet ?? (!a.dir && !!r.recipe.export?.png),
        recipe: a.recipe, force: a.force, retouch: a.retouch,
      });
      const ground = a.ground === false ? null : exportGround(r, a.recipe);
      const lines = files.map(f => `${f.layer}: ${basename(f.png)}${f.txt ? ` + ${basename(f.txt)}` : ''}${f.src ? ` + ${basename(f.src)}` : ''}${f.retouch ? ` + ${basename(f.retouch.file)} (${f.retouch.changed} px de retoque)` : ''}`);
      if (ground) lines.push(`${basename(ground.file)}: ${ground.written.length ? ground.written.join(', ') : 'nothing changed'}`);
      return { data: { files, ground }, text: lines.join('\n') };
    },
  }),
  define({
    name: 'map_compare',
    description: 'Check a map recipe against the drawing it replaces (or two PNGs): writes the reference, the recipe and the differences side by side (every pixel that differs in magenta over the dimmed reference) and answers how many pixels differ and their share. With layers, one picture per layer (<out>_<layer>.png).',
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
      if (a.a && a.b) {
        const c = compareImages(readPng(a.a), readPng(a.b));
        writePng(a.out, scaled(c.image));
        images.push(scaled(c.image));
        rows.push({ layer: 'png', differ: c.differ, share: c.share, out: resolve(a.out) });
      } else {
        if (!a.recipe) throw new Error('map_compare: recipe (with ref or refs), or a and b');
        const r = renderRecipe(a.recipe);
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
        text: rows.map(x => `${x.layer}: ${x.differ} px differ (${(x.share * 100).toFixed(2)} %)`).join('\n'),
        // One comparison comes back as the picture too: the number says how much
        // differs, only the magenta says where.
        png: images.length === 1 ? encodePng(images[0]) : undefined,
      };
    },
  }),
  define({
    name: 'export_sheet',
    description: 'Write a 1:1 PNG sheet plus an Aseprite-style JSON (frames with rects and durations, frameTags with loop). Layout "rows" puts one animation per row.',
    schema: z.object({
      path: pathArg,
      out: z.string().describe('PNG path'),
      meta: z.string().optional().describe('JSON path; default: same as out with .json'),
      scale: z.number().int().positive().optional(),
      spacing: z.number().int().nonnegative().optional(),
      layout: z.enum(['rows', 'strip']).optional(),
    }),
    run: (a) => {
      const asset = loadAsset(a.path);
      const metaPath = a.meta ?? a.out.replace(/\.png$/i, '') + '.json';
      const { image, meta } = exportSheet(asset, {
        imageName: basename(a.out), scale: a.scale, spacing: a.spacing, layout: a.layout,
      });
      writePng(a.out, image);
      mkdirSync(dirname(metaPath), { recursive: true });
      writeFileSync(metaPath, JSON.stringify(meta, null, 1) + '\n');
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
    description: 'Generate a whole effect animation: N new frames with the shape at a moving intensity (grow, fade, grow_fade, flat), tagged by name.',
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
      map: z.record(z.string(), z.string()).optional().describe('{fromHex: toHex}: recolor by value, e.g. to apply the same table to a sprite and its portrait'),
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
    description: 'Map every color of the asset to the nearest color of a target palette (another asset\'s palette, or a list of hex). "map" forces specific colors (fromHex → toHex). Returns the table of what went where; pixels are untouched, only the palette changes.',
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
    description: 'Recolor a PNG (a tileset, any image) to a target palette without touching its layout: every color goes to its forced mapping ("map") or to the nearest target color; alpha is kept. Returns the table of what went where.',
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
    description: 'Make transparent, in a PNG, the pixels of one color that touch the border of each region (flood from the edges); islands of that color inside stay. For tileset pieces with background baked around them. Regions [{x,y,w,h}] in pixels; default: the whole image.',
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
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, png); }
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
    description: 'flip_h, flip_v or shift (dx, dy) one frame or every frame.',
    schema: z.object({
      path: pathArg,
      op: z.enum(['flip_h', 'flip_v', 'shift']),
      frame: z.number().int().nonnegative().optional().describe('default: every frame'),
      dx: z.number().int().optional(),
      dy: z.number().int().optional(),
      layer: z.number().int().nonnegative().optional(),
    }),
    run: (a) => withAsset(a.path, asset => {
      const targets = a.frame !== undefined ? [a.frame] : Array.from({ length: frameCount(asset) }, (_, i) => i);
      for (const i of targets) {
        const f = getFrame(asset, i, a.layer ?? 0);
        const out = a.op === 'flip_h' ? flipH(f) : a.op === 'flip_v' ? flipV(f) : shift(f, a.dx ?? 0, a.dy ?? 0);
        setFrame(asset, i, out, a.layer ?? 0);
      }
      return { frames: targets };
    }),
  }),
  define({
    name: 'despeckle',
    description: 'Clean the noise a pixelized render leaves: every lone pixel (fewer than "strength" of its 8 neighbours share its color) takes the color most of its neighbours agree on. Lines and outlines survive. Run it on one frame or every frame, with "passes" repetitions.',
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
    description: 'Synthesize a sound from a recipe (JSON: layers of oscillators, noise, Karplus-Strong pluck or crackle, with filters, ADSR, LFOs, echo and scattered events; seeded, loop: true splices the end into the start) into a WAV, PCM 16 bit mono at 22050 or 44100 Hz. recipe = a file, a directory of recipes (each to out_dir/<file>.wav) or the recipe object itself. Returns the same checks as sound_contact.',
    schema: z.object({
      recipe: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('recipe file, directory of *.json recipes, or the recipe object'),
      out: z.string().optional().describe('WAV path (one recipe)'),
      out_dir: z.string().optional().describe('directory for the WAVs (named after each recipe file)'),
    }),
    run: (a) => {
      if (typeof a.recipe !== 'string') {
        if (!a.out) throw new Error('out is required with an inline recipe');
        const recipe = parseRecipe(a.recipe);
        const res = soundToWav(recipe);
        mkdirSync(dirname(a.out), { recursive: true });
        writeFileSync(a.out, res.wav);
        return { data: { out: resolve(a.out), limited: res.limited, ...res.stats } };
      }
      const files = recipeFiles(a.recipe);
      if (files.length === 1 && a.out) return { data: writeSound(files[0], a.out) };
      if (!a.out_dir) throw new Error('out_dir is required for a directory of recipes (or out for a single one)');
      const rows = files.map(f => writeSound(f, resolve(a.out_dir!, basename(f).replace(/\.json$/, '.wav'))));
      return { data: { written: rows.length, sounds: rows }, text: statsTable(rows) };
    },
  }),
  define({
    name: 'music',
    description: 'Render a score (.partitura: text with tempo, meter, instruments and voices of notes like `A3 q`, `E4 h.`, rests, repeats, dynamics, grace notes, seeded humanizing, a small room; `loop: si` folds the tails onto the start so it loops without a seam) into a WAV, PCM 16 bit mono. Instruments are plucked and struck only: ' + Object.keys(INSTRUMENTS).join(', ') + ', or a JSON next to the score. score = a file, a directory of .partitura (each to out_dir/<file>.wav) or the score text itself. Returns the same checks as sound_contact plus bars and notes.',
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
        writeFileSync(a.out, res.wav);
        return { data: { out: resolve(a.out), limited: res.limited, bars: res.bars, notes: res.notes, ...res.stats } };
      }
      const files = scoreFiles(a.score);
      if (files.length === 1 && a.out) return { data: writeMusic(files[0], a.out) };
      if (!a.out_dir) throw new Error('out_dir is required for a directory of scores (or out for a single one)');
      const rows = files.map(f => writeMusic(f, resolve(a.out_dir!, basename(f).replace(/\.partitura$/, '.wav'))));
      return { data: { written: rows.length, pieces: rows }, text: statsTable(rows) };
    },
  }),
  define({
    name: 'sound_contact',
    description: 'Check WAVs without listening: duration, peak and RMS (dBFS), DC offset, spectral centroid (low wind vs high chime), whether a loop splices without a jump, whether a one-shot starts and ends at silence, clicks. Prints a table; with out, also a PNG of waveform strips.',
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
        writeFileSync(a.out, png);
      }
      const bad = rows.filter(r => r.warnings.length > 0).length;
      return { data: { sounds: rows, warnings: bad, out: a.out ? resolve(a.out) : null }, text: `${statsTable(rows)}\n\n${rows.length} sounds, ${bad} with warnings` };
    },
  }),
  define({
    name: 'font',
    description: 'Read a pixel font — a glyph sheet: a text drawing whose canvas is a grid of cells, one glyph per cell, with "font: cell=WxH baseline= line= space= track=", "glyphs:" rows naming the characters of each row of cells, and optional "advance:"/"kern:" — and with out, write it as an AngelCode BMFont (.fnt + its page PNG), which Godot 4 loads with FontFile.load_bitmap_font() or imports on its own. The advance of a glyph is its ink plus track, so the drawing is the metric. A sheet a recipe wrote takes its <drawing>.retoque.txt on top. Returns the metrics and, with table, a line per glyph.',
    schema: z.object({
      path: z.string().describe('the glyph sheet (a .txt text drawing)'),
      out: z.string().optional().describe('BMFont path (.fnt); the page PNG goes beside it with the same name'),
      ink: z.string().optional().describe('hex: paint the page in this one color (a white page is the one an engine can tint)'),
      godot_import: z.boolean().optional().describe('also write the <out>.import Godot wants, with scaling_mode=1 (whole numbers only)'),
      retouch: z.boolean().optional().describe('false to ignore the <drawing>.retoque.txt layer'),
      table: z.boolean().optional().describe('a line per glyph: cell, ink box and advance'),
    }),
    run: (a) => {
      const loaded = loadFont(a.path, a.retouch !== false);
      const font = loaded.font;
      const written = a.out ? writeBmFont(font, a.out, a.ink, a.godot_import === true) : undefined;
      const check = checkSheet(font);
      const data = {
        id: font.id,
        glyphs: font.glyphs.size,
        kernings: font.kern.size,
        ...font.metrics,
        retouch: loaded.retouch ? loaded.retouch.changed : null,
        problems: check.problems,
        ...(written ?? {}),
      };
      const lines = [
        `${font.id} · celda ${font.metrics.cellW}x${font.metrics.cellH} · ${font.glyphs.size} glifos · base ${font.metrics.baseline} · línea ${font.metrics.line} · espacio ${font.metrics.space} · track ${font.metrics.track}`,
        ...check.problems.map(p => `✗ ${p}`),
        ...check.notes.map(n => `· ${n}`),
        ...(written ? [`→ ${written.fnt}`, `→ ${written.png}`, ...(written.import ? [`→ ${written.import}`] : [])] : []),
        ...(a.table ? ['', glyphTable(font)] : []),
      ];
      return { data, text: lines.join('\n') };
    },
  }),
  define({
    name: 'font_contact',
    description: 'Look at a pixel font without eyes: sets a phrase with it at whole-number scales and answers the image plus what has to be looked at — characters of the phrase the font has no glyph for, the width and the rows of the cell the ink really uses, pairs of letters that touch with no pixel between them, cells with ink that no "glyphs:" row claims, glyphs that fill the cell or cross the baseline. This is the control sheet of typography, the way contact is for sprites and sound_contact for WAVs.',
    schema: z.object({
      path: z.string().describe('the glyph sheet (a .txt text drawing)'),
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
      const loaded = loadFont(a.path, a.retouch !== false);
      const font = loaded.font;
      const text = a.text ?? SAMPLE_TEXT;
      const scales = a.scale === undefined ? [1, 2, 3] : Array.isArray(a.scale) ? a.scale : [a.scale];
      const check = checkPhrase(font, text);
      const img = renderSample(font, text, {
        scales,
        background: a.background ?? '#1b1a21',
        color: a.color,
        guides: a.guides,
      });
      const png = encodePng(img);
      if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, png); }
      const report = fontReport(font, check, scales);
      return {
        data: {
          id: font.id, ...font.metrics, glyphs: font.glyphs.size,
          width: check.width, height: check.height, ink_rows: check.inkRows,
          missing: check.missing, touching: check.touching,
          problems: check.problems, notes: check.notes,
          retouch: loaded.retouch ? loaded.retouch.changed : null,
          out: a.out ? resolve(a.out) : null,
        },
        text: a.table ? `${report}\n\n${glyphTable(font)}` : report,
        png,
      };
    },
  }),
  define({
    name: 'font_compose',
    description: 'Build a glyph sheet out of another: every row of a hand-drawn base, then the glyphs a spec derives from it — a letter with a mark stamped over it (the accents and the eñe of Spanish), a glyph turned 180° (¿ ¡) or mirrored. The drawing it writes carries generated_by: font_compose, so a hand pass goes to <drawing>.retoque.txt and survives running this again, and it refuses to overwrite a drawing made by hand or by another recipe (force to do it anyway).',
    schema: z.object({
      spec: z.string().describe('the compose spec (JSON: base, glyphs: [{ char, over|turn|flip, mark, row, dx, dy, align, advance }])'),
      out: z.string().describe('the sheet it writes (a .txt text drawing)'),
      force: z.boolean().optional().describe('overwrite a drawing this command did not make'),
    }),
    run: (a) => ({ data: writeComposed(a.spec, a.out, a.force === true) }),
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
