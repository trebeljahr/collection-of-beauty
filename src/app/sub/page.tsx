import type { Metadata } from "next";
import { SubscribeForm } from "@/components/subscribe-form";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Subscribe",
  description: `Five public-domain works, arranged around a single idea. One email from ${SITE_NAME}, every Sunday.`,
  alternates: { canonical: "/sub" },
  // Not in the navbar yet — keep this page out of search results until
  // the flow has been verified end-to-end in production.
  robots: { index: false, follow: false },
  openGraph: {
    title: `Subscribe · ${SITE_NAME}`,
    description: "Five works on one theme, every Sunday.",
  },
};

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">The Sunday edition</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Five works from the public-domain canon, arranged around a single theme. One email, every
          Sunday morning.
        </p>
      </header>

      <section className="space-y-6">
        <div className="space-y-3 text-[var(--foreground)] leading-relaxed">
          <p>
            Each edition stays with one theme across five works. Sometimes the theme is broad, like
            Hokusai's waves or Dutch interiors. Sometimes it's narrower than that, like the hour
            just after sunset, or the way Hammershøi paints an empty room.
          </p>
          <p>
            Small enough to read with coffee. Slow enough to actually look. Every image links back
            to its full record, with provenance and a longer reading, for the Sundays when one piece
            refuses to let you go.
          </p>
          <p>Curated by hand. No feed, no algorithm picking the next painting.</p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6">
          <SubscribeForm />
        </div>
      </section>
    </div>
  );
}
