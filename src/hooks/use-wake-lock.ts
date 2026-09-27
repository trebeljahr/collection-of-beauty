"use client";

import { useEffect } from "react";

/** The one Screen Wake Lock member we read. Declared locally because the
 *  API is still missing from some TypeScript lib.dom versions, and from
 *  Firefox before 126 and Safari before 16.4 at runtime. */
type WakeLockSentinelLike = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
};
type WakeLockLike = { request(type: "screen"): Promise<WakeLockSentinelLike> };

function wakeLock(): WakeLockLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
}

/**
 * Keep the screen on while `enabled`. For a slideshow left running on a
 * TV or a second monitor, which would otherwise dim and lock after a few
 * minutes of no input.
 *
 * The browser releases the lock by itself whenever the page is hidden,
 * and the system may drop it while the page stays up, so it is requested
 * again on `release` and each time the page becomes visible. WebKit also
 * refuses a request made without a recent user gesture while the
 * permission is undecided, which is the case on a reload or a bookmark,
 * so until a lock is held every tap, click and key press asks again.
 * Every failure is swallowed: an unsupported browser, a battery saver that
 * refuses the request, or a request made while the tab was in the
 * background (NotAllowedError). The show runs the same either way; the
 * screen may just sleep.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    const api = wakeLock();
    if (!enabled || !api) return;
    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;
    let pending = false;

    const acquire = () => {
      if (cancelled || pending) return;
      if (document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      api
        .request("screen")
        .then((lock) => {
          pending = false;
          // Cleanup ran while the request was in flight: give it back.
          if (cancelled) {
            lock.release().catch(() => {});
            return;
          }
          sentinel = lock;
          lock.addEventListener("release", () => {
            if (sentinel === lock) sentinel = null;
            // Hidden: the visibilitychange listener takes it from here.
            acquire();
          });
        })
        .catch(() => {
          pending = false;
        });
    };

    const onGesture = () => {
      if (!sentinel || sentinel.released) acquire();
    };
    const gestureOpts = { capture: true, passive: true } as const;

    acquire();
    document.addEventListener("visibilitychange", acquire);
    window.addEventListener("pointerdown", onGesture, gestureOpts);
    window.addEventListener("keydown", onGesture, gestureOpts);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      window.removeEventListener("pointerdown", onGesture, gestureOpts);
      window.removeEventListener("keydown", onGesture, gestureOpts);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
