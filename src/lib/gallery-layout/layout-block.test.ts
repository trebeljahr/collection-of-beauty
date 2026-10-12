import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { galleryLayoutIdentity } from "@/lib/gallery-release-state";
import { benchFacing } from "./feature-benches";
import { benchRect, dividerRect } from "./fittings";
import { grandStairsAt, grandSurfaceAt, openingReach } from "./grand-stair";
import {
  BLOCK_DOOR_WIDTH,
  BLOCK_GRID,
  BLOCK_HALLS,
  BLOCK_PLAN,
  BLOCK_WALL_COVERAGE,
  blockArrivalPoint,
  blockFloorRooms,
  layoutBlock,
} from "./layout-block";
import { layoutMuseum } from "./layout-museum";
import { computeRoomRuns, runLength, wallFootprint } from "./place-paintings";
import { eraOfRoom, floorTitle } from "./room-era";
import type { Door, RoomLayout } from "./types";
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
/** True when a point is within 2 m of a door, across its wall or along it. */
const nearDoor = (door: Door, p: { x: number; z: number }) =>
  Math.abs(door.worldX - p.x) <= 2 && Math.abs(door.worldZ - p.z) <= 2;
/** The room of a floor that holds this room of the diagram. */
const roomOf = (floorIndex: number, cell: string) => {
  const key = blockFloorRooms(floorIndex).keyOf(cell);
  return layout.floors[floorIndex].rooms.find((r) => keyOf(r) === key)!;
};
/** The rooms each era of a floor hangs in. */
const zonesOf = (floorIndex: number) => {
  const plan = BLOCK_PLAN[floorIndex];
  const walk = blockFloorRooms(floorIndex).cells;
  let cursor = 0;
  return plan.zones.map((zone, z) => {
    const cells = walk.slice(cursor, cursor + zone.rooms);
    cursor += zone.rooms;
    return { zone, rooms: [...new Set(cells.map((cell) => roomOf(floorIndex, cell)))], z };
  });
};
const wallOf = (room: RoomLayout) =>
  computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);

describe("the block plan", () => {
  it("is four floors: a core of three halls and a ring of twelve rooms", () => {
    expect(layout.floors).toHaveLength(4);
    for (const floor of layout.floors) {
      const plan = BLOCK_PLAN[floor.index];
      const joined = plan.merges.reduce((n, merge) => n + merge.length - 1, 0);
      // A hall is a stair hall from the floor its stair leaves; under
      // that its square hangs works.
      const halls = BLOCK_HALLS.filter((h) => h.from <= floor.index).length;
      expect(floor.gridSize).toEqual(BLOCK_GRID);
      expect(floor.rooms.filter((r) => r.isStairwell)).toHaveLength(halls);
      expect(floor.rooms.filter((r) => !r.isStairwell)).toHaveLength(12 + (3 - halls) - joined);
      expect(plan.zones.reduce((n, z) => n + z.rooms, 0)).toBe(12 + (3 - halls));
    }
    // One grand stair to a hall, and no spiral.
    expect(layout.allStaircases).toHaveLength(0);
    expect(layout.grandStairs).toHaveLength(3);
    expect(layout.floors.map((f) => f.grandStairsOut!.length)).toEqual([1, 1, 1, 0]);
    expect(layout.floors.map((f) => f.grandStairsIn!.length)).toEqual([0, 1, 1, 1]);
    expect(layout.floors.map((f) => f.grandHalls!.length)).toEqual([1, 2, 3, 3]);
  });

  it("stands the three halls side by side, and the ring round them", () => {
    const core = BLOCK_HALLS.map((h) => h.rect);
    // The halls are 27.5 m square and touch.
    for (const r of core) {
      expect((r.xMax - r.xMin + 1) * CELL_SIZE).toBe(27.5);
      expect((r.zMax - r.zMin + 1) * CELL_SIZE).toBe(27.5);
    }
    expect(core[0].xMax + 1).toBe(core[1].xMin);
    expect(core[1].xMax + 1).toBe(core[2].xMin);
    const outside = (b: RoomLayout["cellBounds"]) =>
      b.xMin === 0 || b.zMin === 0 || b.xMax === BLOCK_GRID.x - 1 || b.zMax === BLOCK_GRID.z - 1;
    for (const r of core) expect(outside(r)).toBe(false);
    for (const floor of layout.floors) {
      // Every room of the ring touches the outside of the block: the
      // walk from room to room never crosses a hall.
      const ring = floor.rooms.filter((r) => !r.isStairwell && !keyOf(r).startsWith("hall-"));
      for (const room of ring) expect(outside(room.cellBounds), room.id).toBe(true);
      // The ring is a loop: each of its rooms has a door to two others.
      for (const room of ring) {
        const ringDoors = room.doors.filter((d) =>
          ring.some((other) => other.id === d.connectsTo.roomId),
        );
        expect(ringDoors, room.id).toHaveLength(2);
      }
    }
  });

  it("gives each hall one stair, open above it to the roof", () => {
    const top = layout.floors.length - 1;
    expect(new Set(layout.grandStairs!.map((s) => s.design)).size).toBe(3);
    // The way up goes through all three: each stair starts on the floor
    // the last one arrives on.
    const byFloor = [...layout.grandStairs!].sort((a, b) => a.lowerFloor - b.lowerFloor);
    expect(byFloor.map((s) => [s.lowerFloor, s.upperFloor])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(byFloor[0].id.startsWith("hall-c")).toBe(true);
    for (const stair of layout.grandStairs!) {
      expect(stair.topFloor).toBe(top);
      expect(stair.hasFlightAbove).toBe(false);
      expect(stair.hasFlightBelow).toBe(false);
      // 5 m or more of floor between the opening and every wall.
      expect(stair.half - openingReach(stair.opening)).toBeGreaterThanOrEqual(5);
      const key = stair.id.replace(/-\d-to-\d$/, "");
      for (const floor of layout.floors) {
        const hall = floor.rooms.find((r) => keyOf(r) === key)!;
        const inHall = floor.index >= stair.lowerFloor;
        expect(hall.isStairwell, hall.id).toBe(inHall);
        if (!inHall) {
          // Under the hall: a gallery with works on its walls.
          expect(hall.placements.length).toBeGreaterThan(0);
          expect(hall.floorOpening).toBeUndefined();
          continue;
        }
        expect(hall.cellBounds.xMin * CELL_SIZE).toBe(stair.centerX - stair.half);
        expect((hall.cellBounds.zMax + 1) * CELL_SIZE).toBe(stair.centerZ + stair.half);
        // A hole in the floor from the stair's head up, and in the
        // ceiling all the way to the top floor, which is glazed.
        expect(hall.floorOpening === null).toBe(floor.index === stair.lowerFloor);
        expect(hall.ceilingOpening === null).toBe(floor.index === top);
        expect(hall.stairGlyph).toBe(
          floor.index === stair.lowerFloor
            ? "up"
            : floor.index === stair.upperFloor
              ? "down"
              : "void",
        );
        // A visitor sent to the hall lands on its floor, inside the
        // portal its stair faces.
        const arrival = blockArrivalPoint(layout, hall);
        const stairs = grandStairsAt(layout.grandStairs!, arrival.x, arrival.z, floor.y);
        expect(stairs).toEqual([stair]);
        expect(grandSurfaceAt(stairs, arrival.x, arrival.z, floor.y)?.floorIndex).toBe(floor.index);
        const door = hall.doors.find((d) => d.width === PORTAL_WIDTH && nearDoor(d, arrival));
        expect(door, `${hall.id} arrives by a portal`).toBeDefined();
      }
    }
    // The middle stair rises north, away from the great hall; the outer
    // two rise away from the middle hall.
    const turns = Object.fromEntries(layout.grandStairs!.map((s) => [s.id.slice(0, 6), s.turns]));
    expect(turns).toEqual({ "hall-w": 3, "hall-c": 0, "hall-e": 1 });
  });

  it("seats visitors in every gallery, in front of its largest works", () => {
    for (const floor of layout.floors) {
      for (const room of floor.rooms.filter((r) => !r.isStairwell)) {
        expect(room.benches.length, room.id).toBeGreaterThan(0);
        const long = (room.cellBounds.xMax - room.cellBounds.xMin + 1) * CELL_SIZE;
        if (long >= 45) expect(room.benches.length, room.id).toBeGreaterThanOrEqual(3);
        // No bench stands in a wall, a divider or another bench, or in
        // the line a door is walked through.
        const b = room.cellBounds;
        const rects = room.benches.map(benchRect);
        rects.forEach((r, i) => {
          expect(r.xMin).toBeGreaterThan(b.xMin * CELL_SIZE + 1);
          expect(r.xMax).toBeLessThan((b.xMax + 1) * CELL_SIZE - 1);
          expect(r.zMin).toBeGreaterThan(b.zMin * CELL_SIZE + 1);
          expect(r.zMax).toBeLessThan((b.zMax + 1) * CELL_SIZE - 1);
          for (const d of room.dividers.map(dividerRect)) {
            expect(r.xMin < d.xMax && d.xMin < r.xMax && r.zMin < d.zMax && d.zMin < r.zMax).toBe(
              false,
            );
          }
          rects.slice(i + 1).forEach((q) => {
            expect(r.xMin < q.xMax && q.xMin < r.xMax && r.zMin < q.zMax && q.zMin < r.zMax).toBe(
              false,
            );
          });
        });
      }
    }
    // A bench of this pass faces one of its room's five largest works.
    const gallery = roomOf(0, "n3");
    const largest = [...gallery.placements]
      .sort((p, q) => q.widthM * q.heightM - p.widthM * p.heightM)
      .slice(0, 8)
      .map(benchFacing);
    const faced = gallery.benches.filter((bench) =>
      largest.some((f) => Math.abs(f.x - bench.x) < 1e-6 && Math.abs(f.z - bench.z) < 1e-6),
    );
    expect(faced.length).toBeGreaterThan(0);
  });

  it("names each floor and files it under an era of its own", () => {
    expect(layout.floors.map(floorTitle)).toEqual(BLOCK_PLAN.map((p) => p.title));
    expect(new Set(layout.floors.map((f) => f.era.id)).size).toBe(4);
  });

  it("fills the grid with no gap and no overlap", () => {
    for (const floor of layout.floors) {
      const owned = new Set<string>();
      const overlaps: string[] = [];
      for (const room of floor.rooms) {
        const b = room.cellBounds;
        for (let x = b.xMin; x <= b.xMax; x++) {
          for (let z = b.zMin; z <= b.zMax; z++) {
            if (owned.has(`${x}:${z}`)) overlaps.push(`${room.id} ${x}:${z}`);
            owned.add(`${x}:${z}`);
          }
        }
      }
      expect(overlaps, "cells owned twice").toEqual([]);
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
      // The long axis: the two end rooms and the core between, as portals.
      const spine = ["w", "hall-w", "hall-c", "hall-e", "e"];
      const spineDoors = spine.slice(1).map((key, i) => door(spine[i], key)!);
      expect(new Set(spineDoors.map((d) => d.worldZ)).size).toBe(1);
      for (const d of spineDoors) expect(d.width).toBe(PORTAL_WIDTH);
      // The short axis through the middle stair hall.
      expect(door("n3", "hall-c")!.worldX).toBe(door("hall-c", "s3")!.worldX);
      expect(door("hall-c", "s3")!.width).toBe(PORTAL_WIDTH);
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
        // One row deep, 45 m or more long, in bays between wing walls.
        expect(b.zMax - b.zMin + 1).toBe(7);
        expect((b.xMax - b.xMin + 1) * CELL_SIZE).toBeGreaterThanOrEqual(45);
        expect(gallery.dividers.length).toBeGreaterThan(0);
        expect(gallery.roomNumber).not.toBeNull();
      }
    }
    expect(shapes.size).toBe(layout.floors.length);
    // The north gallery of the first floor: two rooms, 55 m.
    const north = roomOf(0, "n3");
    expect((north.cellBounds.xMax - north.cellBounds.xMin + 1) * CELL_SIZE).toBe(55);
  });

  it("stands dividers in the large rooms and leaves a composed great hall open", () => {
    for (const floor of layout.floors) {
      for (const key of ["n2", "n3", "n4", "s2", "s4", "w", "e"]) {
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
          const strays = room.placements
            .map((p) => p.artwork.id)
            .filter((id) => !id.startsWith(`${zone.era}-`));
          expect(strays, room.id).toEqual([]);
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
    // `layout` is the block plan of this same catalogue. Only the tower
    // is built here.
    expect(galleryLayoutIdentity(layout)).not.toBe(
      galleryLayoutIdentity(layoutMuseum(catalogue())),
    );
  });
});
