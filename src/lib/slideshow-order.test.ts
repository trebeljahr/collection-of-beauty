import { describe, expect, it } from "vitest";
import { normalizeOrderInput } from "@/lib/artwork-order";
import { resolveScope } from "@/lib/artwork-scope";
import { artworkListings } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { getPlateSets } from "@/lib/plate-sets";
import { type PlayableScope, SLIDESHOW_PAGE_SIZE, scopePageQuery } from "@/lib/slideshow";
import { engineFor } from "@/lib/static-data/engine";
import { orderKey } from "@/lib/static-data/keys";
import { prebuiltOrder, staticOrders, staticPage } from "@/lib/static-data/server";
import { pageQueryFields } from "@/lib/use-artwork-pagination";

/**
 * The slideshow is seeded with the server's `resolveScope(scope)` window
 * and extends itself with `scopePageQuery`: from a prebuilt page of the
 * export, or for a search from the browser's engine. If any of the three
 * orders disagree, the show repeats or skips works at every page
 * boundary, so this checks them against the real catalogue for each
 * scope kind.
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

const browser = engineFor(artworkListings, staticOrders());

describe("slideshow paging matches resolveScope", () => {
  for (const scope of SCOPES) {
    it(JSON.stringify(scope), () => {
      const ids = resolveScope(scope).map((a) => a.id);
      expect(ids.length).toBeGreaterThan(0);
      const fields = pageQueryFields(scopePageQuery(scope));

      // The browser engine, which answers every search.
      expect(browser.order(fields).map((a) => a.id)).toEqual(ids);

      // The prebuilt pages, which answer everything else.
      const key = orderKey(normalizeOrderInput(fields));
      if (scope.kind === "gallery" && scope.filter?.q) {
        expect(key).toBeNull();
        return;
      }
      expect(key).not.toBeNull();
      const order = prebuiltOrder(key as string);
      expect(order).not.toBeNull();
      const pages = [0, 1].map((i) => staticPage(order!.input, i));
      expect(pages[0].total).toBe(ids.length);
      const prebuilt = pages.flatMap((p) => p.items.map((a) => a.id));
      expect(prebuilt.slice(0, 2 * SLIDESHOW_PAGE_SIZE)).toEqual(
        ids.slice(0, 2 * SLIDESHOW_PAGE_SIZE),
      );
    });
  }
});
