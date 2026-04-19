"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import Link from "next/link";
import Fuse from "fuse.js";
import { Input } from "@/components/ui/input";
import { assetUrl } from "@/lib/utils";
import type { Artist } from "@/lib/data";

const PAGE = 40;

type Props = {
  artists: Artist[];
};

export function ArtistsBrowser({ artists }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fuse = useMemo(
    () =>
      new Fuse(artists, {
        keys: [
          { name: "name", weight: 0.6 },
          { name: "movement", weight: 0.25 },
          { name: "nationality", weight: 0.15 },
        ],
        threshold: 0.33,
        ignoreLocation: true,
      }),
    [artists],
  );

  const filtered = useMemo(() => {
    if (!deferredQuery.trim()) return artists;
    return fuse.search(deferredQuery).map((r) => r.item);
  }, [artists, deferredQuery, fuse]);

  // Reset limit when the filter changes so we don't strand users mid-scroll
  useEffect(() => {
    setLimit(PAGE);
  }, [deferredQuery]);

  // IntersectionObserver on the sentinel grows the visible slice.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((prev) => Math.min(prev + PAGE, filtered.length));
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, limit);
  const hasMore = limit < filtered.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center">
        <Input
          placeholder="Search artists by name, movement, nationality..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-md"
        />
        <span className="text-sm text-[var(--muted-foreground)]">
          {filtered.length} artist{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visible.map((a) => (
          <Link
            key={a.slug}
            href={`/artist/${a.slug}`}
            className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg"
          >
            <div className="aspect-square overflow-hidden bg-[var(--muted)]">
              {a.coverObjectKey && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={assetUrl(a.coverObjectKey)}
                  alt={a.coverTitle || a.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-1 text-sm font-medium">{a.name}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {a.count} work{a.count === 1 ? "" : "s"}
                {a.born && a.died ? ` · ${a.born}–${a.died}` : ""}
              </p>
              {a.movement && (
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {a.movement}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="py-6 text-center text-sm text-[var(--muted-foreground)]"
        >
          Loading more artists…
        </div>
      )}

      {!hasMore && filtered.length > 0 && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">
          — all {filtered.length} artists —
        </div>
      )}
    </div>
  );
}
