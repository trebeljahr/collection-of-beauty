"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import InfiniteScroll from "react-photo-album/scroll";
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
};

// The row solver uses `width / height` as the photo aspect and packs
// rows to minimise (commonHeight − targetRowHeight)². Catalogue
// outliers like Chinese handscrolls reach 48:1 (the 22517×470 "Ten
// Thousand Miles of the Yangtze River") which forces the solver to
// either put the panorama on its own row at ~5 px tall or pair it
// with another photo and produce a degenerate row that leaves visible
// gaps. The artwork pages still get the real pixel dimensions via
// `srcWidth`/`srcHeight`; only the tile aspect used for layout is
// clamped. Tiles end up object-fit:cover-cropped to the clamped
// rectangle in the gallery card, which is the same treatment every
// other thumbnail gets.
const MAX_TILE_ASPECT = 3.5;
const MIN_TILE_ASPECT = 1 / 3;

function clampTileDims(width: number, height: number): { width: number; height: number } {
  if (!width || !height) return { width: 800, height: 1000 };
  const aspect = width / height;
  if (aspect > MAX_TILE_ASPECT) return { width: Math.round(height * MAX_TILE_ASPECT), height };
  if (aspect < MIN_TILE_ASPECT) return { width, height: Math.round(width / MIN_TILE_ASPECT) };
  return { width, height };
}

export function toGalleryPhoto(a: ArtworkListing, scope: Scope | null = null): GalleryPhoto {
  const { width, height } = clampTileDims(a.width ?? 800, a.height ?? 1000);
  return {
    src: a.objectKey,
    variantWidths: a.variantWidths,
    width,
    height,
    key: a.id,
    alt: artworkAlt(a),
    href: artworkHref(a.id, scope),
    title: displayTitle(a),
    artist: a.artist,
    year: a.year,
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
  const seed = useMemo(() => photos.slice(0, initialSeed), [photos, initialSeed]);

  const fetchPage = useCallback(
    async (index: number): Promise<GalleryPhoto[] | null> => {
      const start = initialSeed + index * pageSize;
      const localPage = photos.slice(start, start + pageSize);
      if (localPage.length > 0) return localPage;
      if (!hasMoreArtworks || !loadMoreArtworks) return null;

      const nextArtworks = await loadMoreArtworks();
      if (nextArtworks.length === 0) return null;
      return nextArtworks.map((a) => toGalleryPhoto(a, activeScope));
    },
    [photos, pageSize, initialSeed, hasMoreArtworks, loadMoreArtworks, activeScope],
  );

  const rowHeight = targetRowHeight ?? ((w: number) => (w < 640 ? 160 : w < 1024 ? 220 : 260));

  if (artworks.length === 0) {
    return <div className="py-16 text-center text-[var(--muted-foreground)]">No works.</div>;
  }

  return (
    <InfiniteScroll
      key={resetKey ?? "all"}
      photos={seed}
      fetch={fetchPage}
      // Solve a single row layout across every fetched batch — without this,
      // InfiniteScroll renders one RowsPhotoAlbum per batch and each batch
      // ends with an unjustified last row, producing a visible stair-step
      // at every page boundary. Per-tile offscreen virtualisation still
      // applies via the library's `track` render prop.
      singleton
      // Trigger the next-batch fetch well before the trailing edge of
      // the currently-loaded photos can enter the viewport. With
      // `singleton` mode the album's literal "last row" is the moving
      // edge of fetched-but-not-yet-justified photos; if that row
      // becomes visible before the next batch lands, the row solver
      // hasn't seen enough photos to fill it, and the row renders
      // un-justified — leaving the gap that prompted this comment.
      // Matching offscreenRootMargin keeps prefetch and recycle
      // windows symmetric.
      fetchRootMargin="2400px"
      offscreenRootMargin="2400px"
      loading={
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">Loading more…</div>
      }
      finished={
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">— end —</div>
      }
    >
      <RowsPhotoAlbum
        photos={[]}
        targetRowHeight={rowHeight}
        spacing={6}
        sizes={{ size: "640px" }}
        // Forbid single-photo rows. They show up for two distinct
        // reasons and both look broken:
        //   1. An aspect-ratio outlier (e.g. a Chinese handscroll the
        //      clamp above missed) forces the solver to give it its
        //      own row at a tiny height.
        //   2. The trailing edge of the loaded set, where the solver
        //      hasn't seen enough photos to combine the last one with
        //      neighbours.
        // Capping maxPhotos keeps the DP solver's branching factor
        // bounded as the singleton album grows past ~1000 photos.
        rowConstraints={{ minPhotos: 2, maxPhotos: 8 }}
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
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            );
          },
        }}
      />
    </InfiniteScroll>
  );
}
