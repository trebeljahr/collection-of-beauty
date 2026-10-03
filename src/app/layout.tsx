import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { ProjectDonateLink } from "../components/project-donate-link";
import "./globals.css";
import { DonationSupportedTracker } from "@/components/donation-supported-tracker";
import { Gallery3DProvider } from "@/components/gallery-3d-state";
import { ImageCacheTracker } from "@/components/image-cache-tracker";
import { NavigationTracker } from "@/components/navigation-tracker";
import { SiteNav } from "@/components/site-nav";
import { DONATE_URL } from "@/lib/donation-supported";
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
   is governed by 2.5.8's 24px, and a seven-link row of 44px boxes would
   turn a 16px-tall footer strip into a 44px one for no accessibility
   gain. Above the breakpoint the padding hands the spacing back to the
   nav's `sm:gap-x-4` and the row is byte-for-byte the old one. */
const FOOTER_LINK =
  "inline-flex min-h-11 items-center rounded-sm px-2 underline hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0 sm:px-0";

/* Two different names. `plausibleHostname` is the host the loader runs
   on: the production apex only, so dev, localhost and preview hosts send
   nothing (the old host and www 308 to the apex in next.config.mjs, so no
   page renders there). `plausibleSiteId` is the site's id on the Plausible
   dashboard, sent as data-domain; it is still the pre-migration name until
   the site is renamed there. Checking the hostname against the site id is
   what silenced analytics after the 2026-09-13 move. */
const plausibleHostname = "collectionofbeauty.com";
const plausibleSiteId = "beauty.trebeljahr.com";
/* The plain script: page loads and client-side navigations, nothing else.
   No extensions (outbound links, file downloads, custom events), and not
   `hash` either, which would count every #decade-N jump on the timeline as
   a page view. */
const plausibleScriptUrl = "https://plausible.trebeljahr.com/js/script.js";

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
    // (works hung whole beside the title). Alt text in opengraph-image.alt.txt.
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
        <meta name="build-commit" content={process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "development"} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* Site-level structured data. Per-page pages can emit additional
            JSON-LD blocks for their specific entities (VisualArtwork, Person). */}
        <script {...jsonLdScriptProps(websiteJsonLd())} />
      </head>
      {/* Column flex with `main` as the flex-1 item pins the footer to the
          viewport bottom on short pages (e.g. /sub/confirmed) and leaves it
          after the content on long ones. `dvh`, not `screen`: on mobile
          `100vh` is the URL-bar-retracted height, which would push the
          footer below the fold on a page that fits. Page roots carry
          padding, not margins, so the flex item's formatting context
          changes no spacing. */}
      <body className="flex min-h-dvh flex-col antialiased" suppressHydrationWarning>
        <Script id="plausible-loader" strategy="afterInteractive">
          {`
              (function () {
                if (location.hostname !== ${JSON.stringify(plausibleHostname)}) return;
                var script = document.createElement("script");
                script.defer = true;
                script.dataset.domain = ${JSON.stringify(plausibleSiteId)};
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
          <NavigationTracker />
          <DonationSupportedTracker />
          <SiteNav />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          {/* py-2 below `sm:` rather than py-6: on a phone the first row is
              a 44px box around 16px text, so it already carries 14px of its
              own padding. 8px + 14px reproduces the ~24px inset the py-6
              strip had. Above the breakpoint the targets shrink back, so
              the strip needs its own padding again. pb-3, not pb-2: the
              byline link's 44px box overhangs its line by 12px (`-my-3`),
              and with only 8px under it the page scrolled 4px past the
              footer, which the viewport-pinned footer turned into a
              scrollbar on phone pages that otherwise fit. */}
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
            className="mt-16 border-t border-[var(--border)] pt-2 pb-3 text-center text-xs text-[var(--muted-foreground)] sm:py-6"
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
              {/* Same tab: nothing here is lost by leaving, and the donate
                  page links back to /?supported=1 after payment. */}
              <ProjectDonateLink href={DONATE_URL} className={FOOTER_LINK}>
                Donate
              </ProjectDonateLink>
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
            {/* One run of inline text, not a flex row: flex items are
                blockified, so a selection of the old inline-flex byline
                copied as "Made withby" plus a newline before the name. The
                heart is aria-hidden, and the sr-only "love" straight after
                it is what screen readers and the clipboard get instead, so
                both read "Made with love by Rico Trebeljahr". The spaces
                live in fixed-width inline-blocks with `whitespace-pre`, so
                they still copy while each gap stays the old gap-1 (4px): a
                bare space is 3.4px in SF Pro and another width again in
                Segoe UI or Roboto. The heart's 20px slot holds two of those
                spaces, which makes its box the text's own 16px line box,
                and `inset-y-0 my-auto` centres the heart on that box the
                way items-center did, in any font. */}
            <p className="mt-2">
              Made with
              <span className="relative inline-block w-5 whitespace-pre">
                {" "}
                <svg
                  className="heartbeat absolute inset-y-0 left-1 my-auto h-3 w-3 fill-current text-[#e8839b]"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <title>love</title>
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
                <span className="sr-only">love</span>{" "}
              </span>
              by
              <span className="inline-block w-1 whitespace-pre"> </span>
              {/* No px here, unlike the nav links: this anchor sits inline
                  right after "by" and its 4px gap, so horizontal padding
                  would visibly detach it from "by". Its 84px width already
                  clears the target minimum — only height was short. `-my-3`
                  gives the extra 24px straight back (the anchor is an
                  inline-flex, an atomic inline whose margin box is what the
                  line box holds, so a block-axis margin shrinks its outer
                  height without moving it sideways) and the whole thing
                  ends at `sm:`, so the line box is the old one at every
                  width. */}
              <a
                href="https://ricos.site"
                target="_blank"
                rel="noopener"
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
