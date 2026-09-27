import { describe, expect, it } from "vitest";
import { type RealSize, scaleReferenceFor } from "./real-size";
import {
  HANG_CENTRE_CM,
  HEADROOM,
  layoutScene,
  SCENE_MAX_HEIGHT_REM,
  sceneMaxWidthRem,
  workSizes,
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

  it("brings a 300 cm work down to the floor without calling it floor-standing", () => {
    const s = sceneFor(200, 300);
    expect(s.work.y).toBe(0);
    expect(s.standsOnFloor).toBe(false);
  });

  it("stands a work over 300 cm on the floor", () => {
    const s = sceneFor(200, 301);
    expect(s.work.y).toBe(0);
    expect(s.standsOnFloor).toBe(true);
  });

  it("rests a work beside the A4 sheet or the hand on the baseline", () => {
    for (const [w, h] of [
      [26, 36],
      [5, 7],
    ]) {
      const s = sceneFor(w, h);
      expect(s.work.y, `${w} × ${h}`).toBe(0);
      expect(s.standsOnFloor, `${w} × ${h}`).toBe(false);
    }
  });
});

describe("layoutScene — geometry", () => {
  for (const [w, h] of SIZES) {
    it(`places ${w} × ${h} cm and its reference without overlap`, () => {
      const s = sceneFor(w, h);
      // Work on the left at its true size, reference on the floor at the
      // right edge, with a gap between them.
      expect(s.work).toMatchObject({ x: 0, w, h });
      expect(s.ref.y).toBe(0);
      expect(s.ref.x + s.ref.w).toBeCloseTo(s.width, 9);
      expect(s.ref.x).toBeGreaterThan(s.work.x + s.work.w);
    });

    it(`leaves headroom above the taller of ${w} × ${h} cm and its reference`, () => {
      const s = sceneFor(w, h);
      const top = Math.max(s.work.y + s.work.h, s.ref.h);
      expect(s.height).toBeCloseTo(top * (1 + HEADROOM), 9);
      expect(s.height).toBeGreaterThanOrEqual(s.ref.h * (1 + HEADROOM));
    });
  }
});

describe("sceneMaxWidthRem", () => {
  it("keeps every scene at or under the height cap", () => {
    for (const [w, h] of SIZES) {
      const s = sceneFor(w, h);
      expect((sceneMaxWidthRem(s) * s.height) / s.width, `${w} × ${h}`).toBeCloseTo(
        SCENE_MAX_HEIGHT_REM,
        9,
      );
    }
  });
});

describe("workSizes", () => {
  // Wide scene: the height cap binds at 590 px on a phone, but never in the
  // two-column layout, where the aside tops out at 447 px.
  it("Veronese: fluid, capped, fluid again from md to the container, then fixed", () => {
    const s = sceneFor(994, 677);
    expect(workSizes(s, s.work)).toBe(
      "(max-width: 589px) calc((100vw - 58px) * 0.9255), " +
        "(max-width: 767px) 493px, " +
        "(max-width: 1151px) calc(((100vw - 64px) / 2.3 - 26px) * 0.9255), " +
        "414px",
    );
  });

  // The cap binds inside the md band too, so the md fluid entry stops
  // where the aside outgrows the capped scene.
  it("landscape Audubon plate: the md fluid entry stops at the cap", () => {
    const s = sceneFor(100.33, 67.31);
    expect(workSizes(s, s.work)).toBe(
      "(max-width: 387px) calc((100vw - 58px) * 0.5564), " +
        "(max-width: 767px) 184px, " +
        "(max-width: 880px) calc(((100vw - 64px) / 2.3 - 26px) * 0.5564), " +
        "184px",
    );
  });

  // Tall scene: the cap binds on phones and throughout md, so one fixed
  // size covers every viewport from 306 px up.
  it("small hung work: collapses to one fixed size once the cap binds", () => {
    const s = sceneFor(60, 80);
    expect(workSizes(s, s.work)).toBe("(max-width: 305px) calc((100vw - 58px) * 0.4286), 106px");
  });

  it("lists max-widths in ascending order and ends with a bare length", () => {
    for (const [w, h] of SIZES) {
      const s = sceneFor(w, h);
      const entries = workSizes(s, s.work).split(", ");
      const maxes = entries.slice(0, -1).map((e) => Number(/^\(max-width: (\d+)px\)/.exec(e)?.[1]));
      for (const m of maxes) expect(m, `${w} × ${h}`).toBeGreaterThan(0);
      expect(maxes, `${w} × ${h}`).toEqual([...maxes].sort((a, b) => a - b));
      expect(new Set(maxes).size, `${w} × ${h}`).toBe(maxes.length);
      expect(entries.at(-1), `${w} × ${h}`).toMatch(/^\d+px$/);
    }
  });
});
