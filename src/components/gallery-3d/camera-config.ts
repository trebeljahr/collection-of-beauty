// Camera constants shared by the scene, the player controller and the
// texture LOD.
//
// These used to be three hard-coded copies of `75` (the <Canvas camera>
// prop in index.tsx, `FOV_DEFAULT` in player.tsx, and the fallback the
// LOD derivation used when it couldn't read the camera). That was fine
// while the FOV was static config. It stopped being fine when the LOD
// ladder started being DERIVED from the FOV: the derivation and the thing
// that animates the FOV have to agree on what "normal" means, or the
// ladder is sized for one field of view and displayed through another.

/** Vertical FOV, in degrees, the scene runs at normally. */
export const FOV_DEFAULT_DEG = 75;

/** Vertical FOV the F-key "partial zoom" damps to, so the player can read
 *  details without opening the modal (see player.tsx). */
export const FOV_ZOOMED_DEG = 35;

const HALF_RAD = Math.PI / 360;
const TAN_HALF_DEFAULT = Math.tan(FOV_DEFAULT_DEG * HALF_RAD);

/**
 * Squared ratio by which a live FOV changes the on-screen size of
 * everything, relative to FOV_DEFAULT_DEG.
 *
 * Screen pixels per world metre go as `H / (2·d·tan(fov/2))`, so narrowing
 * the FOV is optically identical to walking closer: at `fov`, a painting
 * `d` metres away covers exactly as many pixels as it would at
 * `d · tan(fov/2)/tan(FOV_DEFAULT/2)` metres under the default FOV. That
 * scaled distance is what the LOD picker compares against its bands, and
 * because every band is a squared distance (no sqrt anywhere in the hot
 * path) this returns the ratio already squared.
 *
 * At FOV_ZOOMED_DEG the factor is 0.169 — pressing F is worth walking to
 * 41% of your current distance, i.e. it demands 2.43x the texture pixels.
 * Without this the zoom magnified the image 2.4x with no LOD response at
 * all and left the player on a texture the old fixed table would have
 * upgraded past.
 */
export function fovZoomScaleSq(fovDeg: number): number {
  const ratio = Math.tan(fovDeg * HALF_RAD) / TAN_HALF_DEFAULT;
  return ratio * ratio;
}

/** Pixel-density multiplier the zoom asks for at full deflection —
 *  `1 / sqrt(fovZoomScaleSq(FOV_ZOOMED_DEG))`, i.e. 2.4337. The LOD
 *  derivation uses it to decide when a painting needs no hi-res rungs at
 *  all: if the base texture already out-resolves even the zoomed view,
 *  nothing above it can ever be displayed. */
export const ZOOM_PIXEL_HEADROOM = TAN_HALF_DEFAULT / Math.tan(FOV_ZOOMED_DEG * HALF_RAD);
