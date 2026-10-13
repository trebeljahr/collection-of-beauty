import { describe, expect, it } from "vitest";
import { arrangementOf, dividerStyles } from "./divider-plans";
import {
  arrivalPoint,
  BENCH_DEPTH,
  BENCH_HEIGHT,
  BENCH_LENGTH,
  benchClearOf,
  benchRect,
  benchUnder,
  ceilingHeightFor,
  clearOfFittings,
  clearsBenches,
  dividerRect,
  type PlanDoor,
  planBenches,
  planDividers,
  type Rect,
  roomKind,
  writeDividerEdges,
} from "./fittings";
import { fittingsFor, GRAND_HALL, SLOT_STAGES, STAIR } from "./layout-museum";
import type { Bench, CellRect, Divider } from "./types";
import { CELL_SIZE, DOOR_WIDTH, PORTAL_WIDTH } from "./world-coords";

/** A room of `w` × `d` cells with its low corner on the grid origin. */
function rect(w: number, d: number, x0 = 0, z0 = 0): CellRect {
  return { xMin: x0, xMax: x0 + w - 1, zMin: z0, zMax: z0 + d - 1 };
}

/** A door in one wall of `r`, its centre `cell + 0.5` cells along it. */
function door(r: CellRect, side: PlanDoor["side"], cell: number, width = DOOR_WIDTH): PlanDoor {
  const along = (cell + 0.5) * CELL_SIZE;
  if (side === "north")
    return { side, worldX: r.xMin * CELL_SIZE + along, worldZ: r.zMin * CELL_SIZE, width };
  if (side === "south")
    return { side, worldX: r.xMin * CELL_SIZE + along, worldZ: (r.zMax + 1) * CELL_SIZE, width };
  if (side === "west")
    return { side, worldX: r.xMin * CELL_SIZE, worldZ: r.zMin * CELL_SIZE + along, width };
  return { side, worldX: (r.xMax + 1) * CELL_SIZE, worldZ: r.zMin * CELL_SIZE + along, width };
}

function overlap(a: Rect, b: Rect): boolean {
  return (
    a.xMin < b.xMax - 1e-6 &&
    b.xMin < a.xMax - 1e-6 &&
    a.zMin < b.zMax - 1e-6 &&
    b.zMin < a.zMax - 1e-6
  );
}

/** The strip of floor a door looks down: its opening, widened by
 *  `margin`, run right across the room. */
function doorStrip(r: CellRect, d: PlanDoor, margin: number): Rect {
  const half = d.width / 2 + margin;
  const room = {
    xMin: r.xMin * CELL_SIZE,
    xMax: (r.xMax + 1) * CELL_SIZE,
    zMin: r.zMin * CELL_SIZE,
    zMax: (r.zMax + 1) * CELL_SIZE,
  };
  return d.side === "north" || d.side === "south"
    ? { ...room, xMin: d.worldX - half, xMax: d.worldX + half }
    : { ...room, zMin: d.worldZ - half, zMax: d.worldZ + half };
}

describe("room kinds and ceilings", () => {
  it("calls a room 17.5 m both ways a hall, and a long narrow one a gallery", () => {
    expect(roomKind(rect(7, 7))).toBe("hall");
    expect(roomKind(rect(9, 5))).toBe("gallery");
    expect(roomKind(rect(5, 7))).toBe("gallery");
    // 17.5 m long, but only 1.17 times its width.
    expect(roomKind(rect(6, 7))).toBe("room");
    expect(roomKind(rect(6, 6))).toBe("room");
  });

  it("sets the ceiling by the narrow side", () => {
    expect(ceilingHeightFor(rect(9, 4))).toBe(4.0);
    expect(ceilingHeightFor(rect(9, 5))).toBe(4.8);
    expect(ceilingHeightFor(rect(6, 7))).toBe(4.8);
    expect(ceilingHeightFor(rect(7, 9))).toBe(5.7);
  });
});

describe("planDividers", () => {
  it("leaves a room shorter than 17.5 m alone", () => {
    expect(planDividers(rect(6, 6), [])).toEqual([]);
    expect(planDividers(rect(6, 7), [])).toEqual([]);
  });

  it("cuts a long room into bays with a wing wall from each side", () => {
    const r = rect(9, 5);
    const dividers = planDividers(r, [door(r, "west", 2), door(r, "east", 2)]);
    // Two pairs, on the lines that make three 7.5 m bays.
    expect(dividers).toEqual([
      { axis: "z", line: 3, start: 0, end: 1 },
      { axis: "z", line: 3, start: 4, end: 5 },
      { axis: "z", line: 6, start: 0, end: 1 },
      { axis: "z", line: 6, start: 4, end: 5 },
    ]);
  });

  it("keeps wing walls off the lines beside a door in the long wall", () => {
    // Seven cells long with a door in the middle of a long wall: a
    // single pair would have to stand 1.25 m from the door's centre.
    const r = rect(7, 5);
    const dividers = planDividers(r, [door(r, "north", 3)]);
    expect([...new Set(dividers.map((d) => d.line))]).toEqual([2, 5]);
  });

  it("uses longer wing walls in a wider room and keeps the passage open", () => {
    const r = rect(6, 9);
    const dividers = planDividers(r, [door(r, "north", 2), door(r, "south", 2)]);
    expect(dividers).toContainEqual({ axis: "x", line: 3, start: 0, end: 2 });
    expect(dividers).toContainEqual({ axis: "x", line: 3, start: 4, end: 6 });
  });

  it("stands one centred panel each side of a hall's axis", () => {
    const r = rect(7, 9);
    const dividers = planDividers(r, [door(r, "north", 3), door(r, "south", 3)]);
    expect(dividers).toEqual([
      { axis: "z", line: 2, start: 3, end: 6 },
      { axis: "z", line: 5, start: 3, end: 6 },
    ]);
  });

  it("stops a hall's panels either side of a door that looks across it", () => {
    const r = rect(7, 7);
    const doors = [
      door(r, "west", 3),
      door(r, "east", 3),
      door(r, "north", 3),
      door(r, "south", 3),
    ];
    expect(planDividers(r, doors)).toEqual([
      { axis: "x", line: 2, start: 1, end: 3 },
      { axis: "x", line: 5, start: 1, end: 3 },
      { axis: "x", line: 2, start: 4, end: 6 },
      { axis: "x", line: 5, start: 4, end: 6 },
    ]);
  });

  it("centres the nave on the end doors, not on the room", () => {
    // Eight cells across: the doors stand half a cell off the middle.
    const r = rect(8, 9);
    const dividers = planDividers(r, [door(r, "north", 3), door(r, "south", 3)]);
    expect([...new Set(dividers.map((d) => d.line))]).toEqual([2, 5]);
  });

  it("works wherever the room is on the grid", () => {
    const r = rect(9, 5, 20, 15);
    const dividers = planDividers(r, [door(r, "west", 2)]);
    expect(dividers[0]).toEqual({ axis: "z", line: 23, start: 15, end: 16 });
  });
});

describe("planDividers, by style", () => {
  /** A hall 27.5 × 17.5 m with a door in the middle of each wall but
   *  the south one. */
  const hall = rect(11, 7);
  const hallDoors = [
    door(hall, "west", 3, 2.4),
    door(hall, "east", 3, 2.4),
    door(hall, "north", 5, 2.4),
  ];

  it("divides a hall into bays with a pair of 5 m wing walls either side of its side door", () => {
    expect(planDividers(hall, hallDoors, { style: "bays" })).toEqual([
      { axis: "z", line: 4, start: 0, end: 2 },
      { axis: "z", line: 4, start: 5, end: 7 },
      { axis: "z", line: 7, start: 0, end: 2 },
      { axis: "z", line: 7, start: 5, end: 7 },
    ]);
  });

  it("staggers single wing walls from alternate sides", () => {
    expect(planDividers(hall, hallDoors, { style: "staggered" })).toEqual([
      { axis: "z", line: 4, start: 0, end: 2 },
      { axis: "z", line: 7, start: 5, end: 7 },
    ]);
  });

  it("stands longer panels in the same rows", () => {
    const usual = planDividers(hall, hallDoors);
    const long = planDividers(hall, hallDoors, { style: "long-rows" });
    expect(usual.map((d) => d.end - d.start)).toEqual([2, 2, 2, 2]);
    expect(long.map((d) => d.end - d.start)).toEqual([3, 3, 3, 3]);
    expect(new Set(long.map((d) => d.line))).toEqual(new Set(usual.map((d) => d.line)));
    // Through the middle of a room no door looks across: 12.5 m.
    const r = rect(11, 7);
    const through = planDividers(r, [door(r, "west", 3), door(r, "east", 3)], {
      style: "long-rows",
    });
    expect(through).toEqual([
      { axis: "x", line: 2, start: 3, end: 8 },
      { axis: "x", line: 5, start: 3, end: 8 },
    ]);
  });

  it("turns four panels round the middle of a large square room", () => {
    const r = rect(11, 11);
    const doors = [
      door(r, "west", 5, PORTAL_WIDTH),
      door(r, "east", 5, PORTAL_WIDTH),
      door(r, "north", 5, 2.4),
      door(r, "south", 5, 2.4),
    ];
    const dividers = planDividers(r, doors, { style: "pinwheel" });
    expect(dividers).toEqual([
      { axis: "x", line: 4, start: 1, end: 4 },
      { axis: "z", line: 7, start: 1, end: 4 },
      { axis: "x", line: 7, start: 7, end: 10 },
      { axis: "z", line: 4, start: 7, end: 10 },
    ]);
    // A quarter turn about the middle of the room takes each to the next.
    const turned = dividers.map((d) => ({
      axis: d.axis === "x" ? "z" : "x",
      line: d.axis === "x" ? d.line : 11 - d.line,
      start: d.axis === "x" ? 11 - d.end : d.start,
      end: d.axis === "x" ? 11 - d.start : d.end,
    }));
    const key = (d: { axis: string; line: number; start: number; end: number }) =>
      `${d.axis}:${d.line}:${d.start}:${d.end}`;
    expect(turned.map(key).sort()).toEqual(dividers.map(key).sort());
    expect(arrangementOf(r, dividers)).toEqual({ kind: "pinwheel" });
    // Rows the other way are one more arrangement of the same room.
    const cross = planDividers(r, doors, { style: "cross-rows" });
    expect(cross.every((d) => d.axis === "z")).toBe(true);
    expect(dividerStyles(r, doors)).toEqual([
      "rows",
      "long-rows",
      "bays",
      "staggered",
      "pinwheel",
      "cross-rows",
    ]);
  });

  it("falls back to the usual arrangement where a style has no place", () => {
    // 17.5 m is too small for a pinwheel.
    expect(planDividers(hall, hallDoors, { style: "pinwheel" })).toEqual(
      planDividers(hall, hallDoors),
    );
    // A long narrow room has breadth for wing walls only.
    const gallery = rect(9, 5);
    const doors = [door(gallery, "west", 2), door(gallery, "east", 2)];
    expect(planDividers(gallery, doors, { style: "rows" })).toEqual(planDividers(gallery, doors));
    expect(dividerStyles(gallery, doors)).toEqual(["bays", "staggered"]);
    expect(planDividers(hall, hallDoors, { style: "open" })).toEqual([]);
    expect(planDividers(rect(6, 6), [], { style: "bays" })).toEqual([]);
  });

  it("tells wing walls from rows from a room with neither", () => {
    expect(arrangementOf(hall, planDividers(hall, hallDoors))).toEqual({ kind: "rows", axis: "x" });
    expect(arrangementOf(hall, planDividers(hall, hallDoors, { style: "staggered" }))).toEqual({
      kind: "wings",
      axis: "x",
    });
    expect(arrangementOf(hall, [])).toEqual({ kind: "none" });
  });

  it("keeps every wall of every style out of every door's line of sight", () => {
    const rooms: Array<[CellRect, PlanDoor[]]> = [
      [hall, hallDoors],
      [rect(7, 11), [door(rect(7, 11), "north", 3, 2.4), door(rect(7, 11), "east", 5, 3.5)]],
      [rect(22, 7), [door(rect(22, 7), "west", 3, 2.4), door(rect(22, 7), "south", 5, 2.4)]],
      [rect(9, 5), [door(rect(9, 5), "west", 2), door(rect(9, 5), "north", 4)]],
      [rect(8, 9), [door(rect(8, 9), "north", 3), door(rect(8, 9), "west", 4)]],
    ];
    const inSight: string[] = [];
    for (const [r, doors] of rooms) {
      for (const style of dividerStyles(r, doors)) {
        for (const d of planDividers(r, doors, { style })) {
          for (const dr of doors) {
            if (overlap(dividerRect(d), doorStrip(r, dr, 0.05))) {
              inSight.push(`${r.xMax + 1}x${r.zMax + 1} ${style} ${dr.side}`);
            }
          }
        }
      }
    }
    expect(inSight).toEqual([]);
  });
});

describe("door screens", () => {
  const room = rect(7, 7);
  const east = door(room, "east", 3, 2.4);
  const south = door(room, "south", 3, 2.4);

  it("stands a 5 m screen a cell in front of the door, its back to it", () => {
    expect(planDividers(room, [east, south], { style: "open", screens: [east] })).toEqual([
      // East wall on line 7: the screen on line 6, the door's centre
      // (3.5) in its middle, the face toward the door bare.
      { axis: "z", line: 6, start: 2.5, end: 4.5, bare: "high" },
    ]);
    expect(planDividers(room, [east, south], { style: "open", screens: [south] })).toEqual([
      { axis: "x", line: 6, start: 2.5, end: 4.5, bare: "high" },
    ]);
    const west = door(room, "west", 3, 2.4);
    expect(planDividers(room, [west], { style: "open", screens: [west] })).toEqual([
      { axis: "z", line: 1, start: 2.5, end: 4.5, bare: "low" },
    ]);
  });

  it("is 2.5 m in front of a narrow door in a short wall", () => {
    const small = rect(5, 5);
    const d = door(small, "east", 2);
    expect(planDividers(small, [d], { screens: [d] })).toEqual([
      { axis: "z", line: 4, start: 2, end: 3, bare: "high" },
    ]);
  });

  it("leaves a portal open, and a door into a shallow room", () => {
    const portal = door(room, "north", 3, PORTAL_WIDTH);
    expect(planDividers(room, [portal], { style: "open", screens: [portal] })).toEqual([]);
    // 10 m from the door to the wall opposite: no room behind a screen.
    const shallow = rect(7, 4);
    const d = door(shallow, "north", 3);
    expect(planDividers(shallow, [d], { style: "open", screens: [d] })).toEqual([]);
    // A door a cell from the corner: no way round one end.
    const corner = door(room, "north", 0);
    expect(planDividers(room, [corner], { style: "open", screens: [corner] })).toEqual([]);
  });

  it("stands no screen across another door's way in", () => {
    // Two doors side by side in one wall: a screen for one would stand
    // in front of the other.
    const a = door(room, "north", 2, 2.4);
    const b = door(room, "north", 3, 2.4);
    expect(planDividers(room, [a, b], { style: "open", screens: [a] })).toEqual([]);
    // The door opposite looks at the screen's picture: that is allowed.
    const facing = door(room, "south", 2, 2.4);
    expect(planDividers(room, [a, facing], { style: "open", screens: [a] })).toHaveLength(1);
  });

  it("lets a row run on past a screened door, and keeps the rows clear of the screen", () => {
    const hall = rect(11, 7);
    const west = door(hall, "west", 3, 2.4);
    const eastDoor = door(hall, "east", 3, 2.4);
    const north = door(hall, "north", 5, 2.4);
    const open = planDividers(hall, [west, eastDoor, north]);
    const screened = planDividers(hall, [west, eastDoor, north], { screens: [north] });
    // Open, the north door looks across the hall and both rows stop for
    // it. Screened, the far row is one panel through the middle, and the
    // near row keeps two cells' width of floor to the screen.
    expect(open.filter((d) => d.line === 5)).toHaveLength(2);
    expect(screened.filter((d) => d.line === 5)).toEqual([
      { axis: "x", line: 5, start: 4, end: 7 },
    ]);
    const screen = screened[screened.length - 1];
    expect(screen).toEqual({ axis: "x", line: 1, start: 4.5, end: 6.5, bare: "low" });
    for (const d of screened.filter((o) => o.line === 2)) {
      expect(d.end <= screen.start - 1 || d.start >= screen.end + 1).toBe(true);
    }
    // A screen at an end door: the rows start two cells behind it.
    const ended = planDividers(hall, [west, eastDoor], { screens: [west] });
    expect(Math.min(...ended.filter((d) => !d.bare).map((d) => d.start))).toBeGreaterThanOrEqual(3);
  });

  it("builds no wing wall beside a screen on its own side of the room", () => {
    const hall = rect(11, 7);
    const doors = [door(hall, "west", 3, 2.4), door(hall, "east", 3, 2.4)];
    const north = door(hall, "north", 5, 2.4);
    const dividers = planDividers(hall, [...doors, north], {
      style: "staggered",
      screens: [north],
    });
    const wingWalls = dividers.filter((d) => !d.bare);
    expect(wingWalls.length).toBeGreaterThan(0);
    // All from the south wall: the north side belongs to the screen.
    expect(wingWalls.every((d) => d.end === 7)).toBe(true);
  });

  it("seats no bench within a metre of a screen", () => {
    const d = door(room, "east", 3, 2.4);
    const dividers = planDividers(room, [d], { style: "open", screens: [d] });
    const benches = planBenches(room, [d], dividers);
    expect(benches.length).toBeGreaterThan(0);
    for (const bench of benches) expect(benchClearOf(bench, dividers, 1)).toBe(true);
    expect(benchClearOf({ x: 14, z: 8.75, along: "z" }, dividers, 1)).toBe(false);
  });
});

describe("planBenches", () => {
  it("puts one bench in each bay of a long room, beside the passage", () => {
    const r = rect(9, 5);
    const doors = [door(r, "west", 2), door(r, "east", 2)];
    const benches = planBenches(r, doors, planDividers(r, doors));
    expect(benches).toHaveLength(3);
    expect(benches.map((b) => b.x)).toEqual([3.75, 11.25, 18.75]);
    expect(benches.every((b) => b.along === "x")).toBe(true);
    // Alternate sides of the passage, bay by bay.
    const mid = 6.25;
    expect(benches.map((b) => Math.sign(b.z - mid))).toEqual([-1, 1, -1]);
  });

  it("leaves a bay empty when a door opens into it", () => {
    const r = rect(9, 5);
    const doors = [door(r, "west", 2), door(r, "north", 4, PORTAL_WIDTH)];
    const benches = planBenches(r, doors, planDividers(r, doors));
    expect(benches.map((b) => b.x)).toEqual([3.75, 18.75]);
  });

  it("faces two benches at the panels of a hall, the walking line between them", () => {
    const r = rect(7, 7);
    const doors = [door(r, "west", 3), door(r, "east", 3), door(r, "north", 3)];
    const benches = planBenches(r, doors, planDividers(r, doors));
    expect(benches).toHaveLength(2);
    // Level with the middle of a panel, mirrored about the axis.
    expect(benches.map((b) => b.x)).toEqual([12.5, 12.5]);
    expect(benches[0].z + benches[1].z).toBeCloseTo(17.5, 9);
    expect(benches[1].z - benches[0].z).toBeGreaterThan(DOOR_WIDTH + BENCH_DEPTH);
  });

  it("makes an island of two back to back in a large room, off the door lines", () => {
    const r = rect(6, 7);
    const doors = [
      door(r, "north", 2),
      door(r, "south", 2),
      door(r, "west", 3),
      door(r, "east", 3),
    ];
    const benches = planBenches(r, doors, []);
    expect(benches).toHaveLength(2);
    const [a, b] = benches.map(benchRect);
    // Long sides together.
    expect(a.zMin).toBeCloseTo(b.zMin, 9);
    expect(b.xMin - a.xMax).toBeCloseTo(0.02, 9);
    for (const d of doors) {
      expect(overlap(a, doorStrip(r, d, 0.5))).toBe(false);
      expect(overlap(b, doorStrip(r, d, 0.5))).toBe(false);
    }
  });

  it("stands the island in the middle when no door looks at it", () => {
    const r = rect(6, 6);
    const [a, b] = planBenches(r, [], []);
    // A square room runs east–west: the benches lie along x, side by
    // side across z.
    expect(a.x).toBeCloseTo(7.5, 9);
    expect((a.z + b.z) / 2).toBeCloseTo(7.5, 9);
  });

  it("mirrors an island each side of the axis it is told", () => {
    const r = rect(9, 7);
    const doors = [
      door(r, "north", 4, PORTAL_WIDTH),
      door(r, "south", 4, PORTAL_WIDTH),
      door(r, "west", 3),
      door(r, "east", 3),
    ];
    const benches = planBenches(r, doors, [], "z");
    expect(benches).toHaveLength(4);
    const xs = benches.map((b) => b.x - 11.25).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-xs[3], 9);
    expect(xs[1]).toBeCloseTo(-xs[2], 9);
    // North of the east–west door line: the wall a visitor faces.
    expect(benches.every((b) => b.z < 8.75 - DOOR_WIDTH / 2 - BENCH_LENGTH / 2)).toBe(true);
  });

  it("gives a small room none", () => {
    expect(planBenches(rect(5, 5), [], [])).toEqual([]);
  });
});

describe("the museum's rooms as fitted", () => {
  const rooms = [
    { key: "grand-hall", rect: GRAND_HALL },
    ...SLOT_STAGES.flat().map((slot) => ({ key: slot.id, rect: slot.rect })),
  ];

  it("leaves every room at least one cell of passage past each divider line", () => {
    for (const { key, rect: r } of rooms) {
      const { dividers } = fittingsFor(key);
      const byLine = new Map<string, Divider[]>();
      for (const d of dividers) {
        const id = `${d.axis}:${d.line}`;
        byLine.set(id, [...(byLine.get(id) ?? []), d]);
      }
      for (const [id, onLine] of byLine) {
        const span = onLine[0].axis === "x" ? r.xMax - r.xMin + 1 : r.zMax - r.zMin + 1;
        const built = onLine.reduce((n, d) => n + d.end - d.start, 0);
        expect(span - built, `${key} ${id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps dividers and benches inside their room and off each other", () => {
    for (const { key, rect: r } of rooms) {
      const { dividers, benches } = fittingsFor(key);
      const room: Rect = {
        xMin: r.xMin * CELL_SIZE,
        xMax: (r.xMax + 1) * CELL_SIZE,
        zMin: r.zMin * CELL_SIZE,
        zMax: (r.zMax + 1) * CELL_SIZE,
      };
      const walls = dividers.map(dividerRect);
      const seats = benches.map(benchRect);
      for (const b of seats) {
        expect(b.xMin, key).toBeGreaterThan(room.xMin + 1);
        expect(b.xMax, key).toBeLessThan(room.xMax - 1);
        expect(b.zMin, key).toBeGreaterThan(room.zMin + 1);
        expect(b.zMax, key).toBeLessThan(room.zMax - 1);
        for (const w of walls) {
          const grown = { xMin: w.xMin - 1, xMax: w.xMax + 1, zMin: w.zMin - 1, zMax: w.zMax + 1 };
          expect(overlap(b, grown), `${key}: bench within 1 m of a divider`).toBe(false);
        }
      }
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          expect(overlap(seats[i], seats[j]), key).toBe(false);
        }
      }
    }
  });

  it("gives the Grand Hall benches and no walls", () => {
    const hall = fittingsFor("grand-hall");
    expect(hall.dividers).toEqual([]);
    expect(hall.benches).toHaveLength(4);
    expect(hall.ceilingHeight).toBe(5.7);
  });

  it("fits the stairwell with nothing", () => {
    expect(STAIR.xMax - STAIR.xMin).toBe(8);
    expect(fittingsFor("stairwell")).toEqual({
      ceilingHeight: 4.8,
      dividers: [],
      benches: [],
      portals: 0,
    });
  });
});

describe("writeDividerEdges", () => {
  const grid = { x: 6, z: 5 };

  it("blocks the cell edges a divider stands on, and no others", () => {
    const ew = new Uint8Array((grid.x - 1) * grid.z);
    const ns = new Uint8Array(grid.x * (grid.z - 1));
    writeDividerEdges(
      [
        { axis: "x", line: 2, start: 1, end: 3 },
        { axis: "z", line: 4, start: 0, end: 2 },
      ],
      grid,
      ew,
      ns,
    );
    // Along x on z line 2: between rows 1 and 2, columns 1 and 2.
    const blockedNS = [...ns].flatMap((v, i) => (v ? [i] : []));
    expect(blockedNS).toEqual([1 * grid.x + 1, 1 * grid.x + 2]);
    // Along z on x line 4: between columns 3 and 4, rows 0 and 1.
    const blockedEW = [...ew].flatMap((v, i) => (v ? [i] : []));
    expect(blockedEW).toEqual([0 * (grid.x - 1) + 3, 1 * (grid.x - 1) + 3]);
  });

  it("blocks whole cells only under a screen that ends on half lines", () => {
    const ew = new Uint8Array((grid.x - 1) * grid.z);
    const ns = new Uint8Array(grid.x * (grid.z - 1));
    writeDividerEdges([{ axis: "x", line: 2, start: 1.5, end: 3.5, bare: "low" }], grid, ew, ns);
    // Columns 1.5 to 3.5: only column 2 lies wholly under the wall.
    expect([...ns].flatMap((v, i) => (v ? [i] : []))).toEqual([1 * grid.x + 2]);
    expect([...ew].every((v) => v === 0)).toBe(true);
  });

  it("ignores a line on the edge of the grid", () => {
    const ew = new Uint8Array((grid.x - 1) * grid.z);
    const ns = new Uint8Array(grid.x * (grid.z - 1));
    writeDividerEdges([{ axis: "x", line: 0, start: 0, end: 6 }], grid, ew, ns);
    expect([...ew, ...ns].every((v) => v === 0)).toBe(true);
  });
});

describe("clearOfFittings", () => {
  const bench: Bench = { x: 10, z: 10, along: "x" };
  const divider: Divider = { axis: "z", line: 2, start: 0, end: 2 };
  const floor = { rooms: [{ cellBounds: rect(8, 8), dividers: [divider], benches: [bench] }] };
  const RADIUS = 0.3;

  it("stops a body at a bench's edge, though the bench is smaller than a cell", () => {
    // The bench reaches 1 m along x and 0.3 m along z from its centre.
    expect(clearOfFittings(floor, 11.31, 10, RADIUS)).toBe(true);
    expect(clearOfFittings(floor, 11.29, 10, RADIUS)).toBe(false);
    expect(clearOfFittings(floor, 10, 10.61, RADIUS)).toBe(true);
    expect(clearOfFittings(floor, 10, 10.59, RADIUS)).toBe(false);
    expect(clearOfFittings(floor, 10, 10, RADIUS)).toBe(false);
  });

  it("rounds a bench's corner", () => {
    // 0.25 m out from the corner on both axes: 0.35 m away, clear.
    expect(clearOfFittings(floor, 11.25, 10.55, RADIUS)).toBe(true);
    expect(clearOfFittings(floor, 11.2, 10.5, RADIUS)).toBe(false);
  });

  it("stops a body at a divider's face, 0.2 m off its grid line", () => {
    expect(clearOfFittings(floor, 5 + 0.2 + 0.31, 2, RADIUS)).toBe(true);
    expect(clearOfFittings(floor, 5 + 0.2 + 0.29, 2, RADIUS)).toBe(false);
    // Past its free end the line is open.
    expect(clearOfFittings(floor, 5, 5 + 0.31, RADIUS)).toBe(true);
  });

  it("ignores rooms the body is nowhere near", () => {
    expect(clearOfFittings(floor, 100, 100, RADIUS)).toBe(true);
  });

  it("lets a body over the benches through, and still stops it at a divider", () => {
    expect(clearOfFittings(floor, 10, 10, RADIUS, true)).toBe(true);
    expect(clearOfFittings(floor, 11.29, 10, RADIUS, true)).toBe(true);
    expect(clearOfFittings(floor, 5 + 0.2 + 0.29, 2, RADIUS, true)).toBe(false);
  });
});

describe("standing on a bench", () => {
  const bench: Bench = { x: 10, z: 10, along: "x" };
  const divider: Divider = { axis: "z", line: 2, start: 0, end: 2 };
  const floor = { rooms: [{ cellBounds: rect(8, 8), dividers: [divider], benches: [bench] }] };
  const RADIUS = 0.3;

  it("takes a jump to get over the seat, and a jump is enough", () => {
    expect(clearsBenches(0)).toBe(false);
    // A step is not a jump.
    expect(clearsBenches(0.32)).toBe(false);
    expect(clearsBenches(BENCH_HEIGHT)).toBe(true);
    // The top of a jump: 6 m/s against 22 m/s².
    expect(clearsBenches(6 ** 2 / (2 * 22))).toBe(true);
  });

  it("carries a body that overlaps the bench at all", () => {
    expect(benchUnder(floor, 10, 10, RADIUS)).toBe(true);
    expect(benchUnder(floor, 11.29, 10, RADIUS)).toBe(true);
    expect(benchUnder(floor, 11.31, 10, RADIUS)).toBe(false);
    expect(benchUnder(floor, 10, 10.61, RADIUS)).toBe(false);
    expect(benchUnder(floor, 100, 100, RADIUS)).toBe(false);
  });

  it("is not carried by a divider", () => {
    expect(benchUnder(floor, 5, 2, RADIUS)).toBe(false);
  });

  it("carries a body wherever a bench would stop it on the floor", () => {
    // Where the seat ends under the feet, the floor has to be free to
    // land on. Otherwise a body walking off a bench drops into it.
    for (let x = 8.5; x <= 11.5; x += 0.01) {
      for (const z of [9.5, 9.75, 10, 10.25, 10.5]) {
        if (!benchUnder(floor, x, z, RADIUS)) {
          expect(clearOfFittings(floor, x, z, RADIUS), `${x}, ${z}`).toBe(true);
        }
      }
    }
  });
});

describe("arrivalPoint", () => {
  it("is the room's centre when nothing stands there", () => {
    expect(arrivalPoint({ cellBounds: rect(6, 6), dividers: [], benches: [] })).toEqual({
      x: 7.5,
      z: 7.5,
    });
  });

  it("moves off a bench that stands on the centre", () => {
    const r = rect(6, 6);
    const benches = planBenches(r, [], []);
    const p = arrivalPoint({ cellBounds: r, dividers: [], benches });
    expect(p).not.toEqual({ x: 7.5, z: 7.5 });
    expect(
      clearOfFittings({ rooms: [{ cellBounds: r, dividers: [], benches }] }, p.x, p.z, 0.3),
    ).toBe(true);
    expect(Math.hypot(p.x - 7.5, p.z - 7.5)).toBeLessThan(2.5);
  });

  it("lands clear of every fitting in every room of the plan", () => {
    for (const slot of [{ id: "grand-hall", rect: GRAND_HALL }, ...SLOT_STAGES.flat()]) {
      const fittings = fittingsFor(slot.id);
      const room = { cellBounds: slot.rect, ...fittings };
      const p = arrivalPoint(room);
      expect(clearOfFittings({ rooms: [room] }, p.x, p.z, 0.3), slot.id).toBe(true);
    }
  });
});
