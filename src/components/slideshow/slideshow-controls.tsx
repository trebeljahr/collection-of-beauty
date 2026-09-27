"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode, Ref } from "react";
import { displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { cn } from "@/lib/utils";

/* Safe-area padding for the two chrome bars. These only resolve to
   anything because src/app/play/page.tsx exports `viewportFit: "cover"`;
   without it `env(safe-area-inset-*)` is 0px and `max()` leaves the flat
   1rem. Unlike the lightbox, the slideshow pins chrome to the bottom edge
   too, so the bottom inset keeps the toolbar off the iPhone's home
   indicator. */
const SIDE_INSETS = {
  paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
  paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
} as const;
const TOP_BAR: CSSProperties = {
  ...SIDE_INSETS,
  paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
  paddingBottom: "2rem",
};
const BOTTOM_BAR: CSSProperties = {
  ...SIDE_INSETS,
  paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
  paddingTop: "3rem",
};

/* The gradients alone leave the text on a nearly clear backdrop over a
   pale work (white paper, a pale sky). The shadow gives every line its
   own dark edge, whatever is behind it. */
const TEXT_SCRIM = "[text-shadow:0_1px_3px_rgb(0_0_0/0.9),0_0_8px_rgb(0_0_0/0.6)]";

export const CHROME_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

type ChromeHandlers = { onPointerDown: () => void };

export type SlideshowControlsProps = {
  visible: boolean;
  heading: string;
  /** "12 of 340", or null before the first work is on screen. */
  position: string | null;
  exitHref: string;
  onExit: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** The work on the front layer. */
  art: ArtworkListing | null;
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  intervalS: number;
  onInterval: () => void;
  fullscreen: { supported: boolean; active: boolean; toggle: () => void };
  playButtonRef: Ref<HTMLButtonElement>;
  chrome: ChromeHandlers;
};

/**
 * The slideshow's two bars: heading, position and Exit at the top;
 * caption and toolbar at the bottom.
 *
 * Hidden bars fade out but stay mounted and focusable, so a keyboard user
 * never loses the control they are on; any key press brings them back.
 * The bars themselves ignore the pointer and only their controls take it,
 * so a swipe or tap on the gradient still reaches the stage below.
 */
export function SlideshowControls(props: SlideshowControlsProps) {
  const { visible, art, fullscreen } = props;
  const fade = cn(
    "transition-opacity duration-300",
    visible ? "opacity-100" : "pointer-events-none opacity-0",
  );
  const interactive = visible ? "pointer-events-auto" : "pointer-events-none";

  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-black/80 via-black/50 to-transparent",
          fade,
        )}
        style={TOP_BAR}
        {...props.chrome}
      >
        <div className={cn("min-w-0 flex-1", TEXT_SCRIM)}>
          <p className="truncate text-sm text-white/90">{props.heading}</p>
          {props.position && <p className="text-xs tabular-nums text-white/85">{props.position}</p>}
        </div>
        {/* A real link, so the overlay can be left without JS. 44 px hit
            area around a 36 px circle, as on the lightbox's Close. */}
        <Link
          href={props.exitHref}
          onClick={props.onExit}
          aria-label="Exit slideshow"
          title="Exit (Esc)"
          aria-keyshortcuts="Escape"
          className={cn(
            "group -m-1 inline-flex size-11 shrink-0 items-center justify-center focus:outline-none",
            interactive,
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors group-hover:bg-white/20 group-focus-visible:ring-2 group-focus-visible:ring-white">
            <Icon path="M18 6 6 18M6 6l12 12" size={20} />
          </span>
        </Link>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-black/80 via-black/55 to-transparent sm:flex-row sm:items-end sm:justify-between",
          fade,
        )}
        style={BOTTOM_BAR}
        {...props.chrome}
      >
        <div className={cn("min-w-0", TEXT_SCRIM)}>
          {art && (
            <>
              <p className="line-clamp-2 font-serif text-lg leading-tight md:text-xl">
                {displayTitle(art)}
              </p>
              <p className="text-sm text-white/85">
                {art.artist ?? "Artist unknown"}
                {art.year != null && ` · ${art.year}`}
              </p>
            </>
          )}
        </div>

        <div
          role="toolbar"
          aria-label="Slideshow controls"
          className={cn("flex items-center gap-2 self-center sm:self-auto", interactive)}
        >
          <button
            type="button"
            onClick={props.onPrev}
            aria-label="Previous work"
            title="Previous (←)"
            aria-keyshortcuts="ArrowLeft"
            className={cn(CHROME_BUTTON, "size-11")}
          >
            <Icon path="m15 18-6-6 6-6" />
          </button>
          <button
            ref={props.playButtonRef}
            type="button"
            onClick={props.onToggle}
            aria-label={props.playing ? "Pause" : "Play"}
            title={props.playing ? "Pause (Space)" : "Play (Space)"}
            aria-keyshortcuts="Space"
            className={cn(CHROME_BUTTON, "size-12")}
          >
            {props.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            onClick={props.onNext}
            aria-label="Next work"
            title="Next (→)"
            aria-keyshortcuts="ArrowRight"
            className={cn(CHROME_BUTTON, "size-11")}
          >
            <Icon path="m9 18 6-6-6-6" />
          </button>
          <button
            type="button"
            onClick={props.onInterval}
            aria-label={`Time per work: ${props.intervalS} seconds`}
            title="Time per work"
            className={cn(CHROME_BUTTON, "h-11 px-3 text-sm tabular-nums")}
          >
            {props.intervalS} s
          </button>
          {fullscreen.supported && (
            <button
              type="button"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
              title={fullscreen.active ? "Exit full screen (F)" : "Full screen (F)"}
              aria-keyshortcuts="F"
              className={cn(CHROME_BUTTON, "size-11")}
            >
              <Icon
                path={
                  fullscreen.active
                    ? "M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
                    : "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
                }
              />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Icon({ path, size = 22 }: { path: string; size?: number }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
    </svg>
  );
}

/** Centred spinner, same drawing as the lightbox's. */
export function SlideshowSpinner() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="animate-spin text-white/80"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span className="sr-only">Loading image</span>
    </div>
  );
}
