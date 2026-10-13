import { describe, expect, it } from "vitest";
import { ERAS } from "@/lib/gallery-eras";
import {
  greyOf,
  isDeepWall,
  POOL_MAX_BOOST,
  poolGainScale,
  SCREEN_SHADE_STEP,
  screenShade,
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

describe("screenShade", () => {
  it("darkens a door screen's back by one step of lightness on every era's wall", () => {
    let widest = 0;
    let at = "";
    for (const era of ERAS) {
      const hex = era.palette.wallColor;
      const wall = Math.cbrt(luminance(hex));
      const back = Math.cbrt(luminance(hex) * screenShade(hex));
      const off = Math.abs(wall - back - SCREEN_SHADE_STEP);
      if (off > widest || Number.isNaN(off)) {
        widest = off;
        at = era.id;
      }
    }
    expect(widest, at).toBeLessThan(1e-9);
  });

  it("takes more of the light off a deep wall than off a pale one", () => {
    const blue = screenShade("#24385c");
    const cream = screenShade("#efeadd");
    expect(blue).toBeGreaterThan(0.5);
    expect(blue).toBeLessThan(0.6);
    expect(cream).toBeGreaterThan(0.8);
    expect(cream).toBeLessThan(0.85);
  });

  it("never turns a wall's colour negative", () => {
    // Black has no lightness to take the step from.
    expect(screenShade("#000000")).toBe(1);
    const nearBlack = screenShade("#020202");
    expect(nearBlack).toBeGreaterThan(0);
    expect(nearBlack).toBeLessThan(1);
  });
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
