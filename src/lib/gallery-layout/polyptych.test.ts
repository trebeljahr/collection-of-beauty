import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { frameReach, pickFrameDesign } from "./frame-design";
import { sizeWork } from "./place-paintings";
import { layoutPanels } from "./polyptych";

const garden = [
  { x0: 0, y0: 0, x1: 0.21, y1: 1 },
  { x0: 0.266, y0: 0, x1: 0.739, y1: 1 },
  { x0: 0.797, y0: 0, x1: 1, y1: 1 },
];
const reach = (w: number, h: number) => 0.04 + 0.02 * Math.max(w, h);

describe("layoutPanels", () => {
  it("fits the panels and their frames in the wall the work was given", () => {
    const out = layoutPanels(garden, 3.2, 1.6, reach);
    const left = out[0].x - out[0].w / 2 - reach(out[0].w, out[0].h);
    const last = out[out.length - 1];
    const right = last.x + last.w / 2 + reach(last.w, last.h);
    expect(right - left).toBeLessThanOrEqual(3.2 + 2 * reach(3.2, 1.6) + 1e-9);
    expect(Math.abs(left + right)).toBeLessThan(1e-9);
    for (const p of out) expect(p.h).toBeLessThanOrEqual(1.6 + 1e-9);
  });

  it("puts each frame against the next", () => {
    const out = layoutPanels(garden, 3.2, 1.6, reach);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1];
      const b = out[i];
      const gap = b.x - b.w / 2 - (a.x + a.w / 2);
      expect(gap).toBeCloseTo(reach(a.w, a.h) + reach(b.w, b.h), 9);
    }
  });

  it("keeps each panel's shape and its part of the texture", () => {
    const out = layoutPanels(garden, 3.2, 1.6, reach);
    out.forEach((p, i) => {
      const q = garden[i];
      expect(p.w / p.h).toBeCloseTo(((q.x1 - q.x0) * 3.2) / ((q.y1 - q.y0) * 1.6), 9);
      expect(p.uv).toEqual([q.x0, 1 - q.y1, q.x1, 1 - q.y0]);
    });
  });

  it("keeps a panel set lower in the scan lower on the wall", () => {
    const out = layoutPanels(
      [
        { x0: 0, y0: 0.2, x1: 0.3, y1: 1 },
        { x0: 0.35, y0: 0, x1: 1, y1: 1 },
      ],
      2,
      1.5,
      reach,
    );
    expect(out[0].y).toBeLessThan(out[1].y);
  });
});

describe("the catalogue's polyptychs", () => {
  const works = artworkListings.filter((a) => a.panels);

  it("lists at least the six measured on 17 October 2026", () => {
    expect(works.length).toBeGreaterThanOrEqual(6);
  });

  it("hang every panel no larger than the work's own canvas", () => {
    const bad: string[] = [];
    for (const work of works) {
      const { wM, hM } = sizeWork(work);
      const design = pickFrameDesign(work);
      const out = layoutPanels(work.panels ?? [], wM, hM, (w, h) => frameReach(design, w, h));
      if (out.some((p) => !(p.w > 0.05) || p.h > hM + 1e-9)) bad.push(work.id);
    }
    expect(bad).toEqual([]);
  });
});
