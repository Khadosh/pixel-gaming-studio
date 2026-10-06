// What the MCP server answers. An agent pays for every byte it reads, so a
// command that only leaves an asset on disk answers one line of text (what it
// wrote, the asset's size and animations) and no image unless it asks with
// `preview: true`. The full detail of an asset is `pgs_inspect`.
//
// Two things get the whole answer, and the difference between them matters:
//
//   - A command in `LOOKING` keeps its text **and its image**: looking at the
//     picture is the whole point of calling it.
//   - A command that brings its own `text` keeps that text, image or not. The
//     cut is not "does it write files?" — it is "does it produce text worth
//     reading?". `sound` writes a WAV *and* answers the control table; a line
//     rebuilt from its `data` threw the table away and the agent was left
//     calling a sound good without ever having checked it.

import type { CommandResult } from './commands';

/**
 * Commands whose whole point is to show something: they keep text and image.
 * A map is looked at too: `map_render` paints it, `map_compare` says how many
 * pixels differ from the reference and `map_lint` lists what is wrong with it.
 * So is a font: `font_contact` sets a phrase with it and says what to look at.
 * Left out of here, an agent gets `ok map_compare: layers=1` and calls good
 * what it never saw.
 */
export const LOOKING = new Set([
  'project', 'info', 'inspect', 'ascii', 'render', 'contact', 'lint', 'palette_show', 'sound_contact', 'face_points',
  'map_render', 'map_compare', 'map_lint', 'font_contact',
]);

export type McpContent = ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[];

const MAX_LINE = 240;

/** "jugador 48x48 · 6 cuadros · idle, walk" from an asset summary. */
function assetWords(a: Record<string, unknown>): string {
  const anims = Array.isArray(a.animations) ? (a.animations as { name?: string }[]).map(x => x.name).filter(Boolean) : [];
  const parts = [`${a.id ?? '?'} ${a.width ?? '?'}x${a.height ?? '?'}`];
  if (typeof a.frames === 'number') parts.push(`${a.frames} cuadros`);
  if (anims.length) parts.push(anims.join(', '));
  return parts.join(' · ');
}

function isAsset(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && 'width' in v && 'height' in v && 'palette' in v;
}

function scalar(v: unknown): string | null {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `${v.length}`;
  return null;
}

/** One line that says what a modifying command did, built from its `data`. */
export function oneLine(name: string, result: CommandResult): string {
  const data = result.data;
  const words: string[] = [];
  if (isAsset(data)) {
    words.push(assetWords(data));
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (isAsset(obj.asset)) words.push(assetWords(obj.asset));
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'asset' || k === 'table' || k === 'fit' || k === 'reports' || k === 'palette') continue;
      const s = scalar(v);
      if (s !== null) words.push(`${k}=${s}`);
    }
  } else if (data !== undefined) {
    words.push(String(data));
  }
  // One line means one line: a value with newlines in it (the ascii of `draw`)
  // would otherwise break the report of a batch, which is a line per step.
  const line = `ok ${name}: ${words.join(' · ') || 'hecho'}`.replace(/\s*\n\s*/g, ' ⏎ ');
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
}

/**
 * What MCP answers for a command that is not in `LOOKING`.
 *
 * The cut is **not** "does it write files?" — it is "does it produce text worth
 * reading?". A command that sets `result.text` has already written the answer
 * that matters (the control table of `sound` and `music`, the grid of
 * `map_from_game`, the files and the retouched pixels of `map_export`, the
 * metrics and problems of `font`, the drawing of `to_ascii`, the line per step
 * of `batch`), so it goes through whole instead of being rebuilt from `data`.
 * Anything else gets the one line.
 */
export function briefLine(name: string, result: CommandResult): string {
  return result.text ?? oneLine(name, result);
}

/** The MCP answer for a command result. */
export function mcpContent(name: string, result: CommandResult, preview = false): McpContent {
  const content: McpContent = [];
  if (LOOKING.has(name)) {
    content.push({ type: 'text', text: result.text ?? JSON.stringify(result.data, null, 1) });
    if (result.png) content.push({ type: 'image', data: result.png.toString('base64'), mimeType: 'image/png' });
    return content;
  }
  const hint = result.png && !preview ? ' (preview: true para verla; detalle: pgs_inspect)' : '';
  content.push({ type: 'text', text: briefLine(name, result) + hint });
  if (preview && result.png) content.push({ type: 'image', data: result.png.toString('base64'), mimeType: 'image/png' });
  return content;
}
