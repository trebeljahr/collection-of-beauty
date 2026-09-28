import { describe, expect, it } from "vitest";
import { artworks } from "@/lib/data";
import { GOOGLE_ART_PROJECT } from "./google-art-project.mjs";
import {
  ASPECT_TOLERANCE,
  formatCm,
  HAND_MAX_CM,
  MAX_SIDE_CM,
  MIN_SIDE_CM,
  type RealSizeInput,
  scaleReferenceFor,
  trustworthyRealSize,
} from "./real-size";

type Source = NonNullable<RealSizeInput["realDimensions"]>["source"];

/** A work whose pixels match its size exactly unless `px` says otherwise.
 *  Pixel sizes are scaled up so the aspect is not rounded away. */
function work(
  widthCm: number,
  heightCm: number,
  source: Source = "wikidata",
  opts: { px?: [number, number] | null; objectKey?: string; id?: string } = {},
): RealSizeInput {
  const px = opts.px === undefined ? [widthCm * 100, heightCm * 100] : opts.px;
  return {
    id: opts.id ?? "collection-of-beauty-test",
    objectKey: opts.objectKey ?? "collection-of-beauty/Test.jpg",
    artistSlug: "test",
    width: px ? px[0] : null,
    height: px ? px[1] : null,
    realDimensions: { widthCm, heightCm, source },
  };
}

/** Pixel size whose aspect is `widthCm/heightCm` scaled by e^logError. */
function skewedPx(widthCm: number, heightCm: number, logError: number): [number, number] {
  return [Math.round(widthCm * 1000 * Math.exp(logError)), heightCm * 1000];
}

const GAP_KEY = "collection-of-beauty/Artist_-_Title_-_Google_Art_Project.jpg";

describe("trustworthyRealSize — missing and malformed input", () => {
  it("returns null when the work has no size", () => {
    expect(trustworthyRealSize({ ...work(10, 10), realDimensions: null })).toBeNull();
  });

  // The shape check is the main defence; a size it cannot check is not drawn.
  it("returns null when the pixel size is unknown", () => {
    expect(trustworthyRealSize(work(73.7, 92.1, "wikidata", { px: null }))).toBeNull();
  });

  it("returns null for zero, negative or non-finite sides", () => {
    expect(trustworthyRealSize(work(0, 50, "wikidata", { px: [100, 100] }))).toBeNull();
    expect(trustworthyRealSize(work(-50, 50, "wikidata", { px: [100, 100] }))).toBeNull();
    expect(trustworthyRealSize(work(Number.NaN, 50, "wikidata", { px: [100, 100] }))).toBeNull();
  });
});

describe("trustworthyRealSize — shape check", () => {
  it("passes a size whose shape matches the image", () => {
    expect(trustworthyRealSize(work(73.7, 92.1))).toEqual({ widthCm: 73.7, heightCm: 92.1 });
  });

  it("passes a size just inside the tolerance, in either direction", () => {
    const inside = ASPECT_TOLERANCE - 0.005;
    expect(
      trustworthyRealSize(work(60, 80, "wikidata", { px: skewedPx(60, 80, inside) })),
    ).not.toBeNull();
    expect(
      trustworthyRealSize(work(60, 80, "wikidata", { px: skewedPx(60, 80, -inside) })),
    ).not.toBeNull();
  });

  // Symmetric log ratio: an image 16% too wide and one 16% too tall are
  // the same error and both fail.
  it("rejects a size just over the tolerance, in either direction", () => {
    const over = ASPECT_TOLERANCE + 0.005;
    expect(
      trustworthyRealSize(work(60, 80, "wikidata", { px: skewedPx(60, 80, over) })),
    ).toBeNull();
    expect(
      trustworthyRealSize(work(60, 80, "wikidata", { px: skewedPx(60, 80, -over) })),
    ).toBeNull();
  });

  // A measurement that matches only when turned is a data error, fixed
  // in the sidecar rather than read at render time. Carracci's Susanna
  // was one until its Commons template was parsed by name.
  it("rejects a per-work size whose width and height are swapped", () => {
    // Stored 92.1 wide × 73.7 tall; the image is portrait.
    const art = work(92.1, 73.7, "wikidata", { px: [737, 921] });
    expect(trustworthyRealSize(art)).toBeNull();
  });

  it("keeps the stored order when it already passes", () => {
    const art = work(81.3, 81.8, "wikidata", { px: [818, 813] });
    expect(trustworthyRealSize(art)).toEqual({ widthCm: 81.3, heightCm: 81.8 });
  });

  it("rejects a size that fails in both orders", () => {
    // Monet W419 as audited: the Hermitage panel's 194 × 173 cm on the
    // 1024 × 737 scan of its study.
    expect(trustworthyRealSize(work(194, 173, "museum", { px: [1024, 737] }))).toBeNull();
  });
});

describe("trustworthyRealSize — absolute bounds", () => {
  it("rejects a side under the minimum even when the shape matches", () => {
    expect(trustworthyRealSize(work(MIN_SIDE_CM - 0.5, 3))).toBeNull();
    expect(trustworthyRealSize(work(MIN_SIDE_CM, 3))).not.toBeNull();
  });

  it("rejects a side over the maximum even when the shape matches", () => {
    expect(trustworthyRealSize(work(MAX_SIDE_CM + 100, 800))).toBeNull();
    expect(trustworthyRealSize(work(994, 677))).not.toBeNull();
  });
});

describe("trustworthyRealSize — unit mix-ups", () => {
  // Google Art Project template values have no knowable unit below the
  // 400 cm rescale line: Turner's 1793 watercolour read 276 × 200 cm.
  it("rejects an un-rescaled template value on a Google Art Project scan", () => {
    const art = work(276, 200, "wikimedia-template", { objectKey: GAP_KEY });
    expect(trustworthyRealSize(art)).toBeNull();
  });

  it("keeps a template value on any other file", () => {
    // Rubens, The Judgment of Paris (Prado): 381 × 199 cm.
    const art = work(381, 199, "wikimedia-template", {
      objectKey: "collection-of-beauty/Peter_Paul_Rubens_115.jpg",
    });
    expect(trustworthyRealSize(art)).toEqual({ widthCm: 381, heightCm: 199 });
  });

  // build-data applies the /10 rescale on Google Art Project files only,
  // where the mm reading is right: American Gothic reads 65.3 × 78.
  it("keeps a /10 rescale on a Google Art Project scan", () => {
    const gap = work(65.3, 78, "wikimedia-template-mm", { objectKey: GAP_KEY });
    expect(trustworthyRealSize(gap)).toEqual({ widthCm: 65.3, heightCm: 78 });
  });

  it("matches the Google Art Project marker in either spelling", () => {
    const spaced = work(276, 200, "wikimedia-template", {
      objectKey: "collection-of-beauty/Turner - Clare Hall - Google Art Project.jpg",
    });
    expect(trustworthyRealSize(spaced)).toBeNull();
  });
});

describe("trustworthyRealSize — per-source rules", () => {
  it("rejects series-default print formats even when the shape matches", () => {
    expect(trustworthyRealSize(work(27, 39, "series-default"))).toBeNull();
  });

  it("passes a portrait Audubon plate at the Havell sheet size", () => {
    const plate = work(67.31, 100.33, "static", {
      objectKey: "audubon-birds/100_Marsh_Wren.jpg",
      px: [7000, 10300],
    });
    expect(trustworthyRealSize(plate)).toEqual({ widthCm: 67.31, heightCm: 100.33 });
  });

  it("turns the sheet for a landscape Audubon plate", () => {
    const plate = work(67.31, 100.33, "static", {
      objectKey: "audubon-birds/224_Kittiwake_Gull.jpg",
      px: [10100, 7100],
    });
    expect(trustworthyRealSize(plate)).toEqual({ widthCm: 100.33, heightCm: 67.31 });
  });

  it("passes a Haeckel plate at the Kunstformen page size", () => {
    const plate = work(26, 36, "static", {
      objectKey: "kunstformen-images/Haeckel_Gamochonia.jpg",
      px: [2494, 3644],
    });
    expect(trustworthyRealSize(plate)).toEqual({ widthCm: 26, heightCm: 36 });
  });

  // Redouté scans are cut-outs of the plant, so the sheet size does not
  // describe them, even when the cut-out happens to share its shape.
  it("rejects a Redouté plate even when its shape matches the sheet", () => {
    const lily = work(35, 52.2, "static", { objectKey: "redoute-lilies/Iris_pratensis.jpg" });
    expect(trustworthyRealSize(lily)).toBeNull();
  });

  it("rejects a Redouté roses plate at the Roses sheet size", () => {
    // rosa-alba-flore-pleno: 3292 × 4784 px, 4.8% off the sheet's shape.
    const rose = work(25.2, 34.9, "static", {
      objectKey: "redoute-roses/rosa-alba-flore-pleno.jpg",
      px: [3292, 4784],
    });
    expect(trustworthyRealSize(rose)).toBeNull();
  });

  // Plate 162 is cut to the picture area: 17.6% off the sheet as given,
  // and further off turned, so neither order passes.
  it("rejects an Audubon plate whose scan does not show the whole sheet", () => {
    const dove = work(67.31, 100.33, "static", {
      objectKey: "audubon-birds/162_Zenaida_Dove.jpg",
      px: [8112, 10144],
    });
    expect(trustworthyRealSize(dove)).toBeNull();
  });

  it("rejects a sheet size outside its own book, and a stray size inside it", () => {
    const wrongFolder = work(67.31, 100.33, "static", { objectKey: "collection-of-beauty/X.jpg" });
    expect(trustworthyRealSize(wrongFolder)).toBeNull();
    const wrongSize = work(60, 90, "static", { objectKey: "audubon-birds/1_Wild_Turkey.jpg" });
    expect(trustworthyRealSize(wrongSize)).toBeNull();
  });

  it("rejects the Vesalius page size on type-block scans", () => {
    const plate = work(28, 42, "commons", {
      id: "collection-of-beauty-de-humani-corporis-fabrica-24",
      objectKey: "collection-of-beauty/De_humani_corporis_fabrica_(24).jpg",
    });
    expect(trustworthyRealSize(plate)).toBeNull();
  });
});

describe("scaleReferenceFor", () => {
  it("switches from the hand to the figure at the hand threshold", () => {
    expect(scaleReferenceFor({ widthCm: 10, heightCm: HAND_MAX_CM - 0.1 }).kind).toBe("hand");
    expect(scaleReferenceFor({ widthCm: 10, heightCm: HAND_MAX_CM }).kind).toBe("person");
  });

  it("uses the longest side, so a long low scroll gets the figure", () => {
    expect(scaleReferenceFor({ widthCm: 243.7, heightCm: 29.4 }).kind).toBe("person");
  });

  it("gives Audubon plates, Haeckel plates, ōban prints and small panels the figure", () => {
    expect(scaleReferenceFor({ widthCm: 67.31, heightCm: 100.33 }).kind).toBe("person");
    expect(scaleReferenceFor({ widthCm: 100.33, heightCm: 67.31 }).kind).toBe("person");
    expect(scaleReferenceFor({ widthCm: 26, heightCm: 36 }).kind).toBe("person");
    expect(scaleReferenceFor({ widthCm: 24, heightCm: 36 }).kind).toBe("person");
    expect(scaleReferenceFor({ widthCm: 35.3, heightCm: 44.1 }).kind).toBe("person");
  });

  it("describes each reference by its drawn bounding box", () => {
    expect(scaleReferenceFor({ widthCm: 100, heightCm: 100 })).toEqual({
      kind: "person",
      widthCm: 40.6,
      heightCm: 175,
      label: "Figure 175 cm tall",
    });
    expect(scaleReferenceFor({ widthCm: 5, heightCm: 5 })).toEqual({
      kind: "hand",
      widthCm: 11.6,
      heightCm: 19,
      label: "Adult hand, 19 cm long",
    });
  });

  it("returns a fresh object each call", () => {
    const a = scaleReferenceFor({ widthCm: 100, heightCm: 100 });
    a.label = "changed";
    expect(scaleReferenceFor({ widthCm: 100, heightCm: 100 }).label).toBe("Figure 175 cm tall");
  });

  // Neither drawing should shrink to a speck at the band edges: the work's
  // longest side stays within 0.08–6× the reference's height.
  it("keeps work and reference within 0.08–6× of each other at every band edge", () => {
    for (const longest of [5, HAND_MAX_CM - 0.1, HAND_MAX_CM, 994]) {
      const ref = scaleReferenceFor({ widthCm: longest, heightCm: longest / 2 });
      const ratio = longest / ref.heightCm;
      expect(ratio, `longest ${longest} cm`).toBeGreaterThanOrEqual(0.08);
      expect(ratio, `longest ${longest} cm`).toBeLessThanOrEqual(6);
    }
  });
});

describe("formatCm", () => {
  it("rounds to one decimal, width first", () => {
    expect(formatCm({ widthCm: 73.66, heightCm: 92.08 })).toBe("73.7 × 92.1 cm");
    expect(formatCm({ widthCm: 100.33, heightCm: 67.31 })).toBe("100.3 × 67.3 cm");
  });

  it("drops a trailing .0", () => {
    expect(formatCm({ widthCm: 100, heightCm: 67.3 })).toBe("100 × 67.3 cm");
    expect(formatCm({ widthCm: 59.96, heightCm: 12.04 })).toBe("60 × 12 cm");
    expect(formatCm({ widthCm: 994, heightCm: 677 })).toBe("994 × 677 cm");
  });
});

// Invariants on the shipped catalogue. Counts are left out on purpose: they
// move with every data fix, and the rules are what must hold.
describe("the catalogue", () => {
  const trusted = artworks
    .map((a) => ({ a, size: trustworthyRealSize(a) }))
    .filter(
      (t): t is { a: (typeof artworks)[number]; size: NonNullable<typeof t.size> } =>
        t.size !== null,
    );

  it("draws no Redouté plate and no print-format default", () => {
    for (const { a } of trusted) {
      expect(a.folder.startsWith("redoute-"), a.id).toBe(false);
      expect(a.realDimensions?.source, a.id).not.toBe("series-default");
    }
  });

  // The mm/cm rescale belongs to Google Art Project's pretty_dimensions
  // field. Applied to every template value, it shrank these three tenfold.
  it("rescales only Google Art Project files", () => {
    for (const a of artworks) {
      if (a.realDimensions?.source !== "wikimedia-template-mm") continue;
      expect(GOOGLE_ART_PROJECT.test(a.objectKey), a.id).toBe(true);
    }
  });

  it("keeps real centimetres over 4 m outside Google Art Project", () => {
    const frescoes: [string, number, number][] = [
      ["collection-of-beauty-tentaciones-de-cristo-botticelli", 555, 345.5],
      ["collection-of-beauty-jacopo-tintoretto-marriage-at-cana-wga22470", 535, 435],
      ["collection-of-beauty-tintoretto-prayer-in-the-garden", 455, 538],
    ];
    for (const [id, widthCm, heightCm] of frescoes) {
      const art = artworks.find((a) => a.id === id);
      if (art) expect(trustworthyRealSize(art), id).toEqual({ widthCm, heightCm });
    }
  });

  it("keeps every drawn work within 0.08–6× its reference", () => {
    for (const { a, size } of trusted) {
      const ref = scaleReferenceFor(size);
      const ratio = Math.max(size.widthCm, size.heightCm) / ref.heightCm;
      expect(ratio, a.id).toBeGreaterThanOrEqual(0.08);
      expect(ratio, a.id).toBeLessThanOrEqual(6);
    }
  });

  it("turns a stored size only for a book's sheet", () => {
    for (const { a, size } of trusted) {
      if (size.widthCm === a.realDimensions?.widthCm) continue;
      expect(a.realDimensions?.source, a.id).toBe("static");
    }
  });

  it("puts every drawn Audubon plate beside the figure", () => {
    const plates = trusted.filter(({ a }) => a.folder === "audubon-birds");
    expect(plates.length).toBeGreaterThan(0);
    for (const { a, size } of plates) expect(scaleReferenceFor(size).kind, a.id).toBe("person");
  });
});
