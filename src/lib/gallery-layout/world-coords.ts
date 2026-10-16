// Grid → world coordinate conversion for the 3D museum gallery.
//
// A cell is a square on the layout grid; in world space it is
// CELL_SIZE metres on a side. Floors stack vertically separated by
// FLOOR_SEPARATION metres; the spiral staircase rises one full
// revolution over that span, so the gap also sets the stair pitch.

export const CELL_SIZE = 2.5; // metres per cell on the XZ plane
// Interior ceiling plane of a room. A room carries its own height
// (`RoomLayout.ceilingHeight`, set in fittings.ts): cabinets are low,
// halls are tall, everything else and the stairwell use ROOM_HEIGHT.
// The tallest still clears the slab above (INTER_FLOOR_HEIGHT, 8.2 m).
// Raised by 0.3 to 0.6 m on 12 October 2026: the rooms felt low, and a
// 3.2 m canvas hung 0.4 m off the floor in its frame reaches 3.94 m,
// which left no wall for the picture light under 4.2 m. Raised again by
// 0.6 to 0.9 m on 17 October 2026, with the storey (below).
export const ROOM_HEIGHT = 5.6;
export const ROOM_HEIGHT_LOW = 4.6;
export const ROOM_HEIGHT_TALL = 6.6;
export const CORRIDOR_HEIGHT = 3.12; // lower interior ceiling in hallways
// Metres between floor surfaces. The spiral staircase climbs a full
// revolution per storey, so this also sets the rise per tread (0.233 m
// at 36 steps). It caps every ceiling above. It was 6.12 m until
// 17 October 2026, when the stair halls lost their sheer walls and every
// work had to hang on one storey: the tallest, the Triumph of Frederick
// Henry, is 7.49 m in its frame (`STOREY_FRAME_ROOM` in giants.ts).
export const FLOOR_SEPARATION = 8.4;
export const WALL_THICKNESS = 0.1;

// Door openings. 1.4 m wide leaves ≥ 0.55 m of wall on each side of a
// CELL_SIZE-wide cell so doorframes look architectural, not just a hole.
// 2.4 m tall is a normal human-scale door — kept compact against the
// taller ceiling so paintings and doors still set the room scale
// rather than the ceiling dominating.
export const DOOR_WIDTH = 1.4;
export const DOOR_HEIGHT = 2.4;
// Portals: the openings on a room sequence's main axis. A door centre
// sits mid-cell, so 3.5 m reaches half a metre into the cells either
// side; collision opens all three cell edges and closes the jambs with
// colliders of their own (see `doorOpenHalfSpan`). 3.0 m tall leaves a
// lintel under the lowest ceiling (ROOM_HEIGHT_LOW).
export const PORTAL_WIDTH = 3.5;
export const PORTAL_HEIGHT = 3.0;
// Width of the casing round an opening, on the wall either side of it
// (wall.tsx draws it). A portal's is wider, to read as cut through
// masonry. The hang measures a work's clearance from its outer edge.
export const DOOR_TRIM = 0.06;
export const PORTAL_TRIM = 0.14;
// Freestanding divider walls are real boxes, seen end-on, where every
// other wall is a zero-thickness plane between two rooms.
export const DIVIDER_THICKNESS = 0.4;

// ── Central open-well spiral staircase ───────────────────────────────
// One full revolution per storey. The inner radius is generous so the
// well in the middle is genuinely open — the player can lean over the
// inner railing and see all the way down. The outer radius leaves
// breathing room in the stairwell room so the space doesn't read as
// cramped.
export const SPIRAL_INNER_RADIUS = 2.6; // inner edge of treads
export const SPIRAL_OUTER_RADIUS = 5.4; // outer edge of treads
export const SPIRAL_STEPS_PER_FLOOR = 36; // 10° per step (rise ≈ 0.23 m)
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
export const FLOOR_THICKNESS = 0.2;
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

/**
 * Half the stretch of wall whose cell edges a door opens, metres either
 * side of the door's centre. Collision is per cell edge, and a door
 * centre sits mid-cell: a 1.4 m door opens its own edge (1.25 m either
 * side), a 3.5 m portal reaches into both neighbours and opens three
 * (3.75 m). Whatever lies between the opening and the end of that span
 * is solid jamb.
 */
export function doorOpenHalfSpan(width: number): number {
  const extraCells = Math.max(0, Math.ceil((width / 2 - CELL_SIZE / 2) / CELL_SIZE - 1e-6));
  return CELL_SIZE / 2 + extraCells * CELL_SIZE;
}

export function floorY(floorIndex: number): number {
  return floorIndex * FLOOR_SEPARATION;
}

/** Inverse of the cell→world mapping: which grid cell contains this
 *  world point. `player.tsx` inlines this pair twice (active-room
 *  detection and the walkable-corner check) — both should call here so
 *  a change to the grid origin lands in one place. */
export function worldToCell(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.floor(x / CELL_SIZE),
    z: Math.floor(z / CELL_SIZE),
  };
}

/** True when this floor's stairwell slab is punched open around the
 *  spiral so the flights below stay visible. The ground floor is the
 *  exception — its helix rises out of solid slab, which is why it is
 *  the only floor with real walkable space underneath the treads.
 *  Rendering (`StairwellFloor`), the collider set and the player's
 *  entry rule all key off this one predicate; they used to spell it
 *  `index > 0` in three places. */
export function hasStairwellCutout(floorIndex: number): boolean {
  return floorIndex > 0;
}
