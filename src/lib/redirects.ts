import redirectsJson from "@/data/redirects.json";
import { artworks, getArtist, getArtwork } from "@/lib/data";
import { normalizeSegment } from "@/lib/not-found-match";

/**
 * Where an /artwork/<id> or /artist/<slug> URL that names nothing should
 * go instead, checked by those pages just before they give up with a 404.
 *
 * Two kinds of answer. A renamed id (src/data/redirects.json, generated
 * from the catalogue's git history by scripts/build-redirects.ts) is a
 * permanent move: the work lives at the new URL now. A URL that only
 * differs in spelling — case, accents, underscores, a trailing ")" from a
 * chat client, the folder prefix left off — gets a temporary redirect:
 * the right page, without telling anyone that spelling is canonical.
 *
 * Server-only: it reads the full catalogue.
 */

type Redirects = { artworks: Record<string, string>; artists: Record<string, string> };

const REDIRECTS = redirectsJson as Redirects;

const FOLDER_PREFIXES = [...new Set(artworks.map((a) => `${a.folder}-`))];

export type RedirectTarget = { href: string; permanent: boolean };

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function artworkRedirect(id: string): RedirectTarget | null {
  const renamed = REDIRECTS.artworks[id];
  if (renamed && getArtwork(renamed)) return { href: `/artwork/${renamed}`, permanent: true };

  const slug = normalizeSegment(decoded(id));
  if (!slug) return null;
  for (const candidate of [slug, ...FOLDER_PREFIXES.map((prefix) => `${prefix}${slug}`)]) {
    if (candidate !== id && getArtwork(candidate)) {
      return { href: `/artwork/${candidate}`, permanent: false };
    }
    // A misspelt old id: normalise first, then follow the rename.
    const moved = REDIRECTS.artworks[candidate];
    if (moved && getArtwork(moved)) return { href: `/artwork/${moved}`, permanent: false };
  }
  return null;
}

export function artistRedirect(slug: string): RedirectTarget | null {
  const renamed = REDIRECTS.artists[slug];
  if (renamed && getArtist(renamed)) return { href: `/artist/${renamed}`, permanent: true };

  const normalized = normalizeSegment(decoded(slug));
  if (normalized && normalized !== slug && getArtist(normalized)) {
    return { href: `/artist/${normalized}`, permanent: false };
  }
  const moved = REDIRECTS.artists[normalized];
  if (moved && getArtist(moved)) return { href: `/artist/${moved}`, permanent: false };
  return null;
}
