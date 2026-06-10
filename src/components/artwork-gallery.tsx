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
  // Pass the real pixel aspect ratio to the row solver. Catalogue
  // outliers (Chinese handscrolls at 27:1–48:1, Monet Water Lilies
  // panels) land on their own row at the natural full-width strip
  // height — clamping the aspect previously forced them into pairs
  // with normal tiles, which made the row collapse to ~30 px tall and
  // the panorama unrecognisable. Solo wide strips read as the actual
  // panorama; one row to the user.
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

  // Materialise tiles in pages of `pageSize`, starting at `initialSeed`.
  // We deliberately do NOT use react-photo-album/scroll here: its
  // `singleton` mode wraps every tile in an <Offscreen> recycler that
  // swaps real tiles for `width: 100%` placeholder <div>s once they
  // pass the rootMargin window. Those placeholders lack the
  // `react-photo-album--photo` class, so the rows.css `calc(... *
  // --photo-width)` rule that gives each tile its row-share is lost,
  // and the layout collapses to a column-like arrangement with large
  // unjustified gaps. The library's `offscreenRootMargin="100000px"`
  // escape hatch only papered over part of it — once a tile was ever
  // captured offscreen, the placeholder dimensions stuck. Easier to
  // just render every loaded tile fully. Each is a lazy <img>, so the
  // DOM cost is small (~1000 nodes at the largest scope).
  const [loadedCount, setLoadedCount] = useState(() => Math.min(initialSeed, photos.length));
  const [extraPages, setExtraPages] = useState<GalleryPhoto[][]>([]);
  const [fetchingExtra, setFetchingExtra] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  // Reset on filter/sort change. The parent bumps `resetKey`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate — reset on key change
  useEffect(() => {
    setLoadedCount(Math.min(initialSeed, photos.length));
    setExtraPages([]);
    setFetchingExtra(false);
    setExhausted(false);
  }, [resetKey, initialSeed, photos.length]);

  const localExhausted = loadedCount >= photos.length;

  const loadMore = useCallback(async () => {
    if (fetchingExtra || exhausted) return;
    // First, exhaust the local slice from `photos`.
    if (!localExhausted) {
      setLoadedCount((n) => Math.min(n + pageSize, photos.length));
      return;
    }
    // Local set is drained — ask the server for the next page if the
    // parent gave us a fetcher.
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
  }, [
    fetchingExtra,
    exhausted,
    localExhausted,
    pageSize,
    photos.length,
    hasMoreArtworks,
    loadMoreArtworks,
    activeScope,
  ]);

  // Sentinel observed by an IntersectionObserver well below the visible
  // gallery. When it enters the prefetch window we call loadMore(). The
  // 2400 px rootMargin matches what we used to pass to the library's
  // InfiniteScroll — keeps the next batch on screen before the previous
  // one's trailing row could become visible.
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
      { rootMargin: "2400px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore]);

  const visiblePhotos = useMemo(() => {
    const head = photos.slice(0, loadedCount);
    if (extraPages.length === 0) return head;
    return head.concat(...extraPages);
  }, [photos, loadedCount, extraPages]);

  const rowHeight = targetRowHeight ?? ((w: number) => (w < 640 ? 160 : w < 1024 ? 220 : 260));

  if (artworks.length === 0) {
    return <div className="py-16 text-center text-[var(--muted-foreground)]">No works.</div>;
  }

  const finished = exhausted || (localExhausted && !hasMoreArtworks);

  return (
    <div key={resetKey ?? "all"}>
      <RowsPhotoAlbum
        photos={visiblePhotos}
        targetRowHeight={rowHeight}
        spacing={6}
        sizes={{ size: "640px" }}
        // Cap maxPhotos to keep the DP solver's branching factor bounded
        // as the album grows past ~1000 photos. No minPhotos: handscrolls
        // (aspect 27:1+) MUST be allowed to land on their own row at a
        // thin strip; pairing them with a normal tile collapses the row
        // height for both and reads worse than the strip.
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
          // Render via <picture>/<source> against pre-built rclone variants.
          // photo.src is the objectKey (see toGalleryPhoto above).
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
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            );
          },
        }}
      />
      <div ref={sentinelRef} aria-hidden style={{ width: 1, height: 1 }} />
      {fetchingExtra && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">Loading more…</div>
      )}
      {finished && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">— end —</div>
      )}
    </div>
  );
}
