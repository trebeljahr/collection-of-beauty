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
 * should hang, with the notice and the URL written on the wall inside it
 * and a wall label that catalogues the gap as a work. Below it hangs a
 * work that is here.
 *
 * Which work depends on how sure `/api/not-found` is about what the
 * visitor meant. A clear match (a typo, a cut-off link, a renamed work)
 * hangs that work under "Did you mean this work?". Several plausible
 * matches go in a row underneath and a random work hangs instead, as it
 * does when nothing matched. A clear match on a page without a picture
 * (a colour, the timeline) is named inside the empty frame itself.
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
 *  aspect ratio. The empty frame's box is `.wall-notice` in globals.css. */
const WALL_VARS =
  "[--wall-h:min(40svh,20rem)] [--wall-w:calc(100vw-5.5rem)] md:[--wall-h:min(60svh,32rem)] md:[--wall-w:40rem]";

/** Portrait, like most of what hangs here: the loading placeholder. */
const EMPTY_RATIO = 4 / 5;

/** The line between the empty frame and the work below it. */
const LEAD_IN: Record<NotFoundItem["kind"] | "random", string> = {
  artwork: "Did you mean this work?",
  artist: "Did you mean this artist?",
  page: "Did you mean this page?",
  random: "No worries. Here is a random work from the collection instead.",
};

type Featured =
  | { kind: "match"; item: NotFoundItem & { work: ArtworkListing } }
  | { kind: "random"; work: ArtworkListing };

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
      <div className="flex flex-col items-center">
        <figure className="flex w-full flex-col items-center gap-5">
          <div className="wall-frame wall-frame-empty w-full max-w-md md:w-auto md:max-w-none">
            <div className="wall-frame-mat">
              <div className="wall-notice flex flex-col items-center justify-center text-center">
                <h1 className="font-serif">
                  <span className="block text-6xl leading-none tracking-tight md:text-8xl">
                    404
                  </span>
                  <span className="mt-3 block text-xl leading-snug md:text-2xl">
                    Page not found
                  </span>
                </h1>
                <p className="mt-2 min-h-4 max-w-full font-mono text-xs break-all text-[var(--muted-foreground)]">
                  {path}
                </p>
                {namedPage ? (
                  <p className="mt-4 text-sm text-balance">
                    Did you mean{" "}
                    <Link href={namedPage.href} className={TEXT_LINK}>
                      {namedPage.label}
                    </Link>
                    ?
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-balance text-[var(--muted-foreground)]">
                    The link may have a typo, or the work was renamed or removed.
                  </p>
                )}
              </div>
            </div>
          </div>
          {/* The gap, catalogued like everything else on the wall. */}
          <WallLabel>
            <p className="font-serif text-base leading-snug">Untitled (404)</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Artist unknown · undated
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
              When the Mona Lisa was stolen in 1911, crowds came to the Louvre to look at the four
              empty hooks. Kafka was one of them.
            </p>
          </WallLabel>
        </figure>

        {/* Holds its line while the suggestion loads, so the frame below
            doesn't jump when the text arrives. */}
        <h2 className="mt-10 mb-6 min-h-7 max-w-md text-center font-serif text-xl text-balance md:mt-20 md:mb-10">
          {featured && LEAD_IN[featured.kind === "match" ? featured.item.kind : "random"]}
        </h2>

        <figure className="flex flex-col items-center gap-5">
          <div className="wall-slot">
            {featured ? (
              <HungWork
                key={featured.kind === "match" ? featured.item.href : featured.work.id}
                work={featured.kind === "match" ? featured.item.work : featured.work}
                href={
                  featured.kind === "match" ? featured.item.href : `/artwork/${featured.work.id}`
                }
              />
            ) : (
              // Holds the space while the suggestion loads, so the label
              // below doesn't jump when the work arrives.
              <div aria-hidden="true" className="wall-frame wall-frame-empty opacity-40">
                <div className="wall-frame-mat">
                  <div style={boxStyle(EMPTY_RATIO, "var(--wall-h)", "var(--wall-w)")} />
                </div>
              </div>
            )}
          </div>
          {featured?.kind === "match" && <MatchLabel item={featured.item} />}
          {featured?.kind === "random" && (
            <WallLabel>
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
            sizes={`(max-width: 768px) calc(100vw - 5.5rem), min(40rem, calc(min(60vh, 32rem) * ${ratio.toFixed(3)}))`}
            variantWidths={work.variantWidths}
            dominantColor={work.dominantColor}
            // The box already has the work's aspect, so the blur
            // stretches to it, as on /surprise. The warming copy is
            // invisible and skips it.
            thumbHash={preload ? null : work.thumbHash}
            thumbHashFit="stretch"
            workWidth={work.width}
            workHeight={work.height}
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
      <p className="font-serif text-base leading-snug text-balance">{displayTitle(work)}</p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {work.artist ?? "Artist unknown"}
        {work.year != null && ` · ${work.year}`}
      </p>
    </>
  );
}

function MatchLabel({ item }: { item: NotFoundItem & { work: ArtworkListing } }) {
  return (
    <WallLabel>
      {item.kind === "artwork" ? (
        <WorkCaption work={item.work} />
      ) : (
        <>
          <p className="font-serif text-base leading-snug text-balance">{item.label}</p>
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
            thumbHash={item.work.thumbHash}
            workWidth={item.work.width}
            workHeight={item.work.height}
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
