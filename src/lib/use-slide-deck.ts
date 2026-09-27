"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ArtworkListing } from "@/lib/data";
import {
  indicesToEnsure,
  missingPageStarts,
  type PlayableScope,
  pageStartFor,
  SLIDESHOW_PAGE_SIZE,
  scopePageQuery,
  wrapIndex,
} from "@/lib/slideshow";
import { fetchArtworkPage } from "@/lib/use-artwork-pagination";

export type SlideDeck = {
  /** The listing at `index`, if its page has arrived. */
  peek(index: number): ArtworkListing | undefined;
  /** The listing at `index`, fetching its page if needed. Rejects when
   *  the fetch fails or the index no longer exists (a smaller catalogue
   *  after a deploy). */
  load(index: number, signal?: AbortSignal): Promise<ArtworkListing>;
  /** Fetch the pages around `index` in the background. */
  warm(index: number, total: number): void;
};

/**
 * The slideshow's view of a scope: a sparse map from absolute index to
 * listing, seeded with the server's page and filled in 40-work pages
 * from /api/artworks/page as the show moves.
 *
 * Sparse rather than an array because the show can start anywhere
 * (`?start=`) and step backwards past index 0 onto the last page, and a
 * 4,500-work gallery should not be fetched to play its first ten works.
 * Pages are aligned to multiples of 40, so every viewer requests the
 * same URLs and the route's CDN cache answers most of them.
 *
 * Page requests are shared: two callers that need the same page get one
 * fetch. The fetch runs on the deck's own AbortController (aborted on
 * unmount), not the caller's signal, so one caller giving up does not
 * fail the request for the other. A failed page is forgotten, so the
 * next caller retries it.
 */
export function useSlideDeck(opts: {
  scope: PlayableScope;
  windowStart: number;
  initial: ArtworkListing[];
  onTotalChange: (total: number) => void;
}): SlideDeck {
  const { scope, windowStart, initial } = opts;
  const itemsRef = useRef<Map<number, ArtworkListing> | null>(null);
  if (itemsRef.current === null) {
    itemsRef.current = new Map(initial.map((art, i) => [windowStart + i, art]));
  }
  const inflightRef = useRef(new Map<number, Promise<void>>());
  const controllerRef = useRef<AbortController | null>(null);
  const onTotalChangeRef = useRef(opts.onTotalChange);
  onTotalChangeRef.current = opts.onTotalChange;
  const totalRef = useRef<number | null>(null);
  // The scope never changes for the life of a /play page (a new scope is
  // a new URL and a new server render), so the query is fixed too.
  const query = useMemo(() => scopePageQuery(scope), [scope]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => {
      controller.abort();
      controllerRef.current = null;
      inflightRef.current.clear();
    };
  }, []);

  const ensurePage = useCallback(
    (pageStart: number): Promise<void> => {
      const existing = inflightRef.current.get(pageStart);
      if (existing) return existing;
      const controller = controllerRef.current;
      if (!controller) return Promise.reject(new Error("slide deck is unmounted"));
      const request: Promise<void> = fetchArtworkPage(
        query,
        pageStart,
        SLIDESHOW_PAGE_SIZE,
        controller.signal,
      )
        .then((page) => {
          const items = itemsRef.current;
          if (!items) return;
          page.items.forEach((art, i) => {
            items.set(pageStart + i, art);
          });
          // A total that differs from the server render's means the
          // catalogue was redeployed mid-show. The player ignores a total
          // equal to its own, so reporting every new value is safe.
          if (page.total !== totalRef.current) {
            totalRef.current = page.total;
            onTotalChangeRef.current(page.total);
          }
        })
        .finally(() => {
          // Settled either way: a success lives in `items`, and a failure
          // must not be cached, or the page could never be retried.
          if (inflightRef.current.get(pageStart) === request) {
            inflightRef.current.delete(pageStart);
          }
        });
      inflightRef.current.set(pageStart, request);
      return request;
    },
    [query],
  );

  const peek = useCallback((index: number) => itemsRef.current?.get(index), []);

  const load = useCallback(
    async (index: number, signal?: AbortSignal): Promise<ArtworkListing> => {
      const hit = itemsRef.current?.get(index);
      if (hit) return hit;
      await ensurePage(pageStartFor(index));
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const art = itemsRef.current?.get(index);
      if (!art) throw new Error(`slide ${index} is not in the scope`);
      return art;
    },
    [ensurePage],
  );

  const warm = useCallback(
    (index: number, total: number) => {
      const wanted = indicesToEnsure(index, total).map((i) => wrapIndex(i, total));
      const has = (i: number) => itemsRef.current?.has(i) ?? false;
      for (const start of missingPageStarts(wanted, has)) {
        // Fire and forget: a failure here resurfaces as a `load` of the
        // same page when its turn comes, and is handled there.
        ensurePage(start).catch(() => {});
      }
    },
    [ensurePage],
  );

  return useMemo(() => ({ peek, load, warm }), [peek, load, warm]);
}
