import type { Metadata } from "next";
import { PageBackdrop } from "@/components/page-backdrop";
import { SubscribeForm } from "@/components/subscribe-form";
import { artworkListings } from "@/lib/data";
import { buildOpenGraph, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Subscribe to Drops of Beauty",
  description: `Drops of Beauty — five public-domain works, arranged around a single idea, by email from ${SITE_NAME}.`,
  alternates: { canonical: "/sub" },
  // /drops is the indexable archive surface; /sub is the
  // signup conversion page reached from that archive (and direct links).
  robots: { index: false, follow: false },
  openGraph: buildOpenGraph({
    url: "/sub",
    title: `Drops of Beauty · ${SITE_NAME}`,
    description: "Five works on one theme, by email.",
  }),
};

// Tiled behind the top of the page: works for the themes the text below
// names, so the page shows what an issue could hold. Hokusai's waves,
// Dutch interiors (Vermeer) and the hour after sunset; the catalogue has
// no Hammershøi, so Menzel's and van Gogh's empty rooms stand in for his.
// Interleaved so every row mixes the themes; the first three are a
// phone's top row, the first eight the widest screen's. Not the latest
// edition's five: issue 1 includes a Kawase Hasui, whose German
// copyright status is still open (CLAUDE.md, "Copyright").
// Decoration, so an id that stops resolving drops that one tile.
const BACKDROP_IDS = [
  "collection-of-beauty-a-colored-version-of-the-big-wave-from-100-views-of-the-fuji-2nd-volume",
  "collection-of-beauty-femenine-wave",
  "collection-of-beauty-caspar-david-friedrich-mondaufgang-am-meer-google-art-project",
  "collection-of-beauty-adolph-menzel-das-balkonzimmer-google-art-project",
  "collection-of-beauty-whistler-nocturne-grey-and-gold-westminster-bridge-1871-1872-y145",
  "collection-of-beauty-johannes-vermeer-the-lacemaker-c-1669-1671",
  "collection-of-beauty-hokusai-1760-1849-ocean-waves",
  "collection-of-beauty-evening-landscape-at-moonrise-van-gogh",
  "collection-of-beauty-vincent-van-gogh-the-bedroom-google-art-project",
  "collection-of-beauty-johannes-vermeer-het-melkmeisje-google-art-project",
  "collection-of-beauty-jan-vermeer-van-delft-the-glass-of-wine-google-art-project",
  "collection-of-beauty-isaak-ilitsch-lewitan-005",
  "collection-of-beauty-johannes-vermeer-the-astronomer-1668",
  "collection-of-beauty-tsunami-by-hokusai-19th-century",
  "collection-of-beauty-james-abbot-mcneill-whistler-006",
  "collection-of-beauty-johannes-vermeer-the-geographer-google-art-project",
  "collection-of-beauty-moonrise-by-george-inness-1887",
  "collection-of-beauty-jan-vermeer-the-art-of-painting-google-art-project",
  "collection-of-beauty-2560px-the-big-wave-from-100-views-of-the-fuji-2nd-volume",
  "collection-of-beauty-john-atkinson-grimshaw-boar-lane-leeds",
  "collection-of-beauty-monet-w1296",
  "collection-of-beauty-hiroshige-view-of-a-long-bridge-across-a-lake",
];
const byId = new Map(artworkListings.map((a) => [a.id, a]));
const BACKDROP = BACKDROP_IDS.flatMap((id) => byId.get(id) ?? []);

export default function SubscribePage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageBackdrop works={BACKDROP} />
      <div className="mx-auto max-w-2xl px-4 pb-10 md:pb-16">
        <header className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl">Drops of Beauty</h1>
          <p className="mt-3 text-[var(--muted-foreground)]">
            Five public-domain works, arranged around a single theme, by email.
          </p>
        </header>

        <section className="space-y-6">
          <div className="space-y-3 text-[var(--foreground)] leading-relaxed">
            <p>
              Each edition stays with one theme across five works. Sometimes the theme is broad,
              like Hokusai's waves or Dutch interiors. Sometimes it's narrower than that, like the
              hour just after sunset, or the way Hammershøi paints an empty room.
            </p>
            <p>Picked by hand. Nothing is chosen for you by an algorithm.</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6">
            <SubscribeForm />
          </div>
        </section>
      </div>
    </div>
  );
}
