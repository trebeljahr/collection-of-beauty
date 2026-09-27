import { type ArtworkOrderInput, orderedArtworkListings } from "@/lib/artwork-pagination";
import { getColorBucket } from "@/lib/color-buckets.mjs";
import { type ArtworkListing, getArtist } from "@/lib/data";
import { getEra } from "@/lib/gallery-eras";
import { getPlateSet } from "@/lib/plate-sets";
import type { Scope } from "@/lib/scope-href";
import { timelineListings } from "@/lib/timeline";

// The pure `?from=` helpers live in scope-href.ts so client components can
// reach them without pulling artworks.json into a browser chunk. Re-exported
// here because server code reads the whole scope API from one module.
export {
  artworkHref,
  encodeScope,
  parseScope,
  parseScopeParams,
  type Scope,
  scopeHref,
  scopeSearch,
} from "@/lib/scope-href";

/** Resolve a scope to the ordered slim listing the artwork page's
 *  prev/next and the lightbox cycle through. The order is the source
 *  page's own, because every kind but `decade` goes through the same
 *  `orderedArtworkListings` call that page paginates with (see
 *  `scopeOrderInput`); `decade` is the timeline's list. */
export function resolveScope(scope: Scope): ArtworkListing[] {
  if (scope.kind === "decade") {
    // Every dated work, not just the entry decade's, so prev/next walks
    // across decade boundaries. `scope.start` is the entry anchor used
    // by scopeHref/scopeLabel, not a filter.
    return timelineListings({ query: scope.filter?.q, era: scope.filter?.era });
  }
  return orderedArtworkListings(scopeOrderInput(scope));
}

/** The /api/artworks/page input each scope's landing page renders with:
 *    gallery    → the home grid's search, era and sort; unfiltered, the
 *                 default shuffle with its pinned head
 *    artist     → year ascending, undated last, title as tiebreaker
 *    era        → seeded artist-spread shuffle. Year order clumped
 *                 single-artist cohorts (435 Audubon plates before any
 *                 Haeckel on natural-history).
 *    collection → plate order, the order the book prints them in
 *    color      → strongest-first by how much of the family a work
 *                 carries */
export function scopeOrderInput(scope: Exclude<Scope, { kind: "decade" }>): ArtworkOrderInput {
  if (scope.kind === "gallery") {
    return {
      query: scope.filter?.q,
      era: scope.filter?.era,
      sort: scope.filter?.sort ?? "shuffle",
    };
  }
  if (scope.kind === "artist") return { artistSlug: scope.slug, sort: "year" };
  if (scope.kind === "collection") return { collection: scope.id, sort: "plate" };
  if (scope.kind === "color") return { color: scope.id, sort: "color" };
  return { era: scope.id, sort: "shuffle" };
}

/** Human label for the scope, suitable for breadcrumbs / "Back to X"
 *  affordances. Artist name is looked up lazily so a malformed slug
 *  degrades to the raw slug rather than throwing. */
export function scopeLabel(scope: Scope): string {
  if (scope.kind === "gallery") return "gallery";
  if (scope.kind === "artist") return getArtist(scope.slug)?.name ?? scope.slug;
  if (scope.kind === "decade") return `${scope.start}s`;
  if (scope.kind === "collection") return getPlateSet(scope.id)?.title ?? scope.id;
  if (scope.kind === "color") return getColorBucket(scope.id).label.toLowerCase();
  return getEra(scope.id).title;
}
