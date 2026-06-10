"use client";

import { useEffect } from "react";

/** sessionStorage key holding the most recent hero snapshot. Read by
 *  the gallery on mount, then cleared so a single back-navigation
 *  produces exactly one FLIP animation. */
const STORAGE_KEY = "artwork-back-flip";

/** How fresh a snapshot must be to be used. Older entries are stale —
 *  the user probably reopened a tab or navigated via a top-nav link
 *  after the detail page sat idle. */
const SNAPSHOT_TTL_MS = 5_000;

type Snapshot = {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
  src: string;
  ts: number;
};

/** Detail page calls this whenever the hero img's geometry changes —
 *  on mount, on load, on scroll, on resize. The most recent snapshot
 *  is what the gallery uses to seed the merge-back FLIP. */
export function saveBackFlipSnapshot(id: string, img: HTMLImageElement) {
  if (typeof window === "undefined") return;
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const cs = window.getComputedStyle(img);
  const snapshot: Snapshot = {
    id,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: cs.borderRadius || "0",
    src: img.currentSrc || img.src,
    ts: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota / private-mode failure — silently skip the animation rather
    // than break navigation.
  }
}

/** Gallery hook. On mount, if the detail page left a fresh snapshot in
 *  sessionStorage and the matching tile is in the DOM, animate a fixed
 *  positioned clone of the hero into the tile's bounding box. Mirrors
 *  ricos.site's `animateImageBackToGallery` (manual FLIP — no View
 *  Transitions API, works in every browser that supports CSS
 *  transitions). The tile is scrolled into view before the animation
 *  starts so the user sees the merge-target before the morph. */
export function useArtworkBackFlip() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(STORAGE_KEY);

    let snapshot: Snapshot;
    try {
      snapshot = JSON.parse(raw) as Snapshot;
    } catch {
      return;
    }
    if (!snapshot.id || Date.now() - snapshot.ts > SNAPSHOT_TTL_MS) return;

    // Wait two animation frames — one for React to commit the gallery
    // tree, one for react-photo-album's row solver to finish laying out
    // tile sizes — before measuring the target tile's bounds.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runFlip(snapshot);
      });
    });
  }, []);
}

function runFlip(snapshot: Snapshot) {
  const selector = `[data-artwork-id="${cssEscape(snapshot.id)}"] img`;
  const targetTile = document.querySelector<HTMLImageElement>(selector);
  if (!targetTile) return;

  // Center the destination tile before measuring it — otherwise the
  // FLIP ends at whatever scroll position the cache restored, which may
  // not contain the tile at all.
  targetTile.scrollIntoView({ behavior: "instant", block: "center" });
  const tileRect = targetTile.getBoundingClientRect();
  const tileBorderRadius = window.getComputedStyle(targetTile).borderRadius || "0";

  const clone = document.createElement("img");
  clone.src = snapshot.src;
  clone.alt = "";
  clone.setAttribute("aria-hidden", "true");
  clone.style.cssText = [
    "position:fixed",
    `top:${snapshot.top}px`,
    `left:${snapshot.left}px`,
    `width:${snapshot.width}px`,
    `height:${snapshot.height}px`,
    `border-radius:${snapshot.borderRadius}`,
    "object-fit:cover",
    "transition:top 0.38s ease,left 0.38s ease,width 0.38s ease,height 0.38s ease,border-radius 0.38s ease",
    "z-index:80",
    "pointer-events:none",
    "will-change:top,left,width,height",
  ].join(";");
  document.body.appendChild(clone);

  // Force a reflow so the transition starts from the snapshot rect
  // instead of jumping straight to the tile rect on the same frame.
  void clone.getBoundingClientRect();

  clone.style.top = `${tileRect.top}px`;
  clone.style.left = `${tileRect.left}px`;
  clone.style.width = `${tileRect.width}px`;
  clone.style.height = `${tileRect.height}px`;
  clone.style.borderRadius = tileBorderRadius;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clone.remove();
  };
  clone.addEventListener("transitionend", cleanup, { once: true });
  // Belt-and-suspenders: if the transition never fires (image fails to
  // load, tab backgrounded), kill the clone after a comfortable margin
  // past the longest transition duration.
  window.setTimeout(cleanup, 1500);
}

/** Minimal CSS.escape polyfill for environments where it might be
 *  missing. Only escapes the characters that can show up in our
 *  artwork ids (kebab-case ASCII, with the occasional `_` and digit). */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
