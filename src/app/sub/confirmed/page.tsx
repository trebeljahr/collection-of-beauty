import type { Metadata } from "next";
import Link from "next/link";
import { ConfettiBurst } from "@/components/confetti-burst";
import { daysUntilNextPublishDay } from "@/lib/newsletter/cadence";

// Day-count math should reflect when the user lands on the page, not when
// the build ran — keep this dynamic.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subscription confirmed",
  robots: { index: false, follow: false },
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const welcomeSent = welcome === "1";
  const daysToNextSunday = daysUntilNextPublishDay();
  const dayWord = daysToNextSunday === 1 ? "day" : "days";

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
      <p className={`${welcomeSent ? "mt-3" : "mt-4"} text-[var(--muted-foreground)]`}>
        The next regular issue is expected <strong>next Sunday</strong> — in {daysToNextSunday}{" "}
        {dayWord}.
      </p>
      <p className="mt-8 flex justify-center gap-6 text-sm">
        <Link href="/drops" className="underline underline-offset-2 hover:opacity-70">
          Browse the archive →
        </Link>
        <Link href="/" className="underline underline-offset-2 hover:opacity-70">
          Back to the gallery
        </Link>
      </p>
    </div>
  );
}
