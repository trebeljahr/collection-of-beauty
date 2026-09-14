import type { Metadata } from "next";
import { SubscribeForm } from "@/components/subscribe-form";
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

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Drops of Beauty</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Five public-domain works, arranged around a single theme, by email.
        </p>
      </header>

      <section className="space-y-6">
        <div className="space-y-3 text-[var(--foreground)] leading-relaxed">
          <p>
            Each edition stays with one theme across five works. Sometimes the theme is broad, like
            Hokusai's waves or Dutch interiors. Sometimes it's narrower than that, like the hour
            just after sunset, or the way Hammershøi paints an empty room.
          </p>
          <p>Picked by hand. Nothing is chosen for you by an algorithm.</p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6">
          <SubscribeForm />
        </div>
      </section>
    </div>
  );
}
