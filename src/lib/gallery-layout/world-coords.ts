// Grid → world coordinate conversion for the dungeon gallery.
//
// A cell is a square on the generator grid; in world space it is
// CELL_SIZE metres on a side. Floors stack vertically separated by
// FLOOR_SEPARATION metres; the spiral staircase rises one full
// revolution over that span, so the gap also sets the stair pitch.

export const CELL_SIZE = 2.5; // metres per cell on the XZ plane
export const ROOM_HEIGHT = 6.2; // interior ceiling plane of a room
export const CORRIDOR_HEIGHT = 3.4; // lower interior ceiling in hallways
export const FLOOR_SEPARATION = 9; // metres between floor surfaces
export const WALL_THICKNESS = 0.1;

// Door openings. 2.0 m wide leaves ≥ 0.25 m of wall on each side of a
// CELL_SIZE-wide cell so doorframes look architectural, not just a hole.
export const DOOR_WIDTH = 2.0;
export const DOOR_HEIGHT = 2.8;
export const CORRIDOR_DOOR_HEIGHT = 2.6; // slightly lower on hallway side

// ── Central open-well spiral staircase ───────────────────────────────
// One full revolution per storey. The inner radius is generous so the
// well in the middle is genuinely open — the player can lean over the
// inner railing and see all the way down. The outer radius leaves
// breathing room in the stairwell room so the space doesn't read as
// cramped.
export const SPIRAL_INNER_RADIUS = 2.6; // inner edge of treads
export const SPIRAL_OUTER_RADIUS = 5.4; // outer edge of treads
export const SPIRAL_STEPS_PER_FLOOR = 22; // ~16° per step
/** Radius of the stone spine running through the centre of the spiral.
 *  Sized well inside SPIRAL_INNER_RADIUS so it never intrudes on the
 *  walking annulus, but visible from the well — gives the helix a
 *  shared masonry anchor instead of looking free-floating. Player
 *  collision uses this + PLAYER_RADIUS as a hard stop on the ground
 *  floor, where the well is otherwise unfenced. */
export const SPIRAL_COLUMN_RADIUS = 0.7;
/** Visible floor slab thickness. The walking surface (a UV-scaled
 *  plane) stays at `floorY`; an extra slab mesh sits 1 mm under it
 *  so floors stop reading as paper-thin sheets when seen from below
 *  (open well) or in cross-section at the cutout edges. */
export const FLOOR_THICKNESS = 0.35;
/** Height of a structural wall — from a floor surface up to the
 *  underside of the slab on the floor above. Walls always span this
 *  full height so the building reads as continuous masonry across
 *  the open spiral well; the visible interior ceiling plane (at
 *  ROOM_HEIGHT or CORRIDOR_HEIGHT) hides the plenum above it from
 *  inside the room, so rooms still feel architecturally sized rather
 *  than cavernous. */
export const INTER_FLOOR_HEIGHT = FLOOR_SEPARATION - FLOOR_THICKNESS;
/** Stairwell room footprint in cells. Must be odd so it centres cleanly. */
export const SPIRAL_ROOM_CELLS = 9;
/** Radius the floor cutout uses around the spiral. Sits just outside
 *  the outermost tread so the stair fits cleanly with no z-fight at
 *  the boundary, but the gap is small enough that the player's bbox
 *  always straddles either the floor or the spiral — no walking over
 *  empty no-man's-land. */
export const SPIRAL_FLOOR_CUTOUT_RADIUS = SPIRAL_OUTER_RADIUS + 0.04;

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
