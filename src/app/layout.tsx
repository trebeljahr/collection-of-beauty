import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Gallery3DProvider } from "@/components/gallery-3d-state";
import { SiteNav } from "@/components/site-nav";
import {
  heroArtwork,
  jsonLdScriptProps,
  ogImagesForArtwork,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  TWITTER_HANDLE,
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Site-level structured data. Per-page pages can emit additional
            JSON-LD blocks for their specific entities (VisualArtwork, Person). */}
        <script {...jsonLdScriptProps(websiteJsonLd())} />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Gallery3DProvider>
          <SiteNav />
          <main>{children}</main>
          <footer className="mt-16 border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted-foreground)]">
            <nav
              aria-label="Footer"
              className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
            >
              <Link href="/about" className="underline hover:text-[var(--foreground)]">
                About
              </Link>
              <Link href="/imprint" className="underline hover:text-[var(--foreground)]">
                Imprint
              </Link>
            </nav>
            <p>
              All works shown are in the public domain or openly licensed. Metadata sourced from
              Wikimedia Commons.
            </p>
            <p className="mt-2 inline-flex items-center justify-center gap-1">
              Made with{" "}
              <svg
                className="heartbeat inline-block h-3 w-3 fill-current text-[#e8839b]"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <title>love</title>
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>{" "}
              by{" "}
              <a
                href="https://portfolio.trebeljahr.com"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-[var(--foreground)]"
              >
                Rico Trebeljahr
              </a>
            </p>
          </footer>
        </Gallery3DProvider>
      </body>
    </html>
  );
}
