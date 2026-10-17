// Grid → world coordinate conversion for the 3D museum gallery.
//
// A cell is a square on the layout grid; in world space it is
// CELL_SIZE metres on a side. Floors stack vertically separated by
// FLOOR_SEPARATION metres; the spiral staircase rises one full
// revolution over that span, so the gap also sets the stair pitch.

export const CELL_SIZE = 2.5; // metres per cell on the XZ plane
// Interior ceiling plane of a room. A room carries its own height
// (`RoomLayout.ceilingHeight`, set in fittings.ts): cabinets are low,
// halls are tall, other galleries use ROOM_HEIGHT. Stair halls follow
// the structural storey height.
// The tallest still clears the slab above (INTER_FLOOR_HEIGHT, 8.5 m).
// Raised by 0.3 to 0.6 m on 12 October 2026: the rooms felt low, and a
// 3.2 m canvas hung 0.4 m off the floor in its frame reaches 3.94 m,
// which left no wall for the picture light under 4.2 m. Raised again by
// 0.6 to 0.9 m on 17 October 2026, with the storey (below). Another
// 0.3 m gives the tallest court painting breathing room under its cornice.
export const ROOM_HEIGHT = 5.9;
export const ROOM_HEIGHT_LOW = 4.9;
export const ROOM_HEIGHT_TALL = 6.9;
// Metres between floor surfaces. The spiral staircase climbs a full
// revolution per storey, so this also sets the rise per tread (0.242 m
// at 36 steps). It caps every ceiling above. It was 6.12 m until
// 17 October 2026, when the stair halls lost their sheer walls and every
// work had to hang on one storey: the tallest, the Triumph of Frederick
// Henry, is 7.49 m in its frame (`STOREY_FRAME_ROOM` in giants.ts).
export const FLOOR_SEPARATION = 8.7;
export const WALL_THICKNESS = 0.1;

// A narrow door, 1.4 m wide: ≥ 0.55 m of wall on each side of a
// CELL_SIZE-wide cell. The plan's doors are wider (`BLOCK_DOOR_WIDTH`);
// the fitting rules in fittings.ts and divider-plans.ts take either, and
// their tests use this one.
export const DOOR_WIDTH = 1.4;
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
/** Risers in one storey's flight (rise ≈ 0.24 m). The flight has one
 *  tread fewer: its first and last riser step onto a landing. */
export const SPIRAL_STEPS_PER_FLOOR = 36;
/** Arc of the landing on every floor, centred on the gate. The flight
 *  that arrives takes its second half and the flight that leaves its
 *  first, both level with the floor. Rico, 17 October 2026: the helix
 *  ran on through each floor with one tread at its height, and the
 *  treads that came up under the slab left a slit between them and its
 *  edge that closed to a crack at the floor. He asked for a level
 *  platform on every floor that the flights above and below both reach.
 *  45° leaves the 35 treads 9° each, 0.63 m on the 4 m walking line. */
export const SPIRAL_LANDING_ARC = Math.PI / 4;
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
/** Radius of the floor cutout round the spiral: the treads' outer edge.
 *  The floor meets the treads and the top landing with no gap. Until
 *  17 October 2026 the hole was 4 cm wider, and that ring showed the
 *  dark below it as a black line round every tread at floor level. The
 *  hole is cut as the polygon the treads are drawn as (`spiralHole` in
 *  `stair-opening.ts`), so the two edges lie on one line and nothing
 *  that stands at floor level overlaps the floor to z-fight. */
export const SPIRAL_FLOOR_CUTOUT_RADIUS = SPIRAL_OUTER_RADIUS;
/** Vertices of the treads' outer edge in one revolution: one every
 *  2.25°, 4 to a 9° tread and 10 to each half of the landing. The
 *  floor's hole is cut at the same angles. */
export const SPIRAL_EDGE_SEGMENTS = 160;

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
