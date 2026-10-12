import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { galleryLayoutIdentity } from "@/lib/gallery-release-state";
import {
  BLOCK_DOOR_WIDTH,
  BLOCK_GRID,
  BLOCK_PLAN,
  BLOCK_ROUTE,
  BLOCK_WALL_COVERAGE,
  blockFloorRooms,
  layoutBlock,
} from "./layout-block";
import { layoutMuseum } from "./layout-museum";
import { computeRoomRuns, runLength, wallFootprint } from "./place-paintings";
import { eraOfRoom, floorTitle } from "./room-era";
import type { RoomLayout } from "./types";
import { CELL_SIZE, doorOpenHalfSpan, PORTAL_WIDTH } from "./world-coords";

/** 160 sharp works for every era, in mixed sizes, by 40 artists each.
 *  Every fourth is a sharper scan of the same size. */
function catalogue(): ArtworkListing[] {
  const sizes = [
    [300, 220],
    [160, 120],
    [90, 120],
    [60, 45],
    [40, 55],
  ];
  return ERAS.flatMap((era) =>
    Array.from({ length: 160 }, (_, i) => {
      const [widthCm, heightCm] = sizes[i % sizes.length];
      const width = i % 4 === 0 ? 6000 : 3400;
      return {
        id: `${era.id}-${i}`,
        objectKey: `folder/${era.id}-${i}.jpg`,
        movement: era.movements[0],
        year: null,
        artistSlug: `${era.id}-artist-${i % 40}`,
        width,
        height: Math.round((width * heightCm) / widthCm),
        realDimensions: { widthCm, heightCm },
      } as unknown as ArtworkListing;
    }),
  );
}

const layout = layoutBlock(catalogue());
const keyOf = (room: RoomLayout) => room.id.replace(/^f\d-/, "");
/** The room of a floor that holds this room of the diagram. */
const roomOf = (floorIndex: number, cell: string) => {
  const key = blockFloorRooms(BLOCK_PLAN[floorIndex]).keyOf(cell);
  return layout.floors[floorIndex].rooms.find((r) => keyOf(r) === key)!;
};
/** The rooms each era of a floor hangs in. */
const zonesOf = (floorIndex: number) => {
  const plan = BLOCK_PLAN[floorIndex];
  let cursor = 0;
  return plan.zones.map((zone, z) => {
    const cells = BLOCK_ROUTE.slice(cursor, cursor + zone.rooms);
    cursor += zone.rooms;
    return { zone, rooms: [...new Set(cells.map((cell) => roomOf(floorIndex, cell)))], z };
  });
};
const wallOf = (room: RoomLayout) =>
  computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);

describe("the block plan", () => {
  it("is four floors of three stair halls and twelve rooms, less the ones joined", () => {
    expect(layout.floors).toHaveLength(4);
    for (const floor of layout.floors) {
      const plan = BLOCK_PLAN[floor.index];
      const joined = plan.merges.reduce((n, merge) => n + merge.length - 1, 0);
      expect(floor.gridSize).toEqual(BLOCK_GRID);
      expect(floor.rooms.filter((r) => r.isStairwell)).toHaveLength(3);
      expect(floor.rooms.filter((r) => !r.isStairwell)).toHaveLength(12 - joined);
    }
    // Three wells, three flights each.
    expect(layout.allStaircases).toHaveLength(9);
    expect(layout.floors[0].stairsOut).toHaveLength(3);
    expect(layout.floors[3].stairsIn).toHaveLength(3);
    expect(layout.floors[3].stairsOut).toHaveLength(0);
  });

  it("names each floor and files it under an era of its own", () => {
    expect(layout.floors.map(floorTitle)).toEqual(BLOCK_PLAN.map((p) => p.title));
    expect(new Set(layout.floors.map((f) => f.era.id)).size).toBe(4);
  });

  it("fills the grid with no gap and no overlap", () => {
    for (const floor of layout.floors) {
      const owned = new Set<string>();
      for (const room of floor.rooms) {
        const b = room.cellBounds;
        for (let x = b.xMin; x <= b.xMax; x++) {
          for (let z = b.zMin; z <= b.zMax; z++) {
            expect(owned.has(`${x}:${z}`), `${room.id} ${x}:${z}`).toBe(false);
            owned.add(`${x}:${z}`);
          }
        }
      }
      expect(owned.size).toBe(BLOCK_GRID.x * BLOCK_GRID.z);
    }
  });

  it("gives every room a door to every neighbour", () => {
    const touches = (a: RoomLayout, b: RoomLayout) => {
      const p = a.cellBounds;
      const q = b.cellBounds;
      const z = p.zMin <= q.zMax && q.zMin <= p.zMax;
      const x = p.xMin <= q.xMax && q.xMin <= p.xMax;
      return (
        ((p.xMax + 1 === q.xMin || q.xMax + 1 === p.xMin) && z) ||
        ((p.zMax + 1 === q.zMin || q.zMax + 1 === p.zMin) && x)
      );
    };
    for (const floor of layout.floors) {
      for (const a of floor.rooms) {
        const neighbours = floor.rooms.filter((b) => b !== a && touches(a, b)).map((b) => b.id);
        expect(a.doors.map((d) => d.connectsTo.roomId).sort(), a.id).toEqual(neighbours.sort());
      }
    }
  });

  it("puts each door in the middle of a cell, on both rooms, and opens the grid there", () => {
    for (const floor of layout.floors) {
      const byId = new Map(floor.rooms.map((r) => [r.id, r]));
      const gx = floor.gridSize.x;
      for (const room of floor.rooms) {
        for (const door of room.doors) {
          const along = door.side === "north" || door.side === "south" ? door.worldX : door.worldZ;
          expect((along / CELL_SIZE) % 1, `${room.id} ${door.side}`).toBeCloseTo(0.5, 9);
          const twin = byId
            .get(door.connectsTo.roomId)!
            .doors.find((d) => d.connectsTo.roomId === room.id);
          expect(twin?.worldX).toBe(door.worldX);
          expect(twin?.worldZ).toBe(door.worldZ);
          expect([BLOCK_DOOR_WIDTH, PORTAL_WIDTH]).toContain(door.width);
          if (door.width === BLOCK_DOOR_WIDTH) {
            expect(doorOpenHalfSpan(door.width)).toBe(CELL_SIZE / 2);
          }
          if (door.side === "east") {
            const x = Math.round(door.worldX / CELL_SIZE) - 1;
            const z = Math.floor(door.worldZ / CELL_SIZE);
            expect(floor.blockedEdgesEW[z * (gx - 1) + x], `${room.id} east`).toBe(0);
          }
          if (door.side === "south") {
            const x = Math.floor(door.worldX / CELL_SIZE);
            const z = Math.round(door.worldZ / CELL_SIZE) - 1;
            expect(floor.blockedEdgesNS[z * gx + x], `${room.id} south`).toBe(0);
          }
        }
      }
    }
  });

  it("lines the doors up along the long axis, the short axis and both rows", () => {
    for (const floor of layout.floors) {
      const door = (from: string, to: string) => {
        const a = roomOf(floor.index, from);
        const b = roomOf(floor.index, to);
        return a.doors.find((d) => d.connectsTo.roomId === b.id);
      };
      // The long axis: five rooms through the three stair halls, as portals.
      const spine = ["stair-w", "mw", "stair-c", "me", "stair-e"];
      const spineDoors = spine.slice(1).map((key, i) => door(spine[i], key)!);
      expect(new Set(spineDoors.map((d) => d.worldZ)).size).toBe(1);
      for (const d of spineDoors) expect(d.width).toBe(PORTAL_WIDTH);
      // The short axis through the middle stair hall.
      expect(door("n3", "stair-c")!.worldX).toBe(door("stair-c", "s3")!.worldX);
      expect(door("stair-c", "s3")!.width).toBe(PORTAL_WIDTH);
      // Both rows of five: the doors that are left once rooms are joined.
      for (const row of ["n", "s"]) {
        const doors = [1, 2, 3, 4].flatMap((i) => door(`${row}${i}`, `${row}${i + 1}`) ?? []);
        expect(new Set(doors.map((d) => d.worldZ)).size, row).toBe(1);
      }
    }
  });

  it("joins neighbours of a row into long galleries, differently on each floor", () => {
    const shapes = new Set<string>();
    for (const floor of layout.floors) {
      const plan = BLOCK_PLAN[floor.index];
      expect(plan.merges.length).toBeGreaterThan(0);
      shapes.add(JSON.stringify(plan.merges));
      for (const merge of plan.merges) {
        const gallery = roomOf(floor.index, merge[0]);
        for (const cell of merge) expect(roomOf(floor.index, cell)).toBe(gallery);
        const b = gallery.cellBounds;
        // One row deep, 40 m or more long, in bays between wing walls.
        expect(b.zMax - b.zMin + 1).toBe(7);
        expect((b.xMax - b.xMin + 1) * CELL_SIZE).toBeGreaterThanOrEqual(40);
        expect(gallery.dividers.length).toBeGreaterThan(0);
        expect(gallery.roomNumber).not.toBeNull();
      }
    }
    expect(shapes.size).toBe(layout.floors.length);
    // The north gallery of the first floor: three rooms, 57.5 m.
    const north = roomOf(0, "n3");
    expect((north.cellBounds.xMax - north.cellBounds.xMin + 1) * CELL_SIZE).toBe(57.5);
  });

  it("stands dividers in the large rooms and leaves a composed great hall open", () => {
    for (const floor of layout.floors) {
      for (const key of ["n1", "n3", "n5", "s1", "s5", "mw", "me"]) {
        expect(roomOf(floor.index, key).dividers.length, key).toBeGreaterThan(0);
      }
      const hall = roomOf(floor.index, "s3");
      expect(hall.isAnchor).toBe(true);
      expect(floor.rooms.filter((r) => r.isAnchor)).toHaveLength(1);
      // Joined to its neighbour it is a long gallery, hung like one.
      const joined = keyOf(hall) !== "s3";
      expect(hall.dividers.length > 0).toBe(joined);
      if (!joined) expect(hall.benches.length).toBeGreaterThan(0);
    }
  });

  it("hangs each era in rooms that touch, in route order", () => {
    for (const floor of layout.floors) {
      const zones = zonesOf(floor.index);
      for (const { zone, rooms } of zones) {
        for (const room of rooms) {
          expect(eraOfRoom(room).id, room.id).toBe(zone.era);
          expect(room.placements.length, room.id).toBeGreaterThan(0);
          for (const p of room.placements) {
            expect(p.artwork.id.startsWith(`${zone.era}-`), p.artwork.id).toBe(true);
          }
        }
      }
      // No long gallery lies across two eras.
      const all = zones.flatMap((z) => z.rooms);
      expect(new Set(all).size).toBe(all.length);
      expect(all).toHaveLength(floor.rooms.filter((r) => !r.isStairwell).length);
      // Rooms are numbered along the walk, and the great hall ends it.
      const numbered = [...all].sort((a, b) => a.roomNumber! - b.roomNumber!);
      expect(numbered.map((r) => r.roomNumber)).toEqual(all.map((_, i) => i + 1));
      expect(numbered[numbered.length - 1].isAnchor).toBe(true);
    }
  });

  it("covers no more of an era's wall than the target", () => {
    for (const floor of layout.floors) {
      for (const { zone, rooms } of zonesOf(floor.index)) {
        const wall = rooms.reduce((sum, r) => sum + wallOf(r), 0);
        const hung = rooms
          .flatMap((r) => r.placements)
          .reduce((sum, p) => sum + wallFootprint(p.artwork), 0);
        expect(hung / wall, zone.era).toBeLessThanOrEqual(
          (zone.coverage ?? BLOCK_WALL_COVERAGE) + 1e-9,
        );
      }
    }
  });

  it("hangs no work twice", () => {
    const ids = layout.allRooms.flatMap((r) => r.placements.map((p) => p.artwork.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives an artist's wall to their sharpest scans", () => {
    // Each artist has four works of which one is the sharper scan; the
    // wall takes fewer than all, and the sharper one is always among them.
    const hung = new Set(layout.allRooms.flatMap((r) => r.placements.map((p) => p.artwork.id)));
    const works = catalogue();
    let checked = 0;
    for (const era of ERAS) {
      for (let artist = 0; artist < 40; artist++) {
        const own = works.filter((a) => a.artistSlug === `${era.id}-artist-${artist}`);
        const kept = own.filter((a) => hung.has(a.id));
        if (kept.length === 0 || kept.length === own.length) continue;
        const best = Math.max(...own.map((a) => (a.width ?? 0) / (a.realDimensions?.widthCm ?? 1)));
        const keptBest = Math.max(
          ...kept.map((a) => (a.width ?? 0) / (a.realDimensions?.widthCm ?? 1)),
        );
        expect(keptBest, `${era.id} artist ${artist}`).toBe(best);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("starts a visit in the great hall, south of the middle stair", () => {
    const [x, y, z] = layout.entry.worldPosition;
    const hall = layout.floors[0].rooms.find((r) => r.isAnchor)!;
    expect(y).toBe(0);
    expect(x).toBeGreaterThan(hall.worldRect.xMin);
    expect(x).toBeLessThan(hall.worldRect.xMax);
    expect(z).toBeGreaterThan(hall.worldRect.zMin);
    expect(z).toBeLessThan(hall.worldRect.zMax);
  });

  it("has an identity of its own, so a visit saved in the tower starts afresh", () => {
    const works = catalogue();
    expect(galleryLayoutIdentity(layoutBlock(works))).not.toBe(
      galleryLayoutIdentity(layoutMuseum(works)),
    );
  });
});
