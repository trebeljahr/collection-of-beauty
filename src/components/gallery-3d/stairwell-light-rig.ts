// Geometry for the stairwell's own lighting. The stairwell hangs no
// works, so it has no picture lights: its walls were the one evenly lit
// surface in the building, under the parquet underside of the slab
// above. It gets the galleries' two light sources in a form that fits a
// room with a hole in its ceiling:
//
//  - wall washers: a row of ceiling cans along each wall, throwing the
//    same pool a picture light does. With no frame to fit, the pools
//    overlap into a run of scallops and a band on the floor below;
//  - a glazed ring round the well in place of the galleries' laylight.
//    On the top floor, where no flight passes through the ceiling, the
//    ring closes into a full oculus.
//
// Pure maths, like painting-light-rig.ts. Wall rectangles are in a
// wall's own frame: x along the wall from its middle, y up from the
// floor, z out of the wall into the room. stairwell-light.tsx turns the
// result into one mesh for the whole room.

import { clearSpans, LIGHT_CEILING_DROP, LIGHT_PENUMBRA, type Rect2 } from "./painting-light-rig";

/** Aimed-for gap between cans. The count is fitted to the wall, and is
 *  always even so a door in the middle of a wall sits between two pools
 *  rather than under one. */
export const WASH_TARGET_SPACING = 3.75;
/** Fixture distance from the wall, metres. */
export const WASH_THROW = 1.9;
/** Height at which the beam's axis meets the wall. */
export const WASH_AIM_HEIGHT = 2.5;
/** Outer half-angle of the cone. */
export const WASH_OUTER_DEG = 33;

/** Glazed ring round the well: inner and outer radius, metres from the
 *  stair's axis. The inner edge clears the floor cutout above it; the
 *  outer one leaves the washers' cans a metre of plain ceiling. */
export const RING_INNER_R = 5.95;
export const RING_OUTER_R = 8.35;
/** Panes round the ring, and the radial depth of one row of them. */
export const RING_PANES = 32;
export const RING_ROW_M = 1.2;
/** Rows of panes in the ring, and in the oculus that closes the top
 *  floor (the same ring carried in to a round centre pane). */
export const RING_ROWS = Math.round((RING_OUTER_R - RING_INNER_R) / RING_ROW_M);
export const OCULUS_ROWS = 6;
export const OCULUS_HUB_R = RING_OUTER_R - OCULUS_ROWS * RING_ROW_M;

export type WashRow = {
  /** Cans along the wall, and the gap between them. */
  count: number;
  spacing: number;
  /** Height of the cans and their distance from the wall. */
  lampY: number;
  throwM: number;
  /** Beam axis in the wall's frame. Its x component is zero. */
  dirY: number;
  dirZ: number;
  cosOuter: number;
  cosInner: number;
  /** Scale that makes the illuminance at the aim point 1. */
  intensity: number;
  /** How high the pools reach on the wall. */
  wallTop: number;
  /** How far they reach across the floor. */
  floorReach: number;
};

const deg = Math.PI / 180;
const PAD = 0.05;

/** Fit a row of washers to a wall of `wallLength` under a ceiling at
 *  `ceilingY` (both measured from the floor). */
export function fitWashRow(wallLength: number, ceilingY: number): WashRow {
  const count = 2 * Math.max(1, Math.round(wallLength / (2 * WASH_TARGET_SPACING)));
  const lampY = ceilingY - LIGHT_CEILING_DROP;
  const drop = lampY - WASH_AIM_HEIGHT;
  const dist = Math.hypot(drop, WASH_THROW);
  const outer = WASH_OUTER_DEG * deg;
  // Angle of the beam off vertical, and of the cone's two rims in the
  // vertical plane through the can: those are the highest point the
  // pool reaches on the wall and the farthest it reaches on the floor.
  const tilt = Math.atan2(WASH_THROW, drop);
  const upper = tilt + outer;
  const lower = tilt - outer;
  return {
    count,
    spacing: wallLength / count,
    lampY,
    throwM: WASH_THROW,
    dirY: -drop / dist,
    dirZ: -WASH_THROW / dist,
    cosOuter: Math.cos(outer),
    cosInner: Math.cos(outer * (1 - LIGHT_PENUMBRA)),
    // I·cosθ/d² = 1 at the aim point, as for a picture light.
    intensity: (dist * dist) / (WASH_THROW / dist),
    wallTop:
      upper >= Math.PI / 2
        ? ceilingY
        : Math.min(ceilingY, lampY - WASH_THROW / Math.tan(upper) + PAD),
    floorReach: Math.max(0, WASH_THROW - lampY * Math.tan(lower)) + PAD,
  };
}

/** Where the cans sit along the wall. */
export function washLampXs(row: WashRow): number[] {
  return Array.from({ length: row.count }, (_, k) => (k + 0.5 - row.count / 2) * row.spacing);
}

export type WashDoor = { center: number; width: number; height: number };

/** The lit part of a wall: every clear stretch up to the pools' top,
 *  and the lintel over each door. A doorway itself is left out, or the
 *  pool would brighten the room seen through it. */
export function washWallRects(row: WashRow, wallLength: number, doors: WashDoor[]): Rect2[] {
  const half = wallLength / 2;
  const openings = doors.map((d): [number, number] => [
    Math.max(-half, d.center - d.width / 2),
    Math.min(half, d.center + d.width / 2),
  ]);
  const rects: Rect2[] = clearSpans([-half, half], openings).map(([xMin, xMax]) => ({
    xMin,
    xMax,
    yMin: 0,
    yMax: row.wallTop,
  }));
  doors.forEach((d, i) => {
    const [xMin, xMax] = openings[i];
    if (d.height < row.wallTop && xMax - xMin > 0.01) {
      rects.push({ xMin, xMax, yMin: d.height, yMax: row.wallTop });
    }
  });
  return rects;
}
