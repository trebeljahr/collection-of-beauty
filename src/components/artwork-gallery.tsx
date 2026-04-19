"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { RowsPhotoAlbum } from "react-photo-album";
import InfiniteScroll from "react-photo-album/scroll";
import "react-photo-album/rows.css";
import { assetOriginUrl } from "@/lib/utils";
import type { Artwork } from "@/lib/data";

export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  key: string;
  alt: string;
  href: string;
  title: string;
  artist: string | null;
  year: number | null;
};

export function toGalleryPhoto(a: Artwork): GalleryPhoto {
  return {
    // Pass the compose-internal URL to <Image>; Next's optimizer fetches
    // it server-side and the browser only ever sees /_next/image?... URLs.
    src: assetOriginUrl(a.objectKey),
    width: a.width ?? 800,
    height: a.height ?? 1000,
    key: a.id,
    alt: a.title,
    href: `/artwork/${a.id}`,
    title: a.title,
    artist: a.artist,
    year: a.year,
  };
}

type Props = {
  artworks: Artwork[];
  /** Page size for infinite-scroll materialisation. */
  pageSize?: number;
  /** How many photos to seed the album with on first render. Makes the top
   *  two-to-three screenfuls available instantly, before any fetch fires. */
  initialSeed?: number;
  /** Key that changes when the parent filters/sort change — forces a full
   *  remount so the scroller's internal cursor resets to 0. */
  resetKey?: string;
  targetRowHeight?: number | ((width: number) => number);
};

export function ArtworkGallery({
  artworks,
  pageSize = 40,
  initialSeed = 40,
  resetKey,
  targetRowHeight,
}: Props) {
  const photos = useMemo(() => artworks.map(toGalleryPhoto), [artworks]);
  const seed = useMemo(() => photos.slice(0, initialSeed), [photos, initialSeed]);

  // `fetch(index)` is called by InfiniteScroll when more photos are needed
  // AFTER the seed. index 0 ⇒ first page beyond the seed.
  const fetchPage = useCallback(
    async (index: number): Promise<GalleryPhoto[] | null> => {
      const start = initialSeed + index * pageSize;
      if (start >= photos.length) return null;
      return photos.slice(start, start + pageSize);
    },
    [photos, pageSize, initialSeed],
  );

  const rowHeight =
    targetRowHeight ??
    ((w: number) => (w < 640 ? 160 : w < 1024 ? 220 : 260));

  if (artworks.length === 0) {
    return (
      <div className="py-16 text-center text-[var(--muted-foreground)]">
        No works.
      </div>
    );
  }

  return (
    <InfiniteScroll
      key={resetKey}
      photos={seed}
      fetch={fetchPage}
      fetchRootMargin="1200px"
      offscreenRootMargin="2400px"
      loading={
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">
          Loading more…
        </div>
      }
      finished={
        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">
          — end —
        </div>
      }
    >
      <RowsPhotoAlbum
        photos={[]}
        targetRowHeight={rowHeight}
        spacing={6}
        sizes={{ size: "640px" }}
        render={{
          link: ({ href, children, ...rest }, { photo }) => {
            const p = photo as GalleryPhoto;
            return (
              <Link
                {...rest}
                href={p.href}
                title={`${p.title}${p.artist ? " — " + p.artist : ""}${p.year ? " (" + p.year + ")" : ""}`}
              >
                {children}
              </Link>
            );
          },
          // Route every thumb through next/image so originals are resized
          // and cached (WebP/AVIF) in .next/cache/images/ instead of
          // streaming 2–16 MB JPEGs to the browser.
          image: (_, { photo, width, height }) => {
            const p = photo as GalleryPhoto;
            return (
              <Image
                src={p.src}
                alt={p.alt ?? ""}
                width={width}
                height={height}
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
