import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "./stale-deploy";

describe("isStaleDeployError", () => {
  it("matches the Turbopack error a pre-deploy tab throws", () => {
    const error = new Error(
      "Module 1685 was instantiated because it was required from module 72546, but the module factory is not available.",
    );
    expect(isStaleDeployError(error)).toBe(true);
  });

  it("matches chunk load failures", () => {
    const error = new Error("Failed to load chunk /_next/static/chunks/0-92xqy4le4x7.js");
    expect(isStaleDeployError(error)).toBe(true);
    const named = Object.assign(new Error("Loading chunk 42 failed."), { name: "ChunkLoadError" });
    expect(isStaleDeployError(named)).toBe(true);
  });

  it("ignores ordinary errors", () => {
    expect(isStaleDeployError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleDeployError("module factory is not available")).toBe(false);
  });
});
