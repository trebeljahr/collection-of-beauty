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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it("keeps detail slots and byte reservations until queued uploads finish", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const renderer = {
      initTexture: vi.fn(),
      capabilities: {},
    } as unknown as THREE.WebGLRenderer;
    const { tryLoadHiRes, estimateTextureBytes, _textureCacheDebug } = await import(
      "./texture-cache"
    );
    const estimatedBytes = estimateTextureBytes(256, 256);
    const opts = { estimatedBytes, speculative: true };
    const first = tryLoadHiRes("first", renderer, undefined, opts);
    const second = tryLoadHiRes("second", renderer, undefined, opts);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(tryLoadHiRes("third", renderer, undefined, opts)).toBeNull();
    await vi.waitFor(() => expect(_textureCacheDebug.queued).toBe(2));
    expect(_textureCacheDebug.hiresReservedBytes).toBe(estimatedBytes * 2);
    expect(_textureCacheDebug.hiresInFlight).toBe(2);
    expect(_textureCacheDebug.speculativeHiResInFlight).toBe(2);
    expect(tryLoadHiRes("first", renderer, undefined, opts)).toBe(first);
    expect(tryLoadHiRes("third", renderer, undefined, opts)).toBeNull();
    while (frames.length > 0) frames.shift()?.(0);
    await Promise.all([first, second]);
    expect(_textureCacheDebug.hiresReservedBytes).toBe(0);
    expect(_textureCacheDebug.hiresInFlight).toBe(0);
    expect(_textureCacheDebug.hiresBytes).toBe(estimatedBytes * 2);
  });

  it("cancels a detail waiting for the network without fetching it", async () => {
    const releases: (() => void)[] = [];
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => releases.push(() => resolve(response()))),
    );
    vi.stubGlobal("fetch", fetch);
    const { loadCached, tryLoadHiRes, _textureCacheDebug } = await import("./texture-cache");
    const busy = Array.from({ length: 6 }, (_, i) => loadCached(`busy-${i}`, null));
    await flush();
    const controller = new AbortController();
    const pending = tryLoadHiRes("cancelled", null, controller.signal, {
      estimatedBytes: 1024 * 1024,
      speculative: true,
    });
    expect(pending).not.toBeNull();
    expect(_textureCacheDebug.queuedLoads).toBe(1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(_textureCacheDebug.queuedLoads).toBe(0);
    expect(_textureCacheDebug.hiresReservedBytes).toBe(0);
    expect(_textureCacheDebug.hiresFailedUrls).toBe(0);
    for (const release of releases) release();
    await Promise.all(busy);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("removes cancelled uploads and closes their bitmaps without caching", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 960, height: 640, close })),
    );
    const initTexture = vi.fn();
    const renderer = { initTexture, capabilities: {} } as unknown as THREE.WebGLRenderer;
    const { tryLoadHiRes, getHiRes, _textureCacheDebug } = await import("./texture-cache");
    const controller = new AbortController();
    const pending = tryLoadHiRes("cancelled-upload", renderer, controller.signal, {
      estimatedBytes: 4 * 1024 * 1024,
      speculative: true,
    });
    await vi.waitFor(() => expect(_textureCacheDebug.queued).toBe(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(_textureCacheDebug.queued).toBe(0);
    expect(_textureCacheDebug.hiresReservedBytes).toBe(0);
    expect(getHiRes("cancelled-upload")).toBeUndefined();
    while (frames.length > 0) frames.shift()?.(0);
    expect(initTexture).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("protects displayed detail while evicting and closing unused detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const bitmaps: Array<{ width: number; height: number; close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        const bitmap = { width: 4096, height: 4096, close: vi.fn() };
        bitmaps.push(bitmap);
        return bitmap;
      }),
    );
    const { tryLoadHiRes, retainHiRes, getHiRes, estimateTextureBytes, _textureCacheDebug } =
      await import("./texture-cache");
    const estimatedBytes = estimateTextureBytes(4096, 4096);
    const opts = { estimatedBytes, speculative: true };
    const displayed = await tryLoadHiRes("displayed", null, undefined, opts);
    const release = retainHiRes("displayed");
    const releaseSecondUser = retainHiRes("displayed");
    expect(release).toBeTypeOf("function");
    for (const url of ["old-unused", "new-unused", "incoming"]) {
      expect(await tryLoadHiRes(url, null, undefined, opts)).toBeTruthy();
      expect(
        _textureCacheDebug.hiresBytes + _textureCacheDebug.hiresReservedBytes,
      ).toBeLessThanOrEqual(_textureCacheDebug.hiresBudget);
    }
    expect(getHiRes("displayed")).toBe(displayed);
    expect(getHiRes("old-unused")).toBeUndefined();
    expect(bitmaps[0].close).not.toHaveBeenCalled();
    expect(bitmaps[1].close).toHaveBeenCalledOnce();
    expect(_textureCacheDebug.hiresPinnedBytes).toBe(estimatedBytes);
    release?.();
    release?.();
    expect(_textureCacheDebug.hiresPinnedBytes).toBe(estimatedBytes);
    releaseSecondUser?.();
    expect(_textureCacheDebug.hiresPinnedBytes).toBe(0);
    expect(retainHiRes("missing")).toBeUndefined();
  });

  it("refuses detail before fetch when displayed pins leave insufficient memory", async () => {
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 4096,
        height: 4096,
        close: vi.fn(),
      })),
    );
    const { tryLoadHiRes, retainHiRes, estimateTextureBytes, _textureCacheDebug } = await import(
      "./texture-cache"
    );
    const opts = { estimatedBytes: estimateTextureBytes(4096, 4096), speculative: false };
    const releases: Array<(() => void) | undefined> = [];
    for (const url of ["one", "two", "three"]) {
      expect(await tryLoadHiRes(url, null, undefined, opts)).toBeTruthy();
      releases.push(retainHiRes(url));
    }
    expect(tryLoadHiRes("too-much", null, undefined, { ...opts, speculative: true })).toBeNull();
    expect(_textureCacheDebug.hiresReservedBytes).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    releases[0]?.();
    expect(await tryLoadHiRes("now-fits", null, undefined, opts)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const release of releases) release?.();
  });

  it("cools down failed detail URLs and retries after the deadline", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetch);
    const { tryLoadHiRes, _textureCacheDebug } = await import("./texture-cache");
    const opts = { estimatedBytes: 1024 * 1024, speculative: false };
    await expect(tryLoadHiRes("failed", null, undefined, opts)).rejects.toThrow("503");
    expect(_textureCacheDebug.hiresReservedBytes).toBe(0);
    expect(tryLoadHiRes("failed", null, undefined, opts)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 10_001;
    expect(await tryLoadHiRes("failed", null, undefined, opts)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(_textureCacheDebug.hiresFailedUrls).toBe(0);
  });

  it("expires stalled detail loads and releases their reservations", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const { tryLoadHiRes, _textureCacheDebug } = await import("./texture-cache");
    const opts = { estimatedBytes: 1024 * 1024, speculative: true };
    const pending = tryLoadHiRes("stalled", null, undefined, opts);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(_textureCacheDebug.hiresReservedBytes).toBe(0);
    expect(_textureCacheDebug.hiresInFlight).toBe(0);
    expect(_textureCacheDebug.activeLoads).toBe(0);
    expect(tryLoadHiRes("stalled", null, undefined, opts)).toBeNull();
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

  it("uploads previews before bases, several a frame while they are quick", async () => {
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
    const base = loadCached("base", renderer);
    const preview = loadCached("preview", renderer, null, "preview");
    await vi.waitFor(() => expect(_textureCacheDebug.queued).toBe(2));
    frames.shift()?.(0);
    expect(initTexture.mock.calls.map(([tex]) => tex.name)).toEqual(["preview", "base"]);
    await Promise.all([base, preview]);
    expect(frames).toHaveLength(0);
  });

  it("ends a frame's uploads once they have taken a few milliseconds", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    // Each upload takes 30 ms, as a 4096 px rung does.
    const initTexture = vi.fn(() => {
      now += 30;
    });
    const renderer = { initTexture, capabilities: {} } as unknown as THREE.WebGLRenderer;
    const { loadCached, _textureCacheDebug } = await import("./texture-cache");
    const loads = [loadCached("a", renderer), loadCached("b", renderer)];
    await vi.waitFor(() => expect(_textureCacheDebug.queued).toBe(2));
    frames.shift()?.(0);
    expect(initTexture).toHaveBeenCalledTimes(1);
    frames.shift()?.(16);
    expect(initTexture).toHaveBeenCalledTimes(2);
    await Promise.all(loads);
    vi.restoreAllMocks();
  });

  it("loads the visitor's room whole before the previews of the room next door", async () => {
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
    const { loadCached, setLoadCamera } = await import("./texture-cache");
    setLoadCamera(5, 1.75, 5);
    const here = { xMin: 0, xMax: 10, zMin: 0, zMax: 10, floorY: 0 };
    const next = { xMin: 10, xMax: 30, zMin: 0, zMax: 10, floorY: 0 };
    const busy = Array.from({ length: 6 }, (_, i) => loadCached(`busy-${i}`, null));
    await flush();
    const loads = [
      loadCached("next-preview", null, { at: [11, 1.5, 5], zone: next }, "preview"),
      loadCached("here-base", null, { at: [0, 1.5, 9], zone: here }, "base"),
      loadCached("here-preview", null, { at: [0, 1.5, 9], zone: here }, "preview"),
    ];
    for (const release of releases) release();
    await Promise.all([...busy, ...loads]);
    expect(started.slice(6)).toEqual(["here-preview", "here-base", "next-preview"]);
  });

  it("downloads prefetched bytes once and decodes them when the room asks", async () => {
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    const decode = vi.fn(async () => ({ width: 480, height: 360, close: vi.fn() }));
    vi.stubGlobal("createImageBitmap", decode);
    const { loadCached, setPrefetch, isPrefetched, _textureCacheDebug } = await import(
      "./texture-cache"
    );
    setPrefetch([{ url: "ahead", origin: [0, 0, 0] }]);
    expect(isPrefetched("ahead")).toBe(true);
    await vi.waitFor(() => expect(_textureCacheDebug.prefetchSize).toBe(1));
    expect(decode).not.toHaveBeenCalled();
    await loadCached("ahead", null);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("keeps prefetch off the network while a foreground load waits", async () => {
    const started: string[] = [];
    const releases: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        started.push(url);
        return new Promise<Response>((resolve) => releases.push(() => resolve(response())));
      }),
    );
    const { loadCached, setPrefetch } = await import("./texture-cache");
    const busy = Array.from({ length: 4 }, (_, i) => loadCached(`busy-${i}`, null));
    await flush();
    // Two of six slots stay free for foreground loads.
    setPrefetch([
      { url: "ahead-1", origin: null },
      { url: "ahead-2", origin: null },
    ]);
    expect(started).toHaveLength(4);
    const wanted = [loadCached("wanted-1", null), loadCached("wanted-2", null)];
    await flush();
    expect(started.slice(4)).toEqual(["wanted-1", "wanted-2"]);
    const extra = loadCached("wanted-3", null);
    await flush();
    releases[0]();
    await vi.waitFor(() => expect(started).toHaveLength(7));
    expect(started[6]).toBe("wanted-3");
    // Once nothing waits, the two prefetches go out.
    for (const release of releases) release();
    await vi.waitFor(() => {
      for (const release of releases) release();
      expect(started).toHaveLength(9);
    });
    for (const release of releases) release();
    await Promise.all([...busy, ...wanted, extra]);
    expect(started.slice(7).sort()).toEqual(["ahead-1", "ahead-2"]);
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
