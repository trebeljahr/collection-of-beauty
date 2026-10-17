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
// Nothing here is a hook and nothing suspends. Paintings drive the
// module imperatively from effects (`peekCached` on mount, then
// `loadCached` / `loadHiRes` / `getHiRes`) and install the resulting
// texture on `material.map` themselves — see painting.tsx. An earlier
// Suspense hook lived here; the progressive loader replaced it so a
// painting can paint a 256 px thumb, then the base, then each LOD tier
// without re-suspending (and without re-rendering) in between.
//
// Network and upload slots go to the room nearest the visitor first,
// its previews, then its bases, then its detail (see "Room-ordered
// scheduling"). Separate preload storage cannot evict current paintings.
// A mounted painting adopts an in-flight preload before fetching again.
// Rooms round the visitor that are not in full yet download their base
// textures ahead as bytes, without decoding them ("Network prefetch").

import * as THREE from "three";
import { BASE_POOL_BYTE_BUDGET, estimateTextureBytes } from "@/lib/gallery-layout/reveal-budget";
import type { RoomLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import { textureVariantUrl, variantUrl } from "@/lib/utils";

// Base-texture pool. Two limits, whichever bites first:
//
//   • entry count — a ceiling on bookkeeping, not memory. A floor mounts
//     up to ~300 paintings and the LodController MRU-touches every
//     mounted one on each tick, so a count below the mounted set makes
//     the LRU thrash: each tick evicts + disposes textures the player is
//     still looking at, and they re-upload on the next frame. Sized
//     above what a floor can mount so eviction is driven by the byte
//     budget instead.
//   • byte budget — the real constraint. A painting's base is its
//     480 px variant, 1.3 MiB decoded with mipmaps on average and more
//     for a tall one, so a fixed entry count can't express "keep
//     roughly this much GPU memory". 256 MiB holds about 200 of them,
//     which is fewer than the rooms in reach can hang: the rooms take
//     the pool nearest first and the rest keep their stand-ins
//     (lib/gallery-layout/reveal-budget.ts, which owns the number so
//     that the two cannot drift apart).
const TEXTURE_CACHE_CAPACITY = 512;
const TEXTURE_CACHE_BYTE_BUDGET = BASE_POOL_BYTE_BUDGET;
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
// Measured against the tower plan of the time (11 floors, 2,801
// placements; the block plan replaced it on 17 October 2026) by standing the player 0.45 m off each
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

// Re-exported so painting.tsx can PREDICT an entry's cost from pixel
// dims before requesting it (HIRES_ENTRY_BYTE_CAP) using the same
// formula the pool later ACCOUNTS with — a prediction that drifted from
// the accounting would admit exactly the entries the cap exists to keep
// out.
export { estimateTextureBytes };

function textureBytes(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number } | undefined;
  return estimateTextureBytes(img?.width ?? 0, img?.height ?? 0);
}

function disposeTexture(texture: THREE.Texture): void {
  texture.dispose();
  // THREE disposes the GPU allocation, but the ImageBitmap remains ours.
  const bitmap = texture.image as { close?: () => void } | undefined;
  bitmap?.close?.();
}

class TextureLRU {
  private map = new Map<string, THREE.Texture>();
  private bytes = 0;
  private pins = new Map<string, number>();
  private reserved = 0;
  /** Optional GPU-memory ceiling. When set, entries are evicted oldest-
   *  first until the pool fits, independent of the entry count. */
  constructor(
    private capacity: number,
    private byteBudget = Number.POSITIVE_INFINITY,
    private ownsBitmaps = false,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get byteSize(): number {
    return this.bytes;
  }

  get budget(): number {
    return this.byteBudget;
  }

  get reservedBytes(): number {
    return this.reserved;
  }

  get pinnedBytes(): number {
    let bytes = 0;
    for (const key of this.pins.keys()) {
      const texture = this.map.get(key);
      if (texture) bytes += textureBytes(texture);
    }
    return bytes;
  }

  /** Reserve decoded memory before fetching. Unused cached detail makes
   *  room now, so queued bitmaps count against the same bound as uploads. */
  reserve(bytes: number, replacing = 0): boolean {
    if (this.pinnedBytes + this.reserved - replacing + bytes > this.byteBudget) return false;
    this.reserved += bytes - replacing;
    this.evictToBudget();
    return true;
  }

  releaseReservation(bytes: number): void {
    this.reserved = Math.max(0, this.reserved - bytes);
  }

  retain(key: string): (() => void) | undefined {
    if (!this.get(key)) return undefined;
    this.pins.set(key, (this.pins.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.pins.get(key) ?? 1) - 1;
      if (remaining > 0) this.pins.set(key, remaining);
      else this.pins.delete(key);
      this.evictToBudget();
    };
  }

  /** Whether `key` is in the pool, without the MRU touch of `get`. */
  has(key: string): boolean {
    return this.map.has(key);
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

  /** Detail has explicit display pins and includes outstanding decode
   *  reservations. Base/preload pools retain their previous last-entry
   *  behavior. A smaller viewport can temporarily leave existing display
   *  pins over budget; new detail waits until those pins are released. */
  private evictToBudget(): void {
    const minimum = this.ownsBitmaps ? 0 : 1;
    while (
      this.map.size > minimum &&
      (this.map.size > this.capacity || this.bytes + this.reserved > this.byteBudget)
    ) {
      let oldest: string | undefined;
      for (const key of this.map.keys()) {
        if (!this.pins.has(key)) {
          oldest = key;
          break;
        }
      }
      if (oldest === undefined) break;
      const old = this.map.get(oldest);
      this.map.delete(oldest);
      if (old) {
        this.bytes -= textureBytes(old);
        if (this.ownsBitmaps) disposeTexture(old);
        else old.dispose();
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

const hiresCache = new TextureLRU(HIRES_CACHE_CAPACITY, HIRES_BASE_BYTE_BUDGET, true);
const hiresInFlight = new Map<string, Promise<THREE.Texture>>();
const HIRES_MAX_ACTIVE = 2;
const HIRES_RETRY_DELAY_MS = 10_000;
const HIRES_PERMANENT_RETRY_DELAY_MS = 60_000;
const hiresFailures = new Map<string, number>();
const speculativeHiRes = new Set<string>();

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
// Room-ordered scheduling.
//
// Both bottlenecks below (the network slot gate and the GPU upload
// queue) hand the next slot to the waiting item with the lowest rank
// *right now*: the player keeps moving while a hundred items sit in
// the queue, so a rank taken at enqueue would be stale by the time the
// slot frees up.
//
// The rank is the distance in metres from the visitor to the ROOM the
// work hangs in (0 inside it), plus a lag for the kind of load. Until
// 17 October 2026 there were two tiers instead: every 256 px preview
// went before any base, nearest painting first within a tier. Where a
// visit starts, the court and the four galleries around it reveal about
// 170 works at once, so the court's 8 bases, which the Enter button
// waits for, queued behind 170 previews, and the upload pump took one
// texture a frame, previews first. On a slow link the curtain sat on
// "Loading first room… 2/8" for most of a minute. Now the room the
// visitor stands in loads whole, previews then bases, before the next
// room's previews; a room within BASE_LAG_M of the visitor (a doorway
// they stand in) interleaves with it.
// ─────────────────────────────────────────────────────────────────────

/** A room on the plan and the height of its floor. */
export type LoadZone = {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly floorY: number;
};

const zones = new WeakMap<Pick<RoomLayout, "cellBounds" | "worldRect">, LoadZone>();

/** A room's zone for the load queues, one object a room. */
export function roomLoadZone(room: Pick<RoomLayout, "cellBounds" | "worldRect">): LoadZone {
  let zone = zones.get(room);
  if (!zone) {
    const cb = room.cellBounds;
    zone = {
      xMin: cb.xMin * CELL_SIZE,
      xMax: (cb.xMax + 1) * CELL_SIZE,
      zMin: cb.zMin * CELL_SIZE,
      zMax: (cb.zMax + 1) * CELL_SIZE,
      floorY: room.worldRect.y,
    };
    zones.set(room, zone);
  }
  return zone;
}

/** Where a queued load belongs: a world position, or a position in a
 *  room (`zone`), which ranks by the room's distance. `null` means
 *  "unpositioned" — the zoom modal and other explicit user actions,
 *  which jump the queue entirely (they're a direct response to a click,
 *  not a speculative floor load). */
export type LoadOrigin =
  | readonly [number, number, number]
  | { readonly at: readonly [number, number, number]; readonly zone: LoadZone }
  | null;

/** What a load is for. A preview is the 256 px thumb, a base the 480 px
 *  texture a work shows from across its room, detail a proximity rung. */
export type LoadKind = "preview" | "base" | "detail";

/** Metres a kind of load counts further off than a preview of the same
 *  room. A room's bases come after its previews, its detail after its
 *  bases, and both before the previews of a room this much further. */
const KIND_LAG_M: Record<LoadKind, number> = { preview: 0, base: 4, detail: 8 };
/** Unpositioned loads rank this far ahead of everything positioned. */
const UNPOSITIONED_RANK = -1e6;
/** Standing eye height (player.tsx): the camera is this far over the
 *  visitor's feet, which is what a room's floor height compares with. */
const EYE_HEIGHT_M = 1.75;

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

function isPlaced(
  origin: Exclude<LoadOrigin, null>,
): origin is { readonly at: readonly [number, number, number]; readonly zone: LoadZone } {
  // Not `"at" in origin`: a tuple has `Array.prototype.at`.
  return !Array.isArray(origin);
}

/** Rank of a load in metres: lower goes first. */
function loadRank(origin: LoadOrigin, kind: LoadKind): number {
  const lag = KIND_LAG_M[kind];
  if (!origin) return UNPOSITIONED_RANK + lag;
  const at = isPlaced(origin) ? origin.at : origin;
  // The work's own distance breaks ties between works of one room.
  const own = Math.hypot(at[0] - cameraX, at[1] - cameraY, at[2] - cameraZ);
  if (!isPlaced(origin)) return own + lag;
  const { zone } = origin;
  const dx = cameraX - Math.min(Math.max(cameraX, zone.xMin), zone.xMax);
  const dz = cameraZ - Math.min(Math.max(cameraZ, zone.zMin), zone.zMax);
  const rise = Math.abs(cameraY - EYE_HEIGHT_M - zone.floorY);
  return Math.hypot(dx, dz) + rise + lag + own * 1e-3;
}

/** Pop the queued item with the lowest rank. Linear scan: queues run to
 *  a few hundred entries at most and this runs once per freed slot /
 *  upload, so a heap would be bookkeeping for no measurable win. */
function takeBest<T extends { origin: LoadOrigin; kind: LoadKind }>(queue: T[]): T | undefined {
  if (queue.length === 0) return undefined;
  let bestIdx = 0;
  let bestRank = loadRank(queue[0].origin, queue[0].kind);
  for (let i = 1; i < queue.length; i++) {
    const rank = loadRank(queue[i].origin, queue[i].kind);
    if (rank < bestRank) {
      bestRank = rank;
      bestIdx = i;
    }
  }
  return queue.splice(bestIdx, 1)[0];
}

// ─────────────────────────────────────────────────────────────────────
// GPU upload queue — a few milliseconds of texImage2D per rAF tick.
// ─────────────────────────────────────────────────────────────────────

type UploadTask = {
  tex: THREE.Texture;
  renderer: THREE.WebGLRenderer;
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  origin: LoadOrigin;
  kind: LoadKind;
};
const uploadQueue: UploadTask[] = [];
let pumpScheduled = false;
/** Uploads a tick may start once this much of it has gone on uploads.
 *  A 256 px preview uploads in well under a millisecond and a 480 px
 *  base in one or two, so one upload a tick held a room of 80 works at
 *  160 frames, about 5 s at the 30 fps a loading scene runs at. A 4096
 *  px rung takes tens of milliseconds and is the only upload of its
 *  tick, as before. */
const UPLOAD_MS_PER_TICK = 4;

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  requestAnimationFrame(pumpUploads);
}

function pumpUploads() {
  pumpScheduled = false;
  const start = performance.now();
  do {
    const task = takeBest(uploadQueue);
    if (!task) break;
    if (task.signal?.aborted) {
      task.reject(abortError());
      continue;
    }
    try {
      task.renderer.initTexture(task.tex);
    } catch {
      // Some drivers occasionally reject — R3F will upload lazily at
      // draw time instead. Not fatal.
    }
    task.resolve();
  } while (performance.now() - start < UPLOAD_MS_PER_TICK);
  if (uploadQueue.length > 0) schedulePump();
}

function enqueueUpload(
  tex: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  kind: LoadKind,
  origin: LoadOrigin = null,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const task: UploadTask = {
      tex,
      renderer,
      origin,
      kind,
      signal,
      resolve: () => {
        cleanup();
        resolve();
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    };
    const onAbort = () => {
      const index = uploadQueue.indexOf(task);
      if (index !== -1) uploadQueue.splice(index, 1);
      task.reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    uploadQueue.push(task);
    schedulePump();
  });
}

function abortError(): DOMException {
  return new DOMException("Texture load aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Stop waiting for shared bytes without cancelling their other users. */
function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
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
// tick (thumb + base), and the FloorPreloader can add a whole
// adjacent floor's worth on top. Left ungated they all pile onto those
// few connections and the tail sits in the browser's request queue long
// enough to trip the 15 s load timeout — the dev "[painting] … Timed
// out" flood. Capping in-flight fetches to a small budget keeps every
// request actively moving instead of stalling.
//
// Crucially the per-load timeout is armed *inside* withLoadSlot — only
// once a slot is held and the fetch is about to go out — so time spent
// waiting for a slot never counts against the timeout.
const NETWORK_CONCURRENCY = 6;
let activeLoads = 0;
type LoadWaiter = { resolve: () => void; origin: LoadOrigin; kind: LoadKind };
const loadWaiters: LoadWaiter[] = [];

function acquireLoadSlot(kind: LoadKind, origin: LoadOrigin, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (activeLoads < NETWORK_CONCURRENCY) {
    activeLoads++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const waiter: LoadWaiter = {
      resolve: () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      },
      origin,
      kind,
    };
    const onAbort = () => {
      const index = loadWaiters.indexOf(waiter);
      if (index !== -1) loadWaiters.splice(index, 1);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    loadWaiters.push(waiter);
  });
}

function releaseLoadSlot(): void {
  const next = takeBest(loadWaiters);
  if (next) {
    next.resolve();
    return;
  }
  activeLoads--;
  pumpPrefetch();
}

async function withLoadSlot<T>(
  kind: LoadKind,
  origin: LoadOrigin,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  await acquireLoadSlot(kind, origin, signal);
  try {
    throwIfAborted(signal);
    return await fn();
  } finally {
    releaseLoadSlot();
  }
}

// ─────────────────────────────────────────────────────────────────────
// Network prefetch: bytes only.
//
// A room shows its works in full only once the visitor is within reach
// of it and the base pool has room (reveal-budget.ts), and only then
// does a work fetch its textures. On a slow link that left every room
// to start its downloads as the visitor walked into it. The rooms round
// the visitor that are not in full yet now download their works' base
// textures ahead, as encoded bytes (`setPrefetch`, from RoomReveals in
// room-geometry.tsx). Nothing is decoded or uploaded: the bytes cost
// tens of kilobytes a work in memory, and no texture memory, until the
// room is in full and its works ask for them (`fetchTextureBlob`).
//
// Prefetch takes a network slot only while no foreground load waits for
// one, and leaves PREFETCH_SPARE_SLOTS free, so a work that comes into
// view starts at once.
// ─────────────────────────────────────────────────────────────────────

/** Encoded bytes this store keeps, oldest dropped first. A base is 20 to
 *  40 KB, so this is well over a thousand works, more than every room in
 *  prefetch reach. */
const PREFETCH_BYTE_BUDGET = 48 * 1024 * 1024;
const PREFETCH_SPARE_SLOTS = 2;

class BlobLRU {
  private map = new Map<string, Blob>();
  private bytes = 0;
  constructor(private byteBudget: number) {}
  get size(): number {
    return this.map.size;
  }
  get byteSize(): number {
    return this.bytes;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  get(key: string): Blob | undefined {
    const blob = this.map.get(key);
    if (blob) {
      this.map.delete(key);
      this.map.set(key, blob);
    }
    return blob;
  }
  put(key: string, blob: Blob): void {
    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= existing.size;
      this.map.delete(key);
    }
    this.map.set(key, blob);
    this.bytes += blob.size;
    while (this.bytes > this.byteBudget && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.map.get(oldest)?.size ?? 0;
      this.map.delete(oldest);
    }
  }
}

const prefetchedBlobs = new BlobLRU(PREFETCH_BYTE_BUDGET);
const prefetchInFlight = new Map<string, Promise<Blob | null>>();
/** URLs to prefetch, wanted now, nearest first at take time. */
let prefetchQueue: Array<{ url: string; origin: LoadOrigin; kind: LoadKind }> = [];

/** A texture to download ahead. */
export type PrefetchItem = { url: string; origin: LoadOrigin };

/**
 * Replace what the prefetch queue wants. Downloads already running
 * finish; queued URLs no longer listed are dropped, and URLs already
 * downloaded, decoded or on their way are skipped.
 */
export function setPrefetch(items: readonly PrefetchItem[]): void {
  prefetchQueue = [];
  for (const { url, origin } of items) {
    if (
      prefetchedBlobs.has(url) ||
      prefetchInFlight.has(url) ||
      cache.has(url) ||
      inFlight.has(url)
    ) {
      continue;
    }
    prefetchQueue.push({ url, origin, kind: "base" });
  }
  pumpPrefetch();
}

/** Whether `url` is downloaded or downloading, so a work can skip its
 *  256 px preview: its base is as near as the preview would be. */
export function isPrefetched(url: string): boolean {
  return prefetchedBlobs.has(url) || prefetchInFlight.has(url);
}

function pumpPrefetch(): void {
  while (
    loadWaiters.length === 0 &&
    activeLoads < NETWORK_CONCURRENCY - PREFETCH_SPARE_SLOTS &&
    prefetchQueue.length > 0
  ) {
    const item = takeBest(prefetchQueue);
    if (!item) break;
    const { url } = item;
    if (
      prefetchedBlobs.has(url) ||
      prefetchInFlight.has(url) ||
      cache.has(url) ||
      inFlight.has(url)
    ) {
      continue;
    }
    activeLoads++;
    const promise = (async () => {
      try {
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) return null;
        const blob = await res.blob();
        prefetchedBlobs.put(url, blob);
        return blob;
      } catch {
        return null;
      }
    })().finally(() => {
      prefetchInFlight.delete(url);
      releaseLoadSlot();
    });
    prefetchInFlight.set(url, promise);
  }
}

/**
 * The encoded bytes of `url`: from the prefetch store, from a prefetch
 * on its way, or from the network inside a load slot.
 */
async function fetchTextureBlob(
  url: string,
  kind: LoadKind,
  origin: LoadOrigin,
  signal: AbortSignal | undefined,
  withTimeout: boolean,
): Promise<Blob> {
  throwIfAborted(signal);
  const stored = prefetchedBlobs.get(url);
  if (stored) return stored;
  const pending = prefetchInFlight.get(url);
  if (pending) {
    const blob = await waitWithSignal(pending, signal);
    throwIfAborted(signal);
    if (blob) return blob;
  }
  return withLoadSlot(
    kind,
    origin,
    async () => {
      const download = async (s: AbortSignal | undefined) => {
        const res = await fetch(url, { credentials: "omit", signal: s });
        if (!res.ok) throw new TextureHttpError(url, res.status);
        return res.blob();
      };
      return withTimeout ? withTextureTimeout(url, download) : download(signal);
    },
    signal,
  );
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

/** Decode encoded bytes into a texture ready for the upload queue.
 *  `imageOrientation: flipY` avoids the expensive CPU flip THREE does
 *  on upload when `flipY` is left true. */
async function textureFromBlob(
  blob: Blob,
  url: string,
  renderer: THREE.WebGLRenderer | null,
  signal?: AbortSignal,
): Promise<THREE.Texture> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
  if (signal?.aborted) {
    bitmap.close();
    throw new DOMException("aborted", "AbortError");
  }
  const texture = new THREE.Texture(bitmap);
  texture.name = url;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso(renderer);
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false; // already flipped during createImageBitmap
  texture.needsUpdate = true;
  return texture;
}

// ─────────────────────────────────────────────────────────────────────
// Main entry — fetch, decode, upload, cache.
// ─────────────────────────────────────────────────────────────────────

async function loadTextureCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  origin: LoadOrigin = null,
  kind: LoadKind = "base",
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
    const pendingPreload = preloadInFlight.get(url);
    if (pendingPreload) {
      const loaded = await pendingPreload;
      // An approach can be cancelled during the floor transition. In
      // that case fall through to the normal foreground load.
      if (loaded) {
        const promoted = peekCached(url);
        if (promoted) return promoted;
      }
    }
    let lastError: unknown;

    for (let attempt = 1; attempt <= TEXTURE_LOAD_ATTEMPTS; attempt++) {
      try {
        // createImageBitmap decodes off-thread, which matters for a burst
        // of painting loads, and runs outside the network slot: a
        // prefetched work decodes without waiting for one.
        const blob = await fetchTextureBlob(url, kind, origin, undefined, true);
        const tex = await textureFromBlob(blob, url, renderer);
        // GPU upload runs outside the network gate + timeout: it has its
        // own rAF-paced queue, so a backed-up upload mustn't hold a
        // network slot or count toward the load timeout.
        if (renderer) await enqueueUpload(tex, renderer, kind, origin);
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
// Hi-res cache — separate LRU for the proximity upgrade. Kept apart
// from the main cache so a busy floor of 960 px paintings can't push
// out hi-res textures the player is currently looking at, and the
// other way round.
//
// getHiRes refreshes recency. Displayed textures also need an explicit
// retainHiRes lease, so background inserts cannot dispose a bound image.
// ─────────────────────────────────────────────────────────────────────

export function getHiRes(url: string): THREE.Texture | undefined {
  return hiresCache.get(url);
}

export function getHiResByteBudget(): number {
  return hiresCache.budget;
}

/** Keep a displayed texture alive until the material swaps or unmounts. */
export function retainHiRes(url: string): (() => void) | undefined {
  return hiresCache.retain(url);
}

/** The caller derives a pre-built tier's size before requesting it. */
export type LoadHiResOpts = {
  /** World position of the painting this tier belongs to, so the load
   *  queues can serve the nearest one first. */
  origin?: LoadOrigin;
};

/** Promise-based compatibility entry point. New streaming callers use
 *  tryLoadHiRes so a busy pool postpones work without rejected promises. */
export function loadHiRes(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  signal?: AbortSignal,
  opts?: LoadHiResOpts,
): Promise<THREE.Texture> {
  return (
    tryLoadHiRes(url, renderer, signal, {
      ...opts,
      estimatedBytes: HIRES_ENTRY_BYTE_CAP,
      speculative: false,
    }) ?? Promise.reject(new Error(`Detail texture deferred: ${url}`))
  );
}

/** Admit a bounded amount of detail through its entire fetch/decode/upload
 *  lifetime. Null means no work started: the controller may retry later.
 *  A cache hit or an existing admitted URL never consumes a second slot. */
export function tryLoadHiRes(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  signal: AbortSignal | undefined,
  opts: LoadHiResOpts & { estimatedBytes: number; speculative: boolean },
): Promise<THREE.Texture> | null {
  if (signal?.aborted) return Promise.reject(abortError());
  const cached = hiresCache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = hiresInFlight.get(url);
  if (existing) return existing;

  const retryAt = hiresFailures.get(url);
  if (retryAt !== undefined) {
    if (retryAt > performance.now()) return null;
    hiresFailures.delete(url);
  }
  const estimate = opts.estimatedBytes;
  if (
    !Number.isFinite(estimate) ||
    estimate <= 0 ||
    estimate > HIRES_ENTRY_BYTE_CAP ||
    hiresInFlight.size >= HIRES_MAX_ACTIVE ||
    !hiresCache.reserve(estimate)
  ) {
    return null;
  }

  let reserved = estimate;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const deadline = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TEXTURE_LOAD_TIMEOUT_MS);
  if (opts.speculative) speculativeHiRes.add(url);

  const promise = (async () => {
    const origin = opts.origin ?? null;
    let texture: THREE.Texture | undefined;
    try {
      const blob = await fetchTextureBlob(url, "detail", origin, controller.signal, false);
      texture = await textureFromBlob(blob, url, renderer, controller.signal);
      throwIfAborted(controller.signal);
      const actual = textureBytes(texture);
      if (actual > HIRES_ENTRY_BYTE_CAP || !hiresCache.reserve(actual, reserved)) {
        throw new Error(`Decoded detail exceeds available texture budget: ${url}`);
      }
      reserved = actual;
      if (renderer) await enqueueUpload(texture, renderer, "detail", origin, controller.signal);
      throwIfAborted(controller.signal);
      if (!hiresCache.reserve(reserved, reserved)) {
        throw new Error(`Texture budget changed during detail upload: ${url}`);
      }
      // Transfer the reservation into residency without an intervening
      // await: another request cannot claim the same bytes in between.
      hiresCache.releaseReservation(reserved);
      reserved = 0;
      hiresCache.put(url, texture);
      return texture;
    } catch (error) {
      if (texture) disposeTexture(texture);
      // User movement is cancellation, not a failed URL. Network/HTTP,
      // decode and deadline failures cool down instead of retrying at
      // every controller tick.
      if (!controller.signal.aborted || timedOut) {
        const cooldown = isPermanentHttpError(error)
          ? HIRES_PERMANENT_RETRY_DELAY_MS
          : HIRES_RETRY_DELAY_MS;
        hiresFailures.delete(url);
        hiresFailures.set(url, performance.now() + cooldown);
        if (hiresFailures.size > TEXTURE_CACHE_CAPACITY) {
          const oldest = hiresFailures.keys().next().value;
          if (oldest !== undefined) hiresFailures.delete(oldest);
        }
      }
      throw error;
    }
  })().finally(() => {
    window.clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
    hiresCache.releaseReservation(reserved);
    speculativeHiRes.delete(url);
    hiresInFlight.delete(url);
  });

  hiresInFlight.set(url, promise);
  return promise;
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
 *  texture into the material on the first render — no brown-swatch
 *  flash. Public counterpart of `getHiRes`. */
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
      peekAny(textureVariantUrl(objectKey, w, "avif")) ?? peekAny(variantUrl(objectKey, w, "avif"));
    if (hit) return hit;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Preload — same fetch + decode + upload pipeline as `loadCached`, but
// targets the dedicated preload pool and routes the GPU upload through
// the preview-priority queue. Used by FloorPreloader to prime the adjacent
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
  const foreground = inFlight.get(url);
  if (foreground) return foreground.catch(() => null);
  const existing = preloadInFlight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    let texture: THREE.Texture | undefined;
    try {
      if (signal?.aborted) return null;
      const blob = await fetchTextureBlob(url, "preview", origin, signal, false);
      texture = await textureFromBlob(blob, url, renderer, signal);
      if (renderer) await enqueueUpload(texture, renderer, "preview", origin, signal);
      throwIfAborted(signal);
      preloadCache.put(url, texture);
      return texture;
    } catch {
      if (texture) disposeTexture(texture);
      return null;
    }
  })().finally(() => {
    preloadInFlight.delete(url);
  });

  preloadInFlight.set(url, promise);
  return promise;
}

/** Eager async load into the base pool, through the shared LRU + upload
 *  queue. Used by the painting's progressive loader to fire-and-forget
 *  both the 256 px preview and the 480 px base in parallel. */
export function loadCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  origin: LoadOrigin = null,
  kind: LoadKind = "base",
): Promise<THREE.Texture> {
  return loadTextureCached(url, renderer, origin, kind);
}

export const _textureCacheDebug = {
  /** Whether a base texture is in the pool. Does not touch it. */
  has(url: string): boolean {
    return cache.has(url);
  },
  get size() {
    return cache.size;
  },
  get bytes() {
    return cache.byteSize;
  },
  get budget() {
    return cache.budget;
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
  get hiresReservedBytes() {
    return hiresCache.reservedBytes;
  },
  get hiresPinnedBytes() {
    return hiresCache.pinnedBytes;
  },
  get speculativeHiResInFlight() {
    return speculativeHiRes.size;
  },
  get hiresFailedUrls() {
    return hiresFailures.size;
  },
  get preloadSize() {
    return preloadCache.size;
  },
  get preloadBytes() {
    return preloadCache.byteSize;
  },
  get hiresBudget() {
    return hiresCache.budget;
  },
  get preloadInFlight() {
    return preloadInFlight.size;
  },
  get prefetchSize() {
    return prefetchedBlobs.size;
  },
  get prefetchBytes() {
    return prefetchedBlobs.byteSize;
  },
  get prefetchQueued() {
    return prefetchQueue.length;
  },
  get prefetchInFlight() {
    return prefetchInFlight.size;
  },
  get activeLoads() {
    return activeLoads;
  },
  get queuedLoads() {
    return loadWaiters.length;
  },
};
