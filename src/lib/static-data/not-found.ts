import { suggestFor, type TypoTarget } from "@/lib/not-found-match";
import {
  artistRedirectIn,
  artworkRedirectIn,
  type RedirectIndex,
  type RedirectTarget,
} from "@/lib/redirect-match";
import { STATIC_DATA } from "./keys";

/** /data/not-found.json: every page a typo might have meant, and the
 *  renamed ids. */
export type NotFoundIndex = {
  targets: readonly TypoTarget[];
  renames: RedirectIndex["renames"];
};

export type NotFoundAnswer = {
  /** A respelt /artwork or /artist URL: where it should have gone. */
  redirect: RedirectTarget | null;
  /** Otherwise the one page the URL misspells, if any. */
  suggestion: { href: string; label: string } | null;
};

function redirectIndexOf(index: NotFoundIndex): RedirectIndex {
  const artworks = new Set<string>();
  const artists = new Set<string>();
  const prefixes = new Set<string>();
  for (const target of index.targets) {
    if (target.href.startsWith("/artwork/")) {
      const id = target.href.slice("/artwork/".length);
      artworks.add(id);
      // keys are [id] or [id, bare]; the prefix is what the bare key drops.
      const bare = target.keys[1];
      if (bare && id.endsWith(bare)) prefixes.add(id.slice(0, id.length - bare.length));
    } else if (target.href.startsWith("/artist/")) {
      artists.add(target.href.slice("/artist/".length));
    }
  }
  return {
    hasArtwork: (id) => artworks.has(id),
    hasArtist: (slug) => artists.has(slug),
    folderPrefixes: [...prefixes],
    renames: index.renames,
  };
}

/** The 404 page's answer for `pathname`, from the static index. */
export function answerNotFound(index: NotFoundIndex, pathname: string): NotFoundAnswer {
  const match = /^\/(artwork|artist)\/([^/]+)\/?$/.exec(pathname);
  if (match) {
    const redirects = redirectIndexOf(index);
    const redirect =
      match[1] === "artwork"
        ? artworkRedirectIn(redirects, match[2])
        : artistRedirectIn(redirects, match[2]);
    if (redirect) return { redirect, suggestion: null };
  }
  return { redirect: null, suggestion: pathname ? suggestFor(index.targets, pathname) : null };
}

let pending: Promise<NotFoundIndex> | null = null;

export function loadNotFoundIndex(): Promise<NotFoundIndex> {
  pending ??= fetch(STATIC_DATA.notFoundIndex).then((res) => {
    if (!res.ok) throw new Error(`${STATIC_DATA.notFoundIndex}: ${res.status}`);
    return res.json() as Promise<NotFoundIndex>;
  });
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
