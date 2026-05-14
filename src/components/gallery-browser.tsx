"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import seedrandom from "seedrandom";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArtworkListing } from "@/lib/data";

type SortBy = "shuffle" | "year" | "artist" | "title";

type Props = {
  initialArtworks: ArtworkListing[];
  movements: string[];
  totalArtworks: number;
};

type FuseSearch = {
  search: (query: string) => Array<{ item: ArtworkListing }>;
};
type FuseCtor = new (list: ArtworkListing[], options: Record<string, unknown>) => FuseSearch;

const FULL_COLLECTION_ENDPOINT = "/api/artworks";

export function GalleryBrowser({ initialArtworks, movements, totalArtworks }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [movement, setMovement] = useState<string>("");
  const [minYear, setMinYear] = useState<string>("");
  const [maxYear, setMaxYear] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("shuffle");
  const [allArtworks, setAllArtworks] = useState<ArtworkListing[] | null>(null);
  const [collectionState, setCollectionState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const [Fuse, setFuse] = useState<FuseCtor | null>(null);
  const artworks = allArtworks ?? initialArtworks;
  const hasFullCollection = allArtworks !== null;

  // Seed once per browser day so the homepage feels fresh on revisits but
  // stays stable while the user scrolls/types.
  const shuffleSeed = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = () => {
      fetch(FULL_COLLECTION_ENDPOINT, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`fetch ${FULL_COLLECTION_ENDPOINT}: ${res.status}`);
          return res.json() as Promise<ArtworkListing[]>;
        })
        .then((data) => {
          if (cancelled) return;
          startTransition(() => {
            setAllArtworks(data);
            setCollectionState("loaded");
          });
        })
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setCollectionState("failed");
        });
    };

    const requestIdle = window.requestIdleCallback;
    if (typeof requestIdle === "function") {
      const cancelIdle = window.cancelIdleCallback;
      const id = requestIdle(load, { timeout: 1500 });
      return () => {
        cancelled = true;
        controller.abort();
        cancelIdle(id);
      };
    }

    const id = window.setTimeout(load, 600);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (!hasFullCollection || Fuse) return;
    let cancelled = false;
    import("fuse.js").then((mod) => {
      if (!cancelled) setFuse(() => mod.default as FuseCtor);
    });
    return () => {
      cancelled = true;
    };
  }, [Fuse, hasFullCollection]);

  const shuffled = useMemo(() => {
    const rng = seedrandom(shuffleSeed);
    const arr = [...artworks];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [artworks, shuffleSeed]);

  const fuse = useMemo(() => {
    if (!Fuse) return null;
    return new Fuse(artworks, {
      keys: [
        { name: "title", weight: 0.45 },
        { name: "artist", weight: 0.35 },
        { name: "movement", weight: 0.1 },
        { name: "nationality", weight: 0.1 },
      ],
      threshold: 0.33,
      ignoreLocation: true,
    });
  }, [Fuse, artworks]);

  const filtered = useMemo(() => {
    let list: ArtworkListing[];
    const trimmedQuery = deferredQuery.trim();
    if (trimmedQuery && fuse) {
      list = fuse.search(deferredQuery).map((r) => r.item);
    } else if (trimmedQuery) {
      list = simpleSearch(artworks, trimmedQuery);
    } else {
      list = sortBy === "shuffle" ? [...shuffled] : [...artworks];
    }
    if (movement) list = list.filter((a) => a.movement === movement);
    const lo = minYear ? Number(minYear) : null;
    const hi = maxYear ? Number(maxYear) : null;
    if (lo != null) list = list.filter((a) => a.year != null && a.year >= lo);
    if (hi != null) list = list.filter((a) => a.year != null && a.year <= hi);

    if (sortBy === "year") {
      list.sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999));
    } else if (sortBy === "artist") {
      list.sort((a, b) => (a.artist ?? "zzz").localeCompare(b.artist ?? "zzz"));
    } else if (sortBy === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [deferredQuery, fuse, artworks, shuffled, movement, minYear, maxYear, sortBy]);

  const filterKey = `${hasFullCollection}|${deferredQuery}|${movement}|${minYear}|${maxYear}|${sortBy}|${shuffleSeed}`;

  const activeFilterCount = (movement ? 1 : 0) + (minYear ? 1 : 0) + (maxYear ? 1 : 0);
  const hasCollectionConstraint = Boolean(deferredQuery.trim() || movement || minYear || maxYear);
  const visibleCount =
    !hasFullCollection && !hasCollectionConstraint ? totalArtworks : filtered.length;

  function clearFilters() {
    setMovement("");
    setMinYear("");
    setMaxYear("");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <Input
          placeholder="Search by title, artist, movement, description..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full"
        />
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
          <select
            aria-label="Sort artworks by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2"
          >
            <option value="shuffle">Sort: shuffled</option>
            <option value="year">Sort: chronological</option>
            <option value="artist">Sort: artist</option>
            <option value="title">Sort: title</option>
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
          {visibleCount.toLocaleString()} work
          {visibleCount === 1 ? "" : "s"}
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount} filter
              {activeFilterCount === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
        {collectionState !== "loaded" && (
          <span>
            {collectionState === "failed"
              ? "Full collection unavailable"
              : "Loading full collection..."}
          </span>
        )}
      </div>

      <ArtworkGallery artworks={filtered} resetKey={filterKey} />
    </div>
  );
}

function simpleSearch(artworks: ArtworkListing[], query: string): ArtworkListing[] {
  const q = query.toLocaleLowerCase();
  return artworks.filter((a) =>
    [a.title, a.artist, a.movement, a.nationality].some((value) =>
      value?.toLocaleLowerCase().includes(q),
    ),
  );
}
