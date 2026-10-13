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
 * is a twentieth of a cream wall's in linear light, so a map painted
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

/** How much darker than its room's walls the back of a door screen is
 *  drawn, as a step of lightness (the cube root of luminance, 0–1).
 *  Looked at on five walls at 0.05 and 0.08: at 0.05 the step is
 *  faint on charcoal, at 0.08 the back reads as another paint. */
export const SCREEN_SHADE_STEP = 0.06;

/** Linear-light luminance of a colour, 0–1. */
function luminanceOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The share of its room's light the back of a door screen shows: the
 * factor its wall colour is multiplied by, in linear light.
 *
 * A screen stands 2.5 m inside a door with its back to it, in the
 * colour of the wall the door is cut in. Nothing in the scene casts a
 * shadow, so through the door the two were one colour and the opening
 * read as walled up: only the strip of floor and the skirting said the
 * wall behind was another wall. The back hangs nothing and has no
 * picture light, so it is drawn as a face turned from the room's light.
 *
 * The step is one of lightness, not one factor for every wall: a
 * factor takes a smaller step off a deep wall than off a pale one.
 * The step comes to 0.56 on midnight blue and 0.82 on cream.
 */
export function screenShade(hex: string): number {
  const lightness = Math.cbrt(luminanceOf(hex));
  if (lightness <= SCREEN_SHADE_STEP) return 1;
  return ((lightness - SCREEN_SHADE_STEP) / lightness) ** 3;
}
