// Picture-frame mouldings: the cross-section a frame is swept from, the
// tools to draw one, and the shading read off its shape.
//
// Pure data and arithmetic, no three.js, because two sides read it. The
// hang (place-paintings.ts) budgets wall by a frame's reach, and the
// renderer (components/gallery-3d/frame-geometry.ts) sweeps the same
// profile round the canvas. The mouldings themselves are in
// frame-styles.ts; which work gets which is in frame-design.ts.

/** Carved ornament that runs along a stretch of the profile. Each is a
 *  row of the carve atlas (components/gallery-3d/frame-maps.ts). */
export type CarveBand =
  | "pearl"
  | "leaf"
  | "eggDart"
  | "laurel"
  | "flute"
  | "ripple"
  | "rope"
  | "punch"
  | "acanthus"
  | "beadReel"
  | "gadroon"
  | "ribbon"
  | "guilloche"
  | "meander"
  | "scale"
  | "shell"
  | "hammer"
  | "oak"
  | "waterleaf"
  | "lattice"
  | "husk"
  | "wave"
  | "rosette"
  | "dentil"
  | "bamboo";

/** One point of a moulding cross-section.
 *  - `o`: outward offset from the canvas edge, metres. Negative values
 *    reach over the canvas: that is the rabbet lip that hides its edge.
 *  - `z`: height above the wall surface, metres.
 *  - `slot`: material slot of the segment that starts at this point
 *    (0 = moulding; 1 = what lies inside it: slip, mat, silk, liner or
 *    canvas edge; 2 = an accent: parcel gilding, a fillet, a painted
 *    frieze). Defaults to 0.
 *  - `crease`: a hard edge here instead of a smoothed one.
 *  - `band`: carved ornament. A segment is carved when both its ends
 *    name the same band.
 *  - `ao`, `rough`, `wear`: shading, normally left to `shadeProfile`.
 *    Set one to override what the cross-section alone would give. */
export type ProfilePoint = {
  o: number;
  z: number;
  slot?: FrameSlot;
  crease?: boolean;
  band?: CarveBand;
  /** Baked occlusion, 1 = fully open. */
  ao?: number;
  /** Roughness multiplier: below 1 burnished, above 1 matte. */
  rough?: number;
  /** How exposed the point is to handling, 0..1. Gilding wears through
   *  to its red bole here first. */
  wear?: number;
};

export type FrameSlot = 0 | 1 | 2;
export const FRAME_SLOTS = 3;

export type ShadedPoint = ProfilePoint & { ao: number; rough: number; wear: number };

/** Height of the canvas face above the wall: PAINTING_WALL_OFFSET (0.02)
 *  plus the canvas plane's local z (0.014). Every lip must clear it. */
export const CANVAS_FACE_Z = 0.034;

// ── Building profiles ─────────────────────────────────────────────────

export type Extra = Partial<Omit<ProfilePoint, "o" | "z">>;

export const p = (o: number, z: number, extra: Extra = {}): ProfilePoint => ({ o, z, ...extra });
export const hard: Extra = { crease: true };

/** Arc of radius `r` round (`co`, `cz`). Angles in degrees: 0 points
 *  outward, 90 toward the viewer. */
export function arc(
  co: number,
  cz: number,
  r: number,
  from: number,
  to: number,
  steps: number,
  extra: Extra = {},
): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    out.push({ o: co + r * Math.cos(a), z: cz + r * Math.sin(a), ...extra });
  }
  return out;
}

/** Curve from `a` to `b` whose height follows `shape` (0 → 1). */
export function sweep(
  a: [number, number],
  b: [number, number],
  steps: number,
  shape: (t: number) => number,
  extra: Extra = {},
): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ o: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * shape(t), ...extra });
  }
  return out;
}

/** S-curve: hollow at the start, rounded at the end (cyma recta). */
export const ogee = (t: number) => t * t * (3 - 2 * t);
/** Hollow that starts flat and ends steep (cavetto). */
export const cove = (t: number) => 1 - Math.sqrt(Math.max(0, 1 - t * t));
/** Quarter round that starts steep and ends flat (ovolo). */
export const ovolo = (t: number) => Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
/** Fall that starts steep and levels out. */
export const scoop = (t: number) => 1 - (1 - t) * (1 - t);
/** Straight line. */
export const flat = (t: number) => t;

/** The side of the moulding, from its outer arris at (`o`, `z`) down
 *  to the wall. Nothing burnishes or handles it: a gilder leaves it in
 *  flat ochre, a cabinetmaker in the plain wood. */
export function backEdge(o: number, z: number): ProfilePoint[] {
  return [
    { o, z: z - 0.001, crease: true, rough: 1.5, wear: 0, ao: 0.86 },
    { o, z: 0.004, rough: 1.5, wear: 0, ao: 0.6 },
  ];
}

/** Join point lists. Where two parts meet on the same point, the point
 *  keeps a crease and a band from either, and takes the later part's
 *  slot: the slot belongs to the segment that starts there. */
export function join(...parts: Array<ProfilePoint | ProfilePoint[]>): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (const part of parts) {
    for (const pt of Array.isArray(part) ? part : [part]) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.o - pt.o) < 1e-7 && Math.abs(last.z - pt.z) < 1e-7) {
        out[out.length - 1] = {
          ...last,
          ...pt,
          slot: pt.slot,
          band: pt.band ?? last.band,
          crease: last.crease || pt.crease,
        };
        continue;
      }
      out.push({ ...pt });
    }
  }
  return out;
}

// ── Shading a profile from its own shape ──────────────────────────────

/** Rays cast per point for the occlusion estimate, and how far they
 *  look, metres. */
const AO_RAYS = 24;
const AO_REACH = 0.045;
/** Darkest a fully buried point gets. */
const AO_FLOOR = 0.4;
/** A point this far under the profile's outer hull, metres, is as
 *  toned as depth alone makes it: dust and size settle in a hollow
 *  whether or not much of the room can be seen from it. */
const VALLEY_DEPTH = 0.014;
const VALLEY_TONE = 0.42;
/** How close to the profile's outer hull a point must be to count as a
 *  high point, metres. */
const HULL_BAND = 0.0022;

type Vec2 = [number, number];

function rayHitsSegment(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number {
  // Solve origin + t·dir = a + s·(b − a).
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const det = dir[0] * ez - dir[1] * ex;
  if (Math.abs(det) < 1e-12) return Number.POSITIVE_INFINITY;
  const ax = a[0] - origin[0];
  const az = a[1] - origin[1];
  const t = (ax * ez - az * ex) / det;
  const s = (ax * dir[1] - az * dir[0]) / det;
  return t > 1e-6 && s >= 0 && s <= 1 ? t : Number.POSITIVE_INFINITY;
}

/** Upper hull of the profile in (o, z): the line a flat hand would
 *  touch. Returns the height of that line above each point. */
function gapToHull(points: readonly ProfilePoint[]): number[] {
  const order = points.map((_, i) => i).sort((i, j) => points[i].o - points[j].o);
  const hull: number[] = [];
  for (const i of order) {
    while (hull.length >= 2) {
      const a = points[hull[hull.length - 2]];
      const b = points[hull[hull.length - 1]];
      const c = points[i];
      // Drop b when it lies on or under the chord a → c.
      if ((b.o - a.o) * (c.z - a.z) - (b.z - a.z) * (c.o - a.o) >= 0) hull.pop();
      else break;
    }
    hull.push(i);
  }
  return points.map((pt) => {
    for (let k = 0; k < hull.length - 1; k++) {
      const a = points[hull[k]];
      const b = points[hull[k + 1]];
      if (pt.o >= a.o - 1e-9 && pt.o <= b.o + 1e-9) {
        const span = b.o - a.o;
        const top = span < 1e-9 ? Math.max(a.z, b.z) : a.z + ((b.z - a.z) * (pt.o - a.o)) / span;
        return Math.max(0, top - pt.z);
      }
    }
    return 0;
  });
}

/**
 * Fill in `ao`, `rough` and `wear` from the cross-section.
 *
 * - `ao` is how much of the room a point sees past the rest of the
 *   moulding, the canvas and the wall, less a tone for how deep it
 *   lies: the hollows and the foot of a bead come out dark, the way
 *   dust and toned size sit in them.
 * - `wear` marks the points on the profile's outer hull, most at an
 *   arris. Those are what a hand or a duster touches.
 * - `rough` follows the gilder: high points are burnished, hollows are
 *   left matte.
 *
 * A value set on the point is kept.
 */
export function shadeProfile(points: readonly ProfilePoint[]): ShadedPoint[] {
  const n = points.length;
  const dirs: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dO = points[i + 1].o - points[i].o;
    const dZ = points[i + 1].z - points[i].z;
    const l = Math.hypot(dO, dZ) || 1;
    dirs.push([dO / l, dZ / l]);
  }
  const width = Math.max(...points.map((pt) => pt.o));
  const hasLip = points[0].o < 0;
  const gaps = gapToHull(points);

  return points.map((pt, i) => {
    const before = dirs[Math.max(0, i - 1)];
    const after = dirs[Math.min(n - 2, i)];
    // Normal: the mean of the neighbouring segments', each a quarter
    // turn left of its direction.
    let nx = -(before[1] + after[1]);
    let nz = before[0] + after[0];
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;

    let blocked = 0;
    let total = 0;
    const origin: Vec2 = [pt.o + nx * 1e-5, pt.z + nz * 1e-5];
    for (let k = 0; k < AO_RAYS; k++) {
      const phi = ((k + 0.5) / AO_RAYS - 0.5) * Math.PI * 0.98;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const dir: Vec2 = [nx * c - nz * s, nz * c + nx * s];
      let hit = Number.POSITIVE_INFINITY;
      for (let j = 0; j < n - 1; j++) {
        if (j === i || j === i - 1) continue;
        hit = Math.min(
          hit,
          rayHitsSegment(
            origin,
            dir,
            [points[j].o, points[j].z],
            [points[j + 1].o, points[j + 1].z],
          ),
        );
      }
      // The wall beyond the frame, and the canvas inside the lip.
      hit = Math.min(hit, rayHitsSegment(origin, dir, [width, 0], [width + 1, 0]));
      if (hasLip)
        hit = Math.min(hit, rayHitsSegment(origin, dir, [-1, CANVAS_FACE_Z], [0, CANVAS_FACE_Z]));
      total += c;
      if (hit < AO_REACH) blocked += c * (1 - hit / AO_REACH);
    }
    const valley = Math.min(1, gaps[i] / VALLEY_DEPTH);
    const open = (1 - blocked / total) * (1 - VALLEY_TONE * valley * valley * (3 - 2 * valley));
    const ao = AO_FLOOR + (1 - AO_FLOOR) * open ** 1.2;

    // Turning angle at the point: positive at a ridge, negative in a
    // hollow. Summed with the neighbours' so a faceted arc counts as one
    // rounded edge.
    const turnAt = (k: number) => {
      if (k <= 0 || k >= n - 1) return 0;
      const a = dirs[k - 1];
      const b = dirs[k];
      return -Math.asin(Math.max(-1, Math.min(1, a[0] * b[1] - a[1] * b[0])));
    };
    const turn = turnAt(i - 1) + turnAt(i) + turnAt(i + 1);
    const ridge = Math.max(0, Math.min(1, turn / 0.9));
    const onHull = Math.max(0, 1 - gaps[i] / HULL_BAND);
    // The back edge is on the hull too, but nothing rubs it.
    const facing = Math.max(0, Math.min(1, nz * 1.6 + 0.2));
    const wear = onHull * facing * (0.12 + 0.88 * ridge * ridge);

    const burnish = onHull * (0.45 + 0.55 * ridge) * facing;
    const rough = 1.22 - 0.66 * burnish + Math.max(0, 0.75 - ao) * 0.8;

    return { ...pt, ao: pt.ao ?? ao, rough: pt.rough ?? rough, wear: pt.wear ?? wear };
  });
}

// ── Measuring and scaling ─────────────────────────────────────────────

/** Outer reach of a profile past the canvas edge, metres. */
export function profileWidth(profile: readonly ProfilePoint[]): number {
  return Math.max(...profile.map((pt) => pt.o));
}

/** Highest point of a profile above the wall, metres. */
export function profileFrontZ(profile: readonly ProfilePoint[]): number {
  return Math.max(...profile.map((pt) => pt.z));
}

/** Scale a profile for the size of the work. Only the part in front of
 *  the canvas face is scaled in depth, so a lip stays in front of it. */
export function scaleProfile<T extends ProfilePoint>(profile: readonly T[], scale: number): T[] {
  return profile.map((pt) => ({
    ...pt,
    o: pt.o * scale,
    z: pt.z > CANVAS_FACE_Z ? CANVAS_FACE_Z + (pt.z - CANVAS_FACE_Z) * scale : pt.z,
  }));
}
