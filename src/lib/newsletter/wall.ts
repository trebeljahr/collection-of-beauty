import { createHash } from "node:crypto";
import { displayTitle } from "@/lib/artwork-format";
import { getArtwork } from "@/lib/data";
import { fallbackVariant, publicVariantUrl } from "@/lib/utils";
import { loadEditions } from "./editions";
import type { Edition } from "./types";
import {
  type HangLayout,
  hangLayout,
  WALL_LAYOUT_VERSION,
  type WallPalette,
  wallBaseColour,
  wallPalette,
} from "./wall-layout";

export type WallWork = {
  id: string;
  title: string;
  artist: string | null;
  /** Public CDN URL the image route downloads and scales into the frame. */
  sourceUrl: string;
};

export type EditionWall = {
  /** Issue order, as in the frontmatter. `layout.frames[n].index` points here. */
  works: WallWork[];
  layout: HangLayout;
  palette: WallPalette;
  /** Hash of everything that changes the picture; the URL's cache key. */
  version: string;
  alt: string;
};

/**
 * Resolve an edition's wall: which works hang where, and on what colour.
 * The cover hangs in the middle when it is one of the five works;
 * otherwise the first work does.
 */
export function resolveEditionWall(edition: Edition): EditionWall {
  const artworks = edition.artworks.map((entry, i) => {
    const artwork = getArtwork(entry.id);
    if (!artwork) {
      throw new Error(
        `Edition ${edition.fileSlug}: artworks[${i}] references unknown id "${entry.id}".`,
      );
    }
    return artwork;
  });

  const coverId =
    edition.cover && "artworkId" in edition.cover ? edition.cover.artworkId : undefined;
  const centreIndex = Math.max(
    0,
    artworks.findIndex((a) => a.id === coverId),
  );

  const layout = hangLayout(
    artworks.map((a) => (a.width && a.height ? a.width / a.height : 1)),
    centreIndex,
  );
  const base = editionWallBase(edition);

  const works = artworks.map((a) => {
    const { width, format } = fallbackVariant(a.variantWidths);
    return {
      id: a.id,
      title: displayTitle(a),
      artist: a.artist,
      sourceUrl: publicVariantUrl(a.objectKey, width, format),
    };
  });

  const version = createHash("sha256")
    .update(JSON.stringify([WALL_LAYOUT_VERSION, base, layout, works.map((w) => w.sourceUrl)]))
    .digest("hex")
    .slice(0, 12);

  return {
    works,
    layout,
    palette: wallPalette(base),
    version,
    alt: `The five works in this issue: ${works
      .map((w) => (w.artist ? `${w.title} by ${w.artist}` : w.title))
      .join("; ")}.`,
  };
}

const wallBaseCache = new Map<string, string>();

/**
 * The edition's wall colour. Depends on the issue before it, which must
 * not share the colour, so this walks back through the archive. Drafts
 * count: they are the issues that will go out next.
 */
function editionWallBase(edition: Edition): string {
  const cached = wallBaseCache.get(edition.fileSlug);
  if (cached) return cached;
  const previous = loadEditions()
    .filter((e) => e.number < edition.number)
    .at(-1);
  const base = wallBaseColour(
    edition.artworks.map((entry) => getArtwork(entry.id)?.colorBuckets ?? null),
    edition.number,
    edition.wall,
    previous && editionWallBase(previous),
  );
  wallBaseCache.set(edition.fileSlug, base);
  return base;
}

/** Absolute URL of the wall image, versioned so a changed wall is a new URL. */
export function editionWallUrl(siteUrl: string, edition: Edition, wall: EditionWall): string {
  return `${siteUrl.replace(/\/$/, "")}/newsletter/${edition.fileSlug}/wall.jpg?v=${wall.version}`;
}
