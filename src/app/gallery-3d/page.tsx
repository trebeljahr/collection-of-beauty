import { GalleryDungeon } from "@/components/gallery-dungeon";
import { artworks } from "@/lib/data";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "3D Gallery",
  description:
    "Walk through a multi-floor virtual museum: seven eras stacked on " +
    "top of each other, Gothic at ground level rising to Modernism at " +
    "the top, staircases between. A WebGL exhibit of the Collection of " +
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
  return <GalleryDungeon artworks={artworks} />;
}
