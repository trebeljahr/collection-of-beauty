import redirects from "@/data/redirects.json";
import { TYPO_TARGETS } from "@/lib/not-found-index";
import type { NotFoundIndex } from "@/lib/static-data/not-found";

export const dynamic = "force-static";

/** What the 404 page matches a failed URL against in the browser: every
 *  page a typo might have meant, and the renamed ids. */
export function GET() {
  const body: NotFoundIndex = {
    targets: TYPO_TARGETS,
    renames: { artworks: redirects.artworks, artists: redirects.artists },
  };
  return Response.json(body);
}
