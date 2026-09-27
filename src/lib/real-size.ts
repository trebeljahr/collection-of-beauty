// Physical size for the artwork page's scale drawing: the work as a
// rectangle at true size beside a figure, an A4 sheet or a hand.
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

/** Fields the predicate may read. Both `Artwork` and `ArtworkListing`
 *  satisfy it. */
export type RealSizeInput = Pick<
  ArtworkListing,
  "id" | "objectKey" | "artistSlug" | "width" | "height" | "realDimensions"
>;

export type RealSize = { widthCm: number; heightCm: number };

export type ScaleReferenceKind = "person" | "a4" | "hand";

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
 *  mostly wrong. Examples are Monet W419 (194 × 173 cm against a 1.39:1
 *  image, 21%) and Parmigianino's Madonna with the Long Neck (132 × 219
 *  cm against a cropped 0.73:1 scan, 19%). Below the gap the mismatches
 *  are mostly frames, mounts and loose crops on correct sizes. An
 *  example is Turner's Wreck Buoy (123.2 × 92.7 cm, 14%). */
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

/** Google Art Project scans take their size from the Commons
 *  `pretty_dimensions` field, which is sometimes millimetres labelled as
 *  cm. build-data divides by 10 above 400 cm ("wikimedia-template-mm").
 *  That is right for all 25 Google Art Project files it touched: American
 *  Gothic reads 65.3 × 78, Renoir's La Grenouillère 81 × 66.5. It is
 *  wrong for the 3 other files, which held real centimetres and are now
 *  a tenth of their size. Botticelli's Sistine fresco The Temptations of
 *  Christ (555 × 345.5 cm) became 55.5 × 34.55. Tintoretto's Marriage at
 *  Cana (535 × 435 cm) became 53.5 × 43.5, and his Prayer in the Garden
 *  (455 × 538 in the source) became 45.5 × 53.8.
 *
 *  Below 400 the rescale never runs, so a Google Art Project template
 *  value has no knowable unit. 6 of its 17 values are almost certainly
 *  millimetres: they read 2–3.8 m on the long side. Turner's 1793
 *  watercolour of Clare Hall, described as a sheet, reads 276 × 200 cm.
 *  Whistler's Green and Silver: Beaulieu, described as a small
 *  landscape, reads 216 × 129 cm. The other 11 look right, but nothing
 *  in the record separates them from the 6. */
const GOOGLE_ART_PROJECT = /google[_ ]art[_ ]project/i;

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
  // Two single-work value errors the shape check cannot see. Remove each
  // once metadata/artwork-dimensions.json (or the description) is fixed
  // and the catalogue rebuilt.
  // Monet, Palm Trees at Bordighera (W875): stored 65 × 81 cm (museum),
  // but the work's own description on the same page gives "The upright
  // canvas (92 x 73 cm)". The page would contradict itself.
  "collection-of-beauty-monet-w875",
  // Rubens, The Consequences of War (Pitti): stored 305 × 206 cm
  // (Wikidata). The 1350 × 809 image matches the Pitti's 342 × 206, so
  // the drawing would be about 11% too narrow; 12% off, inside tolerance.
  "collection-of-beauty-los-horrores-de-la-guerra",
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

  const googleArtProject = GOOGLE_ART_PROJECT.test(art.objectKey);
  if (source === "wikimedia-template" && googleArtProject) return null;
  if (source === "wikimedia-template-mm" && !googleArtProject) return null;

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
  // A per-work measurement that matches only when turned (Carracci's
  // Susanna, Monet W1698) is a data error and stays hidden until the
  // catalogue is fixed.
  if (sheetScan) {
    const turned = Math.abs(Math.log(heightCm / widthCm / pixelAspect));
    if (turned <= ASPECT_TOLERANCE) return { widthCm: heightCm, heightCm: widthCm };
  }

  return null;
}

// ── Reference object ────────────────────────────────────────────────────

/** Longest side at and above which the work stands beside a figure. At
 *  60 cm the work is 0.34 of the figure's height and 2.0× the A4 sheet,
 *  so each reference stays readable on both sides of the switch. The
 *  trusted distribution has no gap to follow here: 44 works sit in
 *  55–60 cm and 52 in 60–65 cm. Every Audubon plate (100.3 cm, 434
 *  trusted) gets the figure at a ratio of 0.57, which is how the plates
 *  are hung and seen. */
export const PERSON_MIN_CM = 60;

/** Longest side below which the work sits beside a hand. The 14 trusted
 *  works under it are 5–14.8 cm etchings and engravings (Rembrandt,
 *  Schongauer, Dürer), and the next is 15.6 cm, so the line falls in a
 *  gap. At 5 cm a work is 0.17 of an A4 sheet but 0.26 of the hand. */
export const HAND_MAX_CM = 15;

// Boxes match the UI's drawings (artwork-scale.tsx scales each shape to
// the height and centres it in this box), so the drawing never spills
// past the box into the gap beside the work. If a shape changes there,
// change its box here.
const PERSON: ScaleReference = {
  kind: "person",
  widthCm: 50,
  heightCm: 175,
  label: "Figure 175 cm tall",
};
const A4: ScaleReference = {
  kind: "a4",
  widthCm: 21,
  heightCm: 29.7,
  label: "A4 sheet, 21 × 29.7 cm",
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
 *  Bands for the 2,194 trusted works: figure 1,759, A4 421 (including
 *  all 100 Haeckel plates at 36 cm), hand 14. The work's longest side
 *  stays within 0.26–5.7× the reference's height across the catalogue.
 *  The extremes are a 5 cm etching beside the hand and the 994 cm
 *  Veronese beside the figure. */
export function scaleReferenceFor(size: RealSize): ScaleReference {
  const longest = Math.max(size.widthCm, size.heightCm);
  if (longest >= PERSON_MIN_CM) return { ...PERSON };
  if (longest >= HAND_MAX_CM) return { ...A4 };
  return { ...HAND };
}

/** "73.7 × 92.1 cm": width × height, at most one decimal, no trailing
 *  ".0". */
export function formatCm(size: RealSize): string {
  const f = (n: number) => String(Math.round(n * 10) / 10);
  return `${f(size.widthCm)} × ${f(size.heightCm)} cm`;
}
