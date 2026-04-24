import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  TWITTER_HANDLE,
  heroArtwork,
  jsonLdScriptProps,
  ogImagesForArtwork,
  websiteJsonLd,
} from "@/lib/seo";

const hero = heroArtwork();
const defaultOgImages = ogImagesForArtwork(hero);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Rico Trebeljahr" }],
  creator: "Rico Trebeljahr",
  publisher: "Rico Trebeljahr",
  keywords: [
    "public domain art",
    "art gallery",
    "paintings",
    "Wikimedia Commons",
    "natural history illustration",
    "art history",
    "impressionism",
    "ukiyo-e",
    "Audubon",
    "Haeckel",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: defaultOgImages,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: defaultOgImages,
    ...(TWITTER_HANDLE ? { creator: TWITTER_HANDLE, site: TWITTER_HANDLE } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  category: "art",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Site-level structured data. Per-page pages can emit additional
            JSON-LD blocks for their specific entities (VisualArtwork, Person). */}
        <script {...jsonLdScriptProps(websiteJsonLd())} />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-serif text-lg tracking-wide hover:opacity-70">
              Collection of Beauty
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]">
                Gallery
              </Link>
              <Link href="/timeline" className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]">
                Timeline
              </Link>
              <Link href="/artists" className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]">
                Artists
              </Link>
              <Link href="/lineage" className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]">
                Lineage
              </Link>
              <Link href="/gallery-3d" className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)]">
                3D Room
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mt-16 border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted-foreground)]">
          All works shown are in the public domain or openly licensed. Metadata sourced from
          Wikimedia Commons.
        </footer>
      </body>
    </html>
  );
}
