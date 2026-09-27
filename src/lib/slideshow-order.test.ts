import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/artworks/page/route";
import type { ArtworkPage } from "@/lib/artwork-page-schema";
import { resolveScope } from "@/lib/artwork-scope";
import { artworkListings } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { getPlateSets } from "@/lib/plate-sets";
import { type PlayableScope, SLIDESHOW_PAGE_SIZE, scopePageQuery } from "@/lib/slideshow";
import { buildArtworkPageUrl } from "@/lib/use-artwork-pagination";

/**
 * The slideshow is seeded with the server's `resolveScope(scope)` window
 * and extends itself through /api/artworks/page with `scopePageQuery`.
 * If the two orders ever disagree, the show repeats or skips works at
 * every page boundary, so this runs the real route handler against the
 * real catalogue for each scope kind.
 */

function busiestArtistSlug(): string {
  const counts = new Map<string, number>();
  for (const a of artworkListings) {
    if (a.artistSlug) counts.set(a.artistSlug, (counts.get(a.artistSlug) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const SCOPES: PlayableScope[] = [
  { kind: "gallery" },
  { kind: "gallery", filter: { q: "monet" } },
  { kind: "gallery", filter: { era: "baroque", sort: "year" } },
  { kind: "gallery", filter: { sort: "artist" } },
  { kind: "artist", slug: busiestArtistSlug() },
  { kind: "era", id: ERAS[0].id },
  { kind: "era", id: "natural-history" },
  { kind: "collection", id: getPlateSets()[0].id },
  { kind: "color", id: "red" },
];

describe("slideshow paging matches resolveScope", () => {
  for (const scope of SCOPES) {
    it(JSON.stringify(scope), async () => {
      const list = resolveScope(scope);
      expect(list.length).toBeGreaterThan(0);
      for (const offset of [0, SLIDESHOW_PAGE_SIZE]) {
        const url = buildArtworkPageUrl(
          scopePageQuery(scope),
          offset,
          SLIDESHOW_PAGE_SIZE,
          "http://x",
        );
        const res = GET(new Request(url));
        const page = (await res.json()) as ArtworkPage;
        expect(page.total).toBe(list.length);
        expect(page.items.map((a) => a.id)).toEqual(
          list.slice(offset, offset + SLIDESHOW_PAGE_SIZE).map((a) => a.id),
        );
      }
    });
  }
});
