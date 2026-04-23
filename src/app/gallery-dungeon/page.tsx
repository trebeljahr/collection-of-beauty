import type { Metadata } from "next";
import { GalleryDungeon } from "@/components/gallery-dungeon";
import { artworks } from "@/lib/data";

export const metadata: Metadata = {
  title: "Dungeon gallery · debug",
  description:
    "Multi-floor 3D gallery prototype — walk through procedurally laid " +
    "rooms connected by corridors. In-progress.",
  robots: { index: false, follow: false },
};

export default function GalleryDungeonPage() {
  return <GalleryDungeon artworks={artworks} />;
}
