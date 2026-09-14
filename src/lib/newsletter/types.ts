export type EditionArtworkEntry = {
  id: string;
  note?: string;
};

/**
 * Cover image for an edition. Either references an artwork already in
 * the issue (preferred — keeps everything addressable by artwork id) or
 * an explicit url + alt for one-off covers (e.g. a photograph or a
 * composite). Used for OG tags and the archive index card.
 */
export type EditionCover =
  | { artworkId: string; alt?: string; focus?: CoverFocus }
  | { src: string; alt: string; focus?: CoverFocus };

/**
 * The point of the cover, in percent of its width and height, that must
 * stay in frame when the archive card crops it. Becomes the image's
 * `object-position`: a percentage there pins the image point at (x%, y%)
 * to the box point at (x%, y%), so it is inside the crop at any box
 * shape. Unset means centred.
 */
export type CoverFocus = { x: number; y: number };

export type Edition = {
  /** Zero-padded issue number, parsed from the filename prefix. */
  number: number;
  /** Theme portion of the filename, used as the URL slug. */
  themeSlug: string;
  /** Full filename slug, e.g. "0001-spring-light". */
  fileSlug: string;
  /** Display title — what the issue is about. */
  title: string;
  /** Email subject (defaults to title if not set in frontmatter). */
  subject: string;
  /** ISO date string (YYYY-MM-DD). */
  publishedAt: string;
  /** Short summary, used in the archive index and OG description. */
  excerpt: string;
  /** Five artwork ids with optional per-work notes, in editorial order. */
  artworks: EditionArtworkEntry[];
  /** Markdown body — the editorial intro for the issue. */
  body: string;
  /** Frontmatter `draft: true` keeps the edition out of public surfaces. */
  draft: boolean;
  /** Optional editorial tags. */
  tags: string[];
  /**
   * Cover image. If not set, the renderer falls back to the first
   * artwork in `artworks`.
   */
  cover: EditionCover | null;
  /**
   * Estimated reading time, in minutes, derived from the markdown body
   * at parse time. 0 when the body is empty.
   */
  readingTimeMinutes: number;
};
