// Grid → world coordinate conversion for the dungeon gallery.
//
// A cell is a square on the generator grid; in world space it is
// CELL_SIZE metres on a side. Floors stack vertically separated by
// FLOOR_SEPARATION metres (room height + a slab + breathing room so
// the staircase ramp has a sensible incline).

export const CELL_SIZE = 2.5;          // metres per cell on the XZ plane
export const ROOM_HEIGHT = 6.2;        // interior ceiling of a room
export const CORRIDOR_HEIGHT = 3.4;    // lower ceiling in hallways
export const FLOOR_SEPARATION = 9;     // metres between floor surfaces
export const WALL_THICKNESS = 0.1;

// Door openings. 2.0 m wide leaves ≥ 0.25 m of wall on each side of a
// CELL_SIZE-wide cell so doorframes look architectural, not just a hole.
export const DOOR_WIDTH = 2.0;
export const DOOR_HEIGHT = 2.8;
export const CORRIDOR_DOOR_HEIGHT = 2.6; // slightly lower on hallway side

// ── Central spiral staircase ─────────────────────────────────────────
// The stairwell is a single tower centred on every floor. One
// revolution per floor — so walking once all the way around the
// central column ascends you exactly one level.
export const SPIRAL_INNER_RADIUS = 1.0;    // central stone column
export const SPIRAL_OUTER_RADIUS = 5.0;    // outer walk surface
export const SPIRAL_STEPS_PER_FLOOR = 20;  // 18° per step
/** Stair room footprint in cells. Must be odd so it centres cleanly. */
export const SPIRAL_ROOM_CELLS = 7;

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

export function worldToCell(
  x: number,
  z: number,
): { x: number; z: number } {
  return {
    x: Math.floor(x / CELL_SIZE),
    z: Math.floor(z / CELL_SIZE),
  };
}

/** Width of a cell-aligned rectangle from xMin..xMax (inclusive ends). */
export function rectWidth(xMin: number, xMax: number): number {
  return (xMax - xMin + 1) * CELL_SIZE;
}
