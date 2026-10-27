// La lámina del rig voxel (Khadosh/pixel-gaming-studio#60): las poses de Tomás dibujadas a mano
// al lado de las mismas dichas como datos del rig, la primera pose nueva y una animación interpolada.
//   npx tsx scripts/rig-lamina.ts [salida.png]     (por defecto docs/rig/lamina.png)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveModel, renderVoxel, type VoxelModel, type VoxelImage } from '../src/headless/voxel';
import { poseBoxes, resolvePose, animationPoses, validateRig, type Rig, type RigPose } from '../src/headless/voxelrig';
import { blankImage, writePng, setPixel } from '../src/headless/png';
import { drawText } from '../src/headless/inspect';
const D = resolve(dirname(fileURLToPath(import.meta.url)), '../src/headless/fixtures/rig');
const pal = JSON.parse(readFileSync(resolve(D, 'paleta.pss.json'), 'utf8'));
const hex: Record<string, string> = {}; for (const [k, h] of Object.entries(pal.palette)) hex[pal.colorNames[k]] = h as string;
const load = (p: string) => JSON.parse(readFileSync(resolve(D, p), 'utf8'));
const model = (f: string) => deriveModel(load(f), p => load(p)) as VoxelModel;
const rig = validateRig(load('persona.rig.json')) as Rig;
const posed = (m: VoxelModel, pose: RigPose) => ({ ...m, boxes: poseBoxes(rig, m.boxes, pose) }) as VoxelModel;
const S = 3, CW = 44, CH = 80;
type Cell = { im: VoxelImage; label: string };
const rows: { title: string; cells: Cell[] }[] = [];
const hand = (f: string) => model(f + '.voxel.json');
const row = (title: string, cells: [string, VoxelModel][]) => rows.push({ title, cells: cells.map(([label, m]) => ({ label, im: renderVoxel(m) })) });
const P = (f: string, pose: string, base?: string) => posed(hand(base ?? f), resolvePose(rig, pose));
row('MANO PARADA', [['A MANO 1', hand('persona_mano_parada_yp_1')], ['A MANO 2', hand('persona_mano_parada_yp_2')], ['RIG CALCO 1', P('persona_parada_yp', 'mano_parada_calco_1')], ['RIG CALCO 2', P('persona_parada_yp', 'mano_parada_calco_2')], ['RIG HUESOS 1', P('persona_parada_yp', 'mano_parada_1')], ['RIG HUESOS 2', P('persona_parada_yp', 'mano_parada_2')]]);
for (const [t, f, p] of [['TECLEA DE PIE', 'persona_teclea_yp', 'teclea'], ['DIBUJA', 'persona_dibuja_yp', 'dibuja']] as const) {
  row(t, [[ 'A MANO 1', hand(f + '_1')], ['A MANO 2', hand(f + '_2')], ['RIG 1', P(f + '_1', p + '_1')], ['RIG 2', P(f + '_2', p + '_2')]]);
}
row('LLEVA', [['A MANO 1', hand('persona_lleva_yp_1')], ['A MANO 2', hand('persona_lleva_yp_2')], ['RIG 1', P('', 'lleva_1', 'persona_lleva_yp_1')], ['RIG 2', P('', 'lleva_2', 'persona_lleva_yp_2')]]);
row('SENTADA', [['A MANO 1', hand('persona_sentada_yp_1')], ['RIG CALCO', P('', 'sentada_1', 'persona_parada_yp')], ['RIG HUESOS', P('', 'sentada_huesos_1', 'persona_parada_yp')]]);
const base = hand('persona_parada_yp');
row('SENALA NUEVA', animationPoses(rig, 'senala').map((p, i) => [`CUADRO ${i + 1}`, posed(base, p)] as [string, VoxelModel]));
row('SALUDA INTERP', animationPoses(rig, 'saluda').map((p, i) => [`CUADRO ${i + 1}${i % 2 ? ' ENTRE' : ''}`, posed(base, p)] as [string, VoxelModel]));
const cols = Math.max(...rows.map(r => r.cells.length));
const W = 120 + cols * CW * S, Hh = rows.length * (CH * S + 24) + 8;
const img = blankImage(W, Hh, [40, 32, 52, 255]);
const rgb = (h: string): [number, number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
rows.forEach((r, ri) => {
  const y0 = 8 + ri * (CH * S + 24);
  drawText(img, r.title, 6, y0 + CH * S / 2, 2, [230, 220, 240, 255]);
  r.cells.forEach((c, ci) => {
    const x0 = 120 + ci * CW * S;
    drawText(img, c.label, x0 + 4, y0, 2, [200, 190, 215, 255]);
    // El pie del modelo (24, 24, 0) sobre una línea común.
    const [ox, oy] = c.im.origin; const fx = ox + 0, fy = oy + 24; // pantalla del (24,24,0): origin + (x - y, (x+y)/2 - z)
    const dx = Math.round(CW / 2 - fx), dy = Math.round(CH - 6 - fy);
    for (let y = 0; y < c.im.height; y++) for (let x = 0; x < c.im.width; x++) {
      const n = c.im.pixels[y][x]; if (!n) continue;
      const col = rgb(n.startsWith('#') ? n : hex[n]);
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const X = x0 + (x + dx) * S + b, Y = y0 + 16 + (y + dy) * S + a; if (X >= 0 && Y >= 0 && X < W && Y < Hh) setPixel(img, X, Y, col); }
    }
  });
});
const out = process.argv[2] ?? resolve(D, '../../../../docs/rig/lamina.png');
writePng(out, img);
console.log(`${out}: ${W}x${Hh}`);
