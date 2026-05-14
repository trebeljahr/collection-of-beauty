export type ArtworkAltLike = {
  title: string;
  artist: string | null;
  year: number | null;
};

/** Alt text for an artwork's <img>. Title alone leaves screen readers and
 *  image-search indexes guessing about authorship; appending the artist
 *  (when known) and year gives the same caption a sighted visitor sees on
 *  the plaque. Used wherever a painting is rendered as an <img alt=...>. */
export function artworkAlt(artwork: ArtworkAltLike): string {
  const bits: string[] = [artwork.title];
  if (artwork.artist) bits.push(`by ${artwork.artist}`);
  if (artwork.year != null) bits.push(`(${artwork.year})`);
  return bits.join(" ");
}
