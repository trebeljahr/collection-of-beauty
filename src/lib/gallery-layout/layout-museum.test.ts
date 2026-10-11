import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { benchRect, dividerRect, type Rect } from "./fittings";
import {
  type CellRect,
  GRAND_HALL,
  layoutMuseum,
  SLOT_STAGES,
  type Slot,
  STAIR,
} from "./layout-museum";
import { CELL_SIZE, DOOR_HEIGHT, DOOR_WIDTH, PORTAL_HEIGHT, PORTAL_WIDTH } from "./world-coords";

const SLOTS: Slot[] = SLOT_STAGES.flat();

function overlaps(a: CellRect, b: CellRect): boolean {
  return a.xMin <= b.xMax && b.xMin <= a.xMax && a.zMin <= b.zMax && b.zMin <= a.zMax;
}

/** Two rects are walkable neighbours when they share a full edge. The
 *  stairwell's east and west faces carry no door (see `wireDoors`), so
 *  touching it sideways does not connect anything. */
function connects(a: CellRect, b: CellRect, aIsStair: boolean, bIsStair: boolean): boolean {
  const zOverlap = a.zMin <= b.zMax && b.zMin <= a.zMax;
  const xOverlap = a.xMin <= b.xMax && b.xMin <= a.xMax;
  const sideBySide = (a.xMax + 1 === b.xMin || b.xMax + 1 === a.xMin) && zOverlap;
  if (sideBySide) return !aIsStair && !bIsStair;
  return (a.zMax + 1 === b.zMin || b.zMax + 1 === a.zMin) && xOverlap;
}

describe("museum floor plan", () => {
  it("tiles without overlapping rooms", () => {
    const all = [STAIR, GRAND_HALL, ...SLOTS.map((s) => s.rect)];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(overlaps(all[i], all[j]), `rect ${i} overlaps rect ${j}`).toBe(false);
      }
    }
  });

  it("keeps every room inside the grid", () => {
    for (const rect of [STAIR, GRAND_HALL, ...SLOTS.map((s) => s.rect)]) {
      expect(rect.xMin).toBeGreaterThanOrEqual(0);
      expect(rect.zMin).toBeGreaterThanOrEqual(0);
      expect(rect.xMax).toBeLessThan(48);
      expect(rect.zMax).toBeLessThan(48);
    }
  });

  it("leaves every stage prefix reachable from the Grand Hall", () => {
    // A floor opens whole stages in order, so any prefix has to be a
    // connected building — a room nobody can walk to would hang works
    // that can never be seen.
    for (let stages = 0; stages <= SLOT_STAGES.length; stages++) {
      const open = SLOT_STAGES.slice(0, stages).flat();
      const rects = [GRAND_HALL, STAIR, ...open.map((s) => s.rect)];
      const stairIdx = 1;
      const reached = new Set<number>([0]);
      const frontier = [0];
      while (frontier.length > 0) {
        const cur = frontier.pop() as number;
        for (let i = 0; i < rects.length; i++) {
          if (reached.has(i)) continue;
          if (connects(rects[cur], rects[i], cur === stairIdx, i === stairIdx)) {
            reached.add(i);
            frontier.push(i);
          }
        }
      }
      expect(reached.size, `stage prefix ${stages} strands a room`).toBe(rects.length);
    }
  });

  it("opens stages symmetrically, so no floor grows a lopsided corner", () => {
    for (const stage of SLOT_STAGES) {
      if (stage.length === 1) continue;
      expect(stage).toHaveLength(2);
      const [a, b] = stage;
      // A pair mirrors either across the stair's x axis or its z axis.
      const mirroredX =
        a.rect.zMin === b.rect.zMin &&
        a.rect.zMax === b.rect.zMax &&
        a.rect.xMax < STAIR.xMin &&
        b.rect.xMin > STAIR.xMax;
      const mirroredZ =
        a.rect.xMin === b.rect.xMin &&
        a.rect.xMax === b.rect.xMax &&
        a.rect.zMax < STAIR.zMin !== b.rect.zMax < STAIR.zMin;
      expect(mirroredX || mirroredZ, `stage ${a.id}/${b.id} is not a mirrored pair`).toBe(true);
    }
  });

  it("varies room shape — no single footprint dominates the plan", () => {
    const shapes = new Set(
      [GRAND_HALL, ...SLOTS.map((s) => s.rect)].map(
        (r) => `${r.xMax - r.xMin + 1}x${r.zMax - r.zMin + 1}`,
      ),
    );
    // 24 rooms drawn from a 5 × 5 band grid minus the stair cell: every
    // distinct band pairing is its own footprint.
    expect(shapes.size).toBeGreaterThanOrEqual(16);
  });
});

describe("a built floor", () => {
  // No works: every floor opens the Grand Hall, the hall north of the
  // stair and the stairwell between them.
  const floor = layoutMuseum([]).floors[0];
  const grid = floor.gridSize.x;
  const room = (suffix: string) => {
    const found = floor.rooms.find((r) => r.id.endsWith(suffix));
    if (!found) throw new Error(`no room ${suffix}`);
    return found;
  };
  const blockedNS = (x: number, z: number) => floor.blockedEdgesNS[z * grid + x];
  const blockedEW = (x: number, z: number) => floor.blockedEdgesEW[z * (grid - 1) + x];

  it("makes the doors down the stair column portals, and no others", () => {
    const hall = room("grand-hall");
    const stairwell = room("stairwell");
    const north = room("n-hall");
    for (const r of [hall, stairwell, north]) {
      for (const door of r.doors) {
        expect(door.portal, `${r.id} ${door.side}`).toBe(true);
        expect(door.width).toBe(PORTAL_WIDTH);
        expect(door.height).toBe(PORTAL_HEIGHT);
      }
    }
    expect(hall.doors.map((d) => d.side)).toEqual(["north"]);
    expect(stairwell.doors.map((d) => d.side).sort()).toEqual(["north", "south"]);
  });

  it("keeps a door off the main axis a door", () => {
    // Enough Baroque canvases for that floor to open the rooms either
    // side of the Grand Hall.
    const works = Array.from(
      { length: 150 },
      (_, i) =>
        ({
          id: `work-${i}`,
          objectKey: `folder/work-${i}.jpg`,
          movement: "Baroque",
          year: 1650,
          artistSlug: `artist-${i % 30}`,
          width: 1200,
          height: 900,
          realDimensions: { widthCm: 150, heightCm: 112 },
        }) as unknown as ArtworkListing,
    );
    const baroque = layoutMuseum(works).floors.find((f) => f.era.id === "baroque");
    const hall = baroque?.rooms.find((r) => r.isAnchor);
    const sideDoors = hall?.doors.filter((d) => d.side === "west" || d.side === "east") ?? [];
    expect(sideDoors).toHaveLength(2);
    for (const door of sideDoors) {
      expect(door.portal).toBe(false);
      expect(door.width).toBe(DOOR_WIDTH);
      expect(door.height).toBe(DOOR_HEIGHT);
    }
    // Every work still found a wall.
    const hung = baroque?.rooms.reduce((n, r) => n + r.placements.length, 0);
    expect(hung).toBe(works.length);
  });

  it("opens the three cell edges a portal reaches, and closes the wall beyond", () => {
    // The wall between the stairwell and the Grand Hall is the line
    // under the stair's last row; the portal is centred on the column.
    const z = STAIR.zMax;
    const centre = (STAIR.xMin + STAIR.xMax) / 2;
    for (const x of [centre - 1, centre, centre + 1]) expect(blockedNS(x, z)).toBe(0);
    for (const x of [centre - 2, centre + 2, STAIR.xMin, STAIR.xMax])
      expect(blockedNS(x, z)).toBe(1);
  });

  it("blocks the edges under a divider and leaves the rest of the room free", () => {
    const north = room("n-hall");
    expect(north.dividers.length).toBeGreaterThan(0);
    const { xMin, xMax, zMin, zMax } = north.cellBounds;
    const expectedEW = new Set<string>();
    const expectedNS = new Set<string>();
    for (const d of north.dividers) {
      for (let i = d.start; i < d.end; i++) {
        if (d.axis === "z") expectedEW.add(`${d.line - 1}:${i}`);
        else expectedNS.add(`${i}:${d.line - 1}`);
      }
    }
    expect(expectedEW.size + expectedNS.size).toBeGreaterThan(0);
    // Every edge between two cells of this one room: blocked exactly
    // where a divider stands, free everywhere else.
    for (let z = zMin; z <= zMax; z++) {
      for (let x = xMin; x < xMax; x++) {
        expect(blockedEW(x, z), `EW ${x}:${z}`).toBe(expectedEW.has(`${x}:${z}`) ? 1 : 0);
      }
    }
    for (let z = zMin; z < zMax; z++) {
      for (let x = xMin; x <= xMax; x++) {
        expect(blockedNS(x, z), `NS ${x}:${z}`).toBe(expectedNS.has(`${x}:${z}`) ? 1 : 0);
      }
    }
  });

  it("gives rooms different ceilings", () => {
    expect(room("grand-hall").ceilingHeight).toBe(5.4);
    expect(room("n-hall").ceilingHeight).toBe(4.2);
    expect(room("stairwell").ceilingHeight).toBe(4.2);
  });

  it("puts a visitor down clear of the Grand Hall's benches", () => {
    const { entry } = layoutMuseum([]);
    const hall = room("grand-hall");
    expect(hall.benches.length).toBeGreaterThan(0);
    for (const bench of hall.benches) {
      expect(
        Math.hypot(bench.x - entry.worldPosition[0], bench.z - entry.worldPosition[2]),
      ).toBeGreaterThan(2);
    }
  });
});

describe("a floor with every room open", () => {
  // 300 canvases at the size cap need more wall than the plan has, so
  // the floor opens all 24 slots and every door of the plan exists.
  const works = Array.from(
    { length: 300 },
    (_, i) =>
      ({
        id: `big-${i}`,
        objectKey: `folder/big-${i}.jpg`,
        movement: "Baroque",
        year: 1650,
        artistSlug: `artist-${i % 40}`,
        width: 1600,
        height: 1200,
        realDimensions: { widthCm: 320, heightCm: 240 },
      }) as unknown as ArtworkListing,
  );
  const floor = layoutMuseum(works).floors.find((f) => f.era.id === "baroque");
  const rooms = floor?.rooms.filter((r) => !r.isStairwell) ?? [];

  /** The floor a door looks down, its opening widened by `margin`. */
  const strip = (
    room: (typeof rooms)[number],
    door: (typeof rooms)[number]["doors"][number],
    margin: number,
  ): Rect => {
    const half = door.width / 2 + margin;
    const b = room.cellBounds;
    const whole = {
      xMin: b.xMin * CELL_SIZE,
      xMax: (b.xMax + 1) * CELL_SIZE,
      zMin: b.zMin * CELL_SIZE,
      zMax: (b.zMax + 1) * CELL_SIZE,
    };
    return door.side === "north" || door.side === "south"
      ? { ...whole, xMin: door.worldX - half, xMax: door.worldX + half }
      : { ...whole, zMin: door.worldZ - half, zMax: door.worldZ + half };
  };
  const overlap = (a: Rect, b: Rect) =>
    a.xMin < b.xMax - 1e-6 &&
    b.xMin < a.xMax - 1e-6 &&
    a.zMin < b.zMax - 1e-6 &&
    b.zMin < a.zMax - 1e-6;

  it("opens the whole plan", () => {
    expect(rooms).toHaveLength(SLOTS.length + 1);
  });

  it("stands no divider across a door's line of sight", () => {
    let dividers = 0;
    for (const room of rooms) {
      for (const divider of room.dividers) {
        dividers++;
        for (const door of room.doors) {
          expect(
            overlap(dividerRect(divider), strip(room, door, 0.25)),
            `${room.id} ${door.side}`,
          ).toBe(false);
        }
      }
    }
    expect(dividers).toBeGreaterThan(40);
  });

  it("stands no bench in the walking line between doors", () => {
    let benches = 0;
    for (const room of rooms) {
      for (const bench of room.benches) {
        benches++;
        for (const door of room.doors) {
          expect(
            overlap(benchRect(bench), strip(room, door, 0.45)),
            `${room.id} ${door.side}`,
          ).toBe(false);
        }
      }
    }
    expect(benches).toBeGreaterThan(20);
  });

  it("hangs works on dividers, each on a divider its room has", () => {
    let onDividers = 0;
    for (const room of rooms) {
      for (const p of room.placements) {
        if (p.divider === undefined) continue;
        onDividers++;
        expect(room.dividers[p.divider], room.id).toBeDefined();
      }
    }
    expect(onDividers).toBeGreaterThan(0);
  });
});
