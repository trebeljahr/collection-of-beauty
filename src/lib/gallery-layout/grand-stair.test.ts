import { describe, expect, it } from "vitest";
import {
  buildGrandStair,
  GRAND_RISERS,
  GRAND_STEP_UP,
  type GrandStair,
  type GrandStairDesign,
  grandFloorFor,
  grandHallArrival,
  grandMoveAllowed,
  grandStairsAt,
  grandSurfaceAt,
  grandSurfacesAt,
  IMPERIAL,
  inOpening,
  LOGGIA,
  loggiaShift,
  openingInWorld,
  openingReach,
  STAIR_HEADROOM,
  sheerSide,
  sheerStripDepth,
  toStairLocal,
  toStairWorld,
} from "./grand-stair";
import { FLOOR_SEPARATION } from "./world-coords";

/** The three stairs that stand in the middle of a hall of their own. A
 *  loggia and a court are halls made of them, tested further down. */
const DESIGNS = ["imperial", "arcs", "hourglass"] as const;
const CX = 100;
const CZ = 50;
const HALF = 11.25;

/** A hall of `floors` storeys with one design stacked through it. */
function hall(
  design: GrandStairDesign,
  turns: GrandStair["turns"] = 0,
  floors = 4,
  half = HALF,
  back = half,
): GrandStair[] {
  return Array.from({ length: floors - 1 }, (_, i) =>
    buildGrandStair({
      id: `${design}-${i}`,
      design,
      lowerFloor: i,
      upperFloor: i + 1,
      topFloor: i + 1,
      lowerLabel: "",
      upperLabel: "",
      lowerY: i * FLOOR_SEPARATION,
      upperY: (i + 1) * FLOOR_SEPARATION,
      centerX: CX,
      centerZ: CZ,
      half,
      back,
      turns,
      hasFlightBelow: i > 0,
      hasFlightAbove: i < floors - 2,
    }),
  );
}

/** A point of the hall's frame, in the world. */
const at = (stairs: GrandStair[], x: number, z: number) => toStairWorld(stairs[0], x, z);

/**
 * Every height a visitor can come to stand at over each point of the
 * hall, walking from `start` in steps of a quarter metre, never dropping
 * more than half a metre.
 */
function walkFrom(
  stairs: GrandStair[],
  start: { x: number; z: number },
  startY: number,
  half = HALF,
  back = half,
) {
  const step = 0.25;
  const key = (ix: number, iz: number, y: number) => `${ix}:${iz}:${y.toFixed(2)}`;
  const seen = new Set<string>();
  const reached: Array<{ x: number; z: number; y: number; floorIndex: number | null }> = [];
  const queue: Array<[number, number, number]> = [[0, 0, startY]];
  seen.add(key(0, 0, startY));
  while (queue.length > 0) {
    const [ix, iz, y] = queue.pop()!;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = start.x + (ix + dx) * step;
      const z = start.z + (iz + dz) * step;
      // Inside the hall's walls. The stair rises north (turns 0), so the
      // end wall is at `back` toward -z.
      if (Math.abs(x - CX) > half - 0.3 || z - CZ > half - 0.3 || CZ - z > back - 0.3) continue;
      const surface = grandSurfaceAt(stairs, x, z, y);
      if (!surface || surface.y < y - 0.5) continue;
      const k = key(ix + dx, iz + dz, surface.y);
      if (seen.has(k)) continue;
      seen.add(k);
      reached.push({ x, z, y: surface.y, floorIndex: surface.floorIndex });
      queue.push([ix + dx, iz + dz, surface.y]);
    }
  }
  return reached;
}

describe("the hall's frame", () => {
  it("turns a design to face its door and back", () => {
    for (const turns of [0, 1, 2, 3] as const) {
      const stair = { centerX: CX, centerZ: CZ, turns };
      const world = toStairWorld(stair, 3, -7);
      const back = toStairLocal(stair, world.x, world.z);
      expect(back.x).toBeCloseTo(3, 9);
      expect(back.z).toBeCloseTo(-7, 9);
    }
    // The first flight rises toward -z in its own frame: north unturned,
    // east after one quarter turn, west after three.
    expect(toStairWorld({ centerX: 0, centerZ: 0, turns: 0 }, 0, -1)).toEqual({ x: 0, z: -1 });
    expect(toStairWorld({ centerX: 0, centerZ: 0, turns: 1 }, 0, -1)).toEqual({ x: 1, z: 0 });
    expect(toStairWorld({ centerX: 0, centerZ: 0, turns: 3 }, 0, -1)).toEqual({ x: -1, z: 0 });
  });

  it("turns the opening with it", () => {
    const [stair] = hall("imperial", 1);
    const o = openingInWorld(stair);
    expect(o.kind).toBe("rects");
    if (o.kind !== "rects") return;
    // Unturned it reaches from z -8 to 1.8; a quarter turn puts that
    // along x, the far end to the east.
    const [r] = o.rects;
    expect(r.xMin).toBeCloseTo(CX - IMPERIAL.south, 9);
    expect(r.xMax).toBeCloseTo(CX - IMPERIAL.north, 9);
    expect(r.zMin).toBeCloseTo(CZ - IMPERIAL.half, 9);
    expect(r.zMax).toBeCloseTo(CZ + IMPERIAL.half, 9);
    // Its outline turns with it, and stays on the rectangle's edge.
    for (const [x, z] of o.outline) {
      const onX = Math.abs(x - r.xMin) < 1e-9 || Math.abs(x - r.xMax) < 1e-9;
      const onZ = Math.abs(z - r.zMin) < 1e-9 || Math.abs(z - r.zMax) < 1e-9;
      expect(onX || onZ).toBe(true);
    }
  });
});

describe.each(DESIGNS)("the %s stair", (design) => {
  const stairs = hall(design);
  // The three tests below read one walk of the hall, made by whichever of
  // them runs first. Each used to make its own: about a second apiece.
  let walked: ReturnType<typeof walkFrom> | undefined;
  const walk = () => {
    walked ??= walkFrom(stairs, grandHallArrival(stairs[0]), 0);
    return walked;
  };

  it("is walked from the hall's door to every floor above", () => {
    const reached = walk();
    for (let floor = 1; floor < 4; floor++) {
      expect(
        reached.some((p) => p.floorIndex === floor),
        `floor ${floor}`,
      ).toBe(true);
    }
  });

  it("brings the visitor out by the door on each floor", () => {
    // From the head of one stair to the foot of the next is a walk round
    // the gallery: the spot inside the door is reached on every floor.
    const start = grandHallArrival(stairs[0]);
    const reached = walk();
    for (let floor = 1; floor < 4; floor++) {
      const y = floor * FLOOR_SEPARATION;
      expect(
        reached.some(
          (p) =>
            Math.abs(p.y - y) < 1e-6 &&
            Math.abs(p.x - start.x) < 0.3 &&
            Math.abs(p.z - start.z) < 0.3,
        ),
        `floor ${floor}`,
      ).toBe(true);
    }
  });

  it("never asks for more than a step", () => {
    // Along every walk the next surface is within a step up. The walk
    // itself refuses more; this checks the flights are not walls.
    const reached = walk();
    const heights = new Set(reached.map((p) => p.y.toFixed(3)));
    const riser = FLOOR_SEPARATION / GRAND_RISERS;
    expect(riser).toBeLessThan(GRAND_STEP_UP);
    // Every tread of every storey is stood on.
    expect(heights.size).toBeGreaterThanOrEqual(GRAND_RISERS * 3);
  });

  it("has a floor inside the door on every storey and none over the well", () => {
    const door = grandHallArrival(stairs[0]);
    for (let floor = 0; floor < 4; floor++) {
      const y = floor * FLOOR_SEPARATION;
      expect(grandSurfaceAt(stairs, door.x, door.z, y)?.floorIndex).toBe(floor);
    }
    // A point inside every design's opening and clear of its flights at
    // gallery height: beside the waist of the hourglass, in the well of
    // the arcs, between the imperial stair's flights.
    const voidPoint = { imperial: [3.6, -2], arcs: [0, 0], hourglass: [3.6, 0] }[design];
    const p = at(stairs, voidPoint[0], voidPoint[1]);
    for (let floor = 1; floor < 4; floor++) {
      const y = floor * FLOOR_SEPARATION;
      const levels = grandSurfacesAt(stairs, p.x, p.z).filter((s) => s.floorIndex !== null);
      expect(levels.map((s) => s.floorIndex)).toEqual([0]);
      // From the gallery a step into it is refused.
      expect(grandMoveAllowed(stairs, door.x, door.z, p.x, p.z, y)).toBe(false);
    }
  });

  it("keeps its balustrades to the hall and gives each a length", () => {
    for (const stair of stairs) {
      expect(stair.rails.length).toBeGreaterThan(4);
      // Each limit is asserted once for the stair, on the rail nearest to
      // it. A NaN is kept once met, so it fails its limit.
      let shortest = Infinity;
      let shortestAt = -1;
      let furthest = -Infinity;
      let furthestAt = -1;
      let under = Infinity;
      let underAt = -1;
      let over = -Infinity;
      let overAt = -1;
      stair.rails.forEach((r, i) => {
        const length = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
        if (length < shortest || Number.isNaN(length)) {
          shortest = length;
          shortestAt = i;
        }
        const out = Math.max(Math.abs(r.x0), Math.abs(r.z0), Math.abs(r.x1), Math.abs(r.z1));
        if (out > furthest || Number.isNaN(out)) {
          furthest = out;
          furthestAt = i;
        }
        const low = Math.min(r.y0, r.y1) - (stair.lowerY - 1e-9);
        if (low < under || Number.isNaN(low)) {
          under = low;
          underAt = i;
        }
        const high = Math.max(r.y0, r.y1) - (stair.upperY + 1e-9);
        if (high > over || Number.isNaN(high)) {
          over = high;
          overAt = i;
        }
      });
      const rail = (i: number) => `${stair.id} rail ${i}`;
      expect(shortest, rail(shortestAt)).toBeGreaterThan(0.05);
      expect(furthest, rail(furthestAt)).toBeLessThan(HALF);
      expect(under, `${rail(underAt)}, over its own floor`).toBeGreaterThanOrEqual(0);
      expect(over, `${rail(overAt)}, over the floor above`).toBeLessThanOrEqual(0);
    }
  });

  it("leaves a gallery at least 3 m wide inside every wall of the floor above", () => {
    const [stair] = stairs;
    expect(HALF - openingReach(stair.opening)).toBeGreaterThanOrEqual(3);
  });
});

describe("the imperial stair", () => {
  const stairs = hall("imperial");
  const mid = FLOOR_SEPARATION / 2;

  it("climbs the middle flight to the half landing and the side flights to the floor", () => {
    const up = (x: number, z: number, feet: number) => {
      const p = at(stairs, x, z);
      return grandSurfaceAt(stairs, p.x, p.z, feet);
    };
    // Foot of the middle flight: the first tread.
    expect(up(0, IMPERIAL.south - 0.1, 0)?.y).toBeCloseTo(FLOOR_SEPARATION / GRAND_RISERS, 6);
    // Its head, and the landing behind it.
    expect(up(0, IMPERIAL.north + IMPERIAL.landingDepth + 0.05, mid)?.y).toBeCloseTo(mid, 6);
    expect(up(-6, IMPERIAL.north + 1, mid)?.y).toBeCloseTo(mid, 6);
    // A side flight ends level with the floor above.
    const head = up(-6.5, IMPERIAL.south - 0.05, FLOOR_SEPARATION);
    expect(head?.y).toBeCloseTo(FLOOR_SEPARATION, 6);
    expect(head?.stair?.id).toBe("imperial-0");
  });

  it("can be walked under where there is headroom, and nowhere else", () => {
    const ground = (x: number, z: number) => {
      const p = at(stairs, x, z);
      return grandSurfaceAt(stairs, p.x, p.z, 0);
    };
    // Under the half landing, on the way to the hall's far door.
    expect(mid - 0.3).toBeGreaterThan(STAIR_HEADROOM);
    expect(ground(4, IMPERIAL.north + 1)?.floorIndex).toBe(0);
    // Under a side flight.
    expect(ground(-6.5, 0)?.floorIndex).toBe(0);
    // The middle flight is masonry: half way up it there is no floor,
    // and its tread is out of reach from the ground.
    expect(ground(0, -2)).toBeNull();
  });

  it("starts the next storey's flight from the edge of the opening", () => {
    const y = FLOOR_SEPARATION;
    const p = at(stairs, 0, IMPERIAL.south - 0.1);
    const s = grandSurfaceAt(stairs, p.x, p.z, y);
    expect(s?.stair?.id).toBe("imperial-1");
    expect(s?.y).toBeCloseTo(y + FLOOR_SEPARATION / GRAND_RISERS, 6);
    // Under it the first storey's middle flight is still there, a
    // storey down, for whoever is on it.
    expect(grandSurfaceAt(stairs, p.x, p.z, 0.2)?.stair?.id).toBe("imperial-0");
  });
});

describe("the arcs", () => {
  const stairs = hall("arcs");

  it("opens a rotunda inside the flights on the hall floor only", () => {
    const centre = at(stairs, 0, 0);
    expect(grandSurfaceAt(stairs, centre.x, centre.z, 0)?.floorIndex).toBe(0);
    expect(grandSurfaceAt(stairs, centre.x, centre.z, FLOOR_SEPARATION)?.floorIndex).toBe(0);
    // The way in is level, between the feet of the two flights.
    const gate = at(stairs, 0, 6);
    expect(grandSurfaceAt(stairs, gate.x, gate.z, 0)?.y).toBe(0);
  });

  it("rises along both arms and meets on the far side", () => {
    const riser = FLOOR_SEPARATION / GRAND_RISERS;
    for (const side of [-1, 1]) {
      // A quarter of the way round, east or west.
      const p = at(stairs, side * 6.2, 0);
      const s = grandSurfaceAt(stairs, p.x, p.z, FLOOR_SEPARATION / 2);
      expect(s?.y).toBeGreaterThan(FLOOR_SEPARATION / 2 - 2 * riser);
      expect(s?.y).toBeLessThanOrEqual(FLOOR_SEPARATION / 2 + riser);
    }
    const far = at(stairs, 0, -6.2);
    expect(grandSurfaceAt(stairs, far.x, far.z, FLOOR_SEPARATION)?.y).toBeCloseTo(
      FLOOR_SEPARATION,
      6,
    );
  });
});

describe("which floor a visitor in a hall is on", () => {
  const stairs = hall("imperial");
  it("changes past the half-way point, not on it", () => {
    const mid = FLOOR_SEPARATION / 2;
    expect(grandFloorFor(stairs, mid, 0)).toBe(0);
    expect(grandFloorFor(stairs, mid, 1)).toBe(1);
    expect(grandFloorFor(stairs, mid + 0.5, 0)).toBe(1);
    expect(grandFloorFor(stairs, mid - 0.5, 1)).toBe(0);
    expect(grandFloorFor(stairs, 2 * FLOOR_SEPARATION, 0)).toBe(2);
  });

  it("finds a hall by the point, and none outside", () => {
    expect(grandStairsAt(stairs, CX, CZ)).toHaveLength(3);
    expect(grandStairsAt(stairs, CX + HALF + 0.5, CZ)).toHaveLength(0);
    // Outside every hall the ordinary floor rules decide.
    expect(grandMoveAllowed(stairs, 0, 0, 1, 1, 0)).toBe(true);
  });
});

describe.each(DESIGNS)("the %s stair alone in a hall open to the roof", (design) => {
  // One stair from the second floor to the third, in a hall whose void
  // goes on up through the fourth.
  const stair = buildGrandStair({
    id: `${design}-atrium`,
    design,
    lowerFloor: 1,
    upperFloor: 2,
    topFloor: 3,
    lowerLabel: "",
    upperLabel: "",
    lowerY: FLOOR_SEPARATION,
    upperY: 2 * FLOOR_SEPARATION,
    centerX: CX,
    centerZ: CZ,
    half: 13.75,
    turns: 0,
    hasFlightBelow: false,
    hasFlightAbove: false,
  });
  const door = grandHallArrival(stair);

  it("has a balcony round the same opening on the floor above the stair's head", () => {
    const top = 3 * FLOOR_SEPARATION;
    expect(grandSurfaceAt([stair], door.x, door.z, top)?.floorIndex).toBe(3);
    const voidPoint = { imperial: [3.6, -2], arcs: [0, 0], hourglass: [3.6, 0] }[design];
    const p = toStairWorld(stair, voidPoint[0], voidPoint[1]);
    expect(grandMoveAllowed([stair], door.x, door.z, p.x, p.z, top)).toBe(false);
    // The balcony is fenced all the way round.
    const fenced = stair.rails.filter((r) => r.y0 === top && r.y1 === top);
    const length = fenced.reduce((sum, r) => sum + Math.hypot(r.x1 - r.x0, r.z1 - r.z0), 0);
    const o = stair.opening;
    const round =
      o.kind === "disc"
        ? 2 * Math.PI * o.r
        : o.outline.reduce((sum, [x, z], i) => {
            const [nx, nz] = o.outline[(i + 1) % o.outline.length];
            return sum + Math.hypot(nx - x, nz - z);
          }, 0);
    expect(length / round).toBeGreaterThan(0.98);
    expect(grandFloorFor([stair], top, 2)).toBe(3);
  });

  it("is not a hall for a visitor in the room under it", () => {
    expect(grandStairsAt([stair], CX, CZ, 0)).toHaveLength(0);
    expect(grandStairsAt([stair], CX, CZ, FLOOR_SEPARATION)).toHaveLength(1);
    // Down there the ordinary floor rules decide every move.
    expect(grandMoveAllowed([stair], CX, CZ, CX + 1, CZ, 0)).toBe(true);
  });

  it("leaves 5 m or more of floor inside every wall", () => {
    expect(stair.half - openingReach(stair.opening)).toBeGreaterThanOrEqual(5);
  });

  it("is open over more than its stair, and still lands its flights on floor", () => {
    const o = stair.opening;
    if (o.kind === "disc") return;
    // The hall floor in front of the first flight is under the void.
    const before = { imperial: [0, 5], hourglass: [7, 0] }[design as "imperial" | "hourglass"];
    const p = toStairWorld(stair, before[0], before[1]);
    const upper = 2 * FLOOR_SEPARATION;
    expect(grandSurfaceAt([stair], p.x, p.z, FLOOR_SEPARATION)?.floorIndex).toBe(1);
    expect(grandSurfacesAt([stair], p.x, p.z).some((s) => s.floorIndex === 2)).toBe(false);
    // A walk from the door still reaches the floor above and comes back
    // round to the door on it.
    const reached = walkFrom([stair], door, FLOOR_SEPARATION, stair.half);
    expect(
      reached.some(
        (q) =>
          Math.abs(q.y - upper) < 1e-6 &&
          Math.abs(q.x - door.x) < 0.3 &&
          Math.abs(q.z - door.z) < 0.3,
      ),
    ).toBe(true);
  });
});

describe("an imperial stair in a hall with a sheer wall", () => {
  const stair = buildGrandStair({
    id: "imperial-sheer",
    design: "imperial",
    lowerFloor: 0,
    upperFloor: 1,
    topFloor: 3,
    lowerLabel: "",
    upperLabel: "",
    lowerY: 0,
    upperY: FLOOR_SEPARATION,
    centerX: CX,
    centerZ: CZ,
    half: 13.75,
    turns: 0,
    hasFlightBelow: false,
    hasFlightAbove: false,
    sheerWall: true,
  });
  const door = grandHallArrival(stair);
  const levels = [1, 2, 3].map((f) => f * FLOOR_SEPARATION);

  it("has no gallery along the wall its stair climbs toward, on any floor over the first", () => {
    expect(sheerSide(stair)).toBe("north");
    expect(sheerStripDepth(stair)).toBeCloseTo(5.75, 6);
    // Behind the half landing, from one side wall to the other.
    for (const x of [-13, -9, 0, 9, 13]) {
      const p = toStairWorld(stair, x, -11);
      expect(grandSurfaceAt([stair], p.x, p.z, 0)?.floorIndex, `floor, x ${x}`).toBe(0);
      for (const y of levels) {
        expect(
          grandSurfacesAt([stair], p.x, p.z).some((s) => Math.abs(s.y - y) < 1e-6),
          `x ${x}, y ${y}`,
        ).toBe(false);
      }
    }
    // The side galleries still run as far as the landing's far edge.
    for (const side of [-1, 1]) {
      const p = toStairWorld(stair, side * 11, IMPERIAL.north + 0.5);
      for (const [i, y] of levels.entries()) {
        expect(grandSurfaceAt([stair], p.x, p.z, y)?.floorIndex).toBe(i + 1);
      }
    }
  });

  it("fences the galleries where they end, and nothing along the walls", () => {
    for (const y of levels) {
      const rails = stair.rails.filter((r) => r.y0 === y && r.y1 === y);
      // Across the end of each side gallery.
      for (const side of [-1, 1]) {
        expect(
          rails.some(
            (r) =>
              r.z0 === IMPERIAL.north &&
              r.z1 === IMPERIAL.north &&
              Math.min(side * r.x0, side * r.x1) === IMPERIAL.half &&
              Math.max(side * r.x0, side * r.x1) === stair.half,
          ),
          `side ${side}, y ${y}`,
        ).toBe(true);
      }
      // None lies on a wall.
      const onWall = rails.filter(
        (r) =>
          (Math.abs(r.z0) === stair.half && r.z0 === r.z1) ||
          (Math.abs(r.x0) === stair.half && r.x0 === r.x1),
      );
      expect(onWall).toHaveLength(0);
    }
  });

  it("is still walked from the door to the floor above, and never out over the strip", () => {
    const reached = walkFrom([stair], door, 0, stair.half);
    const upper = FLOOR_SEPARATION;
    expect(reached.some((q) => Math.abs(q.y - upper) < 1e-6)).toBe(true);
    const local = reached.map((q) => ({ ...toStairLocal(stair, q.x, q.z), y: q.y }));
    // Over the hall floor, nobody stands north of the landing's far edge.
    const over = local.filter((q) => q.y > 1 && q.z < IMPERIAL.north - 0.01);
    expect(over).toHaveLength(0);
  });
});

describe("a loggia: the imperial stair on every storey, in the front of its hall", () => {
  const half = 13.75;
  // The block plan's: the end wall a cell inside the square.
  const back = half - 2.5;
  const stairs = hall("loggia", 0, 4, half, back);
  const shift = loggiaShift(half);
  const north = IMPERIAL.north + shift;
  const south = IMPERIAL.south + shift;
  const voidNorth = -(back - LOGGIA.endGallery);
  const door = grandHallArrival(stairs[0]);
  const levels = [1, 2, 3].map((f) => f * FLOOR_SEPARATION);
  let walked: ReturnType<typeof walkFrom> | undefined;
  const walk = () => {
    walked ??= walkFrom(stairs, door, 0, half, back);
    return walked;
  };

  it("stands against a lobby on every floor, the same stair in the same place", () => {
    expect(half - south).toBeCloseTo(LOGGIA.lobby, 9);
    for (const stair of stairs) {
      expect(stair.sheerWall).toBeFalsy();
      expect(stair.back).toBe(back);
      expect(stair.topFloor).toBe(stair.upperFloor);
      // The flights of one storey lie over those of the one below.
      const plan = (s: GrandStair) =>
        JSON.stringify(
          s.patches.map((p) =>
            p.kind === "flight"
              ? [p.cx, p.z0, p.z1, p.hw0]
              : p.kind === "flat"
                ? [p.xMin, p.zMin]
                : 0,
          ),
        );
      expect(plan(stair)).toBe(plan(stairs[0]));
    }
    // Inside the door there is floor on every storey, and the foot of
    // the next middle flight is straight ahead across it.
    for (let floor = 0; floor < 4; floor++) {
      const y = floor * FLOOR_SEPARATION;
      expect(grandSurfaceAt(stairs, door.x, door.z, y)?.floorIndex).toBe(floor);
      const foot = at(stairs, 0, south + 0.3);
      expect(grandSurfaceAt(stairs, foot.x, foot.z, y)?.floorIndex, `floor ${floor}`).toBe(floor);
    }
  });

  it("is walked from the hall's door to every floor, and back to the door on each", () => {
    const reached = walk();
    for (let floor = 1; floor < 4; floor++) {
      const y = floor * FLOOR_SEPARATION;
      expect(
        reached.some(
          (p) =>
            Math.abs(p.y - y) < 1e-6 &&
            Math.abs(p.x - door.x) < 0.3 &&
            Math.abs(p.z - door.z) < 0.3,
        ),
        `floor ${floor}`,
      ).toBe(true);
    }
    // Every tread of every storey is stood on.
    expect(new Set(reached.map((p) => p.y.toFixed(3))).size).toBeGreaterThanOrEqual(
      GRAND_RISERS * 3,
    );
  });

  it("is open behind its half landings, the stair's width, on every floor over the first", () => {
    expect(north - voidNorth).toBeCloseTo(3.95, 9);
    for (const x of [-7.5, 0, 7.5]) {
      for (const z of [north - 0.5, voidNorth + 0.5]) {
        const p = at(stairs, x, z);
        // The hall's own floor is there, under the landing too.
        expect(grandSurfaceAt(stairs, p.x, p.z, 0)?.floorIndex, `floor, ${x} ${z}`).toBe(0);
        const over = grandSurfacesAt(stairs, p.x, p.z).filter((s) => s.y > 1);
        expect(over, `${x} ${z}`).toHaveLength(0);
      }
    }
    // Nobody who walks the hall comes to stand out over it.
    const strays = walk()
      .map((q) => ({ ...toStairLocal(stairs[0], q.x, q.z), y: q.y }))
      .filter(
        (q) =>
          q.y > 1 &&
          q.z < north - 0.01 &&
          q.z > voidNorth + 0.01 &&
          Math.abs(q.x) < IMPERIAL.half - 0.01,
      );
    expect(strays).toHaveLength(0);
  });

  it("keeps a floor round the void on every storey: beside the stair and along the end wall", () => {
    for (const side of [-1, 1]) {
      for (const z of [-back + 0.5, voidNorth, north + 0.5, 0, south]) {
        const p = at(stairs, side * 11, z);
        levels.forEach((y, i) => {
          expect(grandSurfaceAt(stairs, p.x, p.z, y)?.floorIndex, `${side} ${z}`).toBe(i + 1);
        });
      }
    }
    for (const x of [-7.5, 0, 7.5]) {
      const p = at(stairs, x, -back + 0.5);
      levels.forEach((y, i) => {
        expect(grandSurfaceAt(stairs, p.x, p.z, y)?.floorIndex, `end ${x}`).toBe(i + 1);
      });
    }
    // Wide enough to walk and to stand back from a work: 5 m and more.
    expect(half - IMPERIAL.half).toBeGreaterThanOrEqual(5);
    expect(LOGGIA.endGallery).toBeGreaterThanOrEqual(5);
    // Nothing of the hall lies past its end wall.
    const past = at(stairs, 0, -back - 0.5);
    expect(grandStairsAt(stairs, past.x, past.z)).toHaveLength(0);
    const inside = at(stairs, 0, -back + 0.5);
    expect(grandStairsAt(stairs, inside.x, inside.z)).toHaveLength(stairs.length);
  });

  it("fences every edge of a floor but the heads of its flights and the next foot", () => {
    stairs.forEach((stair, i) => {
      const y = stair.upperY;
      const rails = stair.rails.filter((r) => r.y0 === y && r.y1 === y);
      const along = (z: number, xa: number, xb: number) =>
        rails.some(
          (r) =>
            r.z0 === z && r.z1 === z && Math.min(r.x0, r.x1) === xa && Math.max(r.x0, r.x1) === xb,
        );
      const down = (x: number, za: number, zb: number) =>
        rails.some(
          (r) =>
            r.x0 === x && r.x1 === x && Math.min(r.z0, r.z1) === za && Math.max(r.z0, r.z1) === zb,
        );
      // The edge of the gallery along the end wall, and the edges of
      // the two beside the stair, over the void and the flights.
      expect(along(voidNorth, -IMPERIAL.half, IMPERIAL.half), stair.id).toBe(true);
      expect(down(IMPERIAL.half, voidNorth, south), stair.id).toBe(true);
      expect(down(-IMPERIAL.half, voidNorth, south), stair.id).toBe(true);
      // The middle of the lobby's edge: open where the next stair
      // leaves, closed on the top floor.
      const last = i === stairs.length - 1;
      expect(along(south, -IMPERIAL.centralHalf, IMPERIAL.centralHalf), stair.id).toBe(last);
      // None lies on a wall.
      const onWall = stair.rails.filter(
        (r) =>
          (r.z0 === r.z1 && (r.z0 === half || r.z0 === -back)) ||
          (Math.abs(r.x0) === half && r.x0 === r.x1),
      );
      expect(onWall, stair.id).toHaveLength(0);
    });
  });

  it("is one opening: the stair's own, and the void behind it", () => {
    const o = stairs[0].opening;
    expect(o.kind).toBe("rects");
    if (o.kind !== "rects") return;
    expect(o.rects).toHaveLength(2);
    const [strip, own] = o.rects;
    expect(strip).toEqual({
      xMin: -IMPERIAL.half,
      xMax: IMPERIAL.half,
      zMin: voidNorth,
      zMax: north,
    });
    expect(own).toEqual({ xMin: -IMPERIAL.half, xMax: IMPERIAL.half, zMin: north, zMax: south });
    expect(inOpening(stairs[0], 0, south + 0.1)).toBe(false);
    expect(inOpening(stairs[0], 0, voidNorth - 0.1)).toBe(false);
  });

  it("can be walked under on the hall floor, past the stair to the hall behind it", () => {
    const ground = (x: number, z: number) => {
      const p = at(stairs, x, z);
      return grandSurfaceAt(stairs, p.x, p.z, 0);
    };
    // Beside the stair, under its landing, and behind it.
    expect(ground(11, 0)?.floorIndex).toBe(0);
    expect(ground(4, north + 1)?.floorIndex).toBe(0);
    expect(ground(0, north - 3)?.floorIndex).toBe(0);
    // The middle flight is masonry.
    expect(ground(0, south - 2)).toBeNull();
    // From the lobby to the hall behind the stair, on foot.
    const behind = at(stairs, 0, -back + 1);
    expect(
      walk().some(
        (q) => q.y === 0 && Math.abs(q.x - behind.x) < 0.3 && Math.abs(q.z - behind.z) < 0.3,
      ),
    ).toBe(true);
  });
});

describe("a court: a hall with no stair, open to the roof", () => {
  const half = 13.75;
  const court = buildGrandStair({
    id: "court",
    design: "court",
    lowerFloor: 0,
    upperFloor: 1,
    topFloor: 3,
    lowerLabel: "",
    upperLabel: "",
    lowerY: 0,
    upperY: FLOOR_SEPARATION,
    centerX: CX,
    centerZ: CZ,
    half,
    turns: 0,
    hasFlightBelow: false,
    hasFlightAbove: false,
  });
  const levels = [1, 2, 3].map((f) => f * FLOOR_SEPARATION);

  it("has no flight, pier or lamp", () => {
    expect(court.patches).toHaveLength(0);
    expect(court.columns).toHaveLength(0);
    expect(court.lamps).toHaveLength(0);
  });

  it("is floor from wall to wall on its first storey", () => {
    for (const [x, z] of [
      [0, 0],
      [12, 12],
      [-12, 3],
    ]) {
      const p = toStairWorld(court, x, z);
      expect(grandSurfaceAt([court], p.x, p.z, 0)?.floorIndex).toBe(0);
    }
  });

  it("has a gallery 5 m wide inside every wall on the floors above, and nothing in the middle", () => {
    expect(half - openingReach(court.opening)).toBe(5);
    levels.forEach((y, i) => {
      for (const [x, z] of [
        [0, 12],
        [0, -12],
        [12, 0],
        [-12, 0],
        [11, 11],
      ]) {
        const p = toStairWorld(court, x, z);
        expect(grandSurfaceAt([court], p.x, p.z, y)?.floorIndex, `${x} ${z}`).toBe(i + 1);
      }
      const middle = toStairWorld(court, 3, -2);
      expect(grandSurfacesAt([court], middle.x, middle.z).some((s) => s.y === y)).toBe(false);
      // A step off the gallery is refused.
      const edge = toStairWorld(court, 0, 9);
      const out = toStairWorld(court, 0, 8.5);
      expect(grandMoveAllowed([court], edge.x, edge.z, out.x, out.z, y)).toBe(false);
    });
  });

  it("fences the opening all round on each of them", () => {
    for (const y of levels) {
      const rails = court.rails.filter((r) => r.y0 === y && r.y1 === y);
      expect(rails).toHaveLength(4);
      const length = rails.reduce((sum, r) => sum + Math.hypot(r.x1 - r.x0, r.z1 - r.z0), 0);
      expect(length).toBeCloseTo(4 * 2 * (half - 5), 9);
    }
    expect(court.rails).toHaveLength(12);
  });

  it("lands a visitor inside a door, on floor, on every storey", () => {
    const arrival = grandHallArrival(court);
    for (let floor = 0; floor < 4; floor++) {
      const y = floor * FLOOR_SEPARATION;
      expect(grandSurfaceAt([court], arrival.x, arrival.z, y)?.floorIndex).toBe(floor);
    }
  });
});
