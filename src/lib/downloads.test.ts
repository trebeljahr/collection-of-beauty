import { describe, expect, it } from "vitest";
import { VARIANT_WIDTHS } from "@/lib/utils";
import {
  attributionText,
  downloadFilename,
  downloadOptions,
  hasFullSizeDownload,
  LADDER_MAX_WIDTH,
  largestDownload,
  WEBP_WIDTH,
} from "./downloads";
import { GALLERY_LOD_WIDTH } from "./variant-config.mjs";

const base = {
  title: "Mountain Hall",
  englishTitle: null,
  artist: "Dong Yuan",
  year: 960,
  license: "Public domain",
  commonsUrl: "https://commons.wikimedia.org/wiki/File:Foo.jpg",
  credit: null,
};

describe("downloadOptions", () => {
  it("offers only widths present in the manifest", () => {
    // The whole point of the manifest: a width that shrink never encoded
    // 404s. This is the same rule variantSrcSet was fixed for in 32e4702.
    const options = downloadOptions({ variantWidths: [256, 640, 4096], width: 8000, height: 4000 });
    expect(options.filter((o) => o.format === "avif").map((o) => o.width)).toEqual([
      4096, 640, 256,
    ]);
  });

  it("leads with the largest width", () => {
    const options = downloadOptions({
      variantWidths: [640, 9361, 256],
      width: 12384,
      height: 21675,
    });
    expect(options[0].width).toBe(9361);
    expect(options[0].isLargest).toBe(true);
    expect(options.filter((o) => o.isLargest)).toHaveLength(1);
  });

  it("marks the per-source full-size encode", () => {
    const big = downloadOptions({ variantWidths: [2560, 9361], width: 12384, height: 21675 });
    expect(big[0].isFullSize).toBe(true);
    const small = downloadOptions({ variantWidths: [2560, 4096], width: 4096, height: 3000 });
    expect(small[0].isFullSize).toBe(false);
  });

  it("does not mistake the 3D gallery's LOD rung for a full-size encode", () => {
    // 6144 is above the ladder max but is not a per-source full-size
    // encode — shrink emits it only beneath a strictly larger full-size
    // rung. Flagging it would put a second "full resolution" row on the
    // download page for the 648 works that carry one.
    const options = downloadOptions({
      variantWidths: [2560, 4096, GALLERY_LOD_WIDTH, 10871],
      width: 10871,
      height: 2897,
    });
    expect(options.find((o) => o.width === GALLERY_LOD_WIDTH)?.isFullSize).toBe(false);
    expect(options.find((o) => o.width === 10871)?.isFullSize).toBe(true);
    expect(options.filter((o) => o.isFullSize)).toHaveLength(1);
  });

  it("still marks a full-size encode that lands exactly on the LOD width", () => {
    // The disambiguation is positional, not by value: a work whose
    // full-size rung is itself 6144 px gets no LOD rung (the gate is
    // strict), so a leading 6144 is the real thing.
    const options = downloadOptions({
      variantWidths: [2560, 4096, GALLERY_LOD_WIDTH],
      width: 6144,
      height: 4000,
    });
    expect(options[0].width).toBe(GALLERY_LOD_WIDTH);
    expect(options[0].isFullSize).toBe(true);
  });

  it("adds a WebP option only when the 1280 rung exists", () => {
    // shrink-sources.mjs caps the webp entry at [1280]; offering webp at
    // any other width is a guaranteed 404.
    const withWebp = downloadOptions({
      variantWidths: [640, 1280, 2560],
      width: 3000,
      height: 2000,
    });
    expect(withWebp.filter((o) => o.format === "webp").map((o) => o.width)).toEqual([1280]);

    const withoutWebp = downloadOptions({ variantWidths: [640, 2560], width: 3000, height: 2000 });
    expect(withoutWebp.some((o) => o.format === "webp")).toBe(false);
  });

  it("never marks the WebP compatibility entry as largest", () => {
    const options = downloadOptions({ variantWidths: [1280], width: 1280, height: 900 });
    const webp = options.find((o) => o.format === "webp");
    expect(webp?.isLargest).toBe(false);
  });

  it("falls back to the standard ladder when the manifest is missing", () => {
    // Matches fallbackVariantUrl's bet: an unshrunk artwork is more likely
    // to have the ladder than anything else, and the original is served
    // for nobody.
    const options = downloadOptions({ variantWidths: null, width: 2000, height: 1000 });
    expect(options[0].width).toBe(LADDER_MAX_WIDTH);
  });

  it("treats an empty manifest the same as a missing one", () => {
    expect(downloadOptions({ variantWidths: [], width: 100, height: 100 })).not.toHaveLength(0);
  });

  it("offers the whole standard ladder when it falls back", () => {
    // Pins what the fallback actually is: every rung of VARIANT_WIDTHS
    // descending, plus the 1280 WebP compatibility entry — not just the
    // widest rung. Both the null and the empty manifest take this path.
    const ladder = [...VARIANT_WIDTHS].sort((a, b) => b - a);
    const manifests: (number[] | null)[] = [null, []];
    for (const variantWidths of manifests) {
      const options = downloadOptions({ variantWidths, width: 2000, height: 1000 });
      expect(options.filter((o) => o.format === "avif").map((o) => o.width)).toEqual(ladder);
      expect(options.filter((o) => o.format === "webp").map((o) => o.width)).toEqual([WEBP_WIDTH]);
    }
  });

  it("dedupes and sorts a manifest that arrives out of order", () => {
    const options = downloadOptions({ variantWidths: [640, 256, 640], width: 800, height: 600 });
    expect(options.filter((o) => o.format === "avif").map((o) => o.width)).toEqual([640, 256]);
  });

  it("labels with both dimensions when the aspect ratio is known", () => {
    const [first] = downloadOptions({ variantWidths: [1000], width: 2000, height: 1000 });
    expect(first.label).toBe("1,000 × 500 px");
    expect(first.height).toBe(500);
  });

  it("labels width-only when dimensions are missing", () => {
    const [first] = downloadOptions({ variantWidths: [1000], width: null, height: null });
    expect(first.label).toBe("1,000 px wide");
    expect(first.height).toBeNull();
  });
});

describe("largestDownload / hasFullSizeDownload", () => {
  it("agree on the leading option", () => {
    const art = { variantWidths: [2560, 11136], width: 11136, height: 7000 };
    expect(largestDownload(art)?.width).toBe(11136);
    expect(hasFullSizeDownload(art)).toBe(true);
  });

  it("reports no full size for a ladder-only work", () => {
    expect(hasFullSizeDownload({ variantWidths: [256, 1280], width: 1400, height: 900 })).toBe(
      false,
    );
  });
});

describe("downloadFilename", () => {
  it("stamps the width so two rungs don't collide", () => {
    expect(downloadFilename(base, 4096, "avif")).toBe("dong-yuan-mountain-hall-4096px.avif");
  });

  it("prefers the curated English title", () => {
    expect(downloadFilename({ ...base, englishTitle: "Summer Mountains" }, 640, "webp")).toBe(
      "dong-yuan-summer-mountains-640px.webp",
    );
  });

  it("survives an artwork with no artist", () => {
    expect(downloadFilename({ ...base, artist: null }, 256, "avif")).toBe(
      "mountain-hall-256px.avif",
    );
  });

  it("flattens non-Latin titles rather than emitting %-encoded junk", () => {
    const name = downloadFilename({ ...base, title: "Тайная вечеря", artist: null }, 640, "avif");
    expect(name).toMatch(/^[a-z0-9-]*-640px\.avif$/);
  });

  it("falls back to a usable stem when the title slugifies to nothing", () => {
    expect(downloadFilename({ ...base, title: "###", artist: null }, 640, "avif")).toBe(
      "artwork-640px.avif",
    );
  });
});

describe("attributionText", () => {
  it("states public domain without an obligation to attribute", () => {
    expect(attributionText(base)).toBe(
      "Mountain Hall, Dong Yuan, 960. Public domain. Source: Wikimedia Commons.",
    );
  });

  it("uses the explicit credit over the source host", () => {
    expect(attributionText({ ...base, credit: "University of Pittsburgh" })).toContain(
      "Source: University of Pittsburgh.",
    );
  });

  it("says 'Licensed' for works that carry real conditions", () => {
    expect(attributionText({ ...base, license: "CC BY-SA 4.0" })).toContain(
      "Licensed CC BY-SA 4.0.",
    );
  });

  it("drops missing artist and year rather than printing null", () => {
    const text = attributionText({ ...base, artist: null, year: null });
    expect(text).toBe("Mountain Hall. Public domain. Source: Wikimedia Commons.");
  });

  it("strips the dangling footnote artifact off a scraped caption", () => {
    // kunstformen-images credits are Commons captions whose inline
    // footnote links flatten to "(see here , here and here )".
    const text = attributionText({
      ...base,
      credit: "Kunstformen der Natur (1904), plate 21: Acanthometra (see here , here and here )",
    });
    expect(text).toContain("Source: Kunstformen der Natur (1904), plate 21: Acanthometra.");
    expect(text).not.toContain("see here");
  });

  it("falls back to the source host when a credit trims to nothing", () => {
    expect(attributionText({ ...base, credit: "(see here , here)" })).toContain(
      "Source: Wikimedia Commons.",
    );
  });

  it("credits the restorer for the Redouté plates, not Commons", () => {
    // sourceLabel maps c82.net deliberately — labelling Rougeux's
    // restorations "Wikimedia Commons" would be a false attribution.
    const text = attributionText({
      ...base,
      commonsUrl: "https://www.c82.net/redoute/flower/rosa-alba",
      credit: null,
    });
    expect(text).toContain("Source: c82.net.");
  });
});
