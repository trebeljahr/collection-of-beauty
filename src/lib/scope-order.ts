import type { ArtworkOrderFields } from "@/lib/artwork-order";
import type { Scope } from "@/lib/scope-href";

/** The ordering input each scope's landing page renders with:
 *    gallery    → the home grid's search, era and sort; unfiltered, the
 *                 default shuffle with its pinned head
 *    artist     → year ascending, undated last, title as tiebreaker
 *    era        → seeded artist-spread shuffle. Year order clumped
 *                 single-artist cohorts (435 Audubon plates before any
 *                 Haeckel on natural-history).
 *    collection → plate order, the order the book prints them in
 *    color      → strongest-first by how much of the family a work
 *                 carries */
export function scopeOrderFields(scope: Exclude<Scope, { kind: "decade" }>): ArtworkOrderFields {
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
