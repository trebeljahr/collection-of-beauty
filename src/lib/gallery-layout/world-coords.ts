// Grid → world coordinate conversion for the dungeon gallery.
//
// A cell is a square on the generator grid; in world space it is
// CELL_SIZE metres on a side. Floors stack vertically separated by
// FLOOR_SEPARATION metres (room height + a slab + breathing room so
// the staircase ramp has a sensible incline).

export const CELL_SIZE = 2.5; // metres per cell on the XZ plane
export const ROOM_HEIGHT = 6.2; // interior ceiling of a room
export const CORRIDOR_HEIGHT = 3.4; // lower ceiling in hallways
export const FLOOR_SEPARATION = 9; // metres between floor surfaces
export const WALL_THICKNESS = 0.1;

// Door openings. 2.0 m wide leaves ≥ 0.25 m of wall on each side of a
// CELL_SIZE-wide cell so doorframes look architectural, not just a hole.
export const DOOR_WIDTH = 2.0;
export const DOOR_HEIGHT = 2.8;
export const CORRIDOR_DOOR_HEIGHT = 2.6; // slightly lower on hallway side

// ── Central switchback (U) staircase ─────────────────────────────────
// The stairwell is a single shaft centred on every floor. Two flights
// run side-by-side along the depth axis with a flat landing at the
// far end — both flights share the landing, so walking up = take the
// "ascending" flight, hit the landing, take the "descending" flight
// up to the next floor; walking down = the same path in reverse. Both
// the lower-floor entry and the upper-floor exit sit on the SAME face
// of the footprint at their respective Ys, so a player coming in from
// either floor's stairwell door meets the stair flush with the floor.
export const STAIR_WIDTH = 6; // total width (3 m per flight)
export const STAIR_DEPTH = 8; // flight length + landing depth
export const STAIR_LANDING_DEPTH = 1; // metres of flat landing at far end
export const STAIR_FLIGHT_LENGTH = STAIR_DEPTH - STAIR_LANDING_DEPTH;
/** Visible step count per flight. The physics ramp is continuous — these
 *  are decorative risers stacked on top of the ramp surface so the
 *  flight reads as stairs rather than a smooth incline. */
export const STAIR_STEPS_PER_FLIGHT = 10;
/** Stair room footprint in cells. Must be odd so it centres cleanly. */
export const STAIR_ROOM_CELLS = 7;
// Re-export the old name so existing imports (sized stairwell room in
// layout-museum, layout-dungeon) keep working.
export const SPIRAL_ROOM_CELLS = STAIR_ROOM_CELLS;

export function floorY(floorIndex: number): number {
  return floorIndex * FLOOR_SEPARATION;
}

export function cellCenterToWorld(
  cell: { x: number; z: number },
  floorIndex: number,
): { x: number; y: number; z: number } {
  return {
    x: (cell.x + 0.5) * CELL_SIZE,
    y: floorY(floorIndex),
    z: (cell.z + 0.5) * CELL_SIZE,
  };
}

export function cellOriginToWorld(
  cell: { x: number; z: number },
  floorIndex: number,
): { x: number; y: number; z: number } {
  return {
    x: cell.x * CELL_SIZE,
    y: floorY(floorIndex),
    z: cell.z * CELL_SIZE,
  };
}

export function worldToCell(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.floor(x / CELL_SIZE),
    z: Math.floor(z / CELL_SIZE),
  };
}

/** Width of a cell-aligned rectangle from xMin..xMax (inclusive ends). */
export function rectWidth(xMin: number, xMax: number): number {
  return (xMax - xMin + 1) * CELL_SIZE;
}
