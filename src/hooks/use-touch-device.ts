"use client";

import { useEffect, useState } from "react";

/**
 * True on devices whose primary input is touch (phones, tablets).
 * Stays true in landscape — this is for "use joysticks instead of
 * pointer-lock", not for "rotate your device". Returns null on first
 * render (SSR-safe) and a stable boolean after mount.
 */
export function useTouchDevice(): boolean | null {
  const [isTouch, setIsTouch] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const hasTouchPoints = navigator.maxTouchPoints > 0;
      // Limit to actual handheld-ish viewports — large touch laptops
      // still have keyboards and benefit from PointerLockControls.
      const handheldSize = Math.min(window.innerWidth, window.innerHeight) <= 1200;
      setIsTouch((coarse || hasTouchPoints) && handheldSize);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isTouch;
}

/** True on touch devices held in portrait — the cue to show the
 *  rotate-to-landscape overlay. */
export function useNeedsRotate(): boolean {
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    const update = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const hasTouchPoints = navigator.maxTouchPoints > 0;
      const handheldSize = Math.min(window.innerWidth, window.innerHeight) <= 1200;
      const isTouch = (coarse || hasTouchPoints) && handheldSize;
      const portrait = window.innerHeight > window.innerWidth;
      setNeeds(isTouch && portrait);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return needs;
}
