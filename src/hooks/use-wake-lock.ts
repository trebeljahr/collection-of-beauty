"use client";

import { useEffect } from "react";

/** The one Screen Wake Lock member we read. Declared locally because the
 *  API is still missing from some TypeScript lib.dom versions, and from
 *  Firefox before 126 and Safari before 16.4 at runtime. */
type WakeLockSentinelLike = {
  released: boolean;
  release(): Promise<void>;
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
 * so it is requested again each time the page becomes visible. Every
 * failure is swallowed: an unsupported browser, a battery saver that
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
        })
        .catch(() => {
          pending = false;
        });
    };

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
