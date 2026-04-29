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

import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

const TEXTURE_CACHE_CAPACITY = 96;
// Hi-res cache is small on purpose — at most a handful of paintings are
// inside the upgrade radius at any moment, and these textures are 4–32×
// the GPU memory of a 960 px base. Eviction frees GPU memory quickly
// when the player walks past. Sized for two concurrent tiers (1920 +
// 2560 px) across the paintings visible from the current room with
// some headroom for the next room's prefetch.
const HIRES_CACHE_CAPACITY = 20;

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

  /** Read without touching MRU order. */
  peek(key: string): THREE.Texture | undefined {
    return this.map.get(key);
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
}

const cache = new TextureLRU(TEXTURE_CACHE_CAPACITY);
const inFlight = new Map<string, Promise<THREE.Texture>>();

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
const uploadQueue: UploadTask[] = [];
let pumpScheduled = false;

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  requestAnimationFrame(pumpUploads);
}

function pumpUploads() {
  pumpScheduled = false;
  const task = uploadQueue.shift();
  if (task) {
    try {
      task.renderer.initTexture(task.tex);
    } catch {
      // Some drivers occasionally reject — R3F will upload lazily at
      // draw time instead. Not fatal.
    }
    task.resolve();
  }
  if (uploadQueue.length > 0) schedulePump();
}

function enqueueUpload(tex: THREE.Texture, renderer: THREE.WebGLRenderer): Promise<void> {
  return new Promise((resolve) => {
    uploadQueue.push({ tex, renderer, resolve });
    schedulePump();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Main entry — fetch, decode, upload, cache.
// ─────────────────────────────────────────────────────────────────────

async function loadTextureCached(
  url: string,
  renderer: THREE.WebGLRenderer | null,
): Promise<THREE.Texture> {
  const cached = cache.get(url);
  if (cached) return cached;

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    // createImageBitmap decodes off-thread, which matters for a burst
    // of painting loads. `imageOrientation: flipY` avoids the expensive
    // CPU flip THREE does on upload when `flipY` is left true.
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
    });
    const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.flipY = false; // already flipped during createImageBitmap
    tex.needsUpdate = true;
    if (renderer) await enqueueUpload(tex, renderer);
    cache.put(url, tex);
    return tex;
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
// `peekHiRes` returns the cached texture without touching MRU — used
// when we just want to know if it's available. `getHiRes` touches MRU,
// used when a painting is actively displaying or about to display the
// texture (so it stays alive until the player walks away).
// ─────────────────────────────────────────────────────────────────────

export function getHiRes(url: string): THREE.Texture | undefined {
  return hiresCache.get(url);
}

export function peekHiRes(url: string): THREE.Texture | undefined {
  return hiresCache.peek(url);
}

export function loadHiRes(
  url: string,
  renderer: THREE.WebGLRenderer | null,
  signal?: AbortSignal,
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
    const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
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
};
