// Physical size for the artwork page's scale drawing: the work as a
// rectangle at true size beside a figure or, for the smallest prints, a
// hand.
//
// A wrong size drawn next to a person is far more visible than the same
// wrong number in a caption, so this module decides what may be drawn
// and hides everything else. It never estimates: a size is either a
// value from the catalogue that passes every check below, or null.
//
// The rules and thresholds come from an audit of `realDimensions` across
// all 4,557 works (3,091 with a size) in September 2026. Every number
// quoted in a comment here is from that audit.
import type { ArtworkListing } from "@/lib/data";
import { GOOGLE_ART_PROJECT } from "./google-art-project.mjs";

/** Fields the predicate may read. Both `Artwork` and `ArtworkListing`
 *  satisfy it. */
export type RealSizeInput = Pick<
  ArtworkListing,
  "id" | "objectKey" | "artistSlug" | "width" | "height" | "realDimensions"
>;

export type RealSize = { widthCm: number; heightCm: number };

export type ScaleReferenceKind = "person" | "hand";

export type ScaleReference = {
  kind: ScaleReferenceKind;
  /** Bounding box of the reference drawing, in cm. */
  widthCm: number;
  heightCm: number;
  /** Visitor-facing caption, e.g. "Figure 175 cm tall". */
  label: string;
};

// ── Shape check ─────────────────────────────────────────────────────────

/** Largest accepted |ln(realAspect / pixelAspect)|, about a 16% ratio.
 *
 *  A size whose shape disagrees with the image usually describes
 *  something else: the frame, the full sheet around a cropped scan, a
 *  different version, or a whole triptych beside one panel. The log ratio
 *  is symmetric, so a work 16% too wide and one 16% too tall count alike.
 *
 *  0.15 sits at the one gap in the distribution. Take the 1,698 per-work
 *  measurements (every source except book sheet sizes and print-format
 *  defaults). The ten 0.5%-wide bins from 10% to 15% hold 45 works; the
 *  four from 15% to 17% hold 1, 0, 1, 0. The tail beyond is sparse and
 *  mostly wrong. In the audit Monet W419, a 60 × 81.5 cm study, carried
 *  the 173 × 194 cm of the Hermitage panel it prepares (21%).
 *  Parmigianino's Madonna with the Long Neck is right at 132 × 219 cm,
 *  but the scan is a detail of her head (19%). Below the gap the
 *  mismatches are mostly frames, mounts and loose crops on correct
 *  sizes. An example is Turner's Wreck Buoy (123.2 × 92.7 cm, 14%). */
export const ASPECT_TOLERANCE = 0.15;

// ── Absolute bounds ─────────────────────────────────────────────────────

/** No catalogued side is below 4.3 cm (a Rembrandt etching) or above
 *  994 cm (Veronese's Wedding at Cana). These bounds only catch values
 *  that cannot be an object on a wall or in a portfolio: a unit slip
 *  that the shape check cannot see, since ×10 keeps the aspect. */
export const MIN_SIDE_CM = 2;
export const MAX_SIDE_CM = 1500;

// ── Source rules ────────────────────────────────────────────────────────

/** "static" sizes are one sheet size per book, not a measurement of the
 *  plate. They describe the image only where the image is a scan of the
 *  whole sheet. Audubon and Haeckel are sheet scans. In Audubon, 433 of
 *  435 scans have paper-toned edges (the sheet margin), and 432 match
 *  the sheet's shape within 4.9%, landscape plates turned (see the swap
 *  below). The Haeckel plates checked by eye show the running head and
 *  caption, and all 100 match within 6.3%. The one Audubon plate the
 *  shape check rejects, 162 Zenaida Dove (17.6%), is cut to the picture
 *  area.
 *
 *  Redouté's Liliacées (35 × 52.2) and Roses (25.2 × 34.9) are not.
 *  Those scans are background-removed cut-outs of the plant: 95% and
 *  100% have pure-white (254,254,254) edges, none shows the caption,
 *  and their aspects run from 0.16 to 1.32 against one fixed sheet.
 *  Drawn at sheet size, each plant would be enlarged by an unknown
 *  margin. So all 644 are hidden. The size is true of the book, not of
 *  the picture. */
const SHEET_SCANS: readonly { folder: string; widthCm: number; heightCm: number }[] = [
  // Havell double-elephant folio, 26.5 × 39.5 in.
  { folder: "audubon-birds/", widthCm: 67.31, heightCm: 100.33 },
  // Kunstformen der Natur (1899–1904), one page size for all 100 plates.
  { folder: "kunstformen-images/", widthCm: 26, heightCm: 36 },
];

/* Google Art Project scans take their size from the Commons
 * `pretty_dimensions` field, which is sometimes millimetres labelled as
 * cm. build-data divides by 10 above 400 cm ("wikimedia-template-mm"),
 * on Google Art Project files only (GOOGLE_ART_PROJECT is shared with it).
 * That is right for all 25 files it touches: American Gothic reads
 * 65.3 × 78, Renoir's La Grenouillère 81 × 66.5. Before the rescale was
 * restricted, it also divided 3 other files that held real centimetres,
 * such as Botticelli's Sistine fresco The Temptations of Christ
 * (555 × 345.5 cm, stored as 55.5 × 34.55).
 *
 * Below 400 the rescale never runs, so a Google Art Project template
 * value has no knowable unit. In the September 2026 audit 6 of the 17
 * such values were millimetres: Turner's 1793 watercolour of Clare Hall,
 * a sheet, read 276 × 200 cm. All 17 have since been re-sourced from
 * the holding museum's record. A later fetch added 13 more: 11 are
 * re-sourced, and 2 whose museum gives no size online stay hidden.
 * The rule stays for the next ingest. */

/** Works that pass every rule above yet are known to be wrong. Keep
 *  this list short: a problem shared by a class of records belongs in a
 *  rule. */
const EXCLUDED_IDS: ReadonlySet<string> = new Set([
  // Vesalius, De humani corporis fabrica (1543). All four carry 28 × 42
  // cm, the folio page. The scans are trimmed to the type block (the
  // running head touches the top edge), so the page size overstates what
  // is shown. All four are 11–14% off in aspect, inside the tolerance,
  // with the same value on each: the page size, not four measurements.
  "collection-of-beauty-de-humani-corporis-fabrica-24",
  "collection-of-beauty-de-humani-corporis-fabrica-25",
  "collection-of-beauty-de-humani-corporis-fabrica-26",
  "collection-of-beauty-de-humani-corporis-fabrica-27",
]);

const isPositiveFinite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** The work's physical size when it is safe to draw next to a reference,
 *  else null (the scale view is then hidden).
 *
 *  For a book's sheet size the result follows the image's orientation,
 *  so it may be the stored pair turned. See the end of the function. */
export function trustworthyRealSize(art: RealSizeInput): RealSize | null {
  const d = art.realDimensions;
  if (!d) return null;
  const { widthCm, heightCm, source } = d;
  if (!isPositiveFinite(widthCm) || !isPositiveFinite(heightCm)) return null;
  // Without pixel dimensions the shape check cannot run, and an
  // unchecked size is not drawn.
  if (!isPositiveFinite(art.width) || !isPositiveFinite(art.height)) return null;

  // Format defaults for Japanese prints (ōban tate-e ≈ 24 × 36 and
  // similar), added as "Standard Japanese print formats" in 10108cf.
  // A class guess is not a measurement of the print: 214 works.
  if (source === "series-default") return null;

  const sheetScan =
    source === "static" &&
    SHEET_SCANS.some(
      (s) => art.objectKey.startsWith(s.folder) && widthCm === s.widthCm && heightCm === s.heightCm,
    );
  if (source === "static" && !sheetScan) return null;

  if (source === "wikimedia-template" && GOOGLE_ART_PROJECT.test(art.objectKey)) return null;

  if (EXCLUDED_IDS.has(art.id)) return null;

  if (Math.min(widthCm, heightCm) < MIN_SIDE_CM) return null;
  if (Math.max(widthCm, heightCm) > MAX_SIDE_CM) return null;

  const pixelAspect = art.width / art.height;
  const asGiven = Math.abs(Math.log(widthCm / heightCm / pixelAspect));
  if (asGiven <= ASPECT_TOLERANCE) return { widthCm, heightCm };

  // A book's sheet size has no orientation: Audubon's is stored
  // portrait, and his 177 landscape plates are the same sheet turned
  // (the restored plate 278 at 10.3%, the rest within 4.9%). Only there
  // is the swap a reading of the value rather than a correction of it.
  // A per-work measurement that matches only when turned is a data
  // error, fixed in the sidecar rather than here. The audit found two:
  // Carracci's Susanna (a Commons template read out of order) and Monet
  // W1698 (the size of another painting's Wikidata item).
  if (sheetScan) {
    const turned = Math.abs(Math.log(heightCm / widthCm / pixelAspect));
    if (turned <= ASPECT_TOLERANCE) return { widthCm: heightCm, heightCm: widthCm };
  }

  return null;
}

// ── Reference object ────────────────────────────────────────────────────

/** Longest side below which the work sits beside a hand instead of the
 *  figure. The 19 trusted works under it are 5–14.8 cm etchings and
 *  engravings (Rembrandt, Schongauer, Dürer), and the next is 15.5 cm,
 *  so the line falls in a gap. At 5 cm a work is 0.26 of the hand but
 *  0.03 of the figure, a speck.
 *
 *  Everything from 15 cm up hangs beside the figure, as it would in a
 *  gallery: a 15 cm print is 0.09 of her height, still about 60 px in a
 *  full-height frame. Works of 15–60 cm used to get an A4 sheet, but a
 *  blank page with a folded corner reads as a broken image. */
export const HAND_MAX_CM = 15;

// Boxes match the drawings' bounding boxes in scale-figures.ts (the UI
// scales each shape to the height and centres it in this box), so the
// drawing never spills past the box into the gap beside the work.
// scale-figures.test.ts fails if the two drift apart.
const PERSON: ScaleReference = {
  kind: "person",
  widthCm: 40.6,
  heightCm: 175,
  label: "Figure 175 cm tall",
};
// Wrist crease to fingertip, thumb out; the drawing is 116 × 190 units.
const HAND: ScaleReference = {
  kind: "hand",
  widthCm: 11.6,
  heightCm: 19,
  label: "Adult hand, 19 cm long",
};

/** Which reference object to draw beside a work of this size.
 *
 *  Of the 3,115 trusted works, 3,096 get the figure and 19 the hand. The
 *  work's longest side stays within 0.09–5.7× the reference's height
 *  across the catalogue. The extremes are a 15.5 cm print and the 994 cm
 *  Veronese, both beside the figure. */
export function scaleReferenceFor(size: RealSize): ScaleReference {
  const longest = Math.max(size.widthCm, size.heightCm);
  return longest >= HAND_MAX_CM ? { ...PERSON } : { ...HAND };
}

/** "73.7 × 92.1 cm": width × height, at most one decimal, no trailing
 *  ".0". */
export function formatCm(size: RealSize): string {
  const f = (n: number) => String(Math.round(n * 10) / 10);
  return `${f(size.widthCm)} × ${f(size.heightCm)} cm`;
}
