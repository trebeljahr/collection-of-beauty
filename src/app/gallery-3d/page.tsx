import type { Metadata, Viewport } from "next";
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
  `Walk through a museum of ${FLOOR_COUNT} floors in your browser: one floor per era, ` +
  `${GROUND_ERA} at ground level rising to ${TOP_ERA}, joined by a central spiral ` +
  "staircase. Paintings hang at their real-world size where the dimensions are known.";

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

// Route-scoped on purpose — do NOT hoist this to the root layout.
//
// `env(safe-area-inset-*)` resolves to 0px on iOS Safari and on Android
// Chrome unless the document opts in with `viewport-fit=cover`, so
// without this export every safe-area offset in the HUD
// (src/components/gallery-3d/index.tsx) silently computes to the flat
// fallback it was meant to replace.
//
// This route is the one surface that actually needs the opt-in: a
// full-bleed WebGL canvas, landscape-only, with HUD controls pinned hard
// against all four screen edges — exactly the geometry a notch or a
// home indicator overlaps. Setting `viewportFit: "cover"` globally would
// push *every* page's content under the notch and force a re-audit of
// each full-bleed surface on the site, which is a far bigger change than
// the one this route needs.
//
// Safe to state only the single field: Next merges `viewport` exports
// field-by-field down the segment chain rather than replacing the parent
// wholesale (see `mergeViewport` in next/dist/lib/metadata/
// resolve-metadata.js — it clones the resolved parent and overwrites only
// the keys present in the child object). The root layout's `themeColor`,
// `width` and `initialScale` therefore survive on this route; restating
// them here would just be a second copy to keep in sync.
export const viewport: Viewport = {
  viewportFit: "cover",
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
