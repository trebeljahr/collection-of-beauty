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
      </header>

      <ColorWheel counts={counts} />
    </div>
  );
}
