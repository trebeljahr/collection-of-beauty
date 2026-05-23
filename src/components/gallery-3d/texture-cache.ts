"use client";

// Shared texture LRU + GPU upload queue for the 3D museum gallery.
// Ported from an earlier corridor-style gallery's texture pipeline,
// which evolved these patterns to keep a ~200-painting scene smooth.
// The museum needs the same treatment now that a busy floor can
// mount several hundred paintings at once.
//
// Two pieces:
//
//   1. TextureLRU      — bounded cache keyed by URL. Re-visiting a
//      painting within the LRU's lifetime reuses the GPU texture;
//      evicted textures are disposed so GPU memory doesn't grow
//      without bound.
//
//   2. Upload queue    — `renderer.initTexture(tex)` is the one
//      unavoidable main-thread step in a texture load (WebGL single-
//      threaded). Doing it for several heavy textures in the same frame
//      is what makes the scene hitch when the player walks into a
//      crowded floor — so heavy uploads (bases + hi-res) are paced at
//      one per rAF tick. Cheap 256 px placeholder thumbs ride a
//      separate lane drained a few per tick, so a freshly mounted floor
//      sheds its brown swatches fast without the heavy uploads stalling
//      the walk.
//
// Paintings call `loadTextureCached(url, renderer)` instead of
// `useLoader(TextureLoader, url)`. The result is Suspense-friendly via
// the bundled `useCachedTexture` hook.
//
// ─────────────────────────────────────────────────────────────────────
// Two prefetch pipelines share this module. They are non-overlapping
// by design — read this before touching either or adding a third.
// ─────────────────────────────────────────────────────────────────────
//
//   A. Per-painting LOD (painting.tsx + lod-controller.tsx)
//      Drives the *current floor's* paintings. The LodController ticks
//      at ~5 Hz, walks the painting registry, and per-painting:
//        • MRU-touches the 960 px base in `cache` so it can't age out
//          while mounted (a busy floor mounts > 96 paintings — without
//          this the LRU would dispose textures the player is still
//          looking at).
//        • Prefetches the next-higher LOD tier into `hiresCache` as the
//          player crosses each tier's `prefetchSq` radius, and upgrades
//          `material.map` once the tier is resident. Demotes back on
//          retreat past `releaseSq` (hysteresis).
//      Capacity-wise this pipeline owns `cache` (96, base/thumb) and
//      `hiresCache` (20, hi-res tiers). Both use the *high* upload
//      queue. Eviction is per-pool LRU with disposal; the per-tick MRU
//      touch is what keeps in-view textures from being evicted.
//
//   B. Staircase-approach preload (FloorPreloader in index.tsx)
//      Drives the *adjacent floor's* thumbs before the player crosses
//      the stair. The Player edge-fires `nearbyStairId` when the camera
//      crosses STAIR_PROXIMITY_RADIUS (12 m) around any stair; the
//      FloorPreloader walks the connected floor's placements and primes
//      every 256 px AVIF thumb into `preloadCache` via the *low* upload
//      queue. None of those paintings are mounted yet (`FloorScene`
//      keeps adjacent floors at `showOnly="stairwell"` until the player
//      actually rides the stair), so pipeline A *cannot* be touching
//      them — there are no PaintingPlanes to fire useLayoutEffects yet.
//      When the player rides the stair, the destination floor upgrades
//      to full geometry, paintings mount, and their useLayoutEffect
//      calls `peekCached(thumbUrl)` → finds the preloaded thumb →
//      promotes it into `cache` (evictWithoutDispose + put) → installs
//      it on `material.map` *before first paint*. No brown-swatch flash.
//
// Invariants this module enforces:
//
//   • Three separate Maps (`cache`, `hiresCache`, `preloadCache`). No
//     cross-pool eviction — a preload burst of an entire floor's worth
//     of thumbs (256 cap) cannot push out current-floor base textures.
//   • Upload queue is placeholder-before-high-before-low. Placeholder
//     thumbs paint first; a floor-wide preload (potentially hundreds of
//     `initTexture` calls) on the low queue cannot delay a hi-res
//     upgrade the player is actively walking toward.
//   • Promotion is destructive on the preload side only: the thumb's
//     GPU texture survives via `evictWithoutDispose`, and from that
//     point the LodController's per-tick MRU touch keeps it alive in
//     `cache`. The preload pool itself isn't tickled by the LOD loop,
//     so without the handoff a promoted-not-removed thumb would age out
//     the moment the player walked deeper into the new floor.
//
// If you add a third prefetch path, decide up front which pool it owns
// and whether it should ride the high or low upload queue — the
// invariants above only hold for these two callers.

import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

const TEXTURE_CACHE_CAPACITY = 96;
const TEXTURE_LOAD_ATTEMPTS = 3;
const TEXTURE_LOAD_TIMEOUT_MS = 15_000;
const TEXTURE_RETRY_DELAY_MS = 500;
// Hi-res cache is small on purpose — at most a handful of paintings are
// inside the upgrade radius at any moment, and these textures are 4–32×
// the GPU memory of a 960 px base. Eviction frees GPU memory quickly
// when the player walks past. Sized for two concurrent tiers (1920 +
// 2560 px) across the paintings visible from the current room with
// some headroom for the next room's prefetch.
const HIRES_CACHE_CAPACITY = 20;
// Preload pool — holds tiny 256 px thumbs primed for the next floor
// while the player approaches a staircase. Kept separate from the main
// `cache` so a busy preload (potentially every painting on the
// destination floor) can't evict the texture the player is currently
// staring at. Capacity is generous: 256 thumbs × ~340 KB decoded with
// mipmaps ≈ 90 MB, dwarfed by the base 960 px cache budget.
const PRELOAD_CACHE_CAPACITY = 256;

class TextureLRU {
  private map = new Map<string, THREE.Texture>();
  constructor(private capacity: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): THREE.Texture | undefined {
    const tex = this.map.get(key);
    if (tex) {
      // Move to most-recently-used position by delete + re-insert.
      this.map.delete(key);
      this.map.set(key, tex);
    }
    return tex;
  }

  put(key: string, tex: THREE.Texture): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, tex);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const old = this.map.get(oldest);
      this.map.delete(oldest);
      old?.dispose();
    }
  }

  forEach(fn: (tex: THREE.Texture) => void): void {
    for (const tex of this.map.values()) fn(tex);
  }

  /** Drop an entry without disposing its GPU texture. Used to hand off
   *  a preloaded thumb into the main cache — the texture itself stays
   *  alive in the destination LRU. */
  evictWithoutDispose(key: string): void {
    this.map.delete(key);
  }
}

const cache = new TextureLRU(TEXTURE_CACHE_CAPACITY);
const inFlight = new Map<string, Promise<THREE.Texture>>();
const preloadCache = new TextureLRU(PRELOAD_CACHE_CAPACITY);
const preloadInFlight = new Map<string, Promise<THREE.Texture | null>>();

class TextureHttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`fetch ${url}: ${status}`);
    this.name = "TextureHttpError";
  }
}

/** Read the GPU's max anisotropy if available, else fall back to a
 *  conservative 4. Most desktop GPUs report 16; mobile typically 4–8.
 *  Higher anisotropy mainly helps when paintings are viewed at a
 *  glancing angle — the flat 4× we used before was visibly softer than
 *  a 1:1 zoom view of the same image. */
function aniso(renderer: THREE.WebGLRenderer | null): number {
  if (!renderer) return 4;
  try {
    return renderer.capabilities.getMaxAnisotropy?.() ?? 4;
  } catch {
    return 4;
  }
}

const hiresCache = new TextureLRU(HIRES_CACHE_CAPACITY);
const hiresInFlight = new Map<string, Promise<THREE.Texture>>();

// ─────────────────────────────────────────────────────────────────────
// GPU upload queue — one texImage2D per rAF tick.
// ─────────────────────────────────────────────────────────────────────

type UploadTask = {
  tex: THREE.Texture;
  renderer: THREE.WebGLRenderer;
  resolve: () => void;
};
type UploadPriority = "placeholder" | "high" | "low";
// Three queues, drained placeholder-before-high-before-low.
//   placeholder — 256 px blur thumbs a freshly-mounted painting shows
//                 in place of the brown swatch. Jump ahead of bases so
//                 a floor-swap burst clears its placeholders fast.
//   high        — 960 px bases + proximity hi-res tiers.
//   low         — staircase-approach preload of the adjacent floor.
const placeholderQueue: UploadTask[] = [];
const uploadQueue: UploadTask[] = [];
const lowUploadQueue: UploadTask[] = [];
let pumpScheduled = false;

// Per-frame upload pacing. initTexture is a synchronous GPU upload +
// mipmap generation; its real cost lands on the GPU after the call
// returns, so a wall-clock budget can't see it (performance.now()
// undercounts and the frame hitches anyway). Pace by COUNT, split by
// cost:
//
//   • Placeholders (256 px thumbs) are tiny — drain a few per frame so
//     a freshly-mounted floor sheds its brown swatches fast.
//   • Bases / hi-res tiers (960 px … original) are heavy enough that
//     more than one per frame visibly hitches the walk. Exactly one per
//     frame — the cap the gallery shipped with before the brown-swatch
//     work, which is why the walk stayed smooth.
//
// An earlier pass here drained up to a dozen heavy uploads per frame on
// a time budget; on a floor swap that tanked FPS, which starved the LOD
// useFrame tick so hi-res tiers stopped arriving. Counts, not time, and
// one heavy upload per frame.
const PLACEHOLDER_UPLOADS_PER_FRAME = 4;

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  requestAnimationFrame(pumpUploads);
}

function runUpload(task: UploadTask) {
  try {
    task.renderer.initTexture(task.tex);
  } catch {
    // Some drivers occasionally reject — R3F will upload lazily at
    // draw time instead. Not fatal.
  }
  task.resolve();
}

function pumpUploads() {
  pumpScheduled = false;
  // Cheap placeholders first — a handful per frame.
  let placed = 0;
  while (placed < PLACEHOLDER_UPLOADS_PER_FRAME) {
    const task = placeholderQueue.shift();
    if (!task) break;
    runUpload(task);
    placed++;
  }
  // Then exactly one heavy upload: high (base / hi-res) before low
  // (preload) so a floor-wide preload can't delay a tier the player
  // needs right now.
  const heavy = uploadQueue.shift() ?? lowUploadQueue.shift();
  if (heavy) runUpload(heavy);

  if (placeholderQueue.length > 0 || uploadQueue.length > 0 || lowUploadQueue.length > 0) {
    schedulePump();
  }
}

function enqueueUpload(
  tex: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  priority: UploadPriority = "high",
): Promise<void> {
  return new Promise((resolve) => {
    const q =
      priority === "low"
        ? lowUploadQueue
        : priority === "placeholder"
          ? placeholderQueue
          : uploadQueue;
    q.push({ tex, renderer, resolve });
    schedulePump();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isPermanentHttpError(err: unknown): boolean {
  return (
    err instanceof TextureHttpError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 408 &&
    err.status !== 429
  );
}

async function withTextureTimeout<T>(
  url: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out loading texture ${url} after ${TEXTURE_LOAD_TIMEOUT_MS}ms`));
    }, TEXTURE_LOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main entry — fetch, decode, upload, cache.
// ─────────────────────────────────────────────────────────────────────

async function loadTextureCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  priority: UploadPriority = "high",
): Promise<THREE.Texture> {
  const cached = cache.get(url);
  if (cached) return cached;

  // Promote any matching preloaded thumb into the main cache — the
  // thumb is about to be displayed, so it belongs in the LRU that
  // current-floor LodController touches keep alive. Detaches from
  // preloadCache without disposing (TextureLRU.delete is destructive,
  // so reach in through get + manual eviction-skip).
  const preloaded = preloadCache.get(url);
  if (preloaded) {
    preloadCache.evictWithoutDispose(url);
    cache.put(url, preloaded);
    return preloaded;
  }

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= TEXTURE_LOAD_ATTEMPTS; attempt++) {
      try {
        const tex = await withTextureTimeout(url, async (signal) => {
          // createImageBitmap decodes off-thread, which matters for a burst
          // of painting loads. `imageOrientation: flipY` avoids the expensive
          // CPU flip THREE does on upload when `flipY` is left true.
          const res = await fetch(url, { credentials: "omit", signal });
          if (!res.ok) throw new TextureHttpError(url, res.status);
          const blob = await res.blob();
          if (signal.aborted) throw new DOMException("aborted", "AbortError");
          const bitmap = await createImageBitmap(blob, {
            imageOrientation: "flipY",
          });
          if (signal.aborted) throw new DOMException("aborted", "AbortError");
          const texture = new THREE.Texture(bitmap);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = aniso(renderer);
          texture.minFilter = THREE.LinearMipMapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.flipY = false; // already flipped during createImageBitmap
          texture.needsUpdate = true;
          if (renderer) await enqueueUpload(texture, renderer, priority);
          return texture;
        });
        cache.put(url, tex);
        return tex;
      } catch (err) {
        lastError = err;
        if (attempt === TEXTURE_LOAD_ATTEMPTS || isPermanentHttpError(err)) break;
        await delay(TEXTURE_RETRY_DELAY_MS * attempt);
      }
    }

    throw lastError;
  })().finally(() => {
    inFlight.delete(url);
  });

  inFlight.set(url, promise);
  return promise;
}

// ─────────────────────────────────────────────────────────────────────
// Suspense-friendly hook. Reads from cache synchronously (hit), or
// throws the load promise (miss) so React's Suspense boundary catches
// it — same contract `useLoader` uses.
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Hi-res cache — separate LRU for the proximity upgrade. Kept apart
// from the main cache so a busy floor of 960 px paintings can't push
// out hi-res textures the player is currently looking at, and the
// other way round.
//
// `getHiRes` touches MRU on read, which is what callers in the LOD
// loop want: anything they query is either currently displayed or
// about to be, so pinning it in the LRU until the player walks away
// is exactly the right behaviour.
// ─────────────────────────────────────────────────────────────────────

export function getHiRes(url: string): THREE.Texture | undefined {
  return hiresCache.get(url);
}

/** Optional knobs for `loadHiRes`. `maxSize` + the source dimensions
 *  let us cap the decoded bitmap at the GPU's MAX_TEXTURE_SIZE so an
 *  oversized original (16k+ px Google Arts scans) doesn't fail upload
 *  on devices with smaller texture limits. createImageBitmap honours
 *  resizeWidth/Height — and the browser will downscale during decode
 *  on JPEG/PNG, saving GPU memory (it doesn't shrink the network
 *  fetch or CPU decode cost). */
export type LoadHiResOpts = {
  maxSize?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

export function loadHiRes(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  signal?: AbortSignal,
  opts?: LoadHiResOpts,
): Promise<THREE.Texture> {
  const cached = hiresCache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = hiresInFlight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(url, { credentials: "omit", signal });
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    const blob = await res.blob();
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const bitmapOpts: ImageBitmapOptions = { imageOrientation: "flipY" };
    if (opts?.maxSize && opts.sourceWidth && opts.sourceHeight) {
      const longest = Math.max(opts.sourceWidth, opts.sourceHeight);
      if (longest > opts.maxSize) {
        const scale = opts.maxSize / longest;
        bitmapOpts.resizeWidth = Math.round(opts.sourceWidth * scale);
        bitmapOpts.resizeHeight = Math.round(opts.sourceHeight * scale);
        bitmapOpts.resizeQuality = "high";
      }
    }
    const bitmap = await createImageBitmap(blob, bitmapOpts);
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const tex = new THREE.Texture(bitmap);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso(renderer);
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.flipY = false;
    tex.needsUpdate = true;
    if (renderer) await enqueueUpload(tex, renderer);
    hiresCache.put(url, tex);
    return tex;
  })().finally(() => {
    hiresInFlight.delete(url);
  });

  hiresInFlight.set(url, promise);
  return promise;
}

export function useCachedTexture(url: string): THREE.Texture {
  const { gl } = useThree();
  // We only care about `gl` identity to avoid the React hook warning.
  // loadTextureCached handles null renderer (e.g. SSR) gracefully.
  // biome-ignore lint/correctness/useExhaustiveDependencies: gl identity is stable per renderer; re-memoising on it would thrash Suspense
  return useMemo(() => {
    const hit = cache.get(url);
    if (hit) return hit;
    throw loadTextureCached(url, gl);
  }, [url]);
}

/** Synchronous cache lookup. Returns the cached texture if present
 *  (with an MRU touch — querying a texture you're about to display
 *  is exactly the right time to pin it), else undefined.
 *
 *  Also checks the preload pool: if a thumb was primed there for a
 *  staircase-proximity preload and the painting just mounted, promote
 *  the texture into the main cache so the LodController's per-tick MRU
 *  touch keeps it alive. The preload pool itself isn't tickled by the
 *  LOD loop, so without this hand-off the thumb would age out the
 *  moment the player walks deeper into the new floor.
 *
 *  Used by `PaintingPlane` so a return visit installs the cached
 *  texture into the material on the first render — no Suspense
 *  fallback flash. Public counterpart of `getHiRes`. */
export function peekCached(url: string): THREE.Texture | undefined {
  const cached = cache.get(url);
  if (cached) return cached;
  const preloaded = preloadCache.get(url);
  if (preloaded) {
    preloadCache.evictWithoutDispose(url);
    cache.put(url, preloaded);
    return preloaded;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Preload — same fetch + decode + upload pipeline as `loadCached`, but
// targets the dedicated preload pool and routes the GPU upload through
// the low-priority queue. Used by FloorPreloader to prime the adjacent
// floor's 256 px thumbs while the player is still approaching the
// staircase — by the time the destination floor mounts, the thumbs are
// resident in the cache and PaintingPlane installs them on first paint
// instead of flashing the brown swatch.
//
// Single attempt (not the 3-retry pipeline that the main loader uses)
// because a preload miss is not visually fatal — the painting just
// falls back to its normal cold load. Aborting on `signal` lets the
// host short-circuit the queue when the player walks away from the
// stair before the preload finishes.
// ─────────────────────────────────────────────────────────────────────

export function preloadCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  signal?: AbortSignal,
): Promise<THREE.Texture | null> {
  if (!url) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  const alreadyPreloaded = preloadCache.get(url);
  if (alreadyPreloaded) return Promise.resolve(alreadyPreloaded);
  const existing = preloadInFlight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(url, { credentials: "omit", signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (signal?.aborted) return null;
      const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
      if (signal?.aborted) return null;
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = aniso(renderer);
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.flipY = false;
      texture.needsUpdate = true;
      if (renderer) await enqueueUpload(texture, renderer, "low");
      preloadCache.put(url, texture);
      return texture;
    } catch {
      return null;
    }
  })().finally(() => {
    preloadInFlight.delete(url);
  });

  preloadInFlight.set(url, promise);
  return promise;
}

/** Eager async load that goes through the same LRU + upload queue as
 *  the Suspense path. Used by the painting's progressive loader to
 *  fire-and-forget both the 256 px placeholder and the 960 px base
 *  in parallel. Pass priority "placeholder" for the thumb so it jumps
 *  ahead of bases during a floor-swap upload burst — the blur paints
 *  fast, the base upgrades on top once its turn comes. */
export function loadCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  priority: UploadPriority = "high",
): Promise<THREE.Texture> {
  return loadTextureCached(url, renderer, priority);
}

/** After a `webglcontextrestored` event, every cached THREE.Texture's
 *  GPU-side upload is gone but its CPU-side `image` (an ImageBitmap or
 *  HTMLImageElement) is still alive. Setting `needsUpdate = true` makes
 *  the renderer re-upload from `image` on the next frame, so paintings
 *  and hi-res LOD tiers come back without us having to refetch them
 *  from the network. Called from the gallery's context-restored
 *  handler — never on a cold load. */
export function markCachedTexturesForReupload(): void {
  cache.forEach((t) => {
    t.needsUpdate = true;
  });
  hiresCache.forEach((t) => {
    t.needsUpdate = true;
  });
  preloadCache.forEach((t) => {
    t.needsUpdate = true;
  });
}

export const _textureCacheDebug = {
  get size() {
    return cache.size;
  },
  get inFlight() {
    return inFlight.size;
  },
  get queued() {
    return uploadQueue.length;
  },
  get hiresSize() {
    return hiresCache.size;
  },
  get hiresInFlight() {
    return hiresInFlight.size;
  },
  get preloadSize() {
    return preloadCache.size;
  },
  get preloadInFlight() {
    return preloadInFlight.size;
  },
  get lowQueued() {
    return lowUploadQueue.length;
  },
};
