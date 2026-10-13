// The frame a room's fittings are planned in.
//
// A room is a rectangle of 2.5 m cells with doors in its walls. Dividers
// and benches are set out along one of its axes: `a` runs along that
// axis and `c` across it, both measured in cells from the room's low
// corner. An end door is in a wall the axis runs into, so it looks down
// the room; a side door looks across it.

import type { CellRect, Divider, Door } from "./types";
import { CELL_SIZE } from "./world-coords";

export const EPS = 1e-6;

/** Cells in 17.5 m: the length from which a room is divided. */
export const DIVIDED_MIN_CELLS = 7;
/** A long room is at least this many times longer than wide. */
const GALLERY_MIN_ASPECT = 1.4;

export type RoomKind = "hall" | "gallery" | "room";

export function cellsX(rect: CellRect): number {
  return rect.xMax - rect.xMin + 1;
}
export function cellsZ(rect: CellRect): number {
  return rect.zMax - rect.zMin + 1;
}

export function roomKind(rect: CellRect): RoomKind {
  const long = Math.max(cellsX(rect), cellsZ(rect));
  const short = Math.min(cellsX(rect), cellsZ(rect));
  if (short >= DIVIDED_MIN_CELLS) return "hall";
  if (long >= DIVIDED_MIN_CELLS && long >= GALLERY_MIN_ASPECT * short) return "gallery";
  return "room";
}

/** What the planners need to know about a door. */
export type PlanDoor = Pick<Door, "side" | "worldX" | "worldZ" | "width">;

export type Frame = {
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
 *  door looks across it at position `a`. `low` is the wall on the
 *  frame's low side: `a = 0` for an end door, `c = 0` for a side door. */
export type FrameDoor = { wall: "end" | "side"; low: boolean; pos: number; width: number };

export function frameFor(rect: CellRect, axis: "x" | "z"): Frame {
  return axis === "x"
    ? { axis, length: cellsX(rect), breadth: cellsZ(rect), a0: rect.xMin, c0: rect.zMin }
    : { axis, length: cellsZ(rect), breadth: cellsX(rect), a0: rect.zMin, c0: rect.xMin };
}

/** The room's long axis; a square room runs east–west. */
export function longAxis(rect: CellRect): "x" | "z" {
  return cellsZ(rect) > cellsX(rect) ? "z" : "x";
}

export function frameDoor(frame: Frame, d: PlanDoor): FrameDoor {
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
    low: d.side === "north" || d.side === "west",
    pos: world / CELL_SIZE - (inEndWall ? frame.c0 : frame.a0),
    width: d.width,
  };
}

export function frameDoors(frame: Frame, doors: readonly PlanDoor[]): FrameDoor[] {
  return doors.map((d) => frameDoor(frame, d));
}

/** A wall along the frame's axis on cross line `line`, as a divider. */
export function alongDivider(frame: Frame, line: number, start: number, end: number): Divider {
  return { axis: frame.axis, line: frame.c0 + line, start: frame.a0 + start, end: frame.a0 + end };
}

/** A wall across the frame's axis on line `line` along it. */
export function crossDivider(frame: Frame, line: number, start: number, end: number): Divider {
  return {
    axis: frame.axis === "x" ? "z" : "x",
    line: frame.a0 + line,
    start: frame.c0 + start,
    end: frame.c0 + end,
  };
}

/** Cross position of a room's axis, in cells: where its end doors
 *  stand, or the middle when it has none. */
export function hallAxis(frame: Frame, doors: readonly FrameDoor[]): number {
  const endDoors = doors.filter((d) => d.wall === "end");
  if (endDoors.length === 0) return frame.breadth / 2;
  return endDoors.reduce((sum, d) => sum + d.pos, 0) / endDoors.length;
}
