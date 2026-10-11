import { describe, expect, it } from "vitest";
import {
  arrivalPoint,
  BENCH_DEPTH,
  BENCH_HEIGHT,
  BENCH_LENGTH,
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
