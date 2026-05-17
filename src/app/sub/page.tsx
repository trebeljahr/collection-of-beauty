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
    description: "Five works, one idea, every Sunday.",
  },
};

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">The Sunday edition</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Five works from the public-domain canon, arranged around a single idea — a motif, a
          movement, a palette, a particular hour of light. One email, every Sunday morning.
        </p>
      </header>

      <section className="space-y-6">
        <div className="space-y-3 text-[var(--foreground)] leading-relaxed">
          <p>
            Some weeks it's Hokusai's waves beside Turner's storms. Some weeks it's nothing but red,
            or interiors lit by a single window, or every horse in the catalogue running the same
            direction. Five pieces, chosen by hand, with a few sentences on why they belong
            together.
          </p>
          <p>
            Small enough to read with coffee. Slow enough to actually look. Every image links back
            to the full record — where the work lives now, what it's made of, who painted it — for
            the Sundays when one piece refuses to let you go.
          </p>
          <p>
            No feed. No recommendations following you across the web. No algorithm deciding which
            painting you ought to want next.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6">
          <SubscribeForm />
        </div>
      </section>
    </div>
  );
}
