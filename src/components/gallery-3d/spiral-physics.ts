import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import { hasStairwellCutout } from "@/lib/gallery-layout/world-coords";

// Pure spiral-staircase physics. Split out of `staircase.tsx` so the
// rules can be imported (and tested) without dragging Three.js and
// drei into the module graph — `staircase.tsx` re-exports them for the
// renderer's own use.

/** Half-arc of the entry/exit gate on the OUTER rail — the rail is
 *  omitted across this arc so the player can step onto/off the
 *  spiral. The cutout-edge rail on each floor uses the same value
 *  (computed from each stair's numSteps), so the two gates align
 *  vertically and the spiral rail flows smoothly out of one floor's
 *  cutout rail and into the next. */
export function spiralGateHalfArc(numSteps: number): number {
  // A little over one step of arc on each side. One exact step felt
  // visually and physically too narrow once the sign pylon sat on the
  // post instead of floating beside it.
  return ((Math.PI * 2) / numSteps) * 1.35;
}

/** True if (worldX, worldZ) sits inside the spiral's walking annulus
 *  (between innerRadius and outerRadius). Outside the annulus uses
 *  normal floor physics. */
export function isInsideStair(stair: Staircase, worldX: number, worldZ: number): boolean {
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  const r2 = dx * dx + dz * dz;
  return r2 >= stair.innerRadius * stair.innerRadius && r2 <= stair.outerRadius * stair.outerRadius;
}

/** Normalised raw angle around the spiral, measured from `entryAngle`
 *  in the spiral's walking direction. Returns a value in [0, 2π);
 *  step `i` occupies [i*stepAngle, (i+1)*stepAngle]. */
export function spiralRawAngle(stair: Staircase, worldX: number, worldZ: number): number {
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  let theta = Math.atan2(dz, dx) - stair.entryAngle;
  if (stair.direction === -1) theta = -theta;
  return ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/** Y the player's feet should sit at given a cumulative angle on this
 *  stair. Mostly a tread-locked step function: while the player walks
 *  tread `i` their feet are pinned to that tread's top (`lowerY +
 *  i*stepRise`), exactly matching the rendered geometry instead of
 *  gliding along an invisible ramp above it.
 *
 *  EXCEPT the FIRST and LAST tread's arcs, which are smoothed into
 *  ramps so on/off-ramping is flush with the destination floor. A
 *  pure step function leaves the player one stepRise below the upper
 *  floor for the entire last tread (cum ∈ [21*stepAngle, 2π) → idx=21
 *  → Y = upperY−stepRise), and the player only "lands" on upperY at
 *  the cum=2π boundary — by which point canStepTo's STAIR_LANDING_TOL
 *  has already permitted them to step off the spiral. Result: the
 *  camera was 40 cm under the upper floor mesh as they walked toward
 *  the gate, with the floor slab clipping through their view, and the
 *  exit move triggered a Y-snap teleport. The smoothed first/last
 *  arc lifts the player flush with the destination floor by the time
 *  they reach the landing arc. The middle treads stay discrete so
 *  the per-step "climbing stairs" feel is preserved. */
export function stairHeightAt(stair: Staircase, cumulativeAngle: number): number {
  const stepAngle = (Math.PI * 2) / stair.numSteps;
  const stepRise = (stair.upperY - stair.lowerY) / stair.numSteps;
  if (cumulativeAngle <= 0) return stair.lowerY;
  if (cumulativeAngle >= Math.PI * 2) return stair.upperY;
  const idx = Math.floor(cumulativeAngle / stepAngle);
  if (idx === 0) {
    const t = cumulativeAngle / stepAngle;
    return stair.lowerY + t * stepRise;
  }
  if (idx >= stair.numSteps - 1) {
    const t = (cumulativeAngle - (stair.numSteps - 1) * stepAngle) / stepAngle;
    return stair.lowerY + (stair.numSteps - 1) * stepRise + t * stepRise;
  }
  return stair.lowerY + idx * stepRise;
}

/** Vertical clearance the soffit of the helix has to give before the
 *  ground under it counts as a room you can walk through. The player's
 *  eye sits at 1.75 m and reaches 2.15 m on tiptoe; the treads carry no
 *  collider, so anything under that would simply be walked through and
 *  the camera would end up inside the stone. */
export const UNDER_STAIR_HEADROOM = 2.3;

/** Y of the helix's underside at this raw angle.
 *
 *  Each tread is a FULL-RISE block (see `buildSpiralStepsGeometry`):
 *  step `i`'s top is `lowerY + i*stepRise` and its bottom sits one rise
 *  below, so the soffit over step `i`'s arc is at
 *  `lowerY + (i-1)*stepRise`. Step 0's block sinks a rise below the
 *  lower floor — hidden inside the slab — so the first arc reports
 *  negative clearance, which is exactly right: there is no room under
 *  the bottom of the flight. */
export function stairUndersideY(stair: Staircase, rawAngle: number): number {
  const stepAngle = (Math.PI * 2) / stair.numSteps;
  const stepRise = (stair.upperY - stair.lowerY) / stair.numSteps;
  const idx = Math.min(stair.numSteps - 1, Math.max(0, Math.floor(rawAngle / stepAngle)));
  return stair.lowerY + (idx - 1) * stepRise;
}

/** True when (worldX, worldZ) is inside a spiral's footprint but the
 *  treads there are a storey overhead — i.e. the player is standing in
 *  the open space *under* the stairs rather than on them.
 *
 *  Only ever true on a floor whose stairwell slab is solid (the ground
 *  one): everywhere above, the annulus is a hole, and "under the
 *  stairs" is a drop rather than a room. The flight also has to be one
 *  rising FROM this floor — a flight arriving from below has its treads
 *  under the slab, not over it.
 *
 *  Where both hold, the footprint is ordinary floor: `stairSurfaceAt`
 *  refuses entry because there is no tread at foot height, and this
 *  rule says that refusal is about the stair, not about the ground. */
export function isWalkableUnderStair(floor: FloorLayout, worldX: number, worldZ: number): boolean {
  if (hasStairwellCutout(floor.index)) return false;
  let insideAny = false;
  for (const stair of [...floor.stairsOut, ...floor.stairsIn]) {
    if (!isInsideStair(stair, worldX, worldZ)) continue;
    insideAny = true;
    if (floor.index !== stair.lowerFloor) return false;
    const raw = spiralRawAngle(stair, worldX, worldZ);
    if (stairUndersideY(stair, raw) - floor.y < UNDER_STAIR_HEADROOM) return false;
  }
  return insideAny;
}

/** Find the stair connected above this one (its upperFloor matches
 *  the next stair's lowerFloor) — used when the player walks past the
 *  top of one revolution and continues into the next storey's flight. */
export function findStairAbove(
  staircase: Staircase,
  all: readonly Staircase[],
): Staircase | undefined {
  return all.find((s) => s.lowerFloor === staircase.upperFloor);
}

/** Mirror of findStairAbove for descent. */
export function findStairBelow(
  staircase: Staircase,
  all: readonly Staircase[],
): Staircase | undefined {
  return all.find((s) => s.upperFloor === staircase.lowerFloor);
}

/** Y of the walking surface at `rawAngle` on `stair`, as seen from a
 *  player standing on floor `floorIndex`.
 *
 *  Almost always the tread height. The exception is the top of the
 *  helix: the topmost flight is capped by a flat landing occupying the
 *  half-revolution past the gate, all of it at `upperY`, so on that
 *  floor the whole arc reads as floor level rather than as treads
 *  three metres down. Intermediate flights stack into the next
 *  revolution, so there only the short arc around the gate itself is
 *  at floor level. */
export function stairSurfaceYAt(
  floorIndex: number,
  stair: Staircase,
  rawAngle: number,
  hasFlightAbove: boolean,
): number {
  if (floorIndex === stair.upperFloor) {
    const stepAngle = (Math.PI * 2) / stair.numSteps;
    const landingSweep = hasFlightAbove ? stepAngle * 1.5 : Math.PI;
    if (rawAngle < landingSweep) return stair.upperY;
  }
  return stairHeightAt(stair, rawAngle);
}

/** True when the spiral's walking surface at this angle is within a
 *  step and a half of the player's feet — i.e. there is something to
 *  stand on here. */
export function isAtStairSurface(
  floorIndex: number,
  stair: Staircase,
  rawAngle: number,
  feetY: number,
  hasFlightAbove: boolean,
): boolean {
  const stepRise = (stair.upperY - stair.lowerY) / stair.numSteps;
  return (
    Math.abs(stairSurfaceYAt(floorIndex, stair, rawAngle, hasFlightAbove) - feetY) <=
    stepRise * 1.75
  );
}

/** The staircase the player is standing ON at (worldX, worldZ), or null
 *  when the spiral's footprint here has no surface at their feet.
 *
 *  This is the whole "you can't walk into the staircase from behind"
 *  rule. The annulus is a hole on every floor but the ground one, and
 *  on the ground floor it is the base of a helix that climbs away: a
 *  quarter-revolution past the gate the treads are already overhead,
 *  and further round they are metres up. So membership of the annulus
 *  is not enough — there has to be a tread (or the top landing) at foot
 *  height, which is only true near the gate. Both flights that meet on
 *  a floor share the annulus, and the ascending one is checked first so
 *  a player entering square-on through the gate starts at the bottom of
 *  the flight up, exactly as before; the descending flight covers the
 *  other half of the gate mouth. */
export function stairSurfaceAt(
  floor: FloorLayout,
  allStaircases: readonly Staircase[],
  worldX: number,
  worldZ: number,
  feetY: number,
): Staircase | null {
  for (const stair of [...floor.stairsOut, ...floor.stairsIn]) {
    if (!isInsideStair(stair, worldX, worldZ)) continue;
    const raw = spiralRawAngle(stair, worldX, worldZ);
    const hasFlightAbove = !!findStairAbove(stair, allStaircases);
    if (isAtStairSurface(floor.index, stair, raw, feetY, hasFlightAbove)) return stair;
  }
  return null;
}
