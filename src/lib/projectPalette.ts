/**
 * Cambiar la paleta de un proyecto y que la sigan sus assets (Khadosh/estudio#226).
 *
 * Un asset nuevo copia la paleta del proyecto (`newAsset.ts`): no la apunta.
 * Cambiarla después no tocaba los que ya existían. Esto propaga el cambio a
 * los assets que siguen siendo «de la paleta» (sus colores 1..n son, en orden,
 * los de la paleta vieja), sin cambiar el formato del asset.
 *
 * - Misma paleta editada (mismo `from` y la misma cantidad de colores): por
 *   índice; los píxeles no se tocan, cambian los hex.
 * - Otra paleta (otro `from` o distinta cantidad): por índice daría colores al
 *   azar, así que cada color viejo va al más cercano de la nueva y se
 *   reescriben los píxeles.
 * - Los colores que el asset sumó a mano después de los del proyecto se
 *   conservan, corridos para quedar después de los nuevos.
 *
 * Un asset al que le cambiaron un color del proyecto a mano ya no es «de la
 * paleta» y no se toca: así no se pisa un retoque sin avisar.
 *
 * Puro: sin React ni Supabase.
 */
import type { Frame, SpriteAsset } from '@/lib/types';
import { assetPalette, type ProjectPalette } from '@/lib/newAsset';
import { hexToRgb } from '@/lib/colorUtils';
import { nearestPaletteIndex } from '@/lib/imageToPixelData';

const same = (a: string | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();

/** Si el asset sigue teniendo, en orden, los colores de la paleta del proyecto. */
export function followsPalette(asset: Pick<SpriteAsset, 'palette'>, palette: ProjectPalette): boolean {
  return palette.colors.every((hex, i) => same(asset.palette?.[i + 1], hex));
}

/** Si el cambio va por índice (la misma paleta, retocada) o por color más cercano. */
export function remapsByIndex(from: ProjectPalette, to: ProjectPalette): boolean {
  return from.from === to.from && from.colors.length === to.colors.length;
}

/** Índice viejo → índice nuevo, para un asset que sigue la paleta `from`. */
export function indexMap(asset: Pick<SpriteAsset, 'palette'>, from: ProjectPalette, to: ProjectPalette): Map<number, number> {
  const map = new Map<number, number>([[0, 0]]);
  const n = from.colors.length;
  const byIndex = remapsByIndex(from, to);
  const targets = to.colors.map((hex) => hexToRgb(hex));
  for (let i = 1; i <= n; i++) {
    const rgb = hexToRgb(from.colors[i - 1]);
    map.set(i, byIndex ? i : nearestPaletteIndex(rgb, targets) + 1);
  }
  const extras = Object.keys(asset.palette ?? {}).map(Number).filter((k) => k > n).sort((a, b) => a - b);
  extras.forEach((k, j) => map.set(k, to.colors.length + 1 + j));
  return map;
}

const remapFrame = (frame: Frame, map: Map<number, number>): Frame =>
  frame.map((row) => row.map((p) => map.get(p) ?? p));

/** El asset con la paleta `to` en lugar de `from`. No mira si la sigue: eso es `followsPalette`. */
export function repaletteAsset(asset: SpriteAsset, from: ProjectPalette, to: ProjectPalette): SpriteAsset {
  const map = indexMap(asset, from, to);
  const base = assetPalette(to);
  const palette: Record<number, string> = { ...base.palette };
  const colorNames: Record<number, string> = { ...base.colorNames };
  for (const [k, hex] of Object.entries(asset.palette ?? {})) {
    const old = Number(k);
    if (old <= from.colors.length) continue;
    palette[map.get(old)!] = hex;
    if (asset.colorNames?.[old] !== undefined) colorNames[map.get(old)!] = asset.colorNames[old];
  }
  return {
    ...asset,
    palette,
    colorNames,
    ...(asset.frames ? { frames: asset.frames.map((f) => remapFrame(f, map)) } : {}),
    ...(asset.layers ? {
      layers: asset.layers.map((l) => ({
        ...l,
        frames: l.frames.map((f) => remapFrame(f, map)),
        ...(l.paletteIds ? { paletteIds: [...new Set(l.paletteIds.map((p) => map.get(p) ?? p))] } : {}),
      })),
    } : {}),
  };
}

/** Qué assets cambian y cuáles quedan afuera por tener colores propios. */
export function planRepalette<T extends { asset_data: Pick<SpriteAsset, 'palette'> }>(
  sprites: T[],
  from: ProjectPalette | undefined,
): { follow: T[]; keep: T[] } {
  if (!from) return { follow: [], keep: sprites };
  const follow: T[] = [];
  const keep: T[] = [];
  for (const s of sprites) (followsPalette(s.asset_data, from) ? follow : keep).push(s);
  return { follow, keep };
}
