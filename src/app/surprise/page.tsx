import type { Metadata } from "next";
import { SurpriseView } from "@/components/surprise-view";
import { buildOpenGraph, SITE_NAME } from "@/lib/seo";
import { SURPRISE_DECK_SIZE, sampleDistinct } from "@/lib/surprise";
import { SURPRISE_POOL } from "@/lib/surprise-pool";

// The whole point of the route is a different work on every hit, so it
// must never be prerendered — a static /surprise would serve whatever
// was picked at build time to every visitor forever. force-dynamic also
// makes Next send no-store, which keeps any proxy in front of the
// Coolify container from pinning one work either.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  `One work from the collection, picked at random and shown as large as your screen allows. ` +
  `Tap again for another.`;

export const metadata: Metadata = {
  title: "Surprise me",
  description: DESCRIPTION,
  alternates: { canonical: "/surprise" },
  // Site-level OG image, deliberately: the page's actual content
  // changes on every request, so a per-work og:image would be a
  // coin-flip that never matches what the person clicking the link
  // ends up seeing.
  openGraph: buildOpenGraph({
    url: "/surprise",
    title: `Surprise me · ${SITE_NAME}`,
    description: DESCRIPTION,
  }),
  // Nothing stable to index — every crawl sees a different painting, so
  // an indexed snippet would describe a page that no longer exists in
  // that form, and the work itself is already indexed at /artwork/[id].
  // `follow` is kept on purpose: each fetch hands the crawler a fresh
  // in-corpus link. Also left out of the sitemap for the same reason.
  robots: { index: false, follow: true },
};

export default function SurprisePage() {
  const deck = sampleDistinct(SURPRISE_POOL, SURPRISE_DECK_SIZE);

  return <SurpriseView deck={[...deck]} />;
}
