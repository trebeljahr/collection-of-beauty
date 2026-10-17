import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import { hasStairwellCutout, SPIRAL_LANDING_ARC } from "@/lib/gallery-layout/world-coords";
import { CUTOUT_RAIL_RADIUS } from "./rail-constants";

// Pure spiral-staircase physics. Split out of `staircase.tsx` so the
// rules can be imported (and tested) without dragging Three.js and
// drei into the module graph — `staircase.tsx` re-exports them for the
// renderer's own use.

/** Half the landing's arc: how far the landing reaches either side of
 *  the gate. The outer rail and the cutout rail leave the same arc
 *  open, so the gate is the landing's width, and the gate posts stand
 *  where its edges meet the floor. */
export function spiralGateHalfArc(): number {
  return SPIRAL_LANDING_ARC / 2;
}

/** Rise of one step: the storey over the flight's risers. */
export function spiralStepRise(stair: Staircase): number {
  return (stair.upperY - stair.lowerY) / stair.numSteps;
}

/** Arc of one tread. A flight is a half landing, `numSteps - 1`
 *  treads and a half landing, one revolution in all. */
export function spiralTreadArc(stair: Staircase): number {
  return (Math.PI * 2 - 2 * spiralGateHalfArc()) / (stair.numSteps - 1);
}

/** One level piece of a flight, by cumulative angle from the gate on
 *  its lower floor: `from` to `to`, its top at `top`. */
export type SpiralPiece = {
  kind: "landing-low" | "tread" | "landing-high";
  from: number;
  to: number;
  top: number;
};

/** A flight's pieces in the order they are climbed: the half of the
 *  landing on its lower floor, its treads, the half of the landing on
 *  its upper floor. Every piece is level; each riser between two is one
 *  step's rise. */
export function spiralPieces(stair: Staircase): SpiralPiece[] {
  const half = spiralGateHalfArc();
  const arc = spiralTreadArc(stair);
  const rise = spiralStepRise(stair);
  const pieces: SpiralPiece[] = [{ kind: "landing-low", from: 0, to: half, top: stair.lowerY }];
  for (let k = 1; k < stair.numSteps; k++) {
    pieces.push({
      kind: "tread",
      from: half + (k - 1) * arc,
      to: half + k * arc,
      top: stair.lowerY + k * rise,
    });
  }
  pieces.push({
    kind: "landing-high",
    from: Math.PI * 2 - half,
    to: Math.PI * 2,
    top: stair.upperY,
  });
  return pieces;
}

/** Y of the flight's underside at a cumulative angle. The treads have
 *  one sloped soffit, a rise and a half under a tread's top at its
 *  riser and half a rise under it at its far edge. Under the landing it
 *  slopes at a third of that, so it meets the soffit of the flight on
 *  either side: a rise and a half under the floor where the flight from
 *  below arrives, half a rise where the flight up leaves, one rise at
 *  the gate, where the two flights' halves meet. */
export function spiralSoffitY(stair: Staircase, cum: number): number {
  const half = spiralGateHalfArc();
  const rise = spiralStepRise(stair);
  if (cum <= half) return stair.lowerY - rise + 0.5 * rise * (Math.max(0, cum) / half);
  if (cum >= Math.PI * 2 - half) {
    const t = Math.min(1, (cum - (Math.PI * 2 - half)) / half);
    return stair.upperY - 1.5 * rise + 0.5 * rise * t;
  }
  const arc = spiralTreadArc(stair);
  const f = (cum - half) / arc;
  const k = Math.min(stair.numSteps - 1, Math.floor(f) + 1);
  return stair.lowerY + k * rise - 1.5 * rise + rise * (f - (k - 1));
}

/** Y of the line the handrails follow, at a cumulative angle: level
 *  over the landings, and over the flight the line through the treads'
 *  nosings. It leaves the landing one tread's arc before the first
 *  riser and reaches the upper landing at the last, as a stair's
 *  handrail runs on at the pitch past the end of the flight. */
export function spiralRailLineY(stair: Staircase, cum: number): number {
  const half = spiralGateHalfArc();
  const rise = spiralStepRise(stair);
  const y = stair.lowerY + rise * (1 + (cum - half) / spiralTreadArc(stair));
  return Math.min(stair.upperY, Math.max(stair.lowerY, y));
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
 *  in the spiral's walking direction. Returns a value in [0, 2π), on
 *  the scale the flight's pieces are laid out on (`spiralPieces`). */
export function spiralRawAngle(stair: Staircase, worldX: number, worldZ: number): number {
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  let theta = Math.atan2(dz, dx) - stair.entryAngle;
  if (stair.direction === -1) theta = -theta;
  return ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/** Y the player's feet should sit at given a cumulative angle on this
 *  stair: the top of the piece under them (`spiralPieces`). Feet on a
 *  landing are level with its floor, so stepping off onto the floor
 *  is flush, and the camera's damping eases each riser. */
export function stairHeightAt(stair: Staircase, cumulativeAngle: number): number {
  const half = spiralGateHalfArc();
  if (cumulativeAngle <= half) return stair.lowerY;
  if (cumulativeAngle >= Math.PI * 2 - half) return stair.upperY;
  const k = Math.min(
    stair.numSteps - 1,
    Math.floor((cumulativeAngle - half) / spiralTreadArc(stair)) + 1,
  );
  return stair.lowerY + k * spiralStepRise(stair);
}

/** Height the camera rides at on the spiral: level on the landings,
 *  and over the flight the straight line through the nosings
 *  (`spiralRailLineY`), up to one riser over the tread `stairHeightAt`
 *  gives. The view climbs at an even rate instead of a riser at a
 *  time, and is level with the floor wherever the visitor can step
 *  off. */
export function stairWalkHeightAt(stair: Staircase, cumulativeAngle: number): number {
  return spiralRailLineY(stair, cumulativeAngle);
}

/** Vertical clearance the soffit of the helix has to give before the
 *  ground under it counts as a room you can walk through. The player's
 *  eye sits at 1.75 m and reaches 2.15 m on tiptoe; the treads carry no
 *  collider, so anything under that would simply be walked through and
 *  the camera would end up inside the stone. */
export const UNDER_STAIR_HEADROOM = 2.3;

/** Y of the helix's underside at this raw angle (`spiralSoffitY`).
 *  The landing on the lower floor reports negative clearance, which is
 *  right: there is no room under the bottom of the flight. */
export function stairUndersideY(stair: Staircase, rawAngle: number): number {
  return spiralSoffitY(stair, rawAngle);
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
  return all.find((s) => s.lowerFloor === staircase.upperFloor && sameShaft(s, staircase));
}

/** Mirror of findStairAbove for descent. */
export function findStairBelow(
  staircase: Staircase,
  all: readonly Staircase[],
): Staircase | undefined {
  return all.find((s) => s.upperFloor === staircase.lowerFloor && sameShaft(s, staircase));
}

/** Two flights stand in the same well when they share a centre. A
 *  floor has two wells. */
export function sameShaft(a: Staircase, b: Staircase): boolean {
  return Math.abs(a.centerX - b.centerX) < 0.01 && Math.abs(a.centerZ - b.centerZ) < 0.01;
}

/** One stair well of a floor: the flight that climbs out of it, the
 *  flight that arrives in it from below, and either of them to read the
 *  well's centre and radii from. */
export type StairShaft = { stairOut?: Staircase; stairIn?: Staircase; reference: Staircase };

/** A floor's stair wells, in the order its flights are listed. */
export function floorShafts(floor: FloorLayout): StairShaft[] {
  const shafts: StairShaft[] = [];
  const at = (stair: Staircase) => {
    let shaft = shafts.find((s) => sameShaft(s.reference, stair));
    if (!shaft) {
      shaft = { reference: stair };
      shafts.push(shaft);
    }
    return shaft;
  };
  for (const stair of floor.stairsOut) at(stair).stairOut = stair;
  for (const stair of floor.stairsIn) at(stair).stairIn = stair;
  // Prefer the flight that leaves the floor as the reference, as the
  // callers did when a floor had one well.
  for (const shaft of shafts) shaft.reference = shaft.stairOut ?? shaft.stairIn ?? shaft.reference;
  return shafts;
}

/** How far the top landing reaches past the gate, measured square to
 *  the line from the well's centre through the gate. The landing ends
 *  under the handrail that closes the top floor's dead-end side: the
 *  L-shaped bar from the spiral's inner rail out to the cutout rail
 *  (`lBridge` in `stairwell-rail.tsx`). Its outer arm runs parallel to
 *  that line and lands on the cutout rail one gate half-arc round. */
export function topLandingDepth(_stair: Staircase): number {
  return CUTOUT_RAIL_RADIUS * Math.sin(spiralGateHalfArc());
}

/** True when a point of the topmost flight's annulus, given by its
 *  angle past the gate and its radius, lies on the top landing: the
 *  patch between the gate and the handrail that closes the well. */
export function onTopLanding(stair: Staircase, rawAngle: number, radius: number): boolean {
  const along = radius * Math.cos(rawAngle);
  const across = radius * Math.sin(rawAngle);
  return across >= 0 && across <= topLandingDepth(stair) && along >= stair.innerRadius;
}

/** Y of the walking surface at `rawAngle` on `stair`, as seen from a
 *  player standing on floor `floorIndex`.
 *
 *  Almost always the tread height. The exception is the top of the
 *  climb, where the flight ends at the gate. On a floor with a flight
 *  above, the landing runs on past the gate as that flight's first
 *  half, level with the floor. The topmost flight ends in a landing
 *  past the gate as far as the handrail that fences the well
 *  (`onTopLanding`); past that rail the well is open and there is
 *  nothing to stand on. */
export function stairSurfaceYAt(
  floorIndex: number,
  stair: Staircase,
  rawAngle: number,
  radius: number,
  hasFlightAbove: boolean,
): number {
  if (floorIndex === stair.upperFloor) {
    if (hasFlightAbove ? rawAngle <= spiralGateHalfArc() : onTopLanding(stair, rawAngle, radius)) {
      return stair.upperY;
    }
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
  radius: number,
  feetY: number,
  hasFlightAbove: boolean,
): boolean {
  return (
    Math.abs(stairSurfaceYAt(floorIndex, stair, rawAngle, radius, hasFlightAbove) - feetY) <=
    spiralStepRise(stair) * 1.75
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
    const radius = Math.hypot(worldX - stair.centerX, worldZ - stair.centerZ);
    if (isAtStairSurface(floor.index, stair, raw, radius, feetY, hasFlightAbove)) return stair;
  }
  return null;
}
