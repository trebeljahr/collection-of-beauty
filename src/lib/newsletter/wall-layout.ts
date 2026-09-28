// Geometry and colour for the email header: the issue's five works framed
// and hung on a painted gallery wall. Pure, no catalogue or sharp import,
// so the email template, the image route, the edition page and the tests
// all share it.
//
// In the email the wall is one JPEG per issue (see wall-image.ts); the
// edition page draws the same SVG with the works laid over it as HTML
// images (see wall-svg.ts). Only the works and the wall are in the
// picture; the title under it stays live HTML on a block painted the
// wall's base colour. That split is why the picture's bottom rows must be
// exactly `palette.base`: the gradient ends there, and BOTTOM_PAD leaves
// room for the frame shadows to fade out before the edge, so the picture
// runs into the HTML block without a seam.

/** Email content width, in CSS px. The image is rendered at 2x this. */
export const WALL_WIDTH = 640;

const SIDE_MARGIN = 28;
const GAP = 18;
export const FRAME_WIDTH = 3;
const TOP_PAD = 52;
// Shadow offset (8) plus ~2.5 sigma of its blur (9) must fit below the
// lowest frame, or the shadow is cut off by the image edge.
const BOTTOM_PAD = 36;
const MAX_FRAME_HEIGHT = 150;
/** The cover hangs in the middle, with this much more area than the rest. */
const CENTRE_WEIGHT = 1.7;

/** Bump when the picture changes for unchanged inputs, so cached copies
 *  (Gmail's image proxy, the route's own cache) are not served. */
export const WALL_LAYOUT_VERSION = 1;

export type HangFrame = {
  /** Index into the input list. */
  index: number;
  /** Outer box of the frame, in CSS px at WALL_WIDTH. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HangLayout = {
  width: number;
  height: number;
  /** Left to right. */
  frames: HangFrame[];
};

/**
 * Left-to-right hanging order: the centre work in the middle, then the
 * rest in mirrored pairs, narrowest pair next to the centre. Putting the
 * two tallest works beside the centre and the two widest at the ends
 * gives the row a symmetric silhouette whatever the issue holds. Within
 * a pair the work that comes first in the issue goes left.
 */
export function hangOrder(aspectRatios: readonly number[], centreIndex: number): number[] {
  const rest = aspectRatios
    .map((ar, index) => ({ ar: safeRatio(ar), index }))
    .filter((w) => w.index !== centreIndex)
    .sort((a, b) => a.ar - b.ar || a.index - b.index);

  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < rest.length; i += 2) {
    const pair = rest.slice(i, i + 2).sort((a, b) => a.index - b.index);
    left.unshift(pair[0].index);
    if (pair[1]) right.push(pair[1].index);
  }
  return [...left, centreIndex, ...right];
}

/**
 * Size and place every frame on a centre line. Side works get equal
 * picture area and the centre work CENTRE_WEIGHT times that, so a scroll
 * and a panorama carry the same visual weight instead of one of them
 * dominating. The common scale is the largest that keeps the row inside
 * the side margins and every frame under MAX_FRAME_HEIGHT.
 */
export function hangLayout(aspectRatios: readonly number[], centreIndex: number): HangLayout {
  const order = hangOrder(aspectRatios, centreIndex);
  const weights = order.map((i) => (i === centreIndex ? CENTRE_WEIGHT : 1));
  const ratios = order.map((i) => safeRatio(aspectRatios[i]));

  // Picture size at scale s: width = s * sqrt(k * ar), height = s * sqrt(k / ar).
  const unitWidths = ratios.map((ar, n) => Math.sqrt(weights[n] * ar));
  const unitHeights = ratios.map((ar, n) => Math.sqrt(weights[n] / ar));

  const frameCount = order.length;
  const fixedWidth = GAP * (frameCount - 1) + 2 * FRAME_WIDTH * frameCount;
  const scaleForWidth = (WALL_WIDTH - 2 * SIDE_MARGIN - fixedWidth) / sum(unitWidths);
  const scaleForHeight = (MAX_FRAME_HEIGHT - 2 * FRAME_WIDTH) / Math.max(...unitHeights);
  const scale = Math.min(scaleForWidth, scaleForHeight);

  const sizes = order.map((_, n) => ({
    width: scale * unitWidths[n] + 2 * FRAME_WIDTH,
    height: scale * unitHeights[n] + 2 * FRAME_WIDTH,
  }));
  const tallest = Math.max(...sizes.map((s) => s.height));
  const rowWidth = sum(sizes.map((s) => s.width)) + GAP * (frameCount - 1);
  const centreLine = TOP_PAD + tallest / 2;

  let x = (WALL_WIDTH - rowWidth) / 2;
  const frames = order.map((index, n) => {
    const frame = {
      index,
      x,
      y: centreLine - sizes[n].height / 2,
      width: sizes[n].width,
      height: sizes[n].height,
    };
    x += sizes[n].width + GAP;
    return frame;
  });

  return { width: WALL_WIDTH, height: Math.ceil(TOP_PAD + tallest + BOTTOM_PAD), frames };
}

function safeRatio(ar: number | undefined): number {
  return ar !== undefined && Number.isFinite(ar) && ar > 0 ? ar : 1;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// --- Wall colour ---------------------------------------------------------

/**
 * Museum wall colours. Each lists the colour families (the
 * `Artwork.colorBuckets` ids) it sets off, roughly by hue opposition:
 * warm pictures on green or navy, green and blue ones on oxblood, prints
 * and drawings on slate.
 */
export const WALL_COLOURS = {
  green: { base: "#3a443e", flatters: ["red", "pink", "brown", "purple"] },
  navy: { base: "#283247", flatters: ["orange", "gold"] },
  teal: { base: "#233e3d", flatters: ["red", "pink", "orange"] },
  oxblood: { base: "#4a2727", flatters: ["green", "teal", "blue", "grey"] },
  plum: { base: "#3a2c3c", flatters: ["gold", "brown", "green"] },
  slate: { base: "#33373c", flatters: ["grey", "black", "white"] },
} as const satisfies Record<string, { base: string; flatters: readonly string[] }>;

export type WallColourName = keyof typeof WALL_COLOURS;

export const WALL_COLOUR_NAMES = Object.keys(WALL_COLOURS) as WallColourName[];

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isWallColour(value: string): boolean {
  return value in WALL_COLOURS || HEX_RE.test(value);
}

/**
 * The wall's base colour: the frontmatter `wall` (a name from
 * WALL_COLOURS or a hex) when set, otherwise the wall that flatters the
 * most of the issue's colour families. The previous issue's wall is out
 * of the running, so two issues in a row never share a wall. Walls within
 * a quarter of the best remaining score all count as good, and the issue
 * number picks among them, so a run of warm issues still varies.
 */
export function wallBaseColour(
  families: ReadonlyArray<readonly string[] | null>,
  issueNumber: number,
  override?: string,
  previousBase?: string,
): string {
  if (override) {
    if (override in WALL_COLOURS) return WALL_COLOURS[override as WallColourName].base;
    if (HEX_RE.test(override)) return override.toLowerCase();
    throw new Error(`Unknown wall colour "${override}".`);
  }

  const counts = new Map<string, number>();
  for (const list of families) {
    for (const f of list ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const scores = WALL_COLOUR_NAMES.filter((name) => WALL_COLOURS[name].base !== previousBase).map(
    (name) => ({
      name,
      score: sum(WALL_COLOURS[name].flatters.map((f) => counts.get(f) ?? 0)),
    }),
  );
  const best = Math.max(...scores.map((s) => s.score));
  const good = scores.filter((s) => s.score >= best * 0.75);
  return WALL_COLOURS[good[issueNumber % good.length].name].base;
}

export type WallPalette = {
  /** Flat wall colour: the image's bottom edge and the title cell. */
  base: string;
  /** Top of the spotlight gradient. */
  spot: string;
  title: string;
  kicker: string;
  meta: string;
  underline: string;
};

/** Every text colour is the wall mixed toward white, so each wall gets
 *  its own tint of the same hierarchy. */
export function wallPalette(base: string): WallPalette {
  return {
    base,
    spot: mixWithWhite(base, 0.13),
    title: "#f4f1ea",
    kicker: mixWithWhite(base, 0.6),
    meta: mixWithWhite(base, 0.72),
    underline: mixWithWhite(base, 0.32),
  };
}

export function mixWithWhite(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) =>
      Math.round(c + (255 - c) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Colours for a header drawn without a wall. */
export const DEFAULT_WALL_PALETTE = wallPalette(WALL_COLOURS.green.base);
