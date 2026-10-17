import redirectsJson from "@/data/redirects.json";
import { artworks, getArtist, getArtwork } from "@/lib/data";
import {
  artistRedirectIn,
  artworkRedirectIn,
  type RedirectIndex,
  type RedirectTarget,
} from "@/lib/redirect-match";

export type { RedirectTarget } from "@/lib/redirect-match";

/** The catalogue as `redirect-match.ts` sees it. Server-only: it reads the
 *  full catalogue. The browser builds the same index from
 *  /data/not-found.json (src/lib/static-data/not-found.ts). */
export const serverRedirectIndex: RedirectIndex = {
  hasArtwork: (id) => getArtwork(id) != null,
  hasArtist: (slug) => getArtist(slug) != null,
  folderPrefixes: [...new Set(artworks.map((a) => `${a.folder}-`))],
  renames: redirectsJson as RedirectIndex["renames"],
};

export function artworkRedirect(id: string): RedirectTarget | null {
  return artworkRedirectIn(serverRedirectIndex, id);
}

export function artistRedirect(slug: string): RedirectTarget | null {
  return artistRedirectIn(serverRedirectIndex, slug);
}
