import { describe, expect, it } from "vitest";
import { type RealSize, scaleReferenceFor } from "./real-size";
import {
  HANG_CENTRE_CM,
  HEADROOM,
  layoutScene,
  MAT_MAX_CM,
  MAT_SHARE,
  MOULDING_MAX_CM,
  MOULDING_SHARE,
} from "./real-size-scene";

function sceneFor(widthCm: number, heightCm: number) {
  const size: RealSize = { widthCm, heightCm };
  return layoutScene(size, scaleReferenceFor(size));
}

// One size per reference band and hanging case: a hand-band etching, a
// Haeckel plate, a small hung work, a landscape Audubon plate, a work just
// over the floor line and Veronese's Wedding at Cana.
const SIZES: [number, number][] = [
  [5, 7],
  [26, 36],
  [60, 60],
  [100.33, 67.31],
  [200, 301],
  [994, 677],
];

describe("layoutScene — hanging beside the figure", () => {
  it("hangs a work with its centre at the hang height", () => {
    const s = sceneFor(60, 60);
    expect(s.work.y).toBe(120);
    expect(s.work.y + s.work.h / 2).toBe(HANG_CENTRE_CM);
    expect(s.standsOnFloor).toBe(false);
  });

  it("hangs a 260 cm work whose frame clears the floor", () => {
    const s = sceneFor(200, 260);
    expect(s.work.y + s.work.h / 2).toBe(HANG_CENTRE_CM);
    expect(s.frame.y).toBeGreaterThan(0);
    expect(s.standsOnFloor).toBe(false);
  });

  it("stands a work on the floor once its frame would reach below it", () => {
    const s = sceneFor(200, 290);
    expect(s.frame.y).toBe(0);
    expect(s.work.y + s.work.h / 2).toBeGreaterThan(HANG_CENTRE_CM);
    expect(s.standsOnFloor).toBe(true);
  });

  it("hangs a print beside the figure", () => {
    const s = sceneFor(26, 36);
    expect(s.work.y + s.work.h / 2).toBe(HANG_CENTRE_CM);
  });

  it("rests a framed work beside the hand on the baseline", () => {
    const s = sceneFor(5, 7);
    expect(s.frame.y).toBe(0);
    expect(s.standsOnFloor).toBe(false);
  });
});

describe("layoutScene — frame", () => {
  it("grows the frame with the work", () => {
    const s = sceneFor(26, 36);
    expect(s.mat.x).toBeCloseTo(s.work.x - MAT_SHARE * 36, 9);
    expect(s.frame.x).toBeCloseTo(s.mat.x - MOULDING_SHARE * 36, 9);
  });

  it("caps the frame on the largest works", () => {
    const s = sceneFor(994, 677);
    expect(s.work.x - s.mat.x).toBe(MAT_MAX_CM);
    expect(s.mat.x - s.frame.x).toBe(MOULDING_MAX_CM);
  });

  for (const [w, h] of SIZES) {
    it(`centres ${w} × ${h} cm in its mat and its mat in the moulding`, () => {
      const s = sceneFor(w, h);
      const left = s.work.x - s.mat.x;
      const right = s.mat.x + s.mat.w - (s.work.x + s.work.w);
      const bottom = s.work.y - s.mat.y;
      const top = s.mat.y + s.mat.h - (s.work.y + s.work.h);
      for (const side of [right, bottom, top]) expect(side).toBeCloseTo(left, 9);
      expect(left).toBeGreaterThan(0);
      expect(s.frame.x).toBeLessThan(s.mat.x);
      expect(s.frame.w - s.mat.w).toBeCloseTo(2 * (s.mat.x - s.frame.x), 9);
      expect(s.frame.h - s.mat.h).toBeCloseTo(2 * (s.mat.y - s.frame.y), 9);
    });
  }
});

describe("layoutScene — geometry", () => {
  for (const [w, h] of SIZES) {
    it(`places ${w} × ${h} cm and its reference without overlap`, () => {
      const s = sceneFor(w, h);
      // Framed work on the left, the work itself at its true size,
      // reference on the floor at the right edge, with a gap between.
      expect(s.frame.x).toBeCloseTo(0, 9);
      expect(s.frame.y).toBeGreaterThanOrEqual(0);
      expect(s.work).toMatchObject({ w, h });
      expect(s.ref.y).toBe(0);
      expect(s.ref.x + s.ref.w).toBeCloseTo(s.width, 9);
      expect(s.ref.x).toBeGreaterThan(s.frame.x + s.frame.w);
    });

    it(`leaves headroom above the taller of ${w} × ${h} cm and its reference`, () => {
      const s = sceneFor(w, h);
      const top = Math.max(s.frame.y + s.frame.h, s.ref.h);
      expect(s.height).toBeCloseTo(top * (1 + HEADROOM), 9);
      expect(s.height).toBeGreaterThanOrEqual(s.ref.h * (1 + HEADROOM));
    });
  }
});
