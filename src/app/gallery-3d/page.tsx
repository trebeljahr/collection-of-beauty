import type { Metadata } from "next";
import { ERAS } from "@/lib/gallery-eras";
import { buildOpenGraph, SITE_NAME } from "@/lib/seo";
import { Gallery3DClient } from "./gallery-3d-client";

// Three.js + R3F + drei + postprocessing is ~600 KB gzipped; the
// Gallery3DClient wrapper performs the `dynamic(..., { ssr: false })`
// import (a Server Component can't do that directly in Next 16) so
// the route shell renders immediately and the loading.tsx fallback
// shows while the bundle downloads.

// Floor count and the era names at either end come from the era table so
// the copy can't claim a building the layout no longer builds. The old
// hand-written version had drifted: it placed Ukiyo-e "between
// Romanticism and Impressionism", but the East Asian Painting floor sits
// between Realism and Impressionism.
const FLOOR_COUNT = ERAS.length;
const GROUND_ERA = ERAS[0]?.title ?? "the earliest era";
const TOP_ERA = ERAS[ERAS.length - 1]?.title ?? "the most recent era";

// Short enough that the root layout's "%s · Collection of Beauty"
// template still fits inside a search result; the fuller sentence goes
// on the OG card, which has room for it.
const MUSEUM_TITLE = `The Museum — ${FLOOR_COUNT} walkable floors`;

// "Every canonical work on a wall" used to sit in this description. It
// stopped being true when the floor builder started capping a storey at
// MAX_WORKS_PER_FLOOR and sampling the overflow across artists (see
// selectFloorWorks in gallery-layout/layout-museum.ts), so the copy now
// says what the building actually hangs.
const MUSEUM_DESCRIPTION =
  `Walk through a museum of ${FLOOR_COUNT} floors in your browser: each art era is its own ` +
  `floor, ${GROUND_ERA} at ground level rising to ${TOP_ERA} at the top, all joined by a ` +
  "central spiral staircase. Paintings hang at their real-world size where the dimensions " +
  "are known — big canvases in the galleries, small works in the corridors. Built with " +
  "WebGL; no install, no login.";

export const metadata: Metadata = {
  title: MUSEUM_TITLE,
  description: MUSEUM_DESCRIPTION,
  alternates: { canonical: "/gallery-3d" },
  // Same path as alternates.canonical above, so og:url and the canonical
  // can't drift; the helper keeps og:type/og:site_name/og:image, which a
  // bare openGraph literal would drop from the root layout's block.
  openGraph: buildOpenGraph({
    title: `The Museum — walk ${FLOOR_COUNT} floors of public-domain art · ${SITE_NAME}`,
    description: MUSEUM_DESCRIPTION,
    url: "/gallery-3d",
  }),
};

export default function Gallery3DPage() {
  return (
    <>
      {/* The route is a full-bleed WebGL canvas with no chrome of its own,
          so the page's only heading has to be screen-reader/crawler-only —
          `sr-only` keeps it out of the layout without hiding it from either. */}
      {/* Phrased to avoid an article in front of FLOOR_COUNT — "a 11-storey"
          is what a hardcoded "a" produces once the era table changes. */}
      <h1 className="sr-only">
        The Museum — walk through {FLOOR_COUNT} floors of public-domain art, one per era, joined by
        a central spiral staircase
      </h1>
      <Gallery3DClient />
    </>
  );
}
