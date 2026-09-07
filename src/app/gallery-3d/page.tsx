import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/seo";
import { Gallery3DClient } from "./gallery-3d-client";

// Three.js + R3F + drei + postprocessing is ~600 KB gzipped; the
// Gallery3DClient wrapper performs the `dynamic(..., { ssr: false })`
// import (a Server Component can't do that directly in Next 16) so
// the route shell renders immediately and the loading.tsx fallback
// shows while the bundle downloads.

export const metadata: Metadata = {
  title: "3D Gallery",
  description:
    "Walk through a multi-floor virtual museum: each art era is its own " +
    "floor, Gothic at ground level rising to Modernism at the top, with " +
    "Ukiyo-e woodblock prints between Romanticism and Impressionism, all " +
    "connected by a central spiral staircase. A WebGL exhibit of the Collection of " +
    "Beauty with every canonical work on a wall — big paintings in the " +
    "galleries, small works in the corridors.",
  alternates: { canonical: "/gallery-3d" },
  // Same path as alternates.canonical above, so og:url and the canonical
  // can't drift; the helper keeps og:type/og:site_name/og:image, which a
  // bare openGraph literal would drop from the root layout's block.
  openGraph: buildOpenGraph({
    title: "3D Gallery · Collection of Beauty",
    description:
      "Walk through a multi-floor virtual museum — one floor per era. " +
      "An immersive WebGL exhibit.",
    url: "/gallery-3d",
  }),
};

export default function Gallery3DPage() {
  return (
    <>
      {/* The route is a full-bleed WebGL canvas with no chrome of its own,
          so the page's only heading has to be screen-reader/crawler-only —
          `sr-only` keeps it out of the layout without hiding it from either. */}
      <h1 className="sr-only">
        3D Gallery — walk through a multi-floor virtual museum, one floor per era
      </h1>
      <Gallery3DClient />
    </>
  );
}
