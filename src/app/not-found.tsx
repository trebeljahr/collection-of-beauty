import type { Metadata } from "next";
import { NotFoundWall } from "@/components/not-found-wall";
import { sampleDistinct } from "@/lib/surprise";
import { SURPRISE_POOL } from "@/lib/surprise-pool";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/** Works per page: the one on the wall plus a few for "Show me another"
 *  to swap through before it falls back to /surprise. */
const RANDOM_DECK_SIZE = 6;

/**
 * The random works are drawn here, so the first one is in the HTML and
 * hangs on first paint. For an unmatched route that happens once, when
 * the page is prerendered, so every visitor sees the same first work
 * until the next deploy; a 404 from /artwork or /artist draws its own.
 * What depends on the URL (the path in the frame, the "did you mean"
 * link) is filled in by <NotFoundWall> in the browser. Renamed ids and
 * respelt /artwork and /artist URLs never get here: those pages
 * redirect first (src/lib/redirects.ts).
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 pb-16 md:pt-16">
      <NotFoundWall deck={sampleDistinct(SURPRISE_POOL, RANDOM_DECK_SIZE)} />
    </div>
  );
}
