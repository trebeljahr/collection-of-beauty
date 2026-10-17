import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { GET as getCatalogue } from "@/app/api/artworks/route";
import { GET as getScopeIds } from "@/app/data/scopes/[file]/route";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { resolveScope } from "@/lib/artwork-scope";
import { artworkListings, catalogueListings, withoutThumbHash } from "@/lib/data";

// thumbHash rides on every paginated page, where tiles paint it, and is
// stripped from the two endpoints that serve the whole catalogue to
// consumers that paint none (see Artwork.thumbHash in data.ts).

const hasThumbHashKey = (row: object) => Object.hasOwn(row, "thumbHash");

describe("thumbHash gating", () => {
  it("keeps thumbHash on every listing and paginated page", () => {
    expect(artworkListings.every(hasThumbHashKey)).toBe(true);
    const page = getArtworkListingPage({ limit: 80 });
    expect(page.items).toHaveLength(80);
    expect(page.items.every(hasThumbHashKey)).toBe(true);
  });

  it("strips thumbHash from the catalogue projection and nothing else", () => {
    expect(catalogueListings).toHaveLength(artworkListings.length);
    expect(catalogueListings.some(hasThumbHashKey)).toBe(false);
    // Rows are compared without `expect`, and only one that differs is
    // handed to it, so a failure prints that row. An `expect` per row was
    // 4,557 calls.
    catalogueListings.forEach((row, i) => {
      const { thumbHash: _thumbHash, ...rest } = artworkListings[i];
      if (!isDeepStrictEqual(row, rest)) expect(row, `row ${i}`).toEqual(rest);
    });
  });

  it("serves /api/artworks without thumbHash", async () => {
    const rows = (await getCatalogue().json()) as object[];
    expect(rows).toHaveLength(artworkListings.length);
    expect(rows.some(hasThumbHashKey)).toBe(false);
  });

  it("serves a scope's ids in its order, and leaves the cached order intact", async () => {
    const res = await getScopeIds(new Request("http://localhost/data/scopes/shuffle.json"), {
      params: Promise.resolve({ file: "shuffle.json" }),
    });
    const ids = (await res.json()) as string[];
    const cached = resolveScope({ kind: "gallery" });
    expect(ids).toEqual(cached.map((a) => a.id));
    expect(cached.every(hasThumbHashKey)).toBe(true);
  });

  it("memoises the stripped copy per source array without touching the source", () => {
    const source = artworkListings.slice(0, 5);
    const stripped = withoutThumbHash(source);
    expect(withoutThumbHash(source)).toBe(stripped);
    const reordered = withoutThumbHash(source.slice().reverse());
    expect(reordered).not.toBe(stripped);
    // A re-ordered scope shares the stripped rows instead of copying them.
    expect(reordered[0]).toBe(stripped[4]);
    expect(source.every(hasThumbHashKey)).toBe(true);
    expect(stripped.some(hasThumbHashKey)).toBe(false);
  });
});
