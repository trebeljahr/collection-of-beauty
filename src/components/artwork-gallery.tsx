"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { ResponsiveImage } from "@/components/responsive-image";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { artworkHref, type Scope } from "@/lib/artwork-scope";
import type { ArtworkListing } from "@/lib/data";

export type GalleryPhoto = {
  // react-photo-album needs a src string to place tiles, even though we
  // render via <ResponsiveImage>. We stash the objectKey as src and
  // re-resolve to real URLs inside the custom image renderer below.
  src: string;
  variantWidths: number[] | null;
  width: number;
  height: number;
  key: string;
  alt: string;
  href: string;
  title: string;
  artist: string | null;
  year: number | null;
  dominantColor: string | null;
};

export function toGalleryPhoto(a: ArtworkListing, scope: Scope | null = null): GalleryPhoto {
  return {
    src: a.objectKey,
    variantWidths: a.variantWidths,
    width: a.width ?? 800,
    height: a.height ?? 1000,
    key: a.id,
    alt: artworkAlt(a),
    href: artworkHref(a.id, scope),
    title: displayTitle(a),
    artist: a.artist,
    year: a.year,
    dominantColor: a.dominantColor,
  };
}

type Props = {
  artworks: ArtworkListing[];
  loadMoreArtworks?: () => Promise<ArtworkListing[]>;
  hasMoreArtworks?: boolean;
  /** Page size for infinite-scroll materialisation. */
  pageSize?: number;
  /** How many photos to seed the album with on first render. Makes the top
   *  two-to-three screenfuls available instantly, before any fetch fires. */
  initialSeed?: number;
  /** Key that changes when the parent filters/sort change — forces a full
   *  remount so the scroller's internal cursor resets to 0. */
  resetKey?: string;
  targetRowHeight?: number | ((width: number) => number);
  scope?: Scope | null;
};

// Render group size. Each chunk is a self-contained <RowsPhotoAlbum>
// whose layout is solved independently of every other chunk.
//
// This is the same approach the sister project ricos.site uses for its
// trip galleries, and it sidesteps the entire class of bugs that came
// from running ONE big album over the growing photos array:
//
//   - No DP re-pack of the trailing rows when a new batch arrives —
//     prior chunks are frozen, only the new chunk runs the solver.
//   - No `react-photo-album/scroll` Offscreen recycler swapping tiles
//     for `width: 100%` placeholder <div>s mid-scroll.
//   - Each chunk's last row may not be perfectly justified, but with
//     a small chunk size that's a tiny stair-step every ~10 tiles
//     rather than a column-wide gap.
//
// Bigger chunks = fewer stair-steps but bigger DP cost per re-render;
// smaller chunks = more stair-steps. 10 matches ricos.site and reads
// fine in practice.
const CHUNK_SIZE = 10;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function ArtworkGallery({
  artworks,
  loadMoreArtworks,
  hasMoreArtworks = false,
  pageSize = 40,
  initialSeed = 40,
  resetKey,
  targetRowHeight,
  scope,
}: Props) {
  const activeScope = scope ?? null;
  const photos = useMemo(
    () => artworks.map((a) => toGalleryPhoto(a, activeScope)),
    [artworks, activeScope],
  );

  // Two state slots: how much of the parent-supplied `photos` array
  // we've materialised, plus any extra pages fetched from the server
  // after exhausting the local set. Both reset on `resetKey` change.
  const [loadedCount, setLoadedCount] = useState(() => Math.min(initialSeed, photos.length));
  const [extraPages, setExtraPages] = useState<GalleryPhoto[][]>([]);
  const [fetchingExtra, setFetchingExtra] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate — reset on key change
  useEffect(() => {
    setLoadedCount(Math.min(initialSeed, photos.length));
    setExtraPages([]);
    setFetchingExtra(false);
    setExhausted(false);
  }, [resetKey, initialSeed, photos.length]);

  const localExhausted = loadedCount >= photos.length;

  const loadingRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (loadingRef.current || exhausted) return;
    loadingRef.current = true;
    try {
      if (!localExhausted) {
        setLoadedCount((n) => Math.min(n + pageSize, photos.length));
        return;
      }
      if (!hasMoreArtworks || !loadMoreArtworks) {
        setExhausted(true);
        return;
      }
      setFetchingExtra(true);
      try {
        const next = await loadMoreArtworks();
        if (next.length === 0) {
          setExhausted(true);
        } else {
          setExtraPages((pages) => [...pages, next.map((a) => toGalleryPhoto(a, activeScope))]);
        }
      } finally {
        setFetchingExtra(false);
      }
    } finally {
      // Short debounce — IntersectionObserver can fire repeatedly while
      // the sentinel sits inside the rootMargin window. Without this the
      // setLoadedCount path queues several increments back-to-back.
      // Copied from ricos.site's InfiniteScrollGallery.
      setTimeout(() => {
        loadingRef.current = false;
      }, 100);
    }
  }, [
    exhausted,
    localExhausted,
    pageSize,
    photos.length,
    hasMoreArtworks,
    loadMoreArtworks,
    activeScope,
  ]);

  // Plain IntersectionObserver against a 1×1 sentinel below the last
  // chunk. No `react-photo-album/scroll`, no Offscreen recycler.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      loadMore();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) loadMore();
      },
      { rootMargin: "1200px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore]);

  const visiblePhotos = useMemo(() => {
    const head = photos.slice(0, loadedCount);
    if (extraPages.length === 0) return head;
    return head.concat(...extraPages);
  }, [photos, loadedCount, extraPages]);

  // Chunk into independent albums. The split is index-based so each
  // chunk's identity is stable across re-renders — chunk 0 is always
  // the first 10 photos, chunk 1 the next 10, etc. New batches grow
  // the tail; existing chunks never recompute.
  const chunks = useMemo(() => chunk(visiblePhotos, CHUNK_SIZE), [visiblePhotos]);

  const rowHeight = targetRowHeight ?? ((w: number) => (w < 640 ? 160 : w < 1024 ? 220 : 260));

  if (artworks.length === 0) {
    return <div className="py-16 text-center text-[var(--muted-foreground)]">No works.</div>;
  }

  const finished = exhausted || (localExhausted && !hasMoreArtworks && extraPages.length === 0);
  const hasMore = !finished;

  return (
    <div key={resetKey ?? "all"}>
      {chunks.map((group, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: chunks are append-only; index is stable
          key={i}
          className="mb-1.5"
        >
          <RowsPhotoAlbum
            photos={group}
            targetRowHeight={rowHeight}
            spacing={6}
            // Helps the row solver pick a reasonable initial layout
            // during SSR before the ResizeObserver has measured the
            // real container width. Matches ricos.site.
            defaultContainerWidth={1200}
            sizes={{ size: "640px" }}
            // Cap maxPhotos so the DP solver never tries to combine all
            // 10 chunk photos into a single row when their aspects let
            // it — keeps tile sizes within a sane band.
            rowConstraints={{ maxPhotos: 8 }}
            render={{
              link: ({ href, children, className, ...rest }, { photo }) => {
                const p = photo as GalleryPhoto;
                return (
                  <Link
                    {...rest}
                    href={p.href}
                    aria-label={p.alt}
                    title={`${p.title}${p.artist ? " — " + p.artist : ""}${p.year ? " (" + p.year + ")" : ""}`}
                    className={`${className ?? ""} rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]`.trim()}
                  >
                    {children}
                  </Link>
                );
              },
              // Render via <picture>/<source> against pre-built rclone
              // variants. height: auto matches the library's default CSS
              // (.react-photo-album--image), which sets aspect-ratio
              // from photo-width/photo-height — the image's intrinsic
              // size then matches the cell exactly, so no object-fit
              // crop or sub-pixel mismatch.
              image: (_, { photo, width }) => {
                const p = photo as GalleryPhoto;
                return (
                  <ResponsiveImage
                    objectKey={p.src}
                    variantWidths={p.variantWidths}
                    alt={p.alt ?? ""}
                    srcWidth={p.width}
                    srcHeight={p.height}
                    sizes={`${Math.ceil(width)}px`}
                    loading="lazy"
                    dominantColor={p.dominantColor}
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                );
              },
            }}
          />
        </div>
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden style={{ width: 1, height: 1 }} />}
      {fetchingExtra && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">Loading more…</div>
      )}
      {finished && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">— end —</div>
      )}
    </div>
  );
}
