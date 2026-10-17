// Room fittings: ceiling height, benches, and the floor a room's
// freestanding walls and benches take up.
//
// A room is a rectangle of 2.5 m cells with doors in its walls. Left at
// that, every room is the same empty box at a different size. The
// fittings are what tell a cabinet from a hall:
//
//  - Ceiling height follows the room's narrow side: 4.0 m over a 10 m
//    cabinet, 5.7 m over a hall 17.5 m and wider, 4.8 m between.
//  - Freestanding walls: panels, wing walls and door screens, set out
//    in `divider-plans.ts`.
//  - Benches: one in each bay between wing walls, a pair facing the
//    panels of a hall, an island of two back to back in any other
//    large room.
//
// Everything here is planned from the room's rectangle, its doors and
// its dividers, so a bench never stands in the walking line between two
// doors. Dividers lie on cell lines; `writeDividerEdges` puts them into
// the collision masks.
//
// The layout calls the planners with the doors a room has on every
// storey, so a room is fitted the same way on each.

import { arrangementOf } from "./divider-plans";
import {
  cellsX,
  cellsZ,
  DIVIDED_MIN_CELLS,
  EPS,
  type Frame,
  type FrameDoor,
  frameDoors,
  frameFor,
  hallAxis,
  longAxis,
  type PlanDoor,
  roomKind,
} from "./room-frame";
import type { Bench, CellRect, Divider } from "./types";
import {
  CELL_SIZE,
  DIVIDER_THICKNESS,
  ROOM_HEIGHT,
  ROOM_HEIGHT_LOW,
  ROOM_HEIGHT_TALL,
} from "./world-coords";

export { planDividers } from "./divider-plans";
export { longAxis, type PlanDoor, type RoomKind, roomKind } from "./room-frame";

// ── Bench ─────────────────────────────────────────────────────────────

export const BENCH_LENGTH = 2.0;
export const BENCH_DEPTH = 0.6;
export const BENCH_HEIGHT = 0.45;
/** How far under the seat a body's feet may be and still get onto it. */
const BENCH_STEP_UP = 0.05;
/** Air between the two benches of a back-to-back island. */
const ISLAND_GAP = 0.02;

/** Narrow side from which a room without panels gets a bench island. */
const LARGE_MIN_CELLS = 6;

/** Ceiling height for a room of this footprint. */
export function ceilingHeightFor(rect: CellRect): number {
  const short = Math.min(cellsX(rect), cellsZ(rect));
  if (short <= 4) return ROOM_HEIGHT_LOW;
  if (short >= DIVIDED_MIN_CELLS) return ROOM_HEIGHT_TALL;
  return ROOM_HEIGHT;
}

// ── Benches ───────────────────────────────────────────────────────────

/** Floor kept free either side of a door opening along its walking
 *  line, metres. Wider than SIGHT_MARGIN: a visitor is 0.6 m across. */
const WALK_MARGIN = 0.5;
/** Clear floor between a bench and a wall it stands in front of. */
const BENCH_WALL_CLEARANCE = 1.5;
/** Clear floor between a bench end and a divider it stands beside. */
const BENCH_DIVIDER_CLEARANCE = 1.2;
/** Gap between a bench and the walking line it stands beside. */
const BENCH_WALK_GAP = 0.1;
/** Clear floor between a bench and any wall that was not planned with
 *  it: a door screen. */
const BENCH_SCREEN_CLEARANCE = 1.0;

type Band = [number, number];

function walkHalf(width: number): number {
  return width / 2 + WALK_MARGIN;
}

/** Nearest value to `target` in [lo, hi] at which a span of ±half
 *  overlaps none of `bands`. `prefer` breaks a tie. */
function nearestClear(
  target: number,
  half: number,
  lo: number,
  hi: number,
  bands: Band[],
  prefer: -1 | 1,
): number | null {
  const clear = (v: number) =>
    v >= lo - EPS &&
    v <= hi + EPS &&
    bands.every(([a, b]) => v + half <= a + EPS || v - half >= b - EPS);
  const candidates = [target, lo, hi, ...bands.flatMap(([a, b]) => [a - half, b + half])];
  let best: number | null = null;
  for (const v of candidates) {
    if (!clear(v)) continue;
    if (best === null) {
      best = v;
      continue;
    }
    const d = Math.abs(v - target) - Math.abs(best - target);
    if (d < -EPS || (Math.abs(d) <= EPS && (v - best) * prefer > 0)) best = v;
  }
  return best;
}

function toBench(frame: Frame, a: number, c: number, along: "axis" | "across"): Bench {
  const worldA = frame.a0 * CELL_SIZE + a;
  const worldC = frame.c0 * CELL_SIZE + c;
  const acrossAxis = frame.axis === "x" ? "z" : "x";
  return {
    x: frame.axis === "x" ? worldA : worldC,
    z: frame.axis === "x" ? worldC : worldA,
    along: along === "axis" ? frame.axis : acrossAxis,
  };
}

/**
 * Benches for a room, from its footprint, doors and dividers.
 *
 * How the room is seated follows how its walls are set out
 * (`arrangementOf`): a bench in each bay between wing walls, a pair in
 * the nave between rows of panels, an island in a room with neither. A
 * door screen seats nothing, and no bench stands within a metre of one.
 * A pinwheel is seated by the plan that hangs it, after the hang.
 */
export function planBenches(
  rect: CellRect,
  doors: readonly PlanDoor[],
  dividers: readonly Divider[],
): Bench[] {
  const kind = roomKind(rect);
  const set = arrangementOf(rect, dividers);
  const walls = dividers.filter((d) => !d.bare);
  const setAxis = set.kind === "wings" || set.kind === "rows" ? set.axis : longAxis(rect);
  const frame = frameFor(rect, setAxis);
  const fd = frameDoors(frame, doors);

  let benches: Bench[];
  if (set.kind === "wings" || (set.kind === "none" && kind === "gallery")) {
    benches = planBayBenches(frame, fd, walls);
  } else if (set.kind === "rows") {
    benches = planNaveBenches(frame, fd, walls);
  } else if (set.kind === "pinwheel") {
    benches = [];
  } else if (Math.min(frame.length, frame.breadth) < LARGE_MIN_CELLS) {
    benches = [];
  } else {
    benches = planIslands(frame, fd);
  }
  return benches.filter((b) => benchClearOf(b, dividers, BENCH_SCREEN_CLEARANCE));
}

/** Is a bench at least `clearance` from every one of `dividers`? */
export function benchClearOf(
  bench: Bench,
  dividers: readonly Divider[],
  clearance: number,
): boolean {
  const r = benchRect(bench);
  return dividers.map(dividerRect).every((d) => {
    const dx = Math.max(0, r.xMin - d.xMax, d.xMin - r.xMax);
    const dz = Math.max(0, r.zMin - d.zMax, d.zMin - r.zMax);
    return Math.hypot(dx, dz) >= clearance - EPS;
  });
}

/** Strip either side of the room's walking axis, in metres across. */
function axisStrip(frame: Frame, doors: FrameDoor[]): { centre: number; half: number } {
  const endDoors = doors.filter((d) => d.wall === "end");
  const width = endDoors.reduce((w, d) => Math.max(w, d.width), 0);
  return {
    centre: hallAxis(frame, doors) * CELL_SIZE,
    // A room with no end door still has people walking down its middle.
    half: walkHalf(width || 2 * WALK_MARGIN),
  };
}

/** Walking lines of the doors in one kind of wall, as bands in metres
 *  along the coordinate those doors are placed by. */
function walkBands(doors: FrameDoor[], wall: FrameDoor["wall"]): Band[] {
  return doors
    .filter((d) => d.wall === wall)
    .map(
      (d): Band => [d.pos * CELL_SIZE - walkHalf(d.width), d.pos * CELL_SIZE + walkHalf(d.width)],
    );
}

/** One bench in each bay of a long room, beside the passage and facing
 *  the nearer long wall, on alternate sides from bay to bay. A bay a
 *  side door opens into stays empty. */
function planBayBenches(frame: Frame, doors: FrameDoor[], dividers: readonly Divider[]): Bench[] {
  const breadthM = frame.breadth * CELL_SIZE;
  const strip = axisStrip(frame, doors);
  const bands = walkBands(doors, "side");

  const lines = [
    ...new Set(dividers.filter((d) => d.axis !== frame.axis).map((d) => d.line - frame.a0)),
  ].sort((a, b) => a - b);
  const edges = [0, ...lines, frame.length];

  const out: Bench[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const lo =
      edges[i] * CELL_SIZE +
      (i === 0 ? BENCH_WALL_CLEARANCE : DIVIDER_THICKNESS / 2 + BENCH_DIVIDER_CLEARANCE);
    const hi =
      edges[i + 1] * CELL_SIZE -
      (i + 2 === edges.length
        ? BENCH_WALL_CLEARANCE
        : DIVIDER_THICKNESS / 2 + BENCH_DIVIDER_CLEARANCE);
    const mid = ((edges[i] + edges[i + 1]) / 2) * CELL_SIZE;
    const half = BENCH_LENGTH / 2;
    if (hi - lo < BENCH_LENGTH) continue;
    const a = nearestClear(mid, half, lo + half, hi - half, bands, 1);
    // A bench pushed out of the middle third of its bay sits wedged
    // between a door's walking line and a wing wall: leave the bay.
    if (a === null || Math.abs(a - mid) > (edges[i + 1] - edges[i]) * CELL_SIZE * (1 / 6)) continue;
    const offset = strip.half + BENCH_WALK_GAP + BENCH_DEPTH / 2;
    const side = i % 2 === 0 ? -1 : 1;
    let c = strip.centre + side * offset;
    const fits = (v: number) =>
      v - BENCH_DEPTH / 2 >= BENCH_WALL_CLEARANCE &&
      v + BENCH_DEPTH / 2 <= breadthM - BENCH_WALL_CLEARANCE;
    if (!fits(c)) c = strip.centre - side * offset;
    if (!fits(c)) continue;
    out.push(toBench(frame, a, c, "axis"));
  }
  return out;
}

/** A hall with panels: two benches in the nave, one each side of the
 *  axis with its back to the walking line, facing a panel. */
function planNaveBenches(frame: Frame, doors: FrameDoor[], dividers: readonly Divider[]): Bench[] {
  const strip = axisStrip(frame, doors);
  const panels = dividers.filter((d) => d.axis === frame.axis);
  if (panels.length === 0) return [];
  // The panel nearest the middle of the hall; of two equally near, the
  // one further along.
  const centre = frame.length / 2;
  const mids = [...new Set(panels.map((d) => (d.start + d.end) / 2 - frame.a0))].sort(
    (a, b) => Math.abs(a - centre) - Math.abs(b - centre) || b - a,
  );
  const a = mids[0] * CELL_SIZE;
  const offset = strip.half + BENCH_WALK_GAP + BENCH_DEPTH / 2;
  const faces = panels.map((d) => (d.line - frame.c0) * CELL_SIZE);
  const out: Bench[] = [];
  for (const side of [-1, 1] as const) {
    const c = strip.centre + side * offset;
    // Room to stand between the bench and the panel it faces. A side
    // with no panel has nothing for a bench to face.
    const panel = faces.filter((f) => (f - strip.centre) * side > 0);
    if (panel.length === 0) continue;
    const gap = Math.min(...panel.map((f) => Math.abs(f - c))) - BENCH_DEPTH / 2;
    if (gap - DIVIDER_THICKNESS / 2 >= BENCH_DIVIDER_CLEARANCE) {
      out.push(toBench(frame, a, c, "axis"));
    }
  }
  return out;
}

/** An island of two benches back to back, as near the middle of the
 *  room as its doors' walking lines allow. */
function planIslands(frame: Frame, doors: FrameDoor[]): Bench[] {
  const lengthM = frame.length * CELL_SIZE;
  const breadthM = frame.breadth * CELL_SIZE;
  const halfAlong = BENCH_LENGTH / 2;
  const halfAcross = BENCH_DEPTH + ISLAND_GAP / 2;
  const wall = BENCH_WALL_CLEARANCE + 0.5;

  const alongBands = walkBands(doors, "side");
  const acrossBands = walkBands(doors, "end");

  // Toward the low end when the middle is taken: north in a room that
  // runs north–south, which is the wall a visitor walks in facing.
  const a = nearestClear(
    lengthM / 2,
    halfAlong,
    wall + halfAlong,
    lengthM - wall - halfAlong,
    alongBands,
    -1,
  );
  if (a === null) return [];

  const c = nearestClear(
    breadthM / 2,
    halfAcross,
    wall + halfAcross,
    breadthM - wall - halfAcross,
    acrossBands,
    1,
  );
  if (c === null) return [];

  const back = (BENCH_DEPTH + ISLAND_GAP) / 2;
  return [toBench(frame, a, c - back, "axis"), toBench(frame, a, c + back, "axis")];
}

// ── Footprints ────────────────────────────────────────────────────────

export type Rect = { xMin: number; xMax: number; zMin: number; zMax: number };

/** World footprint of a divider, at its full thickness. */
export function dividerRect(d: Divider): Rect {
  const line = d.line * CELL_SIZE;
  const lo = d.start * CELL_SIZE;
  const hi = d.end * CELL_SIZE;
  const t = DIVIDER_THICKNESS / 2;
  return d.axis === "x"
    ? { xMin: lo, xMax: hi, zMin: line - t, zMax: line + t }
    : { xMin: line - t, xMax: line + t, zMin: lo, zMax: hi };
}

export function benchRect(b: Bench): Rect {
  const hx = (b.along === "x" ? BENCH_LENGTH : BENCH_DEPTH) / 2;
  const hz = (b.along === "x" ? BENCH_DEPTH : BENCH_LENGTH) / 2;
  return { xMin: b.x - hx, xMax: b.x + hx, zMin: b.z - hz, zMax: b.z + hz };
}

/** Everything solid standing on a room's floor. */
export function fittingRects(room: {
  dividers: readonly Divider[];
  benches: readonly Bench[];
}): Rect[] {
  return [...room.dividers.map(dividerRect), ...room.benches.map(benchRect)];
}

function circleHitsRect(x: number, z: number, radius: number, r: Rect): boolean {
  const dx = x - Math.min(Math.max(x, r.xMin), r.xMax);
  const dz = z - Math.min(Math.max(z, r.zMin), r.zMax);
  return dx * dx + dz * dz < radius * radius;
}

/**
 * Are a body's feet high enough to be over a bench? Under this height a
 * bench is in the way like a wall; from it on, a bench is a floor.
 * A jump lifts the feet 0.82 m, a seat is 0.45 m up.
 */
export function clearsBenches(feetAboveFloor: number): boolean {
  return feetAboveFloor >= BENCH_HEIGHT - BENCH_STEP_UP;
}

type FittedFloor = {
  rooms: ReadonlyArray<{
    cellBounds: CellRect;
    dividers: readonly Divider[];
    benches: readonly Bench[];
  }>;
};

function nearRoom(room: { cellBounds: CellRect }, x: number, z: number, radius: number): boolean {
  const b = room.cellBounds;
  return (
    x >= b.xMin * CELL_SIZE - radius &&
    x <= (b.xMax + 1) * CELL_SIZE + radius &&
    z >= b.zMin * CELL_SIZE - radius &&
    z <= (b.zMax + 1) * CELL_SIZE + radius
  );
}

/**
 * Can a body of this radius stand at (x, z) without overlapping a
 * divider or a bench?
 *
 * A bench is smaller than a cell, so the cell-edge masks cannot hold
 * it, and a divider is four times thicker than the edge it is written
 * into. Both are therefore tested as the rectangles they are. The
 * physics world carries the same rectangles as colliders, which is what
 * lets the player slide round them; this is the rule that holds when
 * the physics world is not loaded, and the check on what it returns.
 *
 * `overBenches` is for a body in the air above seat height
 * (`clearsBenches`): only the dividers are in its way.
 */
export function clearOfFittings(
  floor: FittedFloor,
  x: number,
  z: number,
  radius: number,
  overBenches = false,
): boolean {
  for (const room of floor.rooms) {
    if (room.dividers.length === 0 && room.benches.length === 0) continue;
    if (!nearRoom(room, x, z, radius)) continue;
    for (const d of room.dividers) {
      if (circleHitsRect(x, z, radius, dividerRect(d))) return false;
    }
    if (overBenches) continue;
    for (const b of room.benches) {
      if (circleHitsRect(x, z, radius, benchRect(b))) return false;
    }
  }
  return true;
}

/** Does a body of this radius at (x, z) overlap a bench's footprint? */
export function benchUnder(floor: FittedFloor, x: number, z: number, radius: number): boolean {
  for (const room of floor.rooms) {
    if (room.benches.length === 0 || !nearRoom(room, x, z, radius)) continue;
    for (const b of room.benches) {
      if (circleHitsRect(x, z, radius, benchRect(b))) return true;
    }
  }
  return false;
}

// ── Sitting down ──────────────────────────────────────────────────────

/** How far from a bench's edge a visitor may stand and still sit on it. */
export const BENCH_SIT_REACH = 1.2;
/** Seat taken no nearer a bench's end than this: room for a body. */
const SEAT_END_MARGIN = 0.4;
/** Floor between the seat's front edge and a visitor who stands up. */
const STAND_UP_GAP = 0.15;

function distanceToRect(x: number, z: number, r: Rect): number {
  const dx = x - Math.min(Math.max(x, r.xMin), r.xMax);
  const dz = z - Math.min(Math.max(z, r.zMin), r.zMax);
  return Math.hypot(dx, dz);
}

/** The bench nearest (x, z) whose edge is within `reach`, or null. */
export function benchWithin(
  floor: FittedFloor,
  x: number,
  z: number,
  reach = BENCH_SIT_REACH,
): Bench | null {
  let best: Bench | null = null;
  let bestDist = reach;
  for (const room of floor.rooms) {
    if (room.benches.length === 0 || !nearRoom(room, x, z, reach)) continue;
    for (const b of room.benches) {
      const d = distanceToRect(x, z, benchRect(b));
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
  }
  return best;
}

/** Where a visitor sits on a bench, which way they face, and where they
 *  stand when they get up. */
export type Seat = {
  x: number;
  z: number;
  /** Unit vector, level: the side of the bench the visitor faces. */
  faceX: number;
  faceZ: number;
  /** In front of the seat, clear of the bench by a body's radius. */
  standX: number;
  standZ: number;
};

/**
 * The seat a visitor at (x, z), looking along (lookX, lookZ), takes on
 * a bench. The benches have no back, so the visitor faces the side of
 * the bench they already look toward and turns as little as they can.
 * They sit across from where they stand along the bench, on the middle
 * of its depth, and no nearer an end than a body needs.
 */
export function seatOn(
  bench: Bench,
  x: number,
  z: number,
  lookX: number,
  lookZ: number,
  bodyRadius: number,
): Seat {
  const half = BENCH_LENGTH / 2 - SEAT_END_MARGIN;
  const out = BENCH_DEPTH / 2 + bodyRadius + STAND_UP_GAP;
  if (bench.along === "x") {
    const sx = bench.x + Math.min(Math.max(x - bench.x, -half), half);
    // Looking along the bench: face away from the side they stand on.
    const sign = Math.abs(lookZ) > 1e-3 ? Math.sign(lookZ) : z <= bench.z ? 1 : -1;
    return { x: sx, z: bench.z, faceX: 0, faceZ: sign, standX: sx, standZ: bench.z + sign * out };
  }
  const sz = bench.z + Math.min(Math.max(z - bench.z, -half), half);
  const sign = Math.abs(lookX) > 1e-3 ? Math.sign(lookX) : x <= bench.x ? 1 : -1;
  return { x: bench.x, z: sz, faceX: sign, faceZ: 0, standX: bench.x + sign * out, standZ: sz };
}

/** Room a visitor needs round the point they are put down on. */
const ARRIVAL_CLEARANCE = 0.8;
const ARRIVAL_STEP = 0.25;

/**
 * Where a visitor lands when sent to a room: its centre, or the nearest
 * point to it that is not inside a bench or a divider.
 */
export function arrivalPoint(room: {
  cellBounds: CellRect;
  dividers: readonly Divider[];
  benches: readonly Bench[];
}): { x: number; z: number } {
  const b = room.cellBounds;
  const cx = ((b.xMin + b.xMax + 1) / 2) * CELL_SIZE;
  const cz = ((b.zMin + b.zMax + 1) / 2) * CELL_SIZE;
  const rects = fittingRects(room);
  const clear = (x: number, z: number) =>
    rects.every((r) => !circleHitsRect(x, z, ARRIVAL_CLEARANCE, r));
  if (clear(cx, cz)) return { x: cx, z: cz };
  // Rings of growing radius; within a ring, north first, so a visitor
  // moved off the centre is moved toward the wall they will face.
  const halfX = ((b.xMax - b.xMin + 1) * CELL_SIZE) / 2 - 1;
  const halfZ = ((b.zMax - b.zMin + 1) * CELL_SIZE) / 2 - 1;
  for (let ring = 1; ring * ARRIVAL_STEP <= Math.max(halfX, halfZ); ring++) {
    const d = ring * ARRIVAL_STEP;
    for (const [dx, dz] of [
      [0, -d],
      [0, d],
      [-d, 0],
      [d, 0],
      [-d, -d],
      [d, -d],
      [-d, d],
      [d, d],
    ]) {
      if (Math.abs(dx) > halfX || Math.abs(dz) > halfZ) continue;
      if (clear(cx + dx, cz + dz)) return { x: cx + dx, z: cz + dz };
    }
  }
  return { x: cx, z: cz };
}

// ── Collision masks ───────────────────────────────────────────────────

/**
 * Block the cell edges a room's dividers stand on. Runs after the
 * masks are built from room ownership, where an edge between two cells
 * of one room is free by definition: a divider is the one wall that
 * stands inside a room.
 */
export function writeDividerEdges(
  dividers: readonly Divider[],
  gridSize: { x: number; z: number },
  blockedEdgesEW: Uint8Array,
  blockedEdgesNS: Uint8Array,
): void {
  for (const d of dividers) {
    // Whole cells only. A screen ends on a half line, and an edge
    // blocked for half a wall would stop a body in open floor; the
    // rest of it is held by its collider and `clearOfFittings`.
    for (let i = Math.ceil(d.start - EPS); i < Math.floor(d.end + EPS); i++) {
      if (d.axis === "x") {
        // Along x on z line `line`: between cells (i, line-1) and (i, line).
        const z = d.line - 1;
        if (i < 0 || i >= gridSize.x || z < 0 || z >= gridSize.z - 1) continue;
        blockedEdgesNS[z * gridSize.x + i] = 1;
      } else {
        const x = d.line - 1;
        if (i < 0 || i >= gridSize.z || x < 0 || x >= gridSize.x - 1) continue;
        blockedEdgesEW[i * (gridSize.x - 1) + x] = 1;
      }
    }
  }
}
