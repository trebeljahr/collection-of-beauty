"use client";

import { useEffect, useRef } from "react";

/** sessionStorage key holding the most recent hero snapshot — geometry,
 *  current image src, and the id of the *current* artwork the user is
 *  viewing. Refreshed on every detail-page render (mount, load, scroll,
 *  resize) so the merge-back animation always targets whichever artwork
 *  the user was last looking at, even after a long prev/next chain. */
const SNAPSHOT_KEY = "artwork-back-flip";

/** How fresh a snapshot must be to be used. Older entries are stale —
 *  the user probably reopened a tab or navigated via a top-nav link
 *  after the detail page sat idle. */
const SNAPSHOT_TTL_MS = 5_000;

/** Cap on how many times the gallery will pull `expand` (load more
 *  tiles) trying to surface a tile that's not yet in the DOM. At the
 *  home grid's PAGE_SIZE of 80, this covers ~1,600 artworks — comfortably
 *  more than any sane prev/next chain. */
const EXPAND_ATTEMPT_CAP = 20;

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
export function saveBackFlipSnapshot(currentId: string, img: HTMLImageElement) {
  if (typeof window === "undefined") return;
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const cs = window.getComputedStyle(img);
  const snapshot: Snapshot = {
    id: currentId,
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

type BackFlipOptions = {
  /** Pull more tiles into the DOM. Used by the home grid's paginated
   *  loader so the merge-back animation can chase a target artwork the
   *  user prev/next'd to but never scrolled to on the gallery itself. */
  expand?: () => Promise<unknown>;
  /** True iff `expand` still has something to add (more tiles in the
   *  parent's photo array, or the server hasn't been exhausted). */
  canExpand?: () => boolean;
};

/** Gallery hook. Tries the merge-back FLIP on mount, then re-fires on
 *  every `popstate` so back-navigations served by Next.js's Router
 *  Cache (component preserved, no remount) still trigger the
 *  animation. When the target tile isn't in the DOM, repeatedly calls
 *  `expand` (e.g. the gallery's `loadMore`) until it appears or the
 *  attempt cap is hit. Mirrors ricos.site's `animateImageBackToGallery`
 *  for the rendering side — manual FLIP via a fixed-positioned clone
 *  img, no View Transitions API. */
export function useArtworkBackFlip(options: BackFlipOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let inFlight = false;

    const trigger = () => {
      if (inFlight) return;
      inFlight = true;
      void attemptFlip(optionsRef.current).finally(() => {
        inFlight = false;
      });
    };

    trigger();
    const onPop = () => trigger();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

async function attemptFlip(options: BackFlipOptions): Promise<void> {
  // Two rAFs: one for React to commit the route segment, one for
  // react-photo-album's row solver to finalize tile sizes. Without the
  // second frame `tileRect` is sometimes measured against a placeholder
  // row height and the FLIP lands slightly off.
  await rafTwice();

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
    return;
  }

  const selector = `[data-artwork-id="${cssEscape(snapshot.id)}"] img`;
  let tile = document.querySelector<HTMLImageElement>(selector);

  // Tile not in DOM yet — ask the gallery to load more, then re-check.
  // ricos.site doesn't need this because its lightbox lives over a
  // single mounted gallery; here the detail page is its own route, so
  // prev/next can walk the user past the gallery's currently rendered
  // window.
  for (let i = 0; i < EXPAND_ATTEMPT_CAP && !tile; i++) {
    const canExpand = options.canExpand?.() ?? false;
    if (!canExpand || !options.expand) break;
    await options.expand();
    // Wait beyond the gallery's internal 100ms loadMore debounce so a
    // subsequent expand() call isn't rejected by its loadingRef guard.
    await new Promise((r) => setTimeout(r, 150));
    await rafTwice();
    tile = document.querySelector<HTMLImageElement>(selector);
  }

  // Either we found the tile, or we exhausted load-more attempts /
  // there's nothing more to fetch. Consume the snapshot either way so
  // it doesn't bleed into a future navigation.
  sessionStorage.removeItem(SNAPSHOT_KEY);
  if (!tile) return;

  runFlip(snapshot, tile);
}

function runFlip(snapshot: Snapshot, targetTile: HTMLImageElement) {
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

function rafTwice(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
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
