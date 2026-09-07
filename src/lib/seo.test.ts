import { describe, expect, it } from "vitest";
import type { Artwork } from "./data";
import { WEBP_WIDTH } from "./downloads";
import { artworkImageObjects, artworkJsonLd, ogImagesForArtwork, SITE_URL } from "./seo";
import { fallbackVariantUrl } from "./utils";

function makeArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: "starry-night",
    title: "De sterrennacht",
    englishTitle: "The Starry Night",
    artist: "Vincent van Gogh",
    artistSlug: "vincent-van-gogh",
    year: 1889,
    dateCreated: "1889",
    originalDateString: null,
    description: "A village under a churning night sky.",
    folder: "collection-of-beauty",
    objectKey: "collection-of-beauty/Starry_Night.jpg",
    width: 4000,
    height: 3175,
    realDimensions: null,
    variantWidths: [256, 480, 640, 960, 1280, 1920, 2560, 4096],
    dominantColor: "#1b2a4a",
    fileUrl: "https://upload.wikimedia.org/starry.jpg",
    commonsUrl: "https://commons.wikimedia.org/wiki/File:Starry_Night.jpg",
    credit: null,
    license: "Public domain",
    movement: "Post-Impressionism",
    nationality: "Dutch",
    provenance: null,
    ...overrides,
  } as Artwork;
}

describe("artworkImageObjects", () => {
  it("emits the fields Google's licensable-image feature reads", () => {
    // contentUrl is required; license + acquireLicensePage are what
    // actually earn the "Free to use" badge in Google Images.
    const [primary] = artworkImageObjects(makeArtwork());
    expect(primary["@type"]).toBe("ImageObject");
    expect(primary.contentUrl).toBe(
      fallbackVariantUrl(
        "collection-of-beauty/Starry_Night.jpg",
        [256, 480, 640, 960, 1280, 1920, 2560, 4096],
      ),
    );
    expect(primary.license).toBe("https://creativecommons.org/publicdomain/mark/1.0/");
    expect(primary.acquireLicensePage).toBe(`${SITE_URL}/artwork/starry-night`);
    expect(primary.isAccessibleForFree).toBe(true);
    expect(primary.encodingFormat).toBe("image/webp");
    expect(primary.representativeOfPage).toBe(true);
  });

  it("carries creator, credit, and copyright notice on every entry", () => {
    const objects = artworkImageObjects(makeArtwork());
    expect(objects.length).toBeGreaterThan(1);
    for (const o of objects) {
      expect(o.creator).toEqual({
        "@type": "Person",
        name: "Vincent van Gogh",
        url: `${SITE_URL}/artist/vincent-van-gogh`,
      });
      // No explicit credit line on this record, so it falls back to the
      // source host's display name.
      expect(o.creditText).toBe("Wikimedia Commons");
      expect(o.copyrightNotice).toBe("Public domain");
      expect(o.caption).toContain("The Starry Night");
    }
  });

  it("prefers an explicit credit line over the derived source label", () => {
    const [primary] = artworkImageObjects(makeArtwork({ credit: "Rijksmuseum, Amsterdam" }));
    expect(primary.creditText).toBe("Rijksmuseum, Amsterdam");
  });

  it("marks only the first entry as representative of the page", () => {
    const objects = artworkImageObjects(makeArtwork());
    expect(objects.slice(1).every((o) => o.representativeOfPage === undefined)).toBe(true);
  });

  it("omits creator entirely for anonymous works", () => {
    // An absent optional property is valid structured data; an invented
    // creator is not.
    const [primary] = artworkImageObjects(makeArtwork({ artist: null }));
    expect(primary.creator).toBeUndefined();
  });

  it("resolves a non-public-domain licence to its own deed URL", () => {
    const [primary] = artworkImageObjects(makeArtwork({ license: "CC BY-SA 4.0" }));
    expect(primary.license).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("types pixel dimensions as a QuantitativeValue in pixels", () => {
    // schema.org types MediaObject.width/height as Distance or
    // QuantitativeValue — a bare integer is the out-of-range shape that
    // got `"nationality": "Italian"` rejected. E37 is UN/CEFACT "pixel".
    const [primary] = artworkImageObjects(makeArtwork());
    expect(primary.width).toEqual({
      "@type": "QuantitativeValue",
      unitCode: "E37",
      value: 1280,
    });
    expect(primary.height).toEqual({
      "@type": "QuantitativeValue",
      unitCode: "E37",
      value: 1016,
    });
  });

  it("omits pixel dimensions when the source size is unknown", () => {
    const objects = artworkImageObjects(makeArtwork({ width: null, height: null }));
    for (const o of objects) {
      expect(o.width).toBeUndefined();
      expect(o.height).toBeUndefined();
    }
  });

  it("never points at a variant width the artwork lacks", () => {
    // Originals aren't on R2 and un-encoded rungs 404 — a contentUrl the
    // crawler can't fetch disqualifies the image rather than being ignored.
    const objects = artworkImageObjects(makeArtwork({ variantWidths: [640, 1280] }));
    expect(objects).toHaveLength(1);
    expect(String(objects[0].contentUrl)).toContain("/1280.webp");
  });
});

describe("artworkJsonLd", () => {
  it("nests ImageObject entries rather than bare URL strings", () => {
    const jsonLd = artworkJsonLd(makeArtwork());
    const images = jsonLd.image as Record<string, unknown>[];
    expect(Array.isArray(images)).toBe(true);
    expect(images.every((i) => i["@type"] === "ImageObject")).toBe(true);
  });

  it("keeps the licence fields on the VisualArtwork itself", () => {
    const jsonLd = artworkJsonLd(makeArtwork());
    expect(jsonLd["@type"]).toBe("VisualArtwork");
    expect(jsonLd.license).toBe("https://creativecommons.org/publicdomain/mark/1.0/");
    expect(jsonLd.acquireLicensePage).toBe(`${SITE_URL}/artwork/starry-night`);
    expect(jsonLd.isAccessibleForFree).toBe(true);
    expect(jsonLd.creditText).toBe("Wikimedia Commons");
  });

  it("agrees with the nested images on credit and licence", () => {
    const artwork = makeArtwork({ credit: "The Met" });
    const jsonLd = artworkJsonLd(artwork);
    const images = jsonLd.image as Record<string, unknown>[];
    for (const image of images) {
      expect(image.creditText).toBe(jsonLd.creditText);
      expect(image.license).toBe(jsonLd.license);
      expect(image.acquireLicensePage).toBe(jsonLd.url);
    }
  });

  it("serialises without undefined leaking into the emitted JSON", () => {
    // JSON.stringify drops undefined values, but a spread that produced
    // `"creator": undefined` would still be a smell — assert the shipped
    // string is clean for an anonymous, dimension-less work.
    const json = JSON.stringify(
      artworkJsonLd(makeArtwork({ artist: null, width: null, height: null })),
    );
    expect(json).not.toContain("undefined");
    expect(JSON.parse(json).image[0].contentUrl).toBeTruthy();
  });
});

describe("ogImagesForArtwork", () => {
  // Every og:image has to be a width the pipeline actually encodes as
  // WebP, and FORMATS in shrink-sources.mjs overrides that to a single
  // entry. A second card at 640.webp shipped on every artwork page for
  // months pointing at a file that has never existed, and nothing caught
  // it: verify-r2 checks the AVIF manifest plus one 1280.webp, so the
  // deploy gate never HEADs the extra key.
  it("emits exactly one card, at the only width encoded as WebP", () => {
    const images = ogImagesForArtwork(makeArtwork());
    expect(Array.isArray(images)).toBe(true);
    const list = images as { url: string }[];
    expect(list).toHaveLength(1);
    expect(list[0].url.endsWith(`/${WEBP_WIDTH}.webp`)).toBe(true);
  });

  it("returns nothing for a missing artwork rather than a broken card", () => {
    expect(ogImagesForArtwork(null)).toEqual([]);
  });
});
