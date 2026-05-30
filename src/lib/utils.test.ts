import { afterEach, describe, expect, it, vi } from "vitest";
import { assetUrl, publicVariantUrl, slugify, variantSrcSet, variantUrl } from "./utils";

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

describe("publicVariantUrl", () => {
  it("uses the deployed asset bucket when local dev serves assets through localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSETS_BASE_URL", "http://localhost:9837");

    expect(publicVariantUrl("collection/Foo.jpg", 1280, "webp")).toBe(
      "https://assets.beauty.trebeljahr.com/collection/Foo/1280.webp",
    );
  });

  it("honors the newsletter asset override", () => {
    vi.stubEnv("NEWSLETTER_ASSETS_BASE_URL", "https://cdn.example.test/assets/");

    expect(publicVariantUrl("collection/Foo.jpg", 1280, "webp")).toBe(
      "https://cdn.example.test/assets/collection/Foo/1280.webp",
    );
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
