import { DEFAULT_SHUFFLE_SEED } from "@/lib/artwork-page-schema";
import { getAllListingsInDefaultOrder, shuffleWithArtistSpread } from "@/lib/artwork-pagination";
import { type ArtworkListing, artworkListings, getArtist } from "@/lib/data";
import { assignEra, getEra } from "@/lib/gallery-eras";
import type { Scope } from "@/lib/scope-href";

// The pure `?from=` helpers live in scope-href.ts so client components can
// reach them without pulling artworks.json into a browser chunk. Re-exported
// here because server code reads the whole scope API from one module.
export { artworkHref, encodeScope, parseScope, type Scope, scopeHref } from "@/lib/scope-href";

const UNDATED_SORT_KEY = Number.MAX_SAFE_INTEGER;

/** Resolve a scope to the ordered slim listing the lightbox / prev-next
 *  should cycle through. Order matches the source page exactly:
 *    gallery → home page default order (shuffle + pinned head)
 *    artist  → artist page (year asc, undated last)
 *    movement → year asc, title tiebreaker (matches sortArtworkListings "year")
 *    decade  → every dated work in year asc, title tiebreaker — spans the
 *              whole timeline so prev/next walks past the entry decade's
 *              boundary into the neighbouring decades. `scope.start` is
 *              the entry anchor used by scopeHref/scopeLabel, not a filter.
 *    era     → seeded artist-spread shuffle (default seed) — matches the
 *              /era/<id> page, which paginates with sort=shuffle. Year
 *              order clumped single-artist cohorts (435 Audubon plates
 *              before any Haeckel on natural-history).
 */
export function resolveScope(scope: Scope): ArtworkListing[] {
  if (scope.kind === "gallery") return getAllListingsInDefaultOrder();
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
  if (scope.kind === "decade") {
    return artworkListings
      .filter((a) => a.year != null)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
  }
  return shuffleWithArtistSpread(
    artworkListings.filter((a) => assignEra(a) === scope.id),
    DEFAULT_SHUFFLE_SEED,
  );
}

/** Human label for the scope, suitable for breadcrumbs / "Back to X"
 *  affordances. Artist name is looked up lazily so a malformed slug
 *  degrades to the raw slug rather than throwing. */
export function scopeLabel(scope: Scope): string {
  if (scope.kind === "gallery") return "gallery";
  if (scope.kind === "artist") return getArtist(scope.slug)?.name ?? scope.slug;
  if (scope.kind === "movement") return scope.name;
  if (scope.kind === "decade") return `${scope.start}s`;
  return getEra(scope.id).title;
}
