import { describe, expect, it } from "vitest";
import { ERAS } from "@/lib/gallery-eras";
import {
  greyOf,
  isDeepWall,
  POOL_MAX_BOOST,
  poolGainScale,
  WALL_LIGHT_FLOOR,
  wallAsLightSource,
} from "./wall-light";

describe("wallAsLightSource", () => {
  it("returns a pale wall unchanged", () => {
    for (const hex of ["#f0e7d2", "#efe8db", "#d4cdb9"]) {
      expect(greyOf(hex)).toBeGreaterThanOrEqual(WALL_LIGHT_FLOOR);
      expect(wallAsLightSource(hex)).toBe(hex);
    }
  });

  it("lifts a deep wall to the grey the fill was tuned on", () => {
    for (const hex of ["#2f4a3c", "#4f5d6b", "#1f2a44"]) {
      expect(greyOf(wallAsLightSource(hex))).toBeCloseTo(WALL_LIGHT_FLOOR, 0);
    }
  });

  it("keeps the wall's hue order when it lifts", () => {
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(wallAsLightSource("#8a1f2b").slice(i, i + 2), 16),
    );
    expect(r).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(g);
  });

  it("gives every era a room at least as bright as the tuned floor", () => {
    for (const era of ERAS) {
      expect(greyOf(wallAsLightSource(era.palette.wallColor))).toBeGreaterThanOrEqual(
        WALL_LIGHT_FLOOR - 12,
      );
    }
  });
});

describe("isDeepWall", () => {
  it("leaves the cream, grey and white walls tone mapped", () => {
    for (const hex of ["#f0e7d2", "#d4cdb9", "#e0dcd0", "#b9c8ce", "#f4f4f2"]) {
      expect(isDeepWall(hex)).toBe(false);
    }
  });

  it("takes a wall with one weak channel off tone mapping", () => {
    // Crimson, midnight blue, charcoal, and an ochre whose blue is low.
    for (const hex of ["#8e1b2b", "#24385c", "#403a34", "#c2a15e"]) {
      expect(isDeepWall(hex)).toBe(true);
    }
  });
});

describe("poolGainScale", () => {
  it("is 1 on every pale wall", () => {
    for (const hex of ["#f0e7d2", "#d4cdb9", "#c8c1ad", "#e0dcd0", "#f4f4f2"]) {
      expect(poolGainScale(hex)).toBe(1);
    }
  });

  it("is 1 on the crimson the reference was read from", () => {
    expect(poolGainScale("#8e1b2b")).toBe(1);
  });

  it("rises as the wall's brightest channel falls, up to the cap", () => {
    const blue = poolGainScale("#24385c");
    const charcoal = poolGainScale("#403a34");
    expect(blue).toBeGreaterThan(1.4);
    expect(charcoal).toBeGreaterThan(blue);
    expect(charcoal).toBeLessThanOrEqual(POOL_MAX_BOOST);
    expect(poolGainScale("#000000")).toBe(POOL_MAX_BOOST);
  });
});
