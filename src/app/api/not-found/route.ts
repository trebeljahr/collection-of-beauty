import { TYPO_TARGETS } from "@/lib/not-found-index";
import { type NotFoundResponse, suggestFor } from "@/lib/not-found-match";

/** Longer than any real path on the site. Caps the matcher's work on
 *  junk URLs from scanners. */
const MAX_PATH_LENGTH = 300;

/**
 * Backs the 404 page's "Did you mean …?": given the path that failed,
 * the one page it misspells, if any (see `suggestFor`). The 404 page is
 * static and calls this from the browser, since a not-found boundary is
 * never handed the URL it was rendered for.
 */
export function GET(request: Request) {
  const path = (new URL(request.url).searchParams.get("path") ?? "").slice(0, MAX_PATH_LENGTH);
  const body: NotFoundResponse = { suggestion: path ? suggestFor(TYPO_TARGETS, path) : null };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
