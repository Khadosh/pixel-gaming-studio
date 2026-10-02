// The command registry: one place that defines what the headless tools can do.
// The CLI (cli.ts) and the MCP server (mcp.ts) are thin adapters over this.
//
// Every command takes a plain object validated by a zod schema and returns a
// JSON-serializable result. Commands that touch an asset on disk take `path`
// (the asset JSON, by convention *.pss.json) and save it back when they change it.

import { dirname, resolve, basename } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { SpriteAsset } from '../lib/types';
import {
  addFrame, colorIndex, composite, createAsset, dims, duplicateFrame, findAnimation, frameCount,
  getFrame, loadAsset, normalizeHex, removeAnimation, removeFrame, saveAsset, setAnimation, setFrame, summarize,
} from './asset';
import { encodePng, writePng } from './png';
import { fitImageColors, fitPalette, knockOutColor } from './ops';
import { asciiLegend, contactSheet, paletteSheet, renderAscii, renderFrame } from './render';
import { exportSheet, importSheet } from './sheet';
import { importCharacter } from './character';
import { ANIMATION_KINDS, animateAsset } from './animate';
import { generateImage, illustrate, loadFalKey, pixelize } from './ai';
import { readPng } from './png';
import { checkFit, fromAscii, legendGlyphs, toAscii } from './ascii';
import { contactSheetMany, fullestFrame, lintAsset } from './inspect';
import { makeVariant } from './variant';
import {
  analyzeWav, parseRecipe, readWav, recipeFiles, soundToWav, statsTable, waveformSheet, wavFiles, writeSound,
  parseScore, musicToWav, scoreFiles, writeMusic, INSTRUMENTS,
} from './sound';
import {
  applyDrawOps, applyFx, despeckle, flipH, flipV, generateFxAnimation, replaceIndex, shift, type DrawOp,
} from './ops';

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

const fxShape = z.enum(['burst', 'beam', 'sparks', 'pulse', 'circle', 'glow', 'bolt']);

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
      const asset = pixelize(readPng(a.png), {
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
      width: z.number().int().min(4).max(256),
      height: z.number().int().min(4).max(256),
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
      accent: z.number().min(0).max(1).optional().describe('keep bright accents: a cell this vivid-covered (0..1) takes the vivid color (default off)'),
      quantize: z.enum(['median', 'palette']).optional().describe('median (default): median cut, then fit; palette: cells go straight to the fit palette (small vivid areas keep their color)'),
      category: category.optional(),
    }),
    run: (a) => {
      const id = a.id ?? basename(a.out).replace(/\.pss\.json$|\.json$/i, '');
      if (a.quantize === 'palette' && !a.fit) throw new Error('quantize=palette needs fit=<asset with the palette>');
      const asset = illustrate(readPng(a.png), {
        id, name: a.name, width: a.width, height: a.height, maxColors: a.max_colors,
        focusX: a.focus_x, focusY: a.focus_y, category: a.category, sample: a.sample, outline: a.outline, background: a.background, contour: a.contour, backgroundTolerance: a.background_tolerance,
        accent: a.accent, palette: a.quantize === 'palette' ? Object.values(loadAsset(a.fit!).palette).filter(h => /^#?[0-9a-f]{6}/i.test(String(h))) : undefined,
      });
      let table: unknown = null;
      if (a.fit) table = fitPalette(asset, Object.values(loadAsset(a.fit).palette));
      let changed = 0;
      if (a.despeckle) {
        const f = getFrame(asset, 0, 0);
        for (let pass = 0; pass < a.despeckle; pass++) changed += despeckle(f, 1, 5);
        setFrame(asset, 0, f, 0);
      }
      saveAsset(a.out, asset);
      return { data: { fit: table, despeckled: changed, asset: summarize(asset) }, png: encodePng(renderFrame(asset, composite(asset, 0), 4)) };
    },
  }),
  define({
    name: 'generate',
    description: 'Ask fal.ai for an image from a prompt (the same pixel-art wrapper prompt the editor uses; "raw" sends the prompt untouched) and save it as PNG. Needs FAL_AI_KEY in the environment or in supabase/functions/.env. Chain with pixelize to get an asset.',
    schema: z.object({
      prompt: z.string().min(3),
      out: z.string().describe('PNG path'),
      image_url: z.string().url().optional().describe('reference image for image-to-image'),
      palette: z.array(z.string()).optional(),
      perspective: z.string().optional().describe('e.g. "top-down"'),
      raw: z.boolean().optional(),
      image_size: z.enum(['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9']).optional()
        .describe('fal image size (default square_hd); a landscape scene for a card picture'),
    }),
    run: async (a) => {
      const key = loadFalKey();
      const img = await generateImage({ prompt: a.prompt, imageUrl: a.image_url, palette: a.palette, perspective: a.perspective, raw: a.raw, imageSize: a.image_size }, key);
      mkdirSync(dirname(a.out), { recursive: true });
      writeFileSync(a.out, img.bytes);
      return { data: { out: resolve(a.out), model: img.model, prompt: img.prompt, bytes: img.bytes.length } };
    },
  }),
  define({
    name: 'from_ascii',
    description: 'Create or replace an asset from a text drawing: a header (id, name, category, size, description, fit, anim lines), a legend "glyph = #hex [name]" ("." transparent) and one or more frames, each after a "== <anim> <pos>" line. Rows of different length, unknown glyphs, sizes that do not match and (with fit) colors off the palette fail with the line. The inverse of to_ascii.',
    schema: z.object({
      txt: z.string().optional().describe('text file path'),
      text: z.string().optional().describe('the text itself, instead of txt'),
      out: pathArg,
      fit: pathArg.optional().describe('asset whose palette every color must belong to (overrides the "fit:" header)'),
      id: z.string().optional().describe('when the header has none (default: the txt file name)'),
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
      saveAsset(a.out, asset);
      return { data: summarize(asset), png: encodePng(contactSheet(asset, { scale: 4 })) };
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
      const img = readPng(a.png);
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
      const img = readPng(a.png);
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
