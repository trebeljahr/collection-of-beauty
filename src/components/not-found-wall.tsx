"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ResponsiveImage } from "@/components/responsive-image";
import { ShuffleIcon } from "@/components/ui/shuffle-icon";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import type { NotFoundResponse } from "@/lib/not-found-match";

/**
 * The 404 page as a museum wall: an empty frame where the requested page
 * should hang, with the notice and the URL written on the wall inside it
 * and a wall label that catalogues the gap as a work. Below it hangs a
 * random work that is here, drawn on the server (see not-found.tsx) so
 * it is in the HTML.
 *
 * The path is read after mount, not during render: a not-found page for
 * an unmatched route is prerendered once, so the server can't know it.
 * When `/api/not-found` finds a page the path misspells, the frame names
 * it in place of the typo notice.
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
 *  aspect ratio. The empty frame's box is `.wall-notice` in globals.css.
 *  From lg `--wall-w` is the page's 80rem column less the plaque gutter
 *  (WALL_AXIS), 2rem of page padding and ~4.6rem of moulding and mat. */
const WALL_VARS =
  "[--wall-h:min(40svh,20rem)] [--wall-w:calc(100vw-5.5rem)] md:[--wall-h:min(60svh,32rem)] md:[--wall-w:40rem] lg:[--wall-w:min(40rem,calc(min(100vw,80rem)_-_23.1rem))]";

/** A plaque hangs below its frame on narrow screens, and from lg to the
 *  right of it, level with the frame's bottom edge. Absolute, so the
 *  plaque never pushes its frame sideways. */
const PLAQUE_BESIDE = "lg:absolute lg:bottom-0 lg:left-full lg:ml-6 lg:w-60";

/** From lg the wall reserves the plaque's width plus gap (15 + 1.5rem)
 *  on the right only, so each frame and its plaque sit centred as a pair
 *  and the frames share one centre line left of the page's. */
const WALL_AXIS = "lg:pr-[16.5rem]";

export function NotFoundWall({ deck }: { deck: ArtworkListing[] }) {
  const pathname = usePathname();
  const [path, setPath] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<NotFoundResponse["suggestion"]>(null);
  const [deckIndex, setDeckIndex] = useState(0);

  useEffect(() => {
    // usePathname is the trigger, window.location the value: on a
    // prerendered not-found the hook's first answer can be the internal
    // /_not-found route rather than what the visitor typed.
    void pathname;
    const current = window.location.pathname;
    setPath(current);
    setSuggestion(null);
    const controller = new AbortController();
    fetch(`/api/not-found?path=${encodeURIComponent(current)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? (res.json() as Promise<NotFoundResponse>) : null))
      .then((body) => {
        if (body?.suggestion && body.suggestion.href !== current) setSuggestion(body.suggestion);
      })
      .catch(() => {
        // Offline or aborted: the frame keeps its typo notice.
      });
    return () => controller.abort();
  }, [pathname]);

  const work = deck[deckIndex];

  // "Show me another" swaps within the deck and falls through to a real
  // /surprise navigation once the deck runs out, like /surprise itself.
  const onAnother = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (deckIndex + 1 >= deck.length) return;
    e.preventDefault();
    setDeckIndex((i) => i + 1);
  };

  return (
    <div className={`flex flex-col items-center ${WALL_VARS} ${WALL_AXIS}`}>
      <figure className="relative flex w-full max-w-md flex-col items-center gap-5 md:w-auto md:max-w-none">
        <div className="wall-frame wall-frame-empty w-full md:w-auto">
          <div className="wall-frame-mat">
            <div className="wall-notice flex flex-col items-center justify-center text-center">
              <h1 className="font-serif">
                <span className="block text-6xl leading-none tracking-tight md:text-8xl">404</span>
                <span className="mt-3 block text-xl leading-snug md:text-2xl">Page not found</span>
              </h1>
              <p className="mt-2 min-h-4 max-w-full font-mono text-xs break-all text-[var(--muted-foreground)]">
                {path}
              </p>
              {suggestion ? (
                <p className="mt-4 text-sm text-balance">
                  Did you mean{" "}
                  <Link href={suggestion.href} className={TEXT_LINK}>
                    {suggestion.label}
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
        <WallLabel
          className={PLAQUE_BESIDE}
          noteLabel="About Untitled (404)"
          note="When the Mona Lisa was stolen in 1911, crowds came to the Louvre to look at the four empty hooks. Kafka was one of them."
        >
          <p className="font-serif text-base leading-snug">Untitled (404)</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Artist unknown · undated</p>
        </WallLabel>
      </figure>

      {work ? (
        <>
          <h2 className="mt-10 mb-6 max-w-xl text-center font-serif text-xl text-balance md:mt-20 md:mb-10">
            No worries. Sometimes we don&apos;t find what we were looking for, but we do find
            something else.
          </h2>
          <div className="flex flex-col items-center gap-5">
            <div className="wall-slot">
              {/* Not a link: the buttons under it do the navigating. */}
              <figure key={work.id} className="relative flex flex-col items-center gap-5">
                <HungWork work={work} />
                <WallLabel className={PLAQUE_BESIDE}>
                  <WorkCaption work={work} />
                </WallLabel>
              </figure>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <a href="/surprise" onClick={onAnother} className={PRIMARY_BUTTON}>
                <ShuffleIcon />
                Show me another
              </a>
              <Link href={`/artwork/${work.id}`} className={SECONDARY_BUTTON}>
                About this work <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </>
      ) : (
        <a
          href="/surprise"
          className={`mt-10 text-sm text-[var(--muted-foreground)] md:mt-20 ${TEXT_LINK}`}
        >
          Show me a random work
        </a>
      )}

      {/* Warm the next random work while this one hangs, as /surprise
          does, so "Show me another" swaps without a blank frame. */}
      {deck[deckIndex + 1] && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 -z-10 h-px w-px overflow-hidden opacity-0"
        >
          <HungWork work={deck[deckIndex + 1]} preload />
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

/** A framed work. `preload` is the invisible copy that warms the next
 *  one: eager, no blur, no fetch priority. */
function HungWork({ work, preload }: { work: ArtworkListing; preload?: boolean }) {
  const ratio = ratioOf(work);
  return (
    <div className="wall-frame wall-frame-hung block rounded-[2px]">
      <div className="wall-frame-mat">
        <div className="relative" style={boxStyle(ratio, "var(--wall-h)", "var(--wall-w)")}>
          <ResponsiveImage
            objectKey={work.objectKey}
            alt={artworkAlt(work)}
            sizes={`(max-width: 768px) calc(100vw - 5.5rem), min(40rem, calc(min(60vh, 32rem) * ${ratio.toFixed(3)}))`}
            variantWidths={work.variantWidths}
            dominantColor={work.dominantColor}
            // The box already has the work's aspect, so the blur
            // stretches to it, as on /surprise.
            thumbHash={preload ? null : work.thumbHash}
            thumbHashFit="stretch"
            workWidth={work.width}
            workHeight={work.height}
            fill
            className="object-contain"
            priority={!preload}
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
}

/** Pointer travel between the plaque and its note, which a gap
 *  separates: leaving the plaque closes the note only after this. */
const NOTE_CLOSE_DELAY_MS = 150;

/**
 * The small card beside a work. A `note` hides behind an (i) button:
 * a mouse over the plaque shows it, and a click, tap or Enter on the
 * button pins it open until a second press, Escape, or a press or
 * focus move outside. Below lg it unfolds inside the plaque; from lg,
 * where the plaque hangs beside the frame, it floats above it.
 */
function WallLabel({
  children,
  className,
  note,
  noteLabel,
}: {
  children: ReactNode;
  className?: string;
  note?: ReactNode;
  noteLabel?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const noteId = useId();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      setPinned(false);
      setHovered(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const hadFocus = ref.current?.contains(document.activeElement) ?? false;
      setPinned(false);
      setHovered(false);
      if (hadFocus) buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // Touch pointers fire enter/leave around every tap; the tap's click
  // does the toggling for them.
  const onPointerEnter = (e: PointerEvent) => {
    if (!note || e.pointerType === "touch") return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setHovered(true);
  };
  const onPointerLeave = (e: PointerEvent) => {
    if (!note || e.pointerType === "touch") return;
    closeTimer.current = window.setTimeout(() => setHovered(false), NOTE_CLOSE_DELAY_MS);
  };
  const onToggle = () => {
    if (pinned) {
      setPinned(false);
      setHovered(false);
    } else {
      setPinned(true);
    }
  };

  return (
    <figcaption
      ref={ref}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={`wall-label relative w-[17rem] max-w-full px-4 py-3 text-left ${note ? "pr-11" : ""} ${className ?? ""}`}
    >
      {children}
      {note && (
        <>
          <button
            ref={buttonRef}
            type="button"
            aria-label={noteLabel}
            aria-expanded={open}
            aria-controls={noteId}
            onClick={onToggle}
            className="absolute top-2.5 right-2.5 inline-flex size-6 items-center justify-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] aria-expanded:bg-[var(--accent)] aria-expanded:text-[var(--foreground)]"
          >
            <Info aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </button>
          <div
            id={noteId}
            hidden={!open}
            className="wall-note mt-2 text-xs leading-relaxed text-[var(--muted-foreground)] lg:absolute lg:inset-x-0 lg:bottom-full lg:z-10 lg:mt-0 lg:mb-2 lg:px-4 lg:py-3"
          >
            {note}
          </div>
        </>
      )}
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
