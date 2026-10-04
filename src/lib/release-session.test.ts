import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("release session preservation", () => {
  const values = new Map<string, string>();
  let blocked = false;
  beforeEach(() => {
    vi.resetModules();
    values.clear();
    blocked = false;
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (blocked) throw new Error("storage unavailable");
        values.set(key, value);
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("restores exact state and ignores invalid or expired records", async () => {
    const state = await import("./release-session");
    const valid = (value: unknown): value is string => typeof value === "string";
    expect(state.rememberReleaseState("query", "Monet & light")).toBe(true);
    expect(state.readReleaseState("query", valid)).toBe("Monet & light");
    values.set(
      "cob:release-state:query",
      JSON.stringify({ schema: 1, savedAt: 0, value: "stale" }),
    );
    expect(state.readReleaseState("query", valid)).toBeNull();
    values.set("cob:release-state:query", "not-json");
    expect(state.readReleaseState("query", valid)).toBeNull();
  });
  it("holds reloads until failed writes can be recovered and a submitted request settles", async () => {
    const state = await import("./release-session");
    blocked = true;
    expect(state.rememberReleaseState("draft", "draft@example.test")).toBe(false);
    expect(state.flushReleaseState()).toBe(false);
    blocked = false;
    const release = state.holdReleaseReload();
    expect(state.flushReleaseState()).toBe(false);
    release();
    expect(state.flushReleaseState()).toBe(true);
    expect(JSON.parse(values.get("cob:release-state:draft")!).value).toBe("draft@example.test");
  });
  it("flushes latest camera state before the error boundary can reload an unmounted visit", async () => {
    const state = await import("./release-session");
    let position = { x: 1, z: 2 };
    const remove = state.registerReleaseSnapshot("visit", () => position);
    position = { x: 10, z: 30 };
    remove();
    expect(state.flushReleaseState()).toBe(true);
    expect(JSON.parse(values.get("cob:release-state:visit")!).value).toEqual({ x: 10, z: 30 });
  });
  it("an old registration cannot overwrite its replacement during cleanup", async () => {
    const state = await import("./release-session");
    const old = state.registerReleaseSnapshot("visit", () => "old visit");
    const replacement = state.registerReleaseSnapshot("visit", () => "new visit");
    expect(state.flushReleaseState()).toBe(true);
    old();
    expect(JSON.parse(values.get("cob:release-state:visit")!).value).toBe("new visit");
    replacement();
  });
  it("does not block navigation for untouched state when browser storage is disabled", async () => {
    const state = await import("./release-session");
    blocked = true;
    state.registerReleaseSnapshot("untouched", () => undefined);
    expect(state.flushReleaseState()).toBe(true);
  });
});
