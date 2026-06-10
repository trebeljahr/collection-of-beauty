"use client";

import { useMemo } from "react";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import type { Scope } from "@/lib/artwork-scope";
import type { ArtworkListing } from "@/lib/data";
import {
  type ArtworkPageInfo,
  type ArtworkPageQuery,
  type FetchArtworkPageFn,
  fetchArtworkPage,
  useArtworkPagination,
} from "@/lib/use-artwork-pagination";

type Props = {
  initialArtworks: ArtworkListing[];
  initialPageInfo: ArtworkPageInfo;
  /** Scope threaded to the artwork detail page so prev/next cycles
   *  within this surface. */
  scope: Scope;
  /** Params forwarded to /api/artworks/page for each load-more batch.
   *  Must produce the same ordering as the initial server render.
   *  Omit for fully-static surfaces — combined with hasMore=false on
   *  initialPageInfo, the gallery degrades to local chunking only. */
  pageQuery?: ArtworkPageQuery;
};

/** Thin paginated wrapper around <ArtworkGallery> for scope landing
 *  pages (era, artist, future single-scope surfaces) that don't need
 *  the search/sort UI of GalleryBrowser but DO want the same
 *  infinite-scroll-by-API-page pattern instead of shipping the full
 *  scope's slim listings as a single RSC payload.
 *
 *  Owns no pagination state of its own — useArtworkPagination is the
 *  single source for loaded + pageInfo + load-more dedup. Any fix or
 *  feature that lands in the hook propagates to every surface that
 *  uses ScopedGallery (era, artist) and to GalleryBrowser, which also
 *  routes through the same hook. */
export function ScopedGallery({ initialArtworks, initialPageInfo, scope, pageQuery }: Props) {
  // Scalar-only dep list so a new-but-equal pageQuery object reference
  // (e.g. caller re-renders inline) doesn't churn fetchPage's identity.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are the unrolled query fields
  const fetchPage = useMemo<FetchArtworkPageFn | undefined>(
    () =>
      pageQuery
        ? (offset, signal) => fetchArtworkPage(pageQuery, offset, DEFAULT_ARTWORK_PAGE_SIZE, signal)
        : undefined,
    [
      pageQuery?.q,
      pageQuery?.era,
      pageQuery?.artistSlug,
      pageQuery?.minYear,
      pageQuery?.maxYear,
      pageQuery?.sort,
      pageQuery?.seed,
    ],
  );

  const { loadedArtworks, pageInfo, loadMoreArtworks } = useArtworkPagination({
    initialArtworks,
    initialPageInfo,
    fetchPage,
  });

  return (
    <ArtworkGallery
      artworks={loadedArtworks}
      loadMoreArtworks={loadMoreArtworks}
      hasMoreArtworks={pageInfo.hasMore}
      initialSeed={loadedArtworks.length}
      scope={scope}
    />
  );
}
