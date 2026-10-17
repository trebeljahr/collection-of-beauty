"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ArtworkOrderFields } from "@/lib/artwork-order";
import {
  type ArtworkPage,
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
} from "@/lib/artwork-page-schema";
import type { ColorBucketId } from "@/lib/color-buckets.mjs";
import type { ArtworkListing } from "@/lib/data";
import { fetchOrderPage } from "@/lib/static-data/client";

export type ArtworkPageInfo = Pick<ArtworkPage, "total" | "nextOffset" | "hasMore">;

/** What a gallery surface pages through. Empty fields take the
 *  ordering's defaults (artwork-order.ts). */
export type ArtworkPageQuery = {
  q?: string;
  era?: string;
  artistSlug?: string;
  /** Plate-set id. Pair with sort="plate" to page through a collection
   *  in the order the book prints. */
  collection?: string;
  color?: ColorBucketId | "";
  sort?: ArtworkSort;
  seed?: string;
};

export type FetchArtworkPageFn = (offset: number, signal: AbortSignal) => Promise<ArtworkPage>;

/** One window of the ordering `query` names: a prebuilt page of the
 *  static export, or for a search the browser's own answer
 *  (src/lib/static-data/client.ts). */
export async function fetchArtworkPage(
  query: ArtworkPageQuery,
  offset: number,
  limit: number = DEFAULT_ARTWORK_PAGE_SIZE,
  signal?: AbortSignal,
): Promise<ArtworkPage> {
  return fetchOrderPage(pageQueryFields(query), offset, limit, signal);
}

export function pageQueryFields(query: ArtworkPageQuery): ArtworkOrderFields {
  return {
    query: query.q,
    era: (query.era || "") as ArtworkOrderFields["era"],
    artistSlug: query.artistSlug,
    collection: query.collection,
    color: query.color,
    sort: query.sort,
    seed: query.seed,
  };
}

type UseArtworkPaginationOpts = {
  initialArtworks: ArtworkListing[];
  initialPageInfo: ArtworkPageInfo;
  /** Page-fetch callback. Omit for fully-static galleries (the artist
   *  page passes the artist's complete works array + hasMore=false and
   *  needs no API path) — loadMoreArtworks becomes a no-op. */
  fetchPage?: FetchArtworkPageFn;
};

/** Outcome of one load-more attempt.
 *
 *  `added` is what actually landed in `loadedArtworks` after id-dedup —
 *  it can be empty for a page the server answered with while `hasMore`
 *  is still true (every item was already loaded). `hasMore` is the
 *  server's own answer about further pages, and is the *only* signal a
 *  caller may read as "exhausted".
 *
 *  `null` means the attempt taught us nothing: a coalesced concurrent
 *  call, an aborted request, or a failed fetch. Callers must treat it as
 *  "try again later", never as an end-of-list. */
export type LoadMoreResult = {
  added: ArtworkListing[];
  hasMore: boolean;
};

export type ArtworkPaginationApi = {
  loadedArtworks: ArtworkListing[];
  pageInfo: ArtworkPageInfo;
  /** Append the next batch from the server. Safe to call repeatedly —
   *  in-flight calls are coalesced via an internal loading flag and
   *  duplicate ids are filtered out before they hit React state.
   *  Resolves to `null` when the call was coalesced, aborted or failed;
   *  see LoadMoreResult. */
  loadMoreArtworks: () => Promise<LoadMoreResult | null>;
  /** Replace the visible set + page info atomically. Used by surfaces
   *  that re-seed on filter/sort/query change (gallery-browser): they
   *  fetch their own first page and hand the result here so the
   *  loadedIds dedup set, in-flight abort controller, and loading flag
   *  all reset together. */
  replacePage: (next: { items: ArtworkListing[]; pageInfo: ArtworkPageInfo }) => void;
  /** Bumped by every replacePage, in the same commit as the new items.
   *  Key <ArtworkGallery> on this, not on the requested query: the query
   *  changes a render (or a whole fetch) before the items do, and a
   *  gallery remounted in that gap seeds its `displayed` state from the
   *  previous set and keeps it. */
  generation: number;
};

/** Shared state machine for any surface that grows an
 *  ArtworkListing[] via /api/artworks/page. Owns:
 *
 *  - the visible array (`loadedArtworks`)
 *  - the page cursor (`pageInfo.nextOffset` + `hasMore`)
 *  - an in-flight abort controller for the load-more fetch
 *  - a loadedIds Set used to dedup the append (the server's page
 *    boundary occasionally returns an item already present locally
 *    after a re-seed, especially when shuffle seeds collide)
 *
 *  Returns `loadMoreArtworks` (passed straight to <ArtworkGallery>),
 *  `replacePage` (for re-seed flows), and the current snapshot for
 *  rendering.
 */
export function useArtworkPagination({
  initialArtworks,
  initialPageInfo,
  fetchPage,
}: UseArtworkPaginationOpts): ArtworkPaginationApi {
  const [loadedArtworks, setLoadedArtworks] = useState(initialArtworks);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [generation, setGeneration] = useState(0);
  const pageInfoRef = useRef(pageInfo);
  const loadedIdsRef = useRef(new Set(initialArtworks.map((a) => a.id)));
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    pageInfoRef.current = pageInfo;
  }, [pageInfo]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const loadMoreArtworks = useCallback(async (): Promise<LoadMoreResult | null> => {
    // No fetcher, or the cursor already says the list is complete —
    // both are genuine end-of-list, not a failure to look.
    if (!fetchPage) return { added: [], hasMore: false };
    if (loadingRef.current) return null;
    const info = pageInfoRef.current;
    if (!info.hasMore || info.nextOffset == null) return { added: [], hasMore: false };
    loadingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const page = await fetchPage(info.nextOffset, controller.signal);
      if (controller.signal.aborted) return null;

      const incoming = page.items.filter((a) => !loadedIdsRef.current.has(a.id));
      for (const a of incoming) loadedIdsRef.current.add(a.id);

      startTransition(() => {
        setLoadedArtworks((cur) => (incoming.length > 0 ? [...cur, ...incoming] : cur));
        setPageInfo({
          total: page.total,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
        });
      });

      return { added: incoming, hasMore: page.hasMore };
    } catch {
      return null;
    } finally {
      loadingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [fetchPage]);

  const replacePage = useCallback(
    ({ items, pageInfo: nextInfo }: { items: ArtworkListing[]; pageInfo: ArtworkPageInfo }) => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      loadingRef.current = false;
      loadedIdsRef.current = new Set(items.map((a) => a.id));
      startTransition(() => {
        setLoadedArtworks(items);
        setPageInfo(nextInfo);
        setGeneration((g) => g + 1);
      });
    },
    [],
  );

  return { loadedArtworks, pageInfo, loadMoreArtworks, replacePage, generation };
}
