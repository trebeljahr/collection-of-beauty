import { describe, expect, it } from "vitest";
import { INTER_FLOOR_HEIGHT } from "@/lib/gallery-layout/world-coords";
import {
  DOME_HUB_R,
  DOME_ROW_M,
  dome,
  fitWashRow,
  GLAZING_CAN_CLEAR,
  glazingOuterR,
  spanWashRow,
  WASH_CORNER_GAP,
  WASH_PEAK,
  WASH_SIDE_REACH,
  WASH_SPILL_JAMB,
  WASH_SPILL_M,
  WASH_THROW,
  type WashRow,
  washLampXs,
  washSpills,
  washStretches,
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

  it("lights a storey-high wall no brighter at its peak than a 5.9 m one", () => {
    const peakOf = (ceiling: number) => {
      const row = fitWashRow(WALL, ceiling);
      const x = washLampXs(row)[2];
      let peak = 0;
      for (let y = 0; y <= row.wallTop; y += 0.05) {
        peak = Math.max(peak, illuminance(row, [x, y, 0], false));
      }
      return peak;
    };
    const low = peakOf(CEILING);
    const high = peakOf(INTER_FLOOR_HEIGHT - 0.02);
    expect(low).toBeLessThan(WASH_PEAK);
    // Before the cap the 8.18 m ceiling peaked at 7.5. This helper ramps
    // the cone's edge linearly where the shader smoothsteps it, so it
    // reads a little under the cap.
    expect(high).toBeLessThan(WASH_PEAK * 1.02);
    expect(high).toBeGreaterThan(WASH_PEAK * 0.85);
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

describe("spanWashRow", () => {
  it("hangs the count whose gap is nearest the aimed-for one", () => {
    const row = spanWashRow(3.75, CEILING);
    expect(row.count).toBe(3);
    expect(row.spacing).toBeCloseTo(3.75, 6);
    expect(washLampXs(row)).toEqual([-3.75, 0, 3.75]);
  });

  it("keeps the count even when asked", () => {
    // A spiral room's 22.5 m wall, less a corner gap at each end.
    const row = spanWashRow(22.5 / 2 - WASH_CORNER_GAP, CEILING, true);
    expect(row.count % 2).toBe(0);
    const xs = washLampXs(row);
    expect(xs[0]).toBeCloseTo(-22.5 / 2 + WASH_CORNER_GAP, 6);
    expect(xs.at(-1)).toBeCloseTo(22.5 / 2 - WASH_CORNER_GAP, 6);
  });

  it("hangs one can where the span is too short for two", () => {
    expect(washLampXs(spanWashRow(0.2, CEILING))).toEqual([0]);
    expect(washLampXs(spanWashRow(-0.5, CEILING))).toEqual([0]);
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

describe("washStretches", () => {
  // A wall of the block plan's court on one storey: 27.5 m, a portal
  // 3.5 m wide and 3 m high in its middle.
  const COURT = 27.5;
  const portal = { center: 0, width: 3.5, height: 3 };

  it("sets each stretch's row out from its corner, even about its own middle", () => {
    const stretches = washStretches(COURT, [portal], CEILING);
    expect(stretches.map((s) => s.center)).toEqual([-7.75, 7.75]);
    for (const s of stretches) {
      expect(s.row.count).toBe(3);
      expect(s.row.spacing).toBeCloseTo(3.75, 6);
      const xs = washLampXs(s.row);
      for (const [i, x] of xs.entries()) expect(x).toBeCloseTo(-xs[xs.length - 1 - i], 6);
    }
    expect(washLampXs(stretches[0].row)[0] + stretches[0].center).toBeCloseTo(
      -COURT / 2 + WASH_CORNER_GAP,
      6,
    );
    expect(washLampXs(stretches[1].row).at(-1)! + stretches[1].center).toBeCloseTo(
      COURT / 2 - WASH_CORNER_GAP,
      6,
    );
  });

  it("puts the end can the same distance from every corner, whatever the wall", () => {
    // A stair hall's walls: 25 m with a side door off its middle, 27.5 m
    // with the portal, 27.5 m with no door. The cans of two walls that
    // meet stand as far from their corner.
    const gaps: number[] = [];
    for (const [length, doors] of [
      [25, [{ center: 1.25, width: 2.4, height: 2.9 }]],
      [27.5, [portal]],
      [27.5, []],
      [17.5, [{ center: 0, width: 2.4, height: 2.9 }]],
    ] as const) {
      const stretches = washStretches(length, [...doors], INTER_FLOOR_HEIGHT - 0.02);
      const first = stretches[0];
      const last = stretches[stretches.length - 1];
      gaps.push(washLampXs(first.row)[0] + first.center + length / 2);
      gaps.push(length / 2 - (washLampXs(last.row).at(-1)! + last.center));
    }
    for (const gap of gaps) expect(gap).toBeCloseTo(WASH_CORNER_GAP, 6);
  });

  it("sets a row out about the one work its stretch holds", () => {
    // The work hangs 0.4 m off the stretch's middle: a hall's side wall,
    // where the hang keeps a metre from the sheer strip.
    const [left, right] = washStretches(COURT, [portal], CEILING, [-8.15, 7.75]);
    expect(left.center).toBeCloseTo(-8.15, 6);
    expect(right.center).toBeCloseTo(7.75, 6);
    // Every can still hangs inside the stretch, 1.75 to 13.75 m out.
    const xs = washLampXs(left.row).map((x) => x + left.center);
    expect(Math.min(...xs)).toBeGreaterThan(-13.75 + 0.5);
    expect(Math.max(...xs)).toBeLessThan(-1.75 - 0.5);
    // The stretch's rectangle is the wall, wherever the row stands.
    expect(left.rects[0].xMin + left.center).toBeCloseTo(-13.75, 6);
    expect(left.rects[0].xMax + left.center).toBeCloseTo(-1.75, 6);
  });

  it("keeps to the stretch's middle for a work too far off it, or for two", () => {
    expect(washStretches(COURT, [portal], CEILING, [-11.5])[0].center).toBeCloseTo(-7.75, 6);
    expect(washStretches(COURT, [portal], CEILING, [-10, -5])[0].center).toBeCloseTo(-7.75, 6);
  });

  it("keeps a row between two corners on the wall's middle", () => {
    expect(washStretches(16.05, [], CEILING, [0.5])[0].center).toBe(0);
  });

  it("lights the half of the lintel next to each stretch, and nothing in the doorway", () => {
    const [left, right] = washStretches(COURT, [portal], CEILING);
    expect(left.rects).toHaveLength(2);
    const lintel = left.rects[1];
    expect(lintel.xMin + left.center).toBeCloseTo(-1.75, 6);
    expect(lintel.xMax + left.center).toBeCloseTo(0, 6);
    expect(lintel.yMin).toBe(3);
    expect(right.rects[1].xMin + right.center).toBeCloseTo(0, 6);
    expect(right.rects[1].xMax + right.center).toBeCloseTo(1.75, 6);
    // The floor in front runs to the middle of the doorway, where the
    // other stretch takes over.
    expect(left.floor[1] + left.center).toBeCloseTo(0, 6);
    expect(right.floor[0] + right.center).toBeCloseTo(0, 6);
    for (const s of [left, right]) {
      for (const r of s.rects) {
        const inDoor = r.xMin + s.center < 1.75 - 1e-6 && r.xMax + s.center > -1.75 + 1e-6;
        if (inDoor) expect(r.yMin).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("lights a wall with no door as one stretch from corner to corner", () => {
    const [only, ...rest] = washStretches(16.05, [], CEILING);
    expect(rest).toHaveLength(0);
    expect(only.center).toBe(0);
    expect(only.rects).toEqual([{ xMin: -8.025, xMax: 8.025, yMin: 0, yMax: only.row.wallTop }]);
    expect(only.floor).toEqual([-8.025, 8.025]);
  });

  it("holds a can's cone inside the reach the stretches count on", () => {
    const row = fitWashRow(COURT, CEILING);
    const lone: WashRow = { ...row, count: 1 };
    let widest = 0;
    for (let x = 0; x <= 6; x += 0.05) {
      let lit = false;
      for (let y = 0; y <= row.wallTop && !lit; y += 0.1) {
        lit = illuminance(lone, [x, y, 0], false) > 0;
      }
      for (let z = 0; z <= row.floorReach && !lit; z += 0.1) {
        lit = illuminance(lone, [x, 0, z], true) > 0;
      }
      if (lit) widest = x;
    }
    expect(widest).toBeGreaterThan(2.5);
    expect(widest).toBeLessThan(WASH_SIDE_REACH);
  });

  it("gives a short stretch one can on its middle", () => {
    // 4 m between a door and a corner: too short for two cans each
    // WASH_CORNER_GAP from its ends.
    const door = { center: -COURT / 2 + 4 + 0.7, width: 1.4, height: 2.4 };
    const first = washStretches(COURT, [door], CEILING)[0];
    expect(first.row.count).toBe(1);
    expect(first.center).toBeCloseTo(-COURT / 2 + 2, 6);
    expect(washLampXs(first.row)).toEqual([0]);
    // And none at all under a metre and a half.
    expect(
      washStretches(COURT, [{ center: -COURT / 2 + 1.7, width: 1.4, height: 2.4 }], CEILING),
    ).toHaveLength(1);
  });
});

describe("glass and cans", () => {
  it("keeps every can of a spiral room over plain ceiling", () => {
    // A spiral room of the plan is 22.5 by 17.5 m. A can hangs
    // WASH_THROW out from its wall; the nearest one to the axis is on
    // the middle of the nearer wall.
    const rimR = glazingOuterR(22.5, 17.5);
    const nearestCan = 17.5 / 2 - WASH_THROW;
    expect(nearestCan - rimR).toBeGreaterThanOrEqual(GLAZING_CAN_CLEAR - 1e-9);
  });
});

describe("dome", () => {
  const rimR = glazingOuterR(22.5, 17.5);
  it("rises from its rim to the crown", () => {
    const d = dome(rimR);
    expect(d.rowEdge(d.rows).r).toBeCloseTo(rimR, 6);
    expect(d.rowEdge(d.rows).y).toBeCloseTo(0, 6);
    expect(d.rowEdge(0).r).toBeCloseTo(DOME_HUB_R, 6);
    expect(d.heightAt(0)).toBeCloseTo(d.rise, 6);
    expect(d.heightAt(rimR)).toBeCloseTo(0, 6);
    // Rows of panes about DOME_ROW_M long on the curve.
    const a = d.rowEdge(d.rows - 1);
    const b = d.rowEdge(d.rows);
    const row = Math.hypot(b.r - a.r, b.y - a.y);
    expect(row).toBeGreaterThan(DOME_ROW_M * 0.75);
    expect(row).toBeLessThan(DOME_ROW_M * 1.33);
  });
});

describe("washSpills", () => {
  const door = { center: 0, width: 3.5, height: 3 };
  const jamb = WASH_SPILL_M / WASH_SPILL_JAMB;

  it("carries a band that crosses a door on past its threshold", () => {
    expect(washSpills([-10, 10], [door])).toEqual([
      { xMin: -1.75 - jamb, xMax: 1.75 + jamb, zMin: -WASH_SPILL_M, door: [-1.75, 1.75] },
    ]);
  });

  it("stops at the band's end, as a stretch's band stops at the door's middle", () => {
    const [spill] = washSpills([0, 10], [door]);
    expect(spill.xMin).toBe(0);
    expect(spill.xMax).toBe(1.75 + jamb);
  });

  it("spills nothing from a band that reaches the door only past a jamb", () => {
    expect(washSpills([2, 10], [door])).toEqual([]);
  });
});
