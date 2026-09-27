"use client";

import { useEffect, useState } from "react";

/** The slice of the Network Information API we read. It's Chromium-only
 *  (Chrome, Edge, Android WebView); Safari and Firefox don't expose
 *  `navigator.connection` at all, so those clients always read as fast. */
type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

function connection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function readSlow(): boolean {
  const c = connection();
  if (!c) return false;
  // Save-Data is an explicit "spend fewer bytes" request; honour it
  // regardless of the measured speed. Otherwise treat anything below 4g
  // as slow — the extra thumbnail earns its keep there.
  if (c.saveData) return true;
  return c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.effectiveType === "3g";
}

/** Synchronous read for code that decides at call time, such as the
 *  slideshow picking a rung. The hook below reads false on its first
 *  render, which would size the first slide for a fast link. */
export function isSlowConnection(): boolean {
  return readSlow();
}

/**
 * Whether this client is on a slow or data-saving connection, used to
 * decide if a gallery tile should spend an extra ~10 KB thumbnail on
 * progressive loading (see progressive-image.tsx).
 *
 * Returns `false` during SSR and on the first client render so the markup
 * hydrates without a mismatch, then updates from `navigator.connection`
 * after mount and tracks later changes (e.g. the phone drops to 3g). A
 * fast connection keeps the plain single-fetch path, which is the whole
 * point — fast clients don't pay for a preview they'd never see.
 */
export function useSlowConnection(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const update = () => setSlow(readSlow());
    update();
    const c = connection();
    c?.addEventListener?.("change", update);
    return () => c?.removeEventListener?.("change", update);
  }, []);
  return slow;
}
