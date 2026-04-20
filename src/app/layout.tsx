import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collection of Beauty",
  description:
    "A personal interactive gallery of paintings, prints, and natural history illustrations from across the public-domain record.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="font-serif text-lg tracking-wide hover:opacity-70"
            >
              Collection of Beauty
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]"
              >
                Gallery
              </Link>
              <Link
                href="/timeline"
                className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]"
              >
                Timeline
              </Link>
              <Link
                href="/artists"
                className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]"
              >
                Artists
              </Link>
              <Link
                href="/lineage"
                className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]"
              >
                Lineage
              </Link>
              <Link
                href="/gallery-3d"
                className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]"
              >
                3D Room
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mt-16 border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted-foreground)]">
          All works shown are in the public domain or openly licensed.
          Metadata sourced from Wikimedia Commons.
        </footer>
      </body>
    </html>
  );
}
