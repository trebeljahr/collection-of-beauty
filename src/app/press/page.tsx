import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import pressImagesJson from "@/data/press-images.json";
import pressScreenshotsJson from "@/data/press-screenshots.json";
import { summary } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { GITHUB_URL, PRESS_EMAIL } from "@/lib/links";
import { absoluteUrl, buildOpenGraph, jsonLdScriptProps, SITE_NAME } from "@/lib/seo";

// Counts are rounded down ("4,000+") on purpose: the collection keeps
// growing, and a reader needs the size of it, not the exact tally. Rounding
// down keeps each figure true after every rebuild.
function atLeast(n: number, step: number): string {
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}

const WORKS = atLeast(summary.totalArtworks, 1000);
const ARTISTS = atLeast(summary.totalArtists, 50);
const IMAGES_SEEN = "50,000+";

// Written by scripts/build-marketing-images.mjs alongside the JPEGs, so the
// list, sizes and credits below always describe the files that ship.
const pressImages = pressImagesJson as {
  images: {
    slug: string;
    label: string;
    use: string;
    href: string;
    width: number;
    height: number;
    bytes: number;
    theme: "light" | "dark";
    hasTitle: boolean;
    alt: string;
    works: string[];
  }[];
  works: { id: string; title: string; artist: string | null; year: number | null }[];
};
const HEADLINE_IMAGE =
  pressImages.images.find((img) => img.slug === "16x9") ?? pressImages.images[0];
const BACKDROP_IMAGE =
  pressImages.images.find((img) => img.slug === "16x9-works") ?? HEADLINE_IMAGE;

// Written by scripts/build-museum-screenshots.mjs, which walks a headless
// browser through the live museum.
const pressScreenshots = pressScreenshotsJson as {
  capturedAt: string;
  screenshots: {
    slug: string;
    label: string;
    floor: string | null;
    href: string;
    width: number;
    height: number;
    bytes: number;
    alt: string;
  }[];
};
const SCREENSHOT_MONTH = new Date(`${pressScreenshots.capturedAt}-01T00:00:00Z`).toLocaleString(
  "en-US",
  { month: "long", year: "numeric", timeZone: "UTC" },
);

// Named in the image kit intro. Filtered against the manifest, so a work the
// layout search stops using drops out of the sentence instead of being named
// for an image it is no longer in.
const FEATURED_IN_IMAGES = [
  ["collection-of-beauty-1665-girl-with-a-pearl-earring", "Vermeer's Girl with a Pearl Earring"],
  ["collection-of-beauty-tsunami-by-hokusai-19th-century", "Hokusai's Great Wave"],
  ["audubon-birds-431-american-flamingo", "Audubon's flamingo"],
  ["kunstformen-images-haeckel-actiniae", "Haeckel's sea anemones"],
] as const;
const FEATURED_NAMES = new Intl.ListFormat("en-US", { type: "conjunction" }).format(
  FEATURED_IN_IMAGES.filter(([id]) => pressImages.works.some((w) => w.id === id)).map(
    ([, name]) => name,
  ),
);

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const GROUND_ERA = ERAS[0]?.title ?? "the earliest era";
const TOP_ERA = ERAS[ERAS.length - 1]?.title ?? "the most recent era";

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
const { min: FIRST_YEAR, max: LAST_YEAR } = summary.yearRange;
const PERIOD =
  FIRST_YEAR !== null && LAST_YEAR !== null
    ? `the ${ordinal(Math.floor(FIRST_YEAR / 100) + 1)} century to the ${Math.floor(LAST_YEAR / 10) * 10}s`
    : "the Middle Ages to the 20th century";

export const metadata: Metadata = {
  title: "Press",
  description: `Press kit for Collection of Beauty, ${WORKS} handpicked public-domain artworks to browse or walk through in 3D. Story, fact sheet, copy, FAQ and images.`,
  alternates: { canonical: "/press" },
  openGraph: buildOpenGraph({
    // Same string as alternates.canonical above, so og:url can't drift from it.
    url: "/press",
    title: `Press · ${SITE_NAME}`,
    description: `Story, fact sheet, copy blocks, FAQ, images and press contact for Collection of Beauty, ${WORKS} handpicked public-domain artworks to browse or walk through in 3D.`,
    images: [
      {
        url: HEADLINE_IMAGE.href,
        width: HEADLINE_IMAGE.width,
        height: HEADLINE_IMAGE.height,
        alt: HEADLINE_IMAGE.alt,
      },
    ],
  }),
  twitter: {
    card: "summary_large_image",
    title: `Press · ${SITE_NAME}`,
    description: `Story, fact sheet, copy, FAQ and images for Collection of Beauty, ${WORKS} handpicked public-domain artworks to browse or walk through in 3D.`,
    images: [HEADLINE_IMAGE.href],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Third person on purpose: this page is copy for other people to reuse,
// and anything in Rico's own voice should be written by Rico.
const story = [
  `Collection of Beauty is a way to move through art on a screen. It holds ${WORKS} public-domain paintings, prints and book plates, and every one of them was handpicked. The site links them by era, artist, colour and decade, and hangs them in a 3D museum with one floor for each era.`,
  "Open archives such as the Public Domain Image Archive (pdimagearchive.org) are close to endless and full of curiosities. Collection of Beauty is one person's slice through that material. It is smaller and handpicked, and each work carries metadata that leads to the next one: the movement it belongs to, the artists around it, the colours in it. Famous names are missing and some lesser-known artists appear often, because one person's taste decides what goes in.",
  `Picking the works meant looking at more than 50,000 images. Rico sometimes sat for hours with music on and a cup of tea, browsing public-domain art on Wikimedia Commons. Whenever one artist's page mentioned another, he added that name to an index of artists. He then opened each artist's list of works on Commons and clicked through them one by one.`,
  "Most of the work came after the looking: removing duplicates and cleaning up the metadata. AI coding agents, Claude Code and Codex, helped heavily with that part and with building the site.",
  "Walking the museum floor by floor shows what each period looked like, and how much art from past centuries anyone can look at for free.",
  "For Rico the collection is also a source of inspiration on days when he feels down. It gives him an excuse to look at art he likes, and to look for new art without calling it procrastination.",
  "He began collecting in 2025 and started the site in April 2026. He keeps adding works. The code, the data scripts and the metadata are public on GitHub.",
] as const;

// The data-art half of the story: one catalogue, sorted by one field at a
// time. Only views that ship belong here.
const views = [
  {
    label: "3D museum",
    href: "/gallery-3d",
    body: `A building with one floor per era, from ${GROUND_ERA} at ground level to ${TOP_ERA} at the top, joined by a spiral staircase. Each floor has many rooms. You walk it with the keyboard and mouse, or with an on-screen joystick on a phone. Paintings hang at their real size where the dimensions are known.`,
  },
  {
    label: "Timeline",
    href: "/timeline",
    body: `The works stacked by decade, from ${PERIOD}. The height of each column shows where the collection is thick and where it is thin.`,
  },
  {
    label: "Colours",
    href: "/colours",
    body: "Twelve colour families, measured from the pixels of each image. A work can belong to up to three, and each family page opens on the works with the most of that colour.",
  },
  {
    label: "Eras",
    href: "/eras",
    body: "The art movements grouped into eras, from Gothic altarpieces to Modernism, with East Asian painting as its own group.",
  },
  {
    label: "Artists",
    href: "/artists",
    body: "Every artist, sorted by how many of their works are here. Each artist page links to painters from the same movement and to documented friendships, such as Monet and Manet at Argenteuil in 1874.",
  },
  {
    label: "Collections",
    href: "/collections",
    body: "Four illustrated books in their published plate order: Audubon's Birds of America, Haeckel's Kunstformen der Natur, and Redouté's Les Roses and Les Liliacées.",
  },
  {
    label: "Surprise me",
    href: "/surprise",
    body: "One work picked at random.",
  },
] as const;

const factSheet = [
  ["Project", "Collection of Beauty"],
  ["URL", "https://collectionofbeauty.com"],
  ["Maker", "Rico, working alone"],
  ["Location", "Berlin, Germany"],
  ["Started", "Collecting in 2025. The site followed in April 2026, and Rico keeps adding works."],
  ["Selection", `Handpicked from ${IMAGES_SEEN} images.`],
  [
    "Collection",
    `${WORKS} works by ${ARTISTS} artists, dated from ${PERIOD}. Most were picked one at a time. The rest are plates from four illustrated books.`,
  ],
  [
    "Sources",
    "Mostly Wikimedia Commons and Wikidata, plus a few works from the Library of Congress. Every work links to its source.",
  ],
  [
    "Built with",
    "AI coding agents (Claude Code and Codex), Next.js and Three.js. Code and metadata are public on GitHub.",
  ],
  ["Price", "Free. No account and no ads. Analytics run on self-hosted Plausible without cookies."],
  ["Newsletter", "Drops of Beauty: five works on one theme per edition, opt-in, at /drops."],
  ["Press contact", PRESS_EMAIL],
  ["Press page", "https://collectionofbeauty.com/press"],
] as const;

const descriptionTiers = [
  {
    title: "One sentence",
    body: [
      `Collection of Beauty has ${WORKS} handpicked public-domain artworks to browse by era, artist, colour or decade, or to walk through as a 3D museum.`,
    ],
  },
  {
    title: "Short (about 40 words)",
    body: [
      `Collection of Beauty is a free site with ${WORKS} public-domain artworks. Rico handpicked them from ${IMAGES_SEEN} images. Visitors can browse the works by era, artist, colour or decade, or walk through a 3D museum with one floor per era.`,
    ],
  },
  {
    title: "Medium (about 80 words)",
    body: [
      `Collection of Beauty holds ${WORKS} handpicked public-domain artworks. Open archives of public-domain images are close to endless. This is one person's slice through them, with metadata that links each work to its era, its artist and its colours. One way to see them is a 3D museum with one floor per era. Rico looked at ${IMAGES_SEEN} images to build it and keeps adding works.`,
    ],
  },
  {
    title: "Long (about 150 words)",
    body: [
      `Collection of Beauty is a way to move through art on a screen. Visitors can sort the works by era, decade, colour and artist, or open one at random. They can also walk through a 3D museum in the browser, with one floor for each era from ${GROUND_ERA} to ${TOP_ERA}.`,
      `Every work in it was handpicked. Rico went from artist to artist on Wikimedia Commons and looked at ${IMAGES_SEEN} images to pick ${WORKS}. AI coding agents, Claude Code and Codex, helped heavily with removing duplicates, cleaning up the metadata and building the site.`,
      "Open archives of public-domain images are close to endless. This one is small enough to walk through, and Rico keeps adding to it. The site is free, and every work links back to its source.",
    ],
  },
] as const;

const faq = [
  [
    "Is this affiliated with a museum?",
    "No. It is a personal project run by one person. Institutions are credited per work where the source archive identifies them.",
  ],
  [
    "Are the images really public domain?",
    "Yes. Every work links back to its source archive, where the rights statement can be verified independently. Where a digitisation has its own licence (rare for the sources used), it is documented.",
  ],
  [
    "The title or date on this work looks wrong.",
    'Probably is. Click "suggest a fix" on the work; it opens a GitHub issue pre-filled with the work id and source URL. Corrections are processed in batches.',
  ],
  [
    "Can I use the images in my own project?",
    "Yes - they are public domain. Use them directly. The site is a convenience layer, not a rights holder.",
  ],
  [
    "Can I use your metadata in my own project?",
    "Yes. The metadata is published in the open repo. Corrections welcome.",
  ],
  [
    "Can I download the images?",
    "Yes. Every work has a download panel on its own page offering each size that was actually built for it, defaulting to the largest. Around 970 works come from scans wider than 4,096px and download at their full source resolution, up to 16,384px on the long side. Files are AVIF; a 1,280px WebP is offered alongside for tools that cannot read AVIF.",
  ],
  [
    "Can I download a whole collection at once?",
    "The four sets that were published as numbered plate series - Audubon's Birds of America, Redoute's Les Roses and Les Liliacees, and Haeckel's Kunstformen der Natur - are each downloadable as a single ZIP from the set's page at /collection/<slug>. Plates inside are 2,560px AVIF, with a README carrying a credit line and link per plate. The rest of the collection was assembled work by work rather than published as a series, so it is offered per work.",
  ],
  [
    "Why can I not download the original scan file?",
    "It is not published. Only the derived variant ladder is mirrored to storage, so the largest offered size is the largest file that exists - for the big scans, the full source resolution, re-encoded rather than resampled.",
  ],
  [
    "Can I download the metadata as a dataset?",
    "The metadata is in the GitHub repo, and /api/artworks serves the same records as JSON. The source URLs let any scraper reproduce the corpus from the original archives.",
  ],
  [
    "Does the 3D museum work on mobile?",
    "Yes. On a touch device the pointer-lock + WASD controls swap out for an on-screen joystick, and a prompt asks for landscape orientation before entering. The texture LOD ladder backs off on smaller screens. The 2D gallery, artist pages, and timeline also work on mobile if you prefer scrolling to walking.",
  ],
  [
    "Will you add more artists / more works?",
    'Yes. Rico keeps adding works he finds beautiful. Suggestions for "you should look at X" are welcome via GitHub or email, and he decides what goes in.',
  ],
  ["Is there a Patreon / membership / paid tier?", "No."],
] as const;

const acknowledgements = [
  "Wikimedia Commons and Wikidata",
  "Library of Congress, Prints & Photographs Division",
  "Other open-access archives, credited on each work's page",
] as const;

const boilerplate = `Collection of Beauty (collectionofbeauty.com) holds ${WORKS} handpicked public-domain artworks, chosen by Rico from ${IMAGES_SEEN} images, mostly on Wikimedia Commons. Visitors can sort it by era, decade, colour and artist, open one work at random, or walk through it as a 3D museum with one floor per era. The site is free, has no ads, and grows as Rico adds works.`;

function contactPointJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPoint",
    contactType: "press",
    email: PRESS_EMAIL,
    url: absoluteUrl("/press"),
    areaServed: "Worldwide",
    availableLanguage: "English",
  };
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--border)] py-12 md:py-16">
      <div className="grid gap-7 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] md:gap-12">
        <div>
          {eyebrow && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {eyebrow}
            </p>
          )}
          <h2 className="font-serif text-2xl tracking-tight md:text-3xl">{title}</h2>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--foreground)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Label/value table used by both the museum section and the fact sheet —
 *  the two read as one document, so they share one row rhythm. */
function FactList({ facts }: { facts: readonly (readonly [string, string])[] }) {
  return (
    <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {facts.map(([label, value]) => (
        <div key={label} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            {label}
          </dt>
          <dd className="leading-7">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function PressPage() {
  return (
    <>
      <script {...jsonLdScriptProps(contactPointJsonLd())} />
      <div className="pb-8">
        <header className="relative isolate overflow-hidden border-b border-[var(--border)]">
          <div className="absolute inset-0 -z-10">
            <Image
              src={BACKDROP_IMAGE.href}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-35 saturate-[0.85]"
            />
            <div className="absolute inset-0 bg-[var(--background)]/78" />
          </div>
          <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl content-end gap-10 px-4 py-12 md:grid-cols-[minmax(0,0.9fr)_minmax(20rem,0.55fr)] md:items-end md:py-16">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Press kit
              </p>
              <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight md:text-7xl">
                Collection of Beauty
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--foreground)] md:text-xl">
                {WORKS} handpicked public-domain paintings, prints and book plates. Browse them by
                era, artist, colour or decade, or walk through them in a 3D museum in your browser.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {/* min-h-11 lifts both CTAs from their natural 38px
                    (text-sm's 20px line box + py-2 + border) to the 44px
                    touch minimum; giving it as a min-height with centred
                    content keeps the label metrics identical. It ends at
                    `sm:` for the same reason the section rail's does —
                    WCAG 2.5.5's 44px is a touch criterion, a mouse only
                    gets 2.5.8's 24px — so above `sm:` the pair returns to
                    the 38px it was before the touch pass.

                    The row is `flex flex-wrap` with no `items-*`, so
                    align-items is stretch and the pair is the same height
                    whatever their box models differ by — no border padding
                    needed on the filled one to match its outlined
                    sibling. */}
                <Link
                  href="/press-kit.zip"
                  className="inline-flex min-h-11 items-center rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
                >
                  Download press kit
                </Link>
                <a
                  href={`mailto:${PRESS_EMAIL}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--background)]/70 px-4 py-2 text-sm font-medium transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
                >
                  Email Rico
                </a>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-5 text-sm leading-7 text-[var(--muted-foreground)] md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <p>
                For anyone writing about Collection of Beauty. Copy any text on this page as it
                stands. The numbers come from the catalogue and change when it does.
              </p>
            </div>
          </div>
        </header>

        <nav
          aria-label="Press page sections"
          className="border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur"
        >
          {/* Horizontal scroll rail. At 375px only four of the seven links
              fit, and nothing about a flat row of cut-off text says
              "scrollable" — so the edges carry a shadow that appears
              exactly when content is hidden on that side.

              The trick is two background layers per edge: an opaque
              `--background` cover attached to the *content* box
              (`local`, so it scrolls with the links) painted over a
              shadow attached to the *element* box (`scroll`, so it stays
              pinned to the visible edge). A cover only slides out of the
              way once there is scrolled-off content behind it, which
              means the shadow shows up per-edge, on demand, and never at
              all at the widths where every link fits — so desktop is
              visually untouched by it. Backgrounds paint behind text, so
              this shades the edge without dimming a label.

              The nav is not sticky, so what sits behind the rail is the
              plain page background; the opaque covers are therefore
              invisible against it despite the parent's /85 tint.

              overscroll-x-contain keeps a fling at either end from
              handing the gesture to the browser's back-navigation swipe. */}
          <div
            className="mx-auto flex max-w-7xl snap-x snap-proximity scroll-pl-4 items-center gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 text-sm text-[var(--muted-foreground)] sm:py-3"
            style={{
              backgroundImage: [
                "linear-gradient(to right, var(--background) 45%, transparent)",
                "linear-gradient(to left, var(--background) 45%, transparent)",
                "linear-gradient(to right, color-mix(in oklab, var(--muted-foreground) 40%, transparent), transparent)",
                "linear-gradient(to left, color-mix(in oklab, var(--muted-foreground) 40%, transparent), transparent)",
              ].join(", "),
              backgroundPosition: "left center, right center, left center, right center",
              backgroundSize: "2.5rem 100%, 2.5rem 100%, 1.5rem 100%, 1.5rem 100%",
              backgroundRepeat: "no-repeat",
              backgroundAttachment: "local, local, scroll, scroll",
            }}
          >
            {[
              ["Story", "#story"],
              ["Ways in", "#ways-in"],
              ["Fact sheet", "#fact-sheet"],
              ["Descriptions", "#descriptions"],
              ["FAQ", "#faq"],
              ["Images", "#images"],
              ["Contact", "#contact"],
            ].map(([label, href]) => (
              // min-h-11 lifts each link from a 20px text box to the 44px
              // touch minimum, and px-1 widens the short ones ("FAQ" was
              // 27px). The row's gap drops 4 -> 2 to pay for that padding
              // exactly: two neighbours contribute 4px each side, so
              // 4 + 8 + 4 is the 16px that gap-4 alone used to give, and
              // the links still need the same rail width — the horizontal
              // scroll therefore engages at the same viewport as before.
              // The height ends at `sm:` (with the container's py-1 ->
              // py-3): WCAG 2.5.5's 44px is a touch criterion, a mouse gets
              // 2.5.8's 24px, and the desktop rail stays the 44px strip it
              // was rather than growing to 52px. snap-start (proximity, not
              // mandatory) gives the rail a second scrollability cue
              // without fighting a flick.
              <a
                key={href}
                href={href}
                className="flex min-h-11 shrink-0 snap-start items-center rounded-sm px-1 underline underline-offset-4 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mx-auto max-w-7xl px-4">
          <Section id="story" eyebrow="The story" title="What this is">
            <div className="space-y-4 leading-8 text-[var(--muted-foreground)]">
              {story.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Section>

          <Section id="ways-in" eyebrow="Ways in" title="One catalogue, sorted many ways">
            <div className="space-y-6">
              <p className="leading-8 text-[var(--muted-foreground)]">
                Each work comes with metadata: a date, an artist, a movement, and the colours in its
                pixels. The site sorts the whole collection by one of those at a time, and each sort
                shows a different set of connections between the works. Rico treats these views as
                an experiment in data art.
              </p>
              <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {views.map((view) => (
                  <div key={view.href} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr]">
                    <dt>
                      <Link
                        href={view.href}
                        className="rounded-sm py-1 font-serif text-lg underline underline-offset-4 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        {view.label}
                      </Link>
                    </dt>
                    <dd className="leading-7 text-[var(--muted-foreground)]">{view.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Section>

          <Section id="fact-sheet" eyebrow="Fact sheet" title="At a glance">
            <FactList facts={factSheet} />
          </Section>

          <Section id="descriptions" eyebrow="Descriptions" title="Copy blocks">
            <div className="space-y-8">
              {descriptionTiers.map((tier) => (
                <article key={tier.title}>
                  <h3 className="font-serif text-xl">{tier.title}</h3>
                  <div className="mt-3 space-y-3 leading-8 text-[var(--muted-foreground)]">
                    {tier.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section id="faq" eyebrow="FAQ" title="Common questions">
            <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {faq.map(([question, answer]) => (
                <article key={question} className="py-5">
                  <h3 className="font-serif text-xl">{question}</h3>
                  <p className="mt-2 leading-7 text-[var(--muted-foreground)]">{answer}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section id="acknowledgements" eyebrow="Acknowledgements" title="Source institutions">
            <div className="space-y-4 leading-8 text-[var(--muted-foreground)]">
              <p>The works were digitised and published by the people behind:</p>
              <BulletList items={acknowledgements} />
              <p>
                They chose to publish these scans for anyone to reuse, and the collection depends on
                that. The About page lists the sources in more detail.
              </p>
            </div>
          </Section>

          <Section id="images" eyebrow="Images" title="Image kit">
            <div className="space-y-10">
              <p className="leading-8 text-[var(--muted-foreground)]">
                {FEATURED_NAMES ? `${FEATURED_NAMES} are among the` : "There are"}{" "}
                {pressImages.works.length} works in these images. None of them is cropped. The{" "}
                <Link
                  href="/press-kit.zip"
                  className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  press kit ZIP
                </Link>{" "}
                has every file, and a text file with the artist, title and date of each work.
              </p>

              <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
                {pressImages.images.map((img) => (
                  <li key={img.slug}>
                    <figure>
                      {/* A fixed frame keeps the grid rows aligned; object-contain
                          shows each image whole inside it, whatever its shape. */}
                      <a
                        href={img.href}
                        className="relative block aspect-[4/3] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        <Image
                          src={img.href}
                          alt={img.alt}
                          fill
                          sizes="(min-width: 768px) 28vw, (min-width: 640px) 50vw, 100vw"
                          className="object-contain p-3"
                        />
                      </a>
                      <figcaption className="mt-3">
                        <p className="font-serif text-lg">{img.label}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                          {img.use}
                        </p>
                        <p className="mt-1 text-sm tabular-nums text-[var(--muted-foreground)]">
                          {img.width.toLocaleString("en-US")} x {img.height.toLocaleString("en-US")}{" "}
                          JPEG, {formatBytes(img.bytes)}
                          {img.hasTitle ? "" : ", no text"}
                        </p>
                        <a
                          href={img.href}
                          download
                          className="mt-2 inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
                        >
                          Download
                        </a>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>

              <details className="group border-y border-[var(--border)] py-4">
                <summary className="flex min-h-11 cursor-pointer items-center font-serif text-xl sm:min-h-0">
                  Works in these images ({pressImages.works.length})
                </summary>
                <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm leading-6 text-[var(--muted-foreground)] sm:grid-cols-2">
                  {pressImages.works.map((work) => (
                    <li key={work.id}>
                      <Link
                        href={`/artwork/${work.id}`}
                        className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        {work.title}
                      </Link>
                      {work.artist ? `, ${work.artist}` : ""}
                      {work.year ? `, ${work.year}` : ""}
                    </li>
                  ))}
                </ul>
              </details>

              <div>
                <h3 className="font-serif text-xl">Screenshots of the 3D museum</h3>
                <p className="mt-2 leading-8 text-[var(--muted-foreground)]">
                  {pressScreenshots.screenshots.length} views taken in the museum on
                  collectionofbeauty.com in {SCREENSHOT_MONTH}, with the on-screen controls hidden.
                  The rooms change as works are added, so a visit today may not match them exactly.
                </p>
                <ul className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2">
                  {pressScreenshots.screenshots.map((shot) => (
                    <li key={shot.slug}>
                      <figure>
                        <a
                          href={shot.href}
                          className="relative block aspect-video overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <Image
                            src={shot.href}
                            alt={shot.alt}
                            fill
                            sizes="(min-width: 768px) 28vw, (min-width: 640px) 50vw, 100vw"
                            className="object-contain"
                          />
                        </a>
                        <figcaption className="mt-3">
                          <p className="font-serif text-lg">{shot.label}</p>
                          {shot.floor && (
                            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                              Floor: {shot.floor}
                            </p>
                          )}
                          <p className="mt-1 text-sm tabular-nums text-[var(--muted-foreground)]">
                            {shot.width.toLocaleString("en-US")} x{" "}
                            {shot.height.toLocaleString("en-US")} JPEG, {formatBytes(shot.bytes)}
                          </p>
                          <a
                            href={shot.href}
                            download
                            className="mt-2 inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
                          >
                            Download
                          </a>
                        </figcaption>
                      </figure>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3 leading-8 text-[var(--muted-foreground)]">
                <h3 className="font-serif text-xl text-[var(--foreground)]">Rights</h3>
                <p>
                  The images above and screenshots of the site are CC0, so use them without asking.
                  The artworks are public domain. Where you can, take them from the source archive
                  linked on each work.
                </p>
                <p>
                  For another view of the museum or a size not listed here, write to{" "}
                  <a
                    href={`mailto:${PRESS_EMAIL}`}
                    className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {PRESS_EMAIL}
                  </a>
                  .
                </p>
              </div>
            </div>
          </Section>

          <Section id="contact" eyebrow="Contact" title="Press contact">
            <div className="space-y-6">
              <div className="leading-8">
                <p>
                  Email:{" "}
                  <a
                    href={`mailto:${PRESS_EMAIL}`}
                    className="rounded-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {PRESS_EMAIL}
                  </a>
                </p>
                <p className="text-[var(--muted-foreground)]">
                  Imprint and GDPR contact:{" "}
                  <Link
                    href="/imprint"
                    className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    collectionofbeauty.com/imprint
                  </Link>
                </p>
              </div>
              <p className="leading-8 text-[var(--muted-foreground)]">
                For an interview, name the outlet and the format in the subject line. The newsletter
                lives at{" "}
                <Link
                  href="/drops"
                  className="rounded-sm py-1 underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  /drops
                </Link>
                , and the code and metadata are on{" "}
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm py-1 underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  GitHub
                </a>
                .
              </p>
              <div className="border-t border-[var(--border)] pt-6">
                <h3 className="font-serif text-xl">Boilerplate About</h3>
                <blockquote className="mt-3 border-l-2 border-[var(--foreground)] pl-5 leading-8 text-[var(--muted-foreground)]">
                  <p>{boilerplate}</p>
                </blockquote>
              </div>
              {/* Same 44px-on-touch treatment as the hero pair above. */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/press-kit.zip"
                  className="inline-flex min-h-11 items-center rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
                >
                  Download press kit
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
                >
                  Visit the gallery
                </Link>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
