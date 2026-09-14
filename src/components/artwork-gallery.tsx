"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeRowsLayout, RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { useArtworkTooltip } from "@/components/artwork-tooltip";
import { ResponsiveImage } from "@/components/responsive-image";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { artworkHref, type Scope } from "@/lib/scope-href";
import { useArtworkBackFlip } from "@/lib/use-artwork-back-flip";
import type { LoadMoreResult } from "@/lib/use-artwork-pagination";
import { useTransitionNav } from "@/lib/use-transition-nav";
import { artworkHeroVtName } from "@/lib/view-transitions";

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

/** The fields a gallery tile reads. Narrower than `ArtworkListing` so the
 *  timeline's slimmer per-decade payload can feed the same tiles. */
export type GalleryPhotoSource = Pick<
  ArtworkListing,
  | "id"
  | "title"
  | "englishTitle"
  | "artist"
  | "year"
  | "objectKey"
  | "variantWidths"
  | "width"
  | "height"
  | "dominantColor"
>;

export function toGalleryPhoto(a: GalleryPhotoSource, scope: Scope | null = null): GalleryPhoto {
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
  loadMoreArtworks?: () => Promise<LoadMoreResult | null>;
  hasMoreArtworks?: boolean;
  /** How many photos to seed the album with on first render. Defaults to
   *  CHUNK_SIZE — enough to fill above-the-fold; the IntersectionObserver
   *  takes over for everything else. Callers with a larger SSR window
   *  (e.g. the home page that ships 80 items in the initial RSC payload)
   *  can override to render the full payload immediately. */
  initialSeed?: number;
  targetRowHeight?: RowHeight;
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
// 10 photos at our 220-260 px target row heights and 2-5 columns work
// out to ~600-1300 px of added height, which is comfortably larger than
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
  // is the parent's last-known truth; this captures the moment the
  // server itself reported `hasMore: false`, so we stop re-firing the
  // fetch before the parent's own state has caught up. A failed or
  // aborted request must never set it — that would latch infinite
  // scroll off for the lifetime of the component over one blip.
  const [serverExhausted, setServerExhausted] = useState(false);

  // Re-seeding on a wholesale set swap (different scope / filter / sort)
  // is the CALL SITE's job: render `<ArtworkGallery key={generation} …>`
  // so this component remounts and the useState initializers run afresh.
  // The key must change in the same commit as `artworks`, or the remount
  // seeds from the previous set (see useArtworkPagination's generation).
  // A key on a div rendered in here would not do it — `displayed`,
  // `serverExhausted` and `containerWidth` all live above that div and
  // would survive the subtree remount with stale contents.

  const hasMoreLocal = displayed.length < photos.length;
  const hasMoreServer = hasMoreArtworks && !!loadMoreArtworks && !serverExhausted;
  const hasMore = hasMoreLocal || hasMoreServer;

  // Mirror `loadMore` + `hasMore` into refs so the back-flip hook can
  // chase a tile through additional pagination calls without making the
  // popstate listener re-attach on every render.
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

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
      const result = await loadMoreArtworks();
      // null = coalesced, aborted, or the fetch threw. Nothing was
      // learned about the end of the list, so leave the sentinel mounted
      // and let the next intersection retry.
      if (!result) return;
      // Only the server's own answer retires the sentinel. An empty
      // `added` on its own just means the page was all duplicates.
      if (!result.hasMore) setServerExhausted(true);
      if (result.added.length === 0) return;
      setDisplayed((prev) => [...prev, ...result.added.map((a) => toGalleryPhoto(a, activeScope))]);
    } finally {
      // Short debounce so a rapid burst of IO callbacks (the sentinel
      // briefly oscillating across the rootMargin boundary) coalesces to
      // a single load. Matches ricos.site's InfiniteScrollGallery.
      setTimeout(() => {
        loadingRef.current = false;
      }, 100);
    }
  }, [photos, hasMoreArtworks, loadMoreArtworks, activeScope]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  useArtworkBackFlip({
    expand: () => loadMoreRef.current(),
    canExpand: () => hasMoreRef.current,
  });

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

  if (artworks.length === 0) {
    return <div className="py-16 text-center text-[var(--muted-foreground)]">No works.</div>;
  }

  return (
    <div>
      <ArtworkRows photos={displayed} targetRowHeight={targetRowHeight} />
      {hasMore && <div ref={sentinelRef} aria-hidden style={{ width: 1, height: 1 }} />}
      {!hasMore && (
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">— end —</div>
      )}
    </div>
  );
}

// Target row height, in absolute px, as a function of container width. On a wide container it only sets
// how tall a row looks; on a phone it is what decides how many works
// land in a row, because the row solver minimises (rowHeight - target)²
// per row and a k-work row on a W-wide container is W / Σaspect tall.
// At the old 160 the cheapest partition of a 343 px container (a
// 375 px phone) was three or four across — a 126 px median tile, with
// tall works like Chinese hanging scrolls squeezed down to 32 px. At
// 240 a pair of portraits (h ≈ 210, so 168 px each) or a single
// landscape beats any three-across row, so tiles come out at roughly
// 1.8x the area and the worst scroll renders ~51 px. Fewer works per
// screen, but legible ones, which is the right trade for a gallery.
//
// Deliberately *above* the 640-1024 band: the target only does this
// job while the container is narrow enough for it to change the row
// count at all, and a tablet is already 3-4 across at 220.
export const DEFAULT_TARGET_ROW_HEIGHT = (w: number) => (w < 640 ? 240 : w < 1024 ? 220 : 260);

// Callback ref + the measured width of the node it is attached to, null
// until the ref has attached (SSR and the first client pass).
//
// <ArtworkRows> passes the width as each chunk's
// `defaultContainerWidth`. Without this, every NEW chunk added during
// scroll first paints at the static `defaultContainerWidth={1200}`,
// then re-paints once its internal ResizeObserver measures the actual
// width — a one-frame layout shift per chunk. When the user scrolls
// fast the cumulative shift across several batches is the "jump" you
// see. The ref runs during commit — before the first browser paint —
// so every chunk renders with the correct width from frame one.
//
// This is a *callback* ref rather than a useRef + useLayoutEffect pair,
// and that is load-bearing: the measured div is not in the tree on
// every render of the caller (<ArtworkGallery> returns early on an
// empty list, the timeline swaps a placeholder for the rows once a
// decade's works land). An effect with `[]` deps can fire
// while there is nothing to measure and then never run again, pinning
// every chunk to the 1200 fallback — and if the node is later replaced,
// the ResizeObserver stays attached to a detached one, so a rotate
// keeps declaring the stale width in `sizes` while the album
// re-solves at the new one, i.e. blurry tiles. React invokes a callback
// ref once per node identity, so attachment and re-attachment are both
// automatic. React 19 runs the returned cleanup when the node goes
// away, which is where the observer is disconnected.
//
// Timing is unchanged: refs attach during commit, before layout
// effects, so the measurement still lands before the first paint.
export function useContainerWidth() {
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    // React only skips the legacy detach call (`ref(null)`) when the
    // callback returned a cleanup function — the no-ResizeObserver
    // branch below returns nothing, so null still arrives here.
    if (!node) return;
    const measure = () => {
      const w = Math.round(node.getBoundingClientRect().width);
      if (w > 0) setContainerWidth(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, containerWidth] as const;
}

const ROW_SPACING_PX = 6;
// Cap maxPhotos so the DP solver never tries to combine all 10 chunk
// photos into a single row when their aspects let it — keeps tile sizes
// within a sane band.
const MAX_PHOTOS_PER_ROW = 8;
// A chunk too small to fill even one row (a decade with one work, the
// tail of a short list) is otherwise stretched to the full container
// width: a lone portrait on a 1248 px desktop came out ~2,400 px tall.
// react-photo-album caps such a chunk's container width so its single
// row is at most this multiple of the target height.
const SINGLE_ROW_MAX_SCALE = 1.5;

type RowHeight = number | ((width: number) => number);

function resolveRowHeight(targetRowHeight: RowHeight, width: number): number {
  return typeof targetRowHeight === "function" ? targetRowHeight(width) : targetRowHeight;
}

// Both the target and the constraints are resolved from the *gallery's*
// width and handed to react-photo-album as plain values. Given functions,
// it calls them with the album's own measured width, which for a capped
// chunk is the capped width: a lone desktop portrait then reads as a
// phone-width album, picks up the phone target, and widens its own cap.
function rowConstraints(target: number) {
  return { maxPhotos: MAX_PHOTOS_PER_ROW, singleRowMaxHeight: target * SINGLE_ROW_MAX_SCALE };
}

/** One chunk of <ArtworkRows> as geometry only: the chunk's width (less
 *  than the container when the single-row cap kicks in) and each row's
 *  height. */
export type ArtworkRowsChunk = { width: number; rowHeights: number[] };

/** The layout <ArtworkRows> will render for works with these aspect
 *  ratios (width / height, in order) — same chunking, same solver, same
 *  constraints — for a placeholder that has to reserve the exact height
 *  before the works themselves arrive. */
export function artworkRowsLayout(
  aspects: readonly number[],
  containerWidth: number,
  targetRowHeight: RowHeight = DEFAULT_TARGET_ROW_HEIGHT,
): ArtworkRowsChunk[] {
  const target = resolveRowHeight(targetRowHeight, containerWidth);
  const { maxPhotos, singleRowMaxHeight } = rowConstraints(target);
  return chunk([...aspects], CHUNK_SIZE).map((group) => {
    // Mirrors react-photo-album's resolveRowsProps: the cap is a
    // max-width on the album container, so the solver runs at that width.
    const singleRowWidth = Math.floor(
      group.reduce((sum, aspect) => sum + aspect * singleRowMaxHeight, 0) +
        ROW_SPACING_PX * (group.length - 1),
    );
    const width = singleRowWidth > 0 ? Math.min(containerWidth, singleRowWidth) : containerWidth;
    const layout = computeRowsLayout(
      group.map((aspect) => ({ src: "", width: aspect, height: 1 })),
      ROW_SPACING_PX,
      0,
      width,
      target,
      undefined,
      maxPhotos,
    );
    const rowHeights = layout?.tracks.map((track) => track.photos[0]?.height ?? 0) ?? [];
    return { width, rowHeights };
  });
}

/** Chunked justified rows — the one layout every artwork list uses.
 *  Callers own which photos are shown (pagination, lazy decades); this
 *  owns how they are packed. */
export function ArtworkRows({
  photos,
  targetRowHeight = DEFAULT_TARGET_ROW_HEIGHT,
}: {
  photos: GalleryPhoto[];
  targetRowHeight?: RowHeight;
}) {
  // Chunk into independent albums. Index-based split → chunk identity
  // stable across re-renders. New batches grow the tail; existing
  // chunks never recompute their row layout.
  const chunks = useMemo(() => chunk(photos, CHUNK_SIZE), [photos]);

  const [galleryRef, containerWidth] = useContainerWidth();
  const initialContainerWidth = containerWidth ?? 1200;
  const target = resolveRowHeight(targetRowHeight, initialContainerWidth);
  const constraints = useMemo(() => rowConstraints(target), [target]);

  // The container width, restated for the browser's variant picker.
  // react-photo-album turns `sizes` into a per-tile
  // `calc((<size> - gaps) / <ratio>)`, where <ratio> is the very same
  // containerWidth/photoWidth ratio its CSS uses to lay the tile out —
  // so the declared width equals the rendered width exactly, as long as
  // <size> really is the container's width.
  //
  // The "640px" this used to pass was a hardcoded guess that held on no
  // viewport. On a 375 px phone the container is 343 px, so every tile
  // declared 1.87x its true width and at DPR 2 the browser climbed a
  // rung of the ladder: 1.9 MB served where 735 KB of pixels were used,
  // measured over 30 tiles. On desktop the same constant *under*-states
  // the container (640 vs 1248) and picks needlessly soft variants.
  //
  // Before the ref has measured — SSR, and the first client render pass
  // — there is no pixel number to use, so describe the container in CSS
  // and let the browser evaluate it. Every caller wraps the gallery in
  // `mx-auto max-w-{6,7}xl px-4`, i.e. min(100vw - 32px, 1248px). That
  // base is exact below the max-width (every phone and tablet) and
  // over-states a wide desktop max-w-6xl page by 11% — well under one
  // rung.
  //
  // The base being right does NOT make the server-rendered hint right,
  // and the win measured above is a post-hydration one. The <ratio> in
  // that calc() comes from the layout react-photo-album actually solved,
  // and on the server it solves at `defaultContainerWidth` 1200 with
  // rowHeight 260 — a multi-photo *desktop* row. So the markup a 375 px
  // phone receives divides the correct min(100vw - 32px, 1248px) base by
  // a desktop ratio of ~4, and the preload scanner sees ~86 px where the
  // hydrated tile renders at ~343 px. That error is in the *under*-fetch
  // direction: the scanner may pick a rung too soft, and the browser
  // re-runs candidate selection when hydration swaps in the measured
  // `sizes` (candidate selection only ever climbs, never downgrades), so
  // the cost is a possible second, larger fetch for above-the-fold
  // tiles rather than a permanently blurry one. Fixing it properly means
  // getting the *solved row* right on the server too, which needs the
  // container width at render time (a client hint or a caller-supplied
  // width), not a better `sizes` string.
  //
  // Dropping the prop is not the cheap way out: react-photo-album then
  // defaults to `${photoWidth / containerWidth * 100}vw`, which measures
  // the tile against the viewport rather than the container and so
  // over-states it by the page's gutters. (It also always supplies a
  // `sizes`, which is why the render callback's `props.sizes ?? …`
  // fallback below never actually fires.)
  const albumSizes = useMemo(
    () => ({ size: containerWidth ? `${containerWidth}px` : "min(100vw - 32px, 1248px)" }),
    [containerWidth],
  );

  return (
    <div ref={galleryRef}>
      {chunks.map((group, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: chunks are append-only; index is stable
          key={i}
          className="mb-1.5"
        >
          <RowsPhotoAlbum
            photos={group}
            targetRowHeight={target}
            spacing={ROW_SPACING_PX}
            // Pre-measured from the gallery container (see the
            // callback ref above). Falls back to 1200 only on the very
            // first SSR render, before the ref has attached.
            defaultContainerWidth={initialContainerWidth}
            sizes={albumSizes}
            rowConstraints={constraints}
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
              // Pass the rendered cell dimensions (in CSS px) from the
              // row solver as the <img>'s width/height attrs. Matches
              // ricos.site's CustomImageRenderer — gives the browser
              // exact pixel space to reserve, instead of the intrinsic
              // source dimensions (e.g. 4096×5120) it would have to
              // scale via aspect-ratio. Layout reservation is identical
              // for the common case but avoids a class of edge-case
              // re-flows when the browser swaps the layout-aspect for
              // the loaded image's natural-aspect during decoding.
              image: (props, { photo, width: renderedWidth, height: renderedHeight }) => {
                const p = photo as GalleryPhoto;
                return (
                  <ResponsiveImage
                    objectKey={p.src}
                    variantWidths={p.variantWidths}
                    alt={p.alt ?? ""}
                    srcWidth={renderedWidth}
                    srcHeight={renderedHeight}
                    sizes={props.sizes ?? `${Math.ceil(renderedWidth)}px`}
                    loading="lazy"
                    dominantColor={p.dominantColor}
                    style={{ width: "100%", height: "auto" }}
                  />
                );
              },
            }}
          />
        </div>
      ))}
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
  const transitionNav = useTransitionNav();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const img = e.currentTarget.querySelector("img");
    transitionNav(e, photo.href, {
      vtElement: img,
      vtName: artworkHeroVtName(photo.key),
    });
  };
  return (
    <>
      <Link
        {...rest}
        {...handlers}
        href={photo.href}
        onClick={onClick}
        aria-label={photo.alt}
        className={className}
        data-artwork-id={photo.key}
      >
        {children}
      </Link>
      {portal}
    </>
  );
}
