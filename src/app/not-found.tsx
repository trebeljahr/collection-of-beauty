import type { Metadata } from "next";
import { NotFoundWall } from "@/components/not-found-wall";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * Static shell. Everything that depends on the URL — the path in the
 * frame, the "did you mean" match, the work on the wall — is filled in
 * by <NotFoundWall> in the browser. Renamed ids and near-miss spellings
 * of /artwork and /artist URLs never get here: those pages redirect
 * first (src/lib/redirects.ts).
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 pb-16 md:pt-16">
      <NotFoundWall />
    </div>
  );
}
