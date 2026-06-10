"use client";

import { useEffect } from "react";

/** sessionStorage key holding the most recent hero snapshot — geometry,
 *  current image src, and the id of the *tile* (not the current
 *  artwork) we want to merge back into. */
const SNAPSHOT_KEY = "artwork-back-flip";

/** sessionStorage key holding the id of the tile the user originally
 *  clicked into. Outlives prev/next chains so the merge-back animation
 *  always lands on a tile that's guaranteed to be in the gallery DOM —
 *  prev/next can walk the user to an artwork that was never rendered
 *  on the home grid. Cleared after the merge completes. */
const ORIGIN_TILE_KEY = "artwork-back-flip-origin";

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

/** Gallery tile click handler calls this with the id of the tile the
 *  user just clicked. Subsequent detail-page snapshots target this tile
 *  even after prev/next, so the merge-back animation always lands on a
 *  tile that's guaranteed to be in the home grid's DOM. */
export function setOriginTile(id: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ORIGIN_TILE_KEY, id);
  } catch {
    /* private mode / quota — fall back to current-artwork targeting */
  }
}

/** Detail page calls this whenever the hero img's geometry changes —
 *  on mount, on load, on scroll, on resize. The most recent snapshot
 *  is what the gallery uses to seed the merge-back FLIP. Reads the
 *  origin tile id from sessionStorage; falls back to the current
 *  artwork id when no origin was set (e.g. deep-linked detail page). */
export function saveBackFlipSnapshot(currentId: string, img: HTMLImageElement) {
  if (typeof window === "undefined") return;
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const cs = window.getComputedStyle(img);
  const targetId =
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem(ORIGIN_TILE_KEY)) || currentId;
  const snapshot: Snapshot = {
    id: targetId,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: cs.borderRadius || "0",
    src: img.currentSrc || img.src,
    ts: Date.now(),
  };
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota / private-mode failure — silently skip the animation rather
    // than break navigation.
  }
}

/** Gallery hook. Tries the merge-back FLIP on mount, then registers a
 *  popstate listener so a back-nav from detail still triggers the
 *  animation when Next.js's Router Cache restored the gallery without
 *  remounting the component. Mirrors ricos.site's
 *  `animateImageBackToGallery` — manual FLIP via a fixed-positioned
 *  clone img, no View Transitions API. */
export function useArtworkBackFlip() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Run once now in case we got here via a back-nav that already
    // landed before the hook attached its popstate listener (e.g. the
    // first mount after a back from a fresh-loaded detail tab).
    scheduleFlip();

    const onPop = () => scheduleFlip();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

function scheduleFlip() {
  if (typeof window === "undefined") return;
  // Two rAFs: one for React to commit the route segment, one for
  // react-photo-album's row solver to finalize tile sizes. Without the
  // second frame `tileRect` is sometimes measured against a placeholder
  // row height and the FLIP lands slightly off.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      let snapshot: Snapshot;
      try {
        snapshot = JSON.parse(raw) as Snapshot;
      } catch {
        sessionStorage.removeItem(SNAPSHOT_KEY);
        return;
      }
      if (!snapshot.id || Date.now() - snapshot.ts > SNAPSHOT_TTL_MS) {
        sessionStorage.removeItem(SNAPSHOT_KEY);
        sessionStorage.removeItem(ORIGIN_TILE_KEY);
        return;
      }
      // Consume the snapshot. If the tile isn't in the DOM we still
      // clear it — leaving it would re-fire on the next popstate and
      // animate the wrong navigation.
      sessionStorage.removeItem(SNAPSHOT_KEY);
      sessionStorage.removeItem(ORIGIN_TILE_KEY);
      runFlip(snapshot);
    });
  });
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
