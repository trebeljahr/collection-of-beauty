// How a wall's colour feeds the room's light.
//
// Two things read a palette's wall colour as light, not as paint: the
// environment map that fills the room (room-env-map.tsx) and the picture
// lights, whose pools multiply the wall on screen (painting-light.tsx).
// Both were tuned while every era had a cream wall. The helpers here are
// what lets an era have a deep period colour, crimson or slate, without
// the room going dark around it. Pure maths, no three.js.

/** sRGB grey, 0–255, of the darkest cream wall the fill light was tuned
 *  on. A wall darker than this lights the room as that wall did. */
export const WALL_LIGHT_FLOOR = 190;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/** Rec. 709 grey of a colour, on its sRGB values, 0–255. */
export function greyOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The wall colour as the environment map should count it.
 *
 * The map stands in for the light the room's surfaces bounce at each
 * other, and it is painted from the wall colour because walls are most
 * of what a room sees. That holds for a pale wall. A crimson wall's grey
 * is a thirtieth of a cream wall's in linear light, so a map painted
 * from it left floor, ceiling and the wall itself near black: the room
 * was lit by its own darkness. A real gallery with dark walls is lit by
 * its laylight and lamps, and the eye adapts to it, so the wall is
 * lifted to the grey the fill was tuned on and keeps its hue as a
 * faint cast. Walls at or above that grey come back unchanged.
 */
export function wallAsLightSource(hex: string): string {
  const lift = WALL_LIGHT_FLOOR - greyOf(hex);
  if (lift <= 0) return hex;
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + lift, g + lift, b + lift);
}

/** Weakest sRGB channel, 0–255, below which a wall counts as deep. */
export const DEEP_WALL_MAX_CHANNEL = 120;

/**
 * True when a wall colour must skip tone mapping to show as authored.
 *
 * Khronos Neutral starts by subtracting the weakest channel from all
 * three, up to 0.04 in linear light: the white sheen it assumes every
 * surface carries. On a cream wall that is a slight, even darkening. A
 * deep colour's weakest channel is below 0.04 once the wall is shaded
 * (the fill puts a wall at about 0.43 of its albedo), so it went to
 * zero: crimson #8c1f2a rendered as (103, 2, 16), signal red. A wall
 * never gets bright enough to reach the range Neutral compresses, so
 * for a deep wall skipping it removes only that subtraction. The
 * threshold is where the shaded channel crosses Neutral's own 0.08 knee.
 */
export function isDeepWall(hex: string): boolean {
  return Math.min(...hexToRgb(hex)) < DEEP_WALL_MAX_CHANNEL;
}

/** Brightest sRGB channel, 0–255, of the deepest wall whose pools read
 *  at the base gain: the crimson of the Baroque floor. */
export const POOL_REFERENCE_CHANNEL = 142;
/** Ceiling on the boost, so a near-black wall does not get a white pool. */
export const POOL_MAX_BOOST = 2;

/**
 * How much stronger a picture light's pool is drawn on this wall.
 *
 * A pool multiplies the wall on screen, so what it adds in absolute
 * terms is in proportion to the wall's own brightness. On cream that is
 * a lot, on crimson enough, and on midnight blue or charcoal the pool
 * all but disappeared. The gain is raised in inverse proportion to the
 * wall's brightest channel, which keeps the step a pool adds about the
 * same on every deep wall. Returns 1 for any wall at least as bright as
 * the reference, so pale walls are drawn exactly as before.
 */
export function poolGainScale(hex: string): number {
  const brightest = Math.max(...hexToRgb(hex));
  return Math.min(POOL_MAX_BOOST, Math.max(1, POOL_REFERENCE_CHANNEL / Math.max(brightest, 1)));
}
