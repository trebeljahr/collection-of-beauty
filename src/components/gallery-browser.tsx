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
import {
  type ArtworkPage,
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_SHUFFLE_SEED,
} from "@/lib/artwork-page-schema";
import type { ArtworkListing } from "@/lib/data";

type Props = {
  initialArtworks: ArtworkListing[];
  movements: string[];
  totalArtworks: number;
};

type FuseSearch = {
  search: (query: string) => Array<{ item: ArtworkListing }>;
};
type FuseCtor = new (list: ArtworkListing[], options: Record<string, unknown>) => FuseSearch;

type PageStatus = "idle" | "loading" | "loading-more" | "failed";

type PageInfo = Pick<ArtworkPage, "total" | "nextOffset" | "hasMore">;

type PageParams = {
  q: string;
  movement: string;
  minYear: string;
  maxYear: string;
  sort: ArtworkSort;
  seed: string;
};

const PAGE_ENDPOINT = "/api/artworks/page";
const PAGE_SIZE = DEFAULT_ARTWORK_PAGE_SIZE;
const SESSION_SEED_KEY = "cob:shuffle-seed";

export function GalleryBrowser({ initialArtworks, movements, totalArtworks }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [movement, setMovement] = useState<string>("");
  const [minYear, setMinYear] = useState<string>("");
  const [maxYear, setMaxYear] = useState<string>("");
  const [sortBy, setSortBy] = useState<ArtworkSort>("shuffle");
  const [sessionSeed, setSessionSeed] = useState<string>(DEFAULT_SHUFFLE_SEED);
  const [loadedArtworks, setLoadedArtworks] = useState(initialArtworks);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    total: totalArtworks,
    nextOffset: initialArtworks.length < totalArtworks ? initialArtworks.length : null,
    hasMore: initialArtworks.length < totalArtworks,
  });
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [Fuse, setFuse] = useState<FuseCtor | null>(null);
  const pageInfoRef = useRef(pageInfo);
  const pageKeyRef = useRef("");
  const loadedIdsRef = useRef(new Set(initialArtworks.map((artwork) => artwork.id)));
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const pageParamsRef = useRef<PageParams>({
    q: "",
    movement: "",
    minYear: "",
    maxYear: "",
    sort: "shuffle",
    seed: DEFAULT_SHUFFLE_SEED,
  });
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const pageParams = useMemo<PageParams>(
    () => ({
      q: deferredQuery.trim(),
      movement,
      minYear,
      maxYear,
      sort: sortBy,
      seed: sessionSeed,
    }),
    [deferredQuery, movement, minYear, maxYear, sortBy, sessionSeed],
  );

  const pageKey = useMemo(() => JSON.stringify(pageParams), [pageParams]);
  const isDefaultPage =
    pageParams.q === "" &&
    pageParams.movement === "" &&
    pageParams.minYear === "" &&
    pageParams.maxYear === "" &&
    pageParams.sort === "shuffle" &&
    pageParams.seed === DEFAULT_SHUFFLE_SEED;

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(SESSION_SEED_KEY);
      if (stored) {
        setSessionSeed(stored);
        return;
      }
      const fresh = generateSessionSeed();
      window.sessionStorage.setItem(SESSION_SEED_KEY, fresh);
      setSessionSeed(fresh);
    } catch {
      // sessionStorage may be unavailable (privacy mode); fall back to a
      // one-shot per-mount seed so the order still varies across loads.
      setSessionSeed(generateSessionSeed());
    }
  }, []);

  useEffect(() => {
    pageInfoRef.current = pageInfo;
  }, [pageInfo]);

  useEffect(() => {
    pageParamsRef.current = pageParams;
  }, [pageParams]);

  useEffect(() => {
    pageKeyRef.current = pageKey;
    loadingMoreRef.current = false;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;

    if (isDefaultPage) {
      requestSeqRef.current += 1;
      loadedIdsRef.current = new Set(initialArtworks.map((artwork) => artwork.id));
      startTransition(() => {
        setLoadedArtworks(initialArtworks);
        setPageInfo({
          total: totalArtworks,
          nextOffset: initialArtworks.length < totalArtworks ? initialArtworks.length : null,
          hasMore: initialArtworks.length < totalArtworks,
        });
        setPageStatus("idle");
      });
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const controller = new AbortController();
    setPageStatus("loading");

    fetchArtworkPage(pageParams, 0, controller.signal)
      .then((page) => {
        if (requestSeqRef.current !== requestId) return;
        loadedIdsRef.current = new Set(page.items.map((artwork) => artwork.id));
        startTransition(() => {
          setLoadedArtworks(page.items);
          setPageInfo({
            total: page.total,
            nextOffset: page.nextOffset,
            hasMore: page.hasMore,
          });
          setPageStatus("idle");
        });
      })
      .catch(() => {
        if (controller.signal.aborted || requestSeqRef.current !== requestId) return;
        setPageStatus("failed");
      });

    return () => controller.abort();
  }, [initialArtworks, isDefaultPage, pageKey, pageParams, totalArtworks]);

  useEffect(() => {
    if (!pageParams.q || pageParams.sort !== "shuffle" || Fuse) return;
    let cancelled = false;
    import("fuse.js").then((mod) => {
      if (!cancelled) setFuse(() => mod.default as FuseCtor);
    });
    return () => {
      cancelled = true;
    };
  }, [Fuse, pageParams.q, pageParams.sort]);

  const fuse = useMemo(() => {
    if (!Fuse || !pageParams.q || pageParams.sort !== "shuffle") return null;
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
  }, [Fuse, loadedArtworks, pageParams.q, pageParams.sort]);

  const visibleArtworks = useMemo(() => {
    if (!fuse) return loadedArtworks;
    return rankLoadedArtworks(loadedArtworks, fuse, pageParams.q);
  }, [fuse, loadedArtworks, pageParams.q]);

  const loadMoreArtworks = useCallback(async (): Promise<ArtworkListing[]> => {
    const info = pageInfoRef.current;
    const offset = info.nextOffset;
    const activeKey = pageKeyRef.current;
    if (loadingMoreRef.current || !info.hasMore || offset == null) return [];

    loadingMoreRef.current = true;
    setPageStatus("loading-more");
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;

    try {
      const page = await fetchArtworkPage(pageParamsRef.current, offset, controller.signal);
      if (controller.signal.aborted || activeKey !== pageKeyRef.current) return [];
      const incoming = page.items.filter((artwork) => !loadedIdsRef.current.has(artwork.id));
      for (const artwork of incoming) loadedIdsRef.current.add(artwork.id);

      startTransition(() => {
        setLoadedArtworks((current) => appendUniqueArtworks(current, incoming));
        setPageInfo({
          total: page.total,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
        });
        setPageStatus("idle");
      });

      return incoming;
    } catch {
      if (controller.signal.aborted) return [];
      if (activeKey === pageKeyRef.current) setPageStatus("failed");
      return [];
    } finally {
      loadingMoreRef.current = false;
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
      }
    }
  }, []);

  const filterKey = pageKey;
  const activeFilterCount = (movement ? 1 : 0) + (minYear ? 1 : 0) + (maxYear ? 1 : 0);
  const loadedCount = loadedArtworks.length;

  function clearFilters() {
    setMovement("");
    setMinYear("");
    setMaxYear("");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by title, artist, movement..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:flex-1"
          />
          <select
            aria-label="Sort artworks by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ArtworkSort)}
            className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2 text-sm sm:w-auto sm:min-w-[12rem]"
          >
            <option value="shuffle">Sort: shuffled</option>
            <option value="year">Sort: chronological</option>
            <option value="artist">Sort: artist</option>
            <option value="title">Sort: title</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Filter by movement"
            value={movement}
            onChange={(e) => setMovement(e.target.value)}
            className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2"
          >
            <option value="">All movements</option>
            {movements.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Input
            type="number"
            aria-label="Earliest year"
            placeholder="From"
            value={minYear}
            onChange={(e) => setMinYear(e.target.value)}
            className="w-24"
          />
          <Input
            type="number"
            aria-label="Latest year"
            placeholder="To"
            value={maxYear}
            onChange={(e) => setMaxYear(e.target.value)}
            className="w-24"
          />
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
        <span>{statusLabel(pageStatus, loadedCount, pageInfo.total)}</span>
      </div>

      {pageStatus === "loading" ? (
        <div className="py-16 text-center text-[var(--muted-foreground)]">Loading works...</div>
      ) : (
        <ArtworkGallery
          artworks={visibleArtworks}
          loadMoreArtworks={loadMoreArtworks}
          hasMoreArtworks={pageInfo.hasMore}
          pageSize={PAGE_SIZE}
          initialSeed={Math.min(PAGE_SIZE, visibleArtworks.length)}
          resetKey={filterKey}
        />
      )}
    </div>
  );
}

async function fetchArtworkPage(
  params: PageParams,
  offset: number,
  signal?: AbortSignal,
): Promise<ArtworkPage> {
  const url = new URL(PAGE_ENDPOINT, window.location.origin);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("sort", params.sort);
  url.searchParams.set("seed", params.seed);
  appendParam(url, "q", params.q);
  appendParam(url, "movement", params.movement);
  appendParam(url, "minYear", params.minYear);
  appendParam(url, "maxYear", params.maxYear);

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch ${url.pathname}: ${res.status}`);
  return res.json() as Promise<ArtworkPage>;
}

function appendParam(url: URL, key: string, value: string) {
  if (value) url.searchParams.set(key, value);
}

function generateSessionSeed(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}

function appendUniqueArtworks(
  current: ArtworkListing[],
  incoming: ArtworkListing[],
): ArtworkListing[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((artwork) => artwork.id));
  const next = incoming.filter((artwork) => !seen.has(artwork.id));
  return next.length > 0 ? [...current, ...next] : current;
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

function statusLabel(status: PageStatus, loaded: number, total: number): string {
  if (status === "loading") return "Loading...";
  if (status === "loading-more") return `Loading more... ${loaded.toLocaleString()} loaded`;
  if (status === "failed") return "More works unavailable";
  if (loaded >= total) return total === 0 ? "" : "All loaded";
  return `${loaded.toLocaleString()} loaded`;
}
