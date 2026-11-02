import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IMPRINT_EMAIL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

const writeToUs = (
  <a href={`mailto:${IMPRINT_EMAIL}`} className="underline underline-offset-2 hover:opacity-70">
    {IMPRINT_EMAIL}
  </a>
);

/**
 * Where the welcome issue's footer link lands. The page reads nothing and
 * changes nothing: `POST /api/newsletter/unsubscribe` checks the token when
 * the button is pressed, and sends the visitor back here with the outcome.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; failed?: string }>;
}) {
  const { token, done, failed } = await searchParams;

  if (done === "1") {
    return (
      <Message title="You're unsubscribed.">
        No further editions of <em>Drops of Beauty</em> will go to this address. It stays on file,
        marked as unsubscribed, so it is not mailed again. To have it deleted, write to {writeToUs}.
      </Message>
    );
  }

  if (typeof token !== "string" || token.length === 0) {
    return (
      <Message title="Hmm.">
        This unsubscribe link is broken. Write to {writeToUs} and the address will be taken off the
        list by hand.
      </Message>
    );
  }

  return (
    <Message title="Unsubscribe from Drops of Beauty?">
      {failed === "1" ? (
        <>
          That didn&apos;t go through, so this address is still on the list. Press the button again,
          or write to {writeToUs}.
        </>
      ) : (
        <>
          The button takes this address off the list. It is a button because mail filters open every
          link in an email, and a link alone would unsubscribe people by accident.
        </>
      )}
      <form
        method="post"
        action={`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`}
        className="mt-6"
      >
        <Button type="submit" className="h-11">
          Unsubscribe
        </Button>
      </form>
    </Message>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-serif text-3xl md:text-4xl">{title}</h1>
      <div className="mt-4 text-[var(--muted-foreground)]">{children}</div>
      <p className="mt-8 text-sm">
        <Link href="/" className="underline underline-offset-2 hover:opacity-70">
          Back to the gallery
        </Link>
      </p>
    </div>
  );
}
