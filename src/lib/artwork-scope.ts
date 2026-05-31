import { type ArtworkListing, artworkListings, getArtist } from "@/lib/data";

export type Scope =
  | { kind: "artist"; slug: string }
  | { kind: "movement"; name: string }
  | { kind: "decade"; start: number };

const UNDATED_SORT_KEY = Number.MAX_SAFE_INTEGER;

/** Parse a `?from=<kind>:<value>` query value. Returns null for any
 *  malformed input so callers can fall back to the global pool. */
export function parseScope(param: string | null | undefined): Scope | null {
  if (!param) return null;
  const colon = param.indexOf(":");
  if (colon <= 0 || colon === param.length - 1) return null;

  const kind = param.slice(0, colon);
  let value: string;
  try {
    value = decodeURIComponent(param.slice(colon + 1));
  } catch {
    return null;
  }
  if (!value) return null;

  if (kind === "artist") return { kind, slug: value };
  if (kind === "movement") return { kind, name: value };
  if (kind === "decade") {
    if (!/^-?\d+$/.test(value)) return null;
    const start = Number.parseInt(value, 10);
    if (!Number.isFinite(start) || start % 10 !== 0) return null;
    return { kind, start };
  }
  return null;
}

/** Inverse of `parseScope`. Returns the raw `?from=` value with the
 *  value half percent-encoded. */
export function encodeScope(scope: Scope): string {
  if (scope.kind === "artist") return `artist:${encodeURIComponent(scope.slug)}`;
  if (scope.kind === "movement") return `movement:${encodeURIComponent(scope.name)}`;
  return `decade:${scope.start}`;
}

/** Resolve a scope to the ordered slim listing the lightbox / prev-next
 *  should cycle through. Order matches the source page exactly:
 *    artist  → artist page (year asc, undated last)
 *    movement → year asc, title tiebreaker (matches sortArtworkListings "year")
 *    decade  → year asc within the bucket (matches timeline-view buckets)
 */
export function resolveScope(scope: Scope): ArtworkListing[] {
  if (scope.kind === "artist") {
    return artworkListings
      .filter((a) => a.artistSlug === scope.slug)
      .sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999));
  }
  if (scope.kind === "movement") {
    return artworkListings
      .filter((a) => a.movement === scope.name)
      .sort(
        (a, b) =>
          (a.year ?? UNDATED_SORT_KEY) - (b.year ?? UNDATED_SORT_KEY) ||
          a.title.localeCompare(b.title),
      );
  }
  return artworkListings
    .filter((a) => a.year != null && Math.floor(a.year / 10) * 10 === scope.start)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
}

/** Human label for the scope, suitable for breadcrumbs / "Back to X"
 *  affordances. Artist name is looked up lazily so a malformed slug
 *  degrades to the raw slug rather than throwing. */
export function scopeLabel(scope: Scope): string {
  if (scope.kind === "artist") return getArtist(scope.slug)?.name ?? scope.slug;
  if (scope.kind === "movement") return scope.name;
  return `${scope.start}s`;
}

/** URL of the page that originated this scope, for "back to source"
 *  affordances. */
export function scopeHref(scope: Scope): string {
  if (scope.kind === "artist") return `/artist/${scope.slug}`;
  if (scope.kind === "movement") return `/timeline?movement=${encodeURIComponent(scope.name)}`;
  return `/timeline#decade-${scope.start}`;
}

/** Build an `/artwork/<id>` href, threading the scope as `?from=` when
 *  present. */
export function artworkHref(id: string, scope: Scope | null): string {
  if (!scope) return `/artwork/${id}`;
  return `/artwork/${id}?from=${encodeScope(scope)}`;
}
