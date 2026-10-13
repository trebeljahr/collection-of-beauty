import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { galleryLayoutIdentity } from "@/lib/gallery-release-state";
import { benchClearOfDividers, centredIsland } from "./feature-benches";
import { benchRect } from "./fittings";
import { grandStairsAt, grandSurfaceAt, openingReach, toStairLocal } from "./grand-stair";
import {
  BLOCK_DOOR_WIDTH,
  BLOCK_GRID,
  BLOCK_HALLS,
  BLOCK_PLAN,
  BLOCK_WALL_COVERAGE,
  blockArrivalPoint,
  blockFloorRooms,
  hallFront,
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
const zonesOf = (floorIndex: number) =>
  BLOCK_PLAN[floorIndex].zones.map((zone, z) => ({
    zone,
    rooms: [...new Set(zone.cells.map((cell) => roomOf(floorIndex, cell)))],
    z,
  }));
/** The side of room `a` that room `b` stands against, or null. */
const sideToward = (a: RoomLayout, b: RoomLayout): Door["side"] | null => {
  const p = a.cellBounds;
  const q = b.cellBounds;
  const z = p.zMin <= q.zMax && q.zMin <= p.zMax;
  const x = p.xMin <= q.xMax && q.xMin <= p.xMax;
  if (z && p.xMax + 1 === q.xMin) return "east";
  if (z && q.xMax + 1 === p.xMin) return "west";
  if (x && p.zMax + 1 === q.zMin) return "south";
  if (x && q.zMax + 1 === p.zMin) return "north";
  return null;
};
/** The hall of the diagram a stair hall is, and its stair. */
const hallOf = (room: RoomLayout) => BLOCK_HALLS.find((h) => h.key === keyOf(room))!;
const stairOf = (room: RoomLayout) =>
  layout.grandStairs!.find((s) => s.id.startsWith(`${keyOf(room)}-`))!;
/** True on the floor a hall's stair leaves: the hall has one door there. */
const stairStarts = (room: RoomLayout) => room.isStairwell && hallOf(room).from === room.floorIndex;
const wallOf = (room: RoomLayout) =>
  computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);

describe("the block plan", () => {
  it("is four floors: a spine of three halls and two galleries between two ranges", () => {
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
      // Every square that hangs works is in one era, once.
      const cells = plan.zones.flatMap((z) => [...z.cells]);
      expect(cells).toHaveLength(12 + (3 - halls));
      expect(new Set(cells).size).toBe(cells.length);
      expect(blockFloorRooms(floor.index).cells).toEqual(cells);
    }
    // One grand stair to a hall, and no spiral.
    expect(layout.allStaircases).toHaveLength(0);
    expect(layout.grandStairs).toHaveLength(3);
    expect(layout.floors.map((f) => f.grandStairsOut!.length)).toEqual([1, 1, 1, 0]);
    expect(layout.floors.map((f) => f.grandStairsIn!.length)).toEqual([0, 1, 1, 1]);
    expect(layout.floors.map((f) => f.grandHalls!.length)).toEqual([1, 2, 3, 3]);
  });

  it("stands a stair hall in the middle of the spine and one at each end", () => {
    const [west, centre, east] = BLOCK_HALLS.map((h) => h.rect);
    for (const r of [west, centre, east]) {
      expect((r.xMax - r.xMin + 1) * CELL_SIZE).toBe(27.5);
      expect((r.zMax - r.zMin + 1) * CELL_SIZE).toBe(27.5);
      // All three in the middle row.
      expect(r.zMin).toBe(centre.zMin);
    }
    expect(west.xMin).toBe(0);
    expect(east.xMax).toBe(BLOCK_GRID.x - 1);
    expect(centre.xMin + centre.xMax).toBe(BLOCK_GRID.x - 1);
    // A gallery of 17.5 m between each pair.
    expect((centre.xMin - west.xMax - 1) * CELL_SIZE).toBe(17.5);
    expect((east.xMin - centre.xMax - 1) * CELL_SIZE).toBe(17.5);
    for (const floor of layout.floors) {
      // No stair hall has a door to another, or a wall in common.
      const halls = floor.rooms.filter((r) => r.isStairwell);
      for (const hall of halls) {
        for (const other of halls) {
          if (other !== hall) expect(sideToward(hall, other), hall.id).toBeNull();
        }
      }
    }
  });

  it("enters a stair hall only where its stair starts", () => {
    for (const floor of layout.floors) {
      for (const hall of floor.rooms.filter((r) => r.isStairwell)) {
        const neighbours = floor.rooms.filter((r) => r !== hall && sideToward(hall, r));
        if (!stairStarts(hall)) {
          // Over the stair the hall is a balcony round its void: a door
          // to every neighbour, but across its sheer wall.
          expect(hall.doors, hall.id).toHaveLength(
            neighbours.filter((r) => sideToward(hall, r) !== hall.sheer?.side).length,
          );
          continue;
        }
        // One door, a portal, in the wall the stair faces.
        expect(hall.doors, hall.id).toHaveLength(1);
        const [door] = hall.doors;
        expect(door.side).toBe(hallFront(hallOf(hall)));
        expect(door.width).toBe(PORTAL_WIDTH);
        // The design is drawn with the visitor coming in from +z, the
        // foot of its first flight toward them: the door is there.
        const stair = stairOf(hall);
        const at = toStairLocal(stair, door.worldX, door.worldZ);
        expect(at.x).toBeCloseTo(0, 9);
        expect(at.z).toBeCloseTo(stair.half, 9);
      }
    }
    // The middle stair is entered from the great hall, the outer two
    // from the spine.
    const from = (floorIndex: number, key: string) =>
      keyOf(
        layout.floors[floorIndex].rooms.find(
          (r) => r.id === roomOf(floorIndex, key).doors[0].connectsTo.roomId,
        )!,
      );
    expect(from(0, "hall-c")).toBe("s3");
    expect(from(1, "hall-w")).toBe("cw");
    expect(from(2, "hall-e")).toBe("ce");
  });

  it("leaves no room a dead end, and every room in reach of the great hall", () => {
    for (const floor of layout.floors) {
      for (const room of floor.rooms.filter((r) => !r.isStairwell)) {
        expect(room.doors.length, room.id).toBeGreaterThanOrEqual(2);
      }
      // A corner room beside an end hall with one door is the far end
      // of a long gallery.
      const { keyOf: joinedKey } = blockFloorRooms(floor.index);
      for (const [hall, column] of [
        ["hall-w", 1],
        ["hall-e", 5],
      ] as const) {
        if (!stairStarts(roomOf(floor.index, hall))) continue;
        for (const row of ["n", "s"]) {
          const cell = `${row}${column}`;
          expect(joinedKey(cell), `${floor.index} ${cell}`).not.toBe(cell);
        }
      }
    }
    // Through doors, and up and down each stair between the two floors
    // of its hall it joins.
    const byId = new Map(layout.allRooms.map((r) => [r.id, r]));
    const start = layout.floors[0].rooms.find((r) => r.isAnchor)!;
    const seen = new Set([start.id]);
    const queue = [start];
    while (queue.length > 0) {
      const room = queue.pop()!;
      const next = room.doors.map((d) => byId.get(d.connectsTo.roomId)!);
      if (room.isStairwell) {
        const stair = stairOf(room);
        const other =
          room.floorIndex === stair.lowerFloor
            ? stair.upperFloor
            : room.floorIndex === stair.upperFloor
              ? stair.lowerFloor
              : null;
        if (other !== null) next.push(roomOf(other, keyOf(room)));
      }
      for (const n of next) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        queue.push(n);
      }
    }
    expect(layout.allRooms.filter((r) => !seen.has(r.id)).map((r) => r.id)).toEqual([]);
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
      // 5 m or more of floor between the opening and every wall, but
      // for the middle hall's sheer wall, which the void reaches.
      if (stair.sheerWall) expect(openingReach(stair.opening)).toBe(stair.half);
      else expect(stair.half - openingReach(stair.opening)).toBeGreaterThanOrEqual(5);
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

  it("seats every gallery on the lines of the room, never in a passage", () => {
    for (const floor of layout.floors) {
      for (const room of floor.rooms.filter((r) => !r.isStairwell)) {
        // A gallery of the spine with a portal in both long walls is a
        // crossing of two walking lines, and every line of its panels
        // is one of them: no seat.
        const crossing = room.doors.filter((d) => d.width === PORTAL_WIDTH).length === 2;
        if (!crossing) expect(room.benches.length, room.id).toBeGreaterThan(0);
        const b = room.cellBounds;
        const x0 = b.xMin * CELL_SIZE;
        const x1 = (b.xMax + 1) * CELL_SIZE;
        const z0 = b.zMin * CELL_SIZE;
        const z1 = (b.zMax + 1) * CELL_SIZE;
        if (Math.max(x1 - x0, z1 - z0) >= 45) {
          expect(room.benches.length, room.id).toBeGreaterThanOrEqual(2);
        }
        const rects = room.benches.map(benchRect);
        const panelLines = room.dividers.map((d) => ({ axis: d.axis, at: d.line * CELL_SIZE }));
        room.benches.forEach((bench, i) => {
          const r = rects[i];
          // 4 m or more of floor to every wall: a bench in the 5 m
          // aisle between a panel and a wall could not have it.
          expect(
            Math.min(r.xMin - x0, x1 - r.xMax, r.zMin - z0, z1 - r.zMax),
            room.id,
          ).toBeGreaterThanOrEqual(4);
          expect(benchClearOfDividers(bench, room, 2.2), room.id).toBe(true);
          // In a room with panels a bench runs the way the panels do,
          // and stands in line with a row of them or in the middle of a
          // wide aisle.
          if (panelLines.length > 0) {
            expect(
              panelLines.every((p) => p.axis === bench.along),
              room.id,
            ).toBe(true);
            const across = bench.along === "x" ? bench.z : bench.x;
            const inRow = panelLines.some((p) => Math.abs(p.at - across) < 1e-6);
            const nearest = Math.min(...panelLines.map((p) => Math.abs(p.at - across)));
            expect(inRow || nearest >= 4.5, room.id).toBe(true);
          }
          rects.slice(i + 1).forEach((q) => {
            expect(r.xMin < q.xMax && q.xMin < r.xMax && r.zMin < q.zMax && q.zMin < r.zMax).toBe(
              false,
            );
          });
        });
      }
    }
    // A room with no way straight through it is seated on its centre.
    const corner = { xMin: 0, xMax: 6, zMin: 0, zMax: 6 };
    const cornerDoors = [
      { side: "east", worldX: 17.5, worldZ: 8.75, width: BLOCK_DOOR_WIDTH },
      { side: "south", worldX: 8.75, worldZ: 17.5, width: BLOCK_DOOR_WIDTH },
    ] as const;
    const island = centredIsland(corner, cornerDoors)!;
    expect(island).toHaveLength(2);
    expect(island.reduce((sum, bench) => sum + bench.x, 0) / 2).toBeCloseTo(8.75, 6);
    expect(island.reduce((sum, bench) => sum + bench.z, 0) / 2).toBeCloseTo(8.75, 6);
    // A small room with a door in three walls is walked straight through
    // one way: its island stands on its centre line, in front of the
    // wall without a door.
    const small = roomOf(0, "s2");
    expect(small.dividers).toHaveLength(0);
    expect(small.doors.map((d) => d.side).sort()).toEqual(["east", "north", "west"]);
    expect(small.benches).toHaveLength(2);
    const cx = ((small.cellBounds.xMin + small.cellBounds.xMax + 1) / 2) * CELL_SIZE;
    const cz = ((small.cellBounds.zMin + small.cellBounds.zMax + 1) / 2) * CELL_SIZE;
    for (const bench of small.benches) {
      expect(bench.x).toBeCloseTo(cx, 6);
      expect(bench.z).toBeGreaterThan(cz + 2.5);
    }
    // A long gallery's benches stand in the gaps of its rows of panels,
    // and none in the line of a door in the wall beside it.
    const gallery = roomOf(1, "s1");
    expect(gallery.benches.length).toBeGreaterThanOrEqual(3);
    for (const bench of gallery.benches) {
      for (const door of gallery.doors.filter((d) => d.side === "north" || d.side === "south")) {
        const sameSide =
          (door.side === "north") ===
          bench.z < (gallery.worldRect.zMin + gallery.worldRect.zMax) / 2;
        if (sameSide) expect(Math.abs(bench.x - door.worldX)).toBeGreaterThan(door.width / 2 + 1);
      }
    }
  });

  it("hangs a work centred in front of every bench", () => {
    // The room places the bench and the bench places the work: on the
    // nearest wall or panel a bench looks at, a work hangs with its
    // middle on the bench's middle.
    const unmatched: string[] = [];
    let benches = 0;
    for (const room of layout.allRooms.filter((r) => !r.isStairwell)) {
      for (const bench of room.benches) {
        benches++;
        const faced = room.placements.some((p) => {
          const nx = Math.round(Math.sin(p.rotation[1]));
          const nz = Math.round(Math.cos(p.rotation[1]));
          // The work faces the bench, from 0.5 to 9.6 m away, and is
          // centred on it along its wall.
          const [ahead, off] =
            bench.along === "x"
              ? [(bench.z - p.position[2]) * nz, p.position[0] - bench.x]
              : [(bench.x - p.position[0]) * nx, p.position[2] - bench.z];
          return ahead > 0.5 && ahead < 9.6 && Math.abs(off) < 0.02;
        });
        if (!faced) unmatched.push(`${room.id} (${bench.x}, ${bench.z})`);
      }
    }
    expect(benches).toBeGreaterThan(60);
    expect(unmatched).toEqual([]);
  });

  it("gives the bench's work to one of the room's largest, and overlaps none", () => {
    const overlaps: string[] = [];
    let led = 0;
    let rooms = 0;
    for (const room of layout.allRooms.filter((r) => !r.isStairwell && !r.isAnchor)) {
      // Works on one surface, by their place along it.
      const bySurface = new Map<string, Array<{ at: number; half: number; id: string }>>();
      for (const p of room.placements) {
        const alongX = Math.abs(Math.cos(p.rotation[1])) > 0.5;
        const key = `${p.divider ?? "wall"}:${p.rotation[1].toFixed(3)}:${(
          alongX ? p.position[2] : p.position[0]
        ).toFixed(2)}`;
        const list = bySurface.get(key) ?? [];
        list.push({
          at: alongX ? p.position[0] : p.position[2],
          half: p.widthM / 2,
          id: p.artwork.id,
        });
        bySurface.set(key, list);
      }
      for (const list of bySurface.values()) {
        list.sort((a, b) => a.at - b.at);
        for (let i = 0; i + 1 < list.length; i++) {
          if (list[i].at + list[i].half > list[i + 1].at - list[i + 1].half) {
            overlaps.push(`${room.id}: ${list[i].id} / ${list[i + 1].id}`);
          }
        }
      }
      // The room's largest work hangs in front of a bench.
      const largest = [...room.placements].sort(
        (p, q) => q.widthM * q.heightM - p.widthM * p.heightM,
      )[0];
      rooms++;
      const inFront = room.benches.some((bench) =>
        bench.along === "x"
          ? Math.abs(largest.position[0] - bench.x) < 0.02
          : Math.abs(largest.position[2] - bench.z) < 0.02,
      );
      if (inFront) led++;
    }
    expect(overlaps).toEqual([]);
    // In nearly every room: a work wider than the stretch of wall a
    // bench looks at hangs elsewhere.
    expect(led / rooms).toBeGreaterThan(0.8);
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

  it("gives every room a door to every neighbour, but into the side or back of a stair", () => {
    for (const floor of layout.floors) {
      // The one wall of a hall that has a door on the floor its stair
      // leaves; on the floors above any wall but a sheer one, which has
      // the hall's void against it.
      const opens = (a: RoomLayout, b: RoomLayout) =>
        stairStarts(a)
          ? sideToward(a, b) === hallFront(hallOf(a))
          : sideToward(a, b) !== a.sheer?.side;
      for (const a of floor.rooms) {
        const neighbours = floor.rooms
          .filter((b) => b !== a && sideToward(a, b) && opens(a, b) && opens(b, a))
          .map((b) => b.id);
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

  it("lines the doors up along the spine, the short axis and both ranges", () => {
    for (const floor of layout.floors) {
      const door = (from: string, to: string) => {
        const a = roomOf(floor.index, from);
        const b = roomOf(floor.index, to);
        return a.doors.find((d) => d.connectsTo.roomId === b.id);
      };
      // The spine: portals in one line from end to end. On the first
      // floor the middle hall has its one door to the south, so the
      // line stops either side of it.
      const spine = ["hall-w", "cw", "hall-c", "ce", "hall-e"];
      const spineDoors = spine.slice(1).flatMap((key, i) => door(spine[i], key) ?? []);
      expect(spineDoors).toHaveLength(floor.index === 0 ? 2 : 4);
      expect(new Set(spineDoors.map((d) => d.worldZ)).size).toBe(1);
      for (const d of spineDoors) expect(d.width).toBe(PORTAL_WIDTH);
      // The short axis through the middle stair hall.
      expect(door("hall-c", "s3")!.width).toBe(PORTAL_WIDTH);
      // Its north end is the hall's sheer wall: no door on any floor.
      expect(door("n3", "hall-c")).toBeUndefined();
      // Both ranges of five: the doors that are left once rooms are joined.
      for (const row of ["n", "s"]) {
        const doors = [1, 2, 3, 4].flatMap((i) => door(`${row}${i}`, `${row}${i + 1}`) ?? []);
        expect(new Set(doors.map((d) => d.worldZ)).size, row).toBe(1);
      }
      // The three rows share their columns, so a room that is one square
      // of the diagram has each door in the middle of its wall.
      const { rooms } = blockFloorRooms(floor.index);
      for (const { key, cells } of rooms.filter((r) => r.cells.length === 1)) {
        const room = roomOf(floor.index, key);
        const cx = ((room.cellBounds.xMin + room.cellBounds.xMax + 1) / 2) * CELL_SIZE;
        const cz = ((room.cellBounds.zMin + room.cellBounds.zMax + 1) / 2) * CELL_SIZE;
        for (const d of room.doors) {
          const other = floor.rooms.find((r) => r.id === d.connectsTo.roomId)!;
          // A door to a long gallery is in the middle of this room's
          // wall too: the gallery's wall is longer, never shorter.
          const along = d.side === "north" || d.side === "south" ? d.worldX - cx : d.worldZ - cz;
          expect(along, `${cells[0]} to ${other.id}`).toBeCloseTo(0, 9);
        }
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
        // One row deep, 45 m or more long, with a row of panels down
        // each side of its nave.
        expect(b.zMax - b.zMin + 1).toBe(7);
        expect((b.xMax - b.xMin + 1) * CELL_SIZE).toBeGreaterThanOrEqual(45);
        expect(gallery.dividers.length).toBeGreaterThanOrEqual(4);
        expect(gallery.roomNumber).not.toBeNull();
      }
    }
    expect(shapes.size).toBe(layout.floors.length);
    // The north gallery of the first floor: three rooms, 62.5 m, behind
    // the middle stair hall. Three panels a side between its two doors
    // to the spine, a panel's length apart.
    const north = roomOf(0, "n3");
    expect((north.cellBounds.xMax - north.cellBounds.xMin + 1) * CELL_SIZE).toBe(62.5);
    expect(north.dividers).toHaveLength(6);
    const starts = [...new Set(north.dividers.map((d) => d.start))].sort((p, q) => p - q);
    expect(starts.slice(1).map((v, i) => v - starts[i])).toEqual([6, 6]);
  });

  it("stands dividers in the large rooms and leaves a composed great hall open", () => {
    for (const floor of layout.floors) {
      for (const key of ["n1", "n3", "n5", "s1", "s5", "cw", "ce"]) {
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
      // An era's rooms are one group: each is reached from the first
      // through doors between them.
      for (const { zone, rooms } of zones) {
        const reached = new Set([rooms[0].id]);
        const queue = [rooms[0]];
        while (queue.length > 0) {
          for (const d of queue.pop()!.doors) {
            const next = rooms.find((r) => r.id === d.connectsTo.roomId);
            if (!next || reached.has(next.id)) continue;
            reached.add(next.id);
            queue.push(next);
          }
        }
        expect(reached.size, zone.era).toBe(rooms.length);
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
