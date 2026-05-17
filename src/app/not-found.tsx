import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:py-16">
      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl">Page not found</h1>
      </header>

      <div className="space-y-6 text-[var(--foreground)] leading-relaxed">
        <p>
          That page is not here. Either the URL is wrong, or this artwork has been removed or
          renamed.
        </p>

        <ul className="space-y-2">
          <li>
            <Link
              href="/"
              className="rounded-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Back to the gallery
            </Link>
          </li>
          <li>
            <Link
              href="/artists"
              className="rounded-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Browse artists
            </Link>
          </li>
          <li>
            <Link
              href="/about"
              className="rounded-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              About this site
            </Link>
          </li>
        </ul>

        <p className="text-sm text-[var(--muted-foreground)]">
          If you arrived from a working link elsewhere, please let me know via a{" "}
          <a
            href={`${GITHUB_URL}/issues/new`}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            GitHub issue
          </a>
          .
        </p>
      </div>
    </div>
  );
}
