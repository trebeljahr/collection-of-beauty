import { describe, expect, it } from "vitest";
import {
  fitWashRow,
  OCULUS_HUB_R,
  RING_INNER_R,
  RING_OUTER_R,
  RING_ROW_M,
  RING_ROWS,
  type WashRow,
  washLampXs,
  washWallRects,
} from "./stairwell-light-rig";

// The stairwell as built: 22.5 m walls under a 5.9 m ceiling.
const WALL = 22.5;
const CEILING = 5.9;

/** What the pools' shader adds up at a point on the wall (z = 0) or on
 *  the floor (y = 0), from every can in the row. */
function illuminance(row: WashRow, p: [number, number, number], onFloor: boolean): number {
  let e = 0;
  for (const x of washLampXs(row)) {
    const toL = [x - p[0], row.lampY - p[1], row.throwM - p[2]];
    const d2 = toL[0] ** 2 + toL[1] ** 2 + toL[2] ** 2;
    const d = Math.sqrt(d2);
    const cosA = -((toL[1] / d) * row.dirY + (toL[2] / d) * row.dirZ);
    if (cosA <= row.cosOuter) continue;
    const spot = Math.min(1, (cosA - row.cosOuter) / (row.cosInner - row.cosOuter));
    e += (row.intensity * Math.max(0, (onFloor ? toL[1] : toL[2]) / d) * spot) / d2;
  }
  return e;
}

describe("fitWashRow", () => {
  it("hangs an even number of cans, evenly, clear of the wall's middle", () => {
    const row = fitWashRow(WALL, CEILING);
    expect(row.count).toBe(6);
    expect(row.spacing).toBeCloseTo(3.75, 6);
    const xs = washLampXs(row);
    expect(xs).toHaveLength(6);
    // Symmetric about the middle, where a door stands, and none on it.
    for (const [i, x] of xs.entries()) expect(x).toBeCloseTo(-xs[xs.length - 1 - i], 6);
    expect(Math.min(...xs.map(Math.abs))).toBeCloseTo(row.spacing / 2, 6);
    // The end cans are half a gap from the corners.
    expect(xs[0]).toBeCloseTo(-WALL / 2 + row.spacing / 2, 6);
  });

  it("keeps the count even for any wall", () => {
    for (const length of [4, 9, 12.5, 17.5, 30]) {
      const row = fitWashRow(length, CEILING);
      expect(row.count % 2).toBe(0);
      expect(row.count).toBeGreaterThanOrEqual(2);
      expect(row.spacing * row.count).toBeCloseTo(length, 6);
    }
  });

  it("aims a unit beam down at the wall", () => {
    const row = fitWashRow(WALL, CEILING);
    expect(Math.hypot(row.dirY, row.dirZ)).toBeCloseTo(1, 6);
    expect(row.dirY).toBeLessThan(0);
    expect(row.dirZ).toBeLessThan(0);
    expect(row.lampY).toBeLessThan(CEILING);
    expect(row.cosInner).toBeGreaterThan(row.cosOuter);
  });

  it("gives the aim point the picture lights' unit illuminance", () => {
    const row = fitWashRow(WALL, CEILING);
    const x = washLampXs(row)[2];
    // Follow the beam's axis from the can to the wall.
    const aimY = row.lampY + (row.dirY / -row.dirZ) * row.throwM;
    const e = illuminance(row, [x, aimY, 0], false);
    // One can gives exactly 1, and its neighbours don't reach this high.
    expect(e).toBeCloseTo(1, 6);
  });

  it("leaves a dip between two pools, so the wall reads as scallops", () => {
    const row = fitWashRow(WALL, CEILING);
    const [a, b] = washLampXs(row).slice(2, 4);
    const y = 3.6;
    const under = illuminance(row, [a, y, 0], false);
    const between = illuminance(row, [(a + b) / 2, y, 0], false);
    expect(under).toBeGreaterThan(0.8);
    expect(between).toBeLessThan(under * 0.5);
  });

  it("bounds everything the cans light", () => {
    const row = fitWashRow(WALL, CEILING);
    expect(row.wallTop).toBeLessThan(CEILING);
    expect(row.floorReach).toBeGreaterThan(0);
    for (const x of [...washLampXs(row), 0, 1.2, -7.7]) {
      // Dark above the wall rectangle and beyond the floor strip.
      for (let y = row.wallTop; y <= CEILING; y += 0.1) {
        expect(illuminance(row, [x, y, 0], false)).toBe(0);
      }
      for (let z = row.floorReach; z <= 8; z += 0.1) {
        expect(illuminance(row, [x, 0, z], true)).toBe(0);
      }
    }
    // And lit inside both.
    const x = washLampXs(row)[0];
    expect(illuminance(row, [x, row.wallTop - 0.5, 0], false)).toBeGreaterThan(0);
    expect(illuminance(row, [x, 0, row.floorReach - 0.5], true)).toBeGreaterThan(0);
  });

  it("reaches no further than a can's two neighbours", () => {
    // The shader adds three cans a fragment: its own and one each side.
    // The nearest can it leaves out is a gap and a half away, so a cone
    // that reached that far would be cut off in a visible line.
    const row = fitWashRow(WALL, CEILING);
    const lone: WashRow = { ...row, count: 1 };
    expect(washLampXs(lone)).toEqual([0]);
    const away = 1.5 * row.spacing;
    for (let y = 0; y <= row.wallTop; y += 0.1) {
      expect(illuminance(lone, [away, y, 0], false)).toBe(0);
    }
    for (let z = 0; z <= row.floorReach; z += 0.1) {
      expect(illuminance(lone, [away, 0, z], true)).toBe(0);
    }
  });
});

describe("washWallRects", () => {
  const row = fitWashRow(WALL, CEILING);

  it("covers a blank wall from corner to corner", () => {
    expect(washWallRects(row, WALL, [])).toEqual([
      { xMin: -WALL / 2, xMax: WALL / 2, yMin: 0, yMax: row.wallTop },
    ]);
  });

  it("cuts a doorway out and keeps the lintel over it", () => {
    const rects = washWallRects(row, WALL, [{ center: 0, width: 1.4, height: 2.4 }]);
    expect(rects).toEqual([
      { xMin: -WALL / 2, xMax: -0.7, yMin: 0, yMax: row.wallTop },
      { xMin: 0.7, xMax: WALL / 2, yMin: 0, yMax: row.wallTop },
      { xMin: -0.7, xMax: 0.7, yMin: 2.4, yMax: row.wallTop },
    ]);
    // Nothing is drawn across the opening.
    for (const r of rects) {
      const overDoor = r.xMin < 0.7 && r.xMax > -0.7;
      if (overDoor) expect(r.yMin).toBeGreaterThanOrEqual(2.4);
    }
  });

  it("drops the lintel of a door taller than the pools", () => {
    const rects = washWallRects(row, WALL, [{ center: 3, width: 1.4, height: 5.5 }]);
    expect(rects).toHaveLength(2);
  });
});

describe("glazing", () => {
  it("fits whole rows of panes into the ring and the oculus", () => {
    expect(RING_ROWS * RING_ROW_M).toBeCloseTo(RING_OUTER_R - RING_INNER_R, 6);
    expect(OCULUS_HUB_R).toBeGreaterThan(0);
    // The oculus's rows line up with the ring's on the floors below.
    expect((RING_INNER_R - OCULUS_HUB_R) / RING_ROW_M).toBeCloseTo(
      Math.round((RING_INNER_R - OCULUS_HUB_R) / RING_ROW_M),
      6,
    );
  });
});
