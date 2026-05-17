// External links used across the site (GitHub repo, issue templates, etc.)
// and the canonical site origin used by absolute-URL helpers. Kept
// separate from seo.ts so client components can import without dragging
// in the full metadata helpers + the artworks dataset.

const FALLBACK_GITHUB_URL = "https://github.com/trebeljahr/collection-of-beauty";

/**
 * Canonical GitHub repo URL. Override via NEXT_PUBLIC_GITHUB_URL when the
 * project moves; otherwise resolves to the public repo we ship from.
 */
export const GITHUB_URL: string = (() => {
  const explicit = process.env.NEXT_PUBLIC_GITHUB_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return FALLBACK_GITHUB_URL;
})();

/**
 * Canonical origin for absolute URLs (issue-body permalinks, sitemaps,
 * JSON-LD, OG metadata). Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL (explicit, preferred in prod)
 *   2. Hardcoded fallback so local dev, docker, and tests don't crash.
 */
export const SITE_URL: string = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);
  return process.env.NODE_ENV === "production"
    ? "https://beauty.trebeljahr.com"
    : "http://localhost:3547";
})();

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export type SuggestFixInput = {
  id: string;
  title: string;
  artist?: string | null;
  /** Wikimedia Commons file page (or other authoritative source) for the
   *  work. Included in the issue body so the reviewer can cross-check
   *  the metadata claim being corrected against the upstream record. */
  sourceUrl?: string | null;
};

/**
 * Pre-filled "Fix:" issue link for a specific artwork. Used by the 2D
 * /artwork/[id] detail page and the 3D gallery zoom modal so both
 * surfaces land on the same GitHub issue form with the artwork's id,
 * title, artist, source URL, and a permalink back to the live detail
 * page already filled in.
 *
 * Uses encodeURIComponent (spaces → %20) rather than URLSearchParams
 * (spaces → +) so the URL reads cleanly when GitHub displays it on the
 * new-issue form.
 */
export function suggestFixUrl(input: SuggestFixInput): string {
  const { id, title, artist, sourceUrl } = input;
  const detailUrl = `${SITE_URL}/artwork/${id}`;
  const issueTitle = `Fix: ${title}${artist ? ` — ${artist}` : ""}`;

  const lines: string[] = [`**Artwork:** [${title}](${detailUrl})`, `**ID:** \`${id}\``];
  if (artist) lines.push(`**Artist:** ${artist}`);
  if (sourceUrl) lines.push(`**Source:** ${sourceUrl}`);
  lines.push("", "**What's wrong?**", "", "<!-- describe the correction -->");

  const title_ = encodeURIComponent(issueTitle);
  const body_ = encodeURIComponent(lines.join("\n"));
  return `${GITHUB_URL}/issues/new?title=${title_}&body=${body_}`;
}
