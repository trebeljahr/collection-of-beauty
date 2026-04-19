"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { RowsPhotoAlbum } from "react-photo-album";
import InfiniteScroll from "react-photo-album/scroll";
import "react-photo-album/rows.css";
import { assetUrl } from "@/lib/utils";
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
    src: assetUrl(a.objectKey),
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
  /** Key that changes when the parent filters/sort change — forces a full
   *  remount so the scroller's internal cursor resets to 0. */
  resetKey?: string;
  targetRowHeight?: number | ((width: number) => number);
};

export function ArtworkGallery({
  artworks,
  pageSize = 40,
  resetKey,
  targetRowHeight,
}: Props) {
  const photos = useMemo(() => artworks.map(toGalleryPhoto), [artworks]);

  const fetchPage = useCallback(
    async (index: number): Promise<GalleryPhoto[] | null> => {
      const start = index * pageSize;
      if (start >= photos.length) return null;
      return photos.slice(start, start + pageSize);
    },
    [photos, pageSize],
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
        }}
      />
    </InfiniteScroll>
  );
}
