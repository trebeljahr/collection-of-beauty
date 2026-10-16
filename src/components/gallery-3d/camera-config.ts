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
//
// Why 50 and not 75. A screen at a normal distance covers about 25–35°
// of the eye from top to bottom. A view wider than that shrinks the
// world to fit, and at 75° a canvas looked about 2.5–3 times smaller than
// it does standing in front of it: Rico found The Abbey in the Oakwood,
// 110 × 171 cm, smaller than he remembered it in Berlin (17 October
// 2026). A view that matches the screen exactly (a "normal lens", about
// 27°) is too narrow to walk in, so the default is 50°, and the F key
// narrows it to 25°, close to what the eye sees from the same spot.

/** Vertical FOV, in degrees, of a landscape view. */
export const FOV_DEFAULT_DEG = 50;

/** Vertical FOV the F-key "partial zoom" damps to on a landscape view,
 *  so the player can read details without opening the modal (see
 *  player.tsx). About a normal lens: the size the eye sees. */
export const FOV_ZOOMED_DEG = 25;

/** The narrowest the view may be from side to side. A phone held upright
 *  at 50° vertical would see 24° across, a slot. Below this the vertical
 *  FOV widens instead, so an upright phone keeps the ~75° vertical (40°
 *  across) it had before the default narrowed. */
export const MIN_HORIZONTAL_FOV_DEG = 40;

const HALF_RAD = Math.PI / 360;
const TAN_HALF_DEFAULT = Math.tan(FOV_DEFAULT_DEG * HALF_RAD);
const TAN_HALF_MIN_HORIZONTAL = Math.tan(MIN_HORIZONTAL_FOV_DEG * HALF_RAD);
/** The zoom as a ratio of half-angle tangents, so it magnifies by the same
 *  factor whatever the base FOV is. */
const ZOOM_TAN_RATIO = Math.tan(FOV_ZOOMED_DEG * HALF_RAD) / TAN_HALF_DEFAULT;

/** tan(baseFov/2) for a canvas of this aspect (width / height). */
export function tanHalfBaseFov(aspect: number): number {
  if (!(aspect > 0)) return TAN_HALF_DEFAULT;
  return Math.max(TAN_HALF_DEFAULT, TAN_HALF_MIN_HORIZONTAL / aspect);
}

/** The vertical FOV, in degrees, the camera runs at for this aspect. */
export function baseFovDeg(aspect: number): number {
  return Math.atan(tanHalfBaseFov(aspect)) / HALF_RAD;
}

/** The vertical FOV, in degrees, the F-key zoom damps to for this aspect. */
export function zoomedFovDeg(aspect: number): number {
  return Math.atan(tanHalfBaseFov(aspect) * ZOOM_TAN_RATIO) / HALF_RAD;
}

/**
 * Squared ratio by which a live FOV changes the on-screen size of
 * everything, relative to the base FOV for the canvas's aspect.
 *
 * Screen pixels per world metre go as `H / (2·d·tan(fov/2))`, so narrowing
 * the FOV is optically identical to walking closer: at `fov`, a painting
 * `d` metres away covers exactly as many pixels as it would at
 * `d · tan(fov/2)/tan(base/2)` metres under the base FOV. That scaled
 * distance is what the LOD picker compares against its bands, and
 * because every band is a squared distance (no sqrt anywhere in the hot
 * path) this returns the ratio already squared.
 *
 * At the zoomed FOV the factor is 0.2260 — pressing F is worth walking
 * to 48% of your current distance, i.e. it demands 2.10x the texture
 * pixels.
 */
export function fovZoomScaleSq(fovDeg: number, aspect: number): number {
  const ratio = Math.tan(fovDeg * HALF_RAD) / tanHalfBaseFov(aspect);
  return ratio * ratio;
}

/** Pixel-density multiplier the zoom asks for at full deflection,
 *  2.1034. The LOD derivation uses it to decide when a painting needs no
 *  hi-res rungs at all: if the base texture already out-resolves even
 *  the zoomed view, nothing above it can ever be displayed. */
export const ZOOM_PIXEL_HEADROOM = 1 / ZOOM_TAN_RATIO;

/** The backing height a canvas would need at FOV_DEFAULT_DEG for the
 *  same pixels per metre it has at its own base FOV. The LOD ladder is
 *  derived at FOV_DEFAULT_DEG, so it is given this height: equal to the
 *  real one on a landscape canvas, smaller on an upright phone, whose
 *  wider vertical FOV puts fewer pixels on each metre. */
export function ladderHeightPx(backingHeightPx: number, aspect: number): number {
  return (backingHeightPx * TAN_HALF_DEFAULT) / tanHalfBaseFov(aspect);
}
