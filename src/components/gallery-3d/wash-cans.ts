// The washers' light as a sum over cans, on whatever surface it lands.
//
// Until 17 October 2026 each pool quad was lit by one row of cans, its
// own wall's, and the quads were cut wherever the row changed: at a
// corner, at a landing's end, between two stretches of one wall. Each
// side of such a cut summed a different row, so the light stepped on
// the line, and every fix (the clamp to a row's end can, the corner
// gap, the sheer wall's own row) moved one line and left the rule
// that made them. Rico, of the corner of a stair hall: "this same
// lighting issue keeps popping up".
//
// Now a room's cans are one list, and every lit surface is cut into
// patches that each name the cans whose cone can reach them. A
// fragment sums those cans, so two patches that meet on a line sum the
// same light there, whichever rows the cans came from, and a can near
// a corner lights both walls of it as a real one does. Nothing in here
// knows a wall from a floor: a patch is a parallelogram with a normal.
//
// Pure maths, no three.js, like painting-light-rig.ts.

export type Vec3 = readonly [number, number, number];

export type WashCan = {
  /** Where it hangs, in the room's frame. */
  pos: Vec3;
  /** Unit beam axis, from the can into the room. */
  axis: Vec3;
  cosOuter: number;
  cosInner: number;
  /** Scale that makes the illuminance at the aim point 1. */
  intensity: number;
  /** The floor's share of the light (`WashRow.floorGain`). */
  floorGain: number;
  /** A long-throw can keeps on a wall the light it has at its aim point:
   *  the square of that distance, or 0 to fall with its own. */
  aim2: number;
  /** The floor its row stands on, in the room's frame. It lights
   *  nothing under that level, since the slab is in the way. A can of
   *  the storey below hangs under this storey's floor and lights
   *  nothing of it. */
  floorY: number;
  /** A storey's can, beside the void of a stair hall: it lights a
   *  surface that stands in the void (`LitQuad.inVoid`) below its own
   *  floor too, past the landing's end. A can over a landing does not:
   *  the wall under its landing is behind that landing. */
  throughVoid: boolean;
};

export type LitQuad = {
  /** Four corners in the room's frame, counter-clockwise seen from the
   *  lit side: `corners[1] - corners[0]` and `corners[3] - corners[0]`
   *  span it. */
  corners: readonly [Vec3, Vec3, Vec3, Vec3];
  /** Unit normal, toward the room. */
  normal: Vec3;
  /** On the floor: the cans' floor gain applies, and the threshold fade. */
  floor: boolean;
  /** Stands over a void (the end wall over a stair hall's landings, the
   *  salon's far wall): a can lights it below the can's own floor. */
  inVoid: boolean;
  /** Pool gain on this surface (`poolGainScale` for a wall, 1 on a floor). */
  gain: number;
};

export type LitPatch = LitQuad & {
  /** Indices into the room's can list, at most CANS_PER_PATCH. */
  cans: number[];
};

/** Cans a room's shader holds: its own and those of the storeys over
 *  and under it that reach any of its surfaces. Three vec4 uniforms a
 *  can; 64 keep a program under the 224 fragment uniform vectors every
 *  WebGL2 context has. `wash-cans.test.ts` holds every room to it. */
export const MAX_CANS = 64;
/** Cans a fragment sums: three vec4 attributes of indices. The wall
 *  over a stair hall's landings takes the landing rows of three
 *  storeys and the storey's own cans beside it. */
export const CANS_PER_PATCH = 12;
/** A surface is cut into patches no longer than this on a side, so
 *  each names only the cans near it. */
export const PATCH_M = 2.5;
/** A patch that still needs more cans than it can name is halved down
 *  to this. */
const MIN_PATCH_M = 0.4;
/** How closely a patch is sampled when asking whether a cone reaches
 *  it. */
const SAMPLE_M = 0.4;
/** The cone is widened by this much for the test, so a can whose edge
 *  falls between two samples is still named. A can named for a patch
 *  it does not reach costs a fragment one evaluation that returns 0. */
const REACH_MARGIN = (3 * Math.PI) / 180;
/** A patch whose middle is further than this from a can is not tested
 *  for it: PATCH_M of patch and a storey's cone, with room over. */
const FAR_REACH = 24;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));

/** A can whose strongest light on a patch is under this share of an
 *  aim point's is not named for it. The wall over a stair hall's
 *  landings stands in a void, and every storey's cans above it reach
 *  it, four storeys of them; those two storeys up put under a
 *  hundredth on it, and the pool gain and shoulder make that
 *  invisible. */
export const FAINT = 0.01;

/** The most light the can puts on any sampled point of `quad`, or 0
 *  where no point is inside its cone, faces it, and is not under the
 *  can's floor. The cone is widened a little for the test, so a can
 *  whose edge falls between two samples still counts. */
export function canReach(can: WashCan, quad: LitQuad): number {
  const [c0, c1, , c3] = quad.corners;
  const u = sub(c1, c0);
  const v = sub(c3, c0);
  const nu = Math.max(1, Math.ceil(len(u) / SAMPLE_M));
  const nv = Math.max(1, Math.ceil(len(v) / SAMPLE_M));
  const cosOuter = Math.cos(Math.min(Math.PI, Math.acos(can.cosOuter) + REACH_MARGIN));
  const cosInner = Math.max(can.cosInner, cosOuter + 1e-3);
  let most = 0;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const p = add(c0, add(mul(u, i / nu), mul(v, j / nv)));
      if (p[1] < can.floorY - 0.01 && !(quad.inVoid && can.throughVoid)) continue;
      const toL = sub(can.pos, p);
      const facing = dot(toL, quad.normal);
      if (facing <= 0) continue;
      const d2 = dot(toL, toL);
      const d = Math.sqrt(d2);
      if (d < 1e-6) return Number.POSITIVE_INFINITY;
      const cosA = -dot(toL, can.axis) / d;
      if (cosA <= cosOuter) continue;
      const s = Math.min(1, (cosA - cosOuter) / (cosInner - cosOuter));
      const spot = s * s * (3 - 2 * s);
      const fall = can.aim2 > 0 && !quad.floor ? can.aim2 : d2;
      const e = (can.intensity * (quad.floor ? can.floorGain : 1) * (facing / d) * spot) / fall;
      if (e > most) most = e;
    }
  }
  return most;
}

/** Whether the can puts more than FAINT on the patch. */
export function canReaches(can: WashCan, quad: LitQuad): boolean {
  return canReach(can, quad) > FAINT;
}

/** The quad cut into pieces no longer than `maxM` along either side. */
export function splitQuad<T extends LitQuad>(quad: T, maxM: number): T[] {
  const [c0, c1, , c3] = quad.corners;
  const u = sub(c1, c0);
  const v = sub(c3, c0);
  const nu = Math.max(1, Math.ceil(len(u) / maxM - 1e-6));
  const nv = Math.max(1, Math.ceil(len(v) / maxM - 1e-6));
  if (nu === 1 && nv === 1) return [quad];
  const out: T[] = [];
  const at = (i: number, j: number) => add(c0, add(mul(u, i / nu), mul(v, j / nv)));
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      out.push({
        ...quad,
        corners: [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)],
      });
    }
  }
  return out;
}

/**
 * The patches of a room's surfaces, each naming the cans that reach it,
 * and the cans any patch needs. A surface is cut to PATCH_M; a patch
 * reached by more cans than it can name is halved until each half can.
 * Patches no can reaches are dropped: the top of a wall over the pools,
 * the middle of a floor. The cans come back renumbered, so a patch's
 * indices run over `used` and the shader holds no can that lights
 * nothing here. `dropped` counts the cans a patch had to leave out.
 */
export function assignCans<T extends LitQuad>(
  quads: readonly T[],
  cans: readonly WashCan[],
): {
  patches: Array<T & { cans: number[] }>;
  used: WashCan[];
  dropped: number;
} {
  const reached: Array<{ quad: T; cans: number[] }> = [];
  let dropped = 0;
  const pending = quads.flatMap((q) => splitQuad(q, PATCH_M));
  while (pending.length > 0) {
    const quad = pending.pop() as T;
    const hits: Array<{ i: number; e: number }> = [];
    for (let i = 0; i < cans.length; i++) {
      // No cone reaches further than this from its can: the pool's far
      // corner on the wall under an 8.4 m storey is 9.8 m off.
      if (distance2(cans[i], quad) > FAR_REACH * FAR_REACH) continue;
      const e = canReach(cans[i], quad);
      if (e > FAINT) hits.push({ i, e });
    }
    if (hits.length === 0) continue;
    if (hits.length > CANS_PER_PATCH) {
      const [c0, c1, , c3] = quad.corners;
      const longest = Math.max(len(sub(c1, c0)), len(sub(c3, c0)));
      if (longest > MIN_PATCH_M) {
        pending.push(...splitQuad(quad, longest / 2));
        continue;
      }
      // Too many cans even on a hand's breadth of wall: keep the
      // strongest. `stairwell-light.test.ts` fails on the real plan
      // before this happens.
      hits.sort((a, b) => b.e - a.e);
      dropped += hits.length - CANS_PER_PATCH;
      hits.length = CANS_PER_PATCH;
    }
    reached.push({ quad, cans: hits.map((h) => h.i) });
  }
  const index = new Map<number, number>();
  const used: WashCan[] = [];
  for (const r of reached) {
    for (const i of r.cans) {
      if (!index.has(i)) {
        index.set(i, used.length);
        used.push(cans[i]);
      }
    }
  }
  return {
    patches: reached.map((r) => ({
      ...r.quad,
      cans: r.cans.map((i) => index.get(i) as number),
    })),
    used,
    dropped,
  };
}

function distance2(can: WashCan, quad: LitQuad): number {
  const [c0, , c2] = quad.corners;
  const mid = mul(add(c0, c2), 0.5);
  const d = sub(can.pos, mid);
  return dot(d, d);
}

export type RectXZ = { xMin: number; xMax: number; zMin: number; zMax: number };

/** A floor rectangle as a quad facing up, at height `y`. */
export function floorQuad(r: RectXZ, y: number, inVoid = false): LitQuad {
  return {
    corners: [
      [r.xMin, y, r.zMax],
      [r.xMax, y, r.zMax],
      [r.xMax, y, r.zMin],
      [r.xMin, y, r.zMin],
    ],
    normal: [0, 1, 0],
    floor: true,
    inVoid,
    gain: 1,
  };
}

/** The uniform block for `cans`: three vec4 a can, zero past the last.
 *  The floor gain carries `throughVoid` in its sign: negative for a
 *  storey's can. */
export function canUniforms(cans: readonly WashCan[]): {
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
} {
  const a = new Float32Array(4 * MAX_CANS);
  const b = new Float32Array(4 * MAX_CANS);
  const c = new Float32Array(4 * MAX_CANS);
  cans.slice(0, MAX_CANS).forEach((can, i) => {
    a.set([can.pos[0], can.pos[1], can.pos[2], can.intensity], 4 * i);
    b.set([can.axis[0], can.axis[1], can.axis[2], can.floorY], 4 * i);
    c.set(
      [can.cosOuter, can.cosInner, can.aim2, can.throughVoid ? -can.floorGain : can.floorGain],
      4 * i,
    );
  });
  return { a, b, c };
}

/** What the shader adds up at `p` on a surface with normal `n`: every
 *  can of the patch. `wash-cans.test.ts` and the rig test read it. */
export function illuminanceAt(
  cans: readonly WashCan[],
  p: Vec3,
  n: Vec3,
  floor: boolean,
  inVoid = false,
): number {
  let e = 0;
  for (const can of cans) {
    if (p[1] < can.floorY && !(inVoid && can.throughVoid)) continue;
    const toL = sub(can.pos, p);
    const d2 = dot(toL, toL);
    const d = Math.sqrt(d2);
    const cosA = -dot(toL, can.axis) / d;
    if (cosA <= can.cosOuter) continue;
    const t = Math.min(1, (cosA - can.cosOuter) / (can.cosInner - can.cosOuter));
    const spot = t * t * (3 - 2 * t);
    const fall = can.aim2 > 0 && !floor ? can.aim2 : d2;
    e += (can.intensity * (floor ? can.floorGain : 1) * Math.max(0, dot(toL, n) / d) * spot) / fall;
  }
  return e;
}
