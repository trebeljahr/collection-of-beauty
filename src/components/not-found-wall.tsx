"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { ResponsiveImage } from "@/components/responsive-image";
import { ShuffleIcon } from "@/components/ui/shuffle-icon";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import type { NotFoundItem, NotFoundResponse } from "@/lib/not-found-match";

/**
 * The 404 page as a museum wall: an empty frame where the requested page
 * should hang, with a wall label naming the URL, and beside it a work
 * that is here.
 *
 * Which work depends on how sure `/api/not-found` is about what the
 * visitor meant. A clear match (a typo, a cut-off link, a renamed work)
 * hangs that work and asks "Did you mean this?". Several plausible
 * matches go in a row underneath and a random work hangs instead, as it
 * does when nothing matched. A clear match on a page without a picture
 * (a colour, the timeline) is named on the label itself.
 *
 * The path is read after mount, not during render: a not-found page for
 * an unmatched route is prerendered once, so the server can't know it.
 */

/** The same "Show me another" / "About this work" pills as /surprise. */
const PRIMARY_BUTTON =
  "inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const TEXT_LINK =
  "rounded-sm underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** Frame geometry, as CSS variables so one inline `width` expression
 *  works at every breakpoint. `--wall-h` is the tallest a work may hang,
 *  `--wall-w` the widest; a work's box is whichever binds first at its
 *  aspect ratio. Below md the two frames stack and the empty one shrinks,
 *  so the work that is here stays above the fold. */
const WALL_VARS =
  "[--wall-h:min(46svh,22rem)] [--wall-w:calc(100vw-5.5rem)] [--empty-h:min(26svh,11rem)] md:[--wall-h:min(56svh,26rem)] md:[--wall-w:24rem] md:[--empty-h:var(--wall-h)] lg:[--wall-w:28rem]";

/** Portrait, like most of what hangs here. */
const EMPTY_RATIO = 4 / 5;

type Featured =
  | { kind: "match"; item: NotFoundItem & { work: ArtworkListing } }
  | { kind: "random"; work: ArtworkListing };

type PlausibleFn = (event: string, options?: { props?: Record<string, string> }) => void;

export function NotFoundWall() {
  const pathname = usePathname();
  const [path, setPath] = useState<string | null>(null);
  const [data, setData] = useState<NotFoundResponse | null>(null);
  const [deckIndex, setDeckIndex] = useState(0);

  useEffect(() => {
    // usePathname is the trigger, window.location the value: on a
    // prerendered not-found the hook's first answer can be the internal
    // /_not-found route rather than what the visitor typed.
    void pathname;
    const current = window.location.pathname;
    setPath(current);
    setData(null);
    setDeckIndex(0);
    const controller = new AbortController();
    fetch(`/api/not-found?path=${encodeURIComponent(current)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? (res.json() as Promise<NotFoundResponse>) : null))
      .then((body) => {
        if (!body) return;
        setData(body);
        const plausible = (window as Window & { plausible?: PlausibleFn }).plausible;
        plausible?.("404", {
          props: { path: current, match: body.suggestion?.confidence ?? "none" },
        });
      })
      .catch(() => {
        // Offline or aborted: the frame, the label and the links below
        // still work without the suggestions.
      });
    return () => controller.abort();
  }, [pathname]);

  const items = (data?.suggestion?.items ?? []).filter((item) => item.href !== path);
  const confident =
    data?.suggestion?.confidence === "exact" || data?.suggestion?.confidence === "high";
  const top = confident ? items[0] : undefined;
  const featuredMatch = top?.work ? { ...top, work: top.work } : null;
  const namedPage = top && !top.work ? top : null;
  const rest = items.filter((item) => item !== top);
  const deck = data?.random ?? [];
  const randomWork = deck[deckIndex];

  const featured: Featured | null = featuredMatch
    ? { kind: "match", item: featuredMatch }
    : randomWork
      ? { kind: "random", work: randomWork }
      : null;

  // "Show me another" swaps within the deck and falls through to a real
  // /surprise navigation once the deck runs out, like /surprise itself.
  const onAnother = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (deckIndex + 1 >= deck.length) return;
    e.preventDefault();
    setDeckIndex((i) => i + 1);
  };

  return (
    <div className={`flex flex-col gap-14 ${WALL_VARS}`}>
      <div className="flex flex-col items-center gap-10 md:flex-row md:items-start md:justify-center md:gap-16">
        <figure className="flex flex-col items-center gap-5">
          <div aria-hidden="true" className="wall-frame wall-frame-empty">
            <div className="wall-frame-mat">
              <div
                className="wall-frame-void"
                style={boxStyle(EMPTY_RATIO, "var(--empty-h)", "var(--wall-w)")}
              />
            </div>
          </div>
          <WallLabel>
            <h1 className="font-serif text-lg leading-snug">Page not found</h1>
            <p className="mt-1 min-h-4 font-mono text-xs break-all text-[var(--muted-foreground)]">
              {path}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">HTTP 404</p>
            {namedPage ? (
              <p className="mt-3 text-sm">
                Did you mean{" "}
                <Link href={namedPage.href} className={TEXT_LINK}>
                  {namedPage.label}
                </Link>
                ?
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                The link may have a typo, or the work was renamed or removed.
              </p>
            )}
          </WallLabel>
        </figure>

        <figure className="flex flex-col items-center gap-5">
          {featured ? (
            <HungWork
              key={featured.kind === "match" ? featured.item.href : featured.work.id}
              work={featured.kind === "match" ? featured.item.work : featured.work}
              href={featured.kind === "match" ? featured.item.href : `/artwork/${featured.work.id}`}
            />
          ) : (
            // Holds the space while the suggestion loads, so the label
            // beside it doesn't jump when the work arrives.
            <div aria-hidden="true" className="wall-frame wall-frame-empty opacity-40">
              <div className="wall-frame-mat">
                <div
                  className="wall-frame-void"
                  style={boxStyle(EMPTY_RATIO, "var(--wall-h)", "var(--wall-w)")}
                />
              </div>
            </div>
          )}
          {featured?.kind === "match" && <MatchLabel item={featured.item} />}
          {featured?.kind === "random" && (
            <WallLabel>
              <p className="text-[0.6875rem] tracking-wide text-[var(--muted-foreground)] uppercase">
                A random work from the collection
              </p>
              <WorkCaption work={featured.work} />
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="/surprise" onClick={onAnother} className={PRIMARY_BUTTON}>
                  <ShuffleIcon />
                  Show me another
                </a>
                <Link href={`/artwork/${featured.work.id}`} className={SECONDARY_BUTTON}>
                  About this work <span aria-hidden="true">→</span>
                </Link>
              </div>
            </WallLabel>
          )}
          {!featured && (
            <WallLabel>
              <p className="text-sm text-[var(--muted-foreground)]">
                <a href="/surprise" className={TEXT_LINK}>
                  Show me a random work
                </a>
              </p>
            </WallLabel>
          )}
        </figure>
      </div>

      {rest.length > 0 && (
        <section aria-labelledby="close-matches" className="mx-auto w-full max-w-4xl">
          <h2 id="close-matches" className="mb-4 font-serif text-xl">
            {featuredMatch || namedPage ? "Other close matches" : "Close matches"}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {rest.map((item) => (
              <li key={item.href}>
                <MatchCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Warm the next random work while this one hangs, as /surprise
          does, so "Show me another" swaps without a blank frame. */}
      {featured?.kind === "random" && deck[deckIndex + 1] && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 -z-10 h-px w-px overflow-hidden opacity-0"
        >
          <HungWork work={deck[deckIndex + 1]} href="/surprise" preload />
        </div>
      )}
    </div>
  );
}

/** Box for a work of `ratio` (width / height): as tall as `maxHeight`
 *  allows unless that would make it wider than `maxWidth`. */
function boxStyle(ratio: number, maxHeight: string, maxWidth: string): CSSProperties {
  return {
    aspectRatio: `${ratio}`,
    width: `min(${maxWidth}, calc(${maxHeight} * ${ratio.toFixed(4)}))`,
  };
}

function ratioOf(work: ArtworkListing): number {
  const w = work.width && work.width > 0 ? work.width : 4;
  const h = work.height && work.height > 0 ? work.height : 5;
  return w / h;
}

function HungWork({
  work,
  href,
  preload,
}: {
  work: ArtworkListing;
  href: string;
  preload?: boolean;
}) {
  const ratio = ratioOf(work);
  return (
    <Link
      href={href}
      tabIndex={preload ? -1 : undefined}
      aria-label={preload ? undefined : displayTitle(work)}
      className="wall-frame wall-frame-hung block rounded-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--background)]"
    >
      <div className="wall-frame-mat">
        <div className="relative" style={boxStyle(ratio, "var(--wall-h)", "var(--wall-w)")}>
          <ResponsiveImage
            objectKey={work.objectKey}
            alt={artworkAlt(work)}
            sizes={`(max-width: 768px) calc(100vw - 5.5rem), min(28rem, calc(min(56vh, 26rem) * ${ratio.toFixed(3)}))`}
            variantWidths={work.variantWidths}
            dominantColor={work.dominantColor}
            fill
            className="object-contain"
            loading="eager"
          />
        </div>
      </div>
    </Link>
  );
}

function WallLabel({ children }: { children: ReactNode }) {
  return (
    <figcaption className="wall-label w-[17rem] max-w-full px-4 py-3 text-left">
      {children}
    </figcaption>
  );
}

function WorkCaption({ work }: { work: ArtworkListing }) {
  return (
    <>
      <p className="mt-1 font-serif text-base leading-snug text-balance">{displayTitle(work)}</p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {work.artist ?? "Artist unknown"}
        {work.year != null && ` · ${work.year}`}
      </p>
    </>
  );
}

const MATCH_EYEBROW: Record<NotFoundItem["kind"], string> = {
  artwork: "Did you mean this work?",
  artist: "Did you mean this artist?",
  page: "Did you mean this page?",
};

function MatchLabel({ item }: { item: NotFoundItem & { work: ArtworkListing } }) {
  return (
    <WallLabel>
      <p className="text-[0.6875rem] tracking-wide text-[var(--muted-foreground)] uppercase">
        {MATCH_EYEBROW[item.kind]}
      </p>
      {item.kind === "artwork" ? (
        <WorkCaption work={item.work} />
      ) : (
        <>
          <p className="mt-1 font-serif text-base leading-snug text-balance">{item.label}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{subline(item)}</p>
        </>
      )}
      <div className="mt-3">
        <Link href={item.href} className={PRIMARY_BUTTON}>
          {item.kind === "artwork" ? "Open this work" : `Go to ${item.label}`}{" "}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </WallLabel>
  );
}

function subline(item: NotFoundItem): string {
  if (item.kind === "artwork" && item.work) {
    const { artist, year } = item.work;
    return [artist ?? "Artist unknown", year].filter((v) => v != null).join(" · ");
  }
  if (item.kind === "artist") {
    return item.count != null
      ? `Artist · ${item.count} work${item.count === 1 ? "" : "s"}`
      : "Artist";
  }
  if (item.href.startsWith("/era/")) return "Era";
  if (item.href.startsWith("/colours/")) return "Colour";
  if (item.href.startsWith("/collection/")) return "Collection";
  return item.href;
}

function MatchCard({ item }: { item: NotFoundItem }) {
  return (
    <Link
      href={item.href}
      className="group block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-square overflow-hidden rounded-sm bg-[var(--muted)]">
        {item.work ? (
          <ResponsiveImage
            objectKey={item.work.objectKey}
            alt=""
            sizes="(max-width: 640px) 45vw, 13rem"
            variantWidths={item.work.variantWidths}
            dominantColor={item.work.dominantColor}
            fill
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center font-mono text-xs text-[var(--muted-foreground)]">
            {item.href}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-snug group-hover:underline">{item.label}</p>
      <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted-foreground)]">{subline(item)}</p>
    </Link>
  );
}
