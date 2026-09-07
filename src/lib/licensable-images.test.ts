import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodingFormat,
  licensableVariants,
  primaryLicensableVariant,
  sitemapImagesForArtwork,
} from "./licensable-images";
import { fallbackVariantUrl, publicVariantUrl, VARIANT_WIDTHS, variantUrl } from "./utils";

afterEach(() => {
  vi.unstubAllEnvs();
});

const FULL_LADDER = [256, 480, 640, 960, 1280, 1920, 2560, 4096];

describe("licensableVariants", () => {
  it("leads with the same variant the page's <img src> resolves to", () => {
    // The whole point of the ImageObject markup is to attach licence data
    // to the image Google actually crawled. If the first contentUrl and
    // the rendered <img src> ever drift apart, the badge can't attach.
    const objectKey = "collection-of-beauty/Starry_Night.jpg";
    const primary = primaryLicensableVariant({ variantWidths: FULL_LADDER });
    expect(variantUrl(objectKey, primary.width, primary.format)).toBe(
      fallbackVariantUrl(objectKey, FULL_LADDER),
    );
  });

  it("advertises the 1280 WebP first, then the larger AVIF rungs", () => {
    const variants = licensableVariants({ variantWidths: FULL_LADDER });
    expect(variants.map((v) => [v.width, v.format])).toEqual([
      [1280, "webp"],
      [2560, "avif"],
      [1920, "avif"],
    ]);
  });

  it("never names a width the artwork has no variant for", () => {
    // Emitting a rung that shrink-sources never encoded is a guaranteed
    // 404 for the crawler — the exact failure 32e4702 / f1d63db removed.
    const widths = [256, 480, 640, 960, 1280];
    const variants = licensableVariants({ variantWidths: widths });
    for (const v of variants) {
      expect(widths).toContain(v.width);
    }
    expect(variants.map((v) => v.width)).toEqual([1280]);
  });

  it("skips the 4096 close-up LOD and the full-size GPU rung", () => {
    // 4096 is the 3D gallery's texture LOD and 15968 the per-source
    // full-size AVIF; neither is fetched by the 2D detail page.
    const variants = licensableVariants({ variantWidths: [...FULL_LADDER, 15968] });
    expect(variants.map((v) => v.width)).not.toContain(4096);
    expect(variants.map((v) => v.width)).not.toContain(15968);
  });

  it("falls back to the nearest AVIF rung when no 1280 WebP exists", () => {
    // WebP is only encoded at 1280; without that rung the work has no
    // WebP at all, so the primary has to be AVIF.
    const variants = licensableVariants({ variantWidths: [960, 1920, 2560] });
    expect(variants[0]).toMatchObject({ width: 960, format: "avif" });
    // …and the primary must not be repeated among the extras.
    expect(variants.filter((v) => v.width === 960)).toHaveLength(1);
  });

  it("does not duplicate the primary when it is itself an advertised rung", () => {
    const variants = licensableVariants({ variantWidths: [1920, 2560] });
    expect(variants.map((v) => [v.width, v.format])).toEqual([
      [1920, "avif"],
      [2560, "avif"],
    ]);
  });

  it("assumes the standard ladder when the manifest is missing", () => {
    // Matches fallbackVariantUrl's reasoning: an artwork whose manifest
    // hasn't been regenerated still has the ladder on disk, and the
    // original isn't served at all.
    for (const manifest of [null, undefined, []]) {
      const variants = licensableVariants({ variantWidths: manifest });
      expect(variants[0]).toMatchObject({ width: 1280, format: "webp" });
      for (const v of variants) expect(VARIANT_WIDTHS).toContain(v.width);
    }
  });
});

describe("licensableVariants pixel dimensions", () => {
  it("scales the source aspect ratio down to the rung width", () => {
    const variants = licensableVariants({
      variantWidths: FULL_LADDER,
      width: 4000,
      height: 3000,
    });
    expect(variants[0]).toMatchObject({ pixelWidth: 1280, pixelHeight: 960 });
    expect(variants.find((v) => v.width === 2560)).toMatchObject({
      pixelWidth: 2560,
      pixelHeight: 1920,
    });
  });

  it("clamps to the source width — shrink-sources never enlarges", () => {
    // A 1400px source still gets a file named 2560.avif, but it is
    // 1400px wide. Claiming 2560 would be a checkable lie.
    const variants = licensableVariants({
      variantWidths: FULL_LADDER,
      width: 1400,
      height: 700,
    });
    expect(variants.find((v) => v.width === 2560)).toMatchObject({
      pixelWidth: 1400,
      pixelHeight: 700,
    });
    expect(variants.find((v) => v.width === 1920)).toMatchObject({
      pixelWidth: 1400,
      pixelHeight: 700,
    });
  });

  it("reports null dimensions rather than guessing when the source size is unknown", () => {
    const variants = licensableVariants({ variantWidths: FULL_LADDER, width: null, height: null });
    expect(variants[0]).toMatchObject({ pixelWidth: null, pixelHeight: null });
  });

  it("never rounds a very wide, very short work down to a zero height", () => {
    const variants = licensableVariants({ variantWidths: [1280], width: 20000, height: 3 });
    expect(variants[0].pixelHeight).toBe(1);
  });
});

describe("encodingFormat", () => {
  it("maps variant formats to their MIME types", () => {
    expect(encodingFormat("webp")).toBe("image/webp");
    expect(encodingFormat("avif")).toBe("image/avif");
  });
});

describe("sitemapImagesForArtwork", () => {
  const objectKey = "collection-of-beauty/Starry_Night.jpg";

  it("lists exactly one absolute image URL per artwork", () => {
    // <image:loc> has to be absolute, and one entry per work is the point
    // of an image sitemap — the same picture at three widths would only
    // multiply crawl fetches for one indexed result.
    const images = sitemapImagesForArtwork({ objectKey, variantWidths: FULL_LADDER });
    expect(images).toEqual([publicVariantUrl(objectKey, 1280, "webp")]);
    expect(images?.[0].startsWith("https://")).toBe(true);
  });

  it("names the same file the JSON-LD contentUrl does", () => {
    const source = { objectKey, variantWidths: FULL_LADDER };
    const [sitemapUrl] = sitemapImagesForArtwork(source) ?? [];
    const primary = primaryLicensableVariant(source);
    // Same path, possibly different origin in dev (proxy vs public CDN).
    expect(new URL(sitemapUrl).pathname).toBe(
      new URL(publicVariantUrl(objectKey, primary.width, primary.format)).pathname,
    );
  });

  it("follows the manifest rather than assuming a 1280 WebP exists", () => {
    const images = sitemapImagesForArtwork({ objectKey, variantWidths: [640, 960] });
    expect(images?.[0]).toContain("/960.avif");
  });

  it("contributes no image at all when the artwork has no objectKey", () => {
    // Better a URL entry with no <image:image> than an empty <image:loc>.
    expect(sitemapImagesForArtwork({ objectKey: "", variantWidths: FULL_LADDER })).toBeUndefined();
  });
});
