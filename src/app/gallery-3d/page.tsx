import type { Metadata } from "next";
import { Gallery3D } from "@/components/gallery-3d";
import { artworks } from "@/lib/data";

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
  // The slide-in-from-top choreography lives on loading.tsx, not here.
  // Loading.tsx renders during the route's pending state (while the
  // WebGL bundle streams) and slides in from the top to pair with the
  // SiteNav modal's slide-out-down. When the chunk lands, page.tsx
  // replaces loading.tsx in place — no animation, no flash of the
  // layout bg behind a sliding panel. Direct navigation skips
  // loading.tsx entirely (Next only uses it for client transitions);
  // those visits arrive on the gallery without choreography, which is
  // fine — there's no menu to coordinate with.
  return <Gallery3D artworks={artworks} />;
}
