import type { Metadata } from "next";
import { SubscribeForm } from "@/components/subscribe-form";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Subscribe",
  description: `Subscribe to the ${SITE_NAME} weekly digest — five public-domain works in your inbox every Sunday.`,
  alternates: { canonical: "/sub" },
  // Not in the navbar yet — keep this page out of search results until
  // the flow has been verified end-to-end in production.
  robots: { index: false, follow: false },
  openGraph: {
    title: `Subscribe · ${SITE_NAME}`,
    description: "Five public-domain works in your inbox, every Sunday.",
  },
};

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Weekly digest</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          A short email with five public-domain works from the collection, every Sunday. No tracking
          pixels beyond what Mailgun adds for open/click counts, no algorithmic re-shuffling, no
          upsells.
        </p>
      </header>

      <section className="space-y-6">
        <div className="space-y-3 text-[var(--foreground)] leading-relaxed">
          <p>
            Each issue pulls five works at random from across the {SITE_NAME} catalogue — paintings,
            woodblock prints, natural-history plates, and the occasional surprise — and lays them
            out as full-bleed images with a paragraph of context for each.
          </p>
          <p>
            Subscriptions are confirmed by a one-click email so nobody can sign you up without your
            knowledge. After confirming, you can unsubscribe from any issue's footer.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6">
          <SubscribeForm />
        </div>
      </section>
    </div>
  );
}
