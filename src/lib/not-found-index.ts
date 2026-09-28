import { COLLECTIONS } from "@/lib/collections";
import { COLOR_BUCKETS } from "@/lib/color-buckets.mjs";
import { ERA_COVERS } from "@/lib/cover-picks";
import { type ArtworkListing, artists, artworkListings } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { buildMatchIndex, type MatchDoc, type MatchIndex } from "@/lib/not-found-match";

/**
 * The catalogue as the 404 matcher sees it: every artwork, artist, era,
 * colour, collection and top-level page, built once per server process.
 *
 * Server-only. It closes over the full listing array, the same way
 * `surprise-pool.ts` does, and has no business in a client chunk.
 */

/** Top-level pages. `aliases` are whole slugs that name the page
 *  outright ("/3d" is the museum); `words` only feed the fuzzy score. */
const STATIC_PAGES: { href: string; label: string; aliases?: string[]; words?: string }[] = [
  { href: "/artists", label: "Artists", aliases: ["painters"] },
  { href: "/timeline", label: "Timeline", words: "chronology" },
  { href: "/eras", label: "Eras", aliases: ["rooms"] },
  { href: "/collections", label: "Collections", aliases: ["downloads", "plates"] },
  { href: "/colours", label: "Colours", aliases: ["colors", "colour", "color"] },
  {
    href: "/gallery-3d",
    label: "The Museum",
    aliases: ["3d", "museum", "gallery", "3d-gallery", "gallery3d", "3d-museum"],
  },
  { href: "/surprise", label: "Surprise me", aliases: ["random", "surprise-me"] },
  { href: "/play", label: "Slideshow", aliases: ["slideshow", "slides"] },
  { href: "/drops", label: "Newsletter", aliases: ["subscribe", "newsletters"] },
  { href: "/newsletter", label: "Newsletter archive", words: "editions" },
  { href: "/about", label: "About", aliases: ["about-us"] },
  { href: "/press", label: "Press", aliases: ["press-kit", "media"] },
  { href: "/imprint", label: "Imprint", aliases: ["impressum", "legal", "contact"] },
  { href: "/privacy", label: "Privacy", aliases: ["privacy-policy"] },
];

const FOLDER_PREFIXES = [...new Set(artworkListings.map((a) => `${folderOf(a)}-`))];

function folderOf(art: ArtworkListing): string {
  return art.objectKey.slice(0, art.objectKey.indexOf("/"));
}

const listingsById = new Map(artworkListings.map((a) => [a.id, a]));
const listingsByObjectKey = new Map(artworkListings.map((a) => [a.objectKey, a]));

/** The work that stands for a non-artwork page when the 404 hangs it:
 *  an artist's card cover, an era's hand-picked cover, a collection's
 *  first plate. Colours and plain pages have none. */
const REPRESENTATIVE = new Map<string, ArtworkListing>();

function buildDocs(): MatchDoc[] {
  const docs: MatchDoc[] = [];

  for (const art of artworkListings) {
    const prefix = `${folderOf(art)}-`;
    const bare = art.id.startsWith(prefix) ? art.id.slice(prefix.length) : art.id;
    docs.push({
      kind: "artwork",
      href: `/artwork/${art.id}`,
      keys: bare === art.id ? [art.id] : [art.id, bare],
      text: [art.title, art.englishTitle ?? "", art.artist ?? ""],
    });
  }

  for (const artist of artists) {
    const href = `/artist/${artist.slug}`;
    docs.push({ kind: "artist", href, keys: [artist.slug], text: [artist.name] });
    const cover = artist.coverObjectKey ? listingsByObjectKey.get(artist.coverObjectKey) : null;
    if (cover) REPRESENTATIVE.set(href, cover);
  }

  for (const era of ERAS) {
    const href = `/era/${era.id}`;
    docs.push({ kind: "page", href, keys: [era.id], text: [era.title] });
    const cover = listingsById.get(ERA_COVERS[era.id]?.id ?? "");
    if (cover) REPRESENTATIVE.set(href, cover);
  }

  for (const bucket of COLOR_BUCKETS) {
    docs.push({
      kind: "page",
      href: `/colours/${bucket.id}`,
      keys: [bucket.id],
      text: [bucket.label],
    });
  }

  for (const collection of COLLECTIONS) {
    const href = `/collection/${collection.slug}`;
    docs.push({
      kind: "page",
      href,
      keys: [collection.slug],
      text: [collection.title, collection.creator],
    });
    const first = artworkListings.find((a) => folderOf(a) === collection.folder);
    if (first) REPRESENTATIVE.set(href, first);
  }

  for (const page of STATIC_PAGES) {
    docs.push({
      kind: "page",
      href: page.href,
      keys: [page.href.slice(1), ...(page.aliases ?? [])],
      text: [page.label, page.words ?? ""],
    });
  }

  return docs;
}

export const NOT_FOUND_INDEX: MatchIndex = buildMatchIndex(buildDocs(), {
  prefixes: FOLDER_PREFIXES,
});

/** Human label for a matched doc: the artwork or artist lookups happen
 *  here so the API route stays a thin serialiser. */
export function labelFor(doc: MatchDoc): string {
  if (doc.kind === "artwork") {
    const art = listingsById.get(doc.href.slice("/artwork/".length));
    return art ? (art.englishTitle ?? art.title) : doc.href;
  }
  if (doc.kind === "artist") {
    const slug = doc.href.slice("/artist/".length);
    return artists.find((a) => a.slug === slug)?.name ?? doc.href;
  }
  const era = ERAS.find((e) => `/era/${e.id}` === doc.href);
  if (era) return era.title;
  const bucket = COLOR_BUCKETS.find((b) => `/colours/${b.id}` === doc.href);
  if (bucket) return bucket.label;
  const collection = COLLECTIONS.find((c) => `/collection/${c.slug}` === doc.href);
  if (collection) return collection.title;
  return STATIC_PAGES.find((p) => p.href === doc.href)?.label ?? doc.href;
}

/** The work to hang for a matched doc, if it has one. */
export function workFor(doc: MatchDoc): ArtworkListing | null {
  if (doc.kind === "artwork") return listingsById.get(doc.href.slice("/artwork/".length)) ?? null;
  return REPRESENTATIVE.get(doc.href) ?? null;
}

export function artworkCountFor(doc: MatchDoc): number | null {
  if (doc.kind !== "artist") return null;
  const slug = doc.href.slice("/artist/".length);
  return artists.find((a) => a.slug === slug)?.count ?? null;
}
