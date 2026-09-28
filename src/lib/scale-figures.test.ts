import { describe, expect, it } from "vitest";
import { scaleReferenceFor } from "./real-size";
import {
  HAND_PATH,
  HAND_POINTS,
  HAND_SHAPE,
  PERSON_PATH,
  PERSON_POINTS,
  PERSON_SHAPE,
  splinePath,
} from "./scale-figures";

function bounds(points: readonly (readonly number[])[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe("reference outlines", () => {
  it("keep the figure inside its box, head at the top and soles on the floor", () => {
    const b = bounds(PERSON_POINTS);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(PERSON_SHAPE.h);
    expect(b.minX).toBeGreaterThanOrEqual(0);
    expect(b.maxX).toBeLessThanOrEqual(PERSON_SHAPE.w);
    // Filling the box: under 1 cm spare on each side.
    expect(b.minX).toBeLessThan(1);
    expect(PERSON_SHAPE.w - b.maxX).toBeLessThan(1);
  });

  it("mirrors the figure about its centre line", () => {
    const b = bounds(PERSON_POINTS);
    expect(b.minX + b.maxX).toBeCloseTo(PERSON_SHAPE.w, 9);
  });

  it("keep the hand inside its box, wrist on the baseline", () => {
    const b = bounds(HAND_POINTS);
    expect(b.maxY).toBe(HAND_SHAPE.h);
    expect(b.minY).toBeGreaterThanOrEqual(0);
    expect(b.minX).toBeGreaterThanOrEqual(0);
    expect(b.maxX).toBeLessThanOrEqual(HAND_SHAPE.w);
  });

  // The layout places real-size.ts's box; the component scales the
  // drawing to that box's height. Same aspect, or the drawing spills.
  it("match the boxes scaleReferenceFor() lays out", () => {
    const person = scaleReferenceFor({ widthCm: 100, heightCm: 100 });
    expect(person.widthCm).toBe(PERSON_SHAPE.w);
    expect(person.heightCm).toBe(PERSON_SHAPE.h);
    const hand = scaleReferenceFor({ widthCm: 5, heightCm: 5 });
    expect(hand.widthCm / hand.heightCm).toBeCloseTo(HAND_SHAPE.w / HAND_SHAPE.h, 9);
  });

  it("are closed paths with one cubic per point", () => {
    for (const [path, points] of [
      [PERSON_PATH, PERSON_POINTS],
      [HAND_PATH, HAND_POINTS],
    ] as const) {
      expect(path.startsWith("M")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
      expect(path.split("C").length - 1).toBe(points.length);
    }
  });
});

describe("splinePath", () => {
  it("passes through every point and keeps a corner's handles on it", () => {
    const d = splinePath([
      [0, 0, 1],
      [10, 0],
      [10, 10, 1],
    ]);
    // Leaving the corner at 0,0, the first handle sits on the corner.
    expect(d).toMatch(/^M0 0C0 0 /);
    expect(d).toContain(" 10 0C");
    expect(d).toContain(" 10 10C10 10 ");
  });
});
