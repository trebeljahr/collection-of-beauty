import type { Metadata } from "next";
import Link from "next/link";
import { ConfettiBurst } from "@/components/confetti-burst";
import { EditionFan } from "@/components/edition-fan";
import { artworkListings } from "@/lib/data";
import { loadUiVisibleEditions } from "@/lib/newsletter/editions";

export const metadata: Metadata = {
  title: "Subscription confirmed",
  robots: { index: false, follow: false },
};

/** The latest edition and its works: the issue the welcome email just sent. */
function latestEditionFan() {
  const edition = loadUiVisibleEditions().at(-1);
  if (!edition) return null;
  const byId = new Map(artworkListings.map((a) => [a.id, a]));
  // Decoration, so a missing id drops one card instead of failing the page.
  const works = edition.artworks.flatMap((entry) => byId.get(entry.id) ?? []);
  return works.length > 0 ? { edition, works } : null;
}

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const welcomeSent = welcome === "1";
  const fan = latestEditionFan();

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <ConfettiBurst />
      <h1 className="font-serif text-3xl md:text-4xl">You&apos;re in.</h1>
      <p className="mt-3 text-[var(--muted-foreground)]">
        Subscribed to <em>Drops of Beauty</em>.
      </p>
      {welcomeSent && (
        <p className="mt-4 text-[var(--muted-foreground)]">
          We&apos;ve just sent the most recent issue to your inbox so you can see what an edition
          actually looks like.
        </p>
      )}
      <p className="mt-8 flex justify-center gap-6 text-sm">
        <Link href="/drops" className="underline underline-offset-2 hover:opacity-70">
          Browse the archive →
        </Link>
        <Link href="/" className="underline underline-offset-2 hover:opacity-70">
          Back to the gallery
        </Link>
      </p>
      {fan && (
        <section className="mt-14 md:mt-20">
          <EditionFan works={fan.works} />
          <Link
            href={`/newsletter/${fan.edition.fileSlug}`}
            className="group mt-2 inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Issue {fan.edition.number}
            </span>
            <span className="mt-1 block font-serif text-xl leading-tight transition-opacity group-hover:opacity-70">
              {fan.edition.title}
            </span>
          </Link>
        </section>
      )}
    </div>
  );
}
