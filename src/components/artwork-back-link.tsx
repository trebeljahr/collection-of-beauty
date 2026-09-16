"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type MouseEvent, Suspense } from "react";
import { touchTextLinkClasses } from "@/components/ui/pill";
import { previousPathname } from "@/lib/navigation-history";
import { encodeScope, parseScope, scopeHref } from "@/lib/scope-href";

type Props = {
  /** Label per encoded `?from=` scope this work can belong to, built on
   *  the server so the client needs no artist or plate-set data. */
  labels: Record<string, string>;
};

// The detail page is static, so `?from=` is only readable here. Until
// it is, the link points at the home gallery, which is also the answer
// for a work opened without a scope.
export function ArtworkBackLink({ labels }: Props) {
  return (
    <Suspense fallback={<BackLink href="/" label="gallery" />}>
      <ScopedBackLink labels={labels} />
    </Suspense>
  );
}

function ScopedBackLink({ labels }: Props) {
  const router = useRouter();
  const scope = parseScope(useSearchParams()?.get("from"));
  const href = scope ? scopeHref(scope) : "/";
  const label = scope ? labels[encodeScope(scope)] : "gallery";

  // When the visitor came from that page, go back through history
  // instead of pushing it again: the router cache renders it at once and
  // the browser restores the scroll position in a long grid. A push
  // refetches the page and starts at the top.
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (previousPathname() !== href.split("#")[0]) return;
    event.preventDefault();
    router.back();
  }

  return <BackLink href={href} label={label} onClick={onClick} />;
}

function BackLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string | undefined;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={touchTextLinkClasses}>
      ← Back{label ? ` to ${label}` : ""}
    </Link>
  );
}
