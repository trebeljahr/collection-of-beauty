import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false, follow: false },
};

/**
 * Where the confirmation email's link lands. The page reads nothing and
 * changes nothing: `POST /api/newsletter/confirm` (the API Worker) checks
 * the token when the button is pressed, and sends the visitor on to the
 * outcome.
 */
export default function ConfirmPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-serif text-3xl md:text-4xl">Confirm your subscription?</h1>
      <div className="mt-4 text-[var(--muted-foreground)]">
        Nothing has changed yet. The button puts this address on the list for{" "}
        <em>Drops of Beauty</em>. It is a button because mail filters open every link in an email,
        and a link alone could sign up people who never asked. If you didn&apos;t sign up, close
        this page.
        <ConfirmForm />
      </div>
      <p className="mt-8 text-sm">
        <Link href="/" className="underline underline-offset-2 hover:opacity-70">
          Back to the gallery
        </Link>
      </p>
    </div>
  );
}
