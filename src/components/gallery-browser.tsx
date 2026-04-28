"use client";

import Fuse from "fuse.js";
import { useDeferredValue, useMemo, useState } from "react";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Artwork } from "@/lib/data";

type Props = {
  artworks: Artwork[];
  movements: string[];
};

export function GalleryBrowser({ artworks, movements }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [movement, setMovement] = useState<string>("");
  const [minYear, setMinYear] = useState<string>("");
  const [maxYear, setMaxYear] = useState<string>("");
  const [sortBy, setSortBy] = useState<"year" | "artist" | "title">("year");

  const fuse = useMemo(
    () =>
      new Fuse(artworks, {
        keys: [
          { name: "title", weight: 0.45 },
          { name: "artist", weight: 0.35 },
          { name: "movement", weight: 0.1 },
          { name: "description", weight: 0.1 },
        ],
        threshold: 0.33,
        ignoreLocation: true,
      }),
    [artworks],
  );

  const filtered = useMemo(() => {
    let list: Artwork[];
    if (deferredQuery.trim()) {
      list = fuse.search(deferredQuery).map((r) => r.item);
    } else {
      list = [...artworks];
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
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [deferredQuery, fuse, artworks, movement, minYear, maxYear, sortBy]);

  const filterKey = `${deferredQuery}|${movement}|${minYear}|${maxYear}|${sortBy}`;

  const activeFilterCount = (movement ? 1 : 0) + (minYear ? 1 : 0) + (maxYear ? 1 : 0);

  function clearFilters() {
    setMovement("");
    setMinYear("");
    setMaxYear("");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center">
        <Input
          placeholder="Search by title, artist, movement, description..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-lg"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
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
            placeholder="From"
            value={minYear}
            onChange={(e) => setMinYear(e.target.value)}
            className="w-24"
          />
          <Input
            type="number"
            placeholder="To"
            value={maxYear}
            onChange={(e) => setMaxYear(e.target.value)}
            className="w-24"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2"
          >
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
          {filtered.length.toLocaleString()} work
          {filtered.length === 1 ? "" : "s"}
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount} filter
              {activeFilterCount === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </div>

      <ArtworkGallery artworks={filtered} resetKey={filterKey} />
    </div>
  );
}
