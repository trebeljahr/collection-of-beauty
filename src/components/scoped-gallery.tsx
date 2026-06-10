"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { ArtworkGallery } from "@/components/artwork-gallery";
import {
  type ArtworkPage,
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
} from "@/lib/artwork-page-schema";
import type { Scope } from "@/lib/artwork-scope";
import type { ArtworkListing } from "@/lib/data";

type PageInfo = Pick<ArtworkPage, "total" | "nextOffset" | "hasMore">;

export type ScopedGalleryQuery = {
  era?: string;
  sort?: ArtworkSort;
  minYear?: number;
  maxYear?: number;
  q?: string;
  seed?: string;
};

type Props = {
  initialArtworks: ArtworkListing[];
  initialPageInfo: PageInfo;
  /** Scope threaded to the artwork detail page so prev/next cycles
   *  within this surface. */
  scope: Scope;
  /** Params forwarded to /api/artworks/page for each load-more batch.
   *  Must produce the same ordering as the initial server render. */
  pageQuery: ScopedGalleryQuery;
};

const PAGE_ENDPOINT = "/api/artworks/page";

/** Thin paginated wrapper around <ArtworkGallery> for scope landing
 *  pages (era, future: artist) that don't need the search/sort UI of
 *  GalleryBrowser but DO want the same infinite-scroll-by-API-page
 *  pattern instead of shipping the full scope's slim listings as a
 *  single RSC payload. */
export function ScopedGallery({ initialArtworks, initialPageInfo, scope, pageQuery }: Props) {
  const [loaded, setLoaded] = useState(initialArtworks);
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
    if (loadingRef.current) return [];
    const info = pageInfoRef.current;
    if (!info.hasMore || info.nextOffset == null) return [];
    loadingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const url = new URL(PAGE_ENDPOINT, window.location.origin);
      url.searchParams.set("offset", String(info.nextOffset));
      url.searchParams.set("limit", String(DEFAULT_ARTWORK_PAGE_SIZE));
      if (pageQuery.sort) url.searchParams.set("sort", pageQuery.sort);
      if (pageQuery.era) url.searchParams.set("era", pageQuery.era);
      if (pageQuery.minYear != null) url.searchParams.set("minYear", String(pageQuery.minYear));
      if (pageQuery.maxYear != null) url.searchParams.set("maxYear", String(pageQuery.maxYear));
      if (pageQuery.q) url.searchParams.set("q", pageQuery.q);
      if (pageQuery.seed) url.searchParams.set("seed", pageQuery.seed);

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`fetch ${url.pathname}: ${res.status}`);
      const page = (await res.json()) as ArtworkPage;
      if (controller.signal.aborted) return [];

      const incoming = page.items.filter((a) => !loadedIdsRef.current.has(a.id));
      for (const a of incoming) loadedIdsRef.current.add(a.id);

      startTransition(() => {
        setLoaded((cur) => (incoming.length > 0 ? [...cur, ...incoming] : cur));
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
  }, [
    pageQuery.era,
    pageQuery.sort,
    pageQuery.minYear,
    pageQuery.maxYear,
    pageQuery.q,
    pageQuery.seed,
  ]);

  return (
    <ArtworkGallery
      artworks={loaded}
      loadMoreArtworks={loadMoreArtworks}
      hasMoreArtworks={pageInfo.hasMore}
      initialSeed={loaded.length}
      scope={scope}
    />
  );
}
