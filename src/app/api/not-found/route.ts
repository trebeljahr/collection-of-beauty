import { artworkCountFor, labelFor, NOT_FOUND_INDEX, workFor } from "@/lib/not-found-index";
import { matchPath, type NotFoundResponse } from "@/lib/not-found-match";
import { sampleDistinct } from "@/lib/surprise";
import { SURPRISE_POOL } from "@/lib/surprise-pool";

// The random works differ per request, so nothing here is cached.
export const dynamic = "force-dynamic";

/** Works per answer: the one on the wall plus a few for "Show me
 *  another" to swap through before it falls back to /surprise. */
const RANDOM_DECK_SIZE = 6;

/** Longer than any real path on the site. Caps the matcher's work on
 *  junk URLs from scanners. */
const MAX_PATH_LENGTH = 300;

/**
 * Backs the 404 page: given the path that failed, the pages it most
 * likely meant (see `matchPath` for how sure each answer is) and a small
 * deck of random works to hang instead. The 404 page itself stays static
 * and calls this from the browser, since a not-found boundary is never
 * handed the URL it was rendered for.
 */
export function GET(request: Request) {
  const path = (new URL(request.url).searchParams.get("path") ?? "").slice(0, MAX_PATH_LENGTH);
  const result = path ? matchPath(NOT_FOUND_INDEX, path) : null;

  const body: NotFoundResponse = {
    suggestion: result && {
      confidence: result.confidence,
      items: result.hits.map(({ doc }) => ({
        kind: doc.kind,
        href: doc.href,
        label: labelFor(doc),
        count: artworkCountFor(doc),
        work: workFor(doc),
      })),
    },
    random: sampleDistinct(SURPRISE_POOL, RANDOM_DECK_SIZE),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
