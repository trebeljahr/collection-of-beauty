// The mouldings: 30 frame styles, each a cross-section drawn from the
// sight edge outward and ending on the wall, at the size it has on a
// work about 1.7 m long (scale 1). 27 are mitred. Three are built from
// straight rails cut square (`Rail`): the tabernacle frame, the hanging
// scroll and the Oxford frame.
//
// A style is a builder, not one fixed profile. It takes the ornament to
// carve on its sight moulding, its field and its crown, and two
// structural alternates, so one style yields dozens of mouldings: the
// Baroque torus frame with laurel or with ribbon, a print mat 45 or
// 90 mm wide. Which combination a work gets is decided in
// frame-design.ts. Profiles are shaded once per combination and cached.
//
// No three.js here: the hang reads the widths.

import {
  arc,
  backEdge,
  type CarveBand,
  cove,
  type Extra,
  hard,
  join,
  ogee,
  ovolo,
  type ProfilePoint,
  p,
  profileFrontZ,
  profileWidth,
  type ShadedPoint,
  scoop,
  shadeProfile,
  sweep,
} from "./frame-profiles";

export type FrameStyleId =
  | "leafTorus"
  | "flutedCove"
  | "cassetta"
  | "swept"
  | "regence"
  | "salvator"
  | "parcel"
  | "empire"
  | "barbizon"
  | "watts"
  | "reeded"
  | "bolection"
  | "ripple"
  | "cushion"
  | "scoop"
  | "plate"
  | "liner"
  | "strip"
  | "floater"
  | "print"
  | "mount"
  | "scotia"
  | "panel"
  | "kent"
  | "morland"
  | "deco"
  | "canted"
  | "tabernacle"
  | "scroll"
  | "oxford";

export type StyleOptions = {
  /** Ornament on the sight moulding, the field and the crown. null
   *  leaves that member plain. A style ignores a member it lacks. */
  sight: CarveBand | null;
  field: CarveBand | null;
  crown: CarveBand | null;
  /** Structural alternates. Each style reads them its own way. */
  variant: number;
  detail: number;
  /** Width of a flat liner (slot 1) set inside the moulding, metres,
   *  for the styles that take one. 0 or absent for none. */
  liner?: number;
};

/** A moulding that swells at its corners and at the middle of each
 *  rail, the way a Louis XV frame does. Lengths in metres at scale 1. */
export type Swell = {
  /** Points further out than this move; the sight side stays straight. */
  pivot: number;
  /** Extra reach at the corners and the centres, as a share of the
   *  moulding beyond the pivot. */
  corner: number;
  centre: number;
  /** How far along the rail each swell runs. */
  cornerSpan: number;
  centreSpan: number;
  /** The running ornament that gives way to a cartouche on the swells. */
  host: CarveBand | null;
  /** The corners step out square, as the ears of a Kent frame do,
   *  where a swell would curve. */
  ear?: boolean;
  /** Where a cartouche is carved. Default: wherever the moulding
   *  swells. A frame that keeps a straight outline can still carry
   *  them (pivot beyond the moulding, `corner` and `centre` 0). */
  cartouche?: "corners" | "both";
  /** Leave the host plain between its cartouches: a panel frame. */
  plain?: boolean;
};

/** Square blocks set on a frame's corners, each carved with a rosette. */
export type CornerBlocks = {
  /** The block covers the moulding from this offset outward. */
  from: number;
  /** How far it stands proud of the moulding's highest point. */
  lift: number;
};

/** A straight length of moulding along one side of the canvas, cut
 *  square at its ends: what a tabernacle frame, a scroll mount and an
 *  Oxford frame are built from, where the other frames are mitred. */
export type Rail<P = ProfilePoint> = {
  side: "top" | "bottom" | "left" | "right";
  /** Cross-section: `o` outward from that side's canvas edge. */
  profile: P[];
  /** How far the rail runs past the canvas corner at each end. */
  past: number;
};

type StyleSpec = {
  /** Smallest and largest scale the moulding is cut at. */
  scale: [number, number];
  sight: Array<CarveBand | null>;
  field: Array<CarveBand | null>;
  crown: Array<CarveBand | null>;
  variants: number;
  details: number;
  /** The mitred moulding. Empty for a frame built from rails alone. */
  build: (o: StyleOptions) => ProfilePoint[];
  swell?: (o: StyleOptions) => Swell | null;
  blocks?: (o: StyleOptions) => CornerBlocks | null;
  rails?: (o: StyleOptions) => Rail[];
  /** The moulding can take a liner inside it (`StyleOptions.liner`). */
  liner?: boolean;
};

// ── Parts ─────────────────────────────────────────────────────────────

const carved = (band: CarveBand | null, extra: Extra = {}): Extra =>
  band ? { ...extra, band } : extra;

/** The rabbet lip a frame starts with: it reaches `over` the canvas
 *  edge and stands `top` above the wall. */
const lip = (over: number, top: number, extra: Extra = {}): ProfilePoint[] => [
  p(-over, 0.0365, { ...extra, crease: true }),
  p(-over, top, { ...extra, crease: true }),
];

/** `n` half-round reeds of radius `r` side by side from (`o`, `z`),
 *  each `rise` higher than the last. */
function reeds(
  o: number,
  z: number,
  n: number,
  r: number,
  rise = 0,
  extra: Extra = {},
): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i < n; i++) {
    const reed = arc(o + r + 2 * r * i, z + rise * i, r, 180, 0, 4, extra);
    reed[0].crease = true;
    reed[reed.length - 1].crease = true;
    out.push(...reed);
  }
  return out;
}

/** The point at `deg` on a circle of radius `r` round (`co`, `cz`): where
 *  an `arc` with that angle starts or ends. */
const arcAt = (co: number, cz: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [co + r * Math.cos(a), cz + r * Math.sin(a)];
};

/** A surface nothing burnishes: sanded gesso, a mat, a liner. */
const matte: Extra = { rough: 1.5, wear: 0 };
/** Board or cloth lying in the frame's shadow. */
const board = (ao: number, slot: 1 | 2 = 1): Extra => ({ slot, ao, rough: 1, wear: 0 });

// ── The styles ────────────────────────────────────────────────────────

const STYLES: Record<FrameStyleId, StyleSpec> = {
  // Carved Baroque gilt: a sight bead, a matte cove, a carved ogee, and
  // a torus as the high point, falling to a plain back.
  leafTorus: {
    scale: [0.62, 1.45],
    sight: ["pearl", "pearl", "beadReel", "rope"],
    field: ["leaf", "leaf", "acanthus", "gadroon"],
    crown: ["laurel", "laurel", "ribbon", "rope", null],
    variants: 1,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.0435),
        p(-0.003, 0.0455),
        p(0.0005, 0.0455, hard),
        p(0.0005, 0.0432, hard),
        arc(0.0065, 0.0432, 0.006, 180, 0, 6, carved(o.sight)),
        p(0.0125, 0.0432, hard),
        p(0.014, 0.0432, hard),
        sweep([0.014, 0.0432], [0.024, 0.052], 4, cove),
        p(0.024, 0.052, hard),
        p(0.024, 0.0545, hard),
        p(0.0262, 0.0545, hard),
        sweep([0.0262, 0.0545], [0.068, 0.0805], 8, ogee, carved(o.field)),
        p(0.068, 0.0805, hard),
        p(0.0705, 0.0805, hard),
        p(0.0705, 0.0785, hard),
        arc(0.0835, 0.0785, 0.013, 180, 12, 8, carved(o.crown)),
        p(0.0978, 0.0775, hard),
        arc(0.1015, 0.0745, 0.0042, 135, 0, 3),
        sweep([0.1057, 0.0745], [0.1135, 0.055], 4, scoop),
        p(0.115, 0.052, hard),
        ...backEdge(0.115, 0.052),
      ),
  },
  // Neoclassical and Salon gilt: a sight bead, a deep hollow, a crown
  // fillet, and a carved ovolo falling outward.
  flutedCove: {
    scale: [0.62, 1.4],
    sight: ["pearl", "pearl", "beadReel"],
    field: ["flute", "flute", "scale", null],
    crown: ["eggDart", "eggDart", "gadroon", "leaf"],
    variants: 1,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.043),
        p(-0.0035, 0.045),
        p(0, 0.045, hard),
        p(0, 0.043, hard),
        arc(0.0052, 0.043, 0.0052, 180, 0, 6, carved(o.sight)),
        p(0.0104, 0.043, hard),
        p(0.0118, 0.043, hard),
        p(0.0118, 0.0455, hard),
        p(0.014, 0.0455, hard),
        sweep([0.014, 0.0455], [0.06, 0.08], 7, cove, carved(o.field)),
        p(0.06, 0.08, hard),
        p(0.06, 0.0825, hard),
        p(0.066, 0.0825, hard),
        arc(0.066, 0.0645, 0.018, 90, 8, 6, carved(o.crown)),
        p(0.0845, 0.0635, hard),
        p(0.0875, 0.0635, hard),
        sweep([0.0875, 0.0635], [0.0985, 0.05], 3, scoop),
        p(0.1, 0.048, hard),
        ...backEdge(0.1, 0.048),
      ),
  },
  // Italian cassetta for panel paintings: a sight moulding, a wide flat
  // frieze, a raised outer torus. Variant 1 paints the frieze (slot 2)
  // and leaves only the mouldings gilt.
  cassetta: {
    scale: [0.6, 1.3],
    sight: ["rope", "rope", "pearl", "beadReel"],
    field: ["punch", "punch", "guilloche", "meander", null],
    crown: [null],
    variants: 2,
    details: 1,
    build: (o) => {
      const frieze: Extra = o.variant === 1 ? { slot: 2 } : {};
      return join(
        lip(0.006, 0.046),
        p(-0.0008, 0.046, hard),
        arc(0.0055, 0.046, 0.0063, 180, 0, 6, carved(o.sight)),
        p(0.0118, 0.046, hard),
        p(0.014, 0.046, hard),
        p(0.014, 0.0435, { ...frieze, crease: true }),
        sweep([0.014, 0.0435], [0.072, 0.0435], 4, () => 0, carved(o.field, frieze)),
        p(0.072, 0.0435, hard),
        p(0.072, 0.047, hard),
        sweep([0.072, 0.047], [0.08, 0.0555], 3, cove),
        p(0.08, 0.0555, hard),
        arc(0.091, 0.0545, 0.0105, 170, 10, 7),
        p(0.1028, 0.053, hard),
        p(0.105, 0.05, hard),
        ...backEdge(0.105, 0.05),
      );
    },
  },
  // Louis XV: a sanded flat, then one long ogee up to a small top rail
  // near the outer edge. The moulding swells at the corners and the
  // centres, where a shell replaces the running ornament.
  swept: {
    scale: [0.62, 1.35],
    sight: ["pearl", "beadReel", null],
    field: ["acanthus", "acanthus", "leaf"],
    crown: ["rope", "ribbon", null],
    variants: 2,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.043),
        p(-0.003, 0.045),
        p(0.0005, 0.045, hard),
        p(0.0005, 0.043, hard),
        arc(0.0055, 0.043, 0.005, 180, 0, 6, carved(o.sight)),
        p(0.0105, 0.043, hard),
        p(0.012, 0.043, hard),
        p(0.012, 0.0445, { ...matte, crease: true }),
        p(0.03, 0.047, hard),
        // Everything from here out moves with the swell and is cut into
        // stations along the rail, so it is drawn with few points.
        sweep([0.03, 0.047], arcAt(0.0855, 0.0815, 0.0075, 160), 7, ogee, carved(o.field)),
        p(...arcAt(0.0855, 0.0815, 0.0075, 160), hard),
        arc(0.0855, 0.0815, 0.0075, 160, 10, 4, carved(o.crown)),
        sweep(arcAt(0.0855, 0.0815, 0.0075, 10), [0.112, 0.056], 3, scoop),
        p(0.114, 0.052, hard),
        ...backEdge(0.114, 0.052),
      ),
    // Variant 1 swells at the corners only, as most small Rococo frames do.
    swell: (o) => ({
      pivot: 0.03,
      corner: 0.3,
      centre: o.variant === 1 ? 0 : 0.17,
      cornerSpan: 0.17,
      centreSpan: 0.13,
      host: o.field,
    }),
  },
  // Régence: a flat frieze with a tooled ground between a carved sight
  // ovolo and a carved outer ogee, with cartouches at the corners.
  regence: {
    scale: [0.62, 1.35],
    sight: ["leaf", "gadroon", "eggDart"],
    field: ["guilloche", "scale", "punch", "meander"],
    crown: ["gadroon", "leaf", "acanthus"],
    variants: 2,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.044),
        p(-0.003, 0.046),
        p(0.0005, 0.046, hard),
        p(0.0005, 0.0438, hard),
        sweep([0.0005, 0.0438], [0.011, 0.051], 4, ovolo, carved(o.sight)),
        p(0.011, 0.051, hard),
        p(0.013, 0.051, hard),
        p(0.013, 0.0485, hard),
        sweep([0.013, 0.0485], [0.066, 0.0485], 4, () => 0, carved(o.field)),
        p(0.066, 0.0485, hard),
        p(0.066, 0.052, hard),
        sweep([0.066, 0.052], [0.088, 0.071], 5, ogee, carved(o.crown)),
        p(0.088, 0.071, hard),
        p(0.0915, 0.071),
        sweep([0.0915, 0.071], [0.103, 0.052], 4, scoop),
        p(0.105, 0.049, hard),
        ...backEdge(0.105, 0.049),
      ),
    swell: (o) =>
      o.variant === 1
        ? null
        : { pivot: 0.066, corner: 0.5, centre: 0, cornerSpan: 0.14, centreSpan: 0, host: o.crown },
  },
  // Salvator Rosa and Carlo Maratta frames, Rome, 17th and 18th
  // century: a plain burnished hollow between a carved sight ovolo and
  // a carved outer round, highest at the outside. Variant 1 leaves the
  // hollow black (slot 2).
  salvator: {
    scale: [0.62, 1.4],
    sight: ["leaf", "gadroon", null],
    field: [null],
    crown: ["acanthus", "gadroon", "ribbon", "laurel"],
    variants: 2,
    details: 1,
    liner: true,
    build: (o) => {
      const hollow: Extra = o.variant === 1 ? { slot: 2 } : {};
      return join(
        lip(0.006, 0.0445),
        p(-0.003, 0.0465),
        p(0.001, 0.0465, hard),
        p(0.001, 0.044, hard),
        sweep([0.001, 0.044], [0.013, 0.053], 4, ovolo, carved(o.sight)),
        p(0.013, 0.053, hard),
        p(0.015, 0.053, hard),
        p(0.015, 0.0505, { ...hollow, crease: true }),
        sweep([0.015, 0.0505], [0.058, 0.072], 7, cove, hollow),
        p(0.058, 0.072, hard),
        p(0.058, 0.0745, hard),
        p(...arcAt(0.073, 0.0735, 0.0125, 175), hard),
        arc(0.073, 0.0735, 0.0125, 175, 5, 8, carved(o.crown)),
        p(0.0875, 0.0735, hard),
        sweep([0.0875, 0.0735], [0.1, 0.054], 4, scoop),
        p(0.102, 0.051, hard),
        ...backEdge(0.102, 0.051),
      );
    },
  },
  // Spanish and Italian black-and-gold: a broad black bolection, highest
  // near the sight, between a gilt sight bead and a gilt outer bead
  // (both slot 2).
  parcel: {
    scale: [0.62, 1.4],
    sight: ["rope", "pearl", "beadReel"],
    field: [null],
    crown: ["gadroon", "rope", "leaf", null],
    variants: 1,
    details: 1,
    build: (o) =>
      join(
        lip(0.006, 0.044, { slot: 2 }),
        arc(-0.0005, 0.044, 0.0055, 180, 0, 5, carved(o.sight, { slot: 2 })),
        p(0.005, 0.044, hard),
        p(0.007, 0.044, hard),
        p(0.007, 0.047, hard),
        sweep([0.007, 0.047], [0.034, 0.084], 6, ovolo),
        sweep([0.034, 0.084], [0.085, 0.058], 7, (t) => t * t),
        p(0.085, 0.058, hard),
        p(0.085, 0.0555, { slot: 2, crease: true }),
        arc(0.0915, 0.0555, 0.0065, 180, 0, 6, carved(o.crown, { slot: 2 })),
        p(0.098, 0.0555, { slot: 2, crease: true }),
        p(0.1, 0.052, hard),
        ...backEdge(0.1, 0.052),
      ),
  },
  // Empire: one deep, plain, burnished cavetto between a sight bead and
  // a small outer bead.
  empire: {
    scale: [0.62, 1.4],
    sight: ["pearl", "beadReel"],
    field: [null],
    crown: ["laurel", "beadReel", "ribbon", null],
    variants: 2,
    details: 1,
    liner: true,
    // Variant 1 sets a patera on each corner.
    blocks: (o) => (o.variant === 1 ? { from: 0.0135, lift: 0.003 } : null),
    build: (o) =>
      join(
        lip(0.006, 0.043),
        p(-0.003, 0.045),
        p(0.0005, 0.045, hard),
        p(0.0005, 0.043, hard),
        arc(0.005, 0.043, 0.0045, 180, 0, 6, carved(o.sight)),
        p(0.0095, 0.043, hard),
        p(0.011, 0.043, hard),
        p(0.011, 0.0455, hard),
        p(0.0135, 0.0455, hard),
        sweep([0.0135, 0.0455], [0.062, 0.083], 8, cove),
        p(0.062, 0.083, hard),
        p(0.062, 0.0855, hard),
        p(0.071, 0.0855, hard),
        p(0.071, 0.0825, hard),
        arc(0.0765, 0.0825, 0.0055, 180, 0, 5, carved(o.crown)),
        p(0.082, 0.0825, hard),
        sweep([0.082, 0.0825], [0.093, 0.052], 4, scoop),
        p(0.095, 0.049, hard),
        ...backEdge(0.095, 0.049),
      ),
  },
  // Barbizon: the heavy 19th-century French landscape frame. A sanded
  // flat, a broad raked cove carved all over, an outer torus.
  barbizon: {
    scale: [0.6, 1.3],
    sight: ["pearl", "beadReel"],
    field: ["acanthus", "acanthus", "scale", "laurel"],
    crown: ["gadroon", "ribbon", "laurel", "rope"],
    variants: 1,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.0435),
        p(-0.003, 0.0455),
        p(0.0005, 0.0455, hard),
        p(0.0005, 0.0432, hard),
        arc(0.006, 0.0432, 0.0055, 180, 0, 6, carved(o.sight)),
        p(0.0115, 0.0432, hard),
        p(0.013, 0.0432, hard),
        p(0.013, 0.0455, { ...matte, crease: true }),
        p(0.027, 0.0465, hard),
        p(0.027, 0.049, hard),
        sweep([0.027, 0.049], [0.088, 0.092], 9, cove, carved(o.field)),
        p(0.088, 0.092, hard),
        p(0.088, 0.0945, hard),
        p(...arcAt(0.1015, 0.0925, 0.011, 170), hard),
        arc(0.1015, 0.0925, 0.011, 170, 5, 7, carved(o.crown)),
        sweep(arcAt(0.1015, 0.0925, 0.011, 5), [0.126, 0.056], 5, scoop),
        p(0.128, 0.052, hard),
        ...backEdge(0.128, 0.052),
      ),
  },
  // Watts frame, the Victorian exhibition frame: gilding laid straight
  // on a flat of oak so the grain shows (slot 1), between a carved inner
  // cushion and a reeded outer edge.
  watts: {
    scale: [0.62, 1.35],
    sight: ["leaf", "gadroon", "rope"],
    field: [null],
    crown: [null],
    variants: 2,
    details: 1,
    build: (o) => {
      const flatTo = o.variant === 1 ? 0.058 : 0.07;
      return join(
        lip(0.005, 0.044),
        p(-0.002, 0.046),
        p(0.002, 0.046, hard),
        sweep([0.002, 0.046], [0.014, 0.054], 4, ovolo, carved(o.sight)),
        p(0.014, 0.054, hard),
        p(0.016, 0.054, hard),
        p(0.016, 0.051, { slot: 1, crease: true }),
        p(flatTo, 0.051, hard),
        p(flatTo, 0.0535, hard),
        reeds(flatTo, 0.0535, o.variant === 1 ? 5 : 3, 0.0032, 0.0012),
        p(flatTo + (o.variant === 1 ? 0.032 : 0.0192), 0.052, hard),
        p(flatTo + (o.variant === 1 ? 0.034 : 0.0212), 0.049, hard),
        ...backEdge(flatTo + (o.variant === 1 ? 0.034 : 0.0212), 0.049),
      );
    },
  },
  // Reeded frames, as Whistler and Degas had them made: parallel reeds
  // and nothing else. Variant 0 reeds the whole face; 1 and 2 leave a
  // flat between two groups.
  reeded: {
    scale: [0.66, 1.3],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 3,
    details: 2,
    liner: true,
    // Detail 1 sets a rosette block on each corner: the bullseye frame.
    blocks: (o) => (o.detail === 1 ? { from: 0.002, lift: 0.004 } : null),
    build: (o) => {
      const r = 0.0034;
      const start = join(lip(0.005, 0.043), p(-0.002, 0.045), p(0.002, 0.045, hard));
      if (o.variant === 0) {
        const end = 0.002 + 11 * 2 * r;
        return join(
          start,
          p(0.002, 0.047, hard),
          reeds(0.002, 0.047, 11, r, 0.0016),
          p(end, 0.061, hard),
          p(end + 0.003, 0.058, hard),
          ...backEdge(end + 0.003, 0.058),
        );
      }
      const group = o.variant === 1 ? 3 : 2;
      const flatW = o.variant === 1 ? 0.03 : 0.042;
      const inner = 0.002 + group * 2 * r;
      const outer = inner + flatW + group * 2 * r;
      return join(
        start,
        p(0.002, 0.047, hard),
        reeds(0.002, 0.047, group, r, 0.0012),
        p(inner, 0.049, hard),
        p(inner + flatW, 0.057, hard),
        p(inner + flatW, 0.059, hard),
        reeds(inner + flatW, 0.059, group, r, 0.0012),
        p(outer, 0.06, hard),
        p(outer + 0.003, 0.057, hard),
        ...backEdge(outer + 0.003, 0.057),
      );
    },
  },
  // Bolection in wood with a gilt sight slip (slot 1).
  bolection: {
    scale: [0.66, 1.4],
    sight: [null],
    field: [null, null, "ripple"],
    crown: [null],
    variants: 1,
    details: 1,
    build: (o) =>
      join(
        lip(0.005, 0.0415, { slot: 1 }),
        arc(-0.001, 0.0415, 0.004, 180, 0, 4, { slot: 1 }),
        p(0.003, 0.0415, hard),
        p(0.003, 0.046, hard),
        p(0.006, 0.0475),
        p(0.012, 0.0475, hard),
        p(0.012, 0.05, hard),
        sweep([0.012, 0.05], [0.052, 0.071], 7, ogee, carved(o.field)),
        arc(0.052, 0.058, 0.013, 90, 10, 5),
        p(0.066, 0.057, hard),
        p(0.0725, 0.057, hard),
        p(0.075, 0.054, hard),
        ...backEdge(0.075, 0.054),
      ),
  },
  // Dutch ebonised frame: two ripple mouldings either side of a
  // polished flat.
  ripple: {
    scale: [0.66, 1.3],
    sight: ["ripple", "ripple", null],
    field: [null],
    crown: ["ripple", "ripple", "guilloche"],
    variants: 3,
    details: 1,
    liner: true,
    build: (o) => {
      // Variant 1 widens the flat, the cabinet-picture frame. Variant
      // 2 widens it further and veneers it (slot 2): tortoiseshell
      // between ebony ripples.
      const w = o.variant === 1 ? 0.014 : o.variant === 2 ? 0.022 : 0;
      const veneer: Extra = o.variant === 2 ? { slot: 2 } : {};
      return join(
        lip(0.005, 0.0445),
        p(-0.002, 0.0465),
        p(0.002, 0.0465, hard),
        sweep([0.002, 0.0465], [0.015, 0.0555], 4, ogee, carved(o.sight)),
        p(0.015, 0.0555, hard),
        p(0.0175, 0.0555, hard),
        p(0.0175, 0.053, { ...veneer, crease: true }),
        p(0.046 + w, 0.053, hard),
        p(0.046 + w, 0.0565, hard),
        sweep([0.046 + w, 0.0565], [0.062 + w, 0.069], 4, ovolo, carved(o.crown)),
        p(0.062 + w, 0.069, hard),
        p(0.071 + w, 0.069),
        p(0.0765 + w, 0.0665),
        p(0.08 + w, 0.06, hard),
        ...backEdge(0.08 + w, 0.06),
      );
    },
  },
  // Cushion frame: one broad half-round, in fruitwood or ebonised.
  // Variant 1 is flatter.
  cushion: {
    scale: [0.66, 1.35],
    sight: [null],
    field: [null, null, "ripple"],
    crown: [null],
    variants: 2,
    details: 1,
    liner: true,
    build: (o) => {
      const rise = o.variant === 1 ? 0.019 : 0.027;
      const round = arc(0.034, 0.048, 0.03, 180, 0, 12, carved(o.field)).map((pt) => ({
        ...pt,
        z: 0.048 + ((pt.z - 0.048) * rise) / 0.03,
      }));
      return join(
        lip(0.005, 0.044),
        p(-0.002, 0.046),
        p(0.004, 0.046, hard),
        p(0.004, 0.048, hard),
        round,
        p(0.064, 0.048, hard),
        p(0.067, 0.048, hard),
        p(0.069, 0.045, hard),
        ...backEdge(0.069, 0.045),
      );
    },
  },
  // A sight step, a wide scoop, a rounded outer edge.
  scoop: {
    scale: [0.7, 1.3],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 1,
    liner: true,
    build: (o) => {
      // Variant 1 is the broader, shallower cut.
      const w = o.variant === 1 ? 0.016 : 0;
      return join(
        lip(0.004, 0.043),
        p(0, 0.0455),
        p(0.008, 0.0455, hard),
        p(0.008, 0.048, hard),
        sweep(
          [0.008, 0.048],
          [0.056 + w - 0.009 * Math.SQRT1_2, 0.0575 + 0.009 * Math.SQRT1_2],
          6,
          cove,
        ),
        arc(0.056 + w, 0.0575, 0.009, 135, 0, 5),
        p(0.068 + w, 0.05, hard),
        ...backEdge(0.068 + w, 0.05),
      );
    },
  },
  // Plate frame: a broad flat board with a bevelled sight edge and a
  // raised outer lip. Variant 1 gilds the bevel (slot 2); variant 2 has
  // corner blocks.
  plate: {
    scale: [0.66, 1.3],
    sight: [null],
    field: [null, null, "hammer"],
    crown: [null],
    variants: 3,
    details: 2,
    liner: true,
    // Variant 2 sets a block on each corner.
    blocks: (o) => (o.variant === 2 ? { from: 0.004, lift: 0.005 } : null),
    build: (o) => {
      const bevel: Extra = o.variant === 1 ? { slot: 2 } : {};
      const w = o.detail === 1 ? 0.02 : 0;
      return join(
        lip(0.005, 0.044, bevel),
        p(0.004, 0.052, hard),
        sweep([0.004, 0.052], [0.066 + w, 0.052], 4, () => 0, carved(o.field)),
        p(0.066 + w, 0.052, hard),
        p(0.066 + w, 0.0548, hard),
        p(0.077 + w, 0.0548),
        p(0.079 + w, 0.0525, hard),
        ...backEdge(0.079 + w, 0.0525),
      );
    },
  },
  // Cloth liner (slot 1) rising from the sight to a plain box. Variant
  // 1 runs a gilt fillet (slot 2) where the two meet.
  liner: {
    scale: [0.7, 1.3],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 2,
    build: (o) => {
      const w = o.detail === 1 ? 0.012 : 0;
      const fillet =
        o.variant === 1
          ? [p(0.034 + w, 0.0462, { slot: 2, crease: true }), p(0.0375 + w, 0.0462, hard)]
          : [];
      const x = 0.034 + w + (o.variant === 1 ? 0.0035 : 0);
      return join(
        p(-0.004, 0.0362, { ...board(1), crease: true }),
        p(-0.001, 0.039, { ...board(0.94), crease: true }),
        p(0.034 + w, 0.046, { crease: true, ao: 0.7 }),
        ...fillet,
        p(x, 0.06, hard),
        p(x + 0.002, 0.062),
        p(x + 0.024, 0.062),
        p(x + 0.026, 0.06, hard),
        ...backEdge(x + 0.026, 0.06),
      );
    },
  },
  // Strip frame: a thin deep box. `detail` sets the width of its face.
  strip: {
    scale: [0.9, 1.15],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 1,
    details: 3,
    build: (o) => {
      const face = [0.011, 0.018, 0.028][o.detail] ?? 0.011;
      return join(
        lip(0.004, 0.058),
        p(-0.003, 0.059),
        p(face - 0.001, 0.059),
        p(face, 0.058, hard),
        ...backEdge(face, 0.058),
      );
    },
  },
  // Floater: no lip. The canvas edge (slot 1) drops into a dark tray
  // with a shadow gap round it.
  floater: {
    scale: [1, 1],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 1,
    details: 2,
    build: (o) => {
      const face = o.detail === 1 ? 0.02 : 0.012;
      return join(
        p(0, 0.0336, { slot: 1, crease: true, rough: 1, wear: 0 }),
        p(0, 0.012, { crease: true, rough: 1.3, wear: 0 }),
        p(0.01, 0.012, { crease: true, rough: 1.3, wear: 0 }),
        p(0.01, 0.0405, hard),
        p(0.011, 0.0415),
        p(0.01 + face, 0.0415),
        p(0.012 + face, 0.0395, hard),
        ...backEdge(0.012 + face, 0.0395),
      );
    },
  },
  // Print room: a window mat with a bevelled white core (slot 1) in a
  // slim frame. `variant` is the frame: 0 flat-topped, 1 half-round,
  // 2 Hogarth (black between two gilt beads, slot 2), 3 reeded, 4 a
  // small gilt round, 5 bamboo. `detail` packs the mat: its width (4
  // steps), a line 8 mm from the window (+4), a wider frame face (+8),
  // a double mat (+16).
  print: {
    scale: [0.8, 1.25],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 6,
    details: 32,
    build: (o) => {
      const matW = [0.044, 0.056, 0.07, 0.088][o.detail & 3];
      const line = (o.detail & 4) !== 0;
      const wide = (o.detail & 8) !== 0 ? 0.01 : 0;
      const x = matW + 0.008;
      // A double mat: 6 mm of a second board (slot 2) shows inside the
      // window of the first.
      const window =
        (o.detail & 16) !== 0
          ? [
              p(-0.004, 0.0362, { ...board(1, 2), crease: true }),
              p(-0.0022, 0.0378, { ...board(0.9, 2), crease: true }),
              p(0.005, 0.0378, { ...board(1), crease: true }),
              p(0.0062, 0.039, { ...board(0.9), crease: true }),
            ]
          : [
              p(-0.004, 0.0362, { ...board(1), crease: true }),
              p(-0.0012, 0.039, { ...board(0.9), crease: true }),
            ];
      const mat = join(
        ...window,
        ...(line
          ? [
              p(0.008, 0.03904, { ...board(0.9, 2), crease: true }),
              p(0.0096, 0.03904, { ...board(0.9), crease: true }),
            ]
          : []),
        p(matW, 0.0392, board(0.9)),
      );
      const shadow: Extra = { crease: true, ao: 0.62 };
      switch (o.variant) {
        case 1:
          return join(
            mat,
            p(x, 0.0392, shadow),
            p(x, 0.047, hard),
            arc(x + 0.0095 + wide / 2, 0.047, 0.0095 + wide / 2, 180, 0, 8),
            p(x + 0.019 + wide, 0.004),
          );
        case 2:
          return join(
            mat,
            p(x, 0.0392, { ...shadow, slot: 2 }),
            p(x, 0.045, { slot: 2, crease: true }),
            arc(x + 0.0025, 0.045, 0.0025, 180, 0, 4, { slot: 2 }),
            p(x + 0.005, 0.045, hard),
            p(x + 0.005, 0.0475, hard),
            p(x + 0.013 + wide / 2, 0.049),
            p(x + 0.021 + wide, 0.0475, hard),
            p(x + 0.021 + wide, 0.045, { slot: 2, crease: true }),
            arc(x + 0.0235 + wide, 0.045, 0.0025, 180, 0, 4, { slot: 2 }),
            p(x + 0.026 + wide, 0.045, hard),
            ...backEdge(x + 0.026 + wide, 0.045),
          );
        case 5:
          // Bamboo: a cane with its nodes, the frame Japonisme gave
          // Japanese prints.
          return join(
            mat,
            p(x, 0.0392, shadow),
            p(x, 0.0465, hard),
            arc(x + 0.011 + wide / 2, 0.0465, 0.011 + wide / 2, 180, 0, 8, { band: "bamboo" }),
            p(x + 0.022 + wide, 0.004),
          );
        case 3: {
          const n = wide ? 4 : 3;
          return join(
            mat,
            p(x, 0.0392, shadow),
            p(x, 0.0465, hard),
            reeds(x, 0.0465, n, 0.003, 0.0008),
            p(x + n * 0.006, 0.047, hard),
            p(x + n * 0.006 + 0.002, 0.044, hard),
            ...backEdge(x + n * 0.006 + 0.002, 0.044),
          );
        }
        case 4:
          return join(
            mat,
            p(x, 0.0392, shadow),
            p(x, 0.046, hard),
            arc(x + 0.007 + wide / 2, 0.046, 0.007 + wide / 2, 180, 25, 6),
            sweep(
              arcAt(x + 0.007 + wide / 2, 0.046, 0.007 + wide / 2, 25),
              [x + 0.02 + wide, 0.044],
              3,
              scoop,
            ),
            p(x + 0.02 + wide, 0.044, hard),
            ...backEdge(x + 0.02 + wide, 0.044),
          );
        default:
          return join(
            mat,
            p(x, 0.0392, shadow),
            p(x, 0.0485, hard),
            p(x + 0.002, 0.0505),
            p(x + 0.018 + wide, 0.0505),
            p(x + 0.022 + wide, 0.0478),
            p(x + 0.024 + wide, 0.044, hard),
            ...backEdge(x + 0.024 + wide, 0.044),
          );
      }
    },
  },
  // East Asian mount: the painting lies flush in a silk border (slot 1)
  // finished with a thin dark edge. Variant 1 adds the strip of gold
  // brocade (slot 2) a mounter sets next to the painting.
  mount: {
    scale: [0.8, 1.25],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 2,
    build: (o) => {
      const w = o.detail === 1 ? 0.016 : 0;
      const brocade =
        o.variant === 1
          ? [
              p(-0.003, 0.0362, { ...board(0.94, 2), crease: true }),
              p(0.011, 0.0362, { ...board(0.94), crease: true }),
            ]
          : [p(-0.003, 0.0362, { ...board(0.94), crease: true })];
      return join(
        ...brocade,
        p(0.057 + w, 0.0362, board(0.94)),
        p(0.064 + w, 0.0362, { crease: true, ao: 0.66 }),
        p(0.064 + w, 0.041, hard),
        arc(0.0705 + w, 0.041, 0.0065, 180, 0, 6),
        p(0.078 + w, 0.038, hard),
        ...backEdge(0.078 + w, 0.038),
      );
    },
  },
  // Reverse hollow, the Italian and Dutch 17th-century section: a carved
  // sight ovolo as the high point, one long scotia falling away from
  // the picture, a small bead at the outside.
  scotia: {
    scale: [0.62, 1.4],
    sight: ["waterleaf", "gadroon", "leaf", null],
    field: [null, null, "scale"],
    crown: ["pearl", "rope", "beadReel", null],
    variants: 1,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.047),
        p(-0.002, 0.0495),
        p(0.002, 0.0495, hard),
        sweep([0.002, 0.0495], [0.016, 0.078], 4, ovolo, carved(o.sight)),
        p(0.016, 0.078, hard),
        p(0.022, 0.078, hard),
        sweep([0.022, 0.078], [0.085, 0.046], 8, scoop, carved(o.field)),
        p(0.085, 0.046, hard),
        p(0.085, 0.0485, hard),
        arc(0.0905, 0.0485, 0.0055, 180, 0, 5, carved(o.crown)),
        p(0.096, 0.0485, hard),
        p(0.098, 0.045, hard),
        ...backEdge(0.098, 0.045),
      ),
  },
  // Panel frame (Lely, Canaletto): a broad plain cushion, burnished,
  // carved only in panels at its corners and centres. Variant 1 carves
  // it all along as well.
  panel: {
    scale: [0.62, 1.4],
    sight: ["pearl", "rope", "beadReel"],
    field: ["acanthus", "waterleaf", "husk"],
    crown: ["gadroon", "rope", "ribbon", null],
    variants: 2,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.0435),
        p(-0.003, 0.0455),
        p(0.0005, 0.0455, hard),
        p(0.0005, 0.043, hard),
        arc(0.0055, 0.043, 0.005, 180, 0, 6, carved(o.sight)),
        p(0.0105, 0.043, hard),
        p(0.012, 0.043, hard),
        p(0.012, 0.047, hard),
        sweep([0.012, 0.047], [0.07, 0.076], 8, ovolo, carved(o.field)),
        p(0.07, 0.076, hard),
        p(0.07, 0.0735, hard),
        arc(0.077, 0.0735, 0.007, 180, 0, 5, carved(o.crown)),
        p(0.084, 0.0735, hard),
        sweep([0.084, 0.0735], [0.098, 0.053], 4, scoop),
        p(0.1, 0.05, hard),
        ...backEdge(0.1, 0.05),
      ),
    swell: (o) => ({
      pivot: 1,
      corner: 0,
      centre: 0,
      cornerSpan: 0,
      centreSpan: 0,
      host: o.field,
      cartouche: "both",
      plain: o.variant === 0,
    }),
  },
  // Kent frame, the English Palladian section: a flat frieze between a
  // carved sight ovolo and a carved outer ovolo, whose corners step out
  // square as ears.
  kent: {
    scale: [0.62, 1.35],
    sight: ["waterleaf", "gadroon", "rope"],
    field: ["lattice", "guilloche", "wave", null],
    crown: ["eggDart", "waterleaf", "leaf"],
    variants: 1,
    details: 1,
    liner: true,
    build: (o) =>
      join(
        lip(0.006, 0.044),
        p(-0.003, 0.046),
        p(0.0005, 0.046, hard),
        p(0.0005, 0.0438, hard),
        sweep([0.0005, 0.0438], [0.012, 0.052], 4, ovolo, carved(o.sight)),
        p(0.012, 0.052, hard),
        p(0.014, 0.052, hard),
        p(0.014, 0.049, o.field ? hard : { ...matte, crease: true }),
        sweep([0.014, 0.049], [0.058, 0.049], 4, () => 0, carved(o.field)),
        p(0.058, 0.049, hard),
        p(0.058, 0.053, hard),
        sweep([0.058, 0.053], [0.076, 0.072], 5, ovolo, carved(o.crown)),
        p(0.076, 0.072, hard),
        p(0.083, 0.072),
        sweep([0.083, 0.072], [0.094, 0.052], 4, scoop),
        p(0.096, 0.049, hard),
        ...backEdge(0.096, 0.049),
      ),
    swell: () => ({
      pivot: 0.058,
      corner: 0.75,
      centre: 0,
      cornerSpan: 0.115,
      centreSpan: 0,
      host: null,
      ear: true,
    }),
  },
  // A narrow carved ogee with a bead: the small gilt frame of cabinet
  // pictures, watercolours and oil sketches.
  morland: {
    scale: [0.75, 1.25],
    sight: [null],
    field: ["waterleaf", "leaf", "husk", "rope"],
    crown: ["pearl", "beadReel", null],
    variants: 1,
    details: 1,
    build: (o) =>
      join(
        lip(0.005, 0.043),
        p(-0.002, 0.045),
        p(0.002, 0.045, hard),
        sweep([0.002, 0.045], [0.026, 0.062], 5, ogee, carved(o.field)),
        p(0.026, 0.062, hard),
        p(0.026, 0.0595, hard),
        arc(0.0305, 0.0595, 0.0045, 180, 0, 5, carved(o.crown)),
        p(0.035, 0.0595, hard),
        p(0.0365, 0.057, hard),
        ...backEdge(0.0365, 0.057),
      ),
  },
  // Art Deco: three square steps. Variant 0 steps down from the picture,
  // variant 1 up to the outside. Detail 1 puts the middle step in a
  // second finish (slot 2).
  deco: {
    scale: [0.7, 1.3],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 2,
    build: (o) => {
      const middle: Extra = o.detail === 1 ? { slot: 2 } : {};
      const z = o.variant === 1 ? [0.046, 0.052, 0.058, 0.064] : [0.064, 0.058, 0.052, 0.046];
      return join(
        lip(0.005, z[0] - 0.002),
        p(-0.003, z[0]),
        p(0.014, z[0], hard),
        p(0.014, z[1], { ...middle, crease: true }),
        p(0.03, z[1], hard),
        p(0.03, z[2], hard),
        p(0.046, z[2], hard),
        p(0.046, z[3], hard),
        p(0.06, z[3]),
        p(0.062, z[3] - 0.002, hard),
        ...backEdge(0.062, z[3] - 0.002),
      );
    },
  },
  // Canted: one flat face at a slope. Variant 0 rises to the outside,
  // variant 1 falls away from the picture. Detail 1 is the wider cut.
  canted: {
    scale: [0.7, 1.3],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 2,
    liner: true,
    build: (o) => {
      const w = o.detail === 1 ? 0.07 : 0.048;
      if (o.variant === 1) {
        return join(
          lip(0.004, 0.066),
          p(-0.001, 0.068),
          p(0.006, 0.068, hard),
          p(w, 0.047, hard),
          p(w + 0.006, 0.047),
          p(w + 0.008, 0.045, hard),
          ...backEdge(w + 0.008, 0.045),
        );
      }
      return join(
        lip(0.004, 0.043),
        p(0, 0.045),
        p(0.004, 0.045, hard),
        p(w, 0.066, hard),
        p(w + 0.007, 0.066),
        p(w + 0.009, 0.064, hard),
        ...backEdge(w + 0.009, 0.064),
      );
    },
  },
  // Tabernacle frame, the architecture round an Italian altarpiece: an
  // entablature above, a plinth below, a pilaster each side, cut square
  // and butted, not mitred. Variant 1 paints the frieze, the pilaster
  // panels and the plinth (slot 2).
  tabernacle: {
    scale: [0.6, 1.2],
    sight: ["eggDart", "beadReel", "waterleaf"],
    field: ["guilloche", "acanthus", "lattice", "wave", "punch"],
    crown: ["eggDart", "waterleaf", "leaf"],
    variants: 2,
    details: 1,
    build: () => [],
    rails: (o) => {
      const panel: Extra = o.variant === 1 ? { slot: 2 } : {};
      // On a painted panel the ornament is left off.
      const field = o.variant === 1 ? null : o.field;
      const pilaster = join(
        lip(0.006, 0.046),
        p(-0.003, 0.048),
        p(0.006, 0.048, hard),
        p(0.006, 0.0445, { ...panel, crease: true }),
        sweep([0.006, 0.0445], [0.066, 0.0445], 4, () => 0, carved(field, panel)),
        p(0.066, 0.0445, hard),
        p(0.066, 0.048, hard),
        p(0.077, 0.048),
        p(0.079, 0.046, hard),
        ...backEdge(0.079, 0.046),
      );
      // The entablature stands proud of the pilasters where they meet
      // it: its inner face is taller than they are deep.
      const entablature = join(
        lip(0.006, 0.054),
        p(0.002, 0.054),
        p(0.016, 0.054, hard),
        p(0.016, 0.057, hard),
        p(0.03, 0.057, hard),
        p(0.03, 0.0595, hard),
        sweep([0.03, 0.0595], [0.038, 0.066], 3, ovolo, carved(o.sight)),
        p(0.038, 0.066, hard),
        p(0.038, 0.057, { ...panel, crease: true }),
        sweep([0.038, 0.057], [0.1, 0.057], 4, () => 0, carved(field, panel)),
        p(0.1, 0.057, hard),
        p(0.1, 0.0625, hard),
        sweep([0.1, 0.0625], [0.113, 0.0625], 2, () => 0, { band: "dentil" }),
        p(0.113, 0.0625, hard),
        p(0.113, 0.066, hard),
        sweep([0.113, 0.066], [0.138, 0.093], 5, ogee, carved(o.crown)),
        p(0.138, 0.093, hard),
        p(0.138, 0.098, hard),
        p(0.15, 0.098),
        p(0.152, 0.096, hard),
        ...backEdge(0.152, 0.096),
      );
      const plinth = join(
        lip(0.006, 0.054),
        p(0.002, 0.056),
        p(0.01, 0.062, hard),
        p(0.016, 0.062, hard),
        p(0.016, 0.055, { ...panel, crease: true }),
        sweep([0.016, 0.055], [0.082, 0.055], 4, () => 0, carved(field, panel)),
        p(0.082, 0.055, hard),
        p(0.082, 0.059, hard),
        sweep([0.082, 0.059], [0.102, 0.071], 4, ogee),
        p(0.102, 0.071, hard),
        p(0.111, 0.071),
        p(0.113, 0.069, hard),
        ...backEdge(0.113, 0.069),
      );
      // Entablature and plinth run past the pilasters by a short return.
      const past = 0.079 + 0.014;
      return [
        { side: "left", profile: pilaster, past: 0 },
        { side: "right", profile: pilaster, past: 0 },
        { side: "top", profile: entablature, past },
        { side: "bottom", profile: plinth, past },
      ];
    },
  },
  // Hanging scroll: the painting set in silk (slot 1) with more of it
  // above than below, a strip of gold brocade (slot 2) at its head and
  // foot, a stave at the top and a roller at the bottom that stands
  // out past the silk. Variant 1 is the taller mounting; detail 1
  // leaves the brocade off.
  scroll: {
    scale: [0.7, 1.15],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 2,
    build: () => [],
    rails: (o) => {
      const silk = board(0.94);
      const strip = board(0.94, o.detail === 1 ? 1 : 2);
      const sideW = 0.042;
      const head = o.variant === 1 ? 0.26 : 0.19;
      const foot = o.variant === 1 ? 0.15 : 0.115;
      // The silk starts just behind the painting's face, so no gap
      // shows at the join, and lies 2 mm in front of it.
      const edge = (slot: Extra): ProfilePoint[] => [
        p(0, 0.03, { ...slot, crease: true }),
        p(0, 0.0362, { ...slot, crease: true }),
      ];
      const side = join(
        edge(silk),
        p(sideW, 0.0362, { ...silk, crease: true }),
        p(sideW, 0.004, { ao: 0.6, rough: 1, wear: 0 }),
      );
      const top = join(
        edge(strip),
        p(0.022, 0.0362, { ...silk, crease: true }),
        p(head, 0.0362, { crease: true, ao: 0.7 }),
        p(head, 0.038, hard),
        arc(head + 0.007, 0.038, 0.007, 180, 0, 6),
        p(head + 0.014, 0.004),
      );
      const bottom = join(
        edge(strip),
        p(0.015, 0.0362, { ...silk, crease: true }),
        p(foot + 0.014, 0.0362, { ...silk, crease: true }),
        p(foot + 0.014, 0.004, { ao: 0.6, rough: 1, wear: 0 }),
      );
      const roller = join(
        p(foot, 0.004, hard),
        p(foot, 0.02, hard),
        arc(foot + 0.016, 0.02, 0.016, 180, 0, 8),
        p(foot + 0.032, 0.004),
      );
      return [
        { side: "left", profile: side, past: 0 },
        { side: "right", profile: side, past: 0 },
        { side: "top", profile: top, past: sideW },
        { side: "bottom", profile: bottom, past: sideW },
        { side: "bottom", profile: roller, past: sideW + 0.03 },
      ];
    },
  },
  // Oxford frame: four bars that cross at the corners and run on past
  // them, round a mat (slot 1). The mat is mitred; the bars are rails.
  // Detail sets the mat's width.
  oxford: {
    scale: [0.8, 1.2],
    sight: [null],
    field: [null],
    crown: [null],
    variants: 2,
    details: 3,
    build: (o) => {
      const matW = [0.04, 0.052, 0.066][o.detail] ?? 0.052;
      return join(
        p(-0.004, 0.0362, { ...board(1), crease: true }),
        p(-0.0012, 0.039, { ...board(0.9), crease: true }),
        p(matW, 0.0392, board(0.9)),
        p(matW + 0.012, 0.0392, { ...board(0.62), crease: true }),
        p(matW + 0.012, 0.004, { slot: 1, ao: 0.6, rough: 1, wear: 0 }),
      );
    },
    rails: (o) => {
      const x = ([0.04, 0.052, 0.066][o.detail] ?? 0.052) + 0.004;
      // Variant 1 rounds the bars. The upright bars stand 2 mm proud of
      // the others, so the two never share a surface where they cross.
      const bar = (lift: number) =>
        o.variant === 1
          ? join(
              p(x, 0.004, hard),
              p(x, 0.043 + lift, hard),
              arc(x + 0.011, 0.043 + lift, 0.011, 180, 0, 8).map((pt) => ({
                ...pt,
                z: 0.043 + lift + (pt.z - 0.043 - lift) * 0.8,
              })),
              p(x + 0.022, 0.004),
            )
          : join(
              p(x, 0.004, hard),
              p(x, 0.049 + lift, hard),
              p(x + 0.003, 0.052 + lift),
              p(x + 0.019, 0.052 + lift),
              p(x + 0.022, 0.049 + lift, hard),
              p(x + 0.022, 0.004),
            );
      const past = x + 0.022 + 0.03;
      return [
        { side: "top", profile: bar(0), past },
        { side: "bottom", profile: bar(0), past },
        { side: "left", profile: bar(0.002), past },
        { side: "right", profile: bar(0.002), past },
      ];
    },
  },
};

export const FRAME_STYLE_IDS = Object.keys(STYLES) as FrameStyleId[];

/** The ornaments and alternates a style offers. */
export function styleChoices(
  id: FrameStyleId,
): Pick<StyleSpec, "sight" | "field" | "crown" | "variants" | "details" | "scale" | "liner"> {
  return STYLES[id];
}

/** How far a frame reaches past the canvas on each side, metres. Only
 *  a frame built from rails differs from side to side. */
export type FrameExtents = { side: number; top: number; bottom: number };

export type BuiltStyle = {
  /** The mitred moulding, empty for a frame built from rails alone. */
  profile: ShadedPoint[];
  /** Reach past the canvas edge to left and right at scale 1, swell
   *  and rails included: what the hang reserves. */
  width: number;
  extents: FrameExtents;
  /** Highest point above the wall. */
  frontZ: number;
  swell: Swell | null;
  blocks: CornerBlocks | null;
  rails: Array<Rail<ShadedPoint>>;
};

const built = new Map<string, BuiltStyle>();

/** Reach of a swollen moulding at its widest, given its plain width. */
export function swollenWidth(width: number, swell: Swell | null): number {
  if (!swell) return width;
  return swell.pivot + (width - swell.pivot) * (1 + Math.max(swell.corner, swell.centre));
}

/** Set a flat liner `w` wide inside a moulding: the moulding moves
 *  outward and its lip rises from the liner, which is slot 1. */
function withLiner(profile: ProfilePoint[], w: number): ProfilePoint[] {
  const over = profile[0].o;
  return [
    p(-0.004, 0.0362, { ...board(1), crease: true }),
    p(-0.001, 0.039, { ...board(0.94), crease: true }),
    p(w + over, 0.0405, { crease: true, ao: 0.72, slot: profile[0].slot }),
    ...profile.slice(1).map((pt) => ({ ...pt, o: pt.o + w })),
  ];
}

/** The shaded moulding of a style with the given options, at scale 1. */
export function buildStyle(id: FrameStyleId, o: StyleOptions): BuiltStyle {
  const spec = STYLES[id];
  const liner = spec.liner ? (o.liner ?? 0) : 0;
  const key = `${id}|${o.sight}|${o.field}|${o.crown}|${o.variant}|${o.detail}|${liner}`;
  const hit = built.get(key);
  if (hit) return hit;
  const raw = spec.build(o);
  const profile = raw.length > 0 ? shadeProfile(liner > 0 ? withLiner(raw, liner) : raw) : [];
  let swell = spec.swell?.(o) ?? null;
  let blocks = spec.blocks?.(o) ?? null;
  if (liner > 0) {
    swell = swell && { ...swell, pivot: swell.pivot + liner };
    blocks = blocks && { ...blocks, from: blocks.from + liner };
  }
  const rails = (spec.rails?.(o) ?? []).map((rail) => ({
    ...rail,
    profile: shadeProfile(rail.profile),
  }));

  const swept = profile.length > 0 ? swollenWidth(profileWidth(profile), swell) : 0;
  const extents = { side: swept, top: swept, bottom: swept };
  let frontZ = profile.length > 0 ? profileFrontZ(profile) + (blocks?.lift ?? 0) : 0;
  for (const rail of rails) {
    const w = profileWidth(rail.profile);
    frontZ = Math.max(frontZ, profileFrontZ(rail.profile));
    if (rail.side === "top" || rail.side === "bottom") {
      extents[rail.side] = Math.max(extents[rail.side], w);
      extents.side = Math.max(extents.side, rail.past);
    } else {
      extents.side = Math.max(extents.side, w);
      extents.top = Math.max(extents.top, rail.past);
      extents.bottom = Math.max(extents.bottom, rail.past);
    }
  }
  const out = { profile, width: extents.side, extents, frontZ, swell, blocks, rails };
  built.set(key, out);
  return out;
}

/** A swell for a moulding cut at `scale`. */
export function scaleSwell(swell: Swell, scale: number): Swell {
  return {
    ...swell,
    pivot: swell.pivot * scale,
    cornerSpan: swell.cornerSpan * scale,
    centreSpan: swell.centreSpan * scale,
  };
}
