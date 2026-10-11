import { describe, expect, it } from "vitest";
import type { CellRect, Divider } from "@/lib/gallery-layout/types";
import { LAYLIGHT_MARGIN_M, laylightPanels } from "./laylight-layout";

function room(w: number, d: number, ceilingHeight: number, dividers: Divider[] = []) {
  const cellBounds: CellRect = { xMin: 0, xMax: w - 1, zMin: 0, zMax: d - 1 };
  return { cellBounds, ceilingHeight, dividers };
}

describe("laylightPanels", () => {
  it("fills an open room's ceiling, inset from the walls", () => {
    expect(laylightPanels(room(9, 7, 5.4))).toEqual([
      {
        xMin: LAYLIGHT_MARGIN_M,
        xMax: 22.5 - LAYLIGHT_MARGIN_M,
        zMin: LAYLIGHT_MARGIN_M,
        zMax: 17.5 - LAYLIGHT_MARGIN_M,
      },
    ]);
  });

  it("gives a room too small for a panel none", () => {
    expect(laylightPanels(room(3, 3, 4.2))).toEqual([]);
  });

  it("is not cut by wing walls that stop short of the panel", () => {
    // 2.5 m wing walls stand inside the 2.6 m margin.
    const wings: Divider[] = [
      { axis: "z", line: 3, start: 0, end: 1 },
      { axis: "z", line: 3, start: 4, end: 5 },
    ];
    expect(laylightPanels(room(9, 5, 4.2, wings))).toHaveLength(1);
  });

  it("is cut into one panel a bay by wing walls that reach under it", () => {
    const wings: Divider[] = [3, 6].flatMap((line) => [
      { axis: "z" as const, line, start: 0, end: 2 },
      { axis: "z" as const, line, start: 4, end: 6 },
    ]);
    const panels = laylightPanels(room(9, 6, 4.2, wings));
    expect(panels).toHaveLength(3);
    // Each stays clear of the wing walls by more than a light's throw.
    for (const p of panels) {
      for (const line of [7.5, 15]) {
        const gap = Math.min(Math.abs(p.xMin - line), Math.abs(p.xMax - line));
        expect(p.xMax <= line || p.xMin >= line).toBe(true);
        expect(gap).toBeGreaterThan(1.5);
      }
    }
  });

  it("leaves a hall with panels one laylight down its nave", () => {
    const panels: Divider[] = [2, 5].flatMap((line) => [
      { axis: "x" as const, line, start: 1, end: 3 },
      { axis: "x" as const, line, start: 4, end: 6 },
    ]);
    const [nave, ...rest] = laylightPanels(room(7, 7, 5.4, panels));
    expect(rest).toEqual([]);
    // Between the two panel lines (z = 5 and 12.5), the room's length.
    expect(nave.zMin).toBeGreaterThan(5);
    expect(nave.zMax).toBeLessThan(12.5);
    expect(nave.xMax - nave.xMin).toBeCloseTo(17.5 - 2 * LAYLIGHT_MARGIN_M, 9);
  });
});
