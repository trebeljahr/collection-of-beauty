"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_SHUFFLE_SEED,
} from "@/lib/artwork-page-schema";
import type { ArtworkListing } from "@/lib/data";
import {
  type ArtworkPageInfo,
  type ArtworkPageQuery,
  fetchArtworkPage,
  useArtworkPagination,
} from "@/lib/use-artwork-pagination";

type EraOption = { id: string; title: string };

type Props = {
  initialArtworks: ArtworkListing[];
  eras: EraOption[];
  totalArtworks: number;
};

type FuseSearch = {
  search: (query: string) => Array<{ item: ArtworkListing }>;
};
type FuseCtor = new (list: ArtworkListing[], options: Record<string, unknown>) => FuseSearch;

type PageStatus = "idle" | "loading" | "failed";

const PAGE_SIZE = DEFAULT_ARTWORK_PAGE_SIZE;

export function GalleryBrowser({ initialArtworks, eras, totalArtworks }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [era, setEra] = useState<string>("");
  const [sortBy, setSortBy] = useState<ArtworkSort>("shuffle");
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [Fuse, setFuse] = useState<FuseCtor | null>(null);
  const requestSeqRef = useRef(0);

  const pageQuery = useMemo<ArtworkPageQuery>(
    () => ({
      q: deferredQuery.trim(),
      era,
      sort: sortBy,
      seed: DEFAULT_SHUFFLE_SEED,
    }),
    [deferredQuery, era, sortBy],
  );

  const pageKey = useMemo(() => JSON.stringify(pageQuery), [pageQuery]);
  const isDefaultPage = pageQuery.q === "" && pageQuery.era === "" && pageQuery.sort === "shuffle";

  const initialPageInfo = useMemo<ArtworkPageInfo>(
    () => ({
      total: totalArtworks,
      nextOffset: initialArtworks.length < totalArtworks ? initialArtworks.length : null,
      hasMore: initialArtworks.length < totalArtworks,
    }),
    [initialArtworks, totalArtworks],
  );

  const fetchPage = useCallback(
    (offset: number, signal: AbortSignal) => fetchArtworkPage(pageQuery, offset, PAGE_SIZE, signal),
    [pageQuery],
  );

  const { loadedArtworks, pageInfo, loadMoreArtworks, replacePage } = useArtworkPagination({
    initialArtworks,
    initialPageInfo,
    fetchPage,
  });

  // Re-seed on filter / sort / query change. Default page snaps back
  // to the SSR-pinned initialArtworks; any other params re-fetch page
  // 0 with the new shape and replace atomically (dedup set, in-flight
  // controller, and loading flag reset inside replacePage).
  useEffect(() => {
    if (isDefaultPage) {
      requestSeqRef.current += 1;
      replacePage({ items: initialArtworks, pageInfo: initialPageInfo });
      setPageStatus("idle");
      return;
    }
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const controller = new AbortController();
    setPageStatus("loading");
    fetchArtworkPage(pageQuery, 0, PAGE_SIZE, controller.signal)
      .then((page) => {
        if (requestSeqRef.current !== requestId) return;
        replacePage({
          items: page.items,
          pageInfo: { total: page.total, nextOffset: page.nextOffset, hasMore: page.hasMore },
        });
        setPageStatus("idle");
      })
      .catch(() => {
        if (controller.signal.aborted || requestSeqRef.current !== requestId) return;
        setPageStatus("failed");
      });
    return () => controller.abort();
  }, [isDefaultPage, pageKey, pageQuery, initialArtworks, initialPageInfo, replacePage]);

  useEffect(() => {
    if (!pageQuery.q || pageQuery.sort !== "shuffle" || Fuse) return;
    let cancelled = false;
    import("fuse.js").then((mod) => {
      if (!cancelled) setFuse(() => mod.default as FuseCtor);
    });
    return () => {
      cancelled = true;
    };
  }, [Fuse, pageQuery.q, pageQuery.sort]);

  const fuse = useMemo(() => {
    if (!Fuse || !pageQuery.q || pageQuery.sort !== "shuffle") return null;
    return new Fuse(loadedArtworks, {
      keys: [
        { name: "title", weight: 0.45 },
        { name: "artist", weight: 0.35 },
        { name: "movement", weight: 0.1 },
        { name: "nationality", weight: 0.1 },
      ],
      threshold: 0.33,
      ignoreLocation: true,
    });
  }, [Fuse, loadedArtworks, pageQuery.q, pageQuery.sort]);

  const visibleArtworks = useMemo(() => {
    if (!fuse) return loadedArtworks;
    return rankLoadedArtworks(loadedArtworks, fuse, pageQuery.q ?? "");
  }, [fuse, loadedArtworks, pageQuery.q]);

  const filterKey = pageKey;
  const activeFilterCount = era ? 1 : 0;

  function clearFilters() {
    setEra("");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            aria-label="Search artworks by title, artist, or movement"
            placeholder="Search by title, artist, movement..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:flex-1"
          />
          <select
            aria-label="Sort artworks by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ArtworkSort)}
            className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:w-auto sm:min-w-[12rem]"
          >
            <option value="shuffle">Sort: shuffled</option>
            <option value="year">Sort: chronological</option>
            <option value="artist">Sort: artist</option>
            <option value="title">Sort: title</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Filter by era"
            value={era}
            onChange={(e) => setEra(e.target.value)}
            className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <option value="">All eras</option>
            {eras.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          {(activeFilterCount > 0 || query) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between px-1 text-sm text-[var(--muted-foreground)]">
        <span>
          {pageInfo.total.toLocaleString()} work
          {pageInfo.total === 1 ? "" : "s"}
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount} filter
              {activeFilterCount === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </div>

      {pageStatus === "loading" ? (
        <div className="py-16 text-center text-[var(--muted-foreground)]">Loading works...</div>
      ) : (
        <ArtworkGallery
          artworks={visibleArtworks}
          loadMoreArtworks={loadMoreArtworks}
          hasMoreArtworks={pageInfo.hasMore}
          initialSeed={Math.min(PAGE_SIZE, visibleArtworks.length)}
          resetKey={filterKey}
          scope={{ kind: "gallery" }}
        />
      )}
    </div>
  );
}

function rankLoadedArtworks(
  artworks: ArtworkListing[],
  fuse: FuseSearch,
  query: string,
): ArtworkListing[] {
  const ranked = fuse.search(query).map((result) => result.item);
  if (ranked.length === 0) return artworks;
  const seen = new Set(ranked.map((artwork) => artwork.id));
  return [...ranked, ...artworks.filter((artwork) => !seen.has(artwork.id))];
}
