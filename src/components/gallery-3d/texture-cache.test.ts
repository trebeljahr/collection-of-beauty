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
