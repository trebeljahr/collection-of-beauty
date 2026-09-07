"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ResponsiveImage } from "@/components/responsive-image";
import { ShuffleIcon } from "@/components/ui/shuffle-icon";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { SURPRISE_DECK_SIZE } from "@/lib/surprise";

type Props = {
  /** Server-picked works, first one shown immediately. Slim listings
   *  only — the full Artwork never crosses into a client component. */
  deck: ArtworkListing[];
};

/** Refill when the local deck gets this short, so the fetch overlaps
 *  with the taps that are still served locally. */
const REFILL_AT = 2;

/** Height the frame is allowed to take.
 *
 *  `100svh - 17rem` is the above-the-fold term: 17rem reserves the sticky
 *  header, the caption (two lines when a long title wraps) and the actions
 *  underneath, so on a normal viewport the whole thing lands in view
 *  without measuring anything at runtime. The site footer sits below it —
 *  this is "as big as fits", not a viewport takeover.
 *
 *  The `max()` is the floor, and it exists because that subtraction has no
 *  bottom: on a 360 px-tall landscape phone it left 88 px, which a portrait
 *  work turned into a 47 px-wide stamp — the page's whole promise, gone.
 *  Below ~37rem (592 px) of viewport height the floor takes over, because
 *  fitting a usable image *and* the chrome above the fold stops being
 *  achievable there: we trade the fold for size, giving the image a real
 *  20rem and letting the visitor scroll a little for the caption. The two
 *  terms meet exactly at 592 px, so nothing jumps as a window is resized.
 *
 *  The floor is itself capped at 80svh so the image never eats the entire
 *  short viewport — the remaining fifth keeps the caption visibly peeking,
 *  which is what tells anyone there is something below to scroll to. */
const FRAME_MAX_HEIGHT = "max(100svh - 17rem, min(20rem, 80svh))";
/** Same expression in `vh`, for the `sizes` attribute only: `svh`/`dvh` are
 *  not accepted in `sizes` by every engine, and an unparseable descriptor
 *  drops the browser back to 100vw and the over-fetch this hint exists to
 *  avoid. `vh` differs from `svh` only while a mobile URL bar is expanded,
 *  which is a rung of error the variant ladder absorbs. */
const FRAME_MAX_HEIGHT_VH = "max(100vh - 17rem, min(20rem, 80vh))";

/**
 * `/surprise` — one random work, image dominant, chrome down to a
 * caption and two actions.
 *
 * The server hands over a whole deck rather than a single work, so
 * "Show me another" is a state swap (instant, no navigation) and the
 * next work's image is already warming in a hidden `<picture>` while
 * the current one is on screen. When the deck runs low we top it up
 * from `/api/surprise` in the background; if that ever fails, the
 * button is a real `<a href="/surprise">` and falls back to a plain
 * navigation — which is also what a visitor without JS gets.
 */
export function SurpriseView({ deck }: Props) {
  const [queue, setQueue] = useState<ArtworkListing[]>(deck);
  const [index, setIndex] = useState(0);
  // Guards against a second refill firing while the first is in flight.
  const refillingRef = useRef(false);

  const current = queue[index];
  const upcoming = queue[index + 1];

  const refill = useCallback(async () => {
    if (refillingRef.current) return;
    refillingRef.current = true;
    try {
      const res = await fetch(`/api/surprise?count=${SURPRISE_DECK_SIZE}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: unknown = await res.json();
      const more = (data as { artworks?: ArtworkListing[] })?.artworks;
      if (!Array.isArray(more) || more.length === 0) return;
      // Append rather than splice out what's been seen: a slice would
      // need the index at resolve time, not the one captured when the
      // fetch started, and the seen entries are ~200 bytes of slim
      // listing apiece — nobody taps their way to a memory problem.
      setQueue((prev) => [...prev, ...more]);
    } catch {
      // Offline or a blocked request: the anchor's native navigation is
      // the fallback, so there's nothing useful to report here.
    } finally {
      refillingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (queue.length - index <= REFILL_AT) void refill();
  }, [queue.length, index, refill]);

  const again = useCallback(() => {
    // No card in hand — let the caller fall through to a real
    // navigation rather than showing the same work again.
    if (!upcoming) return false;
    setIndex((i) => i + 1);
    window.scrollTo({ top: 0 });
    return true;
  }, [upcoming]);

  // Right-arrow as a second "again" affordance for keyboard visitors.
  // Ignored while a form control or a button has focus so it can't
  // double-fire alongside the button's own activation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, a, button") || target?.isContentEditable) return;
      if (again()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [again]);

  if (!current) {
    // Only reachable if the catalogue itself is empty.
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <p className="text-[var(--muted-foreground)]">Nothing to show right now.</p>
      </div>
    );
  }

  const title = displayTitle(current);

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col items-center gap-6 px-3 py-6 md:px-6 md:py-8">
      <figure className="flex w-full flex-col items-center gap-5">
        <Link
          href={`/artwork/${current.id}`}
          aria-label={`Open ${title} in full detail`}
          className="relative block w-full max-w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          style={frameStyle(current.width, current.height)}
        >
          {/* key on the id so the <img> is a fresh element per work —
              without it React reuses the node and the browser paints the
              previous painting until the new bytes decode. */}
          <SurpriseImage key={current.id} art={current} priority />
        </Link>

        <figcaption className="flex w-full max-w-3xl flex-col items-center gap-1 text-center">
          <h1 className="font-serif text-xl leading-tight tracking-tight text-balance md:text-2xl">
            {title}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {current.artist ? (
              <Link
                href={`/artist/${current.artistSlug}`}
                className="rounded-sm underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {current.artist}
              </Link>
            ) : (
              "Artist unknown"
            )}
            {current.year != null && <span> · {current.year}</span>}
          </p>
        </figcaption>
      </figure>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* A real link, not a bare button: without JS (and if a refill
            ever fails) this navigates to /surprise, which is dynamic and
            renders a different work every time. */}
        <a
          href="/surprise"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (again()) e.preventDefault();
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <ShuffleIcon />
          Show me another
        </a>
        <Link
          href={`/artwork/${current.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-5 py-2.5 text-sm transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          About this work <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Warm the next work's variant while this one is on screen, at
          the same `sizes` the visible hero uses so the browser picks —
          and caches — the identical candidate. Off-screen but not
          display:none, which would skip the fetch entirely. */}
      {upcoming && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 -z-10 h-px w-px overflow-hidden opacity-0"
        >
          <SurpriseImage key={upcoming.id} art={upcoming} />
        </div>
      )}
    </div>
  );
}

/**
 * Geometry for the frame, derived purely from the artwork's known source
 * dimensions — same trick the detail-page hero uses (see
 * `boxStyle` in artwork-viewer.tsx). An undecoded `<img>` with auto
 * sizing has no intrinsic size, so without this the frame would collapse
 * and snap open once the bytes land, shoving the caption down the page
 * on every tap of "Show me another".
 */
function frameStyle(width: number | null, height: number | null): CSSProperties {
  return {
    aspectRatio: `${sourceRatio(width, height)}`,
    width: `min(100%, calc((${FRAME_MAX_HEIGHT}) * ${sourceRatio(width, height)}))`,
    marginInline: "auto",
  };
}

/** Width / height of the source, with the same fallback the detail-page
 *  hero uses for works whose dimensions were never recorded. */
function sourceRatio(width: number | null, height: number | null): number {
  const w = width && width > 0 ? width : 1600;
  const h = height && height > 0 ? height : 2000;
  return w / h;
}

/**
 * Sizes hint. Full width on phones; above that the frame is capped by
 * *height*, so its rendered width is the artwork's aspect ratio times
 * the available height — often barely half the viewport. A flat "85vw"
 * here made the browser fetch the 2560 rung for a 614 px frame. The
 * `min()` mirrors the width in `frameStyle`; a browser that can't parse
 * it treats the whole descriptor as invalid and falls back to 100vw,
 * which is just the over-fetch we had before.
 */
function surpriseSizes(art: ArtworkListing): string {
  const ratio = sourceRatio(art.width, art.height).toFixed(3);
  return `(max-width: 768px) 100vw, min(100vw, calc((${FRAME_MAX_HEIGHT_VH}) * ${ratio}))`;
}

function SurpriseImage({ art, priority }: { art: ArtworkListing; priority?: boolean }) {
  return (
    <ResponsiveImage
      objectKey={art.objectKey}
      alt={artworkAlt(art)}
      sizes={surpriseSizes(art)}
      variantWidths={art.variantWidths}
      dominantColor={art.dominantColor}
      fill
      // The wrapper already carries the artwork's exact aspect ratio, so
      // contain and cover agree — contain just guarantees no crop if a
      // stored dimension is ever slightly off.
      className="rounded-md object-contain"
      priority={priority}
      loading="eager"
    />
  );
}
