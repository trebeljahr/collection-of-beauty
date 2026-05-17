import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Subscription confirmed",
  robots: { index: false, follow: false },
};

export default function ConfirmedPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-serif text-3xl md:text-4xl">You're in.</h1>
      <p className="mt-4 text-[var(--muted-foreground)]">
        Your subscription is confirmed. The next issue lands in your inbox on Sunday — five
        public-domain works, no extra noise.
      </p>
      <p className="mt-8">
        <Link href="/" className="text-sm underline underline-offset-2 hover:opacity-70">
          ← Back to the gallery
        </Link>
      </p>
    </div>
  );
}
