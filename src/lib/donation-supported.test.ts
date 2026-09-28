import { describe, expect, it } from "vitest";
import {
  consumeSupportedParam,
  SUPPORTED_AT_STORAGE_KEY,
  withoutSupportedParam,
} from "./donation-supported";

const ORIGIN = "https://collectionofbeauty.com";

function fakeWindow(path: string, storage: { setItem(key: string, value: string): void }) {
  const calls: { state: unknown; url: string }[] = [];
  const state = { __NA: true };
  return {
    calls,
    state,
    win: {
      location: { href: `${ORIGIN}${path}` },
      history: {
        state,
        replaceState(data: unknown, _unused: string, url?: string | URL | null) {
          calls.push({ state: data, url: String(url) });
        },
      },
      get localStorage() {
        return storage;
      },
    },
  };
}

describe("withoutSupportedParam", () => {
  it("returns null when the URL has no supported=1", () => {
    expect(withoutSupportedParam(`${ORIGIN}/`)).toBeNull();
    expect(withoutSupportedParam(`${ORIGIN}/?q=roses`)).toBeNull();
    expect(withoutSupportedParam(`${ORIGIN}/?supported=0`)).toBeNull();
    expect(withoutSupportedParam(`${ORIGIN}/#supported=1`)).toBeNull();
  });

  it("drops the whole query when supported=1 is the only pair", () => {
    expect(withoutSupportedParam(`${ORIGIN}/?supported=1`)).toBe("/");
  });

  it("keeps the other pairs, their order and encoding, and the hash", () => {
    expect(
      withoutSupportedParam(`${ORIGIN}/gallery?q=blue%20sky&supported=1&sort=color#decade-3`),
    ).toBe("/gallery?q=blue%20sky&sort=color#decade-3");
    expect(withoutSupportedParam(`${ORIGIN}/?supported=1&a=1`)).toBe("/?a=1");
  });
});

describe("consumeSupportedParam", () => {
  it("stores the time and replaces the URL", () => {
    const stored = new Map<string, string>();
    const { win, calls, state } = fakeWindow("/?supported=1#top", {
      setItem: (key, value) => stored.set(key, value),
    });
    expect(consumeSupportedParam(win, 1_790_000_000_000)).toBe(true);
    expect(stored.get(SUPPORTED_AT_STORAGE_KEY)).toBe("1790000000000");
    expect(calls).toEqual([{ state, url: "/#top" }]);
  });

  it("does nothing without the parameter", () => {
    const stored = new Map<string, string>();
    const { win, calls } = fakeWindow("/artists?page=2", {
      setItem: (key, value) => stored.set(key, value),
    });
    expect(consumeSupportedParam(win)).toBe(false);
    expect(stored.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("still cleans the URL when storage throws", () => {
    const { win, calls } = fakeWindow("/?supported=1&q=x", {
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    });
    expect(consumeSupportedParam(win)).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["/?q=x"]);
  });

  it("still cleans the URL when reading localStorage throws", () => {
    const { win, calls } = fakeWindow("/?supported=1", { setItem: () => {} });
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new DOMException("SecurityError");
      },
    });
    expect(consumeSupportedParam(win)).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["/"]);
  });
});
