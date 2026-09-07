"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useTouchDevice } from "@/hooks/use-touch-device";

// The one and only pre-enter screen for the 3D museum. Every "scene not
// ready yet" moment renders THIS component with the same card skeleton,
// so entering the museum reads as a single screen that fills one bar and
// ends on the enabled "Enter" button — not four cards flashing past:
//   - loading.tsx        — route Suspense fallback (RSC navigation).
//   - gallery-3d-client  — while /api/artworks is in flight AND as the
//                          next/dynamic fallback for the Three.js chunk.
//   - index.tsx          — once <Gallery3D> mounts, reporting the entry
//                          room's texture decodes, then the Enter card.
//
// Two rules keep it from jumping, and both are easy to break:
//
// 1. ONE BAR, ONE SCALE. The bar is determinate the whole way through.
//    The pre-mount phases (chunk download, artworks fetch) have no real
//    progress signal, so they get a synthetic creep that asymptotes at
//    CREEP_CEILING; the entry room's decodes then map onto the rest of
//    the track. Swapping between an indeterminate sweep and a determinate
//    fill mid-load is exactly the "two loading animations" this replaces.
//
// 2. NOTHING MOVES BUT THE BAR. Heading, controls hint, bar and button
//    are in the same place in every phase, and the era title/blurb slot
//    holds its height (MIN slot height) before the era is known. The
//    card is also mounted three separate times across the sequence
//    (route fallback → client wrapper → inside Gallery3D), so any state
//    it holds has to be recomputable from scratch or it snaps backwards
//    on remount — hence the wall-clock creep below rather than a
//    per-instance animation that restarts at 0.

/** Share of the track owned by the pre-mount phases. */
const CREEP_CEILING = 0.35;
/** How long the creep takes to (asymptotically) reach the ceiling. */
const CREEP_MS = 6000;

/**
 * Wall-clock anchor for the creep, module scope so a remount picks the
 * curve back up where the previous instance left it instead of restarting
 * at zero. Reset once the museum reports ready so a later visit in the
 * same SPA session starts from the beginning again.
 */
let creepStartedAt = 0;

function creepAt(now: number) {
  if (!creepStartedAt) creepStartedAt = now;
  const t = Math.min(1, (now - creepStartedAt) / CREEP_MS);
  // Ease-out: quick off the mark (the chunk is usually cached), then
  // crawls, so a slow network doesn't leave the bar parked at the ceiling
  // looking frozen for seconds on end.
  return CREEP_CEILING * (1 - (1 - t) ** 3);
}

/**
 * Single progress value for the whole entry sequence.
 * `progress` is the real 0..1 signal once the scene is mounted; leave it
 * undefined for the pre-mount phases and the creep takes over.
 */
function useCurtainProgress(progress: number | undefined, ready: boolean) {
  const creeping = progress === undefined && !ready;
  const [creep, setCreep] = useState(0);

  // Before paint, not after: a fresh instance renders 0 (and must, to
  // match the server-rendered fallback), so the catch-up to the real
  // wall-clock position has to land in the same commit or the user sees
  // the bar flash back to the start on every remount.
  useLayoutEffect(() => {
    if (creeping) setCreep(creepAt(performance.now()));
  }, [creeping]);

  useEffect(() => {
    if (!creeping) return;
    const id = window.setInterval(() => setCreep(creepAt(performance.now())), 120);
    return () => window.clearInterval(id);
  }, [creeping]);

  useEffect(() => {
    if (ready) creepStartedAt = 0;
  }, [ready]);

  if (ready) return 1;
  if (progress === undefined) return creep;
  return CREEP_CEILING + (1 - CREEP_CEILING) * Math.min(1, Math.max(0, progress));
}

type Props = {
  /** Real 0..1 progress. Omit while the scene hasn't mounted yet. */
  progress?: number;
  /** Entry room fully settled — swaps the card into its Enter state. */
  ready?: boolean;
  /** The artworks fetch failed; the sequence can't continue. */
  fetchFailed?: boolean;
  /** Paintings in the entry room that gave up after retries. */
  failedCount?: number;
  /** Line under the bar. Defaults per phase when omitted. */
  status?: string;
  /** Era the player starts on — known only once the scene has mounted. */
  title?: string;
  blurb?: string;
  onStart?: () => void;
  onRetry?: () => void;
  /**
   * True when the card sits over the live canvas (inside Gallery3D)
   * rather than standing in for the whole route. Only changes how the
   * backdrop is painted — the card itself is identical either way.
   */
  overlay?: boolean;
};

export function GalleryCurtain({
  progress,
  ready = false,
  fetchFailed = false,
  failedCount = 0,
  status,
  title,
  blurb,
  onStart,
  onRetry,
  overlay = false,
}: Props) {
  const isTouch = useTouchDevice() === true;
  const value = useCurtainProgress(progress, ready);
  const pct = Math.round(value * 100);
  const canStart = ready && !fetchFailed && onStart !== undefined;

  const subline =
    status ??
    (fetchFailed
      ? "Refresh to try again."
      : ready
        ? failedCount > 0
          ? `${failedCount} painting${failedCount === 1 ? "" : "s"} could not load`
          : "First room ready"
        : "Preparing the exhibit…");

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-lock entry requires a real mouse click; keyboard activation can't grant pointer-lock
    // biome-ignore lint/a11y/noStaticElementInteractions: same reason — full-screen click target gates pointer-lock entry
    <div
      onClick={canStart ? onStart : undefined}
      // overflow-y-auto: a phone held in landscape (≈375 px tall) can't
      // fit the card, and the museum is landscape-only on touch — without
      // a scroller the Enter button sits below the fold with no way down.
      className={`flex w-full overflow-y-auto px-4 py-6 text-white transition-colors duration-700 ${
        overlay ? "absolute inset-0 z-10 h-full" : "h-screen"
      } ${
        // Opaque for the whole load so the swap from route fallback to
        // in-canvas overlay isn't visible, then fades to reveal the room
        // behind the Enter card once there's something worth showing.
        ready && overlay ? "bg-black/70 backdrop-blur-sm" : "bg-[#0a0805]"
      } ${canStart ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only — purely visual container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="m-auto w-[min(480px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl"
      >
        <h2 className="font-serif text-2xl tracking-wide">
          {fetchFailed ? "Could not load museum" : "Enter the museum"}
        </h2>

        {/* Fixed-height slot: holds a placeholder line until the era is
            known, so the card doesn't grow under the user mid-load. */}
        <div className="mt-3 flex min-h-[6rem] items-center justify-center">
          {title ? (
            <p className="text-sm leading-relaxed text-white/80">
              You'll start on <span className="font-medium text-white">{title}</span>.
              {blurb && <span className="mt-1 block text-white/60">{blurb}</span>}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-white/55">
              {fetchFailed ? "The artwork list didn't arrive." : "Building the galleries…"}
            </p>
          )}
        </div>

        <p className="mt-2 text-xs leading-relaxed text-white/65">
          {isTouch ? (
            <>
              Left stick walks · right stick looks · tap a painting to inspect · stairs change
              floors
            </>
          ) : (
            <>
              <kbd className="rounded border border-white/30 px-1.5">W</kbd>{" "}
              <kbd className="rounded border border-white/30 px-1.5">A</kbd>{" "}
              <kbd className="rounded border border-white/30 px-1.5">S</kbd>{" "}
              <kbd className="rounded border border-white/30 px-1.5">D</kbd> to walk · mouse to look
              · <kbd className="rounded border border-white/30 px-1.5">Shift</kbd> to run ·{" "}
              <kbd className="rounded border border-white/30 px-1.5">Space</kbd> to jump · click a
              painting to zoom · <kbd className="rounded border border-white/30 px-1.5">M</kbd> for
              the full map (with teleport shortcuts)
            </>
          )}
        </p>

        <div className="mt-5 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/70 transition-[width] duration-300 ease-out"
              style={{ width: fetchFailed ? "100%" : `${pct}%` }}
            />
          </div>
          <div className="text-xs text-white/55">{subline}</div>
          {failedCount > 0 && (
            <p className="text-xs leading-relaxed text-amber-200/80">
              Network or image decoding failed after retries. You can enter with placeholders or
              retry the room.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {failedCount > 0 && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-white/25 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="rounded-md bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60"
          >
            {ready ? (failedCount > 0 ? "Enter anyway" : "Enter") : "Preparing…"}
          </button>
        </div>
      </div>
    </div>
  );
}
