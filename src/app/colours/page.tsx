import type { Metadata } from "next";
import Link from "next/link";
import { ColorWheel } from "@/components/color-wheel";
import { allColorBucketCounts } from "@/lib/artwork-colors";
import { COLOR_BUCKETS } from "@/lib/color-buckets.mjs";
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
      </header>

      {/* Below `md` the wheel's legend is hidden and the tile grid below
          takes over: a legend row is a single 20px line of text, under half
          the ~44px a thumb needs, and this page is nothing but a chooser, so
          its only navigation must not be the hardest thing on the site to
          hit. On a pointer the legend is fine and stays exactly as it was —
          hence the viewport gate rather than `showLegend={false}`, which
          would have stripped the labels and counts off the desktop page too.
          The wheel segments are the visual index in both cases.

          The gate is caller-side CSS because `showLegend` is a boolean the
          server evaluates once, with no viewport to consult. It reaches into
          the wheel's markup, which is only safe because that component
          renders exactly one `<ul>` — the legend. A `legendClassName`-style
          prop on ColorWheel would express this without the coupling. */}
      <div className="max-md:[&_ul]:hidden">
        <ColorWheel counts={counts} />
      </div>

      {/* Mobile-only twin of the legend: same twelve destinations, same
          labels and counts, as targets a thumb can land on. Hidden from `md`
          up, where the legend above is back and this would just repeat it. */}
      <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 md:hidden">
        {COLOR_BUCKETS.map((bucket) => {
          const count = counts[bucket.id] ?? 0;
          return (
            <li key={bucket.id}>
              <Link
                href={`/colours/${bucket.id}`}
                /* min-h-12 (48px) rather than the bare 44px minimum: two
                   stacked lines plus padding already exceed it, and the
                   floor only matters for the shortest label. */
                className="flex min-h-12 items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 transition-colors hover:border-[var(--ring)] hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span
                  aria-hidden
                  /* Ring is a flat black alpha rather than a token: it has
                     to read as an edge against both the pale white swatch
                     and the near-black one, in either theme. */
                  className="size-6 shrink-0 rounded-full ring-1 ring-black/15 ring-inset"
                  style={{ backgroundColor: bucket.swatch }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{bucket.label}</span>
                  <span className="block text-xs tabular-nums text-[var(--muted-foreground)]">
                    {count.toLocaleString()} work{count === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
