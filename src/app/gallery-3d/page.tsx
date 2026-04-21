import { Gallery3D } from "@/components/gallery-3d";
import { artworks } from "@/lib/data";

export const metadata = {
  title: "3D Gallery · Collection of Beauty",
  description:
    "Walk through a virtual museum of themed rooms and view paintings in 3D at real scale.",
};

export default function Gallery3DPage() {
  // The 3D component filters/groups/selects rooms from this pool. We
  // pass every artwork and let it curate — no hand-picked list here.
  return <Gallery3D artworks={artworks} />;
}
