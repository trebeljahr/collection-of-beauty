// External links used across the site (GitHub repo, issue templates, etc.).
// Kept separate from seo.ts so client components can import without dragging
// in the full metadata helpers.

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
 * Pre-filled "Fix:" issue link for a specific artwork. Uses encodeURIComponent
 * (spaces → %20) rather than URLSearchParams (spaces → +) so the URL reads
 * cleanly when GitHub displays it on the new-issue form.
 */
export function suggestFixUrl(artworkId: string, artworkTitle: string): string {
  const title = encodeURIComponent(`Fix: ${artworkTitle}`);
  const body = encodeURIComponent(`Artwork ID: ${artworkId}\n\n`);
  return `${GITHUB_URL}/issues/new?title=${title}&body=${body}`;
}
