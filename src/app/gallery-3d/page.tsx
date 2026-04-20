import { Gallery3D } from "@/components/gallery-3d";
import { artworks, type Artwork } from "@/lib/data";

const CURATED_IDS = [
  "collection-of-beauty-starry-night-over-the-rhone",
  "collection-of-beauty-vincent-van-gogh-1853-1890-cafeterras-bij-nacht-place-du-forum-kroller-muller-museum-otterlo-23-8-2",
  "collection-of-beauty-claude-monet-la-corniche-near-monaco-google-art-project",
  "collection-of-beauty-claude-monet-nympheas-1905",
  "collection-of-beauty-1665-girl-with-a-pearl-earring",
  "collection-of-beauty-johannes-jan-vermeer-christ-in-the-house-of-martha-and-mary-google-art-project",
  "collection-of-beauty-edvard-munch-1893-the-scream-oil-tempera-and-pastel-on-cardboard-91-x-73-cm-national-gallery-of-nor",
  "collection-of-beauty-the-rising-squall-hot-wells-from-st-vincent-s-rock-bristol",
  "collection-of-beauty-tsunami-by-hokusai-19th-century",
  "collection-of-beauty-tenman-bridge-at-settsu-province-sesshu-tenmanbashi-from-the-series-remarkable-views-of-bridges-in-",
  "collection-of-beauty-sandro-botticelli-la-nascita-di-venere-google-art-project-edited",
  "collection-of-beauty-venus-and-mars-national-gallery",
];

export const metadata = {
  title: "3D Gallery · Collection of Beauty",
  description:
    "Walk through a virtual gallery room and view curated paintings in 3D.",
};

export default function Gallery3DPage() {
  const byId = new Map(artworks.map((a) => [a.id, a]));
  const picks = CURATED_IDS.map((id) => byId.get(id)).filter(
    (a): a is Artwork => a != null,
  );

  return <Gallery3D artworks={picks} />;
}
