export type ArtworkAltLike = {
  title: string;
  englishTitle?: string | null;
  artist: string | null;
  year: number | null;
};

/** Render-priority title: prefer the curator-supplied English fallback
 *  when present (for romaji stubs and non-Latin originals), otherwise the
 *  source title. Single source of truth for "what string do we show?" so
 *  the gallery tile, timeline, lightbox, plaque, and `<title>` agree. */
export function displayTitle(artwork: { title: string; englishTitle?: string | null }): string {
  return artwork.englishTitle?.trim() || artwork.title;
}

/** Alt text for an artwork's <img>. Title alone leaves screen readers and
 *  image-search indexes guessing about authorship; appending the artist
 *  (when known) and year gives the same caption a sighted visitor sees on
 *  the plaque. Used wherever a painting is rendered as an <img alt=...>. */
export function artworkAlt(artwork: ArtworkAltLike): string {
  const t = displayTitle(artwork);
  const head = artwork.artist ? `${t} by ${artwork.artist}` : t;
  return artwork.year != null ? `${head}, ${artwork.year}` : head;
}
