// Which frame a work hangs in.
//
// A frame design is a moulding (frame-styles.ts), the ornament carved
// on it, a finish for each of its materials, and a few numbers that are
// the work's own: how heavy the moulding is cut, how worn the gilding
// is, the exact tone of its gold or its mat. The combinations run to
// tens of thousands, so two works rarely share one, while the renderer
// still draws all of them with nine materials and one texture atlas.
//
// The choice is made the way a framer makes it, in two steps:
//  1. The school and date of the work name the frames a museum would
//     plausibly have it in (`looksFor`), weighted.
//  2. The picture itself shifts the weights. A dark painting takes
//     bright gilding and a high-key one a pale or painted frame; gold
//     is warmed beside a cool picture and cooled beside a warm one; a
//     mat or a silk mount takes its tone from the sheet inside it.
// The pick is a weighted draw on a hash of the work's id, so it is the
// same on the server, in the browser and on every visit.
//
// No three.js here: the hang reads `frameReach`.

import type { ArtworkListing } from "@/lib/data";
import { type CarveBand, FRAME_SLOTS, type ShadedPoint, scaleProfile } from "./frame-profiles";
import {
  buildStyle,
  type FrameStyleId,
  type StyleOptions,
  type Swell,
  scaleSwell,
  styleChoices,
} from "./frame-styles";

// ── Finishes ──────────────────────────────────────────────────────────

/** The nine materials the renderer has (frame-materials.ts). A finish
 *  is one of them in a colour. */
export type FrameSurface =
  | "leaf"
  | "leafOak"
  | "darkWood"
  | "paleWood"
  | "lacquer"
  | "paint"
  | "board"
  | "silk"
  | "cloth";

export type FinishId =
  | "gilt"
  | "giltPale"
  | "giltRed"
  | "giltDark"
  | "silver"
  | "giltOak"
  | "walnut"
  | "mahogany"
  | "rosewood"
  | "fruitwood"
  | "oak"
  | "maple"
  | "ash"
  | "kiri"
  | "stained"
  | "ebony"
  | "blackLacquer"
  | "redLacquer"
  | "white"
  | "greyPaint"
  | "sage"
  | "blackMatte"
  | "azure"
  | "boleRed"
  | "mat"
  | "silk"
  | "brocade"
  | "linen"
  | "canvasEdge";

/** What a finish does to the picture it surrounds, for the fit rules. */
type FinishKind =
  | "gold"
  | "paleGold"
  | "silver"
  | "darkWood"
  | "paleWood"
  | "black"
  | "red"
  | "pale";

type FinishSpec = {
  surface: FrameSurface;
  /** The colour it shows, sRGB. */
  color: string;
  /** Roughness as a multiple of the surface's own. */
  rough: number;
  /** How much of the moulding's burnishing shows: 1 on water gilding,
   *  where the high points are polished and the hollows left matte. */
  burnish: number;
  /** How readily it wears through on the high points. Leaf only. */
  wear: number;
  /** Depth of its carving, 0 for a finish that is never carved. */
  carve: number;
  kind: FinishKind;
};

/** surface, colour, kind, then roughness, burnish, wear and carving. */
const finish = (
  surface: FrameSurface,
  color: string,
  kind: FinishKind,
  rough = 1,
  burnish = 0,
  wear = 0,
  carve = 0,
): FinishSpec => ({ surface, color, kind, rough, burnish, wear, carve });

export const FINISHES: Record<FinishId, FinishSpec> = {
  // Water gilding over red bole. Antique gold sits below pure gold's
  // reflectance: old leaf is toned and a little dirty.
  gilt: finish("leaf", "#d8aa55", "gold", 1, 1, 1, 1),
  // Lemon gold, the greenish alloy of 19th-century and Whistler frames.
  giltPale: finish("leaf", "#dcc98c", "paleGold", 0.95, 1, 0.7, 1),
  // Red gold, toned warm.
  giltRed: finish("leaf", "#d2953f", "gold", 1, 1, 1.1, 1),
  // Old gilding under darkened size: duller, and rubbed.
  giltDark: finish("leaf", "#ae8743", "gold", 1.2, 0.8, 1.35, 1),
  // Silver leaf under a toned varnish.
  silver: finish("leaf", "#c6c2b3", "silver", 1.05, 0.9, 0.6, 1),
  // Oil gilding straight on oak: the grain shows through the leaf.
  giltOak: finish("leafOak", "#cfa552", "gold", 1.1, 0.4, 0.4, 0),
  walnut: finish("darkWood", "#3a2518", "darkWood", 1, 0.35, 0, 0.8),
  mahogany: finish("paleWood", "#56291b", "darkWood", 0.8, 0.35, 0, 0.8),
  rosewood: finish("paleWood", "#3d1f1a", "darkWood", 0.75, 0.35, 0, 0.8),
  fruitwood: finish("paleWood", "#8a5632", "darkWood", 0.85, 0.3, 0, 0.8),
  oak: finish("paleWood", "#94703f", "paleWood", 1, 0.25, 0, 0.8),
  maple: finish("paleWood", "#c9a468", "paleWood", 0.8, 0.25, 0, 0.6),
  ash: finish("paleWood", "#c6aa7e", "paleWood", 1, 0.25, 0, 0.6),
  // Paulownia, the pale grey-brown wood of Japanese boxes and frames.
  kiri: finish("paleWood", "#c2ad90", "paleWood", 1.05, 0.2, 0, 0.5),
  // Black-stained ash: the grain still shows.
  stained: finish("paleWood", "#231f1c", "black", 1.12, 0.2, 0, 0.6),
  // Ebonised and polished.
  ebony: finish("lacquer", "#12100f", "black", 1, 0.3, 0, 1),
  blackLacquer: finish("lacquer", "#0c0b0d", "black", 0.85, 0.3, 0, 1),
  // Red-black urushi.
  redLacquer: finish("lacquer", "#4a100c", "red", 0.87, 0.3, 0, 1),
  // Painted frames: the white and tinted frames Degas, Pissarro and
  // Seurat showed in, and the painted friezes of a cassetta.
  white: finish("paint", "#e6e1d3", "pale", 1, 0.15, 0, 0.6),
  greyPaint: finish("paint", "#b5b3a8", "pale", 1, 0.15, 0, 0.6),
  sage: finish("paint", "#a6ab95", "pale", 1, 0.15, 0, 0.6),
  blackMatte: finish("paint", "#1c1b1a", "black", 0.9, 0.2, 0, 0.7),
  azure: finish("paint", "#2a3c5e", "black", 1, 0.1, 0, 0.5),
  boleRed: finish("paint", "#6a2a1e", "red", 1, 0.1, 0, 0.5),
  // A mat and a mounting silk take their colour from the sheet inside
  // them (`matFor`, `silkFor`); these are only their starting tones.
  mat: finish("board", "#f3eee2", "pale"),
  silk: finish("silk", "#96855c", "paleWood"),
  brocade: finish("silk", "#b3924e", "gold", 0.8),
  linen: finish("cloth", "#d6cdb8", "pale"),
  canvasEdge: finish("cloth", "#d9d2c2", "pale"),
};

/** The mean colour of each surface's own map, sRGB: a finish's tint is
 *  its colour over this. White for the maps that only modulate. */
const SURFACE_BASE: Record<FrameSurface, string> = {
  leaf: "#ffffff",
  leafOak: "#ffffff",
  darkWood: "#3a2518",
  paleWood: "#c6aa7e",
  lacquer: "#ffffff",
  paint: "#ffffff",
  board: "#ffffff",
  // The silk map's ground is a mid grey, so any colour can be woven.
  silk: "#c8c8c8",
  cloth: "#ffffff",
};

// ── Colour arithmetic ─────────────────────────────────────────────────

type Rgb = [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** `#rrggbb` to linear RGB, or null when it is not a colour. */
function hexToLinear(hex: string | null | undefined): Rgb | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [1, 3, 5].map((i) => srgbToLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as Rgb;
}

/** Linear RGB to OKLab: lightness 0..1 and two opponent axes. */
function toOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.max(0, c)) as Rgb;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ── Reading the picture ───────────────────────────────────────────────

/** What a framer sees at a glance. */
export type PictureTone = {
  /** Lightness, 0 black to 1 white. */
  light: number;
  /** Colourfulness of the average: about 0 for a grey sheet, 0.1 for a
   *  picture that is one saturated colour. */
  chroma: number;
  /** −1 a cool picture (blues, greens), +1 a warm one (reds, golds). */
  warmth: number;
  /** The average colour in OKLab, for tinting a mat or a mount. */
  lab: Rgb;
};

const WARM_BUCKETS = new Set(["red", "orange", "gold", "brown", "pink"]);
const COOL_BUCKETS = new Set(["blue", "teal", "green", "purple"]);
/** OKLab hue of orange, the middle of the warm side. */
const WARM_HUE = (60 * Math.PI) / 180;

type Framed = Pick<ArtworkListing, "id"> &
  Partial<
    Pick<
      ArtworkListing,
      | "movement"
      | "year"
      | "nationality"
      | "title"
      | "dominantColor"
      | "colorBuckets"
      | "realDimensions"
      | "width"
      | "height"
    >
  >;

/** The tone of a work from its average colour and its colour families.
 *  The average alone calls nearly every painting warm brown, so the
 *  families, read from a histogram, carry the hue. */
export function readPicture(artwork: Framed): PictureTone {
  const lab = toOklab(hexToLinear(artwork.dominantColor) ?? [0.2, 0.19, 0.17]);
  const chroma = Math.hypot(lab[1], lab[2]);
  const fromAverage = clamp(
    (chroma / 0.05) * Math.cos(Math.atan2(lab[2], lab[1]) - WARM_HUE),
    -1,
    1,
  );
  const buckets = artwork.colorBuckets ?? [];
  let warm = 0;
  let cool = 0;
  for (const b of buckets) {
    if (WARM_BUCKETS.has(b)) warm++;
    else if (COOL_BUCKETS.has(b)) cool++;
  }
  const fromBuckets = warm + cool > 0 ? (warm - cool) / (warm + cool) : 0;
  return {
    light: clamp(lab[0], 0, 1),
    chroma,
    warmth: clamp(0.45 * fromAverage + 0.55 * fromBuckets, -1, 1),
    lab,
  };
}

// ── Looks ─────────────────────────────────────────────────────────────

export type LookId =
  | "baroque"
  | "louisXV"
  | "regence"
  | "louisXVI"
  | "empire"
  | "salvator"
  | "salvatorBlack"
  | "cassetta"
  | "cassettaPainted"
  | "cassettaWalnut"
  | "spanish"
  | "barbizon"
  | "watts"
  | "whistler"
  | "degasWhite"
  | "secession"
  | "dutchRipple"
  | "ebonyCushion"
  | "blackPlate"
  | "bolection"
  | "fruitCushion"
  | "oakPlate"
  | "woodScoop"
  | "whiteScoop"
  | "paleGiltScoop"
  | "floater"
  | "strip"
  | "liner"
  | "printWood"
  | "printBlack"
  | "hogarth"
  | "printGilt"
  | "japanLacquer"
  | "japanWood"
  | "silkMount";

type Look = {
  style: FrameStyleId;
  /** Finishes the moulding comes in. The picture chooses among them. */
  main: FinishId[];
  /** Finishes of what lies inside the moulding (slot 1). */
  inner?: FinishId[];
  /** Finishes of the accent (slot 2). */
  accent?: FinishId[];
  /** The style's structural alternates this look uses. Default: all. */
  variants?: number[];
  /** Ornament for the field, when the look narrows the style's own list. */
  field?: Array<CarveBand | null>;
};

const LOOKS: Record<LookId, Look> = {
  baroque: { style: "leafTorus", main: ["gilt", "giltRed", "giltDark"] },
  louisXV: { style: "swept", main: ["gilt", "giltRed", "giltPale"] },
  regence: { style: "regence", main: ["gilt", "giltDark", "giltRed"] },
  louisXVI: { style: "flutedCove", main: ["gilt", "giltPale", "giltRed"] },
  empire: { style: "empire", main: ["gilt", "giltPale"] },
  salvator: { style: "salvator", main: ["gilt", "giltDark", "giltRed"], variants: [0] },
  salvatorBlack: {
    style: "salvator",
    main: ["gilt", "giltDark"],
    accent: ["blackMatte", "ebony"],
    variants: [1],
  },
  cassetta: { style: "cassetta", main: ["gilt", "giltDark"], variants: [0] },
  cassettaPainted: {
    style: "cassetta",
    main: ["gilt", "giltDark"],
    accent: ["azure", "boleRed", "blackMatte", "walnut"],
    variants: [1],
    // A painted frieze is not carved.
    field: [null],
  },
  cassettaWalnut: { style: "cassetta", main: ["walnut", "fruitwood"], variants: [0] },
  spanish: { style: "parcel", main: ["ebony", "blackMatte"], accent: ["gilt", "giltDark"] },
  barbizon: { style: "barbizon", main: ["gilt", "giltRed", "giltDark"] },
  watts: { style: "watts", main: ["gilt", "giltDark"], inner: ["giltOak"] },
  whistler: { style: "reeded", main: ["giltPale", "silver", "giltDark", "gilt"] },
  degasWhite: { style: "reeded", main: ["white", "greyPaint", "sage"] },
  secession: {
    style: "plate",
    main: ["giltDark", "gilt", "silver"],
    accent: ["giltPale"],
    field: ["hammer", "hammer", null],
  },
  dutchRipple: { style: "ripple", main: ["ebony"] },
  ebonyCushion: { style: "cushion", main: ["ebony", "blackLacquer"] },
  blackPlate: {
    style: "plate",
    main: ["blackMatte", "stained"],
    accent: ["gilt", "giltPale"],
    field: [null],
  },
  bolection: {
    style: "bolection",
    main: ["walnut", "mahogany", "oak", "rosewood"],
    inner: ["gilt", "giltDark"],
  },
  fruitCushion: { style: "cushion", main: ["fruitwood", "mahogany", "walnut", "maple"] },
  oakPlate: {
    style: "plate",
    main: ["oak", "ash", "walnut"],
    accent: ["giltDark", "gilt"],
    field: [null],
  },
  woodScoop: { style: "scoop", main: ["ash", "oak", "fruitwood"] },
  whiteScoop: { style: "scoop", main: ["white", "greyPaint", "sage"] },
  paleGiltScoop: { style: "scoop", main: ["giltPale", "silver"] },
  floater: {
    style: "floater",
    main: ["stained", "stained", "ash", "white", "walnut"],
    inner: ["canvasEdge"],
  },
  strip: { style: "strip", main: ["blackMatte", "white", "ash", "walnut", "giltPale", "stained"] },
  liner: {
    style: "liner",
    main: ["stained", "ash", "white", "giltPale", "oak"],
    inner: ["linen"],
    accent: ["giltPale", "gilt"],
  },
  printWood: {
    style: "print",
    main: ["ash", "oak", "maple", "walnut", "fruitwood"],
    inner: ["mat"],
    accent: ["giltPale"],
    variants: [0, 0, 3],
  },
  printBlack: {
    style: "print",
    main: ["blackMatte", "stained", "ebony"],
    inner: ["mat"],
    accent: ["giltPale"],
    variants: [0, 3, 1],
  },
  // The Hogarth frame: black between two gilt beads, the print room's
  // standard since the 18th century.
  hogarth: {
    style: "print",
    main: ["blackMatte", "ebony"],
    inner: ["mat"],
    accent: ["gilt", "giltPale"],
    variants: [2],
  },
  printGilt: {
    style: "print",
    main: ["gilt", "giltPale", "giltDark"],
    inner: ["mat"],
    accent: ["giltPale"],
    variants: [4, 4, 3],
  },
  japanLacquer: {
    style: "print",
    main: ["redLacquer", "blackLacquer"],
    inner: ["mat"],
    accent: ["giltPale"],
    variants: [1],
  },
  japanWood: {
    style: "print",
    main: ["kiri", "walnut", "stained", "rosewood"],
    inner: ["mat"],
    accent: ["giltPale"],
    variants: [0, 3],
  },
  silkMount: {
    style: "mount",
    main: ["walnut", "blackLacquer", "redLacquer", "rosewood"],
    inner: ["silk"],
    accent: ["brocade"],
  },
};

export const LOOK_IDS = Object.keys(LOOKS) as LookId[];

type Weights = Partial<Record<LookId, number>>;
type FrameRule = [movement: string, looks: Weights];

// First match wins, so a narrower name sits above the one it contains
// ("Northern Renaissance" above "Renaissance"). A rule lists the frames
// a museum would plausibly have a work of that school in, with a weight
// for how often.

/** Works on paper and silk: matted or mounted whatever their date. */
const PAPER_RULES: FrameRule[] = [
  ["Ukiyo-e", { japanLacquer: 4, japanWood: 3, printBlack: 1 }],
  ["Shin-hanga", { japanWood: 3, japanLacquer: 2, printWood: 2, printBlack: 2 }],
  ["Classical East Asian", { silkMount: 1 }],
  ["Nihonga", { silkMount: 1 }],
  ["Natural history", { printWood: 4, hogarth: 3, printBlack: 2, printGilt: 2 }],
  ["Botanical", { printGilt: 3, printWood: 3, hogarth: 3, printBlack: 1 }],
];

// biome-ignore format: one school a line reads as the table it is.
const PAINTING_RULES: FrameRule[] = [
  ["Northern Renaissance", { bolection: 3, cassettaWalnut: 2, dutchRipple: 2, cassetta: 2, cassettaPainted: 1, ebonyCushion: 1 }],
  ["Mannerism", { baroque: 2, cassetta: 2, salvator: 2, cassettaPainted: 1, spanish: 1 }],
  ["Renaissance", { cassetta: 4, cassettaPainted: 2, cassettaWalnut: 1, baroque: 1, salvator: 1 }],
  ["Flemish Baroque", { baroque: 3, dutchRipple: 2, spanish: 1, bolection: 1 }],
  ["Dutch Golden Age", { dutchRipple: 4, ebonyCushion: 2, bolection: 2, fruitCushion: 1 }],
  ["Baroque", { baroque: 4, salvator: 3, spanish: 2, salvatorBlack: 1, bolection: 1, regence: 1 }],
  ["Rococo", { louisXV: 5, regence: 3, baroque: 1, louisXVI: 1 }],
  ["Neoclassicism", { louisXVI: 4, empire: 3, salvator: 1, regence: 1 }],
  ["Academicism", { louisXVI: 2, barbizon: 2, empire: 2, watts: 1 }],
  ["Orientalism", { barbizon: 2, louisXVI: 2, baroque: 1, empire: 1 }],
  ["Hudson River", { barbizon: 3, louisXVI: 2, empire: 1 }],
  ["Romanticism", { empire: 2, louisXVI: 2, barbizon: 2, bolection: 2, baroque: 1, salvator: 1, fruitCushion: 1 }],
  ["Pre-Raphaelite", { watts: 4, cassetta: 2, whistler: 1, oakPlate: 1 }],
  ["Realism", { bolection: 3, barbizon: 3, louisXVI: 1, fruitCushion: 1, empire: 1 }],
  ["Tonalism", { whistler: 3, barbizon: 2, bolection: 2, paleGiltScoop: 1 }],
  ["Neo-Impressionism", { degasWhite: 3, whiteScoop: 3, paleGiltScoop: 1 }],
  ["Post-Impressionism", { whiteScoop: 2, woodScoop: 2, oakPlate: 2, degasWhite: 1, bolection: 1, dutchRipple: 1, barbizon: 1 }],
  ["Impressionism", { barbizon: 2, louisXV: 2, whiteScoop: 2, degasWhite: 2, paleGiltScoop: 2, woodScoop: 1, louisXVI: 1 }],
  ["Art Nouveau", { secession: 3, oakPlate: 2, whistler: 2, woodScoop: 1, ebonyCushion: 1 }],
  ["Symbolism", { secession: 2, watts: 2, bolection: 2, dutchRipple: 1, barbizon: 1, blackPlate: 1 }],
  ["Naive", { woodScoop: 2, bolection: 2, fruitCushion: 2, oakPlate: 1 }],
  ["Mir Iskusstva", { bolection: 2, oakPlate: 2, woodScoop: 1, secession: 1, blackPlate: 1 }],
  ["Regionalism", { oakPlate: 2, bolection: 2, woodScoop: 1, liner: 1 }],
  ["Cubism", { floater: 2, strip: 2, blackPlate: 2, liner: 1 }],
  ["Dada", { floater: 2, strip: 2, blackPlate: 1 }],
  ["Suprematism", { floater: 2, strip: 2 }],
  ["Bauhaus", { floater: 2, strip: 2 }],
  ["Expressionism", { liner: 2, blackPlate: 2, floater: 1, oakPlate: 1, strip: 1 }],
  ["Fauvism", { liner: 2, whiteScoop: 1, floater: 1, strip: 1 }],
  ["Modernism", { floater: 2, strip: 2, liner: 1, blackPlate: 1 }],
];

/** Works dated before this are panel paintings, whatever school they
 *  are tagged with. */
const PANEL_BEFORE_YEAR = 1500;
const PANEL_LOOKS: Weights = { cassetta: 4, cassettaPainted: 2, cassettaWalnut: 2, bolection: 1 };

/** Whether a movement tag has a frame rule of its own, or falls
 *  through to the date. */
export function hasFrameRule(movement: string): boolean {
  return [...PAPER_RULES, ...PAINTING_RULES].some(([name]) => movement.includes(name));
}

/** The frames a museum would plausibly have this work in, each with a
 *  weight: by movement, then by date for the works without one. */
export function looksFor(artwork: Pick<Framed, "movement" | "year">): Array<[LookId, number]> {
  return Object.entries(weightsFor(artwork)) as Array<[LookId, number]>;
}

function weightsFor(artwork: Pick<Framed, "movement" | "year">): Weights {
  const m = artwork.movement;
  const year = artwork.year;
  const paper = m && PAPER_RULES.find(([name]) => m.includes(name));
  if (paper) return paper[1];
  if (year != null && year < PANEL_BEFORE_YEAR) return PANEL_LOOKS;
  const painting = m && PAINTING_RULES.find(([name]) => m.includes(name));
  if (painting) return painting[1];
  if (year == null) return { bolection: 2, louisXVI: 1, woodScoop: 1, barbizon: 1 };
  if (year < 1700) return { baroque: 2, bolection: 2, dutchRipple: 1, salvator: 1 };
  if (year < 1860) return { louisXVI: 2, bolection: 2, empire: 1, baroque: 1 };
  if (year < 1905) return { barbizon: 2, bolection: 2, woodScoop: 1, louisXVI: 1 };
  return { blackPlate: 1, floater: 1, woodScoop: 1, liner: 1, strip: 1 };
}

// ── Fit: what the picture does to the weights ─────────────────────────

/** How well a finish sets off a picture: about 0.5 for a poor match,
 *  1 for neutral, 1.5 for a good one. */
function finishFit(finish: FinishId, tone: PictureTone, year: number | null | undefined): number {
  const { light, warmth, chroma } = tone;
  const dark = clamp((0.42 - light) / 0.2, 0, 1);
  const pale = clamp((light - 0.55) / 0.2, 0, 1);
  switch (FINISHES[finish].kind) {
    case "gold": {
      // Gilding is a second light source round a dark picture.
      let fit = 1 + 0.3 * dark - 0.15 * pale;
      if (finish === "giltRed") fit *= 1 - 0.4 * warmth;
      if (finish === "giltDark") fit *= year != null && year < 1650 ? 1.3 : 0.9;
      return fit;
    }
    case "paleGold":
      // Lemon gold cools a warm picture and keeps a high key high.
      return (1 + 0.4 * pale - 0.3 * dark) * (1 + 0.3 * Math.max(0, warmth));
    case "silver":
      return (1 + 0.3 * pale) * (1 - 0.45 * warmth) * (chroma < 0.03 ? 1.2 : 1);
    case "darkWood":
      // A dark wood round a dark picture is one dark shape.
      return (1 - 0.3 * dark) * (1 + 0.15 * Math.max(0, warmth));
    case "paleWood":
      return 1 + 0.35 * pale - 0.4 * dark;
    case "black":
      return 1 + 0.3 * pale - 0.2 * dark + (chroma > 0.06 ? 0.15 : 0);
    case "red":
      return 1 + 0.35 * warmth;
    case "pale":
      return 1 + 0.6 * pale - 0.55 * dark;
  }
}

const NATION_BIAS: Array<[nation: RegExp, looks: Partial<Record<LookId, number>>]> = [
  [
    /Dutch|Flemish|Netherlandish|Belgian/,
    { dutchRipple: 1.6, ebonyCushion: 1.4, fruitCushion: 1.3 },
  ],
  [/Spanish/, { spanish: 3, salvatorBlack: 1.5 }],
  [/Italian/, { salvator: 1.7, salvatorBlack: 1.5, cassetta: 1.3 }],
  [/French/, { louisXV: 1.3, regence: 1.3, louisXVI: 1.3, empire: 1.3, barbizon: 1.3 }],
  [/English|British|Scottish/, { watts: 1.4, salvator: 1.4, whistler: 1.2 }],
  [/American/, { whistler: 1.4, barbizon: 1.2 }],
  [/German|Austrian|Swiss|Danish/, { fruitCushion: 1.8, secession: 1.5, bolection: 1.2 }],
  [/Norwegian|Swedish|Finnish/, { oakPlate: 1.5, whiteScoop: 1.3 }],
];

const SUBJECT_BIAS: Array<[title: RegExp, looks: Partial<Record<LookId, number>>]> = [
  [
    /portrait|bildnis|self-portrait/i,
    { salvator: 1.4, empire: 1.3, louisXVI: 1.2, bolection: 1.2 },
  ],
  [
    /landscape|view of|river|forest|coast|sea\b|harbou?r|mountain|valley|lake/i,
    { barbizon: 1.5, woodScoop: 1.2 },
  ],
  [/still life|nature morte|stilleven/i, { dutchRipple: 1.4, bolection: 1.3, fruitCushion: 1.3 }],
];

/** Largest hung edge of a work in metres, or null without a size. */
function longEdge(artwork: Framed): number | null {
  const d = artwork.realDimensions;
  return d ? Math.max(d.widthCm, d.heightCm) / 100 : null;
}

/** The look's weight for this work: the school's, times how well its
 *  finishes suit the picture, its country, its subject and its size. */
function scoreLooks(artwork: Framed, tone: PictureTone): Array<[LookId, number]> {
  const edge = longEdge(artwork);
  return looksFor(artwork).map(([id, weight]) => {
    const look = LOOKS[id];
    // The look fits as well as its best finish does.
    let score = weight * Math.max(...look.main.map((f) => finishFit(f, tone, artwork.year)));
    for (const [nation, bias] of NATION_BIAS) {
      if (artwork.nationality && nation.test(artwork.nationality)) score *= bias[id] ?? 1;
    }
    for (const [title, bias] of SUBJECT_BIAS) {
      if (artwork.title && title.test(artwork.title)) score *= bias[id] ?? 1;
    }
    // A cabinet picture drowns in the heaviest mouldings.
    if (
      edge != null &&
      edge < 0.45 &&
      (id === "barbizon" || id === "louisXV" || id === "baroque")
    ) {
      score *= 0.6;
    }
    return [id, score];
  });
}

// ── Deterministic draws ───────────────────────────────────────────────

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  // Final mix, so ids that differ in one character land far apart.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in (0, 1) that depends only on the work and the question. */
const draw = (id: string, question: string) => (hash(`${question}\u0000${id}`) + 0.5) / 4294967296;

/** A weighted draw: each item wins in proportion to its weight raised
 *  to `sharpness`, and a small change of weights changes few picks. */
function drawWeighted<T extends string | number | null>(
  items: ReadonlyArray<readonly [T, number]>,
  id: string,
  question: string,
  sharpness = 1,
): T {
  let best = items[0][0];
  let bestKey = Number.NEGATIVE_INFINITY;
  for (const [item, weight] of items) {
    if (!(weight > 0)) continue;
    const key = Math.log(draw(id, `${question}/${item}`)) / weight ** sharpness;
    if (key > bestKey) {
      bestKey = key;
      best = item;
    }
  }
  return best;
}

/** A draw from a list in which a repeated item has that many chances. */
function drawFrom<T extends string | number | null>(items: readonly T[], id: string, q: string): T {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return drawWeighted([...counts.entries()], id, q);
}

// ── The design ────────────────────────────────────────────────────────

/** How one of a frame's materials is drawn. */
export type SlotLook = {
  finish: FinishId;
  surface: FrameSurface;
  /** Multiplier on the surface's own colour, linear RGB. */
  tint: Rgb;
  rough: number;
  burnish: number;
  wear: number;
  carve: number;
};

export type FrameDesign = {
  /** Two designs with the same key are the same frame. */
  key: string;
  look: LookId;
  style: FrameStyleId;
  options: StyleOptions;
  /** One entry per material slot of the moulding. */
  slots: SlotLook[];
  /** A framer's choice of a slimmer or a heavier cut of the moulding. */
  weight: number;
};

/** How strongly the picture sways the choice. At 1 the fit multiplies
 *  the weights as written; above it a good match wins more often. */
const FIT_SHARPNESS = 1.7;

/** Mat boards a print room stocks, sRGB. */
const MAT_TONES: Array<[tone: string, hex: string]> = [
  ["ivory", "#f3eee2"],
  ["white", "#f4f3ee"],
  ["buff", "#eadfc9"],
  ["oatmeal", "#e1d8c5"],
  ["stone", "#d8d6cd"],
  ["blueGrey", "#cdd3d6"],
  ["sage", "#d7dbcb"],
];

/** Mounting silks, sRGB. */
const SILK_TONES: Array<[tone: string, hex: string]> = [
  ["gold", "#96855c"],
  ["ivory", "#cfc4a6"],
  ["indigo", "#39435e"],
  ["celadon", "#8b9a84"],
  ["russet", "#84583c"],
  ["tea", "#6f6046"],
];

/** The tone of a mat for this sheet. A print room cuts the mat a step
 *  away from the paper so the sheet reads against it, then leans it
 *  toward the picture: buff and oatmeal beside warm sheets, stone and
 *  blue-grey beside cool ones. */
function matFor(artwork: Framed, tone: PictureTone): Rgb {
  const warm = Math.max(0, tone.warmth);
  const cool = Math.max(0, -tone.warmth);
  const whiteSheet = tone.light > 0.86 && tone.chroma < 0.03;
  const pick = drawWeighted(
    [
      ["ivory", 3],
      // A white mat round a white sheet loses the sheet's edge.
      ["white", whiteSheet ? 0.5 : 2],
      ["buff", 1 + 2 * warm + (whiteSheet ? 1 : 0)],
      ["oatmeal", 0.8 + 1.5 * warm],
      ["stone", 1 + 1.5 * cool + (whiteSheet ? 1 : 0)],
      ["blueGrey", 0.4 + 2.2 * cool],
      ["sage", 0.5 + 1.2 * cool + (whiteSheet ? 0.5 : 0)],
    ],
    artwork.id,
    "mat",
  );
  const base = toOklab(hexToLinear(MAT_TONES.find(([name]) => name === pick)?.[1]) ?? [1, 1, 1]);
  // A trace of the picture's own hue, and a little lighter or darker
  // from sheet to sheet, the way board from different batches is.
  const k = 0.22;
  const shade = (draw(artwork.id, "mat-shade") - 0.5) * 0.03;
  return fromOklab([
    clamp(base[0] + shade, 0.7, 0.97),
    base[1] + k * tone.lab[1],
    base[2] + k * tone.lab[2],
  ]);
}

/** The silk of a mount: a tone the painting does not already hold. A
 *  pale ground takes a deeper silk and a dark one a paler; a warm
 *  picture takes indigo or celadon and a cool one gold or russet. */
function silkFor(artwork: Framed, tone: PictureTone): Rgb {
  const warm = Math.max(0, tone.warmth);
  const cool = Math.max(0, -tone.warmth);
  const pale = clamp((tone.light - 0.5) / 0.3, 0, 1);
  const pick = drawWeighted(
    [
      ["gold", 2 + cool],
      ["ivory", 0.6 + 1.6 * (1 - pale)],
      ["indigo", 0.8 + 1.6 * warm + pale],
      ["celadon", 0.8 + 1.2 * warm],
      ["russet", 0.8 + 1.6 * cool],
      ["tea", 1 + 0.6 * pale],
    ],
    artwork.id,
    "silk",
  );
  const base = toOklab(hexToLinear(SILK_TONES.find(([name]) => name === pick)?.[1]) ?? [1, 1, 1]);
  const shade = (draw(artwork.id, "silk-shade") - 0.5) * 0.05;
  return fromOklab([base[0] + shade, base[1], base[2]]);
}

/** A finish's colour for this work, as a tint on its surface: the
 *  finish's own, shifted a little from frame to frame, and for gold
 *  leaned against the picture's warmth. */
function tintFor(finish: FinishId, artwork: Framed, tone: PictureTone, slot: number): Rgb {
  const spec = FINISHES[finish];
  let target: Rgb;
  if (finish === "mat") target = matFor(artwork, tone);
  else if (finish === "silk") target = silkFor(artwork, tone);
  else {
    const lab = toOklab(hexToLinear(spec.color) ?? [1, 1, 1]);
    const q = `tint${slot}`;
    // No two batches of leaf, stain or paint are one colour.
    lab[0] *= 1 + (draw(artwork.id, `${q}-l`) - 0.5) * 0.09;
    lab[1] += (draw(artwork.id, `${q}-a`) - 0.5) * 0.012;
    lab[2] += (draw(artwork.id, `${q}-b`) - 0.5) * 0.016;
    if (spec.surface === "leaf" || spec.surface === "leafOak") {
      // Toward red beside a cool picture, toward green beside a warm one.
      lab[1] -= 0.012 * tone.warmth;
    }
    target = fromOklab(lab);
  }
  const base = hexToLinear(SURFACE_BASE[spec.surface]) ?? [1, 1, 1];
  return [target[0] / base[0], target[1] / base[1], target[2] / base[2]];
}

/** Which material slots a profile uses. */
function slotsUsed(profile: readonly ShadedPoint[]): boolean[] {
  const used = new Array<boolean>(FRAME_SLOTS).fill(false);
  for (let i = 0; i < profile.length - 1; i++) used[profile[i].slot ?? 0] = true;
  return used;
}

/**
 * Build the design of `look` for `artwork`. `suits` scores a finish for
 * the picture, or for the two pictures of a pair.
 */
function designOf(
  lookId: LookId,
  artwork: Framed,
  tone: PictureTone,
  suits: (finish: FinishId) => number,
): FrameDesign {
  const look = LOOKS[lookId];
  const id = artwork.id;
  const choices = styleChoices(look.style);
  const edge = longEdge(artwork);

  const variant = look.variants
    ? drawFrom(look.variants, id, "variant")
    : Math.floor(draw(id, "variant") * choices.variants);
  let detail = Math.floor(draw(id, "detail") * choices.details);
  if (look.style === "print") {
    // A small sheet gets the wider mats, a large one the narrower:
    // the mat is there to give the sheet room, not to double its wall.
    const mat =
      edge == null
        ? Math.floor(draw(id, "mat-width") * 4)
        : edge < 0.4
          ? 2 + Math.floor(draw(id, "mat-width") * 2)
          : edge > 0.85
            ? Math.floor(draw(id, "mat-width") * 2)
            : 1 + Math.floor(draw(id, "mat-width") * 2);
    const line = draw(id, "mat-line") < 0.3 ? 4 : 0;
    const wide = draw(id, "frame-face") < 0.35 ? 8 : 0;
    detail = mat + line + wide;
  }
  const options: StyleOptions = {
    sight: drawFrom(choices.sight, id, "sight"),
    field: drawFrom(look.field ?? choices.field, id, "field"),
    crown: drawFrom(choices.crown, id, "crown"),
    variant,
    detail,
  };

  const used = slotsUsed(buildStyle(look.style, options).profile);
  const pools: FinishId[][] = [look.main, look.inner ?? look.main, look.accent ?? ["giltPale"]];
  // Gilding wears with age and handling, and no two frames alike.
  const age = artwork.year != null && artwork.year < 1700 ? 1.15 : 1;
  const wear = (0.7 + 0.6 * draw(id, "wear")) * age;
  const polish = 0.9 + 0.22 * draw(id, "polish");
  const depth = 0.8 + 0.35 * draw(id, "depth");

  const slots: SlotLook[] = pools.map((pool, slot) => {
    const finish =
      pool.length === 1 || !used[slot]
        ? pool[0]
        : drawWeighted(
            pool.map((f) => [f, suits(f)] as const),
            id,
            `finish${slot}`,
            FIT_SHARPNESS,
          );
    const spec = FINISHES[finish];
    return {
      finish,
      surface: spec.surface,
      tint: used[slot] ? tintFor(finish, artwork, tone, slot) : [1, 1, 1],
      rough: spec.rough * polish,
      burnish: spec.burnish,
      wear: spec.wear * wear,
      carve: spec.carve * depth,
    };
  });

  const weight = 0.9 + 0.22 * draw(id, "weight");
  const round = (x: number) => Math.round(x * 1000);
  const key = [
    lookId,
    options.sight,
    options.field,
    options.crown,
    variant,
    detail,
    round(weight),
    ...slots.flatMap((s, slot) =>
      used[slot] ? [s.finish, ...s.tint.map(round), round(s.wear)] : [],
    ),
  ].join("|");
  return { key, look: lookId, style: look.style, options, slots, weight };
}

// The hang asks for a work's frame every time it measures the work, a
// few thousand times a floor. Keyed by the record itself, so the cache
// goes when the catalogue does.
const designs = new WeakMap<Framed, FrameDesign>();

/** The frame a work hangs in. Deterministic per work. */
export function pickFrameDesign(artwork: Framed): FrameDesign {
  const hit = designs.get(artwork);
  if (hit) return hit;
  const tone = readPicture(artwork);
  const look = drawWeighted(scoreLooks(artwork, tone), artwork.id, "look", FIT_SHARPNESS);
  const design = designOf(look, artwork, tone, (f) => finishFit(f, tone, artwork.year));
  designs.set(artwork, design);
  return design;
}

/**
 * One frame for two works hung as a pair (the Grand Hall's mirrored
 * slots). It is drawn from the looks both schools hang in, each
 * weighted by how well it suits both pictures, and built from the lead
 * work's draws, so the pair's frame is still the lead's own kind of
 * frame. Two schools with no look in common keep the lead's own design.
 */
export function pickPairDesign(lead: Framed, partner: Framed): FrameDesign {
  const leadTone = readPicture(lead);
  const partnerTone = readPicture(partner);
  const theirs = new Map(scoreLooks(partner, partnerTone));
  const shared = scoreLooks(lead, leadTone)
    .map(([id, score]) => [id, Math.sqrt(score * (theirs.get(id) ?? 0))] as const)
    .filter(([, score]) => score > 0);
  if (shared.length === 0) return pickFrameDesign(lead);
  const look = drawWeighted(shared, lead.id, "look", FIT_SHARPNESS);
  return designOf(look, lead, leadTone, (f) =>
    Math.sqrt(finishFit(f, leadTone, lead.year) * finishFit(f, partnerTone, partner.year)),
  );
}

// ── Size ──────────────────────────────────────────────────────────────

/** Moulding scale for a canvas of the given size, metres. A framer cuts
 *  a heavier moulding for a larger picture. */
export function frameScale(design: FrameDesign, widthM: number, heightM: number): number {
  const [lo, hi] = styleChoices(design.style).scale;
  return clamp(0.5 + 0.3 * Math.max(widthM, heightM), lo, hi) * design.weight;
}

/** How far a work's frame reaches past each canvas edge, metres, at its
 *  widest. The hang reserves this on both sides of every work. */
export function frameReach(design: FrameDesign, widthM: number, heightM: number): number {
  return buildStyle(design.style, design.options).width * frameScale(design, widthM, heightM);
}

/** The moulding of a design cut for a canvas of the given size. */
export function frameMoulding(
  design: FrameDesign,
  widthM: number,
  heightM: number,
): { profile: ShadedPoint[]; swell: Swell | null } {
  const style = buildStyle(design.style, design.options);
  const scale = frameScale(design, widthM, heightM);
  return {
    profile: scaleProfile(style.profile, scale),
    swell: style.swell && scaleSwell(style.swell, scale),
  };
}
