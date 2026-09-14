"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
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

const SORT_OPTIONS: SelectOption[] = [
  { value: "shuffle", label: "Sort: shuffled" },
  { value: "year", label: "Sort: chronological" },
  { value: "artist", label: "Sort: artist" },
];

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

  const { loadedArtworks, pageInfo, loadMoreArtworks, replacePage, generation } =
    useArtworkPagination({
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
        // One commit for items, generation and status. Leaving "loading"
        // ahead of the items would mount the grid on the previous set.
        startTransition(() => {
          replacePage({
            items: page.items,
            pageInfo: { total: page.total, nextOffset: page.nextOffset, hasMore: page.hasMore },
          });
          setPageStatus("idle");
        });
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

  const eraOptions = useMemo(
    () => [{ value: "", label: "All eras" }, ...eras.map((e) => ({ value: e.id, label: e.title }))],
    [eras],
  );

  const activeFilterCount = era ? 1 : 0;

  function clearFilters() {
    setEra("");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <Input
          type="search"
          aria-label="Search artworks by title, artist, or movement"
          placeholder="Search by title, artist, movement..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          /*
           * text-base (16px) below `sm` is load-bearing, not cosmetic: iOS
           * Safari zooms the whole page in whenever a focused form control
           * has a font smaller than 16px, and the user then has to pinch
           * back out. h-11 is the 44px touch-target floor. Desktop keeps the
           * denser h-9 / text-sm the Input component ships by default.
           */
          className="h-11 w-full text-base sm:h-9 sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by era"
            value={era}
            onChange={setEra}
            options={eraOptions}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            listClassName="sm:min-w-72"
          />
          <Select
            aria-label="Sort artworks by"
            value={sortBy}
            onChange={(value) => setSortBy(value as ArtworkSort)}
            options={SORT_OPTIONS}
            align="end"
            className="min-w-0 flex-1 sm:w-52 sm:flex-none"
          />
          {(activeFilterCount > 0 || query) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              /* size="sm" is a 32px box — below the 44px touch floor on phones. */
              className="h-11 px-4 text-base sm:h-8 sm:px-3 sm:text-xs"
            >
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
          // The key belongs on the component, not on anything it renders:
          // the gallery's own displayed / serverExhausted / measured-width
          // state has to be thrown away when the underlying set changes.
          // It is the generation, not pageKey: pageKey flips as soon as the
          // sort select changes, while the items arrive in a later
          // transition. Keyed on pageKey, the grid remounted on the old
          // items and kept them, so "chronological" showed the shuffle and
          // switching back to "shuffled" showed the chronological order.
          key={generation}
          artworks={visibleArtworks}
          loadMoreArtworks={loadMoreArtworks}
          hasMoreArtworks={pageInfo.hasMore}
          initialSeed={Math.min(PAGE_SIZE, visibleArtworks.length)}
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
