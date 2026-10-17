import { afterEach, describe, expect, it, vi } from "vitest";
import assetVersions from "@/data/asset-versions.json";
import {
  assetUrl,
  assetVersion,
  coverSizes,
  deepZoomTileUrl,
  fallbackVariantUrl,
  publicVariantUrl,
  slugify,
  textureVariantUrl,
  variantSrcSet,
  variantUrl,
} from "./utils";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("slugify", () => {
  it("flattens diacritics and lowercases", () => {
    // Wikidata names regularly carry accents (Pissarro, Dürer, Géricault).
    // The slug has to land somewhere ASCII so it's usable in URLs without
    // %-encoding artifacts in shared links.
    expect(slugify("Édouard Manet")).toBe("edouard-manet");
    expect(slugify("Albrecht Dürer")).toBe("albrecht-durer");
  });

  it("collapses runs of separators", () => {
    // Multiple spaces / punctuation appear in titles like
    // "Self-portrait    (1889)" — the slug shouldn't have empty
    // segments between dashes.
    expect(slugify("Self-portrait    (1889)")).toBe("self-portrait-1889");
  });

  it("trims leading/trailing separators", () => {
    // ' — Untitled — ' shouldn't produce '-untitled-' with empty ends.
    expect(slugify(" — Untitled — ")).toBe("untitled");
  });
});

describe("variantUrl", () => {
  it("builds the path with the basename folder and width.format suffix", () => {
    // Mirrors what shrink-sources.mjs emits on disk; if these drift the
    // browser 404s every variant.
    const url = variantUrl("audubon-birds/Plate_001.jpg", 960, "avif");
    expect(url).toMatch(/\/audubon-birds\/Plate_001\/960\.avif$/);
  });

  it("strips the extension regardless of case", () => {
    expect(variantUrl("x/Foo.JPG", 480, "webp")).toMatch(/\/x\/Foo\/480\.webp$/);
  });

  it("percent-encodes non-ASCII path segments", () => {
    // German museum filenames carry umlauts that must be %-encoded
    // for the asset host to resolve. Leaving the umlaut raw produced
    // 400-level failures on rclone earlier.
    const url = variantUrl("collection/Düsseldorf.jpg", 480, "avif");
    expect(url).not.toMatch(/[üÄ]/);
    expect(url).toMatch(/D%C3%BCsseldorf/);
  });

  it("returns empty string for missing objectKey instead of crashing", () => {
    // Generated JSON occasionally lands here with a missing field; the
    // page should render a broken image, not throw on `.lastIndexOf`.
    expect(variantUrl("", 480, "avif")).toBe("");
    expect(variantUrl(null as unknown as string, 480, "avif")).toBe("");
    expect(variantUrl(undefined as unknown as string, 480, "avif")).toBe("");
    expect(assetUrl("")).toBe("");
    expect(assetUrl(null as unknown as string)).toBe("");
    expect(variantSrcSet("", "avif", [256, 480])).toBe("");
  });
});

describe("fallbackVariantUrl", () => {
  it("serves the 1280w WebP, the only width the encoder keeps in WebP", () => {
    // The <img> inside <picture> is what non-AVIF browsers and crawlers
    // fetch. Pointing it at the original 404s — originals were never
    // synced to the asset host — which is what broke ~1.8k images in
    // the crawl.
    expect(fallbackVariantUrl("redoute-lilies/allium-ciliare.jpg")).toMatch(
      /\/redoute-lilies\/allium-ciliare\/1280\.webp$/,
    );
  });

  it("assumes the standard ladder when the width manifest is missing", () => {
    // variantWidths null/empty means build-data hasn't rescanned yet,
    // not that the files are absent — and the original is a certain
    // 404, so guessing the ladder is the better bet.
    expect(fallbackVariantUrl("x/a.jpg", null)).toMatch(/\/x\/a\/1280\.webp$/);
    expect(fallbackVariantUrl("x/a.jpg", [])).toMatch(/\/x\/a\/1280\.webp$/);
  });

  it("falls back to the nearest AVIF when 1280 was never emitted", () => {
    // No 1280 rung means no WebP at all for that artwork, so AVIF is
    // the only format left that exists on disk.
    expect(fallbackVariantUrl("x/a.jpg", [256, 480, 960])).toMatch(/\/x\/a\/960\.avif$/);
    expect(fallbackVariantUrl("x/a.jpg", [1920, 2560])).toMatch(/\/x\/a\/1920\.avif$/);
  });

  it("never returns the raw original path", () => {
    // Regression guard: the whole point is that <folder>/<file>.jpg is
    // not on the asset host.
    expect(fallbackVariantUrl("collection-of-beauty/Alfred_Sisley_018.jpg")).not.toMatch(
      /Alfred_Sisley_018\.jpg$/,
    );
  });

  it("keeps assetUrl's empty-objectKey guard", () => {
    expect(fallbackVariantUrl("")).toBe("");
    expect(fallbackVariantUrl(null as unknown as string)).toBe("");
    expect(fallbackVariantUrl(undefined as unknown as string, [960])).toBe("");
  });
});

describe("publicVariantUrl", () => {
  it("uses the deployed asset bucket when local dev serves assets through localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSETS_BASE_URL", "http://localhost:9837");

    expect(publicVariantUrl("collection/Foo.jpg", 1280, "webp")).toBe(
      "https://assets.collectionofbeauty.com/collection/Foo/1280.webp",
    );
  });

  it("honors the newsletter asset override", () => {
    vi.stubEnv("NEWSLETTER_ASSETS_BASE_URL", "https://cdn.example.test/assets/");

    expect(publicVariantUrl("collection/Foo.jpg", 1280, "webp")).toBe(
      "https://cdn.example.test/assets/collection/Foo/1280.webp",
    );
  });
});

describe("textureVariantUrl / deepZoomTileUrl", () => {
  it("resolves textureVariantUrl to the same path shape as variantUrl", () => {
    // textureVariantUrl is the only URL builder the 3D gallery uses. It
    // used to carry its own copy of the basename split, so a change to
    // the on-disk variant layout would have left every WebGL texture
    // fetch pointing at the old one while the 2D site moved on.
    const key = "collection/D\u00fcsseldorf Ansicht.jpg";
    expect(textureVariantUrl(key, 4096, "avif")).toBe(
      "/assets-raw/collection/D%C3%BCsseldorf%20Ansicht/4096.avif",
    );
    // Same tail as the CDN builder (ASSETS_BASE_URL is captured at
    // module load, so in tests both bases are the dev "/assets-raw").
    expect(variantUrl(key, 4096, "avif")).toBe(
      "/assets-raw/collection/D%C3%BCsseldorf%20Ansicht/4096.avif",
    );
  });

  it("fetches textures straight from the CDN in production", async () => {
    // Through the /assets-raw rewrite every texture took a detour via the
    // app server, three times as slow cold. The base is read at module
    // load, so load a fresh copy under production env.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ASSETS_BASE_URL", "https://assets.example.test/");
    vi.resetModules();
    const prod = await import("./utils");
    expect(prod.textureVariantUrl("collection/Foo.jpg", 480, "avif")).toBe(
      "https://assets.example.test/collection/Foo/480.avif",
    );
    vi.resetModules();
  });

  it("hangs the tile pyramid off the same variant directory", () => {
    // The pyramid lives one level under the variant dir. If the two
    // disagree about the directory, OpenSeadragon 404s every tile.
    expect(deepZoomTileUrl("collection/Foo.jpg", 7, 3, 2)).toMatch(
      /\/collection\/Foo\/tiles\/7\/3_2\.webp$/,
    );
  });

  it("versions every URL of a work encoded again in place", () => {
    // Variants are served immutable, so a cut or refetched work needs a
    // new URL or browsers keep the old pixels (Krüger's Parade kept its
    // frame on 17 October 2026).
    const [key, version] = Object.entries(assetVersions as Record<string, string>)[0];
    expect(assetVersion(key)).toBe(version);
    expect(variantUrl(key, 960, "avif")).toMatch(new RegExp(`/960\\.avif\\?v=${version}$`));
    expect(textureVariantUrl(key, 960, "avif")).toMatch(new RegExp(`\\?v=${version}$`));
    expect(publicVariantUrl(key, 960, "avif")).toMatch(new RegExp(`\\?v=${version}$`));
    expect(deepZoomTileUrl(key, 7, 3, 2)).toMatch(
      new RegExp(`/tiles/7/3_2\\.webp\\?v=${version}$`),
    );
    expect(variantSrcSet(key, "avif", [480, 960])).toContain(`480.avif?v=${version} 480w`);
    expect(assetVersion("collection/Foo.jpg")).toBeNull();
  });

  it("keeps the empty-objectKey guard", () => {
    expect(textureVariantUrl("", 256, "avif")).toBe("");
    expect(deepZoomTileUrl("", 0, 0, 0)).toBe("");
  });
});

describe("variantSrcSet", () => {
  it("emits one entry per width with the ` Nw` descriptor", () => {
    // The browser parses this; a missing space before the descriptor
    // is silently invalid and falls back to the largest entry.
    const srcset = variantSrcSet("x/a.jpg", "avif", [256, 480, 960]);
    expect(srcset.split(", ")).toHaveLength(3);
    expect(srcset).toMatch(/ 256w/);
    expect(srcset).toMatch(/ 480w/);
    expect(srcset).toMatch(/ 960w/);
  });

  it("preserves the order of the input widths", () => {
    const srcset = variantSrcSet("x/a.jpg", "avif", [960, 256, 480]);
    const widths = srcset.split(", ").map((s) => s.split(" ")[1]);
    expect(widths).toEqual(["960w", "256w", "480w"]);
  });
});

describe("coverSizes", () => {
  const sizes = "(max-width: 640px) 50vw, 20vw";

  it("widens every vw length by how far a wide work overhangs its box", () => {
    expect(coverSizes(sizes, 3, 1)).toBe("(max-width: 640px) 150vw, 60vw");
    expect(coverSizes(sizes, 2, 4 / 3)).toBe("(max-width: 640px) 75vw, 30vw");
  });

  it("leaves works no wider than the box alone", () => {
    expect(coverSizes(sizes, 0.7, 1)).toBe(sizes);
    expect(coverSizes(sizes, 1, 1)).toBe(sizes);
    expect(coverSizes(sizes, null, 1)).toBe(sizes);
  });
});
