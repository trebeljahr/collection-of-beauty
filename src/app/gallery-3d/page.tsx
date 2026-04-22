import type { Metadata } from "next";
import { Gallery3D } from "@/components/gallery-3d";
import { artworks } from "@/lib/data";

export const metadata: Metadata = {
  title: "3D Gallery",
  description:
    "Walk through a virtual museum of themed rooms and view paintings in 3D at real scale. " +
    "A WebGL exhibit of the Collection of Beauty — Impressionist halls, Japanese print rooms, " +
    "natural-history galleries, each laid out like a real museum wing.",
  alternates: { canonical: "/gallery-3d" },
  openGraph: {
    title: "3D Gallery · Collection of Beauty",
    description:
      "Walk through themed rooms and view paintings in 3D at real scale. An immersive WebGL exhibit.",
  },
};

export default function Gallery3DPage() {
  // The 3D component filters/groups/selects rooms from this pool. We
  // pass every artwork and let it curate — no hand-picked list here.
  return <Gallery3D artworks={artworks} />;
}
