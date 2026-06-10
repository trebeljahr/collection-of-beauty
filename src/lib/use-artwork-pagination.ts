"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  type ArtworkPage,
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
} from "@/lib/artwork-page-schema";
import type { ArtworkListing } from "@/lib/data";

export type ArtworkPageInfo = Pick<ArtworkPage, "total" | "nextOffset" | "hasMore">;

/** Query shape forwarded to /api/artworks/page. The fields map 1:1 with
 *  the route's parsed params; any field left undefined / empty is
 *  omitted from the URL so the server defaults stand. */
export type ArtworkPageQuery = {
  q?: string;
  era?: string;
  artistSlug?: string;
  minYear?: string | number;
  maxYear?: string | number;
  sort?: ArtworkSort;
  seed?: string;
};

export type FetchArtworkPageFn = (offset: number, signal: AbortSignal) => Promise<ArtworkPage>;

const PAGE_ENDPOINT = "/api/artworks/page";

/** Build the /api/artworks/page URL for a given query + offset. Public
 *  so callers that don't use the hook (server-side prefetch, tests)
 *  can build the same URL. */
export function buildArtworkPageUrl(
  query: ArtworkPageQuery,
  offset: number,
  limit: number = DEFAULT_ARTWORK_PAGE_SIZE,
  origin?: string,
): URL {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(PAGE_ENDPOINT, base);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  if (query.sort) url.searchParams.set("sort", query.sort);
  if (query.seed) url.searchParams.set("seed", query.seed);
  appendIfTruthy(url, "q", query.q);
  appendIfTruthy(url, "era", query.era);
  appendIfTruthy(url, "artistSlug", query.artistSlug);
  appendIfTruthy(url, "minYear", query.minYear);
  appendIfTruthy(url, "maxYear", query.maxYear);
  return url;
}

/** Convenience wrapper around buildArtworkPageUrl + fetch. */
export async function fetchArtworkPage(
  query: ArtworkPageQuery,
  offset: number,
  limit: number = DEFAULT_ARTWORK_PAGE_SIZE,
  signal?: AbortSignal,
): Promise<ArtworkPage> {
  const url = buildArtworkPageUrl(query, offset, limit);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch ${url.pathname}: ${res.status}`);
  return res.json() as Promise<ArtworkPage>;
}

type UseArtworkPaginationOpts = {
  initialArtworks: ArtworkListing[];
  initialPageInfo: ArtworkPageInfo;
  /** Page-fetch callback. Omit for fully-static galleries (the artist
   *  page passes the artist's complete works array + hasMore=false and
   *  needs no API path) — loadMoreArtworks becomes a no-op. */
  fetchPage?: FetchArtworkPageFn;
};

export type ArtworkPaginationApi = {
  loadedArtworks: ArtworkListing[];
  pageInfo: ArtworkPageInfo;
  /** Append the next batch from the server. Safe to call repeatedly —
   *  in-flight calls are coalesced via an internal loading flag and
   *  duplicate ids are filtered out before they hit React state. */
  loadMoreArtworks: () => Promise<ArtworkListing[]>;
  /** Replace the visible set + page info atomically. Used by surfaces
   *  that re-seed on filter/sort/query change (gallery-browser): they
   *  fetch their own first page and hand the result here so the
   *  loadedIds dedup set, in-flight abort controller, and loading flag
   *  all reset together. */
  replacePage: (next: { items: ArtworkListing[]; pageInfo: ArtworkPageInfo }) => void;
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
  const pageInfoRef = useRef(pageInfo);
  const loadedIdsRef = useRef(new Set(initialArtworks.map((a) => a.id)));
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    pageInfoRef.current = pageInfo;
  }, [pageInfo]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const loadMoreArtworks = useCallback(async (): Promise<ArtworkListing[]> => {
    if (!fetchPage) return [];
    if (loadingRef.current) return [];
    const info = pageInfoRef.current;
    if (!info.hasMore || info.nextOffset == null) return [];
    loadingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const page = await fetchPage(info.nextOffset, controller.signal);
      if (controller.signal.aborted) return [];

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

      return incoming;
    } catch {
      return [];
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
      });
    },
    [],
  );

  return { loadedArtworks, pageInfo, loadMoreArtworks, replacePage };
}

function appendIfTruthy(url: URL, key: string, value: string | number | undefined): void {
  if (value === undefined || value === null) return;
  const s = typeof value === "number" ? String(value) : value;
  if (s.length === 0) return;
  url.searchParams.set(key, s);
}
