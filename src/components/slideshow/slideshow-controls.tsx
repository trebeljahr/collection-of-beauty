"use client";

import {
  Captions,
  CaptionsOff,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  Timer,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { INTERVAL_CHOICES_S } from "@/lib/slideshow";
import { cn } from "@/lib/utils";

/* Safe-area padding for the chrome. These only resolve to anything
   because src/app/play/page.tsx exports `viewportFit: "cover"`; without
   it `env(safe-area-inset-*)` is 0px and `max()` leaves the flat 1rem.
   The bottom inset keeps the dock and caption off the iPhone's home
   indicator. */
const SIDE_INSETS = {
  paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
  paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
} as const;
const TOP_BAR: CSSProperties = {
  ...SIDE_INSETS,
  paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
};
const BOTTOM_BAR: CSSProperties = {
  ...SIDE_INSETS,
  paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
};

/* No gradient bars: on a screen left running they would darken the top
   and bottom of every work. Each line of text carries its own shadow
   instead, which reads over white paper and a pale sky alike. */
const TEXT_SCRIM = "[text-shadow:0_1px_3px_rgb(0_0_0/0.9),0_0_8px_rgb(0_0_0/0.6)]";

/* Dark glass, so a control stays visible over a pale work. */
const GLASS = "bg-black/50 ring-1 ring-inset ring-white/15 backdrop-blur-md";
const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

export const GLASS_BUTTON = cn(
  "inline-flex shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-black/70",
  GLASS,
  FOCUS_RING,
);

/** A button inside the dock. The dock is the glass; the button only
 *  lights up under the pointer. */
const DOCK_BASE = cn(
  "inline-flex shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white",
  FOCUS_RING,
);
const DOCK_BUTTON = cn(DOCK_BASE, "size-10 sm:size-11");

/** Dock height (size-11 buttons plus p-1) plus the gap-3 above it: how
 *  far the caption drops on narrow screens when the dock fades. */
const CAPTION_DROP = "max-lg:translate-y-16";

const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

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
  /** Title and artist on the work, whether or not the controls show. */
  info: boolean;
  onInfo: () => void;
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  intervalS: number;
  onInterval: (seconds: number) => void;
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
  onHide: () => void;
  fullscreen: { supported: boolean; active: boolean; toggle: () => void };
  reducedMotion: boolean;
  chrome: ChromeHandlers;
};

/**
 * The slideshow's chrome, in three places that each hold one kind of
 * thing:
 *
 *  - top: what is playing and where in it (left), Exit (right);
 *  - bottom centre: every control, in one dock — stepping and play on the
 *    left of the divider, how the show looks on the right;
 *  - bottom left: the caption, which follows its own setting rather than
 *    the controls, so a screen can show the works with their labels and
 *    nothing else.
 *
 * Hidden controls fade out but stay mounted and focusable, so a keyboard
 * user never loses the control they are on; any key press brings them
 * back. The wrappers ignore the pointer and only the controls take it, so
 * a swipe or tap beside them still reaches the stage below.
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
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4",
          fade,
        )}
        style={TOP_BAR}
      >
        <div className={cn("min-w-0 flex-1 pt-1", TEXT_SCRIM)}>
          <p className="truncate text-sm font-medium text-white">{props.heading}</p>
          {props.position && <p className="text-xs tabular-nums text-white/80">{props.position}</p>}
        </div>
        {/* A real link, so the overlay can be left without JS. */}
        <Link
          href={props.exitHref}
          onClick={props.onExit}
          aria-label="Exit slideshow"
          title="Exit (Esc)"
          aria-keyshortcuts="Escape"
          data-chrome=""
          className={cn(GLASS_BUTTON, "size-11", interactive)}
          {...props.chrome}
        >
          <X {...ICON} size={22} />
        </Link>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6"
        style={BOTTOM_BAR}
      >
        {art && (
          <div
            className={cn(
              "min-w-0 transition-[opacity,transform] duration-300 motion-reduce:transition-opacity lg:col-start-1 lg:row-start-1",
              props.info ? "opacity-100" : "opacity-0",
              !visible && CAPTION_DROP,
            )}
            aria-hidden="true"
          >
            <SlideCaption key={art.id} art={art} animate={!props.reducedMotion} />
          </div>
        )}

        <div
          role="toolbar"
          aria-label="Slideshow controls"
          data-chrome=""
          className={cn(
            "relative flex items-center gap-0.5 justify-self-center rounded-full p-1 shadow-lg shadow-black/30 sm:gap-1 lg:col-start-2 lg:row-start-1",
            GLASS,
            fade,
            interactive,
          )}
          // A mouse click leaves focus where it was (the stage, on
          // arrival), so Space keeps meaning play/pause rather than
          // pressing whichever button was clicked last.
          onMouseDown={(e) => e.preventDefault()}
          {...props.chrome}
        >
          <button
            type="button"
            onClick={props.onPrev}
            aria-label="Previous work"
            title="Previous (←)"
            aria-keyshortcuts="ArrowLeft"
            className={DOCK_BUTTON}
          >
            <ChevronLeft {...ICON} size={22} />
          </button>
          <button
            type="button"
            onClick={props.onToggle}
            aria-label={props.playing ? "Pause" : "Play"}
            title={props.playing ? "Pause (Space)" : "Play (Space)"}
            aria-keyshortcuts="Space"
            className={cn(DOCK_BUTTON, "bg-white text-black hover:bg-white/85 hover:text-black")}
          >
            {props.playing ? (
              <Pause {...ICON} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play {...ICON} fill="currentColor" strokeWidth={0} className="translate-x-px" />
            )}
          </button>
          <button
            type="button"
            onClick={props.onNext}
            aria-label="Next work"
            title="Next (→)"
            aria-keyshortcuts="ArrowRight"
            className={DOCK_BUTTON}
          >
            <ChevronRight {...ICON} size={22} />
          </button>

          <span aria-hidden="true" className="mx-1 h-6 w-px bg-white/20" />

          <SpeedMenu
            intervalS={props.intervalS}
            onInterval={props.onInterval}
            open={props.menuOpen}
            onOpen={props.onMenuOpen}
          />
          <button
            type="button"
            onClick={props.onInfo}
            aria-label="Title and artist"
            aria-pressed={props.info}
            aria-keyshortcuts="I"
            title={props.info ? "Hide title and artist (I)" : "Show title and artist (I)"}
            className={cn(DOCK_BUTTON, props.info && "bg-white/15")}
          >
            {props.info ? <Captions {...ICON} /> : <CaptionsOff {...ICON} />}
          </button>
          {fullscreen.supported && (
            <button
              type="button"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
              title={fullscreen.active ? "Exit full screen (F)" : "Full screen (F)"}
              aria-keyshortcuts="F"
              className={DOCK_BUTTON}
            >
              {fullscreen.active ? <Minimize {...ICON} /> : <Maximize {...ICON} />}
            </button>
          )}
          <button
            type="button"
            onClick={props.onHide}
            aria-label="Hide controls"
            title="Hide controls (H)"
            aria-keyshortcuts="H"
            className={DOCK_BUTTON}
          >
            <EyeOff {...ICON} />
          </button>
        </div>
      </div>
    </>
  );
}

/** Title, then artist and year, faded in with each new work. The work's
 *  own alt text already carries this for screen readers. */
function SlideCaption({ art, animate }: { art: ArtworkListing; animate: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per work; the parent keys this by id
  useLayoutEffect(() => {
    const el = ref.current;
    if (!animate || !el || typeof el.animate !== "function") return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 700, easing: "ease-out" },
    );
  }, []);
  return (
    <div ref={ref} className={cn("max-w-[42rem]", TEXT_SCRIM)}>
      <p className="line-clamp-2 font-serif text-[clamp(1.125rem,1.6vw,2rem)] leading-tight text-white">
        {displayTitle(art)}
      </p>
      <p className="mt-0.5 text-[clamp(0.875rem,1vw,1.25rem)] text-white/85">
        {art.artist ?? "Artist unknown"}
        {art.year != null && ` · ${art.year}`}
      </p>
    </div>
  );
}

/**
 * "Time per work": a menu of the offered intervals, opening upward from
 * the dock. Opened from the keyboard it moves focus to the current
 * choice; opened with the mouse it leaves focus alone. Escape, a click
 * outside, or Tab away closes it.
 */
function SpeedMenu({
  intervalS,
  onInterval,
  open,
  onOpen,
}: {
  intervalS: number;
  onInterval: (seconds: number) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusOnOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) {
      focusOnOpen.current = false;
      const list = menuItems(menuRef.current);
      (list.find((el) => el.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpen(false);
    };
    // Capture, ahead of the focus trap: Escape here closes the menu, not
    // the slideshow.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      const hadFocus = menuRef.current?.contains(document.activeElement);
      onOpen(false);
      if (hadFocus) triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onOpen]);

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const list = menuItems(menuRef.current);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Inside the menu the arrows move the choice, not the show.
      e.stopPropagation();
      e.preventDefault();
      return;
    } else if (e.key === "Tab") {
      // Back to the trigger, which Tab then moves on from as usual.
      e.preventDefault();
      onOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          // detail is 0 for a click synthesised from Enter or Space.
          focusOnOpen.current = !open && e.detail === 0;
          onOpen(!open);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Time per work: ${intervalS} seconds`}
        title="Time per work"
        className={cn(
          DOCK_BASE,
          "h-10 gap-1.5 px-2.5 text-sm tabular-nums sm:h-11 sm:px-3",
          open && "bg-white/15",
        )}
      >
        <Timer {...ICON} size={18} className="max-sm:hidden" />
        {intervalS} s
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Time per work"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute bottom-full left-1/2 mb-3 min-w-36 -translate-x-1/2 rounded-2xl p-1 text-sm shadow-lg shadow-black/40",
            "bg-black/75 ring-1 ring-inset ring-white/15 backdrop-blur-md",
          )}
        >
          <p className="px-3 pb-1 pt-2 text-xs text-white/60">Time per work</p>
          {INTERVAL_CHOICES_S.map((s) => (
            <MenuChoice
              key={s}
              checked={s === intervalS}
              onSelect={() => {
                onInterval(s);
                onOpen(false);
                if (menuRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
              }}
            >
              {s} seconds
            </MenuChoice>
          ))}
        </div>
      )}
    </div>
  );
}

function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(menu?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? []);
}

function MenuChoice({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left tabular-nums text-white/90 transition-colors hover:bg-white/15 hover:text-white",
        "focus:outline-none focus-visible:bg-white/15",
        checked && "text-white",
      )}
    >
      <Check {...ICON} size={16} className={checked ? "opacity-100" : "opacity-0"} />
      {children}
    </button>
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
