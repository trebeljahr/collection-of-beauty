"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Button } from "@/components/ui/button";

const LABEL = "Confirm my subscription";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  useEffect(() => {
    if (!token) router.replace("/sub/error?reason=missing");
  }, [token, router]);
  if (!token) return <Placeholder />;
  return (
    <form
      method="post"
      action={`/api/newsletter/confirm?token=${encodeURIComponent(token)}`}
      className="mt-6"
    >
      <Button type="submit" className="h-11">
        {LABEL}
      </Button>
    </form>
  );
}

/** The static HTML, before the browser has read the token from the URL. */
function Placeholder() {
  return (
    <div className="mt-6">
      <Button type="button" className="h-11" disabled>
        {LABEL}
      </Button>
    </div>
  );
}

/**
 * The button that posts the token. The page is a static file, so the token
 * is read in the browser; a link without one goes to the error page.
 */
export function ConfirmForm() {
  return (
    <Suspense fallback={<Placeholder />}>
      <Form />
    </Suspense>
  );
}
