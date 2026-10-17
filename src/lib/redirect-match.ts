import { normalizeSegment } from "@/lib/not-found-match";

/**
 * Where an /artwork/<id> or /artist/<slug> URL that names nothing should
 * go instead.
 *
 * Two kinds of answer. A renamed id (src/data/redirects.json, generated
 * from the catalogue's git history by scripts/build-redirects.ts) is a
 * permanent move: the work lives at the new URL now. A URL that only
 * differs in spelling — case, accents, underscores, a trailing ")" from a
 * chat client, the folder prefix left off — gets a temporary redirect:
 * the right page, without telling anyone that spelling is canonical.
 *
 * Pure: the catalogue comes in as a `RedirectIndex`. On the static site
 * the renames are `_redirects` lines (308) and the 404 page runs the
 * spelling half in the browser over /data/not-found.json.
 */

export type RedirectIndex = {
  hasArtwork(id: string): boolean;
  hasArtist(slug: string): boolean;
  /** Every `<folder>-` an artwork id can start with. */
  folderPrefixes: readonly string[];
  renames: { artworks: Record<string, string>; artists: Record<string, string> };
};

export type RedirectTarget = { href: string; permanent: boolean };

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function renamed(map: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function artworkRedirectIn(index: RedirectIndex, id: string): RedirectTarget | null {
  const moved = renamed(index.renames.artworks, id);
  if (moved && index.hasArtwork(moved)) return { href: `/artwork/${moved}`, permanent: true };

  const slug = normalizeSegment(decoded(id));
  if (!slug) return null;
  for (const candidate of [slug, ...index.folderPrefixes.map((prefix) => `${prefix}${slug}`)]) {
    if (candidate !== id && index.hasArtwork(candidate)) {
      return { href: `/artwork/${candidate}`, permanent: false };
    }
    // A misspelt old id: normalise first, then follow the rename.
    const next = renamed(index.renames.artworks, candidate);
    if (next && index.hasArtwork(next)) return { href: `/artwork/${next}`, permanent: false };
  }
  return null;
}

export function artistRedirectIn(index: RedirectIndex, slug: string): RedirectTarget | null {
  const moved = renamed(index.renames.artists, slug);
  if (moved && index.hasArtist(moved)) return { href: `/artist/${moved}`, permanent: true };

  const normalized = normalizeSegment(decoded(slug));
  if (normalized && normalized !== slug && index.hasArtist(normalized)) {
    return { href: `/artist/${normalized}`, permanent: false };
  }
  const next = renamed(index.renames.artists, normalized);
  if (next && index.hasArtist(next)) return { href: `/artist/${next}`, permanent: false };
  return null;
}
