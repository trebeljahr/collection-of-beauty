import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { galleryLayoutIdentity } from "@/lib/gallery-release-state";
import { layoutMuseum } from "./layout-museum";
import {
  HUB,
  layoutWings,
  WING_DIRS,
  WING_DOOR_WIDTH,
  WING_PLAN,
  WING_ROOMS,
  WING_WALL_COVERAGE,
  WINGS_GRID,
} from "./layout-wings";
import { computeRoomRuns, runLength, wallFootprint } from "./place-paintings";
import { eraOfRoom, floorTitle } from "./room-era";
import type { RoomLayout } from "./types";
import { CELL_SIZE, doorOpenHalfSpan, PORTAL_WIDTH } from "./world-coords";

/** 120 sharp works for every era, in mixed sizes, by 30 artists each. */
function catalogue(): ArtworkListing[] {
  const sizes = [
    [300, 220],
    [160, 120],
    [90, 120],
    [60, 45],
    [40, 55],
  ];
  return ERAS.flatMap((era) =>
    Array.from({ length: 120 }, (_, i) => {
      const [widthCm, heightCm] = sizes[i % sizes.length];
      return {
        id: `${era.id}-${i}`,
        objectKey: `folder/${era.id}-${i}.jpg`,
        // Half of two eras carries the movement that sends it to
        // another wing of its floor.
        movement:
          era.id === "renaissance" && i % 2 === 0
            ? "Northern Renaissance"
            : era.id === "baroque" && i % 2 === 0
              ? "Dutch Golden Age"
              : era.movements[0],
        year: null,
        artistSlug: `${era.id}-artist-${i % 30}`,
        width: 4096,
        height: Math.round((4096 * heightCm) / widthCm),
        realDimensions: { widthCm, heightCm },
      } as unknown as ArtworkListing;
    }),
  );
}

const layout = layoutWings(catalogue());
const wingOf = (room: RoomLayout) => room.id.split("-")[1];
const wallOf = (room: RoomLayout) =>
  computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);

describe("the wings plan", () => {
  it("is three floors of a stair hall, four wings of ten rooms and four cabinets", () => {
    expect(layout.floors).toHaveLength(3);
    for (const floor of layout.floors) {
      expect(floor.gridSize).toEqual({ x: WINGS_GRID, z: WINGS_GRID });
      expect(floor.rooms.filter((r) => r.isStairwell)).toHaveLength(1);
      expect(floor.rooms.filter((r) => !r.isStairwell)).toHaveLength(44);
      for (const dir of WING_DIRS) {
        const rooms = floor.rooms.filter((r) => r.id.startsWith(`f${floor.index}-${dir}-`));
        expect(rooms).toHaveLength(WING_ROOMS.length);
      }
    }
    expect(layout.allStaircases).toHaveLength(2);
  });

  it("keeps every room on the grid and apart from every other", () => {
    for (const floor of layout.floors) {
      const seen = new Set<string>();
      for (const room of floor.rooms) {
        const b = room.cellBounds;
        expect(b.xMin).toBeGreaterThanOrEqual(0);
        expect(b.zMin).toBeGreaterThanOrEqual(0);
        expect(b.xMax).toBeLessThan(WINGS_GRID);
        expect(b.zMax).toBeLessThan(WINGS_GRID);
        for (let x = b.xMin; x <= b.xMax; x++) {
          for (let z = b.zMin; z <= b.zMax; z++) {
            expect(seen.has(`${x}:${z}`), `${room.id} ${x}:${z}`).toBe(false);
            seen.add(`${x}:${z}`);
          }
        }
      }
    }
  });

  it("reaches every room from the stair hall", () => {
    for (const floor of layout.floors) {
      const byId = new Map(floor.rooms.map((r) => [r.id, r]));
      const hub = floor.rooms.find((r) => r.isStairwell)!;
      const seen = new Set([hub.id]);
      const queue = [hub];
      while (queue.length) {
        for (const door of queue.pop()!.doors) {
          const next = byId.get(door.connectsTo.roomId);
          expect(next, door.connectsTo.roomId).toBeDefined();
          if (next && !seen.has(next.id)) {
            seen.add(next.id);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(floor.rooms.length);
    }
  });

  it("puts each door in the middle of a cell, on both rooms, and opens the grid there", () => {
    for (const floor of layout.floors) {
      const byId = new Map(floor.rooms.map((r) => [r.id, r]));
      const grid = floor.gridSize.x;
      for (const room of floor.rooms) {
        for (const door of room.doors) {
          const along = door.side === "north" || door.side === "south" ? door.worldX : door.worldZ;
          expect((along / CELL_SIZE) % 1, `${room.id} ${door.side}`).toBeCloseTo(0.5, 9);
          const twin = byId
            .get(door.connectsTo.roomId)!
            .doors.find((d) => d.connectsTo.roomId === room.id);
          expect(twin?.worldX).toBe(door.worldX);
          expect(twin?.worldZ).toBe(door.worldZ);
          // A wing door is one cell wide for the collision grid.
          const stairSide = room.isStairwell || byId.get(door.connectsTo.roomId)!.isStairwell;
          expect(door.width).toBe(stairSide ? PORTAL_WIDTH : WING_DOOR_WIDTH);
          if (!stairSide) expect(doorOpenHalfSpan(door.width)).toBe(CELL_SIZE / 2);
          // The edge under the door's centre is open.
          if (door.side === "east") {
            const x = Math.round(door.worldX / CELL_SIZE) - 1;
            const z = Math.floor(door.worldZ / CELL_SIZE);
            expect(floor.blockedEdgesEW[z * (grid - 1) + x], `${room.id} east`).toBe(0);
          }
          if (door.side === "south") {
            const x = Math.floor(door.worldX / CELL_SIZE);
            const z = Math.round(door.worldZ / CELL_SIZE) - 1;
            expect(floor.blockedEdgesNS[z * grid + x], `${room.id} south`).toBe(0);
          }
        }
      }
    }
  });

  it("lines the doors up from the stair hall through the salon", () => {
    const floor = layout.floors[0];
    const room = (key: string) => floor.rooms.find((r) => r.id === `f0-${key}`)!;
    const door = (from: string, to: string) =>
      room(from).doors.find((d) => d.connectsTo.roomId === `f0-${to}`)!;
    const hubX = ((HUB.xMin + HUB.xMax + 1) / 2) * CELL_SIZE;
    // North wing: hall, vestibule, entry gallery, salon, far gallery on one x.
    for (const [from, to] of [
      ["hub", "n-vestibule"],
      ["n-vestibule", "n-entry"],
      ["n-entry", "n-salon"],
      ["n-salon", "n-far"],
    ]) {
      expect(door(from, to).worldX, `${from} to ${to}`).toBe(hubX);
    }
    // East wing: the same on one z.
    for (const [from, to] of [
      ["hub", "e-vestibule"],
      ["e-vestibule", "e-entry"],
      ["e-entry", "e-salon"],
      ["e-salon", "e-far"],
    ]) {
      expect(door(from, to).worldZ, `${from} to ${to}`).toBe(hubX);
    }
  });

  it("lines the ring's doors up along each side of a wing", () => {
    const floor = layout.floors[0];
    const room = (key: string) => floor.rooms.find((r) => r.id === `f0-${key}`)!;
    const door = (from: string, to: string) =>
      room(from).doors.find((d) => d.connectsTo.roomId === `f0-${to}`)!;
    // North wing, west side: c1, s1, c2 in a row along z.
    expect(door("n-c1", "n-s1").worldX).toBe(door("n-s1", "n-c2").worldX);
    expect(door("n-c4", "n-s2").worldX).toBe(door("n-s2", "n-c3").worldX);
    // Near and far sides: across the wing along x.
    expect(door("n-c1", "n-entry").worldZ).toBe(door("n-entry", "n-c4").worldZ);
    expect(door("n-c2", "n-far").worldZ).toBe(door("n-far", "n-c3").worldZ);
  });

  it("gives the salon two doors and every ring gallery two on the ring", () => {
    for (const floor of layout.floors) {
      for (const room of floor.rooms) {
        if (room.id.endsWith("-salon")) expect(room.doors).toHaveLength(2);
        if (/-(s1|s2|c2|c3)$/.test(room.id)) expect(room.doors).toHaveLength(2);
      }
    }
  });

  it("hangs each wing from its own era and no fuller than the target", () => {
    for (const floor of layout.floors) {
      for (const dir of WING_DIRS) {
        const spec = WING_PLAN[floor.index][dir];
        const rooms = floor.rooms.filter((r) => wingOf(r) === dir && !r.isStairwell);
        const works = rooms.flatMap((r) => r.placements.map((p) => p.artwork));
        expect(works.length, spec.title).toBeGreaterThan(20);
        for (const room of rooms) expect(eraOfRoom(room).id).toBe(spec.era);
        // Gothic shares its wing with the Northern Renaissance.
        const eras = floor.index === 0 && dir === "n" ? ["gothic", "renaissance"] : [spec.era];
        for (const work of works) {
          expect(
            eras.some((era) => work.id.startsWith(`${era}-`)),
            work.id,
          ).toBe(true);
        }
        const wall = rooms.reduce((sum, r) => sum + wallOf(r), 0);
        const hung = works.reduce((sum, a) => sum + wallFootprint(a), 0);
        expect(hung / wall, spec.title).toBeLessThanOrEqual(
          (spec.coverage ?? WING_WALL_COVERAGE) + 1e-9,
        );
      }
    }
  });

  it("hangs no work twice", () => {
    const ids = layout.allRooms.flatMap((r) => r.placements.map((p) => p.artwork.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("splits Baroque at the Dutch Golden Age", () => {
    const floor = layout.floors[0];
    const movements = (dir: string) =>
      new Set(
        floor.rooms
          .filter((r) => wingOf(r) === dir && !r.isStairwell)
          .flatMap((r) => r.placements.map((p) => p.artwork.movement)),
      );
    expect([...movements("w")]).toEqual(["Dutch Golden Age"]);
    expect(movements("s").has("Dutch Golden Age")).toBe(false);
  });

  it("puts the largest works of a wing in its salon", () => {
    const floor = layout.floors[1];
    const rooms = floor.rooms.filter((r) => wingOf(r) === "e" && !r.isStairwell);
    const area = (r: RoomLayout) => r.placements.map((p) => p.widthM * p.heightM);
    const salon = rooms.find((r) => r.id.endsWith("-salon"))!;
    const ring = rooms.filter((r) => /-(c[1-4]|s[12]|entry|far)$/.test(r.id));
    expect(Math.min(...area(salon))).toBeGreaterThanOrEqual(Math.max(...ring.flatMap(area)) - 1e-9);
  });

  it("names each floor and files it under an era of its own", () => {
    expect(layout.floors.map((f) => floorTitle(f))).toEqual([
      "Gothic to Baroque",
      "Rococo to Realism",
      "Impressionism to Modernism",
    ]);
    // A saved visit finds its floor by era id.
    expect(new Set(layout.floors.map((f) => f.era.id)).size).toBe(3);
  });

  it("starts a visit in the south vestibule, clear of the stair", () => {
    const [x, y, z] = layout.entry.worldPosition;
    expect(y).toBe(0);
    expect(x / CELL_SIZE).toBeGreaterThan(HUB.xMin);
    expect(x / CELL_SIZE).toBeLessThan(HUB.xMax + 1);
    expect(z / CELL_SIZE).toBeGreaterThan(HUB.zMax + 1);
  });

  it("has an identity of its own, so a visit saved in the tower starts afresh", () => {
    const works = catalogue();
    expect(galleryLayoutIdentity(layoutWings(works))).not.toBe(
      galleryLayoutIdentity(layoutMuseum(works)),
    );
  });
});
