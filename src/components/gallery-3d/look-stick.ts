// How far the touch look stick is pushed → how fast the view turns.
//
// Until November 2026 the stick was binary: any drag past the deadzone
// turned at the full rate, so the view jumped to 69°/s the moment the
// knob moved 9 px, and aiming at one work took a string of short taps.
// Rico found it too sensitive. The rate now grows with the drag: slow
// near the centre, rising faster toward the pad's edge, and the full
// rate at full throw is what the binary stick turned at.

/** Turn rate at full throw, in radians per second (≈ 69°/s). */
export const LOOK_SPEED = 1.2;

/** Deflection (fraction of the stick's throw) under which the stick
 *  does nothing: 0.15 of 60 px is 9 px, so a resting thumb does not
 *  creep the view. */
export const LOOK_DEADZONE = 0.15;

/** Deflection at which the full rate is reached. Short of 1 because the
 *  library rounds x and y to whole pixels: on a diagonal at the pad's
 *  edge the two round down to a deflection of about 0.99, and the full
 *  rate would never quite come. */
export const LOOK_FULL_AT = 0.95;

/** Share of the full rate the stick turns at just past the deadzone, so
 *  the view answers as soon as the stick engages (≈ 7°/s). */
export const LOOK_START_RATE = 0.1;

/** Exponent of the curve between the start rate and the full rate. At 2,
 *  half way from the deadzone to full rate the stick turns at a third of
 *  the full rate. */
export const LOOK_CURVE = 2;

/**
 * Share of LOOK_SPEED (0 to 1) for a deflection of the look stick, given
 * as a fraction of its throw.
 */
export function lookStickRate(deflection: number): number {
  if (!(deflection > LOOK_DEADZONE)) return 0;
  const along = Math.min(1, (deflection - LOOK_DEADZONE) / (LOOK_FULL_AT - LOOK_DEADZONE));
  return LOOK_START_RATE + (1 - LOOK_START_RATE) * along ** LOOK_CURVE;
}
