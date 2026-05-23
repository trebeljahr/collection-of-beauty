// Client-side registry of "which variant URL did the browser actually
// load for this artwork". Populated by a single capturing `load`
// listener over every <img data-object-key> on the page (grid cards,
// detail page, etc.). The detail page and lightbox read it to pick an
// instant, already-in-HTTP-cache placeholder — so navigating
// grid → /artwork/[id] → fullscreen reuses the previous step's bytes
// instead of cold-loading a fresh viewport-width variant and flashing a
// spinner.
//
// Module-scope Map: survives client-side route transitions (the JS heap
// persists across Next App Router navigations), which is exactly the
// lifetime we want — a grid thumbnail loaded on `/` is still a valid
// cached placeholder once the user lands on the artwork's detail page.
// Not an LRU: one short string per artwork, a few thousand entries at
// most, dwarfed by the decoded images themselves.

const loadedVariants = new Map<string, string>();

export function recordLoadedVariant(objectKey: string, url: string | null | undefined): void {
  if (!objectKey || !url) return;
  loadedVariants.set(objectKey, url);
}

export function getLoadedVariant(objectKey: string): string | undefined {
  return loadedVariants.get(objectKey);
}

let installed = false;

/** Attach a single document-level capturing listener that records the
 *  resolved `currentSrc` of every <img data-object-key> as it finishes
 *  loading. Capture phase because `load` doesn't bubble. Idempotent —
 *  safe to call from multiple mounts. */
export function installImageLoadTracker(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const record = (img: HTMLImageElement) => {
    const key = img.dataset.objectKey;
    if (!key) return;
    recordLoadedVariant(key, img.currentSrc || img.src);
  };

  document.addEventListener(
    "load",
    (e) => {
      const target = e.target;
      if (target instanceof HTMLImageElement) record(target);
    },
    true,
  );

  // Sweep images that already finished loading before this listener
  // attached (fast cache hits between HTML parse and hydration).
  for (const img of document.querySelectorAll<HTMLImageElement>("img[data-object-key]")) {
    if (img.complete && img.naturalWidth > 0) record(img);
  }
}
