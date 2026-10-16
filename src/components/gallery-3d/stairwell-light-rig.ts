// Geometry for the stairwell's own lighting. The stairwell hangs no
// works, so it has no picture lights: its walls were the one evenly lit
// surface in the building, under the parquet underside of the slab
// above. It gets the galleries' two light sources in a form that fits a
// room with a hole in its ceiling:
//
//  - wall washers: a row of ceiling cans along each wall, throwing the
//    same pool a picture light does. With no frame to fit, the pools
//    overlap into a run of scallops and a band on the floor below. A
//    hall that hangs giants is lit the same way, a row to each stretch
//    of wall, set out about the work that hangs there (`washStretches`);
//  - a glazed ring round the well in place of the galleries' laylight.
//    On the top floor, where no flight passes through the ceiling, the
//    ring closes into a full oculus.
//
// Pure maths, like painting-light-rig.ts. Wall rectangles are in a
// wall's own frame: x along the wall from its middle, y up from the
// floor, z out of the wall into the room. stairwell-light.tsx turns the
// result into one mesh for the whole room.

import { clearSpans, LIGHT_CEILING_DROP, LIGHT_PENUMBRA, type Rect2 } from "./painting-light-rig";

/** Aimed-for gap between cans. The count is fitted to the wall. A whole
 *  wall's is even, so a door in its middle sits between two pools rather
 *  than under one. */
export const WASH_TARGET_SPACING = 3.75;
/** How far from a corner the end can of a row stands, on both walls of
 *  the corner. Until 17 October 2026 each row was set out from its own
 *  length: at a stair hall's corner one wall's end can stood 1.5 m from
 *  it and the other's 2.5 m, and the near can's pool was cut down the
 *  corner line beside a dim wall. Rico: it "looks broken". At this
 *  distance the upper half of a pool ends short of the corner, and what
 *  reaches it is the same on both walls. */
export const WASH_CORNER_GAP = 2.25;
/** Fixture distance from the wall, metres. */
export const WASH_THROW = 1.9;
/** Height at which the beam's axis meets the wall. */
export const WASH_AIM_HEIGHT = 2.5;
/** Outer half-angle of the cone. */
export const WASH_OUTER_DEG = 33;
/** The most light a can may put on the wall, on the line under it, where
 *  the aim point gets 1. The top of a pool is nearer its can than the
 *  aim point is, and brighter by the square of that. Under the 5.9 m
 *  ceiling the stairwell had until 17 October 2026 it peaked at 3.46.
 *  When the storey grew to 8.4 m the cans rose with the ceiling and the
 *  peak went to 7.5: the scallops clipped on a pale wall, and the wall
 *  took nearly twice the light. A row whose peak would pass this is
 *  dimmed until it does not, so a ceiling of 5.9 m or less is lit as
 *  before. */
export const WASH_PEAK = 3.5;

/** Panes round the dome, and the depth of one row of them on its
 *  curve. */
export const DOME_PANES = 32;
export const DOME_ROW_M = 1.2;
/** Radius of the round pane at the dome's crown. */
export const DOME_HUB_R = 1.15;

/** Plain ceiling kept between a washer's can and the glass. */
export const GLAZING_CAN_CLEAR = 1.0;

/**
 * Rim of the dome over a stair room `width` by `depth`: a metre of plain
 * ceiling short of the washers' cans, which hang 1.9 m out from every
 * wall. Rico, 17 October 2026: no light hangs on the glass.
 */
export function glazingOuterR(width: number, depth: number): number {
  return Math.min(width, depth) / 2 - WASH_THROW - GLAZING_CAN_CLEAR;
}

/** How high the dome that closes the top floor rises over its rim, as a
 *  share of the rim's radius. */
export const DOME_RISE = 0.75;

/** The dome over a rim of radius `rimR`: a spherical cap, `rise` high,
 *  whose height over the rim at a distance `r` from the axis is
 *  `heightAt(r)`. `rows` rows of panes run from the hub to the rim,
 *  each about DOME_ROW_M long on the curve. */
export function dome(rimR: number): {
  rise: number;
  rows: number;
  heightAt: (r: number) => number;
  /** Distance from the axis and height over the rim of the row edge
   *  `j` of `rows` (0 at the hub, `rows` at the rim). */
  rowEdge: (j: number) => { r: number; y: number };
} {
  const rise = rimR * DOME_RISE;
  const sphere = (rimR * rimR + rise * rise) / (2 * rise);
  const centreY = rise - sphere;
  const hubAngle = Math.asin(DOME_HUB_R / sphere);
  const rimAngle = Math.asin(rimR / sphere);
  const rows = Math.max(3, Math.round((sphere * (rimAngle - hubAngle)) / DOME_ROW_M));
  return {
    rise,
    rows,
    heightAt: (r) => centreY + Math.sqrt(Math.max(0, sphere * sphere - r * r)),
    rowEdge: (j) => {
      const a = hubAngle + ((rimAngle - hubAngle) * j) / rows;
      return { r: sphere * Math.sin(a), y: centreY + sphere * Math.cos(a) };
    },
  };
}

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
 *  `ceilingY` (both measured from the floor): an even count, half a gap
 *  in from each end. A row between two doors is set out this way. */
export function fitWashRow(wallLength: number, ceilingY: number): WashRow {
  const count = 2 * Math.max(1, Math.round(wallLength / (2 * WASH_TARGET_SPACING)));
  return washRow(count, wallLength / count, ceilingY);
}

/**
 * A row whose end cans stand `halfSpan` either side of its middle, with
 * the count whose gap comes nearest WASH_TARGET_SPACING (an even count
 * when `even`). Under a metre of span it is one can on the middle.
 *
 * A row that ends at a corner is set out from it: its end can stands
 * WASH_CORNER_GAP inside, so the two walls of a corner match.
 */
export function spanWashRow(halfSpan: number, ceilingY: number, even = false): WashRow {
  const span = 2 * halfSpan;
  if (span < 1) return washRow(1, WASH_TARGET_SPACING, ceilingY);
  let best = 0;
  let bestMiss = Number.POSITIVE_INFINITY;
  for (let gaps = 1; gaps <= Math.ceil(span / WASH_TARGET_SPACING) + 1; gaps++) {
    if (even && gaps % 2 === 0) continue;
    const miss = Math.abs(Math.log(span / gaps / WASH_TARGET_SPACING));
    if (miss < bestMiss) {
      best = gaps;
      bestMiss = miss;
    }
  }
  return washRow(best + 1, span / best, ceilingY);
}

function washRow(count: number, spacing: number, ceilingY: number): WashRow {
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
  const wallTop =
    upper >= Math.PI / 2
      ? ceilingY
      : Math.min(ceilingY, lampY - WASH_THROW / Math.tan(upper) + PAD);
  const cosOuter = Math.cos(outer);
  const cosInner = Math.cos(outer * (1 - LIGHT_PENUMBRA));
  // I·cosθ/d² = 1 at the aim point, as for a picture light, then less
  // where the top of the pool would pass WASH_PEAK.
  const aimed = (dist * dist) / (WASH_THROW / dist);
  const peak = washPeak(lampY, wallTop, -drop / dist, -WASH_THROW / dist, cosOuter, cosInner);
  return {
    count,
    spacing,
    lampY,
    throwM: WASH_THROW,
    dirY: -drop / dist,
    dirZ: -WASH_THROW / dist,
    cosOuter,
    cosInner,
    intensity: aimed * Math.min(1, WASH_PEAK / (aimed * peak)),
    wallTop,
    floorReach: Math.max(0, WASH_THROW - lampY * Math.tan(lower)) + PAD,
  };
}

/** The most light a can of unit intensity puts on the wall, on the line
 *  under it, between the floor and `wallTop`. The shader's smoothstep
 *  for the cone's edge, sampled every 5 cm. */
function washPeak(
  lampY: number,
  wallTop: number,
  dirY: number,
  dirZ: number,
  cosOuter: number,
  cosInner: number,
): number {
  let peak = 0;
  for (let y = 0; y <= wallTop; y += 0.05) {
    const up = lampY - y;
    const d2 = up * up + WASH_THROW * WASH_THROW;
    const d = Math.sqrt(d2);
    const t = Math.min(
      1,
      Math.max(0, (-(up * dirY + WASH_THROW * dirZ) / d - cosOuter) / (cosInner - cosOuter)),
    );
    peak = Math.max(peak, ((WASH_THROW / d) * t * t * (3 - 2 * t)) / d2);
  }
  return peak;
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

/** A stretch shorter than this takes no row: its two cans would hang a
 *  few decimetres apart. */
export const WASH_MIN_STRETCH = 1.5;
/** How far along the wall a can's cone reaches at its widest, at the
 *  wall's foot. `stairwell-light-rig.test.ts` holds the cone to it. */
export const WASH_SIDE_REACH = 3.75;
/** The end can of a row stands at least this far inside its stretch. */
const WASH_END_CLEAR = 0.6;

/** A stretch of a hall's wall and the row that lights it. `center` is
 *  where the row's middle stands along the wall. The rectangles and the
 *  floor's two ends are measured from there, as the cans are. */
export type WashStretch = {
  center: number;
  row: WashRow;
  rects: Rect2[];
  floor: [number, number];
};

/**
 * A hall's wall as its stretches between doors and corners, each with a
 * row of washers of its own.
 *
 * A hall hangs one giant in the middle of each stretch (`giants.ts`).
 * One row fitted to the whole wall, as a stairwell has, stands by its
 * own count: on the court's 27.5 m wall, with a portal in the middle, a
 * can hung 0.84 m to one side of each work's centre, and the work sat
 * under a scallop and a half. A row to a stretch is even about the
 * stretch's middle, and about the one work the stretch holds where that
 * is a little off it (`works`, along the wall).
 *
 * A stretch also lights the half of each door's lintel next to it, and
 * the floor in front of that half. In a stretch too short for that (the
 * shader would leave out a can that reaches there) it lights itself
 * only.
 */
export function washStretches(
  wallLength: number,
  doors: WashDoor[],
  ceilingY: number,
  works: number[] = [],
): WashStretch[] {
  const half = wallLength / 2;
  const openings = doors.map((d): [number, number] => [
    Math.max(-half, d.center - d.width / 2),
    Math.min(half, d.center + d.width / 2),
  ]);
  const out: WashStretch[] = [];
  for (const [a, b] of clearSpans([-half, half], openings)) {
    if (b - a < WASH_MIN_STRETCH) continue;
    const mid = (a + b) / 2;
    const cornerA = Math.abs(a + half) < 1e-6;
    const cornerB = Math.abs(b - half) < 1e-6;
    // A row that meets a corner is set out from it (WASH_CORNER_GAP); one
    // between two doors from its own length, half a gap in from each.
    const corners = [cornerA ? a : null, cornerB ? b : null].filter((e) => e !== null);
    const rowAbout = (c: number) =>
      corners.length > 0
        ? spanWashRow(Math.min(...corners.map((e) => Math.abs(e - c))) - WASH_CORNER_GAP, ceilingY)
        : fitWashRow(b - a, ceilingY);
    // A fragment adds its own can and one each side. Past the row's end
    // the nearest can it leaves out is a gap and a half away.
    const wideRow = (r: WashRow) => 1.5 * r.spacing >= WASH_SIDE_REACH;
    let center = mid;
    let row = rowAbout(mid);
    // About the one work the stretch holds, where that takes as many cans
    // and its end cans still stand inside the stretch. Between two corners the row stays on the
    // middle, or one corner would get a can nearer than the other.
    const held = works.filter((x) => x > a && x < b);
    if (held.length === 1 && corners.length < 2 && wideRow(row)) {
      const shifted = rowAbout(held[0]);
      const halfSpan = ((shifted.count - 1) * shifted.spacing) / 2;
      if (
        shifted.count === row.count &&
        held[0] - halfSpan >= a + WASH_END_CLEAR &&
        held[0] + halfSpan <= b - WASH_END_CLEAR
      ) {
        center = held[0];
        row = shifted;
      }
    }
    const wide = wideRow(row);
    const rects: Rect2[] = [{ xMin: a - center, xMax: b - center, yMin: 0, yMax: row.wallTop }];
    let lo = a;
    let hi = b;
    if (wide) {
      doors.forEach((d, i) => {
        const [o0, o1] = openings[i];
        const m = (o0 + o1) / 2;
        const lintel = d.height < row.wallTop;
        if (Math.abs(o1 - a) < 1e-6) {
          lo = m;
          if (lintel) {
            rects.push({ xMin: m - center, xMax: a - center, yMin: d.height, yMax: row.wallTop });
          }
        }
        if (Math.abs(o0 - b) < 1e-6) {
          hi = m;
          if (lintel) {
            rects.push({ xMin: b - center, xMax: m - center, yMin: d.height, yMax: row.wallTop });
          }
        }
      });
    }
    out.push({ center, row, rects, floor: [lo - center, hi - center] });
  }
  return out;
}

// ── Through the door ──────────────────────────────────────────────────
// A row's band of light on the floor used to fade to nothing at each
// doorway (`THRESHOLD_FADE_M`), so the floor of the next room met it at
// one brightness. The band runs 3.9 m out from the wall of a hall, with
// the cans 7.9 m up, and from the next room it still read as a line:
// dark parquet to the threshold, and the hall's lit one rising within a
// metre and a half past it. Now the band falls to a share at the
// threshold over a longer reach and that share goes on through the door
// onto the next room's floor, dying away there. The step from one room's
// light to the other's is spread over both floors.

/** What is left of the band on a threshold. The rest of it is on either
 *  side: the band rises to full on this side, the share dies away on
 *  the other. */
export const WASH_DOOR_SHARE = 0.5;
/** Over how far inside the room the band falls to that share. */
export const WASH_DOOR_FADE_M = 2.5;
/** Over how far past the threshold the share dies away. */
export const WASH_SPILL_M = 2;
/** Past a jamb the spill dies this many times faster than it does
 *  straight on: that floor is in the jamb's shadow. */
export const WASH_SPILL_JAMB = 2;

/** The floor past a door that a row's band spills onto, in the row's
 *  frame: x along the wall, z out of the wall (so negative here), and
 *  the door's two ends along the wall that the spill is measured from.
 *  `floor` is the row's band (`WashStretch.floor`); `doors` are along
 *  the wall from the row's middle. */
export type WashSpill = { xMin: number; xMax: number; zMin: number; door: [number, number] };

export function washSpills(floor: [number, number], doors: WashDoor[]): WashSpill[] {
  const out: WashSpill[] = [];
  for (const d of doors) {
    const door: [number, number] = [d.center - d.width / 2, d.center + d.width / 2];
    const xMin = Math.max(floor[0], door[0] - WASH_SPILL_M / WASH_SPILL_JAMB);
    const xMax = Math.min(floor[1], door[1] + WASH_SPILL_M / WASH_SPILL_JAMB);
    // A band that reaches the door's span only past a jamb lights none
    // of the threshold, so it has nothing to carry through.
    if (Math.min(floor[1], door[1]) - Math.max(floor[0], door[0]) <= 1e-6) continue;
    out.push({ xMin, xMax, zMin: -WASH_SPILL_M, door });
  }
  return out;
}
