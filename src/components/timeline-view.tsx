"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useArtworkTooltip } from "@/components/artwork-tooltip";
import { ResponsiveImage } from "@/components/responsive-image";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { artworkHref } from "@/lib/artwork-scope";
import type { ArtworkListing } from "@/lib/data";

const DECADE = 10;

type Props = {
  artworks: ArtworkListing[];
  movements: string[];
};

type Bucket = {
  decade: number;
  works: ArtworkListing[];
};

export function TimelineView({ artworks, movements }: Props) {
  const [movement, setMovement] = useState<string>("");
  const [query, setQuery] = useState("");

  // Defensive dedupe by id so a future merge regression (slug collision in
  // build-data.mjs) can't crash React with duplicate keys.
  const uniqueArtworks = useMemo(() => {
    const seen = new Set<string>();
    return artworks.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [artworks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return uniqueArtworks.filter((a) => {
      if (a.year == null) return false;
      if (movement && a.movement !== movement) return false;
      if (q) {
        const hay = [a.title, a.englishTitle, a.artist, a.movement, a.nationality]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [uniqueArtworks, movement, query]);

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<number, ArtworkListing[]>();
    for (const a of filtered) {
      if (a.year == null) continue;
      const d = Math.floor(a.year / DECADE) * DECADE;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(a);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([decade, works]) => ({
        decade,
        works: works.sort((x, y) => (x.year ?? 0) - (y.year ?? 0)),
      }));
  }, [filtered]);

  const maxInBucket = Math.max(1, ...buckets.map((b) => b.works.length));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center">
        <Input
          type="search"
          aria-label="Filter timeline by title, artist, or nationality"
          placeholder="Filter by title, artist, nationality..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-md"
        />
        <select
          aria-label="Filter by movement"
          value={movement}
          onChange={(e) => setMovement(e.target.value)}
          className="h-9 rounded-md border border-[var(--input)] bg-transparent px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <option value="">All movements</option>
          {movements.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="text-sm text-[var(--muted-foreground)]">
          {filtered.length.toLocaleString()} dated works across {buckets.length} decades
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 text-xs text-[var(--muted-foreground)]">
          Density across time (each bar = one decade):
        </div>
        <div className="flex h-24 items-end gap-0.5">
          {buckets.map((b) => (
            // biome-ignore lint/a11y/useAnchorContent: decorative density bar; the title attribute carries the screen-reader label.
            <a
              key={b.decade}
              href={`#decade-${b.decade}`}
              className="flex-1 min-w-[3px] rounded-t-sm bg-[var(--primary)]/70 transition-colors hover:bg-[var(--primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              style={{
                height: `${(b.works.length / maxInBucket) * 100}%`,
              }}
              aria-label={`${b.decade}s: ${b.works.length} work${b.works.length === 1 ? "" : "s"}`}
              title={`${b.decade}s: ${b.works.length} work${b.works.length === 1 ? "" : "s"}`}
            />
          ))}
        </div>
        {buckets.length > 0 && (
          <div className="mt-1 flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>{buckets[0].decade}s</span>
            <span>{buckets[buckets.length - 1].decade}s</span>
          </div>
        )}
      </div>

      <div className="space-y-12">
        {buckets.map((b) => (
          <section key={b.decade} id={`decade-${b.decade}`} className="scroll-mt-20">
            <div className="sticky top-14 z-10 -mx-4 mb-3 border-y border-[var(--border)] bg-[var(--background)]/90 px-4 py-2 backdrop-blur">
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-xl">{b.decade}s</h2>
                <Badge variant="outline">{b.works.length}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {b.works.map((a) => (
                <TimelineTile key={a.id} artwork={a} decade={b.decade} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {buckets.length === 0 && (
        <div className="py-16 text-center text-[var(--muted-foreground)]">
          No dated works match the filters.
        </div>
      )}
    </div>
  );
}

function TimelineTile({ artwork: a, decade }: { artwork: ArtworkListing; decade: number }) {
  const { handlers, portal } = useArtworkTooltip({
    title: displayTitle(a),
    artist: a.artist,
    year: a.year,
  });
  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-md bg-[var(--muted)]"
      {...handlers}
    >
      <Link
        href={artworkHref(a.id, { kind: "decade", start: decade })}
        className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        aria-label={artworkAlt(a)}
      />
      <ResponsiveImage
        objectKey={a.objectKey}
        variantWidths={a.variantWidths}
        alt={artworkAlt(a)}
        fill
        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
        loading="lazy"
        dominantColor={a.dominantColor}
        className="transition-transform duration-500 group-hover:scale-110"
      />
      {/* Mobile-only caption: touch has no hover, so stamp-sized tiles
          still get a label. Desktop hover is served by the floating
          tooltip portal mounted via useArtworkTooltip. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white md:hidden">
        <div className="line-clamp-1 font-medium">{displayTitle(a)}</div>
        <div className="line-clamp-1 opacity-80">
          {a.year}
          {a.artist ? (
            <>
              {" · "}
              <Link
                href={`/artist/${a.artistSlug}`}
                className="relative z-20 rounded-sm underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {a.artist}
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {portal}
    </div>
  );
}
