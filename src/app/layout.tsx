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
              <Link href="/about" className="hover:text-[var(--foreground)] hover:underline">
                About
              </Link>
            </nav>
            <p>
              All works shown are in the public domain or openly licensed. Metadata sourced from
              Wikimedia Commons.
            </p>
            <p className="mt-2">
              © {new Date().getFullYear()} Rico Trebeljahr ·{" "}
              <Link href="/impressum" className="hover:text-[var(--foreground)]">
                Impressum
              </Link>
            </p>
          </footer>
        </Gallery3DProvider>
      </body>
    </html>
  );
}
