// Benches for the block plan's rooms, set out from the room's own lines.
//
// `planBenches` (fittings.ts) seats a room from its footprint and doors.
// It was written for the tower, whose doors are 1.4 m wide. In the block
// plan every room has a door to every neighbour, 2.4 m or more wide, and
// that planner finds no place in a room with panels: the benches it
// would stand in the nave come 5 cm too near a panel.
//
// A first pass here stood a bench in front of each room's largest works,
// at the distance from which the whole canvas is in view. Rico walked it
// on 13 October 2026: benches in tight corridors, off the room's lines,
// "looking randomly placed". The distance from a work put a bench in the
// 5 m aisle between a panel and the wall, wherever the work happened to
// hang.
//
// So a bench now stands only on a line the room already has:
//
// - in line with a row of panels, in the middle of a gap between two of
//   them or of a long stretch past the last one, where the room is open
//   across its whole breadth. It reads as one more piece of the row:
//   panel, bench, panel. The panels may run along either axis of the
//   room; a pinwheel's four are seated one by one, from their aisles;
// - in the middle of an aisle, opposite the middle of a panel, where the
//   aisle is wide enough to be a room of its own (8 m). A 5 m aisle is a
//   passage and gets none;
// - in the middle of a room with no panels and no way straight through
//   it (`centredIsland`);
// - on the centre line of a room with no panels and a door in three of
//   its walls, in front of the fourth (`wallIsland`).
//
// A bench placed so is on a line of the room, but nothing says a work
// hangs on that line: Rico, the same day, "now they are not aligning
// with the images anymore... I want them both aligned with the rooms
// proportions and with the images." So the benches are planned before
// the hang, and the hang puts the room's largest works where the benches
// look: `distributePaintings` with `anchorToBenches` centres one on the
// wall, or the panel, square in front of each bench and hangs the rest
// of the room round them. The room places the bench, and the bench
// places the work. "Largest" is by hung area: the catalogue the museum
// is laid out from has no measure of how well known a work is.

import { arrangementOf } from "./divider-plans";
import {
  BENCH_DEPTH,
  BENCH_LENGTH,
  benchClearOf,
  benchRect,
  longAxis,
  type PlanDoor,
} from "./fittings";
import { benchAnchors, computeRoomRuns } from "./place-paintings";
import type { Bench, CellRect, Divider, RoomLayout } from "./types";
import { CELL_SIZE, DIVIDER_THICKNESS } from "./world-coords";

/** Floor kept free either side of the line a door is walked through. */
const DOOR_LINE_MARGIN = 0.8;
/** A gap in a row of panels takes a bench when it leaves this much
 *  clear at each end of the bench. */
const ROW_END_CLEARANCE = 2.25;
/** The stretch between a row's last panel and the end wall takes a
 *  bench in its middle when it is this long. */
const MIN_OPEN_END = 9;
/** An aisle narrower than this is a passage: no bench. */
const MIN_AISLE = 8;
/** Gap between the two benches of an island, back to back. */
const ISLAND_GAP = 0.02;

/** A place for a bench, and how far it is from the middle of the room
 *  along the panels it was found by. */
type Slot = { bench: Bench; offMiddle: number };

/** How many benches a room with panels takes, by its size. */
function quota(lengthM: number, breadthM: number): number {
  if (lengthM >= 50 || breadthM >= 25) return 4;
  if (lengthM >= 40) return 3;
  return 2;
}

/** Floor between a bench and any wall of the room, and any divider. */
const WALL_CLEARANCE = 4;
const DIVIDER_CLEARANCE = 2.2;

/**
 * Benches for a room with freestanding panels, on the lines of its
 * panels. Empty for a room that is already seated, or has no panels: a
 * room of wing walls is seated bay by bay (`planBenches`), and a door
 * screen is no line to seat a room on.
 */
export function planPanelBenches(room: RoomLayout): Bench[] {
  if (room.benches.length > 0) return [];
  const rect = room.cellBounds;
  const set = arrangementOf(rect, room.dividers);
  if (set.kind !== "rows" && set.kind !== "pinwheel") return [];
  const walls = room.dividers.filter((d) => !d.bare);
  const runs = computeRoomRuns(room);

  const slots: Slot[] = [];
  for (const axis of ["x", "z"] as const) {
    const panels = walls.filter((d) => d.axis === axis);
    // A pinwheel's panels stand one to a line: each is seated from its
    // aisle, and none from a gap in a row.
    if (panels.length > 0) slots.push(...panelSlots(room, axis, panels, set.kind === "rows"));
  }

  const x0 = rect.xMin * CELL_SIZE + WALL_CLEARANCE;
  const x1 = (rect.xMax + 1) * CELL_SIZE - WALL_CLEARANCE;
  const z0 = rect.zMin * CELL_SIZE + WALL_CLEARANCE;
  const z1 = (rect.zMax + 1) * CELL_SIZE - WALL_CLEARANCE;
  const stands = ({ bench }: Slot) => {
    const r = benchRect(bench);
    return (
      r.xMin >= x0 - 1e-6 &&
      r.xMax <= x1 + 1e-6 &&
      r.zMin >= z0 - 1e-6 &&
      r.zMax <= z1 + 1e-6 &&
      benchClearOf(bench, room.dividers, DIVIDER_CLEARANCE) &&
      // The hang puts a work in front of every bench, so a bench stands
      // only where it looks at a wall or a panel within reach. The gap
      // in a row 10 m from both walls of a square room is no place.
      benchAnchors({ benches: [bench] }, runs).length > 0
    );
  };

  // Where there are more places than benches, the ones nearest the
  // middle of the room along their panels are taken, in plan order.
  const length = Math.max(rect.xMax - rect.xMin, rect.zMax - rect.zMin) + 1;
  const breadth = Math.min(rect.xMax - rect.xMin, rect.zMax - rect.zMin) + 1;
  return slots
    .filter(stands)
    .map((slot, order) => ({ slot, order }))
    .sort((p, q) => p.slot.offMiddle - q.slot.offMiddle || p.order - q.order)
    .slice(0, quota(length * CELL_SIZE, breadth * CELL_SIZE))
    .map(({ slot }) => slot.bench);
}

/** The places the panels along one axis give a bench. */
function panelSlots(
  room: Pick<RoomLayout, "cellBounds" | "doors">,
  axis: "x" | "z",
  panels: readonly Divider[],
  inRows: boolean,
): Slot[] {
  const rect = room.cellBounds;
  // The room in the panels' frame: `a` runs along them from the room's
  // low end, `c` across from its low side, both in metres.
  const a0 = (axis === "x" ? rect.xMin : rect.zMin) * CELL_SIZE;
  const c0 = (axis === "x" ? rect.zMin : rect.xMin) * CELL_SIZE;
  const length = (axis === "x" ? rect.xMax - rect.xMin + 1 : rect.zMax - rect.zMin + 1) * CELL_SIZE;
  const breadth =
    (axis === "x" ? rect.zMax - rect.zMin + 1 : rect.xMax - rect.xMin + 1) * CELL_SIZE;
  const along = (p: { x: number; z: number }) => (axis === "x" ? p.x : p.z) - a0;

  // The line each door in a wall beside the panels is walked through, as
  // a band along the room, and which of those walls the door is in.
  const lowSide = axis === "x" ? "north" : "west";
  const highSide = axis === "x" ? "south" : "east";
  const bands = room.doors
    .filter((d) => d.side === lowSide || d.side === highSide)
    .map((d) => {
      const at = along({ x: d.worldX, z: d.worldZ });
      const half = d.width / 2 + DOOR_LINE_MARGIN;
      return { low: d.side === lowSide, from: at - half, to: at + half };
    });
  const inDoorLine = (a: number, low: boolean) =>
    bands.some(
      (b) => b.low === low && a + BENCH_LENGTH / 2 > b.from && a - BENCH_LENGTH / 2 < b.to,
    );
  const slot = (a: number, c: number): Slot => ({
    bench:
      axis === "x" ? { x: a0 + a, z: c0 + c, along: "x" } : { x: c0 + c, z: a0 + a, along: "z" },
    offMiddle: Math.abs(a - length / 2),
  });

  const rows = [...new Set(panels.map((d) => d.line * CELL_SIZE - c0))].sort((p, q) => p - q);
  const slots: Slot[] = [];
  for (const c of rows) {
    const low = c < breadth / 2;
    const spans = panels
      .filter((d) => Math.abs(d.line * CELL_SIZE - c0 - c) < 1e-6)
      .map((d) => [d.start * CELL_SIZE - a0, d.end * CELL_SIZE - a0] as const)
      .sort((p, q) => p[0] - q[0]);

    if (inRows) {
      // In the row, between two of its panels.
      for (let i = 0; i + 1 < spans.length; i++) {
        const from = spans[i][1];
        const to = spans[i + 1][0];
        if (to - from < BENCH_LENGTH + 2 * ROW_END_CLEARANCE) continue;
        const a = (from + to) / 2;
        if (inDoorLine(a, low)) continue;
        slots.push(slot(a, c));
      }
      // In the row, where it stops well short of an end of the room: a
      // long gallery joined from two rooms has one end without panels.
      for (const [from, to] of [
        [0, spans[0][0]],
        [spans[spans.length - 1][1], length],
      ]) {
        if (to - from < MIN_OPEN_END) continue;
        const a = (from + to) / 2;
        if (inDoorLine(a, low)) continue;
        slots.push(slot(a, c));
      }
    }

    // In the aisle between the row and its wall, where that is wide.
    const face = low ? c - DIVIDER_THICKNESS / 2 : c + DIVIDER_THICKNESS / 2;
    const wall = low ? 0 : breadth;
    if (Math.abs(face - wall) < MIN_AISLE) continue;
    for (const [from, to] of spans) {
      const a = (from + to) / 2;
      if (inDoorLine(a, low)) continue;
      slots.push(slot(a, (face + wall) / 2));
    }
  }
  return slots;
}

/**
 * An island of two benches, back to back, on the centre of a room. For
 * a room no one walks straight through: one with no two doors facing
 * each other. Its visitors turn a corner in it, round the island.
 * Null when a pair of doors does face each other across the room.
 */
export function centredIsland(rect: CellRect, doors: readonly PlanDoor[]): Bench[] | null {
  const has = (side: PlanDoor["side"]) => doors.some((d) => d.side === side);
  if ((has("north") && has("south")) || (has("west") && has("east"))) return null;
  const axis = longAxis(rect);
  const x = ((rect.xMin + rect.xMax + 1) / 2) * CELL_SIZE;
  const z = ((rect.zMin + rect.zMax + 1) / 2) * CELL_SIZE;
  const back = (BENCH_DEPTH + ISLAND_GAP) / 2;
  return [-back, back].map(
    (off): Bench => (axis === "x" ? { x, z: z + off, along: "x" } : { x: x + off, z, along: "z" }),
  );
}

/** How far off a wall an island stands whose one bench faces it. */
const ISLAND_WALL_VIEW = 4.25;

/**
 * An island of two for a room with a door in three of its walls: one
 * line is walked straight through it, and a third door opens on that
 * line from one side. The island stands on the room's centre line in the
 * half the fourth wall closes, one bench facing that wall and one the
 * room. Null for any other room.
 */
export function wallIsland(rect: CellRect, doors: readonly PlanDoor[]): Bench[] | null {
  const sides = ["north", "south", "west", "east"] as const;
  const closed = sides.filter((side) => !doors.some((d) => d.side === side));
  if (closed.length !== 1) return null;
  const x = ((rect.xMin + rect.xMax + 1) / 2) * CELL_SIZE;
  const z = ((rect.zMin + rect.zMax + 1) / 2) * CELL_SIZE;
  const back = (BENCH_DEPTH + ISLAND_GAP) / 2;
  const inset = ISLAND_WALL_VIEW + BENCH_DEPTH + ISLAND_GAP / 2;
  switch (closed[0]) {
    case "north": {
      const at = rect.zMin * CELL_SIZE + inset;
      return [-back, back].map((off): Bench => ({ x, z: at + off, along: "x" }));
    }
    case "south": {
      const at = (rect.zMax + 1) * CELL_SIZE - inset;
      return [-back, back].map((off): Bench => ({ x, z: at + off, along: "x" }));
    }
    case "west": {
      const at = rect.xMin * CELL_SIZE + inset;
      return [-back, back].map((off): Bench => ({ x: at + off, z, along: "z" }));
    }
    default: {
      const at = (rect.xMax + 1) * CELL_SIZE - inset;
      return [-back, back].map((off): Bench => ({ x: at + off, z, along: "z" }));
    }
  }
}

/** True when a bench stands clear of every divider of its room by at
 *  least `clearance`. For tests. */
export function benchClearOfDividers(
  bench: Bench,
  room: Pick<RoomLayout, "dividers">,
  clearance: number,
): boolean {
  return benchClearOf(bench, room.dividers, clearance);
}

/**
 * The composed great hall's two islands, turned to look at its two
 * largest works: the pair that hangs either side of the door to the
 * stair hall. `planBenches` stands the islands a quarter of the room
 * out, looking at the side walls. Here each island keeps its distance
 * from the front wall and moves in line with one work of the pair, one
 * bench facing it and one facing the back wall.
 *
 * Null when the front wall has no such pair, or a bench would stand in
 * the walking line of its door.
 */
export function hallIslandsFacingPair(
  hall: Pick<RoomLayout, "cellBounds" | "doors" | "benches" | "placements">,
  frontRoomId: string,
): Bench[] | null {
  const door = hall.doors.find((d) => d.connectsTo.roomId === frontRoomId);
  if (!door || hall.benches.length === 0) return null;
  const alongX = door.side === "north" || door.side === "south";
  // Along the front wall, and away from it.
  const along = (p: { x: number; z: number }) => (alongX ? p.x : p.z);
  const away = (p: { x: number; z: number }) => (alongX ? p.z : p.x);
  const wall = away({ x: door.worldX, z: door.worldZ });
  const onFront = hall.placements
    .filter((p) => Math.abs(away({ x: p.position[0], z: p.position[2] }) - wall) < 0.3)
    .sort((p, q) => q.widthM * q.heightM - p.widthM * p.heightM);
  const lead = onFront[0];
  if (!lead) return null;
  const axis = along({ x: door.worldX, z: door.worldZ });
  const offset = Math.abs(along({ x: lead.position[0], z: lead.position[2] }) - axis);
  // Its mirror image across the door.
  const twin = onFront.some(
    (p) =>
      p !== lead &&
      Math.abs(Math.abs(along({ x: p.position[0], z: p.position[2] }) - axis) - offset) < 0.05,
  );
  if (!twin || offset - BENCH_LENGTH / 2 < door.width / 2 + DOOR_LINE_MARGIN) return null;

  const depth = hall.benches.reduce((sum, b) => sum + away(b), 0) / hall.benches.length;
  const back = (BENCH_DEPTH + ISLAND_GAP) / 2;
  return [-offset, offset].flatMap((side) =>
    [-back, back].map(
      (off): Bench =>
        alongX
          ? { x: axis + side, z: depth + off, along: "x" }
          : { x: depth + off, z: axis + side, along: "z" },
    ),
  );
}
