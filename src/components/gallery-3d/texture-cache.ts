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
//      threaded). Doing it for dozens of textures in the same frame
//      is what makes the scene hitch when the player walks into a
//      crowded floor. The queue serialises uploads across rAF ticks
//      so at most one hitch per frame.
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
//        • MRU-touches the base texture in `cache` so it can't age out
//          while mounted — without this the LRU would dispose textures
//          the player is still looking at.
//        • Prefetches the next-higher LOD tier into `hiresCache` as the
//          player crosses each tier's `prefetchSq` radius, and upgrades
//          `material.map` once the tier is resident. Demotes back on
//          retreat past `releaseSq` (hysteresis).
//      Capacity-wise this pipeline owns `cache` (~256 MB, base/thumb)
//      and `hiresCache` (~320 MB, hi-res tiers). Both are byte-budgeted
//      and both use the *high* upload queue. Eviction is per-pool LRU
//      with disposal; the per-tick MRU touch is what keeps in-view
//      textures from being evicted.
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
//   • Upload queue is high-before-low. A floor-wide preload (potentially
//     hundreds of `initTexture` calls) cannot delay a hi-res upgrade the
//     player is actively walking toward.
//   • Within a tier, both the network gate and the upload queue serve
//     the item closest to the camera first (see "Distance-ordered
//     scheduling" below). Callers pass the world position of the
//     painting a load belongs to; anything unpositioned is treated as a
//     direct user action and jumps the queue.
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
import { variantProxyUrl, variantUrl } from "@/lib/utils";

// Base-texture pool. Two limits, whichever bites first:
//
//   • entry count — a ceiling on bookkeeping, not memory. A floor mounts
//     up to ~300 paintings and the LodController MRU-touches every
//     mounted one on each tick, so a count below the mounted set makes
//     the LRU thrash: each tick evicts + disposes textures the player is
//     still looking at, and they re-upload on the next frame. Sized
//     above what a floor can mount so eviction is driven by the byte
//     budget instead.
//   • byte budget — the real constraint. Paintings now take a base
//     sized to their display size (480 px ≈ 1 MB decoded + mipmaps,
//     960 px ≈ 3.9 MB), so a fixed entry count can't express "keep
//     roughly this much GPU memory". ~256 MB holds a floor's worth of
//     the small plates or ~65 of the largest canvases — comfortably
//     more than the mounted set the room unload radius allows.
const TEXTURE_CACHE_CAPACITY = 512;
const TEXTURE_CACHE_BYTE_BUDGET = 256 * 1024 * 1024;
const TEXTURE_LOAD_ATTEMPTS = 3;
const TEXTURE_LOAD_TIMEOUT_MS = 15_000;
const TEXTURE_RETRY_DELAY_MS = 500;
// Hi-res pool. Bounded by BYTES, not by entry count, because the tiers
// that live here differ by an order of magnitude: a 960 px upgrade is
// ~4 MB while a 4096 px tier runs 60–86 MB. A flat 20-entry cap meant
// either "20 × 86 MB = 1.7 GB resident" on a wall of big canvases, or
// thrash on a wall of small plates where 20 entries is fewer than the
// works inside the 960 px prefetch radius.
//
// The budget has to comfortably exceed the *in-radius working set*, not
// just a single entry. `lodUpdate` re-requests any tier that isn't
// resident, so a budget smaller than what the player can legitimately
// stand in front of doesn't degrade gracefully — it evicts and refetches
// at the LOD tick rate, turning every step near a wall into a stream of
// multi-megabyte decodes and GPU uploads. (That is exactly what the old
// 8192 px "original" tier did: a 237 MB median entry against a 192 MB
// pool. See the ladder note in painting.tsx.)
//
// 320 MB holds ~4 tiers at 4096 px — the realistic worst case is a few
// large canvases whose surfaces are inside their (now per-painting)
// prefetch radius, plus a stepping stone still in flight — or a full
// room's worth of 960 px upgrades, and evicts fast when the player
// walks away. The entry cap is now just a bookkeeping ceiling.
//
// THE BUDGET SCALES WITH THE CANVAS, and it is the first pool here that
// has to. Under the old fixed LOD table every painting reached for a
// 4096 px tier regardless of viewport, so the working set was large
// (worst floor ~804 MiB) but viewport-INDEPENDENT. Now each painting's
// target is `renderWidthM x backingHeightPx / (2 x D_MIN x tan(fov/2))`
// (painting.tsx), so rung pixels go as H and decoded bytes as H^2 — a
// pool calibrated on a laptop overflows on a 4K panel and turns into the
// eviction treadmill this budget exists to prevent.
//
// Measured against the real `layoutMuseum(artworks.json)` output (11
// floors, 2,801 placements) by standing the player 0.45 m off each
// painting in turn and summing every rung whose prefetch radius contains
// them, worst floor:
//
//   backing px    1440   1800   2160   2560   2880
//   resident      297    303    413    517    548    MiB
//   budget        320    320    461    640    640    MiB
//
// Hence: 320 MB at 1800 px and below, growing as (H/1800)^2, capped at
// 2x. The cap is a GPU-reality ceiling, not a curve fit — 640 MB of
// scene textures alongside the 256 MB base cache is already an assertive
// ask, and past 2880 px the additional headroom would buy sharpness on
// works the player still has to walk to one at a time.
const HIRES_CACHE_CAPACITY = 64;
const HIRES_BASE_BYTE_BUDGET = 320 * 1024 * 1024;
const HIRES_BUDGET_REFERENCE_HEIGHT = 1800;
const HIRES_BUDGET_MAX_SCALE = 2;

/** Ceiling for a SINGLE hi-res entry, used by painting.tsx to clamp a
 *  painting's top LOD rung before it is ever requested.
 *
 *  One third of the BASE pool — deliberately not one third of the scaled
 *  pool. The scaling above exists to fit a working set that grew because
 *  more paintings hold more rungs; letting the per-entry cap ride up with
 *  it would instead admit bigger individual rungs (a 6144 px entry at 4:3
 *  is 144.7 MiB and only clears a cap derived from a >434 MB pool), which
 *  spends the extra budget on the one thing the cap was written to stop
 *  and re-couples "how big may one texture be" to the viewport. A fixed
 *  106.7 MiB ceiling keeps at least three in-radius canvases resident
 *  even at the pool's floor.
 *
 *  The failure mode this prevents is not "slightly over budget" — it is
 *  the 8192 px "original" tier that used to sit on top of the ladder: a
 *  median 237 MB entry against a 192 MB pool evicted the whole pool on
 *  insert and was evicted straight back out by the next load, and because
 *  `lodUpdate` re-requests any tier that isn't resident, that became a
 *  permanent 5 Hz treadmill of quarter-gigabyte decodes and uploads.
 *  That is the walking stutter.
 *  See the ladder note in painting.tsx for the full post-mortem.
 *
 *  Ordered strictly below OVERSIZED_ENTRY_RATIO (1/3 = 0.333 < 0.4) at
 *  the pool's floor, so anything the clamp admits can never trip the dev
 *  warning below — and a scaled-up pool only widens that margin.
 *
 *  Arithmetic worth having written down: the cap is 106.7 MiB. A 4:3
 *  work at 4096 px decodes to 64.3 MiB and passes comfortably; a 2:3
 *  portrait at 4096 is 4096 × 6144 = 128.6 MiB and is clamped down a
 *  rung (462 of 4,571 catalogued works are in that position today, 22 of
 *  them already past the 0.4 warning line). The 6144 px rung is
 *  144.7 MiB at 4:3, so at this budget it is admissible only on wide
 *  canvases (aspect >= 1.81) — deliberate: raising the cap to admit it
 *  everywhere is a separate decision, to be taken with the re-shrink
 *  that first puts a 6144 file on disk. */
export const HIRES_ENTRY_BYTE_CAP = HIRES_BASE_BYTE_BUDGET / 3;
// A single entry bigger than this share of its pool guarantees eviction
// thrash: inserting it drops everything else, and the next insert drops
// it straight back out. Dev-only warning so a future tier that decodes
// bigger than the pool can hold is loud instead of silently shipping as
// "the museum feels laggy again".
const OVERSIZED_ENTRY_RATIO = 0.4;
// Preload pool — holds tiny 256 px thumbs primed for the next floor
// while the player approaches a staircase. Kept separate from the main
// `cache` so a busy preload (potentially every painting on the
// destination floor) can't evict the texture the player is currently
// staring at. Capacity is generous: 256 thumbs × ~340 KB decoded with
// mipmaps ≈ 90 MB, dwarfed by the base 960 px cache budget.
const PRELOAD_CACHE_CAPACITY = 256;

/** Rough GPU cost of a decoded texture: RGBA8 plus a full mip chain
 *  (the 1/3 geometric series, so ×4/3). Good enough to keep a pool
 *  inside a memory budget; exact driver-side padding doesn't matter.
 *
 *  Exported so painting.tsx can PREDICT an entry's cost from pixel dims
 *  before requesting it (HIRES_ENTRY_BYTE_CAP) using the same formula
 *  the pool later ACCOUNTS with — a prediction that drifted from the
 *  accounting would admit exactly the entries the cap exists to keep
 *  out. */
export function estimateTextureBytes(w: number, h: number): number {
  if (!w || !h) return 0;
  return Math.round(w * h * 4 * 1.34);
}

function textureBytes(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number } | undefined;
  return estimateTextureBytes(img?.width ?? 0, img?.height ?? 0);
}

class TextureLRU {
  private map = new Map<string, THREE.Texture>();
  private bytes = 0;
  /** Optional GPU-memory ceiling. When set, entries are evicted oldest-
   *  first until the pool fits, independent of the entry count. */
  constructor(
    private capacity: number,
    private byteBudget = Number.POSITIVE_INFINITY,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get byteSize(): number {
    return this.bytes;
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
    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= textureBytes(existing);
      this.map.delete(key);
    }
    this.map.set(key, tex);
    const added = textureBytes(tex);
    this.bytes += added;
    if (
      process.env.NODE_ENV !== "production" &&
      Number.isFinite(this.byteBudget) &&
      added > this.byteBudget * OVERSIZED_ENTRY_RATIO
    ) {
      console.warn(
        `[texture-cache] ${key} decodes to ${Math.round(added / 1048576)} MB against a ` +
          `${Math.round(this.byteBudget / 1048576)} MB pool — entries this large evict the ` +
          "pool on insert and get evicted straight back out, which shows up as walking stutter.",
      );
    }
    this.evictToBudget();
  }

  /** Never evicts down to nothing: after a `put` the sole survivor is the
   *  entry the caller is about to display, and after a re-budget it is
   *  whatever was touched most recently — which for the hi-res pool is
   *  the texture currently on a painting's material. Dropping it would
   *  dispose a GPU texture that is still bound. */
  private evictToBudget(): void {
    while (this.map.size > 1 && (this.map.size > this.capacity || this.bytes > this.byteBudget)) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const old = this.map.get(oldest);
      this.map.delete(oldest);
      if (old) {
        this.bytes -= textureBytes(old);
        old.dispose();
      }
    }
  }

  /** Re-budget an existing pool, evicting down to the new ceiling right
   *  away. `capacity` is untouched — it is a bookkeeping ceiling, the
   *  bytes are the real constraint. */
  setByteBudget(budget: number): void {
    this.byteBudget = budget;
    this.evictToBudget();
  }

  forEach(fn: (tex: THREE.Texture) => void): void {
    for (const tex of this.map.values()) fn(tex);
  }

  /** Drop an entry without disposing its GPU texture. Used to hand off
   *  a preloaded thumb into the main cache — the texture itself stays
   *  alive in the destination LRU. */
  evictWithoutDispose(key: string): void {
    const tex = this.map.get(key);
    if (!tex) return;
    this.bytes -= textureBytes(tex);
    this.map.delete(key);
  }
}

const cache = new TextureLRU(TEXTURE_CACHE_CAPACITY, TEXTURE_CACHE_BYTE_BUDGET);
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

const hiresCache = new TextureLRU(HIRES_CACHE_CAPACITY, HIRES_BASE_BYTE_BUDGET);
const hiresInFlight = new Map<string, Promise<THREE.Texture>>();

/**
 * Re-size the hi-res pool for the current canvas. Called by the
 * LodController whenever the backing-buffer height changes (see the
 * budget table above).
 *
 * Shrinking evicts immediately rather than waiting for the next insert,
 * because a window drag from 4K down to a small pane would otherwise
 * leave half a gigabyte of textures resident until the player happened to
 * load one more.
 *
 * Pass 0 to return the pool to its base budget. This module is
 * deliberately module-scope — it has to survive the Canvas remount that
 * recovers from WebGL context loss — so nothing disposes it when the
 * player leaves /gallery-3d, and a pool left scaled up for a 4K panel
 * would keep 640 MB resident on a route that no longer draws anything.
 */
export function setHiResByteBudget(backingHeightPx: number): void {
  const h = backingHeightPx > 0 ? backingHeightPx : HIRES_BUDGET_REFERENCE_HEIGHT;
  const scale = Math.min(
    HIRES_BUDGET_MAX_SCALE,
    Math.max(1, (h / HIRES_BUDGET_REFERENCE_HEIGHT) ** 2),
  );
  hiresCache.setByteBudget(Math.round(HIRES_BASE_BYTE_BUDGET * scale));
}

// ─────────────────────────────────────────────────────────────────────
// Distance-ordered scheduling.
//
// Both bottlenecks below (the network slot gate and the GPU upload
// queue) used to be FIFO, so a floor loaded in whatever order React
// happened to mount its paintings — the room the player is standing in
// waited behind rooms three doorways away. Every queued item now
// carries the world position of the painting it belongs to, and both
// queues hand the next slot to whichever waiting item is closest to the
// camera *right now*. The result is the room you're in filling first,
// then the walls next door, expanding outward as you walk.
//
// Ordering is by live camera distance, not by the distance at enqueue
// time: the player keeps moving while a hundred items sit in the queue,
// so a snapshot taken at enqueue would be stale by the time the slot
// frees up.
// ─────────────────────────────────────────────────────────────────────

/** World position a queued load belongs to. `null` means "unpositioned"
 *  — the zoom modal and other explicit user actions, which jump the
 *  queue entirely (they're a direct response to a click, not a
 *  speculative floor load). */
export type LoadOrigin = readonly [number, number, number] | null;

let cameraX = 0;
let cameraY = 0;
let cameraZ = 0;

/** Feed the scheduler the camera position. Called from the
 *  LodController's ~5 Hz tick — the queues only need to know roughly
 *  where the player is, and a walking player covers < 1 m between
 *  ticks. */
export function setLoadCamera(x: number, y: number, z: number): void {
  cameraX = x;
  cameraY = y;
  cameraZ = z;
}

function originRank(origin: LoadOrigin): number {
  if (!origin) return -1;
  const dx = origin[0] - cameraX;
  const dy = origin[1] - cameraY;
  const dz = origin[2] - cameraZ;
  return dx * dx + dy * dy + dz * dz;
}

/** Pop the queued item closest to the camera. Linear scan: queues run to
 *  a few hundred entries at most and this runs once per freed slot /
 *  rAF tick, so a heap would be bookkeeping for no measurable win. */
function takeNearest<T extends { origin: LoadOrigin }>(queue: T[]): T | undefined {
  if (queue.length === 0) return undefined;
  let bestIdx = 0;
  let bestRank = originRank(queue[0].origin);
  for (let i = 1; i < queue.length; i++) {
    const rank = originRank(queue[i].origin);
    if (rank < bestRank) {
      bestRank = rank;
      bestIdx = i;
    }
  }
  return queue.splice(bestIdx, 1)[0];
}

// ─────────────────────────────────────────────────────────────────────
// GPU upload queue — one texImage2D per rAF tick.
// ─────────────────────────────────────────────────────────────────────

type UploadTask = {
  tex: THREE.Texture;
  renderer: THREE.WebGLRenderer;
  resolve: () => void;
  origin: LoadOrigin;
};
type UploadPriority = "high" | "low";
// Two queues, drained high-before-low, and *within* each queue nearest
// the player first (see LoadOrigin). "low" backs preload uploads so a
// floor's worth of thumb uploads can't push past a hi-res upgrade the
// player is actively walking toward.
const uploadQueue: UploadTask[] = [];
const lowUploadQueue: UploadTask[] = [];
let pumpScheduled = false;

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  requestAnimationFrame(pumpUploads);
}

function pumpUploads() {
  pumpScheduled = false;
  const task = takeNearest(uploadQueue) ?? takeNearest(lowUploadQueue);
  if (task) {
    try {
      task.renderer.initTexture(task.tex);
    } catch {
      // Some drivers occasionally reject — R3F will upload lazily at
      // draw time instead. Not fatal.
    }
    task.resolve();
  }
  if (uploadQueue.length > 0 || lowUploadQueue.length > 0) schedulePump();
}

function enqueueUpload(
  tex: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  priority: UploadPriority = "high",
  origin: LoadOrigin = null,
): Promise<void> {
  return new Promise((resolve) => {
    const q = priority === "low" ? lowUploadQueue : uploadQueue;
    q.push({ tex, renderer, resolve, origin });
    schedulePump();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────
// Network concurrency gate.
//
// The browser caps connections per origin (~6 on HTTP/1.1), and in dev
// every texture request is proxied through Next over plain HTTP/1.1.
// When a floor mounts, ~100 paintings each fire a fetch in the same
// tick (thumb + 960 base), and the FloorPreloader can add a whole
// adjacent floor's worth on top. Left ungated they all pile onto those
// few connections and the tail sits in the browser's request queue long
// enough to trip the 15 s load timeout — the dev "[painting] … Timed
// out" flood. Capping in-flight fetches to a small budget keeps every
// request actively moving instead of stalling.
//
// Crucially the per-load timeout is armed *inside* withLoadSlot — only
// once a slot is held and the fetch is about to go out — so time spent
// waiting for a slot never counts against the timeout. High-before-low
// mirrors the upload queue: player-facing base/hi-res loads jump ahead
// of a low-priority preload burst.
const NETWORK_CONCURRENCY = 6;
let activeLoads = 0;
type LoadWaiter = { resolve: () => void; origin: LoadOrigin };
const highLoadWaiters: LoadWaiter[] = [];
const lowLoadWaiters: LoadWaiter[] = [];

function acquireLoadSlot(priority: UploadPriority, origin: LoadOrigin): Promise<void> {
  if (activeLoads < NETWORK_CONCURRENCY) {
    activeLoads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    (priority === "low" ? lowLoadWaiters : highLoadWaiters).push({ resolve, origin });
  });
}

function releaseLoadSlot(): void {
  // Hand the slot straight to the next waiter (high first, nearest the
  // player within each tier) without touching the counter; only drop
  // the count when nobody is waiting.
  const next = takeNearest(highLoadWaiters) ?? takeNearest(lowLoadWaiters);
  if (next) next.resolve();
  else activeLoads--;
}

async function withLoadSlot<T>(
  priority: UploadPriority,
  origin: LoadOrigin,
  fn: () => Promise<T>,
): Promise<T> {
  await acquireLoadSlot(priority, origin);
  try {
    return await fn();
  } finally {
    releaseLoadSlot();
  }
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
  origin: LoadOrigin = null,
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
        const tex = await withLoadSlot("high", origin, () =>
          withTextureTimeout(url, async (signal) => {
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
            return texture;
          }),
        );
        // GPU upload runs outside the network gate + timeout: it has its
        // own rAF-paced queue, so a backed-up upload mustn't hold a
        // network slot or count toward the load timeout.
        if (renderer) await enqueueUpload(tex, renderer, "high", origin);
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

/** Optional knobs for `loadHiRes`. There used to be a `maxSize` here
 *  that capped the decoded bitmap for the "original" LOD tier; that tier
 *  is gone (see the ladder note in painting.tsx). Every remaining tier is
 *  a pre-built variant, and the caller now clamps its own top rung
 *  against HIRES_ENTRY_BYTE_CAP before requesting it — so the size
 *  guarantee lives at the point where the rung is chosen rather than
 *  here, where it could only truncate a decode already paid for. */
export type LoadHiResOpts = {
  /** World position of the painting this tier belongs to, so the load
   *  queues can serve the nearest one first. */
  origin?: LoadOrigin;
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
    const tex = await withLoadSlot("high", opts?.origin ?? null, async () => {
      const res = await fetch(url, { credentials: "omit", signal });
      if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
      const blob = await res.blob();
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = aniso(renderer);
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.flipY = false;
      texture.needsUpdate = true;
      return texture;
    });
    if (renderer) await enqueueUpload(tex, renderer, "high", opts?.origin ?? null);
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

/** Walk an artwork's variant ladder from largest to smallest and return
 *  the highest-resolution THREE.Texture that's already resident in any
 *  of the three pools (base/thumb, hi-res, preload). The zoom modal
 *  draws this decoded bitmap straight to a canvas, so opening the detail
 *  view from the 3D scene paints the sharpest copy the player has
 *  already loaded with zero network and zero re-decode — no spinner,
 *  no waiting on the HTTP cache to re-serve the same bytes.
 *
 *  Checks both the same-origin proxy URL (what the 3D paintings load) and
 *  the direct CDN URL for each width, mirroring the URL forms the gallery
 *  may have fetched. Returns undefined when nothing is cached. */
export function peekBestCachedTexture(
  objectKey: string,
  variantWidths: readonly number[] | null | undefined,
): THREE.Texture | undefined {
  const peekAny = (url: string): THREE.Texture | undefined => peekCached(url) ?? getHiRes(url);
  const widths = variantWidths ?? [];
  for (let i = widths.length - 1; i >= 0; i--) {
    const w = widths[i];
    const hit =
      peekAny(variantProxyUrl(objectKey, w, "avif")) ?? peekAny(variantUrl(objectKey, w, "avif"));
    if (hit) return hit;
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
  origin: LoadOrigin = null,
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
      const texture = await withLoadSlot("low", origin, async () => {
        const res = await fetch(url, { credentials: "omit", signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (signal?.aborted) return null;
        const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
        if (signal?.aborted) return null;
        const t = new THREE.Texture(bitmap);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso(renderer);
        t.minFilter = THREE.LinearMipMapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
        t.flipY = false;
        t.needsUpdate = true;
        return t;
      });
      if (!texture) return null;
      if (renderer) await enqueueUpload(texture, renderer, "low", origin);
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
 *  in parallel. */
export function loadCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  origin: LoadOrigin = null,
): Promise<THREE.Texture> {
  return loadTextureCached(url, renderer, origin);
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
  get bytes() {
    return cache.byteSize;
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
  get hiresBytes() {
    return hiresCache.byteSize;
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
  get activeLoads() {
    return activeLoads;
  },
  get queuedLoads() {
    return highLoadWaiters.length + lowLoadWaiters.length;
  },
};
