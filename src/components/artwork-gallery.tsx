"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { useArtworkTooltip } from "@/components/artwork-tooltip";
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
  /** How many photos to seed the album with on first render. Defaults to
   *  CHUNK_SIZE — enough to fill above-the-fold; the IntersectionObserver
   *  takes over for everything else. Callers with a larger SSR window
   *  (e.g. the home page that ships 80 items in the initial RSC payload)
   *  can override to render the full payload immediately. */
  initialSeed?: number;
  /** Key that changes when the parent filters/sort change — the wrapper
   *  div remounts on key change so internal state resets cleanly. */
  resetKey?: string;
  targetRowHeight?: number | ((width: number) => number);
  scope?: Scope | null;
};

// Render group size. Each chunk is a self-contained <RowsPhotoAlbum>
// whose layout is solved independently of every other chunk.
//
// This is the same approach the sister project ricos.site uses for its
// trip galleries, and it sidesteps an entire class of bugs that came
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
//
// CHUNK_SIZE also gates how many photos are appended per IntersectionObserver
// trigger. That keeps the math behind the sentinel push predictable:
// 10 photos at our 160-260 px target row heights and 2-5 columns work
// out to ~440-660 px of added height, which is comfortably larger than
// the 300 px prefetch rootMargin — every load pushes the sentinel out
// of intersection, so the observer reliably re-fires on the next scroll.
const CHUNK_SIZE = 10;
const PREFETCH_ROOT_MARGIN = "300px";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function ArtworkGallery({
  artworks,
  loadMoreArtworks,
  hasMoreArtworks = false,
  initialSeed = CHUNK_SIZE,
  resetKey,
  targetRowHeight,
  scope,
}: Props) {
  const activeScope = scope ?? null;
  const photos = useMemo(
    () => artworks.map((a) => toGalleryPhoto(a, activeScope)),
    [artworks, activeScope],
  );

  // Single source of truth for what's on screen. New items — local or
  // server-fetched — append to this array. We deliberately do NOT mirror
  // the parent's photos array via a slice index: the gallery-browser
  // surface uses startTransition to commit server fetches into its own
  // state, and a slice-index model fights with that by re-rendering
  // mid-transition. Owning the visible array here keeps the gallery
  // independent of how the parent stitches paginated results together.
  const [displayed, setDisplayed] = useState<GalleryPhoto[]>(() => photos.slice(0, initialSeed));
  // Track when the server has signalled "no more items". hasMoreArtworks
  // is the parent's last-known truth; this captures the moment we
  // actually saw a zero-length response so we don't re-fire the fetch.
  const [serverExhausted, setServerExhausted] = useState(false);

  // If the parent swaps the underlying set entirely (different scope /
  // filter / sort), the wrapper div's `key={resetKey}` already forces a
  // full remount and we re-seed from the new photos. No effect needed:
  // remount runs the useState initializer afresh.

  const hasMoreLocal = displayed.length < photos.length;
  const hasMoreServer = hasMoreArtworks && !!loadMoreArtworks && !serverExhausted;
  const hasMore = hasMoreLocal || hasMoreServer;

  const loadingRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      // Local pagination first. setDisplayed's updater form lets us read
      // the freshest length without putting `displayed.length` in the
      // useCallback deps — keeping loadMore's identity stable across
      // chunked loads is what makes the IO effect attach the observer
      // exactly once (not re-attach on every batch).
      let appendedLocal = false;
      setDisplayed((prev) => {
        const next = photos.slice(prev.length, prev.length + CHUNK_SIZE);
        if (next.length === 0) return prev;
        appendedLocal = true;
        return [...prev, ...next];
      });
      if (appendedLocal) return;

      // Local exhausted — fall through to the server.
      if (!hasMoreArtworks || !loadMoreArtworks) return;
      const next = await loadMoreArtworks();
      if (next.length === 0) {
        setServerExhausted(true);
        return;
      }
      setDisplayed((prev) => [...prev, ...next.map((a) => toGalleryPhoto(a, activeScope))]);
    } finally {
      // Short debounce so a rapid burst of IO callbacks (the sentinel
      // briefly oscillating across the rootMargin boundary) coalesces to
      // a single load. Matches ricos.site's InfiniteScrollGallery.
      setTimeout(() => {
        loadingRef.current = false;
      }, 100);
    }
  }, [photos, hasMoreArtworks, loadMoreArtworks, activeScope]);

  // Sentinel mounted iff there's more to load. Attaches the IO once;
  // detaches when hasMore flips to false (end of gallery). This is the
  // ricos.site pattern verbatim — relies on each chunk-append pushing
  // the sentinel out of the rootMargin window so the observer's
  // isIntersecting transitions correctly on the next scroll-in.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      loadMore();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) loadMore();
      },
      { rootMargin: PREFETCH_ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Chunk into independent albums. Index-based split → chunk identity
  // stable across re-renders. New batches grow the tail; existing
  // chunks never recompute their row layout.
  const chunks = useMemo(() => chunk(displayed, CHUNK_SIZE), [displayed]);

  const rowHeight = targetRowHeight ?? ((w: number) => (w < 640 ? 160 : w < 1024 ? 220 : 260));

  if (artworks.length === 0) {
    return <div className="py-16 text-center text-[var(--muted-foreground)]">No works.</div>;
  }

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
              link: ({ href: _href, children, className, ...rest }, { photo }) => {
                const p = photo as GalleryPhoto;
                return (
                  <GalleryTileLink
                    {...rest}
                    photo={p}
                    className={`${className ?? ""} rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]`.trim()}
                  >
                    {children}
                  </GalleryTileLink>
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
      {!hasMore && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">— end —</div>
      )}
    </div>
  );
}

function GalleryTileLink({
  photo,
  className,
  children,
  ...rest
}: {
  photo: GalleryPhoto;
  className: string;
  children: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<typeof Link>, "href" | "title" | "className">) {
  const { handlers, portal } = useArtworkTooltip({
    title: photo.title,
    artist: photo.artist,
    year: photo.year,
  });
  return (
    <>
      <Link {...rest} {...handlers} href={photo.href} aria-label={photo.alt} className={className}>
        {children}
      </Link>
      {portal}
    </>
  );
}
