import { describe, expect, it } from "vitest";
import { artworkListings, type Polyptych } from "@/lib/data";
import { frameReach, pickFrameDesign } from "./frame-design";
import { sizeWork } from "./place-paintings";
import { layoutPanels, polyptychSize } from "./polyptych";

// The open Garden of Earthly Delights as the Prado frames it.
const garden: Polyptych = {
  panels: [
    { x0: 0, y0: 0, x1: 0.21, y1: 1, wCm: 76.5, hCm: 185.8 },
    { x0: 0.266, y0: 0, x1: 0.739, y1: 1, wCm: 172.5, hCm: 185.8 },
    { x0: 0.797, y0: 0, x1: 1, y1: 1, wCm: 76.5, hCm: 185.8 },
  ],
  frameCm: 11,
  gapCm: 0,
};

describe("polyptychSize", () => {
  it("counts the panels and the frames and gaps between them", () => {
    expect(polyptychSize(garden)).toEqual({ wCm: 325.5 + 4 * 11, hCm: 185.8 });
    expect(polyptychSize({ ...garden, gapCm: 2 }).wCm).toBeCloseTo(325.5 + 4 * 11 + 4, 9);
  });
});

describe("layoutPanels", () => {
  it("hangs the panels at their real size when the work hangs at its own", () => {
    const out = layoutPanels(garden, 3.695);
    expect(out.map((p) => [p.w, p.h, p.reach].map((m) => Math.round(m * 1000)))).toEqual([
      [765, 1858, 110],
      [1725, 1858, 110],
      [765, 1858, 110],
    ]);
  });

  it("puts each frame against the next, or the gap apart", () => {
    for (const gapCm of [0, 20]) {
      const out = layoutPanels({ ...garden, gapCm }, polyptychSize({ ...garden, gapCm }).wCm / 100);
      for (let i = 1; i < out.length; i++) {
        const a = out[i - 1];
        const b = out[i];
        const between = b.x - b.w / 2 - (a.x + a.w / 2);
        expect(between).toBeCloseTo(a.reach + b.reach + gapCm / 100, 9);
      }
    }
  });

  it("fills the width the hang measured, scaled with it", () => {
    const out = layoutPanels(garden, 2);
    const left = out[0].x - out[0].w / 2;
    const right = out[2].x + out[2].w / 2;
    expect(right - left).toBeCloseTo(2, 9);
    expect(out[0].reach / out[0].w).toBeCloseTo(11 / 76.5, 9);
  });

  it("keeps each panel's part of the texture", () => {
    const out = layoutPanels(garden, 3);
    out.forEach((p, i) => {
      const q = garden.panels[i];
      expect(p.uv).toEqual([q.x0, 1 - q.y1, q.x1, 1 - q.y0]);
    });
  });
});

describe("the catalogue's polyptychs", () => {
  const works = artworkListings.filter((a) => a.polyptych);

  it("lists the six measured on 17 October 2026", () => {
    expect(works.length).toBeGreaterThanOrEqual(6);
  });

  it("are framed as wide as their museums frame them", () => {
    const bad = works.filter((work) => {
      const { wM, hM } = sizeWork(work);
      const reach = frameReach(pickFrameDesign(work), wM, hM);
      return Math.abs(reach - (work.polyptych?.frameCm ?? 0) / 100) > 1e-9;
    });
    expect(bad.map((w) => w.id)).toEqual([]);
  });

  it("are measured by the hang from their panels, not their scans", () => {
    const vienna = works.find(
      (w) => w.id === "collection-of-beauty-hugo-van-der-goes-vienna-diptych",
    );
    const { wM, hM } = sizeWork(vienna as (typeof works)[number]);
    expect([wM, hM].map((m) => Math.round(m * 1000))).toEqual([539, 338]);
  });
});
