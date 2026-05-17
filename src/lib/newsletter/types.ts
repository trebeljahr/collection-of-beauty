export type EditionArtworkEntry = {
  id: string;
  note?: string;
};

/**
 * Parsed shape of a single newsletter edition markdown file in
 * content/newsletter/<NNNN>-<slug>.md.
 *
 * `number` and `themeSlug` are derived from the filename. Everything
 * else comes from frontmatter or the markdown body.
 */
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
};
