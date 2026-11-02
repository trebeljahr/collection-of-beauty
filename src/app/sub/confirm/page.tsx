import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false, follow: false },
};

/**
 * Where the confirmation email's link lands. The page reads nothing and
 * changes nothing: `POST /api/newsletter/confirm` checks the token when the
 * button is pressed, and sends the visitor on to the outcome.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    redirect("/sub/error?reason=missing");
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-serif text-3xl md:text-4xl">Confirm your subscription?</h1>
      <div className="mt-4 text-[var(--muted-foreground)]">
        Nothing has changed yet. The button puts this address on the list for{" "}
        <em>Drops of Beauty</em>. It is a button because mail filters open every link in an email,
        and a link alone could sign up people who never asked. If you didn&apos;t sign up, close
        this page.
        <form
          method="post"
          action={`/api/newsletter/confirm?token=${encodeURIComponent(token)}`}
          className="mt-6"
        >
          <Button type="submit" className="h-11">
            Confirm my subscription
          </Button>
        </form>
      </div>
      <p className="mt-8 text-sm">
        <Link href="/" className="underline underline-offset-2 hover:opacity-70">
          Back to the gallery
        </Link>
      </p>
    </div>
  );
}
