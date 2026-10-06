// The divergence traffic light, Joaquín's condition for letting the retouch
// layer win over the recipe.
//
// A retouch is a layer the hand paints over what a command generated, and now
// it can also take pixels out, so what the editor shows is what the drawing
// ends up being. That is useful and it is also a slope: the more of the drawing
// the layer decides, the less true it is that the recipe makes that drawing.
// Re-running it stops being a check, and reading the recipe to know what the
// asset looks like starts being wrong.
//
// So every command that lays a retouch on says **how much it is covering**, and
// past a threshold it says what to do about it: move the corrections up into the
// recipe. It never refuses. A warning is a warning.
//
// Pure: no Node, no disk. The editor imports it too.

/** How much of a drawing the layer on top decides, rather than the recipe. */
export interface RetouchCoverage {
  /** Pixels the layer paints (a color of its own over whatever was there). */
  painted: number;
  /** Of those, how many differ from the generated base underneath. */
  changed: number;
  /** Pixels the layer takes out: ink the recipe painted and the hand rubbed off. */
  erased: number;
  /**
   * Pixels where the hand's word differs from the recipe's (`changed + erased`).
   */
  divergent: number;
  /**
   * Pixels the drawing has ink in, before or after the layer: the drawing, as
   * opposed to the empty canvas around it. The denominator of `share`.
   */
  ink: number;
  /** `divergent / ink`, 0 when the drawing has no ink at all. */
  share: number;
}

/**
 * Where the warning starts: **a fifth of the drawing**.
 *
 * Not a round number for its own sake. Below it a retouch is what it is meant
 * to be — the handful of pixels a parameter cannot express (the whole hand pass
 * of the Nube 8 font is 1 pixel in ~1500 of ink, 0.07%). At one pixel in five
 * the recipe no longer predicts the drawing: re-running it proves nothing,
 * `map_compare` and `font_contact` are measuring the hand and not the engine,
 * and a second asset made from the same recipe will not look like this one.
 * That is the point where the cheap fix (one more parameter, one more row of the
 * base sheet) is still cheaper than the drift.
 *
 * It is a warning and never a refusal, so erring low costs a line of text and
 * erring high costs the bridge between the recipe and the drawing.
 */
export const DIVERGENCE_LIMIT = 0.2;

/** `0.234` → `23%`; a share that is not zero never rounds down to `0%`. */
export function pct(share: number): string {
  const n = Math.round(share * 100);
  return n === 0 && share > 0 ? '<1%' : `${n}%`;
}

/** One line in Spanish: what the layer is covering. Always worth printing. */
export function coverageLine(c: RetouchCoverage): string {
  const parts = [`${c.painted} px pintados`];
  if (c.changed !== c.painted) parts.push(`${c.changed} cambian algo`);
  if (c.erased > 0) parts.push(`${c.erased} borrados`);
  return `${parts.join(', ')} · ${pct(c.share)} del dibujo lo decide la capa`;
}

/**
 * The warning, when there is one: the share is over the limit, so the
 * corrections belong in the recipe. `source` names what to go and change (the
 * recipe or spec of the drawing's `generated_by:`, when it is known).
 */
export function divergenceWarning(c: RetouchCoverage, source?: string): string | undefined {
  if (c.share < DIVERGENCE_LIMIT || c.ink === 0) return undefined;
  const where = source ? ` en ${source}` : '';
  return `⚠ la capa de retoque decide el ${pct(c.share)} del dibujo (${c.divergent} de ${c.ink} px con tinta): ` +
    `a partir del ${pct(DIVERGENCE_LIMIT)} la receta ya no genera este dibujo. ` +
    `Subí las correcciones a la receta${where} y dejá en el retoque sólo lo que de verdad es a mano.`;
}

/** The `recipe=`/`spec=`/`base=` of a `generated_by:`, which is what to go and change. */
export function divergenceSource(args?: Record<string, string>): string | undefined {
  if (!args) return undefined;
  return args.recipe ?? args.spec ?? args.base ?? args.overlay;
}
