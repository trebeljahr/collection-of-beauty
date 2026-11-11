"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(display-mode: standalone), (display-mode: fullscreen)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readIsHomeScreenApp() {
  // `navigator.standalone` is Safari's own flag for a site opened from
  // the Home Screen; the media query covers the same mode elsewhere.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia(QUERY).matches;
}

/**
 * True when the page runs as a Home Screen web app rather than in a
 * browser tab.
 *
 * Since iOS 26.1 such an app shows the status bar over the top of the
 * page while `env(safe-area-inset-top)` reads 0 (WebKit bug 301994,
 * still open on iOS 27.2). The status bar takes every tap on it, so a
 * control pinned to the top edge by the inset alone cannot be pressed.
 * Nothing in the page can measure the bar, so callers reserve room for
 * it in this mode.
 */
export function useHomeScreenApp(): boolean {
  return useSyncExternalStore(subscribe, readIsHomeScreenApp, () => false);
}
