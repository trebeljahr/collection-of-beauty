import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundWall } from "@/components/not-found-wall";
import { GITHUB_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const LINK =
  "rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/**
 * Static shell. Everything that depends on the URL — the path in the
 * frame, the "did you mean" match, the work on the wall — is filled in
 * by <NotFoundWall> in the browser. Renamed ids and near-miss spellings
 * of /artwork and /artist URLs never get here: those pages redirect
 * first (src/lib/redirects.ts).
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-4 md:pt-16">
      <NotFoundWall />

      <nav
        aria-label="Elsewhere on the site"
        className="mt-14 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[var(--muted-foreground)]"
      >
        <Link href="/" className={LINK}>
          Back to the gallery
        </Link>
        <Link href="/artists" className={LINK}>
          Browse artists
        </Link>
        <Link href="/about" className={LINK}>
          About this site
        </Link>
      </nav>
      <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
        If you arrived from a working link elsewhere, please let me know via a{" "}
        <a href={`${GITHUB_URL}/issues/new`} target="_blank" rel="noopener" className={LINK}>
          GitHub issue
        </a>
        .
      </p>
    </div>
  );
}
