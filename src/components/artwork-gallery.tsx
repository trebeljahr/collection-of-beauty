"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import InfiniteScroll from "react-photo-album/scroll";
import "react-photo-album/rows.css";
import { useNsfw } from "@/components/nsfw-provider";
import { ResponsiveImage } from "@/components/responsive-image";
import { type Artwork, artworkAlt } from "@/lib/data";

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
  nsfw: boolean;
};

export function toGalleryPhoto(a: Artwork): GalleryPhoto {
  return {
    src: a.objectKey,
    variantWidths: a.variantWidths,
    width: a.width ?? 800,
    height: a.height ?? 1000,
    key: a.id,
    alt: artworkAlt(a),
    href: `/artwork/${a.id}`,
    title: a.title,
    artist: a.artist,
    year: a.year,
    nsfw: a.nsfw === true,
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
  const { mode, hydrated } = useNsfw();
  // First paint must match SSR — `hydrated` is false until the
  // post-mount effect reads localStorage, and we treat the pre-
  // hydration mode as the default ("blur"). On "hide", drop the
  // photo from the album entirely so layout reflows around the gap.
  const photos = useMemo(() => {
    const all = artworks.map(toGalleryPhoto);
    if (!hydrated) return all;
    if (mode === "hide") return all.filter((p) => !p.nsfw);
    return all;
  }, [artworks, mode, hydrated]);
  const seed = useMemo(() => photos.slice(0, initialSeed), [photos, initialSeed]);

  const fetchPage = useCallback(
    async (index: number): Promise<GalleryPhoto[] | null> => {
      const start = initialSeed + index * pageSize;
      if (start >= photos.length) return null;
      return photos.slice(start, start + pageSize);
    },
    [photos, pageSize, initialSeed],
  );

  const rowHeight = targetRowHeight ?? ((w: number) => (w < 640 ? 160 : w < 1024 ? 220 : 260));

  if (artworks.length === 0) {
    return <div className="py-16 text-center text-[var(--muted-foreground)]">No works.</div>;
  }

  // Toggle changes (especially hide → show) need to remount the
  // infinite scroller so its internal cursor resets and the seed
  // covers the right slice. Combine the user-supplied resetKey with
  // mode so changes to either trigger a fresh mount.
  const remountKey = `${resetKey ?? "all"}|${mode}`;

  return (
    <InfiniteScroll
      key={remountKey}
      photos={seed}
      fetch={fetchPage}
      // Solve a single row layout across every fetched batch — without this,
      // InfiniteScroll renders one RowsPhotoAlbum per batch and each batch
      // ends with an unjustified last row, producing a visible stair-step
      // at every page boundary. Per-tile offscreen virtualisation still
      // applies via the library's `track` render prop.
      singleton
      fetchRootMargin="1200px"
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
                nsfw={p.nsfw && mode === "blur"}
              />
            );
          },
        }}
      />
    </InfiniteScroll>
  );
}
