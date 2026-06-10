/** Shared `view-transition-name` for the artwork hero / gallery tile
 *  pair. When the user clicks a tile, the gallery applies this name to
 *  the tile image just before navigation; the detail page's hero carries
 *  the same name statically. The browser then animates a FLIP between
 *  the two on `document.startViewTransition`.
 *
 *  Ids encoded so legal-but-css-hostile characters in artwork slugs
 *  (we have lots — see ids like `collection-of-beauty-…`) can't break
 *  the name. Underscores swap for the legal kebab the rest of the
 *  codebase already uses, so the resulting names read cleanly in
 *  DevTools.
 */
export function artworkHeroVtName(id: string): string {
  return `artwork-hero-${id.replace(/[^a-zA-Z0-9-]/g, "_")}`;
}
