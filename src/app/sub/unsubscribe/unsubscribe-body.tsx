"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { IMPRINT_EMAIL } from "@/lib/links";

const writeToUs = (
  <a href={`mailto:${IMPRINT_EMAIL}`} className="underline underline-offset-2 hover:opacity-70">
    {IMPRINT_EMAIL}
  </a>
);

const ASK = "Unsubscribe from Drops of Beauty?";
const WHY = (
  <>
    The button takes this address off the list. It is a button because mail filters open every link
    in an email, and a link alone would unsubscribe people by accident.
  </>
);

function Body() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  if (params.get("done") === "1") {
    return (
      <Message title="You're unsubscribed.">
        No further editions of <em>Drops of Beauty</em> will go to this address. It stays on file,
        marked as unsubscribed, so it is not mailed again. To have it deleted, write to {writeToUs}.
      </Message>
    );
  }

  if (!token) {
    return (
      <Message title="Hmm.">
        This unsubscribe link is broken. Write to {writeToUs} and the address will be taken off the
        list by hand.
      </Message>
    );
  }

  return (
    <Message title={ASK}>
      {params.get("failed") === "1" ? (
        <>
          That didn&apos;t go through, so this address is still on the list. Press the button again,
          or write to {writeToUs}.
        </>
      ) : (
        WHY
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

/** The static HTML, before the browser has read the query string. */
function Placeholder() {
  return (
    <Message title={ASK}>
      {WHY}
      <div className="mt-6">
        <Button type="button" className="h-11" disabled>
          Unsubscribe
        </Button>
      </div>
    </Message>
  );
}

/**
 * Where the welcome issue's footer link lands, and where the button's post
 * comes back to with its outcome (`?done=1`, `?invalid=1`, `?failed=1`).
 * The page is a static file, so the query is read in the browser.
 */
export function UnsubscribeBody() {
  return (
    <Suspense fallback={<Placeholder />}>
      <Body />
    </Suspense>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
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
