// Shared "rail vocabulary" — geometric constants that have to match
// across the spiral rail (staircase.tsx), the cutout-edge rail and
// the dead-end L-bridge (stairwell-rail.tsx), and the player's
// collision constraints (player.tsx). They were duplicated in three
// places with hand-kept "match X exactly" comments — easy for a tweak
// here to drift out of sync there. One source of truth instead.

/** Top of the rail above the floor — also the player's grip height. */
export const RAIL_HEIGHT = 1.05;

/** Vertical thickness of the rail bar. */
export const RAIL_BAR_HEIGHT = 0.1;

/** Radial half-width of the rail bar — gives the rail real volume in
 *  every direction, so it stops reading as a paper strip and starts
 *  reading as a hand rail you could grip. */
export const RAIL_BAR_HALF_WIDTH = 0.05;

/** Square cross-section of each baluster (post supporting the rail). */
export const BALUSTER_SIZE = 0.07;

/** Vertical span of a baluster, measured between its top and bottom.
 *  Stops short of the rail's top by exactly RAIL_BAR_HEIGHT so the
 *  baluster's top sits flush with the rail's bottom face — without
 *  this, the baluster's top 5 cm lives INSIDE the rail tube and shows
 *  as a thin black bar punching through the brass on every camera
 *  angle that catches the rail in cross-section. */
export const BALUSTER_HEIGHT = RAIL_HEIGHT - RAIL_BAR_HEIGHT;
