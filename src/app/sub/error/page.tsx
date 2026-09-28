import type { Metadata } from "next";
import Link from "next/link";
import { PageBackdrop } from "@/components/page-backdrop";
import { artworkListings } from "@/lib/data";

export const metadata: Metadata = {
  title: "Subscription link problem",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, string> = {
  missing: "The confirmation link was missing its token. Try subscribing again.",
  malformed: "The confirmation link is malformed. Try subscribing again.",
  bad_signature: "The confirmation link is invalid. Try subscribing again.",
  expired: "This confirmation link has expired. Please resubscribe to get a fresh one.",
  list_add_failed:
    "Something went wrong on our end while adding you to the list. Please try again.",
};

// A strip of letters, readers and a wait across the top: the link that
// failed came in an email. Only the banner (`strip`), since the page is a
// few lines tall and a full backdrop would run on past it into the footer.
// Order as on /sub: the first three are a phone's top row, the first eight
// the widest screen's. An id that stops resolving drops that one tile.
const BACKDROP_IDS = [
  "collection-of-beauty-carl-spitzweg-013",
  "collection-of-beauty-john-singleton-copley-portrait-of-a-lady-google-art-project-28754530",
  "collection-of-beauty-carl-spitzweg-der-briefbote-im-rosenthal",
  "collection-of-beauty-jean-honore-fragonard-the-love-letter",
  "collection-of-beauty-johannes-vermeer-a-lady-writing-google-art-project",
  "collection-of-beauty-edgar-degas-waiting-google-art-project",
  "collection-of-beauty-the-secret-message-by-francois-boucher",
  "collection-of-beauty-the-doorway-met-dp811134",
  "collection-of-beauty-woman-writing-a-letter-with-her-maid-by-johannes-vermeer",
  "collection-of-beauty-jan-vermeer-van-delft-brieflezend-meisje-bij-het-venster-ca-1657-59",
  "collection-of-beauty-eugen-von-blaas-sharing-the-news-1904",
  "collection-of-beauty-rembrandt-scholar-at-the-lectern",
  "collection-of-beauty-fragonard-the-reader",
  "collection-of-beauty-sandro-botticelli-050",
  "collection-of-beauty-the-sorrows-of-love-painting",
  "collection-of-beauty-claude-monet-in-the-woods-at-giverny-blanche-hoschede-at-her-easel-with-suzanne-hoschede-reading-go",
];
const byId = new Map(artworkListings.map((a) => [a.id, a]));
const BACKDROP = BACKDROP_IDS.flatMap((id) => byId.get(id) ?? []);

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  // Index with a coalesced key rather than guarding on `reason` first: an
  // empty `?reason=` short-circuits `reason && …` to `""`, which `??`
  // happily keeps, and the page renders its heading over a blank line.
  const message =
    MESSAGES[reason ?? ""] ?? "We couldn't confirm your subscription. Please try again.";

  return (
    <div className="relative isolate overflow-x-clip">
      <PageBackdrop works={BACKDROP} strip />
      <div className="mx-auto max-w-xl px-4 pb-16 text-center">
        <h1 className="font-serif text-3xl md:text-4xl">Hmm.</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">{message}</p>
        <p className="mt-8 flex justify-center gap-6 text-sm">
          <Link href="/sub" className="underline underline-offset-2 hover:opacity-70">
            Try again
          </Link>
          <Link href="/" className="underline underline-offset-2 hover:opacity-70">
            Back to the gallery
          </Link>
        </p>
      </div>
    </div>
  );
}
