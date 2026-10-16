// Freestanding walls for a room: which arrangement it takes, and where
// each wall stands.
//
// A room can be divided in more than one way (`DividerStyle`), and the
// plan names one for each room, so two rooms of one shape next to each
// other are not the same room twice:
//
//  - rows: panels either side of the room's axis, a nave between them
//    and an aisle behind each. One panel through the middle of a row, or
//    a shorter one either side of a door that looks across it.
//  - long rows: the same lines with longer panels.
//  - bays: pairs of wing walls across the room, one from each long wall,
//    the middle left open as one sightline down the room.
//  - staggered: single wing walls from alternate sides.
//  - pinwheel: four panels turned a quarter from one to the next round
//    the middle of a large square room.
//  - cross rows: rows along the room's other axis.
//  - open: no walls.
//
// A room that is given no style, or one it has no place for, takes
// rows when it is a hall and bays when it is a long room.
//
// On top of whichever it takes, a room can have a screen in front of a
// door: a wall parallel to the door's, one cell into the room. Its back
// is to the door and stays bare (`Divider.bare`); the face toward the
// room is hung with one picture. A visitor walks in, round either end,
// and finds the room. From the room the door is out of sight behind a
// wall with a picture on it.
//
// Everything is planned from the room's rectangle and its doors. No
// wall but a screen stands across a door's line of sight, and a
// screened door has no line of sight to keep. Walls lie on cell lines;
// `writeDividerEdges` puts them into the collision masks.

import {
  alongDivider,
  crossDivider,
  EPS,
  type Frame,
  type FrameDoor,
  frameDoor,
  frameFor,
  hallAxis,
  longAxis,
  type PlanDoor,
  roomKind,
} from "./room-frame";
import type { CellRect, Divider } from "./types";
import { CELL_SIZE, PORTAL_WIDTH } from "./world-coords";

/** Clear floor kept either side of a door opening along its line of
 *  sight, metres. A divider never enters that strip. */
const SIGHT_MARGIN = 0.3;
/** Wall left between a door jamb and a wing wall built off the same
 *  wall, metres. */
const ATTACH_CLEARANCE = 1.0;
/** Bays a long room is cut into are this long at best, in cells. */
const IDEAL_BAY_CELLS = 3;
const MIN_BAY_CELLS = 2;
/** The same in a hall, 17.5 m or more across. */
const WIDE_IDEAL_BAY_CELLS = 4;
const WIDE_MIN_BAY_CELLS = 3;
/** Half the nave between a hall's two panel lines, in cells. */
const NAVE_HALF_CELLS = 1.5;
/** Narrowest aisle left between a panel line and the side wall. */
const MIN_AISLE_CELLS = 2;
/** Panel length in cells: one unbroken panel, or each of the two a
 *  cross door's sightline splits it into. */
const PANEL_CELLS = 3;
const SPLIT_PANEL_CELLS = 2;
/** A stretch of a hall this long with no door looking across it takes a
 *  row of panels, a panel's length apart, and not one. Only a long
 *  gallery joined from several rooms has one: the tower's longest
 *  stretch is 7 cells. */
const PANEL_ROW_MIN_CELLS = 12;
const PANEL_ROW_GAP_CELLS = 3;
/** The same for the long rows. */
const LONG_PANEL_CELLS = 5;
const LONG_SPLIT_PANEL_CELLS = 3;
/** A pinwheel needs a room this many cells both ways. */
const PINWHEEL_MIN_CELLS = 9;

/** A screen stands this many cells in from its door's wall. */
const SCREEN_SETBACK_CELLS = 1;
/** Its length: 5 m, or 2.5 m in front of a narrow door in a short wall. */
const SCREEN_CELLS = 2;
const SMALL_SCREEN_CELLS = 1;
/** Wall, in cells, from which a narrow door gets the longer screen. */
const SCREEN_LONG_WALL_CELLS = 6;
/** A screen reaches this far past each jamb at least, metres. */
const SCREEN_OVERLAP = 0.5;
/** Room left behind a screen, in cells from the door's wall to the
 *  wall opposite. */
const SCREEN_MIN_DEPTH_CELLS = 5;
/** Floor between a screen's end and the wall beside it, in cells. */
const SCREEN_END_CELLS = 1;

/** Two walls that face each other stand this many cells apart. */
const FACING_CELLS = 2;
/** Two walls in one line leave this much between their ends. */
const INLINE_GAP_CELLS = 1;
/** Corner to corner, two walls keep this far apart. */
const CORNER_GAP_CELLS = 1.5;

export type DividerStyle =
  | "rows"
  | "long-rows"
  | "bays"
  | "staggered"
  | "pinwheel"
  | "cross-rows"
  | "open";

export type DividerOptions = {
  /** How the room is divided. Unset, or a style the room has no place
   *  for: rows in a hall, bays in a long room, nothing in a small one. */
  style?: DividerStyle;
  /** Doors of the room that get a screen. One that cannot have it (a
   *  portal, a shallow room, a door too near a corner) is left open. */
  screens?: readonly PlanDoor[];
};

/** A wall in the room's frame, in cells. "along" runs along the axis on
 *  cross line `line`; "across" runs across it on line `line` along. */
type Seg = {
  dir: "along" | "across";
  line: number;
  start: number;
  end: number;
  bare?: "low" | "high";
};

type Planned = FrameDoor & { screened: boolean };
type Room = { frame: Frame; doors: Planned[]; screens: Seg[] };

function sightHalfCells(width: number): number {
  return (width / 2 + SIGHT_MARGIN) / CELL_SIZE;
}

/**
 * Freestanding walls for a room, from its footprint and doors. Screens
 * come last in the list.
 */
export function planDividers(
  rect: CellRect,
  doors: readonly PlanDoor[],
  options: DividerOptions = {},
): Divider[] {
  const kind = roomKind(rect);
  const usual: DividerStyle = kind === "hall" ? "rows" : kind === "gallery" ? "bays" : "open";
  const style = options.style ?? usual;
  const screens = options.screens ?? [];

  let { room, walls } = arrange(rect, doors, screens, style);
  if (walls.length === 0 && style !== usual && style !== "open") {
    ({ room, walls } = arrange(rect, doors, screens, usual));
  }
  return [...walls, ...room.screens].map((s) => toDivider(room.frame, s));
}

/** The styles a room has a place for, `open` aside. */
export function dividerStyles(
  rect: CellRect,
  doors: readonly PlanDoor[],
  screens: readonly PlanDoor[] = [],
): DividerStyle[] {
  const all: DividerStyle[] = ["rows", "long-rows", "bays", "staggered", "pinwheel", "cross-rows"];
  const seen = new Set<string>();
  return all.filter((style) => {
    const { room, walls } = arrange(rect, doors, screens, style);
    const id = JSON.stringify(walls.map((s) => toDivider(room.frame, s)));
    if (walls.length === 0 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function arrange(
  rect: CellRect,
  doors: readonly PlanDoor[],
  screens: readonly PlanDoor[],
  style: DividerStyle,
): { room: Room; walls: Seg[] } {
  const kind = roomKind(rect);
  const axis = longAxis(rect);
  const room = roomIn(
    rect,
    style === "cross-rows" ? (axis === "x" ? "z" : "x") : axis,
    doors,
    screens,
  );
  // A room under 17.5 m is not divided, and a long narrow one has no
  // breadth for anything but wing walls.
  const wingsOnly = kind === "gallery" && (style === "bays" || style === "staggered");
  if (style === "open" || (kind !== "hall" && !wingsOnly)) return { room, walls: [] };

  let segs: Seg[];
  let whole = false;
  if (style === "rows" || style === "cross-rows") {
    segs = rows(room, PANEL_CELLS, SPLIT_PANEL_CELLS);
  } else if (style === "long-rows") {
    segs = rows(room, LONG_PANEL_CELLS, LONG_SPLIT_PANEL_CELLS);
  } else if (style === "pinwheel") {
    segs = pinwheel(room);
    // Three panels of a pinwheel are not one.
    whole = true;
  } else {
    segs = wings(room, style === "bays" ? "pairs" : "staggered", kind === "hall");
  }
  const walls = segs.filter((s) => fits(room, s));
  return { room, walls: whole && walls.length < segs.length ? [] : walls };
}

function roomIn(
  rect: CellRect,
  axis: "x" | "z",
  doors: readonly PlanDoor[],
  screened: readonly PlanDoor[],
): Room {
  const frame = frameFor(rect, axis);
  const room: Room = { frame, doors: [], screens: [] };
  const wanted = doors.map((d) => screened.some((s) => sameDoor(s, d)));
  const all = doors.map((d) => frameDoor(frame, d));
  all.forEach((door, i) => {
    let screen = wanted[i] ? screenFor(frame, door) : null;
    // Not across another door's way in, and clear of a screen the room
    // already has.
    if (screen) {
      const s = screen;
      const inTheWay = all.some(
        (o, j) => j !== i && blocksSight(s, o) && !(o.wall === door.wall && o.low !== door.low),
      );
      if (inTheWay || room.screens.some((o) => clash(s, o))) screen = null;
    }
    if (screen) room.screens.push(screen);
    room.doors.push({ ...door, screened: screen !== null });
  });
  return room;
}

function sameDoor(a: PlanDoor, b: PlanDoor): boolean {
  return (
    a.side === b.side && Math.abs(a.worldX - b.worldX) < EPS && Math.abs(a.worldZ - b.worldZ) < EPS
  );
}

function toDivider(frame: Frame, s: Seg): Divider {
  const d =
    s.dir === "along"
      ? alongDivider(frame, s.line, s.start, s.end)
      : crossDivider(frame, s.line, s.start, s.end);
  return s.bare ? { ...d, bare: s.bare } : d;
}

// ── Screens ───────────────────────────────────────────────────────────

/** The screen in front of a door, or null when the door cannot have one. */
function screenFor(frame: Frame, door: FrameDoor): Seg | null {
  const wall = door.wall === "end" ? frame.breadth : frame.length;
  const depth = door.wall === "end" ? frame.length : frame.breadth;
  if (door.width >= PORTAL_WIDTH - EPS) return null;
  if (depth < SCREEN_MIN_DEPTH_CELLS) return null;

  const covers = (cells: number) => cells * CELL_SIZE >= door.width + 2 * SCREEN_OVERLAP - EPS;
  const sizes = [SMALL_SCREEN_CELLS, SCREEN_CELLS].filter(covers);
  if (sizes.length === 0) return null;
  // The longer one where the wall has room for it; ends on half cells,
  // so a screen is centred on a door that stands in the middle of one.
  const preferred = wall >= SCREEN_LONG_WALL_CELLS ? [...sizes].reverse() : sizes;
  for (const cells of preferred) {
    const start = Math.round((door.pos - cells / 2) * 2) / 2;
    const end = start + cells;
    if (start < SCREEN_END_CELLS - EPS || end > wall - SCREEN_END_CELLS + EPS) continue;
    return {
      dir: door.wall === "end" ? "across" : "along",
      line: door.low ? SCREEN_SETBACK_CELLS : depth - SCREEN_SETBACK_CELLS,
      start,
      end,
      bare: door.low ? "low" : "high",
    };
  }
  return null;
}

// ── What may stand where ──────────────────────────────────────────────

/** Does a wall stand in the strip of floor a door looks down? */
function blocksSight(s: Seg, door: FrameDoor): boolean {
  const half = sightHalfCells(door.width);
  // An end door looks along the axis at cross position `pos`.
  const alongStrip = door.wall === "end";
  if ((s.dir === "along") === alongStrip) return Math.abs(s.line - door.pos) < half - EPS;
  return s.start < door.pos + half - EPS && s.end > door.pos - half + EPS;
}

/** Do two walls stand too near each other to walk between, or touch? */
function clash(p: Seg, q: Seg): boolean {
  const box = (s: Seg) =>
    s.dir === "along"
      ? { a0: s.start, a1: s.end, c0: s.line, c1: s.line }
      : { a0: s.line, a1: s.line, c0: s.start, c1: s.end };
  const P = box(p);
  const Q = box(q);
  const da = Math.max(0, P.a0 - Q.a1, Q.a0 - P.a1);
  const dc = Math.max(0, P.c0 - Q.c1, Q.c0 - P.c1);
  if (da < EPS && dc < EPS) return true;
  if (da > EPS && dc > EPS) return Math.hypot(da, dc) < CORNER_GAP_CELLS - EPS;
  const inline = p.dir === q.dir && Math.abs(p.line - q.line) < EPS;
  return Math.max(da, dc) < (inline ? INLINE_GAP_CELLS : FACING_CELLS) - EPS;
}

/** A wall the room can take: out of every open door's line of sight
 *  and clear of the screens. */
function fits(room: Room, s: Seg): boolean {
  if (room.doors.some((d) => !d.screened && blocksSight(s, d))) return false;
  return !room.screens.some((screen) => clash(s, screen));
}

// ── Rows ──────────────────────────────────────────────────────────────

/** Panels either side of the room's axis. A door in a side wall looks
 *  across the room, so a row stops either side of its sightline, and
 *  either side of a screen it would crowd. */
function rows(room: Room, panelCells: number, splitCells: number): Seg[] {
  const { length, breadth } = room.frame;
  const axis = hallAxis(room.frame, room.doors);
  const lo = Math.floor(axis - NAVE_HALF_CELLS + EPS);
  const hi = Math.ceil(axis + NAVE_HALF_CELLS - EPS);
  if (lo < MIN_AISLE_CELLS || breadth - hi < MIN_AISLE_CELLS) return [];
  for (const d of room.doors) {
    if (d.wall !== "end" || d.screened) continue;
    const half = sightHalfCells(d.width);
    if (d.pos - half < lo + EPS || d.pos + half > hi - EPS) return [];
  }

  const centre = length / 2;
  const perRow = [lo, hi].map((line) => {
    // Stretches of the row a panel can stand on, a cell clear of each
    // end wall.
    const free: Array<[number, number]> = [];
    for (let cell = 1; cell < length - 1; cell++) {
      if (!fits(room, { dir: "along", line, start: cell, end: cell + 1 })) continue;
      const last = free[free.length - 1];
      if (last && last[1] === cell) last[1] = cell + 1;
      else free.push([cell, cell + 1]);
    }
    // A panel too long for its stretch takes the next length down that
    // fits: a room's panels come in two lengths, three with the short
    // ones beside a sightline, never cut to whatever is left.
    const lengths = [panelCells, splitCells, SPLIT_PANEL_CELLS];
    const fitting = (most: number, space: number) =>
      lengths.find((n) => n <= most && n <= space) ?? space;
    const pieces: Array<[number, number]> = [];
    for (const [s, e] of free) {
      if (e - s >= PANEL_ROW_MIN_CELLS) {
        // A long gallery: as many panels as fit at an even pitch, set
        // out about the middle of the stretch.
        const pitch = panelCells + PANEL_ROW_GAP_CELLS;
        const count = Math.floor((e - s + PANEL_ROW_GAP_CELLS) / pitch);
        const span = count * pitch - PANEL_ROW_GAP_CELLS;
        const start = Math.min(e - span, Math.max(s, Math.round((s + e - span) / 2)));
        for (let i = 0; i < count; i++) {
          pieces.push([start + i * pitch, start + i * pitch + panelCells]);
        }
      } else if (s < centre && e > centre) {
        // Unbroken through the middle: one panel, centred.
        const len = fitting(panelCells, e - s);
        const start = Math.min(e - len, Math.max(s, Math.round(centre - len / 2)));
        pieces.push([start, start + len]);
      } else {
        // Beside a sightline: a shorter panel, at the end nearer the
        // middle of the room.
        const len = fitting(splitCells, e - s);
        pieces.push(e <= centre ? [e - len, e] : [s, s + len]);
      }
    }
    return pieces
      .filter(([s, e]) => e - s >= SPLIT_PANEL_CELLS)
      .map(([start, end]): Seg => ({ dir: "along", line, start, end }));
  });

  // Row by row down the room, the low side first.
  const out: Seg[] = [];
  for (let i = 0; i < Math.max(perRow[0].length, perRow[1].length); i++) {
    for (const row of perRow) if (row[i]) out.push(row[i]);
  }
  return out;
}

// ── Wing walls ────────────────────────────────────────────────────────

/** Wing walls across the room, built off its long walls. In pairs, one
 *  from each side on the same line; or staggered, one to a line from
 *  alternate sides and longer. The middle stays open either way. */
function wings(room: Room, mode: "pairs" | "staggered", wide: boolean): Seg[] {
  const { length, breadth } = room.frame;
  // A hall's bays are as deep as the hall is wide, so they are longer:
  // a 5 m bay 17.5 m across is a corridor.
  const minBay = wide ? WIDE_MIN_BAY_CELLS : MIN_BAY_CELLS;
  const idealBay = wide ? WIDE_IDEAL_BAY_CELLS : IDEAL_BAY_CELLS;
  const open = room.doors.filter((d) => !d.screened);
  const endDoors = open.filter((d) => d.wall === "end");
  const sideDoors = open.filter((d) => d.wall === "side");

  // A third of the width from each side, or just short of half from
  // one; shortened until every end door looks down the open passage.
  let wing =
    mode === "pairs" ? Math.max(1, Math.floor(breadth / 3)) : Math.floor((breadth - 1) / 2);
  for (const d of endDoors) {
    const half = sightHalfCells(d.width);
    while (wing > 0 && (d.pos - half < wing - EPS || d.pos + half > breadth - wing + EPS)) wing--;
  }
  if (wing === 0) return [];

  const low = (line: number): Seg => ({ dir: "across", line, start: 0, end: wing });
  const high = (line: number): Seg => ({
    dir: "across",
    line,
    start: breadth - wing,
    end: breadth,
  });

  // Lines a wing may stand on: clear of every door in the long walls,
  // and leaving a real bay at each end.
  const allowed: number[] = [];
  for (let line = minBay; line <= length - minBay; line++) {
    const clear = sideDoors.every(
      (d) => Math.abs(line - d.pos) * CELL_SIZE >= d.width / 2 + ATTACH_CLEARANCE,
    );
    if (!clear) continue;
    const sides = [fits(room, low(line)), fits(room, high(line))];
    if (mode === "pairs" ? sides[0] && sides[1] : sides[0] || sides[1]) allowed.push(line);
  }

  // Every way of using those lines, scored by how far its bays are from
  // the ideal length and from mirror symmetry. A long gallery has more
  // lines than can be tried in every combination: there the lines too
  // near each other to both be used are thinned first.
  const lines = allowed.length <= 16 ? allowed : thin(allowed);
  let best: { lines: number[]; score: number } | null = null;
  for (let mask = 1; mask < 1 << lines.length; mask++) {
    const used = lines.filter((_, i) => mask & (1 << i));
    const edges = [0, ...used, length];
    const bays = edges.slice(1).map((e, i) => e - edges[i]);
    if (bays.some((b) => b < minBay)) continue;
    let score = 0;
    for (let i = 0; i < bays.length; i++) {
      score += (bays[i] - idealBay) ** 2;
      score += Math.abs(bays[i] - bays[bays.length - 1 - i]);
    }
    if (!best || score < best.score - EPS) best = { lines: used, score };
  }
  if (!best) return [];

  if (mode === "pairs") return best.lines.flatMap((line) => [low(line), high(line)]);
  // From alternate sides, starting on the low one. A line where that
  // side is taken (a screen stands there) uses the other.
  return best.lines.map((line, i) => {
    const first = i % 2 === 0 ? low(line) : high(line);
    const second = i % 2 === 0 ? high(line) : low(line);
    return fits(room, first) ? first : second;
  });
}

/** Every other line of a run of neighbours, so the search stays small. */
function thin(lines: number[]): number[] {
  return lines.filter((line, i) => i === 0 || line - lines[i - 1] > 1 || i % 2 === 0);
}

// ── Pinwheel ──────────────────────────────────────────────────────────

/** Four panels round the middle of a large room, each a quarter turn
 *  from the last: two along the axis and two across it, on the lines a
 *  nave would have both ways. */
function pinwheel(room: Room): Seg[] {
  const { length, breadth } = room.frame;
  if (Math.min(length, breadth) < PINWHEEL_MIN_CELLS) return [];
  const sideDoors = room.doors.filter((d) => d.wall === "side");
  const acrossAxis = hallAxis(room.frame, room.doors);
  const alongAxis =
    sideDoors.length > 0
      ? sideDoors.reduce((sum, d) => sum + d.pos, 0) / sideDoors.length
      : length / 2;
  const cLo = Math.floor(acrossAxis - NAVE_HALF_CELLS + EPS);
  const cHi = Math.ceil(acrossAxis + NAVE_HALF_CELLS - EPS);
  const aLo = Math.floor(alongAxis - NAVE_HALF_CELLS + EPS);
  const aHi = Math.ceil(alongAxis + NAVE_HALF_CELLS - EPS);
  // Each panel runs from its nave line out toward a wall, a cell short
  // of it at least.
  const len = Math.min(PANEL_CELLS, aLo - 1, length - aHi - 1, cLo - 1, breadth - cHi - 1);
  if (len < SPLIT_PANEL_CELLS) return [];
  return [
    { dir: "along", line: cLo, start: aLo - len, end: aLo },
    { dir: "across", line: aHi, start: cLo - len, end: cLo },
    { dir: "along", line: cHi, start: aHi, end: aHi + len },
    { dir: "across", line: aLo, start: cHi, end: cHi + len },
  ];
}

// ── Reading a room's walls back ───────────────────────────────────────

/** How a room's walls are set out, for whoever seats it. */
export type Arrangement =
  | { kind: "none" }
  /** Wing walls built off the walls that run along `axis`. */
  | { kind: "wings"; axis: "x" | "z" }
  /** Panels standing free, all along `axis`. */
  | { kind: "rows"; axis: "x" | "z" }
  | { kind: "pinwheel" };

/** Which arrangement a room's dividers are, screens aside. */
export function arrangementOf(rect: CellRect, dividers: readonly Divider[]): Arrangement {
  const walls = dividers.filter((d) => !d.bare);
  if (walls.length === 0) return { kind: "none" };
  const attached = (d: Divider) => {
    const low = d.axis === "x" ? rect.xMin : rect.zMin;
    const high = (d.axis === "x" ? rect.xMax : rect.zMax) + 1;
    return d.start <= low || d.end >= high;
  };
  const axes = new Set(walls.map((d) => d.axis));
  if (axes.size > 1) return { kind: "pinwheel" };
  const [axis] = axes;
  if (walls.every(attached)) return { kind: "wings", axis: axis === "x" ? "z" : "x" };
  return { kind: "rows", axis };
}
