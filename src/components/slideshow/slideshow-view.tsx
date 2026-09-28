"use client";

import { useRouter } from "next/navigation";
import {
  type MouseEvent,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useIdle } from "@/hooks/use-idle";
import { usePageVisible } from "@/hooks/use-page-visible";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { artworkAlt } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { pathnameOf, previousPathname } from "@/lib/navigation-history";
import {
  FADE_MS,
  fadeMs,
  failureBackoffMs,
  IDLE_HIDE_MS,
  INFO_STORAGE_KEY,
  INTERVAL_STORAGE_KEY,
  initialPlayerState,
  intervalMs as intervalFor,
  MANUAL_HIDE_GRACE_MS,
  type PlayableScope,
  PREPARE_TIMEOUT_MS,
  parseStoredInfo,
  parseStoredInterval,
  playerReducer,
  playHref,
  type SlideViewport,
  SPINNER_DELAY_MS,
  STALL_RETRY_MS,
  swipeDirection,
  TAP_MAX_MOVE_PX,
} from "@/lib/slideshow";
import { SlideNotInScopeError, useSlideDeck } from "@/lib/use-slide-deck";
import { isSlowConnection, useSlowConnection } from "@/lib/use-slow-connection";
import { cn } from "@/lib/utils";
import { type PreparedSlide, prepareSlide } from "./prepare-slide";
import { SlideLayer, type SlideLayerData } from "./slide-layer";
import { GLASS_BUTTON, SlideshowControls, SlideshowSpinner } from "./slideshow-controls";

export type SlideshowViewProps = {
  scope: PlayableScope;
  /** "Claude Monet", "All works", "Results for “dürer”". */
  heading: string;
  /** The scope's own page. */
  exitHref: string;
  /** Works in the scope. */
  total: number;
  /** Absolute index of the first work to show. */
  startIndex: number;
  /** Absolute index of `initial[0]`, aligned to the page size. */
  windowStart: number;
  /** One page of slim listings around the start. Never the full Artwork. */
  initial: ArtworkListing[];
};

const isHideKey = (e: KeyboardEvent) => e.key === "h" || e.key === "H";

/** Resize events arrive in bursts while a window is dragged; re-preparing
 *  the waiting slide once the drag settles is enough. */
const RESIZE_DEBOUNCE_MS = 250;

/**
 * `/play` — a scope, one work at a time, full screen.
 *
 * The player state lives in `playerReducer` (src/lib/slideshow.ts); this
 * component wires it to the browser through three effects:
 *
 *  - prepare: fetch the listing for `target` if the deck lacks it, choose
 *    the rung, fetch and decode the image, then report `ready`;
 *  - commit: when the reducer moves `shown`, mount a new layer on top,
 *    warm the next pages, and write `?start=` so a reload resumes here;
 *  - timer: report `due` once the interval has run for the work on
 *    screen, pausing with the show and with a hidden tab.
 *
 * A work is never shown before it is decoded. If the timer wins the race,
 * the current work holds, its pan running out to its last frame, until the
 * next one is ready.
 */
export function SlideshowView({
  scope,
  heading,
  exitHref,
  total,
  startIndex,
  windowStart,
  initial,
}: SlideshowViewProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    initialPlayerState(total, startIndex),
  );
  const pageVisible = usePageVisible();
  const reduced = useReducedMotion();
  const slow = useSlowConnection();
  const fullscreen = useFullscreen(rootRef);

  // Per-viewer interval and caption setting, remembered in this browser
  // only. Read after mount so server and client render the same default.
  const [storedS, setStoredS] = useState<number | null>(null);
  const [info, setInfo] = useState(true);
  useEffect(() => {
    try {
      setStoredS(parseStoredInterval(window.localStorage.getItem(INTERVAL_STORAGE_KEY)));
      setInfo(parseStoredInfo(window.localStorage.getItem(INFO_STORAGE_KEY)) ?? true);
    } catch {
      // Storage blocked (private mode, site data off): keep the defaults.
    }
  }, []);
  const intervalMs = intervalFor(storedS, slow);
  const intervalS = intervalMs / 1000;

  const running = state.playing && pageVisible && !state.stalled;

  const onTotalChange = useCallback((next: number) => dispatch({ type: "total", total: next }), []);
  const deck = useSlideDeck({ scope, windowStart, initial, onTotalChange });

  // Decoded slides waiting for their commit. Holds at most the target:
  // the commit effect takes the shown one out.
  const prepared = useRef(new Map<number, PreparedSlide>());
  const [layers, setLayers] = useState<SlideLayerData[]>([]);
  const [retryNonce, setRetryNonce] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const measure = useCallback((): SlideViewport => {
    const stage = stageRef.current;
    return {
      width: stage?.clientWidth || window.innerWidth,
      height: stage?.clientHeight || window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
  }, []);

  // --- prepare -------------------------------------------------------------
  // After a failure the next attempt waits (failureBackoffMs), so a short
  // outage does not burn through all three tries at once. Each attempt
  // has a deadline, and running past it counts as a failure: a request
  // that hangs without erroring would otherwise hold the show for good.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryNonce, epoch and failures are triggers — "Try again", a stage change and a retried listing must re-run this even when target and targetReady are unchanged
  useEffect(() => {
    if (state.stalled || state.targetReady) return;
    const index = state.target;
    const controller = new AbortController();
    const { signal } = controller;
    let cleanedUp = false;
    let deadline: number | undefined;
    // Only time the tab is shown counts: a hidden tab holds the decode
    // until it is shown again (see prepare-slide.ts), and timing that out
    // would skip good works as broken while nobody is watching.
    const armDeadline = () => {
      deadline = window.setTimeout(() => {
        if (document.visibilityState === "hidden") armDeadline();
        else controller.abort();
      }, PREPARE_TIMEOUT_MS);
    };
    const backoff = window.setTimeout(() => {
      armDeadline();
      void run();
    }, failureBackoffMs(state.failures));
    const run = async () => {
      let art: ArtworkListing;
      try {
        art = deck.peek(index) ?? (await deck.load(index, signal));
      } catch (err) {
        // A page that did not arrive says nothing about this work: try it
        // again. An index the scope no longer has is skipped.
        if (!cleanedUp) {
          dispatch({ type: "failed", index, retrySame: !(err instanceof SlideNotInScopeError) });
        }
        return;
      }
      try {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const slide = await prepareSlide({
          index,
          art,
          viewport: measure(),
          // Read now rather than from the hook, which is false on its
          // first render and would size the first slide for a fast link.
          slow: isSlowConnection(),
          reducedMotion: reduced,
          signal,
        });
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const map = prepared.current;
        for (const key of map.keys()) if (key !== index) map.delete(key);
        map.set(index, slide);
        dispatch({ type: "ready", index });
      } catch {
        if (!cleanedUp) dispatch({ type: "failed", index });
      } finally {
        window.clearTimeout(deadline);
      }
    };
    return () => {
      cleanedUp = true;
      window.clearTimeout(backoff);
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [
    state.target,
    state.targetReady,
    state.stalled,
    state.epoch,
    state.failures,
    retryNonce,
    deck,
    measure,
    reduced,
  ]);

  // --- commit --------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per commit; everything else is read at that moment
  useEffect(() => {
    if (state.commits === 0 || state.shown === null) return;
    const index = state.shown;
    const slide = prepared.current.get(index);
    if (!slide) return;
    prepared.current.delete(index);

    const layer: SlideLayerData = {
      key: state.commits,
      slide,
      fadeMs: fadeMs(state.committedIntent ?? "auto", reduced),
      panMs: intervalMs + FADE_MS,
    };
    // Two mounted layers is the steady state (outgoing under incoming).
    // A third only appears when steps outrun the fade; drop the oldest
    // rather than stack decoded bitmaps.
    setLayers((prev) => [...prev, layer].slice(-2));

    deck.warm(index, state.total);

    // Resume point for a reload. Same pathname, so NavigationTracker
    // records nothing and Exit can still go back to the scope's page.
    const href = playHref(scope, slide.art.id);
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.replaceState(null, "", href);
    }

    // Automatic advances are never announced: a screen reader reading a
    // title every 12 s would talk over everything else.
    if (state.committedIntent === "manual") setAnnouncement(artworkAlt(slide.art));
  }, [state.commits]);

  const onShown = useCallback((key: number) => {
    // The new layer is opaque: everything under it can go.
    setLayers((prev) =>
      prev.length > 0 && prev[0].key < key ? prev.filter((l) => l.key >= key) : prev,
    );
  }, []);

  // --- timer ---------------------------------------------------------------
  // Time already spent on the current work, so pause and a hidden tab
  // freeze the countdown instead of restarting it.
  const runRef = useRef({ seq: -1, elapsed: 0, since: 0 });
  useEffect(() => {
    if (!running || state.shown === null || state.due) return;
    const run = runRef.current;
    const seq = state.commits;
    if (run.seq !== seq) {
      run.seq = seq;
      run.elapsed = 0;
    }
    run.since = performance.now();
    const t = window.setTimeout(
      () => dispatch({ type: "due" }),
      Math.max(0, intervalMs - run.elapsed),
    );
    return () => {
      window.clearTimeout(t);
      if (run.seq === seq) run.elapsed += performance.now() - run.since;
    };
  }, [state.commits, state.due, state.shown, running, intervalMs]);

  // --- re-prepare on stage changes ------------------------------------------
  useEffect(() => {
    let t: number | undefined;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => dispatch({ type: "invalidate" }), RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, []);
  // Skips the mount run: the first prepare has just started with the
  // current values, and restarting it would fetch the first image twice.
  const stageMountedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: both values are triggers; the waiting slide was sized and planned for the old ones
  useEffect(() => {
    if (!stageMountedRef.current) {
      stageMountedRef.current = true;
      return;
    }
    dispatch({ type: "invalidate" });
  }, [fullscreen.active, reduced]);

  // --- stall recovery ---------------------------------------------------------
  const retry = useCallback(() => {
    dispatch({ type: "retry" });
    setRetryNonce((n) => n + 1);
  }, []);
  const stalledRef = useRef(state.stalled);
  stalledRef.current = state.stalled;
  useEffect(() => {
    const onOnline = () => {
      if (stalledRef.current) retry();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);
  // A server or CDN error fires no `online` event. A show left playing
  // keeps trying on its own, so a redeploy does not end it.
  useEffect(() => {
    if (!state.stalled || !state.playing || !pageVisible) return;
    const t = window.setTimeout(retry, STALL_RETRY_MS);
    return () => window.clearTimeout(t);
  }, [state.stalled, state.playing, pageVisible, retry]);
  useEffect(() => {
    if (state.stalled) setAnnouncement("Images are not loading. Press Try again to retry.");
  }, [state.stalled]);

  // --- screen, chrome ----------------------------------------------------------
  // Held through a stall too: the show retries by itself and the last
  // work stays on screen meanwhile.
  useWakeLock(state.playing);

  // The kind of pointer last used. A mouse resting on a control keeps the
  // chrome up; a finger leaves `:hover` stuck on whatever it tapped, so a
  // touch never does.
  const pointerKindRef = useRef("mouse");
  const [menuOpen, setMenuOpen] = useState(false);
  // Hides while paused too: a screen left on one work should show the
  // work. An open menu holds the chrome, and so does a stall, whose
  // message and Try again must stay reachable.
  const { idle, wake, hide } = useIdle(
    state.shown !== null && !state.stalled && !menuOpen,
    IDLE_HIDE_MS,
    {
      stayAwake: () =>
        pointerKindRef.current !== "touch" &&
        rootRef.current?.querySelector("[data-chrome]:hover") != null,
      // H toggles the chrome; waking it first would leave nothing to hide.
      keyWakes: (e) => !isHideKey(e),
    },
  );
  // Focus a viewer moved with Tab keeps the chrome up, so the focused
  // control and its ring never fade out under them. The initial
  // programmatic focus on the stage does not count, or a TV left running
  // would never hide its chrome. Any pointer press hands control back to
  // idle.
  const [kbdFocus, setKbdFocus] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") setKbdFocus(true);
    };
    const onPointer = (e: PointerEvent) => {
      pointerKindRef.current = e.pointerType;
      if (e.type === "pointerdown") setKbdFocus(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("pointermove", onPointer, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("pointermove", onPointer, true);
    };
  }, []);
  const chromeVisible = !idle || kbdFocus;
  const chromeVisibleRef = useRef(chromeVisible);
  chromeVisibleRef.current = chromeVisible;

  // "Hide controls": everything but the caption goes at once, and stays
  // gone until the mouse moves again or a key is pressed.
  const hideChrome = useCallback(() => {
    setKbdFocus(false);
    setMenuOpen(false);
    hide(MANUAL_HIDE_GRACE_MS);
  }, [hide]);

  const wantSpinner =
    !state.stalled && (state.shown === null || (state.intent === "manual" && !state.targetReady));
  const [spinner, setSpinner] = useState(false);
  useEffect(() => {
    if (!wantSpinner) {
      setSpinner(false);
      return;
    }
    const t = window.setTimeout(() => setSpinner(true), SPINNER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [wantSpinner]);

  // --- actions ---------------------------------------------------------------
  const playingRef = useRef(state.playing);
  playingRef.current = state.playing;
  const togglePlay = useCallback(() => {
    setAnnouncement(playingRef.current ? "Paused" : "Playing");
    dispatch({ type: "toggle" });
  }, []);
  const step = useCallback((delta: 1 | -1) => dispatch({ type: "step", delta }), []);
  const infoRef = useRef(info);
  infoRef.current = info;
  const toggleInfo = useCallback(() => {
    const next = !infoRef.current;
    setInfo(next);
    try {
      window.localStorage.setItem(INFO_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not remembered; still applies for this visit.
    }
  }, []);

  const exit = useCallback(() => {
    fullscreen.exit();
    // Came here from the scope's page: go back, so the router cache
    // renders it at once and the grid keeps its scroll position.
    if (previousPathname() === pathnameOf(exitHref)) router.back();
    else router.replace(exitHref);
  }, [fullscreen, exitHref, router]);

  const onExitClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    exit();
  };

  // Escape comes through the trap. In fullscreen the browser normally
  // consumes the first Escape to leave fullscreen; where it does not, that
  // Escape leaves fullscreen here instead, and a second one exits.
  useFocusTrap({
    active: true,
    containerRef: rootRef,
    onEscape: () => (fullscreen.active ? fullscreen.exit() : exit()),
    lockScroll: true,
  });
  // Declared after the trap on purpose: rAF callbacks run in order, so
  // this lands after the trap has focused the first control (Exit) and
  // moves focus to the slideshow itself. A focused control would draw its
  // ring on a screen nobody has touched yet, and Enter on Exit would end
  // the show; from here Space, the arrows and the letter keys all work,
  // and Tab reaches the controls.
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => rootRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select") || target?.isContentEditable) return;
      if (e.key === " " || e.key === "Spacebar") {
        // A focused button activates itself on Space; handling it here
        // too would toggle twice.
        if (target?.closest?.("button")) return;
        e.preventDefault();
        if (!e.repeat) togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if ((e.key === "f" || e.key === "F") && fullscreen.supported && !e.repeat) {
        e.preventDefault();
        fullscreen.toggle();
      } else if ((e.key === "i" || e.key === "I") && !e.repeat) {
        e.preventDefault();
        toggleInfo();
      } else if (isHideKey(e) && !e.repeat) {
        e.preventDefault();
        if (chromeVisibleRef.current) hideChrome();
        else wake();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, step, fullscreen, toggleInfo, hideChrome, wake]);

  // --- touch -----------------------------------------------------------------
  // Same gesture rules as the lightbox: one finger, far enough, mostly
  // sideways. A touch that barely moved is a tap, which shows or hides
  // the chrome.
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length > 1) touchRef.current = null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const dir = swipeDirection(dx, dy);
    if (dir) {
      step(dir === "next" ? 1 : -1);
      return;
    }
    if (Math.abs(dx) <= TAP_MAX_MOVE_PX && Math.abs(dy) <= TAP_MAX_MOVE_PX) {
      if (idle) wake();
      else hide();
      // Suppress the synthetic click, which would call wake() right back.
      e.preventDefault();
    }
  };

  // --- render ------------------------------------------------------------------
  const front = layers[layers.length - 1] ?? null;
  const position =
    state.shown === null
      ? null
      : `${(state.shown + 1).toLocaleString("en-US")} of ${state.total.toLocaleString("en-US")}`;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      tabIndex={-1}
      className={cn(
        "fixed inset-0 z-[100] touch-none select-none overflow-hidden bg-black text-white outline-none",
        !chromeVisible && "cursor-none",
      )}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKbdFocus(false);
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the stage is a gesture surface; every action on it has a button in the toolbar */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keys are bound on window, not on the stage */}
      <div
        ref={stageRef}
        className="absolute inset-0"
        onClick={wake}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touchRef.current = null;
        }}
      >
        {layers.map((layer) => (
          <SlideLayer
            key={layer.key}
            layer={layer}
            front={layer === front}
            paused={!running}
            reducedMotion={reduced}
            onShown={onShown}
          />
        ))}
      </div>

      {spinner && <SlideshowSpinner />}

      {state.stalled && (
        // Only the message box takes the pointer, so Exit and the toolbar
        // underneath stay usable while stalled.
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-black/70 px-6 py-5 text-center">
            <p>Images are not loading.</p>
            <button type="button" onClick={retry} className={cn(GLASS_BUTTON, "h-11 px-4")}>
              Try again
            </button>
          </div>
        </div>
      )}

      <SlideshowControls
        visible={chromeVisible}
        heading={heading}
        position={position}
        exitHref={exitHref}
        onExit={onExitClick}
        art={front?.slide.art ?? null}
        info={info}
        onInfo={toggleInfo}
        playing={state.playing}
        onToggle={togglePlay}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        intervalS={intervalS}
        onInterval={(next) => {
          setStoredS(next);
          try {
            window.localStorage.setItem(INTERVAL_STORAGE_KEY, String(next));
          } catch {
            // Not remembered; still applies for this visit.
          }
        }}
        menuOpen={menuOpen}
        onMenuOpen={setMenuOpen}
        onHide={hideChrome}
        fullscreen={fullscreen}
        reducedMotion={reduced}
        chrome={{ onPointerDown: wake }}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
