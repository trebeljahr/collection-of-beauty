"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function readIsTouch() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  // Limit to actual handheld-ish viewports — large touch laptops
  // still have keyboards and benefit from PointerLockControls.
  const handheldSize = Math.min(window.innerWidth, window.innerHeight) <= 1200;
  return (coarse || hasTouchPoints) && handheldSize;
}

/**
 * True on devices whose primary input is touch (phones, tablets).
 * Stays true in landscape — this is for "use joysticks instead of
 * pointer-lock", not for "rotate your device".
 *
 * Returns null only while hydrating server HTML. A component that mounts
 * purely on the client (the next/dynamic fallback, the Gallery3D tree)
 * reads the real value on its first render. The old useState + useEffect
 * version returned null on every mount and flipped a frame later, so each
 * of the gallery curtain's remounts painted the desktop copy, then swapped
 * to the touch copy and changed the card's height: a visible flicker.
 */
export function useTouchDevice(): boolean | null {
  return useSyncExternalStore(subscribe, readIsTouch, () => null);
}

/** True on touch devices held in portrait — the cue to show the
 *  rotate-to-landscape overlay. */
export function useNeedsRotate(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readIsTouch() && window.innerHeight > window.innerWidth,
    () => false,
  );
}
