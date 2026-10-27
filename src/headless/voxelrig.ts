/**
 * A skeleton for a voxel model (Khadosh/pixel-gaming-studio#60): `figure` in 3D.
 *
 * A model says its `rig` and its `pose` (or its `animation`) and the rig lays
 * the boxes in that posture; then it is drawn as any model is (turns, frames,
 * layers, light and shadows). Pure: the command reads the rig from disk.
 *
 * What a rig is, at the scale of these figures (a head of 12 units): the
 * parts that do not bend (the torso, the head, what is carried) are the
 * model's own boxes, grouped, and each group **follows a joint**: it moves
 * when the joint moves. The limbs are not boxes at all: a limb is a chain of
 * bones from a joint, with a section (width × depth) swept along it, which is
 * how a bent arm is drawn at this size — a box pointing another way, thicker
 * where it lies down — and how the studio's people had their arms and legs
 * swept by hand (`miembro()` in art/voxel/gente/armar_persona.py, ported here
 * exactly, so the rig gives their poses cell for cell). Segments are placed,
 * never turned voxel by voxel.
 *
 * A pose is data, per limb, one of three ways: `swing` (and `spread`), the
 * angle of each bone in degrees; `reach`, a point the end goes to (a hand on
 * a key, a foot on the floor), solved for two bones; or `through`, the points
 * of the chain themselves. Plus where the joints are moved (`cadera: [0, 0, 1]`,
 * the body up a unit in the step of a walk) and how the spine leans (`tilt`).
 * An animation is key poses interpolated in the space of the joints. Every
 * limb has limits (an elbow does not bend backwards, a bone does not stretch)
 * and a pose outside them is refused naming the limb, the joint and the angle.
 */

export type Vec3 = [number, number, number];

export interface RigJoint {
  /** The root: where it is in the model. Any other: where it is from its parent, at rest. */
  at: Vec3;
  parent?: string;
}

/** A material along a limb, up to `to` units of length from its root (the last band has no `to`). */
export interface RigBand {
  material: string;
  to?: number;
}

/** Limits of a limb, in degrees: each a [lowest, highest]. */
export interface RigLimits {
  /** The first bone forward (+) or back (−) from hanging straight down. */
  swing?: [number, number];
  /** The first bone out to its side (+) or across the body (−). */
  spread?: [number, number];
  /** How the second bone turns from the first, in their plane, + forward: an elbow [0, 150], a knee [-150, 0]. */
  bend?: [number, number];
}

export interface RigLimb {
  /** The joint it hangs from. */
  from: string;
  /** Its root from that joint: the middle of its section at the top. */
  at: Vec3;
  /** The group its cells go in; the model's own boxes of that group are left out. */
  group: string;
  /** The length of each bone, root to end (an arm: shoulder to elbow, elbow to hand). */
  bones: number[];
  /** Width (along x) and depth (along y) of what is swept. */
  section: [number, number];
  /** Which way is out: −1 for a limb on −x, 1 on +x. */
  side: -1 | 1;
  bands: RigBand[];
  /** A box at the end (a foot): from the end point, x from the first column of the section. */
  end?: { at: Vec3; size: Vec3; material: string };
  /** Where a bone runs below it, its thickness stops `top` units above the root (default 0): no shoulder pokes over the torso. */
  top?: number;
  /** The rows just under the root left out: a shoulder that falls. */
  cut?: number;
  /** Groups whose cells it does not paint over (a skirt over the legs). */
  under?: string[];
  limits?: RigLimits;
  /** With `through`, how far a bone may differ from its length (default 1). */
  stretch?: number;
}

/** A limb in a pose: one of swing (with spread), reach or through. */
export interface RigLimbPose {
  /** Degrees, one per bone: the first from hanging straight down, each next one from the bone before; + forward. */
  swing?: number[];
  /** Degrees out to the side, one per bone, the same way. */
  spread?: number[];
  /** The point the end goes to, in the model. Two bones; the middle joint bends the way the limits allow. */
  reach?: Vec3;
  /** The points of the chain after the root, in the model: one per bone. */
  through?: Vec3[];
  /** With through: how far a bone may differ from its length in this pose (a drawing that cheats, said out loud). */
  stretch?: number;
}

export interface RigTilt {
  /** One unit over for every so many of height, between the two joints of `spine`. */
  every: number;
  /** At most this many units. */
  max?: number;
  /** Back (−y) instead of forward. */
  back?: boolean;
}

/** A pose: limb names to their pose, joint names to how far they move, and `tilt`. */
export type RigPose = { tilt?: RigTilt; from?: string } & Record<string, RigLimbPose | Vec3 | RigTilt | string | undefined>;

export interface RigAnimation {
  frames: number;
  fps?: number;
  /** Key poses by frame (0 is the first): a pose, or the name of one of the rig's. */
  keys: Record<string, RigPose | string>;
  /** After the last key it goes back to the first (default true). */
  loop?: boolean;
}

export interface Rig {
  joints: Record<string, RigJoint>;
  /** Groups of the model's boxes and the joint each one follows. */
  follow?: Record<string, string>;
  limbs?: Record<string, RigLimb>;
  /** The spine, from the joint it leans about to the one above: what `tilt` bends. */
  spine?: [string, string];
  poses?: Record<string, RigPose>;
  animations?: Record<string, RigAnimation>;
}

/** Python's round: halves go to the even neighbour (the sweep was written with it). */
function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** The first cell of a run `n` wide whose middle is at `c`. */
function startOf(c: number, n: number): number {
  return n % 2 === 0 ? Math.floor(c + 0.5) - n / 2 : Math.floor(c) - (n - 1) / 2;
}

type Cell = { material: string; group: string };
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const unkey = (k: string) => k.split(',').map(Number) as Vec3;

/** Where every joint is, rest positions plus what the pose moves (a joint carries its children). */
export function jointPositions(rig: Rig, pose: RigPose = {}): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  const visit = (name: string, chain: string[]): Vec3 => {
    if (out[name]) return out[name];
    const j = rig.joints[name];
    if (!j) throw new Error(`rig: joint "${name}" is not in joints (${Object.keys(rig.joints).join(', ')})`);
    if (chain.includes(name)) throw new Error(`rig: joint ${name} is its own ancestor (${[...chain, name].join(' → ')})`);
    const base = j.parent ? visit(j.parent, [...chain, name]) : [0, 0, 0];
    const by = pose[name] as Vec3 | undefined;
    const p: Vec3 = [base[0] + j.at[0] + (by?.[0] ?? 0), base[1] + j.at[1] + (by?.[1] ?? 0), base[2] + j.at[2] + (by?.[2] ?? 0)];
    out[name] = p;
    return p;
  };
  for (const n of Object.keys(rig.joints)) visit(n, []);
  return out;
}

/** How a joint moved from rest. */
function moved(rest: Record<string, Vec3>, now: Record<string, Vec3>, joint: string): Vec3 {
  return [now[joint][0] - rest[joint][0], now[joint][1] - rest[joint][1], now[joint][2] - rest[joint][2]];
}

/** The angles a bone makes (degrees): swing from hanging, + forward, and spread out to `side`. */
function anglesOf(d: Vec3, side: number): { swing: number; spread: number; length: number } {
  const length = Math.hypot(d[0], d[1], d[2]);
  if (!length) return { swing: 0, spread: 0, length };
  return { swing: Math.atan2(d[1], -d[2]) * DEG, spread: Math.asin(Math.max(-1, Math.min(1, (side * d[0]) / length))) * DEG, length };
}

const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** The bend of each joint after the first: how the next bone's swing turns from the one before. */
function bendsOf(points: Vec3[], side: number): number[] {
  const bones = points.slice(1).map((p, i) => anglesOf([p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2]], side));
  return bones.slice(1).map((b, i) => wrap(b.swing - bones[i].swing));
}

/** The chain of a limb in a pose: its root and one point per bone. */
export function limbChain(name: string, limb: RigLimb, root: Vec3, lp: RigLimbPose = {}): Vec3[] {
  const kinds = (['swing', 'reach', 'through'] as const).filter(k => lp[k] !== undefined);
  if (kinds.length > 1) throw new Error(`rig: ${name} says ${kinds.join(' and ')}: one of swing, reach or through`);
  if (lp.stretch !== undefined && !lp.through) throw new Error(`rig: ${name}: stretch goes with through (the points that stretch the bones)`);
  if (lp.spread !== undefined && kinds[0] && kinds[0] !== 'swing') throw new Error(`rig: ${name}: spread goes with swing, not with ${kinds[0]}`);
  const n = limb.bones.length;
  if (lp.through) {
    if (lp.through.length !== n) throw new Error(`rig: ${name}: through has ${lp.through.length} points and the limb ${n} bones (one point per bone)`);
    return [root, ...lp.through];
  }
  if (lp.reach) return [root, ...reachChain(name, limb, root, lp.reach)];
  const swing = lp.swing ?? [];
  const spread = lp.spread ?? [];
  for (const [what, v] of [['swing', swing], ['spread', spread]] as const) {
    if (v.length > n) throw new Error(`rig: ${name}: ${what} has ${v.length} angles and the limb ${n} bones`);
  }
  const pts: Vec3[] = [root];
  // Each angle in radians as it is added (the order the studio's sweep summed them in).
  let a = 0, o = 0;
  for (let i = 0; i < n; i++) {
    a = i === 0 ? (swing[0] ?? 0) * RAD : a + (swing[i] ?? 0) * RAD;
    o = i === 0 ? (spread[0] ?? 0) * RAD : o + (spread[i] ?? 0) * RAD;
    const L = limb.bones[i];
    const p = pts[i];
    pts.push(o === 0
      ? [p[0], p[1] + L * Math.sin(a), p[2] - L * Math.cos(a)]
      : [p[0] + limb.side * L * Math.sin(o), p[1] + L * Math.sin(a) * Math.cos(o), p[2] - L * Math.cos(a) * Math.cos(o)]);
  }
  return pts;
}

/** Two bones to a point: the middle joint on the side the limb bends to, within its limits. */
function reachChain(name: string, limb: RigLimb, root: Vec3, target: Vec3): Vec3[] {
  if (limb.bones.length !== 2) throw new Error(`rig: ${name}: reach is for a limb of two bones (it has ${limb.bones.length}); say swing or through`);
  const [L1, L2] = limb.bones;
  const d: Vec3 = [target[0] - root[0], target[1] - root[1], target[2] - root[2]];
  const dist = Math.hypot(...d);
  if (dist > L1 + L2 + 0.5) throw new Error(`rig: ${name}: reach [${target.join(', ')}] is ${dist.toFixed(1)} from the root and the limb is ${L1 + L2} long (${(dist - L1 - L2).toFixed(1)} short)`);
  if (dist < Math.abs(L1 - L2) - 0.5 || dist === 0) throw new Error(`rig: ${name}: reach [${target.join(', ')}] is too close to the root (${dist.toFixed(1)}; it folds to ${Math.abs(L1 - L2)} at most)`);
  const u: Vec3 = [d[0] / dist, d[1] / dist, d[2] / dist];
  const D = Math.min(dist, L1 + L2);
  const along = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  // The plane of the bend: the one through the line with the sideways axis in it, unless the line runs along x.
  const ref: Vec3 = Math.abs(u[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const v: Vec3 = [ref[1] * u[2] - ref[2] * u[1], ref[2] * u[0] - ref[0] * u[2], ref[0] * u[1] - ref[1] * u[0]];
  const vl = Math.hypot(...v);
  const cands = [1, -1].map(s => {
    const mid: Vec3 = [root[0] + u[0] * along + (s * v[0] * h) / vl, root[1] + u[1] * along + (s * v[1] * h) / vl, root[2] + u[2] * along + (s * v[2] * h) / vl];
    const end: Vec3 = [root[0] + u[0] * D, root[1] + u[1] * D, root[2] + u[2] * D];
    return [mid, end] as Vec3[];
  });
  // The one the limits like better: the elbow that does not bend backwards.
  const off = (c: Vec3[]) => limitProblems(name, limb, [root, ...c]).reduce((s, p) => s + p.by, 0);
  return off(cands[0]) <= off(cands[1]) ? cands[0] : cands[1];
}

interface Problem { what: string; by: number }

/** What of a chain is outside the limb's limits: each with how far. */
function limitProblems(name: string, limb: RigLimb, pts: Vec3[], stretchToo = false, stretch?: number): Problem[] {
  const out: Problem[] = [];
  const lim = limb.limits ?? {};
  const bones = pts.slice(1).map((p, i) => anglesOf([p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]], limb.side));
  const check = (what: string, v: number, r?: [number, number]) => {
    if (!r) return;
    if (v < r[0] - 1e-6) out.push({ what: `${name}: ${what} ${v.toFixed(0)}° is under ${r[0]}°`, by: r[0] - v });
    else if (v > r[1] + 1e-6) out.push({ what: `${name}: ${what} ${v.toFixed(0)}° is over ${r[1]}°`, by: v - r[1] });
  };
  if (bones[0]?.length) {
    check('swing', bones[0].swing, lim.swing);
    check('spread', bones[0].spread, lim.spread);
  }
  bendsOf(pts, limb.side).forEach((b, i) => check(bones.length > 2 ? `bend ${i + 1}` : 'bend', b, lim.bend));
  if (stretchToo) {
    const slack = stretch ?? limb.stretch ?? 1;
    bones.forEach((b, i) => {
      const off = Math.abs(b.length - limb.bones[i]);
      if (off > slack + 1e-9) out.push({ what: `${name}: bone ${i + 1} is ${b.length.toFixed(2)} long and it is ${limb.bones[i]} (±${slack})`, by: off });
    });
  }
  return out;
}

/**
 * The cells a limb paints, swept along its chain: the section, `width` along x
 * and `depth` along y, at every quarter unit of each bone; where a bone lies
 * down the section grows in height so it is not a sheet. The material is the
 * band of the length gone from the root. Exactly the sweep the studio wrote
 * by hand (`miembro`), with x free to move so a limb can go out to its side.
 */
export function sweepLimb(limb: RigLimb, pts: Vec3[], skip: (k: string) => boolean = () => false): Map<string, string> {
  const [w, dp] = limb.section;
  const tope = pts[0][2] + (limb.top ?? 0);
  const done = new Set<string>();
  const cells = new Map<string, string>();
  const bandAt = (s: number) => {
    for (const b of limb.bands) if (b.to === undefined || s < b.to) return b.material;
    return limb.bands[limb.bands.length - 1].material;
  };
  let s0 = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [xa, ya, za] = pts[k];
    const [xb, yb, zb] = pts[k + 1];
    const flat = xb === xa;
    const largo = flat ? Math.hypot(yb - ya, zb - za) : Math.hypot(xb - xa, yb - ya, zb - za);
    if (largo === 0) continue;
    const acostado = (flat ? Math.abs(yb - ya) : Math.hypot(xb - xa, yb - ya)) / largo;
    const grosor = roundHalfEven(2 * acostado);
    const n = Math.max(1, Math.trunc(largo * 4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = xa + (xb - xa) * t, y = ya + (yb - ya) * t, z = za + (zb - za) * t;
      const cx = startOf(x, w), cy = startOf(y, dp), cz = Math.floor(z);
      const lo = cz - Math.floor(grosor / 2) - (grosor % 2), hi = cz + Math.floor(grosor / 2);
      for (let zz = lo; zz <= hi; zz++) {
        // Only the thickness stops at the top: a bone that goes up (an arm raised) goes on.
        if (zz >= tope && cz < tope) continue;
        for (let yy = cy; yy < cy + dp; yy++) {
          for (let xx = cx; xx < cx + w; xx++) {
            const c = key(xx, yy, zz);
            if (done.has(c)) continue;
            done.add(c);
            if (skip(c)) continue;
            cells.set(c, bandAt(s0 + largo * t));
          }
        }
      }
    }
    s0 += largo;
  }
  if (limb.end) {
    const e = pts[pts.length - 1];
    const x0 = startOf(e[0], w) + limb.end.at[0];
    const y0 = Math.floor(e[1] + 0.5) + limb.end.at[1];
    const z0 = Math.floor(e[2] + 0.5) + limb.end.at[2];
    for (let x = x0; x < x0 + limb.end.size[0]; x++) {
      for (let y = y0; y < y0 + limb.end.size[1]; y++) {
        for (let z = z0; z < z0 + limb.end.size[2]; z++) if (!skip(key(x, y, z))) cells.set(key(x, y, z), limb.end.material);
      }
    }
  }
  if (limb.cut) {
    for (const c of [...cells.keys()]) {
      const z = unkey(c)[2];
      if (z >= pts[0][2] - limb.cut && z < pts[0][2]) cells.delete(c);
    }
  }
  return cells;
}

/** A pose by name (with what it is `from`), or the pose itself. */
export function resolvePose(rig: Rig, pose: RigPose | string | undefined, chain: string[] = []): RigPose {
  if (pose === undefined) return {};
  if (typeof pose === 'string') {
    const p = rig.poses?.[pose];
    if (!p) throw new Error(`rig: pose "${pose}" is not in the rig's poses (${Object.keys(rig.poses ?? {}).join(', ') || 'none'})`);
    if (chain.includes(pose)) throw new Error(`rig: pose ${pose} comes from itself (${[...chain, pose].join(' → ')})`);
    return resolvePose(rig, p, [...chain, pose]);
  }
  if (pose.from === undefined) return pose;
  const { from, ...rest } = pose;
  return { ...resolvePose(rig, from, chain), ...rest };
}

/** Every name a pose uses has to be a limb, a joint or tilt. */
function checkPose(rig: Rig, pose: RigPose): void {
  for (const [k, v] of Object.entries(pose)) {
    if (k === 'tilt' || v === undefined) continue;
    if (rig.limbs?.[k]) {
      if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`rig: pose ${k} is a limb: {swing}, {reach} or {through}`);
      continue;
    }
    if (rig.joints[k]) {
      if (!Array.isArray(v) || v.length !== 3 || !v.every(n => Number.isInteger(n))) throw new Error(`rig: pose ${k} is a joint: how far it moves, three whole units [x, y, z]`);
      continue;
    }
    throw new Error(`rig: pose names "${k}", which is no limb (${Object.keys(rig.limbs ?? {}).join(', ')}) nor joint (${Object.keys(rig.joints).join(', ')})`);
  }
}

export interface RigBox {
  at: Vec3;
  size: Vec3;
  material: string;
  group?: string;
  shape?: string;
  paint?: unknown;
}

/** The chain of every limb in a pose, refused when one is out of its limits. */
export function poseChains(rig: Rig, pose: RigPose): Record<string, Vec3[]> {
  checkPose(rig, pose);
  const at = jointPositions(rig, pose);
  const out: Record<string, Vec3[]> = {};
  const problems: string[] = [];
  for (const [name, limb] of Object.entries(rig.limbs ?? {})) {
    const j = at[limb.from];
    if (!j) throw new Error(`rig: limb ${name} hangs from "${limb.from}", which is no joint`);
    const root: Vec3 = [j[0] + limb.at[0], j[1] + limb.at[1], j[2] + limb.at[2]];
    const lp = pose[name] as RigLimbPose | undefined;
    const chain = limbChain(name, limb, root, lp);
    problems.push(...limitProblems(name, limb, chain, !!lp?.through, lp?.stretch).map(p => p.what));
    out[name] = chain;
  }
  if (problems.length) throw new Error(`rig: the pose is out of the limits: ${problems.join('; ')}`);
  return out;
}

/**
 * The boxes of a model in a pose: each group that follows a joint moved with
 * it, the limbs swept along their chains, the spine leaning. The model's own
 * boxes of a limb's group are left out (the rig draws that group). Cells that
 * are swept or leaned come out as columns of one material; boxes that only
 * move keep their shape, their paint and their place in the list.
 */
export function poseBoxes<B extends RigBox>(rig: Rig, boxes: B[], pose: RigPose = {}): B[] {
  const chains = poseChains(rig, pose);
  const rest = jointPositions(rig, {});
  const now = jointPositions(rig, pose);
  const limbs = rig.limbs ?? {};
  const limbGroups = new Set(Object.values(limbs).map(l => l.group));
  const follow = rig.follow ?? {};
  for (const [g, j] of Object.entries(follow)) if (!rig.joints[j]) throw new Error(`rig: follow ${g} names "${j}", which is no joint`);
  const descends = (j: string, from: string): boolean => j === from || (!!rig.joints[j]?.parent && descends(rig.joints[j].parent!, from));

  // The lean: what is between the two joints of the spine is sheared, what hangs above them goes whole.
  const tilt = pose.tilt;
  let shiftOf: ((z: number) => number) | undefined;
  let top = 0;
  let base = '', upper = '';
  if (tilt) {
    if (!rig.spine) throw new Error('rig: the pose has tilt and the rig no spine (the two joints it leans between)');
    [base, upper] = rig.spine;
    if (!Number.isInteger(tilt.every) || tilt.every < 1) throw new Error('rig: tilt.every is a whole number of units, 1 or more');
    const t0 = now[base][2], t1 = now[upper][2];
    const sign = tilt.back ? -1 : 1;
    shiftOf = (z: number) => {
      const n = Math.floor(Math.max(0, Math.min(z, t1) - t0) / tilt.every);
      return sign * (tilt.max === undefined ? n : Math.min(n, tilt.max));
    };
    top = shiftOf(t1);
  }
  // A group (or limb) leans by the cell when it follows the base of the spine, goes whole above it, stays below.
  const leanOf = (joint: string | undefined): 'shear' | 'whole' | 'stay' => {
    if (!tilt || !joint) return 'stay';
    if (descends(joint, upper)) return 'whole';
    if (joint === base) return 'shear';
    return 'stay';
  };

  const out: B[] = [];
  const placed = new Set<string>();
  const sweptCells = (name: string): B[] => {
    const limb = limbs[name];
    const avoid = new Set(limb.under ?? []);
    // Cells of the groups it goes under, where they are now.
    const taken = new Set<string>();
    for (const b of boxes) {
      if (!b.group || !avoid.has(b.group) || b.shape) continue;
      const by = follow[b.group] ? moved(rest, now, follow[b.group]) : [0, 0, 0];
      for (let x = 0; x < b.size[0]; x++) for (let y = 0; y < b.size[1]; y++) for (let z = 0; z < b.size[2]; z++) taken.add(key(b.at[0] + by[0] + x, b.at[1] + by[1] + y, b.at[2] + by[2] + z));
    }
    const cells = sweepLimb(limb, chains[name], c => taken.has(c));
    // A limb hanging above the spine leans whole with it; one at its base, a leg, stays.
    const lean = leanOf(limb.from);
    const dy = lean === 'whole' ? top : 0;
    const map = new Map<string, Cell>();
    for (const [c, m] of cells) {
      const [x, y, z] = unkey(c);
      map.set(key(x, y + (lean === 'shear' ? shiftOf!(z) : dy), z), { material: m, group: limb.group });
    }
    return columns(map) as B[];
  };

  // The boxes in their order; a limb's group comes in where its first box was (or at the end).
  const sheared = new Map<string, Cell>();
  let shearAt = -1;
  for (const b of boxes) {
    const g = b.group;
    if (g && limbGroups.has(g)) {
      for (const [name, l] of Object.entries(limbs)) {
        if (l.group === g && !placed.has(name)) { placed.add(name); out.push(...sweptCells(name)); }
      }
      continue;
    }
    const joint = g ? follow[g] : undefined;
    const by: Vec3 = joint ? moved(rest, now, joint) : [0, 0, 0];
    const lean = leanOf(joint);
    if (lean === 'whole') by[1] += top;
    if (lean === 'shear' && !b.shape && !b.paint) {
      // Cell by cell, each row over by its height; the first to land on a cell keeps it.
      if (shearAt < 0) shearAt = out.length;
      for (let z = 0; z < b.size[2]; z++) {
        const zz = b.at[2] + by[2] + z;
        for (let x = 0; x < b.size[0]; x++) for (let y = 0; y < b.size[1]; y++) {
          const c = key(b.at[0] + by[0] + x, b.at[1] + by[1] + y + shiftOf!(zz), zz);
          if (!sheared.has(c)) sheared.set(c, { material: b.material, group: g! });
        }
      }
      continue;
    }
    if (lean === 'shear') by[1] += shiftOf!(b.at[2] + by[2]);
    out.push(by.some(v => v) ? { ...b, at: [b.at[0] + by[0], b.at[1] + by[1], b.at[2] + by[2]] } : b);
  }
  for (const name of Object.keys(limbs)) if (!placed.has(name)) out.push(...sweptCells(name));
  if (shearAt >= 0) {
    // What leaned cell by cell does not take a cell something else has.
    const other = new Set<string>();
    for (const b of out) {
      if (b.shape) continue;
      for (let x = 0; x < b.size[0]; x++) for (let y = 0; y < b.size[1]; y++) for (let z = 0; z < b.size[2]; z++) other.add(key(b.at[0] + x, b.at[1] + y, b.at[2] + z));
    }
    for (const c of [...sheared.keys()]) if (other.has(c)) sheared.delete(c);
    out.splice(shearAt, 0, ...(columns(sheared) as B[]));
  }
  return out;
}

/** Cells as boxes: columns of one material and group, bottom to top. */
function columns(cells: Map<string, Cell>): RigBox[] {
  const out: RigBox[] = [];
  const ks = [...cells.keys()].map(unkey).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  let run: { at: Vec3; h: number; c: Cell } | undefined;
  const flush = () => { if (run) out.push({ at: run.at, size: [1, 1, run.h], material: run.c.material, group: run.c.group }); run = undefined; };
  for (const [x, y, z] of ks) {
    const c = cells.get(key(x, y, z))!;
    if (run && run.at[0] === x && run.at[1] === y && run.at[2] + run.h === z && run.c.material === c.material && run.c.group === c.group) { run.h++; continue; }
    flush();
    run = { at: [x, y, z], h: 1, c };
  }
  flush();
  return out;
}

/** An animation by name, or itself, checked. */
export function resolveAnimation(rig: Rig, anim: RigAnimation | string): RigAnimation {
  const a = typeof anim === 'string' ? rig.animations?.[anim] : anim;
  if (!a) throw new Error(`rig: animation "${anim}" is not in the rig's animations (${Object.keys(rig.animations ?? {}).join(', ') || 'none'})`);
  if (!Number.isInteger(a.frames) || a.frames < 1) throw new Error('rig: an animation has frames, a whole number, 1 or more');
  const ks = Object.keys(a.keys ?? {});
  if (!ks.length) throw new Error('rig: an animation has keys, poses by frame');
  for (const k of ks) {
    const f = Number(k);
    if (!Number.isInteger(f) || f < 0 || f >= a.frames) throw new Error(`rig: key ${k} is not a frame of the animation (0 to ${a.frames - 1})`);
  }
  return a;
}

/** A limb's pose as numbers that interpolate: for each bone its length, swing and spread from the one before. */
function jointSpace(name: string, limb: RigLimb, root: Vec3, lp: RigLimbPose | undefined): { len: number[]; swing: number[]; spread: number[] } {
  const pts = limbChain(name, limb, root, lp);
  const len: number[] = [], swing: number[] = [], spread: number[] = [];
  let ps = 0, po = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = anglesOf([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]], limb.side);
    len.push(a.length);
    swing.push(i === 1 ? a.swing : wrap(a.swing - ps));
    spread.push(i === 1 ? a.spread : a.spread - po);
    ps = a.swing; po = a.spread;
  }
  return { len, swing, spread };
}

/**
 * The pose of each frame of an animation. A key frame is its key pose as it is;
 * between two keys, each limb goes through the angles between theirs (and the
 * joints through the moves between, to whole units), so a bent arm stays an arm
 * on the way; the lean is the earlier key's.
 */
export function animationPoses(rig: Rig, anim: RigAnimation | string): RigPose[] {
  const a = resolveAnimation(rig, anim);
  const keys = Object.keys(a.keys).map(Number).sort((x, y) => x - y);
  const poses = new Map(keys.map(k => [k, resolvePose(rig, a.keys[String(k)])]));
  const loop = a.loop !== false;
  const out: RigPose[] = [];
  for (let f = 0; f < a.frames; f++) {
    if (poses.has(f)) { out.push(poses.get(f)!); continue; }
    let prev = [...keys].reverse().find(k => k < f);
    let next = keys.find(k => k > f);
    let span: number, t: number;
    if (prev === undefined) {
      if (!loop) { out.push(poses.get(next!)!); continue; }
      prev = keys[keys.length - 1];
      span = next! - prev + a.frames; t = (f - prev + a.frames) / span;
    } else if (next === undefined) {
      if (!loop) { out.push(poses.get(prev)!); continue; }
      next = keys[0];
      span = next + a.frames - prev; t = (f - prev) / span;
    } else {
      span = next - prev; t = (f - prev) / span;
    }
    out.push(lerpPose(rig, poses.get(prev)!, poses.get(next!)!, t));
  }
  return out;
}

function lerpPose(rig: Rig, A: RigPose, B: RigPose, t: number): RigPose {
  const out: RigPose = {};
  const atA = jointPositions(rig, A), atB = jointPositions(rig, B);
  for (const j of Object.keys(rig.joints)) {
    const a = (A[j] as Vec3 | undefined) ?? [0, 0, 0], b = (B[j] as Vec3 | undefined) ?? [0, 0, 0];
    const v = a.map((x, i) => Math.round(x + (b[i] - x) * t)) as Vec3;
    if (v.some(x => x)) out[j] = v;
  }
  const at = jointPositions(rig, out);
  for (const [name, limb] of Object.entries(rig.limbs ?? {})) {
    const rootOf = (p: Record<string, Vec3>): Vec3 => [p[limb.from][0] + limb.at[0], p[limb.from][1] + limb.at[1], p[limb.from][2] + limb.at[2]];
    const ja = jointSpace(name, limb, rootOf(atA), A[name] as RigLimbPose | undefined);
    const jb = jointSpace(name, limb, rootOf(atB), B[name] as RigLimbPose | undefined);
    const mix = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * t);
    const len = mix(ja.len, jb.len), swing = mix(ja.swing, jb.swing), spread = mix(ja.spread, jb.spread);
    // Rebuilt bone by bone with the lengths between, so a stretched key stays stretched on the way.
    const root = rootOf(at);
    const pts: Vec3[] = [];
    let p = root, sa = 0, so = 0;
    for (let i = 0; i < len.length; i++) {
      sa += swing[i] * RAD; so += spread[i] * RAD;
      p = [p[0] + limb.side * len[i] * Math.sin(so), p[1] + len[i] * Math.sin(sa) * Math.cos(so), p[2] - len[i] * Math.cos(sa) * Math.cos(so)];
      pts.push(p);
    }
    out[name] = { through: pts };
  }
  const tilt = t < 1 ? A.tilt : B.tilt;
  if (tilt) out.tilt = tilt;
  return out;
}

/** A rig checked as it is read: joints, follows, limbs, so a typo stops it before a pose does. */
export function validateRig(rig: Rig): Rig {
  if (!rig || typeof rig !== 'object' || !rig.joints || typeof rig.joints !== 'object') throw new Error('rig: a rig has joints, by name: {"cadera": {"at": [x, y, z]}, "cuello": {"parent": "cadera", "at": [0, 0, 14]}}');
  const roots = Object.entries(rig.joints).filter(([, j]) => !j.parent).map(([n]) => n);
  if (!roots.length) throw new Error('rig: no joint is the root (one without parent)');
  for (const [n, j] of Object.entries(rig.joints)) {
    if (!Array.isArray(j.at) || j.at.length !== 3 || !j.at.every(v => typeof v === 'number')) throw new Error(`rig: joint ${n}: at is [x, y, z]`);
    if (j.parent && !rig.joints[j.parent]) throw new Error(`rig: joint ${n}: parent "${j.parent}" is no joint`);
  }
  jointPositions(rig);
  for (const [n, l] of Object.entries(rig.limbs ?? {})) {
    if (!rig.joints[l.from]) throw new Error(`rig: limb ${n} hangs from "${l.from}", which is no joint`);
    if (!Array.isArray(l.bones) || !l.bones.length || !l.bones.every(b => b > 0)) throw new Error(`rig: limb ${n}: bones is a list of lengths`);
    if (!Array.isArray(l.section) || l.section.length !== 2 || !l.section.every(v => Number.isInteger(v) && v > 0)) throw new Error(`rig: limb ${n}: section is [width, depth], whole units`);
    if (l.side !== 1 && l.side !== -1) throw new Error(`rig: limb ${n}: side is -1 (on -x) or 1 (on +x)`);
    if (!Array.isArray(l.bands) || !l.bands.length) throw new Error(`rig: limb ${n}: bands, at least one material`);
    if (!l.group) throw new Error(`rig: limb ${n}: group, the name its cells go in`);
  }
  if (rig.spine) {
    if (!Array.isArray(rig.spine) || rig.spine.length !== 2 || !rig.spine.every(j => rig.joints[j])) throw new Error('rig: spine is two joints [base, top]');
  }
  return rig;
}

/** What a model says about its skeleton: the rig (a path the caller has read, or the rig), and a pose or an animation. */
export interface Rigged {
  rig?: string | Rig;
  pose?: string | RigPose;
  animation?: string | RigAnimation;
}

/**
 * A model with a rig as the models of its frames: one in its pose (rest when it
 * says none), or one per frame of its animation. What comes back has no rig,
 * pose or animation: plain boxes, drawn as any model is. `fps` is the
 * animation's, when it says it.
 */
export function riggedModels<M extends Rigged & { boxes: RigBox[] }>(model: M, rig: Rig): { models: Omit<M, keyof Rigged>[]; fps?: number } {
  validateRig(rig);
  if (model.pose !== undefined && model.animation !== undefined) throw new Error('rig: a model says pose or animation, not both');
  const { rig: _rig, pose, animation, ...rest } = model;
  void _rig;
  const one = (p: RigPose) => ({ ...rest, boxes: poseBoxes(rig, model.boxes, p) }) as Omit<M, keyof Rigged>;
  if (animation === undefined) return { models: [one(resolvePose(rig, pose))] };
  const a = resolveAnimation(rig, animation);
  return { models: animationPoses(rig, a).map(one), fps: a.fps };
}
