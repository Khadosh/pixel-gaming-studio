import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deriveModel, renderVoxel, type VoxelModel } from './voxel';
import { animationPoses, limbChain, poseBoxes, poseChains, resolvePose, riggedModels, validateRig, type Rig, type RigPose, type Vec3 } from './voxelrig';
import { runCommand } from './commands';
import { loadAsset } from './asset';

// The rig of Tomás (fixtures/rig/README.md): his skeleton, read off the studio's
// script, against the poses that script drew by hand.
const DIR = resolve(__dirname, 'fixtures/rig');
const load = (p: string) => JSON.parse(readFileSync(resolve(DIR, p), 'utf8'));
const model = (f: string) => deriveModel(load(`${f}.voxel.json`), p => load(p)) as VoxelModel;
const rig = (): Rig => validateRig(load('persona.rig.json'));
const posed = (m: VoxelModel, pose: RigPose | string, r = rig()): VoxelModel => ({ ...m, boxes: poseBoxes(r, m.boxes, resolvePose(r, pose)) });

/** Every cell of a model's boxes (the round ones aside) with its material and group; later boxes win, as they draw. */
function cells(m: VoxelModel): Map<string, string> {
  const s = new Map<string, string>();
  for (const b of m.boxes) {
    if (b.shape) continue;
    for (let x = 0; x < b.size[0]; x++) for (let y = 0; y < b.size[1]; y++) for (let z = 0; z < b.size[2]; z++) s.set(`${b.at[0] + x},${b.at[1] + y},${b.at[2] + z}`, `${b.material}/${b.group}`);
  }
  return s;
}

function samePixels(a: VoxelModel, b: VoxelModel): number {
  const A = renderVoxel(a), B = renderVoxel(b);
  expect([B.width, B.height, ...B.origin]).toEqual([A.width, A.height, ...A.origin]);
  let n = 0;
  for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) if (A.pixels[y][x] !== B.pixels[y][x]) n++;
  return n;
}

const REAL: [string, string][] = [
  ['parada', 'persona_parada_yp'],
  ...[1, 2, 3, 4].map(i => [`camina_${i}`, `persona_camina_yp_${i}`] as [string, string]),
  ...[1, 2, 3, 4].map(i => [`corre_${i}`, `persona_corre_yp_${i}`] as [string, string]),
];

describe('voxel rig: the poses drawn by hand, from data', () => {
  const base = model('persona_parada_yp');
  for (const [pose, file] of REAL) {
    it(`${pose} is ${file}, cell for cell and pixel for pixel`, () => {
      const truth = model(file);
      const mine = posed(base, pose);
      expect([...cells(mine)].sort()).toEqual([...cells(truth)].sort());
      expect(samePixels(truth, mine)).toBe(0);
      // The head (round shapes) went where the drawing has it.
      expect(mine.boxes.filter(b => b.shape).map(b => b.at)).toEqual(truth.boxes.filter(b => b.shape).map(b => b.at));
    });
  }

  it('the walk as an animation gives the four frames, and so does the model with animation', () => {
    const r = rig();
    const poses = animationPoses(r, 'camina');
    expect(poses).toHaveLength(4);
    poses.forEach((p, i) => expect(samePixels(model(`persona_camina_yp_${i + 1}`), posed(base, p, r))).toBe(0));
    const { models, fps } = riggedModels({ ...base, animation: 'corre' }, r);
    expect(fps).toBe(12);
    models.forEach((m, i) => expect(samePixels(model(`persona_corre_yp_${i + 1}`), m as VoxelModel)).toBe(0));
    expect(models[0]).not.toHaveProperty('animation');
  });

  it('a turned figure turns with its pose: the rig model with rotate is the drawn one turned', () => {
    const truth = { ...model('persona_camina_yp_2'), rotate: 90 };
    expect(samePixels(truth, { ...posed(base, 'camina_2'), rotate: 90 })).toBe(0);
  });
});

describe('voxel rig: poses', () => {
  const r = rig();
  const root = (n: string): Vec3 => poseChains(r, {})[n][0];

  it('swing, reach and through say the same chain', () => {
    const swing = limbChain('brazo_d', r.limbs!.brazo_d, root('brazo_d'), { swing: [40, 60] });
    const reach = limbChain('brazo_d', r.limbs!.brazo_d, root('brazo_d'), { reach: swing[2] });
    reach.forEach((p, i) => p.forEach((v, k) => expect(v).toBeCloseTo(swing[i][k], 6)));
    expect(limbChain('brazo_d', r.limbs!.brazo_d, root('brazo_d'), { through: [swing[1], swing[2]] })).toEqual(swing);
  });

  it('reach puts the hand on the point and bends the elbow the way an elbow bends', () => {
    const target: Vec3 = [32, 34, 34];
    const pts = poseChains(r, { brazo_d: { reach: target } }).brazo_d;
    pts[2].forEach((v, k) => expect(v).toBeCloseTo(target[k], 6));
    // The forearm turns forward of the upper arm, never back.
    const swing = (a: Vec3, b: Vec3) => Math.atan2(b[1] - a[1], -(b[2] - a[2]));
    expect(swing(pts[1], pts[2]) - swing(pts[0], pts[1])).toBeGreaterThan(0);
  });

  it('a pose named from another one takes it and changes what it says', () => {
    const p = resolvePose({ ...r, poses: { ...r.poses, otra: { from: 'camina_1', brazo_d: { swing: [90, 0] } } } }, 'otra');
    expect(p.pierna_i).toEqual(r.poses!.camina_1.pierna_i);
    expect(p.brazo_d).toEqual({ swing: [90, 0] });
  });

  it('the first new pose comes out of data: no box written, the arm up in front', () => {
    const b = posed(model('persona_parada_yp'), 'senala');
    const arm = b.boxes.filter(x => x.group === 'brazo_i');
    const top = Math.max(...arm.map(x => x.at[2] + x.size[2]));
    const front = Math.max(...arm.map(x => x.at[1] + x.size[1]));
    // Over the shoulder (36) and in front of the chest (24 + 3).
    expect(top).toBeGreaterThan(40);
    expect(front).toBeGreaterThan(30);
    // The other arm and the legs are the standing ones.
    const stand = model('persona_parada_yp');
    const keep = (m: VoxelModel) => [...cells(m)].filter(([, v]) => !v.endsWith('/brazo_i')).sort();
    expect(keep(b)).toEqual(keep(stand));
  });
});

describe('voxel rig: animation', () => {
  const r = rig();
  it('between two keys the arm goes through the angles between, its bones the same length', () => {
    const poses = animationPoses(r, 'saluda');
    expect(poses).toHaveLength(4);
    const chains = poses.map(p => poseChains(r, p).brazo_i);
    const len = (c: Vec3[], i: number) => Math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1], c[i + 1][2] - c[i][2]);
    for (const c of chains) {
      expect(len(c, 0)).toBeCloseTo(6, 6);
      expect(len(c, 1)).toBeCloseTo(8, 6);
    }
    // The hand of frame 1 (between keys 0 and 2) is between theirs; frame 3 goes back round the loop.
    const x = chains.map(c => c[2][0]);
    expect(x[1]).toBeGreaterThan(Math.min(x[0], x[2]));
    expect(x[1]).toBeLessThan(Math.max(x[0], x[2]));
    expect(x[3]).toBeCloseTo(x[1], 6);
  });

  it('without loop, what is past the last key holds it', () => {
    const p = animationPoses(r, { frames: 4, loop: false, keys: { 0: 'parada', 2: 'senala' } });
    expect(p[3]).toEqual(p[2]);
  });

  it('moves of a joint go to whole units on the way', () => {
    const p = animationPoses(r, { frames: 3, keys: { 0: { cadera: [0, 0, 0] }, 2: { cadera: [0, 0, 3] } }, loop: false });
    expect(p[1].cadera).toEqual([0, 0, 2]);
  });
});

describe('voxel rig: limits', () => {
  const r = rig();
  it('an elbow bent backwards is refused, naming the limb and the angle', () => {
    expect(() => poseChains(r, { brazo_d: { swing: [0, -40] } })).toThrow(/brazo_d: bend -40° is under 0°/);
  });

  it('a knee bent forwards and a leg kicked too far are refused, all at once', () => {
    expect(() => poseChains(r, { pierna_i: { swing: [0, 60] }, pierna_d: { swing: [150, 0] } })).toThrow(/pierna_i: bend 60° is over 5°.*pierna_d: swing 150° is over 120°/);
  });

  it('a bone stretched past its slack is refused; the pose may say it stretches on purpose', () => {
    const far: RigPose = { brazo_d: { through: [[33, 24, 30], [33, 24, 16]] } };
    expect(() => poseChains(r, far)).toThrow(/brazo_d: bone 2 is 14\.00 long and it is 8 \(±1\)/);
    expect(() => poseChains(r, { brazo_d: { ...(far.brazo_d as object), stretch: 6 } })).not.toThrow();
  });

  it('a point out of reach is refused saying how short it falls', () => {
    expect(() => poseChains(r, { brazo_d: { reach: [33, 50, 36] } })).toThrow(/brazo_d: reach \[33, 50, 36\] is 26\.0 from the root and the limb is 14 long \(12\.0 short\)/);
  });

  it('names that are no limb or joint, two ways at once and a tilt with no spine are refused', () => {
    expect(() => poseChains(r, { brazo: { swing: [10] } } as RigPose)).toThrow(/pose names "brazo", which is no limb/);
    expect(() => poseChains(r, { brazo_d: { swing: [10], reach: [1, 2, 3] } })).toThrow(/swing and reach/);
    expect(() => poseChains(r, { cadera: [0, 0, 0.5] } as unknown as RigPose)).toThrow(/three whole units/);
    const { spine: _s, ...noSpine } = r;
    void _s;
    expect(() => poseBoxes(noSpine, model('persona_parada_yp').boxes, { tilt: { every: 3 } })).toThrow(/no spine/);
  });

  it('every pose the rig carries is within its limits', () => {
    for (const name of Object.keys(r.poses!)) expect(() => poseChains(r, resolvePose(r, name)), name).not.toThrow();
    for (const name of Object.keys(r.animations!)) expect(() => animationPoses(r, name).forEach(p => poseChains(r, p)), name).not.toThrow();
  });
});

describe('voxel command with a rig', () => {
  it('a model with rig and animation draws the strip of its frames, the same as the drawn frames', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, 'camina.voxel.json'), JSON.stringify({ id: 'camina', base: join(DIR, 'persona_parada_yp.voxel.json'), rig: join(DIR, 'persona.rig.json'), animation: 'camina' }));
    const out = join(dir, 'camina.pss.json');
    const res = await runCommand('voxel', { model: join(dir, 'camina.voxel.json'), out, png: join(dir, 'camina.png'), layers: true });
    expect(res.text).toMatch(/voxel camina: 4 cuadros de/);
    const hand = join(dir, 'mano.pss.json');
    await runCommand('voxel', { frames: [1, 2, 3, 4].map(i => join(DIR, `persona_camina_yp_${i}.voxel.json`)), out: hand, png: join(dir, 'mano.png'), fps: 8 });
    const a = loadAsset(out), b = loadAsset(hand);
    expect(a.layers?.[0].frames).toEqual(b.layers?.[0].frames);
    expect(a.animations[0].fps).toBe(8);
    expect(readFileSync(join(dir, 'camina.png'))).toEqual(readFileSync(join(dir, 'mano.png')));
    expect(JSON.parse(readFileSync(join(dir, 'camina.lugar.json'), 'utf8')).frames).toBe(4);
    expect(a.generatedBy?.args.model).toBe('camina.voxel.json');
  });

  it('a rig beside the model, a pose by data, and the rig taken from the base', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, 'persona.rig.json'), readFileSync(join(DIR, 'persona.rig.json')));
    writeFileSync(join(dir, 'base.voxel.json'), JSON.stringify({ id: 'base', base: join(DIR, 'persona_parada_yp.voxel.json'), rig: 'persona.rig.json' }));
    writeFileSync(join(dir, 'senala.voxel.json'), JSON.stringify({ id: 'senala', base: 'base.voxel.json', pose: { brazo_i: { swing: [145, 0], spread: [20, 0] } } }));
    await runCommand('voxel', { model: join(dir, 'senala.voxel.json'), out: join(dir, 'senala.pss.json') });
    expect(existsSync(join(dir, 'senala.pss.json'))).toBe(true);
    writeFileSync(join(dir, 'mal.voxel.json'), JSON.stringify({ id: 'mal', base: 'base.voxel.json', pose: { brazo_i: { swing: [0, -90] } } }));
    await expect(runCommand('voxel', { model: join(dir, 'mal.voxel.json'), out: join(dir, 'mal.pss.json') })).rejects.toThrow(/voxel: mal\.voxel\.json: rig: the pose is out of the limits: brazo_i: bend -90° is under 0°/);
    writeFileSync(join(dir, 'sin.voxel.json'), JSON.stringify({ id: 'sin', base: join(DIR, 'persona_parada_yp.voxel.json'), pose: 'parada' }));
    await expect(runCommand('voxel', { model: join(dir, 'sin.voxel.json'), out: join(dir, 'sin.pss.json') })).rejects.toThrow(/pose and animation need a rig/);
  });
});
