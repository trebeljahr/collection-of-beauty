import type * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 256, height: 256, close: vi.fn() })),
  );
});
afterEach(() => vi.unstubAllGlobals());

const response = () => new Response(new Blob(["image"]));
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

describe("painting streaming", () => {
  it("closes a decoded hi-res bitmap when its request is cancelled", async () => {
    const controller = new AbortController();
    const close = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        controller.abort();
        return { width: 256, height: 256, close };
      }),
    );
    const { loadHiRes } = await import("./texture-cache");
    await expect(loadHiRes("cancelled-hires", null, controller.signal)).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it("serves visible and approaching-floor previews before queued detail", async () => {
    const started: string[] = [];
    const releases: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        started.push(url);
        if (url.startsWith("busy")) {
          return new Promise<Response>((resolve) => releases.push(() => resolve(response())));
        }
        return Promise.resolve(response());
      }),
    );
    const { loadCached, preloadCached } = await import("./texture-cache");
    const busy = Array.from({ length: 6 }, (_, i) => loadCached(`busy-${i}`, null));
    await flush();
    const detail = loadCached("detail", null);
    const visible = loadCached("visible-preview", null, null, "preview");
    const approach = preloadCached("approach-preview", null);
    releases[0]();
    await Promise.all([detail, visible, approach]);
    expect(started.slice(6)).toEqual(["visible-preview", "approach-preview", "detail"]);
    for (const release of releases.slice(1)) release();
    await Promise.all(busy);
  });

  it("uploads previews before detail while keeping one upload per frame", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const initTexture = vi.fn();
    const renderer = { initTexture, capabilities: {} } as unknown as THREE.WebGLRenderer;
    const { loadCached, _textureCacheDebug } = await import("./texture-cache");
    const detail = loadCached("detail", renderer);
    const preview = loadCached("preview", renderer, null, "preview");
    await vi.waitFor(() => {
      expect(_textureCacheDebug.queued).toBe(1);
      expect(_textureCacheDebug.previewQueued).toBe(1);
    });
    frames.shift()?.(0);
    expect(initTexture).toHaveBeenCalledTimes(1);
    expect(initTexture.mock.calls[0][0].name).toBe("preview");
    frames.shift()?.(16);
    expect(initTexture).toHaveBeenCalledTimes(2);
    expect(initTexture.mock.calls[1][0].name).toBe("detail");
    await Promise.all([detail, preview]);
    expect(frames).toHaveLength(0);
  });

  it("adopts an in-flight stair preload with one fetch and one texture", async () => {
    let release!: () => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(response());
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const { loadCached, preloadCached, peekCached, _textureCacheDebug } = await import(
      "./texture-cache"
    );
    const preload = preloadCached("shared", null);
    await flush();
    const mounted = loadCached("shared", null, null, "preview");
    release();
    const [a, b] = await Promise.all([preload, mounted]);
    expect(a).toBe(b);
    expect(peekCached("shared")).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(_textureCacheDebug.preloadSize).toBe(0);
  });

  it("falls back to foreground loading after an approach is cancelled", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const { loadCached, preloadCached } = await import("./texture-cache");
    controller.abort();
    const preload = preloadCached("cancelled", null, controller.signal);
    const mounted = loadCached("cancelled", null, null, "preview");
    expect(await preload).toBeNull();
    expect(await mounted).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
