import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";
import { Gallery3DProvider } from "@/components/gallery-3d-state";
import { ImageCacheTracker } from "@/components/image-cache-tracker";
import { SiteNav } from "@/components/site-nav";
import {
  jsonLdScriptProps,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  TWITTER_HANDLE,
  websiteJsonLd,
} from "@/lib/seo";

/* Footer nav links. `min-h-11` (44px) is the WCAG 2.5.5 touch-target
   minimum; the text itself stays text-xs, so the padding grows the hit
   area rather than the type. Below `sm:` the `px-2` also replaces the
   row's `gap-x-4` — 8px of padding on each of two neighbours is the same
   16px of visible spacing, but now that space is tappable instead of
   dead. Both end at `sm:`: 2.5.5 is a *touch* criterion, a mouse pointer
   is governed by 2.5.8's 24px, and a six-link row of 44px boxes would
   turn a 16px-tall footer strip into a 44px one for no accessibility
   gain. Above the breakpoint the padding hands the spacing back to the
   nav's `sm:gap-x-4` and the row is byte-for-byte the old one. */
const FOOTER_LINK =
  "inline-flex min-h-11 items-center rounded-sm px-2 underline hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0 sm:px-0";

const plausibleDomain = "beauty.trebeljahr.com";
const plausibleScriptUrl =
  "https://plausible.trebeljahr.com/js/script.file-downloads.hash.outbound-links.pageview-props.revenue.tagged-events.js";

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
    types: { "application/rss+xml": "/rss.xml" },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    // Image comes from src/app/opengraph-image.png (file convention),
    // a 1200x630 PNG composited by scripts/build-marketing-images.mjs
    // (mosaic of six works + wordmark). Alt text in opengraph-image.alt.txt.
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    // Twitter image inherited from the opengraph-image route when no
    // twitter-image file is present, per Next.js metadata conventions.
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* Site-level structured data. Per-page pages can emit additional
            JSON-LD blocks for their specific entities (VisualArtwork, Person). */}
        <script {...jsonLdScriptProps(websiteJsonLd())} />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Script id="plausible-loader" strategy="afterInteractive">
          {`
              (function () {
                var domain = ${JSON.stringify(plausibleDomain)};
                if (location.hostname !== domain) return;
                window.plausible = window.plausible || function() {
                  (window.plausible.q = window.plausible.q || []).push(arguments);
                };
                var script = document.createElement("script");
                script.defer = true;
                script.dataset.domain = domain;
                script.src = ${JSON.stringify(plausibleScriptUrl)};
                document.head.appendChild(script);
              })();
            `}
        </Script>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Gallery3DProvider>
          <ImageCacheTracker />
          <SiteNav />
          <main id="main-content">{children}</main>
          {/* py-2 below `sm:` rather than py-6: on a phone the first row is
              a 44px box around 16px text, so it already carries 14px of its
              own padding. 8px + 14px reproduces the ~24px inset the py-6
              strip had. Above the breakpoint the targets shrink back, so
              the strip needs its own padding again. */}
          {/* Same horizontal safe-area gutter as SiteNav, and for the same
                reason: the footer is rendered here, outside the per-route
                wrapper in src/app/artwork/layout.tsx, so on /artwork —
                which opts into `viewport-fit: cover` — a notch in landscape
                would otherwise sit over the outermost footer links. Bare
                `env()` with a 0px fallback adds nothing anywhere else. */}
          <footer
            style={{
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
            className="mt-16 border-t border-[var(--border)] py-2 text-center text-xs text-[var(--muted-foreground)] sm:py-6"
          >
            {/* No gap and no bottom margin below `sm:` — see FOOTER_LINK:
                there the links' own padding supplies the horizontal
                spacing, and a gap-y on top of 44px rows would balloon the
                wrapped 3-row footer on narrow phones. Both come back at
                `sm:`, where the links drop their padding and their height. */}
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center justify-center sm:mb-2 sm:gap-x-4 sm:gap-y-1"
            >
              <Link href="/about" className={FOOTER_LINK}>
                About
              </Link>
              <Link href="/artists" className={FOOTER_LINK}>
                Browse all artists
              </Link>
              <Link href="/imprint" className={FOOTER_LINK}>
                Imprint
              </Link>
              <Link href="/press" className={FOOTER_LINK}>
                Press
              </Link>
              <Link href="/privacy" className={FOOTER_LINK}>
                Privacy
              </Link>
              <Link href="/rss.xml" className={FOOTER_LINK}>
                RSS
              </Link>
            </nav>
            <p>
              All works shown are in the public domain or openly licensed. Metadata sourced from
              public archives — mostly Wikimedia Commons. Every work links back to its own source.
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
              {/* No px here, unlike the nav links: this anchor sits inline
                  between "by" and the paragraph's own gap-1, so horizontal
                  padding would visibly detach it from "by". Its 84px width
                  already clears the target minimum — only height was short.
                  `-my-3` gives the extra 24px straight back (the paragraph
                  is a row-direction inline-flex, so a block-axis margin
                  shrinks this item's outer height without touching the
                  horizontal gap-1) and the whole thing ends at `sm:`, so
                  the line box is the old one at every width. */}
              <a
                href="https://ricos.site"
                target="_blank"
                rel="noreferrer noopener"
                className="-my-3 inline-flex min-h-11 items-center rounded-sm underline hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:my-0 sm:min-h-0"
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
