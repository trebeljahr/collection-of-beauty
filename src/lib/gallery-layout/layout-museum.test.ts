import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { arrangementOf } from "./divider-plans";
import { benchRect, dividerRect, type Rect } from "./fittings";
import { frameReach, pickFrameDesign } from "./frame-design";
import {
  type CellRect,
  fillRooms,
  GRAND_HALL,
  layoutMuseum,
  SLOT_SCREENS,
  SLOT_STAGES,
  type Slot,
  STAIR,
} from "./layout-museum";
import { PAINTING_FLOOR_GAP, wallFootprint } from "./place-paintings";
import type { Placement } from "./types";
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
          width: 2400,
          height: 1800,
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
    expect(room("grand-hall").ceilingHeight).toBe(5.7);
    expect(room("n-hall").ceilingHeight).toBe(4.8);
    expect(room("stairwell").ceilingHeight).toBe(4.8);
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
        width: 4096,
        height: 3072,
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

  type Room = (typeof rooms)[number];
  /** The door a screen stands in front of: the one in the wall its bare
   *  face looks at, a cell away. */
  const doorBehind = (room: Room, divider: Room["dividers"][number]) => {
    if (!divider.bare) return undefined;
    const wall = (divider.line + (divider.bare === "low" ? -1 : 1)) * CELL_SIZE;
    const side =
      divider.axis === "x"
        ? divider.bare === "low"
          ? "north"
          : "south"
        : divider.bare === "low"
          ? "west"
          : "east";
    return room.doors.find((door) => {
      const across = divider.axis === "x" ? door.worldZ : door.worldX;
      const along = (divider.axis === "x" ? door.worldX : door.worldZ) / CELL_SIZE;
      return (
        door.side === side &&
        Math.abs(across - wall) < 1e-6 &&
        along > divider.start &&
        along < divider.end
      );
    });
  };
  const screened = (room: Room) =>
    new Set(room.dividers.map((d) => doorBehind(room, d)).filter((d) => d !== undefined));
  const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" } as const;

  it("stands no divider but a screen across a door's line of sight", () => {
    let dividers = 0;
    const inSight: string[] = [];
    for (const room of rooms) {
      const behindScreen = screened(room);
      for (const divider of room.dividers) {
        dividers++;
        const own = doorBehind(room, divider);
        for (const door of room.doors) {
          if (!overlap(dividerRect(divider), strip(room, door, 0.25))) continue;
          // A screen is looked at by its own door, and by a door in the
          // wall opposite, which sees its picture. A door behind a
          // screen looks at nothing further.
          const allowed =
            behindScreen.has(door) || (own !== undefined && door.side === OPPOSITE[own.side]);
          if (!allowed) inSight.push(`${room.id} ${door.side}`);
        }
      }
    }
    expect(inSight).toEqual([]);
    expect(dividers).toBeGreaterThan(40);
  });

  it("stands each screen of the plan a cell in front of its door, back to it", () => {
    const built = new Set<string>();
    for (const [slot, toward] of SLOT_SCREENS) {
      const room = rooms.find((r) => r.id === `baroque-${slot.replace(/_/g, "-")}`);
      const door = room?.doors.find(
        (d) => d.connectsTo.roomId === `baroque-${toward.replace(/_/g, "-")}`,
      );
      expect(door, `${slot} has a door to ${toward}`).toBeDefined();
      const screen = room?.dividers.find((d) => doorBehind(room, d) === door);
      expect(screen, `${slot}: a screen at the door to ${toward}`).toBeDefined();
      if (!room || !door || !screen) continue;
      // Wider than the door by half a metre each side, and centred on it.
      const along = (screen.axis === "x" ? door.worldX : door.worldZ) / CELL_SIZE;
      expect((screen.start + screen.end) / 2, slot).toBeCloseTo(along, 6);
      expect((screen.end - screen.start) * CELL_SIZE, slot).toBeGreaterThanOrEqual(door.width + 1);
      expect(door.portal, slot).toBe(false);
      // One side of a door at most.
      expect(built.has(`${toward}>${slot}`), `${slot} and ${toward} both screen one door`).toBe(
        false,
      );
      built.add(`${slot}>${toward}`);
    }
    // No screen but those.
    const all = rooms.flatMap((r) => r.dividers.filter((d) => d.bare));
    expect(all).toHaveLength(SLOT_SCREENS.length);
    expect(rooms.find((r) => r.isAnchor)?.dividers).toEqual([]);
  });

  it("screens only a door that is there on every storey its room is", () => {
    const stageOf = (slot: string) =>
      SLOT_STAGES.findIndex((stage) => stage.some((s) => s.id === slot));
    for (const [slot, toward] of SLOT_SCREENS) {
      expect(stageOf(slot), slot).toBeGreaterThanOrEqual(0);
      expect(stageOf(toward), toward).toBeGreaterThanOrEqual(0);
      expect(stageOf(toward), `${toward} opens no later than ${slot}`).toBeLessThanOrEqual(
        stageOf(slot),
      );
    }
  });

  it("hangs one picture on a screen, on the face toward the room", () => {
    for (const room of rooms) {
      room.dividers.forEach((divider, index) => {
        if (!divider.bare) return;
        const hung = room.placements.filter((p) => p.divider === index);
        expect(hung.length, room.id).toBeLessThanOrEqual(1);
        for (const p of hung) {
          const across = (divider.axis === "x" ? p.position[2] : p.position[0]) / CELL_SIZE;
          expect(Math.sign(across - divider.line), room.id).toBe(divider.bare === "low" ? 1 : -1);
        }
      });
    }
  });

  it("stands no bench in the walking line between doors", () => {
    let benches = 0;
    for (const room of rooms) {
      // A visitor walks round a screen, not on through its door's line.
      const behindScreen = screened(room);
      for (const bench of room.benches) {
        benches++;
        for (const door of room.doors) {
          if (behindScreen.has(door)) continue;
          expect(
            overlap(benchRect(bench), strip(room, door, 0.45)),
            `${room.id} ${door.side}`,
          ).toBe(false);
        }
      }
    }
    expect(benches).toBeGreaterThan(20);
  });

  it("divides no two halls or long rooms that share a door the same way", () => {
    const styleOf = (room: Room) =>
      JSON.stringify(
        room.dividers
          .filter((d) => !d.bare)
          .map((d) => [
            d.axis,
            d.end - d.start,
            d.start === (d.axis === "x" ? room.cellBounds.xMin : room.cellBounds.zMin),
          ])
          .sort(),
      );
    const kinds = new Set<string>();
    const twins: string[] = [];
    for (const room of rooms) {
      if (room.dividers.every((d) => d.bare)) continue;
      const arrangement = arrangementOf(room.cellBounds, room.dividers);
      kinds.add(`${arrangement.kind}:${styleOf(room)}`);
      for (const door of room.doors) {
        const other = rooms.find((r) => r.id === door.connectsTo.roomId);
        if (!other || other.dividers.every((d) => d.bare)) continue;
        const b = other.cellBounds;
        const a = room.cellBounds;
        const sameShape =
          a.xMax - a.xMin === b.xMax - b.xMin && a.zMax - a.zMin === b.zMax - b.zMin;
        if (sameShape && styleOf(room) === styleOf(other)) twins.push(`${room.id} ${other.id}`);
      }
    }
    expect(twins).toEqual([]);
    // Wall lengths from 2.5 m to 7.5 m, in rows, bays and staggered.
    expect(kinds.size).toBeGreaterThanOrEqual(8);
    const lengths = new Set(
      rooms.flatMap((r) => r.dividers.map((d) => (d.end - d.start) * CELL_SIZE)),
    );
    expect([...lengths].sort((x, y) => x - y)).toEqual([2.5, 5, 7.5]);
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

describe("how high the works hang", () => {
  const sizes = [
    [320, 240],
    [200, 320],
    [120, 90],
    [45, 60],
  ];
  const works = Array.from({ length: 120 }, (_, i) => {
    const [widthCm, heightCm] = sizes[i % sizes.length];
    return {
      id: `hang-${i}`,
      objectKey: `folder/hang-${i}.jpg`,
      movement: "Baroque",
      year: 1650,
      artistSlug: `artist-${i % 40}`,
      width: 4096,
      height: Math.round((4096 * heightCm) / widthCm),
      realDimensions: { widthCm, heightCm },
    } as unknown as ArtworkListing;
  });
  const floor = layoutMuseum(works).floors.find((f) => f.era.id === "baroque");
  const hung = (floor?.rooms ?? []).flatMap((room) => room.placements.map((p) => ({ room, p })));
  /** How far the frame the work actually hangs in reaches past its
   *  canvas. A Grand Hall pair shares one frame (`Placement.frame`). */
  const reachOf = (p: Placement) =>
    frameReach(p.frame ?? pickFrameDesign(p.artwork), p.widthM, p.heightM);

  it("keeps every frame 0.4 m off the floor", () => {
    expect(hung.length).toBeGreaterThan(100);
    for (const { room, p } of hung) {
      const reach = reachOf(p);
      const bottom = p.position[1] - p.heightM / 2 - reach - room.worldRect.y;
      expect(bottom, p.artwork.id).toBeGreaterThanOrEqual(PAINTING_FLOOR_GAP - 1e-9);
    }
  });

  it("leaves wall for the picture light above every frame", () => {
    for (const { room, p } of hung) {
      const reach = reachOf(p);
      const top = p.position[1] + p.heightM / 2 + reach - room.worldRect.y;
      expect(room.ceilingHeight - top, p.artwork.id).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe("fillRooms", () => {
  /** Works of one size, about 2.5 m of wall each. */
  const works = (count: number) =>
    Array.from(
      { length: count },
      (_, i) =>
        ({
          id: `w-${i}`,
          width: 4000,
          height: 3000,
          realDimensions: { widthCm: 200, heightCm: 150 },
        }) as unknown as ArtworkListing,
    );

  it("deals every room its share to the nearest work, the last one too", () => {
    // 18 works for five rooms of one size: 3.6 a room. Stopped short of
    // its share, each of the first four took 3 and the last took 6.
    const walls = [20, 20, 20, 20, 20];
    const fills = fillRooms(walls, [{ name: "m", artworks: works(18) }], ERAS[0]);
    const counts = fills.map((f) => f.artworks.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(18);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("deals rooms of other sizes in proportion to their wall", () => {
    const walls = [60, 20, 40, 20];
    const all = works(41);
    const one = wallFootprint(all[0]);
    const fills = fillRooms(walls, [{ name: "m", artworks: [...all] }], ERAS[0]);
    const perMetre = (41 * one) / 140;
    const off = fills.map((f, i) => Math.abs(f.artworks.length * one - walls[i] * perMetre));
    // No room is more than a work from its share.
    expect(Math.max(...off)).toBeLessThanOrEqual(one);
  });
});
