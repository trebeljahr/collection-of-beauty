import type { Metadata } from "next";
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
  openGraph: {
    title: "3D Gallery · Collection of Beauty",
    description:
      "Walk through a multi-floor virtual museum — one floor per era. " +
      "An immersive WebGL exhibit.",
  },
};

export default function Gallery3DPage() {
  return <Gallery3DClient />;
}
