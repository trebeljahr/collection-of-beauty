// Room fittings: ceiling height, freestanding divider walls and benches.
//
// A room is a rectangle of 2.5 m cells with doors in its walls. Left at
// that, every room is the same empty box at a different size. The
// fittings are what tell a cabinet from a hall:
//
//  - Ceiling height follows the room's narrow side: 3.4 m over a 10 m
//    cabinet, 5.4 m over a hall 17.5 m and wider, 4.2 m between.
//  - A long room (17.5 m or more, and at least 1.4 times its width) is
//    cut into bays by pairs of wing walls, one from each long wall, with
//    the middle left open as one sightline down the room.
//  - A hall (17.5 m or more both ways) gets panels either side of its
//    axis: a nave between them and an aisle behind each.
//  - Benches: one in each bay of a long room, a pair facing the panels
//    of a hall, an island of two back to back in any other large room.
//
// Everything here is planned from the room's rectangle and its doors,
// so a divider never stands across a door's line of sight and a bench
// never stands in the walking line between two doors. Dividers lie on
// cell lines; `writeDividerEdges` puts them into the collision masks.
//
// The layout calls the planners with the doors a room has when every
// slot of the plan is open (see `PLAN_FITTINGS` in layout-museum.ts), so
// a room is fitted the same way on every storey.

import type { Bench, CellRect, Divider, Door } from "./types";
import {
  CELL_SIZE,
  DIVIDER_THICKNESS,
  ROOM_HEIGHT,
  ROOM_HEIGHT_LOW,
  ROOM_HEIGHT_TALL,
} from "./world-coords";

// ── Bench ─────────────────────────────────────────────────────────────

export const BENCH_LENGTH = 2.0;
export const BENCH_DEPTH = 0.6;
export const BENCH_HEIGHT = 0.45;
/** Air between the two benches of a back-to-back island. */
const ISLAND_GAP = 0.02;

// ── Room kinds ────────────────────────────────────────────────────────

/** Cells in 17.5 m: the length from which a room is divided. */
const DIVIDED_MIN_CELLS = 7;
/** A long room is at least this many times longer than wide. */
const GALLERY_MIN_ASPECT = 1.4;
/** Narrow side from which a room without panels gets a bench island. */
const LARGE_MIN_CELLS = 6;

export type RoomKind = "hall" | "gallery" | "room";

function cellsX(rect: CellRect): number {
  return rect.xMax - rect.xMin + 1;
}
function cellsZ(rect: CellRect): number {
  return rect.zMax - rect.zMin + 1;
}

export function roomKind(rect: CellRect): RoomKind {
  const long = Math.max(cellsX(rect), cellsZ(rect));
  const short = Math.min(cellsX(rect), cellsZ(rect));
  if (short >= DIVIDED_MIN_CELLS) return "hall";
  if (long >= DIVIDED_MIN_CELLS && long >= GALLERY_MIN_ASPECT * short) return "gallery";
  return "room";
}

/** Ceiling height for a room of this footprint. */
export function ceilingHeightFor(rect: CellRect): number {
  const short = Math.min(cellsX(rect), cellsZ(rect));
  if (short <= 4) return ROOM_HEIGHT_LOW;
  if (short >= DIVIDED_MIN_CELLS) return ROOM_HEIGHT_TALL;
  return ROOM_HEIGHT;
}

// ── Local frame ───────────────────────────────────────────────────────
// Planning happens along the room's long axis: `a` runs along it and `c`
// across it, both measured from the room's low corner.

/** What the planners need to know about a door. */
export type PlanDoor = Pick<Door, "side" | "worldX" | "worldZ" | "width">;

type Frame = {
  axis: "x" | "z";
  /** Cells along and across the axis. */
  length: number;
  breadth: number;
  /** Grid lines of the room's low corner, along and across. */
  a0: number;
  c0: number;
};

/** A door in the frame, in cells. An end door is in a wall the axis
 *  runs into, so it looks down the room at cross position `c`; a side
 *  door looks across it at position `a`. */
type FrameDoor = { wall: "end" | "side"; pos: number; width: number };

function frameFor(rect: CellRect, axis: "x" | "z"): Frame {
  return axis === "x"
    ? { axis, length: cellsX(rect), breadth: cellsZ(rect), a0: rect.xMin, c0: rect.zMin }
    : { axis, length: cellsZ(rect), breadth: cellsX(rect), a0: rect.zMin, c0: rect.xMin };
}

/** The room's long axis; a square room runs east–west. */
export function longAxis(rect: CellRect): "x" | "z" {
  return cellsZ(rect) > cellsX(rect) ? "z" : "x";
}

function frameDoors(frame: Frame, doors: readonly PlanDoor[]): FrameDoor[] {
  return doors.map((d) => {
    const inEndWall =
      frame.axis === "x"
        ? d.side === "west" || d.side === "east"
        : d.side === "north" || d.side === "south";
    // An end door is placed by its coordinate across the axis, a side
    // door by its coordinate along it.
    const acrossAxis = frame.axis === "x" ? "z" : "x";
    const world = (inEndWall ? acrossAxis : frame.axis) === "x" ? d.worldX : d.worldZ;
    return {
      wall: inEndWall ? "end" : "side",
      pos: world / CELL_SIZE - (inEndWall ? frame.c0 : frame.a0),
      width: d.width,
    };
  });
}

function toDivider(frame: Frame, line: number, start: number, end: number): Divider {
  // `line` is across the axis for a wall running along it, and the
  // other way round for a wall running across.
  return { axis: frame.axis, line: frame.c0 + line, start: frame.a0 + start, end: frame.a0 + end };
}

function toCrossDivider(frame: Frame, line: number, start: number, end: number): Divider {
  return {
    axis: frame.axis === "x" ? "z" : "x",
    line: frame.a0 + line,
    start: frame.c0 + start,
    end: frame.c0 + end,
  };
}

// ── Dividers ──────────────────────────────────────────────────────────

/** Clear floor kept either side of a door opening along its line of
 *  sight, metres. A divider never enters that strip. */
const SIGHT_MARGIN = 0.3;
/** Wall left between a door jamb and a wing wall built off the same
 *  wall, metres. */
const ATTACH_CLEARANCE = 1.0;
/** Bays a long room is cut into are this long at best, in cells. */
const IDEAL_BAY_CELLS = 3;
const MIN_BAY_CELLS = 2;
/** Half the nave between a hall's two panel lines, in cells. */
const NAVE_HALF_CELLS = 1.5;
/** Narrowest aisle left between a panel line and the side wall. */
const MIN_AISLE_CELLS = 2;
/** Panel length in cells: one unbroken panel, or each of the two a
 *  cross door's sightline splits it into. */
const PANEL_CELLS = 3;
const SPLIT_PANEL_CELLS = 2;

const EPS = 1e-6;

function sightHalfCells(width: number): number {
  return (width / 2 + SIGHT_MARGIN) / CELL_SIZE;
}

/**
 * Freestanding walls for a room, from its footprint and doors. Empty
 * for anything shorter than 17.5 m.
 */
export function planDividers(rect: CellRect, doors: readonly PlanDoor[]): Divider[] {
  const kind = roomKind(rect);
  if (kind === "room") return [];
  const frame = frameFor(rect, longAxis(rect));
  const fd = frameDoors(frame, doors);
  return kind === "gallery" ? planWingWalls(frame, fd) : planPanels(frame, fd);
}

/** Pairs of wing walls across a long room: one from each long wall on
 *  the same line, the passage between them left open. */
function planWingWalls(frame: Frame, doors: FrameDoor[]): Divider[] {
  const { length, breadth } = frame;
  const endDoors = doors.filter((d) => d.wall === "end");
  const sideDoors = doors.filter((d) => d.wall === "side");

  // A third of the width from each side, shortened until every end
  // door looks down the open passage.
  let wing = Math.max(1, Math.floor(breadth / 3));
  for (const d of endDoors) {
    const half = sightHalfCells(d.width);
    while (wing > 0 && (d.pos - half < wing - EPS || d.pos + half > breadth - wing + EPS)) wing--;
  }
  if (wing === 0) return [];

  // Lines a pair may stand on: clear of every door in the long walls,
  // and leaving a real bay at each end.
  const allowed: number[] = [];
  for (let line = MIN_BAY_CELLS; line <= length - MIN_BAY_CELLS; line++) {
    const clear = sideDoors.every(
      (d) => Math.abs(line - d.pos) * CELL_SIZE >= d.width / 2 + ATTACH_CLEARANCE,
    );
    if (clear) allowed.push(line);
  }

  // Every way of using those lines, scored by how far its bays are from
  // the ideal length and from mirror symmetry. At most seven lines, so
  // the search is exhaustive.
  let best: { lines: number[]; score: number } | null = null;
  for (let mask = 1; mask < 1 << allowed.length; mask++) {
    const lines = allowed.filter((_, i) => mask & (1 << i));
    const edges = [0, ...lines, length];
    const bays = edges.slice(1).map((e, i) => e - edges[i]);
    if (bays.some((b) => b < MIN_BAY_CELLS)) continue;
    let score = 0;
    for (let i = 0; i < bays.length; i++) {
      score += (bays[i] - IDEAL_BAY_CELLS) ** 2;
      score += Math.abs(bays[i] - bays[bays.length - 1 - i]);
    }
    if (!best || score < best.score - EPS) best = { lines, score };
  }
  if (!best) return [];

  return best.lines.flatMap((line) => [
    toCrossDivider(frame, line, 0, wing),
    toCrossDivider(frame, line, breadth - wing, breadth),
  ]);
}

/** Panels either side of a hall's axis. A door in a side wall looks
 *  across the hall, so the panels stop either side of its sightline. */
function planPanels(frame: Frame, doors: FrameDoor[]): Divider[] {
  const { length, breadth } = frame;
  const endDoors = doors.filter((d) => d.wall === "end");
  const sideDoors = doors.filter((d) => d.wall === "side");

  const axis = hallAxis(frame, doors);
  const lo = Math.floor(axis - NAVE_HALF_CELLS + EPS);
  const hi = Math.ceil(axis + NAVE_HALF_CELLS - EPS);
  if (lo < MIN_AISLE_CELLS || breadth - hi < MIN_AISLE_CELLS) return [];
  for (const d of endDoors) {
    const half = sightHalfCells(d.width);
    if (d.pos - half < lo + EPS || d.pos + half > hi - EPS) return [];
  }

  // Stretches along the hall no side door looks across, a cell clear of
  // each end wall.
  let free: Array<[number, number]> = [[1, length - 1]];
  for (const d of sideDoors) {
    const half = sightHalfCells(d.width);
    const cutLo = Math.floor(d.pos - half + EPS);
    const cutHi = Math.ceil(d.pos + half - EPS);
    free = free.flatMap(([s, e]): Array<[number, number]> => {
      if (cutHi <= s || cutLo >= e) return [[s, e]];
      const parts: Array<[number, number]> = [];
      if (cutLo > s) parts.push([s, cutLo]);
      if (cutHi < e) parts.push([cutHi, e]);
      return parts;
    });
  }

  const centre = length / 2;
  const pieces: Array<[number, number]> = [];
  for (const [s, e] of free) {
    if (s < centre && e > centre) {
      // Unbroken through the middle: one panel, centred.
      const len = Math.min(PANEL_CELLS, e - s);
      const start = Math.min(e - len, Math.max(s, Math.round(centre - len / 2)));
      pieces.push([start, start + len]);
    } else {
      // Beside a sightline: a shorter panel, at the end nearer the
      // middle of the hall.
      const len = Math.min(SPLIT_PANEL_CELLS, e - s);
      pieces.push(e <= centre ? [e - len, e] : [s, s + len]);
    }
  }

  return pieces
    .filter(([s, e]) => e - s >= SPLIT_PANEL_CELLS)
    .flatMap(([s, e]) => [toDivider(frame, lo, s, e), toDivider(frame, hi, s, e)]);
}

/** Cross position of a hall's axis, in cells: where its end doors
 *  stand, or the middle when it has none. */
function hallAxis(frame: Frame, doors: FrameDoor[]): number {
  const endDoors = doors.filter((d) => d.wall === "end");
  if (endDoors.length === 0) return frame.breadth / 2;
  return endDoors.reduce((sum, d) => sum + d.pos, 0) / endDoors.length;
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
 * `mirrorAxis` is for a room composed about one axis (the Grand Hall
 * about its portals): it names the world axis that line runs along, and
 * the room gets an island each side of it, a quarter of the room out.
 */
export function planBenches(
  rect: CellRect,
  doors: readonly PlanDoor[],
  dividers: readonly Divider[],
  mirrorAxis?: "x" | "z",
): Bench[] {
  const kind = roomKind(rect);
  const frame = frameFor(rect, mirrorAxis ?? longAxis(rect));
  const fd = frameDoors(frame, doors);
  if (kind === "gallery") return planBayBenches(frame, fd, dividers);
  if (dividers.length > 0) return planNaveBenches(frame, fd, dividers);
  if (Math.min(frame.length, frame.breadth) < LARGE_MIN_CELLS) return [];
  return planIslands(frame, fd, mirrorAxis !== undefined);
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
    // Room to stand between the bench and the panel it faces.
    const panel = faces.filter((f) => (f - strip.centre) * side > 0);
    const gap = Math.min(...panel.map((f) => Math.abs(f - c))) - BENCH_DEPTH / 2;
    if (gap - DIVIDER_THICKNESS / 2 >= BENCH_DIVIDER_CLEARANCE) {
      out.push(toBench(frame, a, c, "axis"));
    }
  }
  return out;
}

/** An island of two benches back to back, as near the middle of the
 *  room as its doors' walking lines allow. `mirrored` puts one island
 *  each side of the axis instead, a quarter of the room out. */
function planIslands(frame: Frame, doors: FrameDoor[], mirrored: boolean): Bench[] {
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

  const centres: number[] = [];
  if (mirrored) {
    const axis = hallAxis(frame, doors) * CELL_SIZE;
    for (const side of [-1, 1]) {
      const target = axis + (side * breadthM) / 4;
      const c = nearestClear(
        target,
        halfAcross,
        wall + halfAcross,
        breadthM - wall - halfAcross,
        acrossBands,
        side as -1 | 1,
      );
      if (c !== null) centres.push(c);
    }
  } else {
    const c = nearestClear(
      breadthM / 2,
      halfAcross,
      wall + halfAcross,
      breadthM - wall - halfAcross,
      acrossBands,
      1,
    );
    if (c !== null) centres.push(c);
  }

  const back = (BENCH_DEPTH + ISLAND_GAP) / 2;
  return centres.flatMap((c) => [
    toBench(frame, a, c - back, "axis"),
    toBench(frame, a, c + back, "axis"),
  ]);
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
 * Can a body of this radius stand at (x, z) without overlapping a
 * divider or a bench?
 *
 * A bench is smaller than a cell, so the cell-edge masks cannot hold
 * it, and a divider is four times thicker than the edge it is written
 * into. Both are therefore tested as the rectangles they are. The
 * physics world carries the same rectangles as colliders, which is what
 * lets the player slide round them; this is the rule that holds when
 * the physics world is not loaded, and the check on what it returns.
 */
export function clearOfFittings(
  floor: {
    rooms: ReadonlyArray<{
      cellBounds: CellRect;
      dividers: readonly Divider[];
      benches: readonly Bench[];
    }>;
  },
  x: number,
  z: number,
  radius: number,
): boolean {
  for (const room of floor.rooms) {
    if (room.dividers.length === 0 && room.benches.length === 0) continue;
    const b = room.cellBounds;
    if (
      x < b.xMin * CELL_SIZE - radius ||
      x > (b.xMax + 1) * CELL_SIZE + radius ||
      z < b.zMin * CELL_SIZE - radius ||
      z > (b.zMax + 1) * CELL_SIZE + radius
    ) {
      continue;
    }
    for (const r of fittingRects(room)) if (circleHitsRect(x, z, radius, r)) return false;
  }
  return true;
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
    for (let i = d.start; i < d.end; i++) {
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
