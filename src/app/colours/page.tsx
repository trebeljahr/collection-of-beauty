import type { Metadata } from "next";
import { ColorWheel } from "@/components/color-wheel";
import { allColorBucketCounts } from "@/lib/artwork-colors";
import { summary } from "@/lib/data";
import { buildOpenGraph } from "@/lib/seo";

// Rendered entirely from the bundled artwork JSON — nothing here reads a
// request, so match the sitemap's daily window instead of re-rendering.
export const revalidate = 86400;

const DESCRIPTION =
  `Browse ${summary.totalArtworks.toLocaleString()} public-domain works by colour, ` +
  `sorted into twelve families read from the pixels of each work.`;

export const metadata: Metadata = {
  title: "Colours",
  description: DESCRIPTION,
  alternates: { canonical: "/colours" },
  // Same path as alternates.canonical above — buildOpenGraph resolves it to
  // an absolute og:url so the two can't drift apart.
  openGraph: buildOpenGraph({
    url: "/colours",
    title: "Colours · Collection of Beauty",
    description: DESCRIPTION,
  }),
};

export default function ColoursPage() {
  const counts = allColorBucketCounts();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      <header className="mb-10 text-center">
        <h1 className="font-serif text-3xl md:text-4xl">Colours</h1>
        <p className="mx-auto mt-3 max-w-prose text-[var(--muted-foreground)]">
          Every work is read pixel by pixel and sorted into the colour families it contains. Pick
          one.
        </p>
      </header>

      <ColorWheel counts={counts} />

      <section className="mx-auto mt-12 max-w-prose text-sm text-[var(--muted-foreground)]">
        <h2 className="mb-2 font-medium text-[var(--foreground)]">How this works</h2>
        <p>
          Colours are measured in{" "}
          <a
            href="https://bottosson.github.io/posts/oklab/"
            className="underline hover:text-[var(--foreground)]"
            target="_blank"
            rel="noreferrer noopener"
          >
            OKLab
          </a>
          , where the distance between two colours matches how different they look. Each work votes
          its pixels into hue families, weighted so a small vivid passage counts for more than a
          broad, barely-tinted one.
        </p>
        <p className="mt-3">
          The scores are then measured against the collection itself. Public-domain painting is
          overwhelmingly warm, so a family is listed only when a work carries noticeably more of it
          than the collection&rsquo;s own average. Otherwise nearly everything would land in the
          same few families.
        </p>
        <p className="mt-3">
          A work can belong to up to three families, so the totals above add up to more than the
          size of the collection.
        </p>
      </section>
    </div>
  );
}
