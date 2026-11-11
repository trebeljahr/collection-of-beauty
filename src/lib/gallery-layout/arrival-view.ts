// Where a visitor sent to a room lands, and which way they face.
//
// The map's room buttons used to put a visitor on the room's centre and
// turn them toward the nearest spiral stair, through whatever stood in
// between. In a long gallery that was its side wall or a panel a metre
// off; in the spiral's own room the centre was the stair's column.
//
// A hall with a grand stair answers for itself (`blockArrivalView` in
// layout-block.ts): inside the door its stair faces, looking at the
// stair. Every other room is read here off its plan. Each spot on a
// half-cell grid, clear of the walls and the fittings, is tried looking
// along each of the room's axes and its diagonals. A view scores by how
// much of the room's floor it shows, by the works it shows face on, each
// by its apparent width, and a little by standing on the room's middle
// line. The floor counts most: the visitor should see where they are,
// so the view that wins mostly stands near one end and looks down the
// room's length. A view with a wall or a panel within 4 m of the middle
// of the screen, or a panel within 3 m anywhere on it, or a panel's end
// edge on in the middle of it, is never taken, so nobody lands nose to
// the back of a door screen, beside its end, or on the line of a row.
// Benches stand in the way of standing, not of sight.

import { benchRect, dividerRect, type Rect } from "./fittings";
import type { RoomLayout, Staircase } from "./types";
import { CELL_SIZE, DIVIDER_THICKNESS, SPIRAL_OUTER_RADIUS } from "./world-coords";

export type ArrivalView = {
  /** Where the visitor stands, world metres. */
  x: number;
  z: number;
  /** A point on the plan they face, at eye height. */
  lookX: number;
  lookZ: number;
};

/** Metres a visitor lands from a room wall, a divider's face, a bench
 *  and the outer edge of a spiral's treads (its rail stands on it). */
const FROM_WALL = 1.5;
const FROM_DIVIDER = 1.5;
const FROM_BENCH = 0.8;
const FROM_SPIRAL = 1.2;
/** Spacing of the spots tried, a half cell. */
const STEP = CELL_SIZE / 2;
/** Half a landscape screen's view, 50° high at 16:9. */
const HALF_VIEW = (39.6 * Math.PI) / 180;
/** Half the middle of the view: all an upright phone shows (40°). */
const HALF_CORE = (20 * Math.PI) / 180;
const RAYS = 41;
/** Nothing may stand nearer than this in the middle of the view. */
const CLEAR_AHEAD = 4;
/** No divider may stand nearer than this anywhere in the view: the end
 *  of a door screen a metre off fills the side of the screen. A room's
 *  own wall may, where the view runs along it. */
const CLEAR_OF_DIVIDERS = 3;
/** Nor show its end, edge on, this near the middle of the view, at any
 *  distance: a spot in the gap of a row of panels, looking along the
 *  row, has the next panel's end splitting the screen in two. */
const HALF_END_ON = (10 * Math.PI) / 180;
/** A work counts from this near to this far. */
const WORK_NEAR = 1.5;
const WORK_FAR = 22;
/** A work seen at a shallower angle to its wall than this (cosine of the
 *  angle off its normal) is read edge on, and does not count. */
const MIN_FACING = 0.25;
/** The most one work's apparent width (radians) adds: a giant across
 *  the room is one work, not a wall of them. */
const WORK_WEIGHT_CAP = 0.3;
/** Shares of the score: floor seen, works seen, standing on the middle
 *  line of the room across the view. */
const FLOOR_SHARE = 0.6;
const WORK_SHARE = 0.3;
const MIDDLE_SHARE = 0.1;
/** A diagonal view wins only by this margin over a square one. */
const DIAGONAL_FACTOR = 0.9;

type Circle = { x: number; z: number; r: number };
/** A divider's footprint and the axis it runs along. */
type Wall = Rect & { axis: "x" | "z" };
type Work = { x: number; z: number; nx: number; nz: number; width: number; divider?: number };

/**
 * The view a visitor gets on arrival in a room without a grand stair: a
 * gallery, or the room a spiral stair stands in. `spiral` is that stair;
 * the view then keeps it near the middle of the screen, since it is what
 * the room is for.
 */
export function roomArrivalView(room: RoomLayout, spiral?: Staircase | null): ArrivalView {
  const cached = cache.get(room);
  if (cached && cached.spiral === (spiral ?? null)) return cached.view;
  const view = computeView(room, spiral ?? null);
  cache.set(room, { spiral: spiral ?? null, view });
  return view;
}

const cache = new WeakMap<RoomLayout, { spiral: Staircase | null; view: ArrivalView }>();

function computeView(room: RoomLayout, spiral: Staircase | null): ArrivalView {
  const b = room.cellBounds;
  const box: Rect = {
    xMin: b.xMin * CELL_SIZE,
    xMax: (b.xMax + 1) * CELL_SIZE,
    zMin: b.zMin * CELL_SIZE,
    zMax: (b.zMax + 1) * CELL_SIZE,
  };
  const cx = (box.xMin + box.xMax) / 2;
  const cz = (box.zMin + box.zMax) / 2;
  const walls: Wall[] = room.dividers.map((d) => ({ ...dividerRect(d), axis: d.axis }));
  const benches = room.benches.map(benchRect);
  const circles: Circle[] = spiral
    ? [{ x: spiral.centerX, z: spiral.centerZ, r: SPIRAL_OUTER_RADIUS }]
    : [];
  const works: Work[] = room.placements.map((p) => ({
    x: p.position[0],
    z: p.position[2],
    nx: Math.sin(p.rotation[1]),
    nz: Math.cos(p.rotation[1]),
    width: p.widthM,
    divider: p.divider,
  }));

  const candidates: Array<{
    x: number;
    z: number;
    yaw: number;
    floor: number;
    art: number;
    middle: number;
    diagonal: boolean;
  }> = [];
  const halfX = Math.floor((box.xMax - box.xMin - 2 * FROM_WALL) / 2 / STEP);
  const halfZ = Math.floor((box.zMax - box.zMin - 2 * FROM_WALL) / 2 / STEP);
  const halfW = (box.xMax - box.xMin) / 2;
  const halfD = (box.zMax - box.zMin) / 2;
  for (let iz = -halfZ; iz <= halfZ; iz++) {
    for (let ix = -halfX; ix <= halfX; ix++) {
      const x = cx + ix * STEP;
      const z = cz + iz * STEP;
      if (!standable(x, z, walls, benches, circles)) continue;
      const seen = worksSeen(x, z, works, walls, circles);
      const yaws: Array<{ yaw: number; diagonal: boolean }> = [];
      if (spiral) {
        // The stair's room looks at the stair, from wherever is best.
        yaws.push({ yaw: Math.atan2(spiral.centerZ - z, spiral.centerX - x), diagonal: false });
      } else {
        for (let k = 0; k < 8; k++) yaws.push({ yaw: (k * Math.PI) / 4, diagonal: k % 2 === 1 });
      }
      for (const { yaw, diagonal } of yaws) {
        const floor = floorSeen(x, z, yaw, box, walls, circles, spiral !== null);
        if (floor === null) continue;
        let art = 0;
        for (const s of seen)
          if (Math.abs(angleBetween(yaw, s.angle)) <= HALF_VIEW) art += s.weight;
        // How near the middle line of the room, across the view, the
        // spot stands: 1 on it, 0 at a wall.
        const across =
          Math.abs(Math.cos(yaw)) > 0.9 ? Math.abs(z - cz) / halfD : Math.abs(x - cx) / halfW;
        const middle = diagonal || spiral ? 0 : 1 - across;
        candidates.push({ x, z, yaw, floor, art, middle, diagonal });
      }
    }
  }
  if (candidates.length === 0) {
    // No spot passes: the room's centre, facing along its long side.
    const alongX = box.xMax - box.xMin >= box.zMax - box.zMin;
    return { x: cx, z: cz, lookX: cx + (alongX ? 5 : 0), lookZ: cz + (alongX ? 0 : 5) };
  }
  const maxFloor = Math.max(...candidates.map((c) => c.floor)) || 1;
  const maxArt = Math.max(...candidates.map((c) => c.art)) || 1;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score =
      (FLOOR_SHARE * (c.floor / maxFloor) +
        WORK_SHARE * (c.art / maxArt) +
        MIDDLE_SHARE * c.middle) *
      (c.diagonal ? DIAGONAL_FACTOR : 1);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = c;
    }
  }
  return {
    x: best.x,
    z: best.z,
    lookX: best.x + Math.cos(best.yaw) * 10,
    lookZ: best.z + Math.sin(best.yaw) * 10,
  };
}

function standable(
  x: number,
  z: number,
  walls: readonly Rect[],
  benches: readonly Rect[],
  circles: readonly Circle[],
): boolean {
  for (const r of walls) if (distToRect(x, z, r) < FROM_DIVIDER) return false;
  for (const r of benches) if (distToRect(x, z, r) < FROM_BENCH) return false;
  for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + FROM_SPIRAL) return false;
  return true;
}

/**
 * The room's floor a view shows, in square metres: the fan of its rays,
 * each cut where it meets a wall, a divider or the stair. `null` when
 * something stands within `CLEAR_AHEAD` in the middle of the screen. A
 * ray that meets the spiral of the room the view is for ends on it
 * without that check: the stair is what the view looks at.
 */
function floorSeen(
  x: number,
  z: number,
  yaw: number,
  box: Rect,
  walls: readonly Wall[],
  circles: readonly Circle[],
  aimAtCircle: boolean,
): number | null {
  const step = (2 * HALF_VIEW) / (RAYS - 1);
  let area = 0;
  for (let k = 0; k < RAYS; k++) {
    const off = -HALF_VIEW + k * step;
    const dx = Math.cos(yaw + off);
    const dz = Math.sin(yaw + off);
    let d = exitBox(x, z, dx, dz, box);
    let endOn = false;
    for (const r of walls) {
      const hit = rayRect(x, z, dx, dz, r);
      if (hit.t < CLEAR_OF_DIVIDERS) return null;
      if (hit.t < d) {
        d = hit.t;
        endOn = hit.slab === r.axis;
      }
    }
    if (endOn && Math.abs(off) <= HALF_END_ON + 1e-9) return null;
    let onStair = false;
    for (const c of circles) {
      const t = rayCircle(x, z, dx, dz, c);
      if (t < d) {
        d = t;
        onStair = aimAtCircle;
      }
    }
    if (Math.abs(off) <= HALF_CORE + 1e-9 && d < CLEAR_AHEAD && !onStair) return null;
    area += 0.5 * d * d * step;
  }
  return area;
}

/** The works a spot sees face on and unblocked, each with the direction
 *  it lies in and what it adds to a view that shows it. */
function worksSeen(
  x: number,
  z: number,
  works: readonly Work[],
  walls: readonly Rect[],
  circles: readonly Circle[],
): Array<{ angle: number; weight: number }> {
  const out: Array<{ angle: number; weight: number }> = [];
  for (const w of works) {
    const vx = w.x - x;
    const vz = w.z - z;
    const d = Math.hypot(vx, vz);
    if (d < WORK_NEAR || d > WORK_FAR) continue;
    const facing = -(vx * w.nx + vz * w.nz) / d;
    if (facing < MIN_FACING) continue;
    // Stop short of the face it hangs on, so its own wall never blocks it.
    const t = 1 - (DIVIDER_THICKNESS + 0.05) / d;
    let blocked = false;
    for (const [i, r] of walls.entries()) {
      if (i === w.divider) continue;
      if (segmentHitsRect(x, z, x + vx * t, z + vz * t, r)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const c of circles) {
        if (rayCircle(x, z, vx / d, vz / d, c) < d * t) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;
    out.push({
      angle: Math.atan2(vz, vx),
      weight: Math.min(WORK_WEIGHT_CAP, (w.width * facing) / d),
    });
  }
  return out;
}

function angleBetween(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function distToRect(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.xMin - x, 0, x - r.xMax);
  const dz = Math.max(r.zMin - z, 0, z - r.zMax);
  return Math.hypot(dx, dz);
}

/** Distance from a point inside `box` along a unit direction to its edge. */
function exitBox(x: number, z: number, dx: number, dz: number, box: Rect): number {
  const tx = dx > 1e-9 ? (box.xMax - x) / dx : dx < -1e-9 ? (box.xMin - x) / dx : Infinity;
  const tz = dz > 1e-9 ? (box.zMax - z) / dz : dz < -1e-9 ? (box.zMin - z) / dz : Infinity;
  return Math.min(tx, tz);
}

/** Distance along a unit ray to where it enters `r`, or Infinity, and
 *  the axis of the face it enters by: "x" for a face square to x. */
function rayRect(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: Rect,
): { t: number; slab: "x" | "z" | null } {
  const miss = { t: Infinity, slab: null };
  let t0 = 0;
  let t1 = Infinity;
  let slab: "x" | "z" | null = null;
  for (const [axis, o, d, lo, hi] of [
    ["x", x, dx, r.xMin, r.xMax],
    ["z", z, dz, r.zMin, r.zMax],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return miss;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) {
      t0 = a;
      slab = axis;
    }
    t1 = Math.min(t1, b);
    if (t0 > t1) return miss;
  }
  return { t: t0, slab };
}

function segmentHitsRect(x0: number, z0: number, x1: number, z1: number, r: Rect): boolean {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1e-9) return false;
  return rayRect(x0, z0, (x1 - x0) / len, (z1 - z0) / len, r).t <= len;
}

/** Distance along a unit ray to where it meets a circle, or Infinity. */
function rayCircle(x: number, z: number, dx: number, dz: number, c: Circle): number {
  const ox = x - c.x;
  const oz = z - c.z;
  const b = ox * dx + oz * dz;
  const q = ox * ox + oz * oz - c.r * c.r;
  const disc = b * b - q;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}
