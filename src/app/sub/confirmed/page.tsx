import type { Metadata } from "next";
import Link from "next/link";
import { ConfettiBurst } from "@/components/confetti-burst";

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

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <ConfettiBurst />
      <h1 className="font-serif text-3xl md:text-4xl">You&apos;re in.</h1>
      {welcomeSent ? (
        <>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Your subscription is confirmed — and we&apos;ve just sent the most recent issue to your
            inbox so you can see what an edition actually looks like.
          </p>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Future issues will arrive at the usual cadence.
          </p>
        </>
      ) : (
        <p className="mt-4 text-[var(--muted-foreground)]">
          Your subscription is confirmed. The next issue will arrive at the usual cadence.
        </p>
      )}
      <p className="mt-8 flex justify-center gap-6 text-sm">
        <Link href="/newsletter" className="underline underline-offset-2 hover:opacity-70">
          Browse the archive →
        </Link>
        <Link href="/" className="underline underline-offset-2 hover:opacity-70">
          Back to the gallery
        </Link>
      </p>
    </div>
  );
}
