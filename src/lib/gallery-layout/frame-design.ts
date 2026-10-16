// Which frame a work hangs in.
//
// A frame design is a moulding (frame-styles.ts), the ornament carved
// on it, a finish for each of its materials, and a few numbers that are
// the work's own: how heavy the moulding is cut, how worn the gilding
// is, the exact tone of its gold or its mat, sometimes a liner set
// inside it. The combinations outnumber the works many times over, so
// no two works share one, while the renderer still draws all of them
// with nine materials and one texture atlas.
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
// That is a work's own frame, and it is what the hang measures a wall
// with. What hangs is chosen once more, with the room (`Hanging`): the
// wall colour scores each finish, a room keeps to one family of
// finishes, and a wall leads with one frame. A work follows where its
// school has that frame, so a room reads as one hang and the variety is
// from room to room.
//
// No three.js here: the hang reads `frameReach`.

import type { ArtworkListing } from "@/lib/data";
import {
  CANVAS_FACE_Z,
  type CarveBand,
  FRAME_SLOTS,
  type ShadedPoint,
  scaleProfile,
} from "./frame-profiles";
import {
  type BuiltStyle,
  buildStyle,
  type CornerBlocks,
  type FrameExtents,
  type FrameStyleId,
  type Rail,
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
  | "bronze"
  | "copper"
  | "pewter"
  | "giltOak"
  | "walnut"
  | "mahogany"
  | "rosewood"
  | "fruitwood"
  | "oak"
  | "maple"
  | "ash"
  | "kiri"
  | "limedOak"
  | "greenOak"
  | "stained"
  | "ebony"
  | "blackLacquer"
  | "redLacquer"
  | "tortoise"
  | "white"
  | "greyPaint"
  | "blueGrey"
  | "sage"
  | "blackMatte"
  | "azure"
  | "boleRed"
  | "mat"
  | "matInner"
  | "silk"
  | "brocade"
  | "linen"
  | "linenGrey"
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
  // Bronze powder and Dutch metal, gone brown; copper and pewter leaf,
  // as the Arts and Crafts workshops beat them.
  bronze: finish("leaf", "#8c6b3c", "gold", 1.2, 0.7, 0.8, 1),
  copper: finish("leaf", "#b9764a", "gold", 1.05, 0.8, 0.5, 1),
  pewter: finish("leaf", "#8f8e86", "silver", 1.15, 0.7, 0.4, 1),
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
  limedOak: finish("paleWood", "#b9b1a2", "pale", 1.1, 0.2, 0, 0.6),
  // Oak stained green, a Secession and Arts and Crafts finish.
  greenOak: finish("paleWood", "#5d6548", "darkWood", 1, 0.25, 0, 0.7),
  // Black-stained ash: the grain still shows.
  stained: finish("paleWood", "#231f1c", "black", 1.12, 0.2, 0, 0.6),
  // Ebonised and polished.
  ebony: finish("lacquer", "#12100f", "black", 1, 0.3, 0, 1),
  blackLacquer: finish("lacquer", "#0c0b0d", "black", 0.85, 0.3, 0, 1),
  // Red-black urushi.
  redLacquer: finish("lacquer", "#4a100c", "red", 0.87, 0.3, 0, 1),
  // Tortoiseshell veneer between the ripples of a Dutch frame.
  tortoise: finish("lacquer", "#5c2513", "red", 0.8, 0.3, 0, 0),
  // Painted frames: the white and tinted frames Degas, Pissarro and
  // Seurat showed in, and the painted friezes of a cassetta.
  white: finish("paint", "#e6e1d3", "pale", 1, 0.15, 0, 0.6),
  greyPaint: finish("paint", "#b5b3a8", "pale", 1, 0.15, 0, 0.6),
  blueGrey: finish("paint", "#8d9aa3", "pale", 1, 0.15, 0, 0.6),
  sage: finish("paint", "#a6ab95", "pale", 1, 0.15, 0, 0.6),
  blackMatte: finish("paint", "#1c1b1a", "black", 0.9, 0.2, 0, 0.7),
  azure: finish("paint", "#2a3c5e", "black", 1, 0.1, 0, 0.5),
  boleRed: finish("paint", "#6a2a1e", "red", 1, 0.1, 0, 0.5),
  // A mat and a mounting silk take their colour from the sheet inside
  // them (`matFor`, `silkFor`); these are only their starting tones.
  mat: finish("board", "#f3eee2", "pale"),
  // The second board of a double mat (`matInnerFor`).
  matInner: finish("board", "#b9b3a4", "pale"),
  silk: finish("silk", "#96855c", "paleWood"),
  brocade: finish("silk", "#b3924e", "gold", 0.8),
  linen: finish("cloth", "#d6cdb8", "pale"),
  linenGrey: finish("cloth", "#b7b4aa", "pale"),
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

const SURFACE_LINEAR = Object.fromEntries(
  Object.entries(SURFACE_BASE).map(([surface, hex]) => [surface, hexToLinear(hex) ?? [1, 1, 1]]),
) as Record<FrameSurface, Rgb>;

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
  | "japanBamboo"
  | "oxford"
  | "silkMount"
  | "tabernacle"
  | "reverse"
  | "reverseBlack"
  | "panelFrame"
  | "kent"
  | "narrowGilt"
  | "narrowWood"
  | "tortoiseshell"
  | "greyGilt"
  | "bullseye"
  | "oakBlocks"
  | "hammered"
  | "deco"
  | "canted"
  | "stuck";

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
  details?: number[];
  /** A liner some frames of this look are fitted with: how often, and
   *  in which finishes (slot 1). */
  liner?: { chance: number; finishes: FinishId[] };
  /** Ornament for the field, when the look narrows the style's own list. */
  field?: Array<CarveBand | null>;
};

const GILT_SLIP = { chance: 0.3, finishes: ["gilt", "giltDark"] as FinishId[] };

// biome-ignore format: one look a line reads as the table it is.
const LOOKS: Record<LookId, Look> = {
  // Carved and gilt.
  baroque: { style: "leafTorus", main: ["gilt", "giltRed", "giltDark"] },
  louisXV: { style: "swept", main: ["gilt", "giltRed", "giltPale"] },
  regence: { style: "regence", main: ["gilt", "giltDark", "giltRed"] },
  louisXVI: { style: "flutedCove", main: ["gilt", "giltPale", "giltRed"], liner: { chance: 0.15, finishes: ["giltPale", "linen"] } },
  empire: { style: "empire", main: ["gilt", "giltPale"], liner: { chance: 0.2, finishes: ["giltPale", "linen"] } },
  salvator: { style: "salvator", main: ["gilt", "giltDark", "giltRed"], variants: [0] },
  salvatorBlack: { style: "salvator", main: ["gilt", "giltDark"], accent: ["blackMatte", "ebony"], variants: [1] },
  reverse: { style: "scotia", main: ["gilt", "giltDark", "giltRed", "bronze"] },
  panelFrame: { style: "panel", main: ["gilt", "giltRed", "giltDark"] },
  kent: { style: "kent", main: ["gilt", "giltPale", "giltDark"] },
  narrowGilt: { style: "morland", main: ["gilt", "giltPale", "giltDark", "giltRed"] },
  cassetta: { style: "cassetta", main: ["gilt", "giltDark"], variants: [0] },
  // A painted frieze is not carved.
  cassettaPainted: { style: "cassetta", main: ["gilt", "giltDark"], accent: ["azure", "boleRed", "blackMatte", "walnut"], variants: [1], field: [null] },
  cassettaWalnut: { style: "cassetta", main: ["walnut", "fruitwood"], variants: [0] },
  tabernacle: { style: "tabernacle", main: ["gilt", "giltDark"], accent: ["azure", "boleRed", "blackMatte"] },
  barbizon: { style: "barbizon", main: ["gilt", "giltRed", "giltDark"], liner: { chance: 0.3, finishes: ["linen", "giltPale", "gilt"] } },
  watts: { style: "watts", main: ["gilt", "giltDark"], inner: ["giltOak"] },
  whistler: { style: "reeded", main: ["giltPale", "silver", "giltDark", "gilt"], details: [0], liner: { chance: 0.35, finishes: ["giltPale", "gilt"] } },
  secession: { style: "plate", main: ["giltDark", "gilt", "silver"], accent: ["giltPale"], field: ["hammer", "hammer", null], variants: [0, 1] },
  // Beaten metal on a plain board, as the Arts and Crafts shops made it.
  hammered: { style: "plate", main: ["copper", "bronze", "pewter"], field: ["hammer"], variants: [0] },
  // Parcel gilt: a second colour with gilt members.
  spanish: { style: "parcel", main: ["ebony", "blackMatte"], accent: ["gilt", "giltDark"] },
  // Painted grey or white with gilt beads: Louis XVI and Gustavian.
  greyGilt: { style: "parcel", main: ["greyPaint", "white", "sage", "blueGrey"], accent: ["gilt", "giltPale"] },
  // Dark.
  dutchRipple: { style: "ripple", main: ["ebony"], variants: [0, 1], liner: { chance: 0.25, finishes: ["gilt", "giltDark"] } },
  tortoiseshell: { style: "ripple", main: ["ebony"], accent: ["tortoise"], variants: [2] },
  reverseBlack: { style: "scotia", main: ["ebony", "blackMatte", "walnut"], liner: GILT_SLIP },
  ebonyCushion: { style: "cushion", main: ["ebony", "blackLacquer"], liner: { chance: 0.35, finishes: ["gilt", "giltDark"] } },
  blackPlate: { style: "plate", main: ["blackMatte", "stained"], accent: ["gilt", "giltPale"], field: [null], variants: [0, 1], liner: { chance: 0.25, finishes: ["linen", "white"] } },
  // Wood.
  bolection: { style: "bolection", main: ["walnut", "mahogany", "oak", "rosewood"], inner: ["gilt", "giltDark"] },
  fruitCushion: { style: "cushion", main: ["fruitwood", "mahogany", "walnut", "maple"], liner: GILT_SLIP },
  narrowWood: { style: "morland", main: ["walnut", "mahogany", "fruitwood", "ebony"] },
  oakPlate: { style: "plate", main: ["oak", "ash", "walnut"], accent: ["giltDark", "gilt"], field: [null], variants: [0, 1], liner: { chance: 0.3, finishes: ["linen", "giltDark"] } },
  // A rosette block on each corner.
  oakBlocks: { style: "plate", main: ["oak", "greenOak", "walnut"], field: [null], variants: [2] },
  bullseye: { style: "reeded", main: ["walnut", "mahogany", "oak", "giltPale", "white"], details: [1] },
  woodScoop: { style: "scoop", main: ["ash", "oak", "fruitwood"], liner: { chance: 0.3, finishes: ["linen", "giltPale"] } },
  canted: { style: "canted", main: ["ash", "oak", "limedOak", "white", "blackMatte", "walnut", "greenOak"], liner: { chance: 0.25, finishes: ["linen", "linenGrey", "white"] } },
  // Pale and painted.
  whiteScoop: { style: "scoop", main: ["white", "greyPaint", "sage"], liner: { chance: 0.25, finishes: ["linen", "white"] } },
  degasWhite: { style: "reeded", main: ["white", "greyPaint", "sage", "blueGrey"], details: [0], liner: { chance: 0.3, finishes: ["white", "linen"] } },
  paleGiltScoop: { style: "scoop", main: ["giltPale", "silver"] },
  // Modern.
  deco: { style: "deco", main: ["silver", "pewter", "giltPale", "blackLacquer", "white"], accent: ["silver", "blackLacquer", "giltPale", "copper"] },
  floater: { style: "floater", main: ["stained", "stained", "ash", "white", "walnut"], inner: ["canvasEdge"] },
  strip: { style: "strip", main: ["blackMatte", "white", "ash", "walnut", "giltPale", "stained"] },
  liner: { style: "liner", main: ["stained", "ash", "white", "giltPale", "oak"], inner: ["linen", "linenGrey"], accent: ["giltPale", "gilt"] },
  // Paper.
  printWood: { style: "print", main: ["ash", "oak", "maple", "walnut", "fruitwood"], inner: ["mat"], accent: ["giltPale", "blackMatte"], variants: [0, 0, 3] },
  printBlack: { style: "print", main: ["blackMatte", "stained", "ebony"], inner: ["mat"], accent: ["giltPale"], variants: [0, 3, 1] },
  // The Hogarth frame: black between two gilt beads, the print room's
  // standard since the 18th century.
  hogarth: { style: "print", main: ["blackMatte", "ebony"], inner: ["mat"], accent: ["gilt", "giltPale"], variants: [2] },
  printGilt: { style: "print", main: ["gilt", "giltPale", "giltDark"], inner: ["mat"], accent: ["giltPale", "blackMatte"], variants: [4, 4, 3] },
  // Four bars crossing at the corners: the Victorian Oxford frame.
  oxford: { style: "oxford", main: ["oak", "walnut", "maple", "ebony", "stained"], inner: ["mat"] },
  japanLacquer: { style: "print", main: ["redLacquer", "blackLacquer"], inner: ["mat"], accent: ["giltPale"], variants: [1] },
  japanWood: { style: "print", main: ["kiri", "walnut", "stained", "rosewood"], inner: ["mat"], accent: ["giltPale", "blackMatte"], variants: [0, 3] },
  japanBamboo: { style: "print", main: ["kiri", "maple", "ash", "stained", "walnut"], inner: ["mat"], accent: ["blackMatte"], variants: [5] },
  // Silk.
  silkMount: { style: "mount", main: ["walnut", "blackLacquer", "redLacquer", "rosewood"], inner: ["silk"], accent: ["brocade"] },
  // One frame, for one work: Franz von Stuck's own design for his
  // Salome (PINNED_FRAMES). No school draws it.
  stuck: { style: "stuck", main: ["gilt"] },
};

export const LOOK_IDS = Object.keys(LOOKS) as LookId[];

type Weights = Partial<Record<LookId, number>>;
type FrameRule = [movement: string, looks: Weights];

// First match wins, so a narrower name sits above the one it contains
// ("Northern Renaissance" above "Renaissance"). A rule lists the frames
// a museum would plausibly have a work of that school in, with a weight
// for how often.

/** Works on paper and silk: matted or mounted whatever their date. A
 *  painting on silk hangs framed in a flat mount, upright or wide:
 *  no work hangs as a scroll. */
// biome-ignore format: one school a line reads as the table it is.
const PAPER_RULES: FrameRule[] = [
  ["Ukiyo-e", { japanLacquer: 4, japanWood: 3, japanBamboo: 2, printBlack: 1 }],
  ["Shin-hanga", { japanWood: 3, japanLacquer: 2, japanBamboo: 2, printWood: 2, printBlack: 2 }],
  ["Classical East Asian", { silkMount: 1 }],
  ["Nihonga", { silkMount: 1 }],
  ["Natural history", { printWood: 4, hogarth: 3, oxford: 2, printBlack: 2, printGilt: 2 }],
  ["Botanical", { printGilt: 3, printWood: 3, hogarth: 3, oxford: 1, printBlack: 1 }],
];

// biome-ignore format: one school a line reads as the table it is.
const PAINTING_RULES: FrameRule[] = [
  ["Northern Renaissance", { bolection: 3, cassettaWalnut: 2, dutchRipple: 2, cassetta: 2, cassettaPainted: 1, ebonyCushion: 1, tabernacle: 1, reverseBlack: 1, tortoiseshell: 1, narrowWood: 1 }],
  ["Mannerism", { baroque: 2, cassetta: 2, salvator: 2, reverse: 2, cassettaPainted: 1, spanish: 1, tabernacle: 1 }],
  ["Renaissance", { cassetta: 4, cassettaPainted: 2, tabernacle: 2, cassettaWalnut: 1, baroque: 1, salvator: 1, reverse: 1 }],
  ["Flemish Baroque", { baroque: 3, dutchRipple: 2, spanish: 1, bolection: 1, reverse: 1, reverseBlack: 1, tortoiseshell: 1 }],
  ["Dutch Golden Age", { dutchRipple: 4, ebonyCushion: 2, bolection: 2, tortoiseshell: 2, reverseBlack: 2, fruitCushion: 1, narrowWood: 1 }],
  ["Baroque", { baroque: 4, salvator: 3, spanish: 2, reverse: 2, panelFrame: 2, salvatorBlack: 1, bolection: 1, regence: 1, kent: 1 }],
  ["Rococo", { louisXV: 5, regence: 3, baroque: 1, louisXVI: 1, kent: 1, panelFrame: 1, greyGilt: 1, narrowGilt: 1 }],
  ["Neoclassicism", { louisXVI: 4, empire: 3, greyGilt: 2, salvator: 1, regence: 1, kent: 1, narrowGilt: 1 }],
  ["Academicism", { louisXVI: 2, barbizon: 2, empire: 2, watts: 1, narrowGilt: 1 }],
  ["Orientalism", { barbizon: 2, louisXVI: 2, baroque: 1, empire: 1, reverse: 1 }],
  ["Hudson River", { barbizon: 3, louisXVI: 2, empire: 1, bullseye: 1 }],
  ["Romanticism", { empire: 2, louisXVI: 2, barbizon: 2, bolection: 2, baroque: 1, salvator: 1, fruitCushion: 1, narrowGilt: 1, greyGilt: 1, panelFrame: 1 }],
  ["Pre-Raphaelite", { watts: 4, cassetta: 2, whistler: 1, oakPlate: 1, oakBlocks: 1, tabernacle: 1 }],
  ["Realism", { bolection: 3, barbizon: 3, louisXVI: 1, fruitCushion: 1, empire: 1, bullseye: 1, narrowGilt: 1, narrowWood: 1, oakBlocks: 1 }],
  ["Tonalism", { whistler: 3, barbizon: 2, bolection: 2, paleGiltScoop: 1, bullseye: 1 }],
  ["Neo-Impressionism", { degasWhite: 3, whiteScoop: 3, paleGiltScoop: 1, canted: 1 }],
  ["Post-Impressionism", { whiteScoop: 2, woodScoop: 2, oakPlate: 2, canted: 2, degasWhite: 1, bolection: 1, dutchRipple: 1, barbizon: 1, hammered: 1, oakBlocks: 1 }],
  ["Impressionism", { barbizon: 2, louisXV: 2, whiteScoop: 2, degasWhite: 2, paleGiltScoop: 2, woodScoop: 1, louisXVI: 1, canted: 1, narrowGilt: 1 }],
  ["Art Nouveau", { secession: 3, oakPlate: 2, whistler: 2, hammered: 2, woodScoop: 1, ebonyCushion: 1, deco: 1, oakBlocks: 1 }],
  ["Symbolism", { secession: 2, watts: 2, bolection: 2, dutchRipple: 1, barbizon: 1, blackPlate: 1, hammered: 1, oakBlocks: 1, tabernacle: 1 }],
  ["Naive", { woodScoop: 2, bolection: 2, fruitCushion: 2, oakPlate: 1, canted: 1, bullseye: 1, oakBlocks: 1 }],
  ["Mir Iskusstva", { bolection: 2, oakPlate: 2, woodScoop: 1, secession: 1, blackPlate: 1, deco: 1, canted: 1, hammered: 1 }],
  ["Regionalism", { oakPlate: 2, bolection: 2, canted: 2, woodScoop: 1, liner: 1, deco: 1 }],
  ["Cubism", { floater: 2, strip: 2, blackPlate: 2, deco: 2, liner: 1, canted: 1 }],
  ["Dada", { floater: 2, strip: 2, blackPlate: 1, deco: 1 }],
  ["Suprematism", { floater: 2, strip: 2, canted: 1 }],
  ["Bauhaus", { floater: 2, strip: 2, deco: 1 }],
  ["Expressionism", { liner: 2, blackPlate: 2, canted: 2, floater: 1, oakPlate: 1, strip: 1, deco: 1 }],
  ["Fauvism", { liner: 2, canted: 2, whiteScoop: 1, floater: 1, strip: 1 }],
  ["Modernism", { floater: 2, strip: 2, deco: 2, liner: 1, blackPlate: 1, canted: 1 }],
];

/** Works dated before this are panel paintings, whatever school they
 *  are tagged with. */
const PANEL_BEFORE_YEAR = 1500;
// biome-ignore format: a table.
const PANEL_LOOKS: Weights = { cassetta: 4, tabernacle: 3, cassettaPainted: 2, cassettaWalnut: 2, bolection: 1 };

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
  if (year == null) return { bolection: 2, louisXVI: 1, woodScoop: 1, barbizon: 1, narrowGilt: 1 };
  if (year < 1700) return { baroque: 2, bolection: 2, dutchRipple: 1, salvator: 1, reverse: 1 };
  if (year < 1860) return { louisXVI: 2, bolection: 2, empire: 1, baroque: 1, narrowGilt: 1 };
  if (year < 1905) return { barbizon: 2, bolection: 2, woodScoop: 1, louisXVI: 1, narrowGilt: 1 };
  return { blackPlate: 1, floater: 1, woodScoop: 1, liner: 1, strip: 1, deco: 1, canted: 1 };
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

// biome-ignore format: a table.
const NATION_BIAS: Array<[nation: RegExp, looks: Weights]> = [
  [/Dutch|Flemish|Netherlandish|Belgian/, { dutchRipple: 1.6, ebonyCushion: 1.4, fruitCushion: 1.3, tortoiseshell: 1.6, reverseBlack: 1.5 }],
  [/Spanish/, { spanish: 3, salvatorBlack: 1.5 }],
  [/Italian/, { salvator: 1.7, salvatorBlack: 1.5, cassetta: 1.3, reverse: 1.6, panelFrame: 1.4, tabernacle: 1.3 }],
  [/French/, { louisXV: 1.3, regence: 1.3, louisXVI: 1.3, empire: 1.3, barbizon: 1.3 }],
  [/English|British|Scottish/, { watts: 1.4, salvator: 1.4, whistler: 1.2, kent: 2.5, panelFrame: 1.6 }],
  [/American/, { whistler: 1.4, barbizon: 1.2, bullseye: 2 }],
  [/German|Austrian|Swiss|Danish/, { fruitCushion: 1.8, secession: 1.5, bolection: 1.2, hammered: 1.5, deco: 1.2 }],
  [/Norwegian|Swedish|Finnish|Danish/, { oakPlate: 1.5, whiteScoop: 1.3, greyGilt: 2.5 }],
];

// biome-ignore format: a table.
const SUBJECT_BIAS: Array<[title: RegExp, looks: Weights]> = [
  [/portrait|bildnis|self-portrait/i, { salvator: 1.4, empire: 1.3, louisXVI: 1.2, bolection: 1.2, panelFrame: 1.4, kent: 1.2 }],
  [/landscape|view of|river|forest|coast|sea\b|harbou?r|mountain|valley|lake/i, { barbizon: 1.5, woodScoop: 1.2, canted: 1.2 }],
  [/still life|nature morte|stilleven/i, { dutchRipple: 1.4, bolection: 1.3, fruitCushion: 1.3, tortoiseshell: 1.3 }],
];

/** Subjects an altarpiece shows. A tabernacle frame is church
 *  architecture: it suits these and looks borrowed on a portrait. */
const SACRED =
  /madonna|virgin|annunciation|adoration|nativity|crucifi|saint|\bst\.? |christ|piet[aà]|altar|holy|baptism|lamentation|coronation|assumption|resurrection|entombment|trinity/i;

/** Largest hung edge of a work in metres, or null without a size. */
function longEdge(artwork: Framed): number | null {
  const d = artwork.realDimensions;
  return d ? Math.max(d.widthCm, d.heightCm) / 100 : null;
}

/** What a work's record says of it apart from its picture: read once,
 *  because a hang scores a work's looks several times over. */
type Bearings = {
  looks: Array<[LookId, number]>;
  /** The country and subject tables its record matches. */
  biases: Weights[];
  sacred: boolean;
  edge: number | null;
};

const bearings = new WeakMap<Framed, Bearings>();

function bearingsOf(artwork: Framed): Bearings {
  let read = bearings.get(artwork);
  if (!read) {
    const { nationality, title } = artwork;
    read = {
      looks: looksFor(artwork),
      biases: [
        ...NATION_BIAS.filter(([nation]) => nationality && nation.test(nationality)),
        ...SUBJECT_BIAS.filter(([subject]) => title && subject.test(title)),
      ].map(([, bias]) => bias),
      sacred: Boolean(title && SACRED.test(title)),
      edge: longEdge(artwork),
    };
    bearings.set(artwork, read);
  }
  return read;
}

/** The look's weight for this work: the school's, times how well its
 *  finishes do (`main` scores one), its country, its subject and its
 *  size. */
function scoreLooks(artwork: Framed, main: (finish: FinishId) => number): Array<[LookId, number]> {
  const { looks, biases, sacred, edge } = bearingsOf(artwork);
  return looks.map(([id, weight]) => {
    const look = LOOKS[id];
    // The look fits as well as its best finish does.
    let score = weight * Math.max(...look.main.map((f) => main(f)));
    for (const bias of biases) score *= bias[id] ?? 1;
    // A cabinet picture drowns in the heaviest mouldings, and a narrow
    // one is lost round a large canvas.
    const heavy = id === "barbizon" || id === "louisXV" || id === "baroque";
    const narrow = id === "narrowGilt" || id === "narrowWood";
    if (edge != null && edge < 0.45 && heavy) score *= 0.6;
    if (edge != null && narrow) score *= edge < 0.6 ? 2.2 : edge > 1.3 ? 0.2 : 1;
    if (id === "tabernacle") {
      score *= sacred ? 3 : 0.35;
      // An entablature over a 3 m canvas is a building, not a frame.
      if (edge != null && edge > 2.4) score *= 0.4;
    }
    return [id, score];
  });
}

// ── Deterministic draws ───────────────────────────────────────────────

/** One more string into an FNV-1a hash. */
function hashOn(h: number, text: string): number {
  let out = h;
  for (let i = 0; i < text.length; i++) out = Math.imul(out ^ text.charCodeAt(i), 16777619);
  return out;
}

/**
 * A number in (0, 1) that depends only on the work and the question.
 * The hash is of `question`, then `/` and `item` when one is given, a
 * NUL, and `id`. It takes them a string at a time: a frame is some
 * forty draws, and joining the strings first was a third of the time a
 * floor took to lay out.
 */
function draw(id: string, question: string, item?: string): number {
  let h = hashOn(2166136261, question);
  // "/" is 47; a NUL changes nothing in the xor.
  if (item !== undefined) h = hashOn(Math.imul(h ^ 47, 16777619), item);
  h = hashOn(Math.imul(h, 16777619), id);
  // Final mix, so ids that differ in one character land far apart.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) + 0.5) / 4294967296;
}

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
    const key = Math.log(draw(id, question, String(item))) / weight ** sharpness;
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

// ── The wall and the neighbours ───────────────────────────────────────

/** Finishes that read as one from across a room. `silk` is every silk
 *  mount, whatever its edge is made of. */
export type FinishFamily = "gilt" | "silver" | "dark" | "wood" | "pale" | "red" | "silk";

// biome-ignore format: a table.
const FAMILY_FINISHES: Record<Exclude<FinishFamily, "silk">, FinishId[]> = {
  gilt: ["gilt", "giltPale", "giltRed", "giltDark", "giltOak", "bronze", "copper"],
  silver: ["silver", "pewter"],
  dark: ["walnut", "mahogany", "rosewood", "stained", "ebony", "blackLacquer", "blackMatte"],
  wood: ["fruitwood", "oak", "greenOak", "maple", "ash", "kiri"],
  pale: ["limedOak", "white", "greyPaint", "blueGrey", "sage"],
  red: ["redLacquer"],
};

const FAMILY_OF = new Map<FinishId, FinishFamily>(
  (Object.entries(FAMILY_FINISHES) as Array<[FinishFamily, FinishId[]]>).flatMap(
    ([family, finishes]) => finishes.map((f) => [f, family] as const),
  ),
);

/** The family a frame of this look reads as with its moulding in
 *  `finish`. Null for a finish no moulding comes in. */
export function familyOf(look: LookId, finish: FinishId): FinishFamily | null {
  const style = LOOKS[look].style;
  if (style === "mount") return "silk";
  return FAMILY_OF.get(finish) ?? null;
}

/** OKLab of a `#rrggbb` this module names itself: a finish, a mat
 *  board, a silk. Parsed once. */
const NAMED_LAB = new Map<string, Rgb>();

function labOfHex(hex: string): Rgb {
  let lab = NAMED_LAB.get(hex);
  if (!lab) {
    lab = toOklab(hexToLinear(hex) ?? [1, 1, 1]);
    NAMED_LAB.set(hex, lab);
  }
  return lab;
}

const labOf = (finish: FinishId): Rgb => labOfHex(FINISHES[finish].color);

/** How clear a colour is of a wall: 0 where it sinks into it, 1 where
 *  it stands off. The distance is in OKLab: walnut is 0.07 from the
 *  charcoal of the East Asian rooms and ebony 0.18, maple 0.02 from the
 *  ochre of the Post-Impressionist ones and oak 0.16. */
function clearOf(lab: Rgb, wall: Rgb): number {
  const apart = Math.hypot(lab[0] - wall[0], lab[1] - wall[1], lab[2] - wall[2]);
  const t = clamp((apart - 0.05) / 0.15, 0, 1);
  return t * t * (3 - 2 * t);
}

/** How well a moulding in this finish does on a wall of this colour,
 *  0.25 to 1. Leaf loses less: its highlights and the shadow in its
 *  hollows show it where a paint or a wood of the wall's tone is lost. */
function wallFit(finish: FinishId, wall: Rgb): number {
  const clear = clearOf(labOf(finish), wall);
  const { surface } = FINISHES[finish];
  return surface === "leaf" || surface === "leafOak" ? 0.6 + 0.4 * clear : 0.25 + 0.75 * clear;
}

/** What the hang decides for a work before its frame is drawn
 *  (`roomHanging`, `wallHanging`). */
export type Hanging = {
  /** The wall behind the work, OKLab. */
  wall: Rgb | null;
  /** The family of finishes its room keeps to. */
  family: FinishFamily | null;
  /** The frame its wall leads with. */
  lead: { look: LookId; finish: FinishId } | null;
  /** The works it hangs among. Their liners, accents, mats and silks
   *  are drawn once for all of them, on `key`, for the tone of them
   *  all. */
  company: { key: string; tone: PictureTone } | null;
};

/** How many times likelier a frame of the room's family is than the
 *  work's school makes it, when the work's moulding is drawn. A school
 *  that hangs in the family one time in ten then takes a moulding that
 *  comes in it three times in four, and one that would three times in
 *  ten, nine times in ten. A school with no such moulding keeps its
 *  own. */
const FAMILY_PULL = 30;
/** The same for the moulding a wall leads with, and for its finish. */
const LEAD_LOOK_PULL = 3;
const LEAD_FINISH_PULL = 6;
/** How far a room goes with its majority. At 1 a family is chosen as
 *  often as the room's works would choose it one by one; above it the
 *  larger share wins more often. */
const ELECTION_SHARPNESS = 1.25;

type Pull = (look: LookId, finish: FinishId) => number;

function pullOf(hanging: Hanging | undefined): Pull | null {
  if (!hanging || (!hanging.family && !hanging.lead)) return null;
  const { family, lead } = hanging;
  return (look, finish) =>
    (family && familyOf(look, finish) === family ? FAMILY_PULL : 1) *
    (lead && lead.look === look ? LEAD_LOOK_PULL : 1) *
    (lead && lead.finish === finish ? LEAD_FINISH_PULL : 1);
}

/** The frames a work may get, before one is drawn. */
type Candidates = {
  /** Its looks and their scores (`scoreLooks`). */
  looks: Array<readonly [LookId, number]>;
  /** How a finish does as the moulding: on the picture, and on the
   *  wall when there is one. */
  main: (finish: FinishId) => number;
  /** How it does inside the moulding: on the picture alone. */
  suits: (finish: FinishId) => number;
  /** `main`, sharpened: a moulding finish's chance against the look's
   *  others. */
  weight: (finish: FinishId) => number;
};

const sharpened = (main: (finish: FinishId) => number) => once((f) => main(f) ** FIT_SHARPNESS);

/** A score worked out once per finish. */
function once(score: (finish: FinishId) => number): (finish: FinishId) => number {
  const known = new Map<FinishId, number>();
  return (finish) => {
    let value = known.get(finish);
    if (value === undefined) {
      value = score(finish);
      known.set(finish, value);
    }
    return value;
  };
}

type Reading = { wall: Rgb | null; tone: PictureTone; c: Candidates };

// A room asks for a work's candidates three times, for its family, for
// its wall's lead and for the frame. The last answer is kept per record, for one wall: the
// `Hanging`s of a room share theirs.
const readings = new WeakMap<Framed, Reading>();

/** A work's tone and its candidates on a wall, or on none. */
function readingOf(artwork: Framed, wall: Rgb | null): Reading {
  const hit = readings.get(artwork);
  if (hit && hit.wall === wall) return hit;
  const tone = readPicture(artwork);
  const suits = once((f) => finishFit(f, tone, artwork.year));
  const main = wall ? once((f) => suits(f) * wallFit(f, wall)) : suits;
  const c = { looks: scoreLooks(artwork, main), main, suits, weight: sharpened(main) };
  const reading = { wall, tone, c };
  readings.set(artwork, reading);
  return reading;
}

const MAINS = new Map<LookId, FinishId[]>();

/** The finishes a look's moulding comes in, each once. */
function mainsOf(look: LookId): FinishId[] {
  let mains = MAINS.get(look);
  if (!mains) {
    mains = [...new Set(LOOKS[look].main)];
    MAINS.set(look, mains);
  }
  return mains;
}

/** A look's chance against the work's other looks: its score,
 *  sharpened, and under a pull the mean pull on its finishes, each
 *  counted for the share of the look's frames it has. */
function lookWeights(c: Candidates, pull: Pull | null): Array<readonly [LookId, number]> {
  return c.looks.map(([id, score]) => {
    const weight = score ** FIT_SHARPNESS;
    if (!pull) return [id, weight] as const;
    let total = 0;
    let pulled = 0;
    for (const f of mainsOf(id)) {
      const share = c.weight(f);
      total += share;
      pulled += share * pull(id, f);
    }
    return [id, total > 0 ? (weight * pulled) / total : 0] as const;
  });
}

/**
 * The finishes a look's moulding may take under a hanging, each with
 * its chance against the others. Where the look comes in the room's
 * family it takes no other: a pull alone left one moulding in fourteen
 * in a finish of its own, and one green frame among five white ones is
 * what a visitor sees. The wall's lead finish is a pull, among those.
 */
function mainOptions(
  c: Candidates,
  look: LookId,
  hanging: Hanging | undefined,
): Array<readonly [FinishId, number]> {
  const mains = mainsOf(look);
  const family = hanging?.family;
  const inFamily = family ? mains.filter((f) => familyOf(look, f) === family) : [];
  const lead = hanging?.lead?.finish;
  return (inFamily.length > 0 ? inFamily : mains).map(
    (f) => [f, f === lead ? c.weight(f) * LEAD_FINISH_PULL : c.weight(f)] as const,
  );
}

/** Call `each` with every frame the work may get, as a look and the
 *  finish of its moulding, and its chance. The chances sum to 1. */
function eachChance(
  c: Candidates,
  hanging: Hanging | undefined,
  each: (look: LookId, finish: FinishId, chance: number) => void,
): void {
  const looks = lookWeights(c, pullOf(hanging));
  let sum = 0;
  for (const [, weight] of looks) if (weight > 0) sum += weight;
  for (const [look, weight] of looks) {
    if (!(weight > 0)) continue;
    const options = mainOptions(c, look, hanging);
    let total = 0;
    for (const [, share] of options) total += share;
    if (!(total > 0)) continue;
    for (const [finish, share] of options) {
      if (share > 0) each(look, finish, (weight / sum) * (share / total));
    }
  }
}

/** The tone of several works taken together, on `wall`. */
function meanTone(works: readonly Framed[], wall: Rgb | null): PictureTone {
  const lab: Rgb = [0, 0, 0];
  let warmth = 0;
  for (const work of works) {
    const { tone } = readingOf(work, wall);
    for (let i = 0; i < 3; i++) lab[i] += tone.lab[i] / works.length;
    warmth += tone.warmth / works.length;
  }
  return { light: clamp(lab[0], 0, 1), chroma: Math.hypot(lab[1], lab[2]), warmth, lab };
}

/**
 * What a room decides for the works on its walls: the wall colour they
 * are framed for, and one family of finishes. The family is drawn from
 * what the works would choose one by one, so a room of Dutch pictures
 * is mostly a dark room and now and then an oak one. `room` names the
 * room: the same works in another room may draw another family.
 */
export function roomHanging(
  room: string,
  wall: string | null | undefined,
  works: readonly Framed[],
): Hanging {
  const linear = hexToLinear(wall);
  const hanging: Hanging = {
    wall: linear && toOklab(linear),
    family: null,
    lead: null,
    company: null,
  };
  if (works.length < 2) return hanging;
  const mass = new Map<FinishFamily, number>();
  for (const work of works) {
    eachChance(readingOf(work, hanging.wall).c, hanging, (look, finish, chance) => {
      const family = familyOf(look, finish);
      if (family) mass.set(family, (mass.get(family) ?? 0) + chance);
    });
  }
  if (mass.size === 0) return hanging;
  return {
    ...hanging,
    family: drawWeighted([...mass], room, "family", ELECTION_SHARPNESS),
    company: { key: room, tone: meanTone(works, hanging.wall) },
  };
}

/**
 * What one wall of a room decides for the works on it: the frame it
 * leads with, a moulding in a finish, drawn from what its works would
 * choose in the room's family. `key` names the wall. A work alone on
 * its wall goes with the room.
 */
export function wallHanging(room: Hanging, key: string, works: readonly Framed[]): Hanging {
  if (works.length < 2) return room;
  // The chance of each moulding in each finish, summed over the works.
  const mass = new Map<LookId, Map<FinishId, number>>();
  for (const work of works) {
    eachChance(readingOf(work, room.wall).c, room, (look, finish, chance) => {
      const finishes = mass.get(look) ?? new Map<FinishId, number>();
      mass.set(look, finishes);
      finishes.set(finish, (finishes.get(finish) ?? 0) + chance);
    });
  }
  const frames = [...mass].flatMap(([look, finishes]) =>
    [...finishes].map(([finish, chance]) => [`${look}|${finish}`, chance] as const),
  );
  if (frames.length === 0) return room;
  const [look, finish] = drawWeighted(frames, key, "lead", ELECTION_SHARPNESS).split("|");
  return {
    ...room,
    lead: { look: look as LookId, finish: finish as FinishId },
    company: { key, tone: meanTone(works, room.wall) },
  };
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
  /** How far dirt and toned size have darkened its hollows, 0..1. */
  patina: number;
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
  /** What an artist painted on the frame's flat panels, which the
   *  renderer lays over them. Only on a pinned frame. */
  painted?: FramePainting;
};

/** Paintwork on a frame's panels, drawn by the renderer
 *  (components/gallery-3d/frame-paint.ts). */
export type FramePainting = "stuckSalome";

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
function matFor(artwork: Framed, tone: PictureTone, company: Hanging["company"]): Rgb {
  // The mats of one wall are cut from one board, chosen for all its
  // sheets.
  const of = company?.tone ?? tone;
  const warm = Math.max(0, of.warmth);
  const cool = Math.max(0, -of.warmth);
  const whiteSheet = of.light > 0.86 && of.chroma < 0.03;
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
    company?.key ?? artwork.id,
    "mat",
  );
  const base = labOfHex(MAT_TONES.find(([name]) => name === pick)?.[1] ?? "#ffffff");
  // A trace of the picture's own hue, fainter among other sheets, and
  // a little lighter or darker from sheet to sheet, the way board from
  // different batches is.
  const k = company ? 0.1 : 0.22;
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
function silkFor(artwork: Framed, tone: PictureTone, hanging: Hanging | undefined): Rgb {
  // One silk for the mounts of a wall, chosen for all its paintings.
  const company = hanging?.company;
  const of = company?.tone ?? tone;
  const warm = Math.max(0, of.warmth);
  const cool = Math.max(0, -of.warmth);
  const pale = clamp((of.light - 0.5) / 0.3, 0, 1);
  const labs = new Map(SILK_TONES.map(([name, hex]) => [name, labOfHex(hex)] as const));
  // The silk is what lies against the wall, so it has to stand off it.
  const wall = hanging?.wall;
  const clear = (name: string) =>
    wall ? 0.25 + 0.75 * clearOf(labs.get(name) ?? [1, 0, 0], wall) : 1;
  const pick = drawWeighted(
    [
      ["gold", (2 + cool) * clear("gold")],
      ["ivory", (0.6 + 1.6 * (1 - pale)) * clear("ivory")],
      ["indigo", (0.8 + 1.6 * warm + pale) * clear("indigo")],
      ["celadon", (0.8 + 1.2 * warm) * clear("celadon")],
      ["russet", (0.8 + 1.6 * cool) * clear("russet")],
      ["tea", (1 + 0.6 * pale) * clear("tea")],
    ],
    company?.key ?? artwork.id,
    "silk",
  );
  const base = labs.get(pick) ?? [1, 0, 0];
  const shade = (draw(artwork.id, "silk-shade") - 0.5) * 0.05;
  return fromOklab([base[0] + shade, base[1], base[2]]);
}

/** The second board of a double mat: a mid tone that picks up the
 *  picture's own colour, so the 6 mm of it that shows ties sheet and
 *  mat together. */
function matInnerFor(artwork: Framed, tone: PictureTone): Rgb {
  const pull = (c: number) => clamp(c * 1.4, -0.06, 0.06);
  const light = 0.6 + 0.16 * draw(artwork.id, "mat-inner");
  return fromOklab([light, pull(tone.lab[1]), pull(tone.lab[2])]);
}

/** A finish's colour for this work, as a tint on its surface: the
 *  finish's own, shifted a little from frame to frame, and for gold
 *  leaned against the picture's warmth. */
function tintFor(
  finish: FinishId,
  artwork: Framed,
  tone: PictureTone,
  slot: number,
  hanging: Hanging | undefined,
): Rgb {
  const spec = FINISHES[finish];
  let target: Rgb;
  if (finish === "mat") target = matFor(artwork, tone, hanging?.company ?? null);
  else if (finish === "matInner") target = matInnerFor(artwork, tone);
  else if (finish === "silk") target = silkFor(artwork, tone, hanging);
  else {
    const lab: Rgb = [...labOf(finish)];
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
  const base = SURFACE_LINEAR[spec.surface];
  return [target[0] / base[0], target[1] / base[1], target[2] / base[2]];
}

const SLOTS_USED = new WeakMap<BuiltStyle, boolean[]>();

/** Which material slots a frame uses, in its moulding and its rails. */
function slotsUsed(style: BuiltStyle): boolean[] {
  let used = SLOTS_USED.get(style);
  if (!used) {
    used = new Array<boolean>(FRAME_SLOTS).fill(false);
    for (const profile of [style.profile, ...style.rails.map((rail) => rail.profile)]) {
      for (let i = 0; i < profile.length - 1; i++) used[profile[i].slot ?? 0] = true;
    }
    SLOTS_USED.set(style, used);
  }
  return used;
}

/**
 * Build the design of `look` for `artwork`. `c` scores a finish for the
 * picture, or for the two pictures of a pair. Under a `hanging` the
 * moulding takes a finish of the room's family where it comes in one
 * (`mainOptions`), and what lies inside the moulding is drawn with the
 * work's neighbours.
 */
function designOf(
  lookId: LookId,
  artwork: Framed,
  tone: PictureTone,
  c: Candidates,
  hanging: Hanging | undefined,
  pin?: FramePin,
): FrameDesign {
  const look = LOOKS[lookId];
  const id = artwork.id;
  const company = hanging?.company;
  const drawnOn = company?.key ?? id;
  const inside = company ? (f: FinishId) => finishFit(f, company.tone, artwork.year) : c.suits;
  const choices = styleChoices(look.style);
  const edge = longEdge(artwork);

  const variant =
    pin?.variant != null
      ? pin.variant
      : look.variants
        ? drawFrom(look.variants, id, "variant")
        : Math.floor(draw(id, "variant") * choices.variants);
  let detail = look.details
    ? drawFrom(look.details, id, "detail")
    : Math.floor(draw(id, "detail") * choices.details);
  let doubleMat = false;
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
    // One in five is a double mat, and of the rest three in ten carry
    // a line round the window.
    doubleMat = draw(id, "mat-double") < 0.2;
    const line = !doubleMat && draw(id, "mat-line") < 0.3 ? 4 : 0;
    const wide = draw(id, "frame-face") < 0.35 ? 8 : 0;
    detail = mat + line + wide + (doubleMat ? 16 : 0);
  }
  // A liner where the look is sometimes fitted with one: the cloth ones
  // broad, a gilt or painted slip narrow.
  const lined = look.liner && choices.liner && draw(id, "liner") < look.liner.chance;
  const linerFinish = lined
    ? drawWeighted(
        (look.liner?.finishes ?? []).map((f) => [f, inside(f)] as const),
        drawnOn,
        "liner-finish",
        FIT_SHARPNESS,
      )
    : null;
  const options: StyleOptions = {
    sight: drawFrom(choices.sight, id, "sight"),
    field: drawFrom(look.field ?? choices.field, id, "field"),
    crown: drawFrom(choices.crown, id, "crown"),
    variant,
    detail,
    liner: linerFinish
      ? FINISHES[linerFinish].surface === "cloth"
        ? 0.026 + 0.012 * draw(id, "liner-width")
        : 0.012 + 0.008 * draw(id, "liner-width")
      : 0,
  };

  const used = slotsUsed(buildStyle(look.style, options));
  const pools: FinishId[][] = [
    look.main,
    linerFinish ? [linerFinish] : (look.inner ?? look.main),
    doubleMat ? ["matInner"] : (look.accent ?? ["giltPale"]),
  ];
  // Gilding wears with age and handling, and no two frames alike.
  const year = artwork.year;
  const age = year != null && year < 1700 ? 1.15 : 1;
  const wear = (0.7 + 0.6 * draw(id, "wear")) * age;
  const polish = 0.9 + 0.22 * draw(id, "polish");
  const depth = 0.8 + 0.35 * draw(id, "depth");
  // Some frames were cleaned last year and some never: dirt and toned
  // size in the hollows, more of it on the old ones.
  const patina = clamp(
    0.75 * draw(id, "patina") + (year == null ? 0.1 : year < 1700 ? 0.25 : year < 1850 ? 0.12 : 0),
    0,
    1,
  );

  const slots: SlotLook[] = pools.map((pool, slot) => {
    let finish = pool[0];
    if (slot === 0 && pin?.main) {
      finish = pin.main;
    } else if (pool.length > 1 && used[slot]) {
      finish =
        slot === 0
          ? drawWeighted(
              hanging
                ? mainOptions(c, lookId, hanging)
                : pool.map((f) => [f, c.weight(f)] as const),
              id,
              "finish0",
            )
          : drawWeighted(
              pool.map((f) => [f, inside(f)] as const),
              drawnOn,
              `finish${slot}`,
              FIT_SHARPNESS,
            );
    }
    const spec = FINISHES[finish];
    return {
      finish,
      surface: spec.surface,
      tint: used[slot] ? tintFor(finish, artwork, tone, slot, hanging) : [1, 1, 1],
      rough: spec.rough * polish,
      burnish: spec.burnish,
      wear: spec.wear * wear,
      carve: spec.carve * depth,
      // Board, cloth and silk are kept clean.
      patina: spec.burnish > 0 ? patina : 0,
    };
  });

  const weight = pin?.weight ?? 0.9 + 0.22 * draw(id, "weight");
  const round = (x: number) => Math.round(x * 1000);
  const key = [
    lookId,
    options.sight,
    options.field,
    options.crown,
    variant,
    detail,
    round(options.liner ?? 0),
    round(weight),
    round(patina),
    ...slots.flatMap((s, slot) =>
      used[slot] ? [s.finish, ...s.tint.map(round), round(s.wear)] : [],
    ),
  ].join("|");
  return pin?.painted
    ? {
        key: `${key}|${pin.painted}`,
        look: lookId,
        style: look.style,
        options,
        slots,
        weight,
        painted: pin.painted,
      }
    : { key, look: lookId, style: look.style, options, slots, weight };
}

/** A frame chosen for one work by hand. */
type FramePin = {
  look: LookId;
  /** The style's variant (e.g. 1: a swept frame that swells at its
   *  corners only). */
  variant?: number;
  /** The moulding's finish. */
  main?: FinishId;
  /** The cut of the moulding (`FrameDesign.weight`). 1 with a style
   *  whose scale is fixed at 1 hangs the frame at its real size. */
  weight?: number;
  painted?: FramePainting;
};

/**
 * Works that hang in a frame chosen for them, whatever their school or
 * room. Keyed by artwork id.
 *
 * Boucher's Resting Girl (Alte Pinakothek) was photographed in its
 * Louis XV frame, and the scan keeps the frame's four gilt corner
 * cartouches inside the picture. Cutting them off takes about a tenth of
 * the canvas, so the scan stays whole (Rico, 17 October 2026) and hangs
 * in a gilt swept frame that swells at the corners only: the carving in
 * the scan reads as the inner edge of the frame round it.
 */
const PINNED_FRAMES: Record<string, FramePin> = {
  // Stuck designed the frame of his small Salome of 1906 (24.7 × 45.7 cm)
  // as a temple front in gilt: pilasters, a pediment, a plinth with its
  // title. The scan showed it round the canvas, so the scan is cut to
  // the canvas (metadata/scan-crops.json) and the frame is built again
  // in the round at its real size, 56.1 × 76.5 cm, with his paintwork
  // on its panels (Rico, 17 October 2026).
  "collection-of-beauty-franz-von-stuck-salome": {
    look: "stuck",
    main: "gilt",
    weight: 1,
    painted: "stuckSalome",
  },
  "collection-of-beauty-resting-girl-by-francois-boucher-1753-alte-pinakothek-munich-germany-2017-crop":
    { look: "louisXV", variant: 1, main: "gilt" },
};

const pinnedDesigns = new WeakMap<Framed, FrameDesign>();

function pinnedDesign(artwork: Framed): FrameDesign | null {
  const pin = PINNED_FRAMES[artwork.id];
  if (!pin) return null;
  const hit = pinnedDesigns.get(artwork);
  if (hit) return hit;
  const { tone, c } = readingOf(artwork, null);
  const design = designOf(pin.look, artwork, tone, c, undefined, pin);
  pinnedDesigns.set(artwork, design);
  return design;
}

// The hang asks for a work's frame every time it measures the work, a
// few thousand times a floor. Keyed by the record itself, so the cache
// goes when the catalogue does.
const designs = new WeakMap<Framed, FrameDesign>();

/** Draw a look from the candidates, then its design. The draw is on
 *  the work's id whatever the hanging, so a pull the work's own choice
 *  already answers leaves it its own frame. */
function drawDesign(
  c: Candidates,
  artwork: Framed,
  tone: PictureTone,
  hanging: Hanging | undefined,
): FrameDesign {
  const look = drawWeighted(lookWeights(c, pullOf(hanging)), artwork.id, "look");
  return designOf(look, artwork, tone, c, hanging);
}

/**
 * The frame a work hangs in. Deterministic per work.
 *
 * Without a `hanging` it is the work's own frame, chosen from its
 * school and its picture alone: what the hang measures a wall with, and
 * what a work hangs in when its room has not chosen. With one it is the
 * frame for that wall among those neighbours.
 */
export function pickFrameDesign(artwork: Framed, hanging?: Hanging): FrameDesign {
  const pinned = pinnedDesign(artwork);
  if (pinned) return pinned;
  const hit = hanging ? undefined : designs.get(artwork);
  if (hit) return hit;
  const { tone, c } = readingOf(artwork, hanging?.wall ?? null);
  const design = drawDesign(c, artwork, tone, hanging);
  if (!hanging) designs.set(artwork, design);
  return design;
}

// ── Size ──────────────────────────────────────────────────────────────

/** Moulding scale for a canvas of the given size, metres. A framer cuts
 *  a heavier moulding for a larger picture. */
export function frameScale(design: FrameDesign, widthM: number, heightM: number): number {
  const [lo, hi] = styleChoices(design.style).scale;
  return clamp(0.5 + 0.3 * Math.max(widthM, heightM), lo, hi) * design.weight;
}

/** How far a work's frame reaches past the canvas to left and right,
 *  metres, at its widest. The hang reserves this on both sides of
 *  every work. */
export function frameReach(design: FrameDesign, widthM: number, heightM: number): number {
  return buildStyle(design.style, design.options).width * frameScale(design, widthM, heightM);
}

/** The frame's reach on each side. Left and right are `frameReach`;
 *  a tabernacle's entablature reaches further up and its plinth
 *  further down. */
export function frameExtents(design: FrameDesign, widthM: number, heightM: number): FrameExtents {
  const { extents } = buildStyle(design.style, design.options);
  const scale = frameScale(design, widthM, heightM);
  return { side: extents.side * scale, top: extents.top * scale, bottom: extents.bottom * scale };
}

/** A design cut for a canvas of the given size: what the renderer
 *  hands to `buildFrameGeometry`. */
export type Moulding = {
  profile: ShadedPoint[];
  swell: Swell | null;
  blocks: CornerBlocks | null;
  rails: Array<Rail<ShadedPoint>>;
  /** Highest point above the wall, metres. */
  frontZ: number;
};

export function frameMoulding(design: FrameDesign, widthM: number, heightM: number): Moulding {
  const style = buildStyle(design.style, design.options);
  const scale = frameScale(design, widthM, heightM);
  return {
    profile: scaleProfile(style.profile, scale),
    swell: style.swell && scaleSwell(style.swell, scale),
    blocks: style.blocks && { from: style.blocks.from * scale, lift: style.blocks.lift * scale },
    rails: style.rails.map((rail) => ({
      ...rail,
      profile: scaleProfile(rail.profile, scale),
      past: rail.past * scale,
    })),
    frontZ: CANVAS_FACE_Z + (style.frontZ - CANVAS_FACE_Z) * scale,
  };
}
