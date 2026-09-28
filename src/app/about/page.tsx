import type { Metadata } from "next";
import Link from "next/link";
import { PageBackdrop } from "@/components/page-backdrop";
import { touchTextLinkClasses } from "@/components/ui/pill";
import { artworkListings, summary } from "@/lib/data";
import { GITHUB_URL, HELLO_EMAIL } from "@/lib/links";
import { buildOpenGraph, SITE_NAME } from "@/lib/seo";

const WORKS = summary.totalArtworks.toLocaleString("en-US");
const ARTISTS = summary.totalArtists.toLocaleString("en-US");

export const metadata: Metadata = {
  title: "About",
  description: `Who made ${SITE_NAME}, how its ${WORKS} public-domain works were picked, where they come from, and how to report a mistake.`,
  alternates: { canonical: "/about" },
  openGraph: buildOpenGraph({
    url: "/about",
    title: `About · ${SITE_NAME}`,
    description: `How ${WORKS} public-domain works were picked by hand, where they come from, and how to report a mistake.`,
  }),
};

// Every link on this page that sits inside a sentence gets py-1 and nothing
// more. Vertical padding on an *inline* box grows the hit area but does not
// enter the line box, so the paragraph's rhythm is untouched — and WCAG 2.5.8
// exempts inline links from the 44px floor for exactly this reason: the
// surrounding line height, not the author, sets their height. Turning one
// into a 44px block would tear the sentence apart.
const INLINE_LINK =
  "rounded-sm py-1 underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

// Tiled behind the top of the page, in the order PageBackdrop deals them:
// the first three are a phone's top row, the first eight the widest
// screen's. Decoration, so an id that stops resolving (a rescan, a
// takedown) drops that one tile instead of failing the page.
const BACKDROP_IDS = [
  "collection-of-beauty-tsunami-by-hokusai-19th-century",
  "collection-of-beauty-1665-girl-with-a-pearl-earring",
  "collection-of-beauty-vincent-willem-van-gogh-128",
  "audubon-birds-431-american-flamingo",
  "collection-of-beauty-claude-monet-water-lilies-1906-ryerson",
  "collection-of-beauty-alfons-mucha-1896-summer",
  "collection-of-beauty-caspar-david-friedrich-der-monch-am-meer-google-art-project",
  "collection-of-beauty-mary-cassatt-the-tea-mfa-boston-42-178",
  "kunstformen-images-haeckel-actiniae",
  "collection-of-beauty-the-collector-of-prints-met-dt1920",
  "collection-of-beauty-hiroshige-travellers-surprised-by-sudden-rain",
  "collection-of-beauty-2560px-pieter-bruegel-the-elder-hunters-in-the-snow-winter-google-art-project",
  "collection-of-beauty-john-singer-sargent-carnation-lily-lily-rose-google-art-project",
  "redoute-roses-rosa-centifolia",
  "collection-of-beauty-carl-spitzweg-the-bookworm",
  "collection-of-beauty-vincent-van-gogh-1853-1890-cafeterras-bij-nacht-place-du-forum-kroller-muller-museum-otterlo-23-8-2",
  "collection-of-beauty-guo-zhongshu-traveling-on-the-river-in-snow",
  "collection-of-beauty-auguste-renoir-young-girls-at-the-piano-google-art-project",
  "collection-of-beauty-saint-jerome-writing-caravaggio-1605-6",
  "collection-of-beauty-crow-and-blossom-by-ohara-koson",
  "collection-of-beauty-alfons-mucha-1896-winter",
  "collection-of-beauty-claude-monet-poppy-field-google-art-project",
  "collection-of-beauty-caspar-david-friedrich-wanderer-above-the-sea-of-fog",
  "redoute-lilies-dianella-ensifolia",
];
const byId = new Map(artworkListings.map((a) => [a.id, a]));
const BACKDROP = BACKDROP_IDS.flatMap((id) => byId.get(id) ?? []);

// First person on purpose: the press kit tells the same story in the third
// person for other people to reuse. This page is Rico's own account, so keep
// the facts in step with /press when either one changes.
export default function AboutPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageBackdrop works={BACKDROP} />
      <div className="mx-auto max-w-3xl px-4 pb-8 md:pb-12">
        <header className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl">About</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Who made this, how the works were picked, and how to report a mistake.
          </p>
        </header>

        <div className="space-y-10 text-[var(--foreground)] leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-serif text-xl">What this is</h2>
            <p>
              {SITE_NAME} holds {WORKS} public-domain paintings, prints and book plates by {ARTISTS}{" "}
              artists, dated {summary.yearRange.min}–{summary.yearRange.max}. I picked every one of
              them by hand. You can browse them by era, artist, colour and decade, or walk through
              them in a{" "}
              <Link href="/gallery-3d" className={INLINE_LINK}>
                3D museum
              </Link>{" "}
              with one floor for each era.
            </p>
            <p>
              Open archives such as the Public Domain Image Archive are close to endless and full of
              curiosities. This is my slice through that material. Famous names are missing and some
              lesser-known artists appear often, because my taste decides what goes in.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl">How I picked the works</h2>
            <p>
              I started collecting in 2025 and looked at more than 50,000 images. Often I sat for
              hours with music on and a cup of tea, browsing public-domain art on Wikimedia Commons.
              Whenever one artist's page mentioned another, I added that name to an index of
              artists. Then I opened each artist's list of works and clicked through them one by
              one.
            </p>
            <p>
              Most of the work came after the looking: removing duplicates and cleaning up the
              metadata. AI coding agents, Claude Code and Codex, helped heavily with that part and
              with building the site, which I started in April 2026. I keep adding works.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl">Why</h2>
            <p>
              On days when I feel down, the collection is a source of inspiration. It gives me an
              excuse to look at art I like, and to look for new art without calling it
              procrastination.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl">Where the works come from</h2>
            <p>
              Most images and metadata come from Wikimedia Commons and Wikidata, plus a few works
              from the Library of Congress. Each work's page links to its source, where you can
              check the rights statement.
            </p>
            <p>
              Four illustrated books appear in their published plate order: Audubon's{" "}
              <em>Birds of America</em>, Haeckel's <em>Kunstformen der Natur</em>, and Redouté's{" "}
              <em>Les Roses</em> and <em>Les Liliacées</em>. They are under{" "}
              <Link href="/collections" className={INLINE_LINK}>
                Collections
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl">Mistakes</h2>
            <p>
              The metadata is imperfect. Expect wrong dates, garbled titles and the occasional wrong
              artist. Every work has a <em>Suggest a fix</em> link that opens a pre-filled{" "}
              <a
                href={`${GITHUB_URL}/issues/new`}
                target="_blank"
                rel="noopener"
                className={INLINE_LINK}
              >
                GitHub issue
              </a>
              . If you don't use GitHub, email{" "}
              <a href={`mailto:${HELLO_EMAIL}`} className={INLINE_LINK}>
                {HELLO_EMAIL}
              </a>{" "}
              with the work's title and what's wrong.
            </p>
            <p>
              The code and the metadata are public on{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener" className={INLINE_LINK}>
                GitHub
              </a>
              .
            </p>
          </section>

          <section className="pt-4">
            {/* Standalone nav link, not prose — so unlike the in-sentence
              links above it can take a real box, which is what the shared
              "← Back to …" idiom is. Only the three page-local utilities
              are composed on top; none of them touches a property the
              shared string already sets, which matters because a later
              class does not win in Tailwind v4. */}
            <Link
              href="/"
              className={`${touchTextLinkClasses} text-sm underline-offset-2 hover:opacity-70`}
            >
              ← Back to the gallery
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
