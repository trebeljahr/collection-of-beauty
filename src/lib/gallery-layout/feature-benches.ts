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
//   panel, bench, panel;
// - in the middle of an aisle, opposite the middle of a panel, where the
//   aisle is wide enough to be a room of its own (8 m). A 5 m aisle is a
//   passage and gets none;
// - in the middle of a room with no panels and no way straight through
//   it (`centredIsland`).
//
// Among those places, the ones in front of the largest works are taken
// first. "Largest" is by hung area: the catalogue the museum is laid out
// from has no measure of how well known a work is.

import {
  BENCH_DEPTH,
  BENCH_LENGTH,
  benchRect,
  dividerRect,
  longAxis,
  type PlanDoor,
} from "./fittings";
import type { Bench, CellRect, RoomLayout } from "./types";
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
/** How far along a wall from a bench a work still counts as the work
 *  the bench is in front of. */
const FACING_REACH = 4;
/** Gap between the two benches of an island, back to back. */
const ISLAND_GAP = 0.02;

type Slot = { a: number; c: number; score: number };

/** How many benches a room with panels takes, by its size. */
function quota(lengthM: number, breadthM: number): number {
  if (lengthM >= 50 || breadthM >= 25) return 4;
  if (lengthM >= 40) return 3;
  return 2;
}

/**
 * Benches for a room with panels along its long axis, on the lines of
 * its panels. Empty for a room that is already seated, or has no such
 * panels.
 */
export function planPanelBenches(
  room: Pick<RoomLayout, "cellBounds" | "doors" | "dividers" | "benches" | "placements">,
): Bench[] {
  if (room.benches.length > 0) return [];
  const rect = room.cellBounds;
  const axis = longAxis(rect);
  const panels = room.dividers.filter((d) => d.axis === axis);
  if (panels.length === 0) return [];

  // The room in its own frame: `a` runs along its long axis from its low
  // end, `c` across it from its low side, both in metres.
  const a0 = (axis === "x" ? rect.xMin : rect.zMin) * CELL_SIZE;
  const c0 = (axis === "x" ? rect.zMin : rect.xMin) * CELL_SIZE;
  const length = (axis === "x" ? rect.xMax - rect.xMin + 1 : rect.zMax - rect.zMin + 1) * CELL_SIZE;
  const breadth =
    (axis === "x" ? rect.zMax - rect.zMin + 1 : rect.xMax - rect.xMin + 1) * CELL_SIZE;
  const along = (p: { x: number; z: number }) => (axis === "x" ? p.x : p.z) - a0;
  const across = (p: { x: number; z: number }) => (axis === "x" ? p.z : p.x) - c0;

  // The line each door in a long wall is walked through, as a band along
  // the room, and which long wall the door is in.
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

  // The largest work on a long wall within reach of a place along it.
  const facing = (a: number, low: boolean) => {
    let best = 0;
    for (const p of room.placements) {
      if (p.divider !== undefined) continue;
      const pc = across({ x: p.position[0], z: p.position[2] });
      const onWall = low ? pc < 0.6 : pc > breadth - 0.6;
      const pa = along({ x: p.position[0], z: p.position[2] });
      if (onWall && Math.abs(pa - a) <= FACING_REACH) best = Math.max(best, p.widthM * p.heightM);
    }
    return best;
  };

  const rows = [...new Set(panels.map((d) => d.line * CELL_SIZE - c0))].sort((p, q) => p - q);
  const slots: Slot[] = [];
  for (const c of rows) {
    const low = c < breadth / 2;
    const spans = panels
      .filter((d) => Math.abs(d.line * CELL_SIZE - c0 - c) < 1e-6)
      .map((d) => [d.start * CELL_SIZE - a0, d.end * CELL_SIZE - a0] as const)
      .sort((p, q) => p[0] - q[0]);

    // In the row, between two of its panels.
    for (let i = 0; i + 1 < spans.length; i++) {
      const from = spans[i][1];
      const to = spans[i + 1][0];
      if (to - from < BENCH_LENGTH + 2 * ROW_END_CLEARANCE) continue;
      const a = (from + to) / 2;
      if (inDoorLine(a, low)) continue;
      slots.push({ a, c, score: facing(a, low) });
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
      slots.push({ a, c, score: facing(a, low) });
    }

    // In the aisle between the row and its wall, where that is wide.
    const face = low ? c - DIVIDER_THICKNESS / 2 : c + DIVIDER_THICKNESS / 2;
    const wall = low ? 0 : breadth;
    if (Math.abs(face - wall) < MIN_AISLE) continue;
    for (const [from, to] of spans) {
      const a = (from + to) / 2;
      if (inDoorLine(a, low)) continue;
      slots.push({ a, c: (face + wall) / 2, score: facing(a, low) });
    }
  }

  // The places in front of the largest works first; ties in plan order,
  // so the same room is seated the same way every time.
  const wanted = quota(length, breadth);
  const chosen = slots
    .map((slot, order) => ({ slot, order }))
    .sort((p, q) => q.slot.score - p.slot.score || p.order - q.order)
    .slice(0, wanted)
    .map(({ slot }) => slot);

  return chosen.map(
    ({ a, c }): Bench =>
      axis === "x" ? { x: a0 + a, z: c0 + c, along: "x" } : { x: c0 + c, z: a0 + a, along: "z" },
  );
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

/** True when a bench stands clear of every divider of its room by at
 *  least `clearance`. For tests. */
export function benchClearOfDividers(
  bench: Bench,
  room: Pick<RoomLayout, "dividers">,
  clearance: number,
): boolean {
  const r = benchRect(bench);
  return room.dividers.map(dividerRect).every((d) => {
    const dx = Math.max(0, r.xMin - d.xMax, d.xMin - r.xMax);
    const dz = Math.max(0, r.zMin - d.zMax, d.zMin - r.zMax);
    return Math.hypot(dx, dz) >= clearance;
  });
}
