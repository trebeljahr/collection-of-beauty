"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type MouseEvent, Suspense, useEffect, useMemo } from "react";
import { useLightbox } from "@/components/lightbox-provider";
import { touchTextLinkClasses } from "@/components/ui/pill";
import { getEra } from "@/lib/gallery-eras";
import { noteReplace, pathnameOf, previousPathname } from "@/lib/navigation-history";
import {
  artworkHref,
  encodeScope,
  parseScopeParams,
  type Scope,
  type ScopeFilter,
  scopeHref,
} from "@/lib/scope-href";
import { useScopeOrder } from "@/lib/use-scope-order";
import { useTransitionPush } from "@/lib/use-transition-nav";

type Props = {
  id: string;
  /** Neighbours in catalogue order: the walk for a work opened without a
   *  scope, and the server-rendered links before the scope is known. */
  prevId: string | null;
  nextId: string | null;
  /** Label per encoded `?from=` scope this work can belong to, built on
   *  the server so the client needs no artist or plate-set data. */
  labels: Record<string, string>;
};

// The detail page is static, so `?from=` is only readable on the client.
// Until it is, the bar shows the catalogue-order links and a link back
// to the home gallery, which is also the answer for a work opened
// without a scope.
export function ArtworkScopeNav(props: Props) {
  return (
    <Suspense
      fallback={
        <NavBar
          back={{ href: "/", label: "gallery" }}
          prevHref={catalogueHref(props.prevId)}
          nextHref={catalogueHref(props.nextId)}
        />
      }
    >
      <ScopedNav {...props} />
    </Suspense>
  );
}

function ScopedNav({ id, prevId, nextId, labels }: Props) {
  const router = useRouter();
  const transitionPush = useTransitionPush();
  const { isOpen: lightboxOpen } = useLightbox();
  const search = useSearchParams()?.toString() ?? "";
  const scope = useMemo(() => parseScopeParams(new URLSearchParams(search)), [search]);
  const order = useScopeOrder(scope);

  // Prev/next walk the scope's own order, and stop at its ends rather
  // than spilling into the rest of the collection. Until that order has
  // arrived both are disabled, so an early click can't leave the scope.
  // A scope that failed to load, or that this work isn't part of (a
  // hand-edited URL), falls back to catalogue order.
  let prevHref = catalogueHref(prevId);
  let nextHref = catalogueHref(nextId);
  let position: { index: number; total: number } | null = null;
  if (scope && (order === null || order.status === "loading")) {
    prevHref = null;
    nextHref = null;
  } else if (scope && order?.status === "ready") {
    const index = order.positions.get(id);
    if (index !== undefined) {
      const { ids } = order;
      prevHref = index > 0 ? artworkHref(ids[index - 1], scope) : null;
      nextHref = index < ids.length - 1 ? artworkHref(ids[index + 1], scope) : null;
      position = { index, total: ids.length };
    }
  }

  const back = {
    href: scope ? scopeHref(scope) : "/",
    label: scope ? labels[encodeScope(scope)] : "gallery",
  };

  useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
  }, [prevHref, nextHref, router]);

  // Page-level arrow keys. Skipped while the lightbox is open — it binds
  // its own arrows, which swap the modal image instead.
  useEffect(() => {
    if (lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      const href = e.key === "ArrowLeft" ? prevHref : e.key === "ArrowRight" ? nextHref : null;
      if (!href) return;
      e.preventDefault();
      noteReplace(href);
      transitionPush(href, { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, prevHref, nextHref, transitionPush]);

  // When the visitor came from that page, go back through history
  // instead of pushing it again: the router cache renders it at once and
  // the browser restores the scroll position in a long grid. A push
  // refetches the page and starts at the top. Prev/next replace the
  // history entry, so after any number of steps the page behind this one
  // is still the gallery the walk started from.
  function onBack(event: MouseEvent<HTMLAnchorElement>) {
    if (isModifiedClick(event)) return;
    if (previousPathname() !== pathnameOf(back.href)) return;
    event.preventDefault();
    router.back();
  }

  return (
    <NavBar
      back={back}
      onBack={onBack}
      prevHref={prevHref}
      nextHref={nextHref}
      context={scope && position ? scopePhrase(scope, labels[encodeScope(scope)]) : null}
      position={position}
    />
  );
}

function NavBar({
  back,
  onBack,
  prevHref,
  nextHref,
  context = null,
  position = null,
}: {
  back: { href: string; label: string | undefined };
  onBack?: (event: MouseEvent<HTMLAnchorElement>) => void;
  prevHref: string | null;
  nextHref: string | null;
  context?: string | null;
  position?: { index: number; total: number } | null;
}) {
  return (
    <div className="text-sm text-[var(--muted-foreground)]">
      <div className="flex items-center justify-between">
        <Link href={back.href} onClick={onBack} className={touchTextLinkClasses}>
          ← Back{back.label ? ` to ${back.label}` : ""}
        </Link>
        {/* gap-4 rather than gap-3 on phones: "Next →" is only just past
            44px wide, so a little more dead space between the two
            44px-tall targets keeps a thumb from catching the wrong one.
            The targets shrink back at `sm:`, so the gap does too. */}
        <div className="flex items-center gap-4 sm:gap-3">
          <StepLink href={prevHref} rel="prev">
            ← Previous
          </StepLink>
          <StepLink href={nextHref} rel="next">
            Next →
          </StepLink>
        </div>
      </div>
      {/* Always rendered, empty or not, and exactly the 24px the row's
          bottom margin used to be: the scope is only known after
          hydration, and a line appearing then would push the whole page
          down. One line, truncated, for the same reason. The count sits
          under Previous / Next, the steps it counts. */}
      <p className="flex h-6 items-center justify-between gap-4 text-xs">
        <span className="truncate" title={context ?? undefined}>
          {context}
        </span>
        {position && (
          <span className="shrink-0 tabular-nums">
            {(position.index + 1).toLocaleString("en-US")} of{" "}
            {position.total.toLocaleString("en-US")}
          </span>
        )}
      </p>
    </div>
  );
}

/** Previous / Next, or the same words greyed out at either end of the
 *  walk. Both stay in place so the one that is still live doesn't jump
 *  sideways when its partner disappears. */
function StepLink({
  href,
  rel,
  children,
}: {
  href: string | null;
  rel: "prev" | "next";
  children: string;
}) {
  if (!href) {
    return (
      <span aria-disabled="true" className={disabledStepClasses}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={rel}
      replace
      onClick={(event) => {
        if (!isModifiedClick(event)) noteReplace(href);
      }}
      className={touchTextLinkClasses}
    >
      {children}
    </Link>
  );
}

/** touchTextLinkClasses' box without the underline or focus ring: same
 *  size and position as the live link, so nothing moves when one end of
 *  the walk is reached. Its own string rather than an override, because
 *  a later `no-underline` does not beat `underline` in Tailwind v4. */
const disabledStepClasses =
  "-my-3 inline-flex min-h-11 cursor-default items-center opacity-40 sm:my-0 sm:inline sm:min-h-0";

/** What the walk is over, in the words of the page it started on. */
function scopePhrase(scope: Scope, label: string | undefined): string {
  if (scope.kind === "gallery") return filterPhrase("All works", "Results for", scope.filter);
  if (scope.kind === "decade") {
    return filterPhrase("Timeline", "Timeline results for", scope.filter);
  }
  if (scope.kind === "artist") return `Works by ${label ?? scope.slug}`;
  if (scope.kind === "collection") return `Plates from ${label ?? scope.id}`;
  if (scope.kind === "color") return `Colour: ${label ?? scope.id}`;
  return `Era: ${label ?? getEra(scope.id).title}`;
}

/** The home gallery's and the timeline's controls, read back as one
 *  phrase: `Results for “dürer” in Baroque & the Dutch Golden Age,
 *  chronological`. */
function filterPhrase(unfiltered: string, results: string, filter?: ScopeFilter): string {
  let phrase = filter?.q ? `${results} “${filter.q}”` : unfiltered;
  if (filter?.era) phrase += ` in ${getEra(filter.era).title}`;
  if (filter?.sort === "year") phrase += ", chronological";
  if (filter?.sort === "artist") phrase += ", sorted by artist";
  return phrase;
}

function catalogueHref(id: string | null): string | null {
  return id ? artworkHref(id, null) : null;
}

function isModifiedClick(event: MouseEvent<HTMLElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
