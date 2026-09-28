import { describe, expect, it } from "vitest";
import {
  hangLayout,
  hangOrder,
  mixWithWhite,
  WALL_COLOUR_NAMES,
  WALL_COLOURS,
  WALL_WIDTH,
  wallBaseColour,
} from "./wall-layout";

// Issue 1: Monk by the Sea (cover), Fan Kuan, Sower, Terashima, Lonely Tree.
const ISSUE_ONE = [1.572, 0.512, 1.279, 0.665, 1.27];

describe("hangOrder", () => {
  it("hangs the cover in the middle, tall works beside it and wide ones at the ends", () => {
    expect(hangOrder(ISSUE_ONE, 0)).toEqual([2, 1, 0, 3, 4]);
  });

  it("keeps issue order within each mirrored pair", () => {
    expect(hangOrder([1, 1, 1, 1, 1], 2)).toEqual([3, 0, 2, 1, 4]);
  });

  it("treats a missing or broken ratio as square", () => {
    expect(hangOrder([Number.NaN, 0, 1, 2, 0.5], 2).sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("hangLayout", () => {
  const cases: Record<string, number[]> = {
    "issue 1": ISSUE_ONE,
    "all landscape": [1.62, 1.34, 1.68, 1.53, 1.41],
    "all portrait": [0.71, 0.71, 0.7, 0.71, 0.71],
    "handscroll and hanging scroll": [5, 0.2, 1, 1.3, 0.7],
  };

  for (const [name, ratios] of Object.entries(cases)) {
    it(`fits the wall and hangs on one centre line: ${name}`, () => {
      const layout = hangLayout(ratios, 0);
      expect(layout.width).toBe(WALL_WIDTH);
      expect(Number.isInteger(layout.height)).toBe(true);

      const first = layout.frames[0];
      const last = layout.frames.at(-1);
      expect(first.x).toBeGreaterThanOrEqual(28 - 1e-6);
      expect(last && last.x + last.width).toBeLessThanOrEqual(WALL_WIDTH - 28 + 1e-6);

      const centres = layout.frames.map((f) => f.y + f.height / 2);
      for (const c of centres) expect(c).toBeCloseTo(centres[0], 6);

      for (const [i, f] of layout.frames.entries()) {
        expect(f.height).toBeLessThanOrEqual(150 + 1e-6);
        expect(f.y).toBeGreaterThanOrEqual(0);
        // Room below the lowest frame for its shadow to fade out.
        expect(layout.height - (f.y + f.height)).toBeGreaterThanOrEqual(36);
        const next = layout.frames[i + 1];
        if (next) expect(next.x).toBeGreaterThan(f.x + f.width);
      }
    });
  }

  it("keeps each picture's aspect ratio", () => {
    for (const f of hangLayout(ISSUE_ONE, 0).frames) {
      expect((f.width - 6) / (f.height - 6)).toBeCloseTo(ISSUE_ONE[f.index], 6);
    }
  });

  it("gives the centre work the largest picture", () => {
    const area = (f: { width: number; height: number }) => (f.width - 6) * (f.height - 6);
    const layout = hangLayout(ISSUE_ONE, 0);
    const centre = layout.frames.find((f) => f.index === 0);
    const others = layout.frames.filter((f) => f.index !== 0);
    expect(centre).toBeDefined();
    for (const f of others) expect(area(centre ?? f)).toBeGreaterThan(area(f));
  });
});

describe("wallBaseColour", () => {
  const warm = [["gold"], ["orange", "gold"], ["brown"], ["gold"], ["red"]];

  it("uses a named or hex override as given", () => {
    expect(wallBaseColour(warm, 1, "slate")).toBe(WALL_COLOURS.slate.base);
    expect(wallBaseColour(warm, 1, "#AABBCC")).toBe("#aabbcc");
    expect(() => wallBaseColour(warm, 1, "mauve")).toThrow(/Unknown wall colour/);
  });

  it("never repeats the previous issue's wall", () => {
    for (const name of WALL_COLOUR_NAMES) {
      const previous = WALL_COLOURS[name].base;
      for (let issue = 1; issue <= 12; issue++) {
        expect(wallBaseColour(warm, issue, undefined, previous)).not.toBe(previous);
      }
    }
  });

  it("puts cool issues on a wall that flatters them", () => {
    const cool = [["blue"], ["green", "blue"], ["teal"], ["grey"], ["green"]];
    expect(wallBaseColour(cool, 3)).toBe(WALL_COLOURS.oxblood.base);
  });

  it("still picks a wall when no colour families are known", () => {
    const bases = WALL_COLOUR_NAMES.map((n) => WALL_COLOURS[n].base);
    expect(bases).toContain(wallBaseColour([null, null, [], null, null], 7));
  });
});

describe("mixWithWhite", () => {
  it("interpolates each channel toward white", () => {
    expect(mixWithWhite("#000000", 0.5)).toBe("#808080");
    expect(mixWithWhite("#3a443e", 0)).toBe("#3a443e");
    expect(mixWithWhite("#3a443e", 1)).toBe("#ffffff");
  });
});
