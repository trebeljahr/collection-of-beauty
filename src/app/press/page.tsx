import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { absoluteUrl, jsonLdScriptProps, SITE_NAME, SITE_URL } from "@/lib/seo";

const pressEmail = "hello@trebeljahr.com";

export const metadata: Metadata = {
  title: "Press",
  description:
    "Press kit for Collection of Beauty: fact sheet, descriptions, story hooks, feature list, engineering notes, FAQ, quotes, images, and contact details.",
  alternates: { canonical: "/press" },
  openGraph: {
    title: `Press · ${SITE_NAME}`,
    description:
      "Fact sheet, descriptions, story hooks, features, engineering notes, FAQ, quotes, image assets, and press contact for Collection of Beauty.",
    url: `${SITE_URL}/press`,
    images: [
      {
        url: "/marketing/hero.png",
        width: 1920,
        height: 1080,
        alt: "Collection of Beauty marketing mosaic.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Press · ${SITE_NAME}`,
    description:
      "Fact sheet, descriptions, story hooks, features, engineering notes, FAQ, quotes, image assets, and press contact.",
    images: ["/marketing/hero.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const factSheet = [
  ["Project", "Collection of Beauty"],
  ["URL", "https://beauty.trebeljahr.com"],
  ["Maker", "Rico Trebeljahr - solo, no company"],
  ["Location", "Berlin, Germany"],
  ["Release", "2026 (public launch)"],
  ["Price", "Free. No login, no ads, no paywall, no tracking beyond self-hosted Plausible."],
  [
    "Collection size",
    "~2,855 works, ~225 artists at launch (numbers move; live count visible on the home page)",
  ],
  [
    "Coverage",
    "Roughly 14th-early-20th century. Centre of mass: Northern European, Italian, French, Russian, Japanese ukiyo-e, American naturalist illustration.",
  ],
  [
    "Sources",
    "Wikimedia Commons, Library of Congress (Prints & Photographs Division), and adjacent public-domain archives. Each work links back to its source.",
  ],
  [
    "Licensing",
    "All artworks public domain. Metadata corrections handled via GitHub issues. Site code public on GitHub.",
  ],
  [
    "Platforms",
    "Web. 3D museum requires WebGL; tested on Chrome/Firefox/Safari on macOS, Windows, Linux, and on iOS / Android in landscape. Desktop uses pointer-lock + WASD; touch devices get an on-screen joystick and a landscape-rotate prompt.",
  ],
  [
    "Languages",
    "English UI. Original-language titles preserved alongside English where applicable (Japanese, Russian, German, French, etc.).",
  ],
  [
    "Newsletter",
    "Periodic edition, opt-in, run via self-hosted ListMonk + Amazon SES. Each edition features five works around a theme.",
  ],
  ["Press contact", pressEmail],
  ["Social", 'See "Social" section below. Some accounts are still being warmed up at launch.'],
  ["Press page", "https://beauty.trebeljahr.com/press"],
] as const;

const descriptionTiers = [
  {
    title: "One sentence",
    body: [
      "A small, hand-curated public-domain art gallery on the web, with a multi-floor 3D museum you can walk through in a browser tab.",
    ],
  },
  {
    title: "Short (about 40 words)",
    body: [
      "Collection of Beauty is a one-person public-domain art gallery on the web. It holds roughly 2,855 works from about 225 artists and includes a multi-floor 3D museum, built with WebGL, that you can walk through in a browser tab.",
    ],
  },
  {
    title: "Medium (about 80 words)",
    body: [
      "Collection of Beauty is a hand-curated public-domain art gallery, built and maintained by one person. The collection currently holds around 2,855 works across ~225 artists, sourced from open archives such as Wikimedia Commons and the Library of Congress. Alongside a standard 2D gallery and artist pages, the site includes a multi-floor 3D museum, built with React Three Fiber, where each floor is a different historical era and a spiral staircase connects them. The 3D museum runs in any modern browser, on desktop with mouse + keyboard and on mobile with a touch joystick.",
    ],
  },
  {
    title: "Long (about 150 words)",
    body: [
      'Collection of Beauty is a personal gallery of public-domain art, made and maintained by a single developer. The collection grew out of a private bookmark folder and now holds around 2,855 works across ~225 artists, drawn from public archives such as Wikimedia Commons and the Library of Congress. Each work shows its source, provenance, and a permalink, with a "suggest a fix" button that opens a GitHub issue. Metadata is treated as a living, correctable document rather than a closed catalog.',
      "The site is free and runs without ads, sign-ups, or third-party tracking. The headline feature is a multi-floor 3D museum built in WebGL: each floor is a historical era, paintings are sized to their real-world dimensions where known, and a spiral staircase connects the floors. It runs in any browser tab - pointer-lock + WASD on desktop, an on-screen touch joystick on mobile - and needs no install.",
    ],
  },
] as const;

const history = [
  "Collection of Beauty started as a private bookmark folder. Over a few years I kept finding paintings I loved on Wikimedia Commons, in the Library of Congress, scattered across museum sites with brutal UX, and saving them into a folder with no real structure.",
  "Eventually the folder was unbrowsable. The obvious move was to make a small grid view of my favourites. The grid worked but felt thin - a wall of thumbnails does not honour the work. The site grew into an artist page, then a timeline, then a 3D museum that takes the same data and arranges it as walkable rooms in WebGL.",
  "The collection is not comprehensive and was never meant to be. It is the output of one person's taste - what I have found beautiful while reading through public-domain archives. Many famous artists are missing; some obscure ones are over-represented. That bias is the point. If you want the complete record, the museums and Wikimedia already have it.",
  "What I wanted to build is a quiet room where the works can be looked at without being sold to or ranked by an algorithm.",
] as const;

const hooks = [
  {
    title: "A walkable 3D museum in a browser.",
    body: "Multi-floor, real-world painting sizes, runs on a laptop or a phone. Built with React Three Fiber and Three.js.",
  },
  {
    title: "An honest, imperfect dataset.",
    body: "Metadata is occasionally wrong; the site shows the source and asks readers to file corrections via GitHub issue. The correction loop is the point, not an afterthought.",
  },
  {
    title: "Public-domain art, presented with care.",
    body: "The same works are scattered across institutional sites with mid-2000s UX. This one is a quiet, fast, ad-free reading room.",
  },
  {
    title: "Slow web, one person, no business model.",
    body: "No upsell, no SaaS pivot, no NFT angle. The whole project is in service of the public domain.",
  },
] as const;

const features = [
  "Multi-floor 3D museum at /gallery-3d. One floor per historical era, a spiral staircase connecting them. Painting frames are sized to real-world dimensions where known; otherwise the layout falls back to an aspect estimate.",
  "2D gallery with shuffle, sort, search, movement and year filters, and an artists page with per-artist sub-galleries.",
  'Per-work detail pages with provenance, source URL, dimensions, movement, credit line, and a permalink. A "suggest a fix" button on every work opens a pre-filled GitHub issue against the metadata.',
  "Timeline view that scrolls through the collection chronologically.",
  "Newsletter featuring five works per themed edition. Opt-in, runs on self-hosted ListMonk + Amazon SES. No marketing scoring.",
  "Open source. Code, asset pipeline, and metadata corrections all live on GitHub. The same images and metadata that drive the site are reusable by anyone.",
  "Quiet site furniture. No ads, no third-party trackers, no cookie banners. Analytics are self-hosted Plausible (cookieless, EU-hosted).",
  "Branded 404 and stable permalinks so links shared today still resolve later.",
] as const;

const engineering = [
  "Stack: Next.js 16 App Router, Tailwind 4, React Three Fiber, Three.js.",
  "Image pipeline: pre-built AVIF and WebP variants at a fixed width ladder, served from Cloudflare R2.",
  "3D texture loading: per-painting LOD with a 256 px thumbnail and a 960 px base loaded on mount, then progressively upgraded to 1920 / 2560 / 4096 / original tiers as the player approaches. Three LRU pools and a frame-paced GPU upload queue keep the frame budget bounded.",
  "Deployment: Docker image to GHCR, pulled by self-hosted Coolify.",
  "Analytics: self-hosted Plausible. Cookieless, EU-hosted, no third-party processors.",
  "Newsletter: self-hosted ListMonk + Amazon SES for delivery, double opt-in. Provisioned via Hatchkit.",
  "SEO: per-artist and per-work pages with VisualArtwork JSON-LD including license, dimensions, movement, credit, image refs.",
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
    "Can I download the whole collection?",
    "A bulk dataset release is on the post-launch list. In the interim, the metadata is in the GitHub repo and the source URLs let any scraper reproduce the corpus from the original archives.",
  ],
  [
    "Does the 3D museum work on mobile?",
    "Yes. On a touch device the pointer-lock + WASD controls swap out for an on-screen joystick, and a prompt asks for landscape orientation before entering. The texture LOD ladder backs off on smaller screens. The 2D gallery, artist pages, and timeline also work on mobile if you prefer scrolling to walking.",
  ],
  [
    "Will you add more artists / more works?",
    'Slowly. The collection is curated by hand. Submissions for "you should look at X" are welcome via GitHub or email; inclusion is at editorial discretion.',
  ],
  ["Is there a Patreon / membership / paid tier?", "No."],
] as const;

const quotes = [
  "It started as a folder of bookmarks. I wanted somewhere I could browse the things I find beautiful without each one being trapped behind a different museum's interface.",
  "Public-domain art is one of the most generous resources we have, and the web mostly treats it as a stock-photo afterthought. I wanted to give it a room of its own.",
  "The metadata is a work in progress. Some titles are wrong, some dates drift by a decade. Everything is linked back to the source, and any reader can file a correction on GitHub. I would rather ship a corpus that admits its mistakes than pretend to be a clean catalog.",
  "The 3D museum is the part of the project I am most curious to hear reactions on. Walking through a room is a different way of looking at a painting than scrolling past a thumbnail. Whether the difference is worth the engineering is for visitors to decide.",
] as const;

const acknowledgements = [
  "Wikimedia Commons",
  "Library of Congress, Prints & Photographs Division",
  "Adjacent open-access archives credited per-work in the provenance field",
] as const;

const availableImages = [
  {
    title: "Marketing hero",
    href: "/marketing/hero.png",
    meta: "1920 x 1080 PNG. Public marketing hero with 4 x 3 mosaic.",
  },
  {
    title: "Marketing hero JPEG",
    href: "/marketing/hero.jpg",
    meta: "1920 x 1080 JPEG variant of the marketing hero.",
  },
  {
    title: "Social share card",
    href: "/opengraph-image.png",
    meta: "1200 x 630 PNG. Social share image served by the live site.",
  },
] as const;

const imageKitPending = [
  "hero-3d-museum.png - 1920 x 1080. Spiral staircase plus a room of paintings. In production.",
  "hero-2d-gallery.png - 1920 x 1080. Home page in its best state. In production.",
  "artist-page.png - 1920 x 1080. An artist page with multiple works. In production.",
  "detail-page.png - 1920 x 1080. A single artwork with provenance and suggest-a-fix visible. In production.",
  "logo-wordmark.svg - Vector wordmark on transparent background. In production.",
  "walkthrough.mp4 - 30-second screen recording of a walk through the museum. Muted, looping-friendly. In production.",
] as const;

const redistribution = [
  "All site screenshots are released under CC0 for editorial use. Credit appreciated but not required.",
  "All artworks shown are themselves public domain. Use directly from the source archive when possible; the site is a presentation layer, not a rights holder.",
  "The wordmark and the site's typographic OG card are released CC0 for press use. Do not modify the wordmark in ways that imply institutional affiliation.",
  "Walkthrough video may be embedded, clipped, and re-uploaded for editorial coverage. CC0 for that purpose.",
] as const;

const social = [
  "Bluesky: warming up at launch - handle to be confirmed.",
  "Mastodon: warming up at launch - handle to be confirmed.",
  "Newsletter: signup at beauty.trebeljahr.com/sub (also linked from every issue page and the site nav).",
  "GitHub: repository link visible from the site footer.",
  "Personal blog: ricos.site (long-form pieces and a launch retrospective will live there).",
] as const;

const boilerplate =
  "Collection of Beauty is a personal public-domain art gallery, built and maintained by Rico Trebeljahr in 2026. The site holds about 2,855 works from ~225 artists, sourced from Wikimedia Commons, the Library of Congress, and adjacent open archives. Alongside a standard 2D gallery, it includes a multi-floor 3D museum, built with WebGL, that you can walk through in a browser tab on desktop or mobile. It runs at beauty.trebeljahr.com, free, without ads or sign-ups.";

function contactPointJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPoint",
    contactType: "press",
    email: pressEmail,
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

export default function PressPage() {
  return (
    <>
      <script {...jsonLdScriptProps(contactPointJsonLd())} />
      <div className="pb-8">
        <header className="relative isolate overflow-hidden border-b border-[var(--border)]">
          <div className="absolute inset-0 -z-10">
            <Image
              src="/marketing/hero.png"
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
                A small, hand-curated public-domain art gallery on the web, with a multi-floor 3D
                museum you can walk through in a browser tab.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/press-kit.zip"
                  className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Download press kit
                </Link>
                <a
                  href={`mailto:${pressEmail}`}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)]/70 px-4 py-2 text-sm font-medium transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Contact press
                </a>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-5 text-sm leading-7 text-[var(--muted-foreground)] md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <p>
                For journalists, newsletter editors, curators, and anyone covering Collection of
                Beauty. Copy text verbatim where useful; re-check live numbers before publishing.
              </p>
              <p className="mt-4">
                Press contact:{" "}
                <a
                  href={`mailto:${pressEmail}`}
                  className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {pressEmail}
                </a>
              </p>
            </div>
          </div>
        </header>

        <nav
          aria-label="Press page sections"
          className="border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur"
        >
          <div className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 py-3 text-sm text-[var(--muted-foreground)]">
            {[
              ["Fact sheet", "#fact-sheet"],
              ["Descriptions", "#descriptions"],
              ["Hooks", "#hooks"],
              ["Features", "#features"],
              ["Engineering", "#engineering"],
              ["FAQ", "#faq"],
              ["Quotes", "#quotes"],
              ["Images", "#images"],
              ["Contact", "#contact"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="shrink-0 rounded-sm underline-offset-4 hover:text-[var(--foreground)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mx-auto max-w-7xl px-4">
          <Section id="fact-sheet" eyebrow="Fact sheet" title="At a glance">
            <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {factSheet.map(([label, value]) => (
                <div key={label} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    {label}
                  </dt>
                  <dd className="leading-7">{value}</dd>
                </div>
              ))}
            </dl>
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

          <Section id="history" eyebrow="Background" title="How it got built">
            <div className="space-y-4 leading-8 text-[var(--muted-foreground)]">
              {history.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Section>

          <Section id="hooks" eyebrow="Story angles" title="Hooks for editors">
            <div className="grid gap-6 md:grid-cols-2">
              {hooks.map((hook) => (
                <article key={hook.title} className="border-t border-[var(--border)] pt-4">
                  <h3 className="font-serif text-xl">{hook.title}</h3>
                  <p className="mt-2 leading-7 text-[var(--muted-foreground)]">{hook.body}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section id="features" eyebrow="Features" title="What the site includes">
            <BulletList items={features} />
          </Section>

          <Section id="engineering" eyebrow="Engineering" title="Technical facts">
            <BulletList items={engineering} />
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

          <Section id="quotes" eyebrow="Quotes" title="Attribute to Rico Trebeljahr">
            <div className="space-y-6">
              {quotes.map((quote) => (
                <blockquote
                  key={quote}
                  className="border-l-2 border-[var(--foreground)] pl-5 font-serif text-xl leading-8"
                >
                  <p>"{quote}"</p>
                </blockquote>
              ))}
            </div>
          </Section>

          <Section id="acknowledgements" eyebrow="Acknowledgements" title="Source institutions">
            <div className="space-y-4 leading-8 text-[var(--muted-foreground)]">
              <p>
                The works in this collection were digitised by the institutions and volunteers
                behind:
              </p>
              <BulletList items={acknowledgements} />
              <p>
                The site exists because those institutions chose to publish their holdings into the
                public domain or under permissive licences. Where a specific archive is the source
                of a non-trivial portion of the corpus, they are credited on the About page.
              </p>
            </div>
          </Section>

          <Section id="images" eyebrow="Assets" title="Image kit">
            <div className="space-y-8">
              <figure>
                <div className="relative aspect-video overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
                  <Image
                    src="/marketing/hero.png"
                    alt="Collection of Beauty marketing mosaic"
                    fill
                    sizes="(min-width: 768px) 58vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-3 text-sm text-[var(--muted-foreground)]">
                  Shipped marketing hero from /public/marketing/hero.png.
                </figcaption>
              </figure>
              <div>
                <h3 className="font-serif text-xl">Available now</h3>
                <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                  {availableImages.map((asset) => (
                    <li
                      key={asset.href}
                      className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{asset.title}</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{asset.meta}</p>
                      </div>
                      <Link
                        href={asset.href}
                        className="text-sm underline underline-offset-2 hover:text-[var(--muted-foreground)]"
                      >
                        {asset.href}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-serif text-xl">In production</h3>
                <div className="mt-3 text-[var(--muted-foreground)]">
                  <BulletList items={imageKitPending} />
                </div>
              </div>
            </div>
          </Section>

          <Section id="video" eyebrow="Video" title="Video kit">
            <div className="space-y-3 leading-8 text-[var(--muted-foreground)]">
              <p>
                30-second walkthrough: spawn, climb stairs, enter a room, approach a painting, open
                detail. No voiceover. In production.
              </p>
              <p>A longer 2-3 minute developer commentary version may follow; pitch separately.</p>
            </div>
          </Section>

          <Section id="redistribution" eyebrow="Rights" title="Redistribution">
            <BulletList items={redistribution} />
          </Section>

          <Section id="social" eyebrow="Social" title="Launch channels">
            <BulletList items={social} />
          </Section>

          <Section id="contact" eyebrow="Contact" title="Press contact">
            <div className="space-y-6">
              <div className="leading-8">
                <p>
                  Email:{" "}
                  <a
                    href={`mailto:${pressEmail}`}
                    className="rounded-sm underline underline-offset-2 hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {pressEmail}
                  </a>
                </p>
                <p className="text-[var(--muted-foreground)]">
                  Response window: typically same-day during European business hours.
                </p>
                <p className="text-[var(--muted-foreground)]">
                  Imprint and GDPR contact:{" "}
                  <Link
                    href="/imprint"
                    className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    beauty.trebeljahr.com/imprint
                  </Link>
                </p>
              </div>
              <p className="leading-8 text-[var(--muted-foreground)]">
                For interviews or longer features, indicate format and outlet in the subject line;
                written-Q&amp;A is usually fastest to turn around.
              </p>
              <div className="border-t border-[var(--border)] pt-6">
                <h3 className="font-serif text-xl">Boilerplate About</h3>
                <blockquote className="mt-3 border-l-2 border-[var(--foreground)] pl-5 leading-8 text-[var(--muted-foreground)]">
                  <p>{boilerplate}</p>
                </blockquote>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/press-kit.zip"
                  className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Download press kit
                </Link>
                <Link
                  href="/"
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
