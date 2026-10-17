import { describe, expect, it } from "vitest";
import { INTER_FLOOR_HEIGHT } from "@/lib/gallery-layout/world-coords";
import { fitWashRow, WASH_SIDE_REACH, WASH_THROW, type WashRow } from "./stairwell-light-rig";
import {
  assignCans,
  CANS_PER_PATCH,
  canReaches,
  canUniforms,
  floorQuad,
  illuminanceAt,
  type LitQuad,
  MAX_CANS,
  PATCH_M,
  splitQuad,
  type WashCan,
} from "./wash-cans";

const CEILING = INTER_FLOOR_HEIGHT - 0.02;

/** A can of `row` at `x` along a wall on the plane z = 0, facing +z,
 *  its row's floor at `floorY`. */
function canAt(row: WashRow, x: number, floorY = 0, throughVoid = true): WashCan {
  return {
    pos: [x, row.lampY + floorY, row.throwM],
    axis: [0, row.dirY, row.dirZ],
    cosOuter: row.cosOuter,
    cosInner: row.cosInner,
    intensity: row.intensity,
    floorGain: row.floorGain,
    aim2: 0,
    floorY,
    throughVoid,
  };
}

/** A piece of that wall, x0..x1 along it and y0..y1 up it. */
function wallQuad(x0: number, x1: number, y0: number, y1: number, inVoid = false): LitQuad {
  return {
    corners: [
      [x0, y0, 0],
      [x1, y0, 0],
      [x1, y1, 0],
      [x0, y1, 0],
    ],
    normal: [0, 0, 1],
    floor: false,
    inVoid,
    gain: 1,
  };
}

/** The wall at x = `x`, facing -x: the next wall round a corner at x. */
function sideQuad(x: number, z0: number, z1: number, y0: number, y1: number): LitQuad {
  return {
    corners: [
      [x, y0, z1],
      [x, y0, z0],
      [x, y1, z0],
      [x, y1, z1],
    ],
    normal: [-1, 0, 0],
    floor: false,
    inVoid: false,
    gain: 1,
  };
}

describe("canReaches", () => {
  const row = fitWashRow(22.5, CEILING);
  const can = canAt(row, 0);

  it("reaches the wall under the can, as far along it as the cone goes", () => {
    // The test widens the cone by 3 degrees, half a metre at the foot,
    // so a can whose edge falls between two samples is still named.
    expect(canReaches(can, wallQuad(-1, 1, 0, 2))).toBe(true);
    expect(canReaches(can, wallQuad(4, 5, 0, 2))).toBe(true);
    expect(canReaches(can, wallQuad(WASH_SIDE_REACH + 1, WASH_SIDE_REACH + 3, 0, 6))).toBe(false);
  });

  it("reaches the wall round a corner, as a real can does", () => {
    // A corner 2.25 m from the can: the next wall's first metres, low
    // down, are inside the cone.
    expect(canReaches(can, sideQuad(2.25, 0, 2, 0, 2))).toBe(true);
    // Not its far end.
    expect(canReaches(can, sideQuad(2.25, 10, 12, 0, 2))).toBe(false);
  });

  it("reaches nothing above the pool's top", () => {
    expect(canReaches(can, wallQuad(-1, 1, row.wallTop + 0.5, CEILING))).toBe(false);
  });

  it("reaches the floor in front of the wall and not behind the can", () => {
    expect(canReaches(can, floorQuad({ xMin: -1, xMax: 1, zMin: 0, zMax: 1 }, 0))).toBe(true);
    expect(canReaches(can, floorQuad({ xMin: -1, xMax: 1, zMin: 6, zMax: 8 }, 0))).toBe(false);
  });

  it("lights nothing under its own floor, unless the surface stands in a void", () => {
    // The can of the storey above, over this storey's wall: the slab is
    // in the way.
    const above = canAt(row, 0, INTER_FLOOR_HEIGHT);
    expect(canReaches(above, wallQuad(-1, 1, 6, 8))).toBe(false);
    // The end wall over a stair hall's landings has no floor in front
    // of it, and the storey above lights it on down.
    expect(canReaches(above, wallQuad(-1, 1, 6, 8, true))).toBe(true);
    // A can over a landing lights nothing under its landing, void or
    // not: the landing is in the way.
    const overLanding = canAt(row, 0, 4.2, false);
    expect(canReaches(overLanding, wallQuad(-1, 1, 1, 3, true))).toBe(false);
    expect(canReaches(overLanding, wallQuad(-1, 1, 5, 7, true))).toBe(true);
  });

  it("faces away from a surface it is behind", () => {
    const behind: LitQuad = { ...wallQuad(-1, 1, 0, 2), normal: [0, 0, -1] };
    expect(canReaches(can, behind)).toBe(false);
  });
});

describe("splitQuad", () => {
  it("cuts a quad to the size asked and keeps what it carries", () => {
    const quad = { ...wallQuad(0, 10, 0, 6), tag: "wall" };
    const pieces = splitQuad(quad, PATCH_M);
    expect(pieces).toHaveLength(4 * 3);
    for (const p of pieces) {
      expect(p.tag).toBe("wall");
      const [c0, c1, c2] = p.corners;
      expect(c1[0] - c0[0]).toBeCloseTo(2.5, 6);
      expect(c2[1] - c1[1]).toBeCloseTo(2, 6);
    }
    expect(splitQuad(wallQuad(0, 2, 0, 2), PATCH_M)).toHaveLength(1);
  });
});

describe("assignCans", () => {
  const row = fitWashRow(22.5, CEILING);
  const cans = [-7.5, -3.75, 0, 3.75, 7.5].map((x) => canAt(row, x));

  it("names each patch the cans that reach it, and drops the ones none does", () => {
    const { patches, used } = assignCans(
      [
        wallQuad(-11.25, 11.25, 0, CEILING),
        floorQuad({ xMin: -11.25, xMax: 11.25, zMin: 0, zMax: 11.25 }, 0),
      ],
      cans,
    );
    expect(used).toHaveLength(5);
    // No patch over the pools, none on the far floor.
    for (const p of patches) {
      expect(Math.min(...p.corners.map((c) => c[1]))).toBeLessThan(row.wallTop);
      expect(Math.min(...p.corners.map((c) => c[2]))).toBeLessThan(row.floorReach);
      expect(p.cans.length).toBeGreaterThan(0);
      expect(p.cans.length).toBeLessThanOrEqual(CANS_PER_PATCH);
    }
    // The patch under the middle can names it and its neighbours only.
    const under = patches.find(
      (p) => !p.floor && p.corners[0][0] <= -1 && p.corners[1][0] >= 1 && p.corners[0][1] === 0,
    );
    expect(under).toBeDefined();
    expect(under!.cans.map((i) => used[i].pos[0]).sort((a, b) => a - b)).toEqual([-3.75, 0, 3.75]);
  });

  it("renumbers the cans a room keeps, so none it holds lights nothing", () => {
    const far = canAt(row, 40);
    const { patches, used } = assignCans([wallQuad(-2, 2, 0, 4)], [far, ...cans]);
    expect(used.every((c) => c !== far)).toBe(true);
    for (const p of patches) for (const i of p.cans) expect(used[i]).toBeDefined();
  });

  it("halves a patch that more cans reach than it can name", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => canAt(row, -2 + i * 0.2));
    const { patches } = assignCans([wallQuad(-1, 1, 0, 1)], crowd);
    for (const p of patches) expect(p.cans.length).toBeLessThanOrEqual(CANS_PER_PATCH);
    expect(patches.length).toBeGreaterThan(1);
  });

  it("sums the same light either side of a cut between two patches", () => {
    // Two quads that meet on a line, as two walls' rectangles do at a
    // corner or two rows' on one wall: the light at the line is the
    // same sum from both.
    const { patches, used } = assignCans(
      [wallQuad(-11.25, 0, 0, 6), wallQuad(0, 11.25, 0, 6)],
      cans,
    );
    const at = (x: number) =>
      patches.filter(
        (p) =>
          !p.floor &&
          p.corners[0][0] <= x &&
          p.corners[1][0] >= x &&
          p.corners[0][1] <= 1 &&
          p.corners[2][1] >= 1,
      );
    const [left, right] = [at(-0.001)[0], at(0.001)[0]];
    const sum = (p: (typeof patches)[number]) =>
      illuminanceAt(
        p.cans.map((i) => used[i]),
        [0, 1, 0],
        [0, 0, 1],
        false,
      );
    expect(sum(left)).toBeCloseTo(sum(right), 9);
    expect(sum(left)).toBeGreaterThan(0.1);
  });
});

describe("canUniforms", () => {
  it("packs three vec4 a can and zero past the last", () => {
    const row = fitWashRow(22.5, CEILING);
    const u = canUniforms([canAt(row, 1.5)]);
    expect(u.a.length).toBe(4 * MAX_CANS);
    expect([...u.a.slice(0, 4)]).toEqual(
      [1.5, row.lampY, WASH_THROW, row.intensity].map((v) => Math.fround(v)),
    );
    expect([...u.b.slice(0, 4)]).toEqual([0, row.dirY, row.dirZ, 0].map((v) => Math.fround(v)));
    expect([...u.c.slice(0, 4)]).toEqual(
      [row.cosOuter, row.cosInner, 0, -row.floorGain].map((v) => Math.fround(v)),
    );
    expect(u.a.slice(4).every((v) => v === 0)).toBe(true);
  });
});
