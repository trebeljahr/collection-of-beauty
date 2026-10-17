import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { arrangementOf } from "./divider-plans";
import {
  BENCH_WALL_VIEW,
  benchClearOfDividers,
  centredIsland,
  SCREEN_BENCH_ROOM,
  screenBenches,
} from "./feature-benches";
import {
  arrivalPoint,
  BENCH_DEPTH,
  benchRect,
  clearOfFittings,
  longAxis,
  type Rect,
} from "./fittings";
import { frameReach, pickFrameDesign } from "./frame-design";
import {
  grandStairsAt,
  grandSurfaceAt,
  inOpening,
  openingReach,
  stairSignPosts,
  toStairLocal,
} from "./grand-stair";
import {
  ARTIST_ROOM,
  BLOCK_DOOR_WIDTH,
  BLOCK_GRID,
  BLOCK_HALLS,
  BLOCK_PLAN,
  BLOCK_ROOMS,
  BLOCK_SPIRALS,
  BLOCK_WALL_COVERAGE,
  blockArrivalPoint,
  HALL_SIDE_DOOR,
  hallFront,
  layoutBlock,
} from "./layout-block";
import {
  centredFootprint,
  computeRoomRuns,
  PAINTING_FLOOR_GAP,
  runLength,
  sizeWork,
  wallFootprint,
} from "./place-paintings";
import { eraOfRoom, floorTitle } from "./room-era";
import type { Bench, Door, Placement, RoomLayout } from "./types";
import {
  CELL_SIZE,
  DIVIDER_THICKNESS,
  doorOpenHalfSpan,
  FLOOR_SEPARATION,
  PORTAL_WIDTH,
  SPIRAL_OUTER_RADIUS,
} from "./world-coords";

/** The artist of each era's room of their own, where a floor gives the
 *  era one (`Zone.own`). */
const OWN_ARTIST = new Map(
  BLOCK_PLAN.flatMap((plan) => plan.zones.flatMap((z) => (z.own ? [[z.era, z.own.artist]] : []))),
);

/** 160 sharp works for every era, in mixed sizes, by 40 artists each.
 *  Every fourth is a sharper scan of the same size. Where the era has a
 *  room of its own, one work in four is by that room's artist, titled
 *  so that any motif of the room's admits it. */
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
      const own = i % 4 === 3 ? OWN_ARTIST.get(era.id) : undefined;
      return {
        id: `${era.id}-${i}`,
        ...(own ? { artist: own, title: `Water Lilies ${i}` } : {}),
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
const roomOf = (floorIndex: number, key: string) =>
  layout.floors[floorIndex].rooms.find((r) => keyOf(r) === key)!;
/** The rooms each era of a floor hangs in. */
const zonesOf = (floorIndex: number) =>
  BLOCK_PLAN[floorIndex].zones.map((zone) => ({
    zone,
    rooms: zone.cells.map((cell) => roomOf(floorIndex, cell)),
  }));
/** The side of room `a` that room `b` stands against along three cells
 *  of wall or more, or null. */
const sideToward = (a: RoomLayout, b: RoomLayout): Door["side"] | null => {
  const p = a.cellBounds;
  const q = b.cellBounds;
  const z = Math.min(p.zMax, q.zMax) - Math.max(p.zMin, q.zMin) + 1 >= 3;
  const x = Math.min(p.xMax, q.xMax) - Math.max(p.xMin, q.xMin) + 1 >= 3;
  if (z && p.xMax + 1 === q.xMin) return "east";
  if (z && q.xMax + 1 === p.xMin) return "west";
  if (x && p.zMax + 1 === q.zMin) return "south";
  if (x && q.zMax + 1 === p.zMin) return "north";
  return null;
};
const hallOf = (room: RoomLayout) => BLOCK_HALLS.find((h) => h.key === keyOf(room));
/** A stair hall: an end of the spine, with a grand stair on every floor. */
const isStairHall = (room: RoomLayout) => hallOf(room)?.design === "loggia";
const isCourt = (room: RoomLayout) => hallOf(room)?.design === "court";
const isSpiral = (room: RoomLayout) => BLOCK_SPIRALS.some((s) => s.key === keyOf(room));
const isSalon = (room: RoomLayout) => hallOf(room)?.design === "salon";
const OPPOSITE_SIDE = { north: "south", south: "north", east: "west", west: "east" } as const;
/** The grand stairs of a hall, lowest first. */
const stairsOf = (key: string) =>
  layout
    .grandStairs!.filter((s) => s.id.startsWith(`${key}-`))
    .sort((a, b) => a.lowerFloor - b.lowerFloor);
const wallOf = (room: RoomLayout) =>
  computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);
const metres = (cells: number) => cells * CELL_SIZE;
const top = layout.floors.length - 1;

describe("the block plan", () => {
  it("is four floors of one plan: two stair halls, a court, a spiral, seven galleries, and a salon on two", () => {
    expect(layout.floors).toHaveLength(4);
    for (const floor of layout.floors) {
      expect(floor.gridSize).toEqual(BLOCK_GRID);
      expect(floor.rooms.filter(isStairHall)).toHaveLength(2);
      expect(floor.rooms.filter(isCourt)).toHaveLength(1);
      expect(floor.rooms.filter(isSpiral)).toHaveLength(1);
      const salon = floor.index <= 1 ? 1 : 0;
      expect(floor.rooms.filter(isSalon)).toHaveLength(salon);
      expect(floor.rooms.filter((r) => r.isStairwell)).toHaveLength(4 + salon);
      expect(floor.rooms.filter((r) => !r.isStairwell)).toHaveLength(BLOCK_ROOMS.length);
      // Every gallery is in one era, once.
      const cells = BLOCK_PLAN[floor.index].zones.flatMap((z) => [...z.cells]);
      expect([...cells].sort()).toEqual(BLOCK_ROOMS.map((r) => r.key).sort());
    }
    // A grand stair from each floor to the next in both stair halls, the
    // one opening of the court and of the salon, and a spiral from each
    // floor to the next in the tower south of the court.
    expect(layout.grandStairs).toHaveLength(8);
    expect(layout.allStaircases).toHaveLength(3);
    expect(layout.floors.map((f) => f.grandStairsOut!.length)).toEqual([4, 2, 2, 0]);
    expect(layout.floors.map((f) => f.grandStairsIn!.length)).toEqual([0, 4, 2, 2]);
    expect(layout.floors.map((f) => f.grandHalls!.length)).toEqual([4, 6, 5, 3]);
    // The salon is two storeys, the second one running on past the floor
    // above to its dome.
    const salons = layout.allRooms.filter(isSalon);
    expect(salons.map((r) => r.floorIndex)).toEqual([0, 1]);
    expect(salons[1].ceilingOpening).toBeNull();
    expect(salons[1].domed).toBe(true);
    expect(salons[1].storeyHeight).toBeGreaterThan(FLOOR_SEPARATION);
    expect(salons[0].storeyHeight).toBeUndefined();
    expect(layout.floors.map((f) => f.stairsOut.length)).toEqual([1, 1, 1, 0]);
    expect(layout.floors.map((f) => f.stairsIn.length)).toEqual([0, 1, 1, 1]);
  });

  it("stands a stair hall at each end of the spine and the court in its middle", () => {
    const [west, court, east] = BLOCK_HALLS.map((h) => h.rect);
    expect(BLOCK_HALLS.map((h) => h.design)).toEqual(["loggia", "court", "loggia", "salon"]);
    for (const r of [west, court, east]) {
      expect(metres(r.zMax - r.zMin + 1)).toBe(27.5);
      // All three in the middle row.
      expect(r.zMin).toBe(court.zMin);
    }
    expect(metres(court.xMax - court.xMin + 1)).toBe(27.5);
    // A stair hall is 20 m deep: its end wall stands three cells inside
    // the building's, on its landings' far edge, and the cells between
    // are no room.
    for (const r of [west, east]) expect(metres(r.xMax - r.xMin + 1)).toBe(20);
    expect(west.xMin).toBe(3);
    expect(east.xMax).toBe(BLOCK_GRID.x - 4);
    expect(court.xMin + court.xMax).toBe(BLOCK_GRID.x - 1);
    // A gallery of 17.5 m between each pair.
    expect(metres(court.xMin - west.xMax - 1)).toBe(17.5);
    expect(metres(east.xMin - court.xMax - 1)).toBe(17.5);
    for (const floor of layout.floors) {
      // No two rooms with a grand stair or a void share a wall.
      const halls = floor.rooms.filter((r) => isStairHall(r) || isCourt(r));
      for (const hall of halls) {
        for (const other of halls) {
          if (other !== hall) expect(sideToward(hall, other), hall.id).toBeNull();
        }
      }
    }
  });

  it("stands a spiral south of the court, through every floor", () => {
    const court = BLOCK_HALLS[1].rect;
    for (const shaft of BLOCK_SPIRALS) {
      const r = shaft.rect;
      // A room of its own, 22.5 × 17.5 m, on the court's short axis.
      expect(metres(r.xMax - r.xMin + 1)).toBe(22.5);
      expect(metres(r.zMax - r.zMin + 1)).toBe(17.5);
      expect(r.xMin + r.xMax).toBe(court.xMin + court.xMax);
      const cx = metres(r.xMin + r.xMax + 1) / 2;
      const cz = metres(r.zMin + r.zMax + 1) / 2;
      const flights = layout.allStaircases.filter((s) => s.id.startsWith(`${shaft.key}-`));
      expect(flights.map((s) => [s.lowerFloor, s.upperFloor])).toEqual([
        [0, 1],
        [1, 2],
        [2, 3],
      ]);
      for (const s of flights) {
        expect(s.centerX).toBe(cx);
        expect(s.centerZ).toBe(cz);
        // Its first step faces the court's door.
        expect(Math.sin(s.entryAngle)).toBeCloseTo(shaft.door === "south" ? 1 : -1, 9);
      }
      // Floor to walk round the well on every side.
      expect(metres(r.zMax - r.zMin + 1) / 2 - SPIRAL_OUTER_RADIUS).toBeGreaterThan(3);
      for (const floor of layout.floors) {
        const room = roomOf(floor.index, shaft.key);
        expect(room.isStairwell).toBe(true);
        // A spiral's well is cut by rule, not from a stair's opening.
        expect(room.floorOpening).toBeUndefined();
        expect(room.ceilingOpening).toBeUndefined();
        expect(room.placements).toHaveLength(0);
        const door = room.doors.find((d) => d.side === shaft.door)!;
        expect(keyOf(layout.allRooms.find((x) => x.id === door.connectsTo.roomId)!)).toBe("court");
        expect(door.width).toBe(PORTAL_WIDTH);
        expect(door.worldX).toBe(cx);
        // And a door to the gallery on either side; the south one opens
        // into the salon too, on the floors the salon stands on.
        const salon =
          shaft.key === "stair-s" && floor.index <= 1 ? [OPPOSITE_SIDE[shaft.door]] : [];
        expect(room.doors.map((d) => d.side).sort()).toEqual(
          ["east", "west", shaft.door, ...salon].sort(),
        );
      }
    }
  });

  it("gives each floor's artist a room of their own north of the court", () => {
    // Rico, 17 October 2026: the second spiral was superfluous. Its
    // room hangs one artist of each floor, in their era's colours.
    const court = BLOCK_HALLS[1].rect;
    const artists: string[] = [];
    for (const floor of layout.floors) {
      const zone = BLOCK_PLAN[floor.index].zones.find((z) => z.cells.includes(ARTIST_ROOM))!;
      expect(zone.own, floor.title).toBeDefined();
      artists.push(zone.own!.artist);
      const room = roomOf(floor.index, ARTIST_ROOM);
      expect(room.isStairwell).toBe(false);
      expect(eraOfRoom(room).id).toBe(zone.era);
      const r = room.cellBounds;
      expect(metres(r.xMax - r.xMin + 1)).toBe(22.5);
      expect(metres(r.zMax - r.zMin + 1)).toBe(17.5);
      expect(r.xMin + r.xMax).toBe(court.xMin + court.xMax);
      // The portal to the court, a door to the gallery either side, and
      // its north wall, the building's, closed.
      expect(room.doors.map((d) => d.side).sort()).toEqual(["east", "south", "west"]);
      expect(room.doors.find((d) => d.side === "south")!.width).toBe(PORTAL_WIDTH);
      // Its works are the artist's, and no other room of the floor hangs
      // one of them.
      expect(room.placements.length, room.id).toBeGreaterThan(0);
      for (const other of floor.rooms) {
        const theirs = other.placements.filter((p) => p.artwork.artist === zone.own!.artist);
        if (other === room) expect(theirs).toHaveLength(room.placements.length);
        else if (!other.isStairwell) expect(theirs, other.id).toEqual([]);
      }
      // A seat, and a work in front of it.
      expect(room.benches.length, room.id).toBeGreaterThan(0);
    }
    // A different artist on every floor.
    expect(new Set(artists).size).toBe(layout.floors.length);
  });

  it("enters a stair hall by the portal its stair faces, and from the galleries beside it", () => {
    for (const floor of layout.floors) {
      for (const hall of floor.rooms.filter(isStairHall)) {
        expect(hall.doors, hall.id).toHaveLength(3);
        const front = hallFront(hallOf(hall)!);
        const door = hall.doors.find((d) => d.side === front)!;
        expect(door.width).toBe(PORTAL_WIDTH);
        // The design is drawn with the visitor coming in from +z, the
        // foot of its first flight toward them: the door is there.
        const [stair] = stairsOf(keyOf(hall));
        const at = toStairLocal(stair, door.worldX, door.worldZ);
        expect(at.x).toBeCloseTo(0, 9);
        expect(at.z).toBeCloseTo(stair.half, 9);
        // It opens on the spine's gallery.
        const from = floor.rooms.find((r) => r.id === door.connectsTo.roomId)!;
        expect(keyOf(from)).toBe(keyOf(hall) === "hall-w" ? "cw" : "ce");

        // A door in each side wall, from the gallery beside the stair
        // into a long gallery, inside the hall's square and before its
        // end wall, with the hall's own floor inside it.
        const sides = hall.doors.filter((d) => d !== door);
        const galleries = keyOf(hall) === "hall-w" ? ["nw", "sw"] : ["ne", "se"];
        expect(
          sides.map((d) => keyOf(floor.rooms.find((r) => r.id === d.connectsTo.roomId)!)).sort(),
        ).toEqual(galleries);
        const here = stairsOf(keyOf(hall)).filter(
          (s) => s.lowerFloor === floor.index || s.upperFloor === floor.index,
        );
        for (const side of sides) {
          expect(side.width).toBe(BLOCK_DOOR_WIDTH);
          const local = toStairLocal(stair, side.worldX, side.worldZ);
          expect(Math.abs(local.x)).toBeCloseTo(stair.half, 9);
          expect(local.z).toBeCloseTo(stair.half - HALL_SIDE_DOOR, 9);
          expect(local.z - side.width / 2).toBeGreaterThan(-stair.back);
          // A step inside: the hall's floor on this storey.
          const inX = side.worldX + (side.side === "east" ? -1 : side.side === "west" ? 1 : 0);
          const inZ = side.worldZ + (side.side === "south" ? -1 : side.side === "north" ? 1 : 0);
          const surface = grandSurfaceAt(here, inX, inZ, floor.y);
          expect(surface?.floorIndex, `${hall.id} ${side.side}`).toBe(floor.index);
        }
      }
    }
  });

  it("stacks a grand stair on every floor of each stair hall, its landings on the end wall", () => {
    for (const key of ["hall-w", "hall-e"]) {
      const stairs = stairsOf(key);
      expect(stairs.map((s) => [s.lowerFloor, s.upperFloor, s.topFloor])).toEqual([
        [0, 1, 1],
        [1, 2, 2],
        [2, 3, 3],
      ]);
      stairs.forEach((stair, i) => {
        expect(stair.design).toBe("loggia");
        expect(stair.hasFlightBelow).toBe(i > 0);
        expect(stair.hasFlightAbove).toBe(i < stairs.length - 1);
        // Set out from the front wall as in a square hall; the end wall
        // three cells nearer, where the landing ends.
        expect(stair.back).toBe(stair.half - 7.5);
        expect(stair.patches.find((p) => p.kind === "flat")).toMatchObject({ zMin: -stair.back });
        // The opening is the stair's width and reaches no side wall: a
        // gallery runs between it and each.
        expect(openingReach(stair.opening)).toBeLessThanOrEqual(stair.half - 5);
        expect(inOpening(stair, 0, -stair.back + 0.1)).toBe(true);
      });
      for (const floor of layout.floors) {
        const hall = roomOf(floor.index, key);
        expect(hall.isStairwell).toBe(true);
        const [stair] = stairs;
        const end =
          key === "hall-w" ? metres(hall.cellBounds.xMin) : metres(hall.cellBounds.xMax + 1);
        expect(Math.abs(end - stair.centerX)).toBe(stair.back);
        const front =
          key === "hall-w" ? metres(hall.cellBounds.xMax + 1) : metres(hall.cellBounds.xMin);
        expect(Math.abs(front - stair.centerX)).toBe(stair.half);
        // A hole in every floor over the first, and in every ceiling but
        // the roof, which is glazed.
        expect(hall.floorOpening === null).toBe(floor.index === 0);
        expect(hall.ceilingOpening === null).toBe(floor.index === top);
        expect(hall.stairGlyph).toBe(
          floor.index === 0 ? "up" : floor.index === top ? "down" : "both",
        );
        // Every wall has floor in front of it on every storey.
        // A visitor sent to the hall lands on its floor, inside its door.
        const arrival = blockArrivalPoint(layout, hall);
        const here = grandStairsAt(layout.grandStairs!, arrival.x, arrival.z, floor.y);
        expect(grandSurfaceAt(here, arrival.x, arrival.z, floor.y)?.floorIndex).toBe(floor.index);
        expect(
          hall.doors.some((d) => nearDoor(d, arrival)),
          hall.id,
        ).toBe(true);
      }
    }
    // Each rises away from the middle of the building.
    expect(stairsOf("hall-w")[0].turns).toBe(3);
    expect(stairsOf("hall-e")[0].turns).toBe(1);
  });

  it("opens the court from its floor to the roof, a portal in each wall on every floor", () => {
    const stairs = stairsOf("court");
    expect(stairs).toHaveLength(1);
    const [court] = stairs;
    expect(court.design).toBe("court");
    expect(court.patches).toHaveLength(0);
    expect([court.lowerFloor, court.topFloor]).toEqual([0, top]);
    // 5 m of gallery inside every wall on the floors above.
    expect(court.half - openingReach(court.opening)).toBe(5);
    for (const floor of layout.floors) {
      const room = roomOf(floor.index, "court");
      expect(room.isAnchor).toBe(true);
      expect(floor.rooms.filter((r) => r.isAnchor)).toHaveLength(1);
      expect(room.floorOpening === null).toBe(floor.index === 0);
      expect(room.ceilingOpening === null).toBe(floor.index === top);
      expect(room.stairGlyph).toBe("void");
      expect(room.doors.map((d) => d.side).sort()).toEqual(["east", "north", "south", "west"]);
      for (const d of room.doors) expect(d.width).toBe(PORTAL_WIDTH);
      const arrival = blockArrivalPoint(layout, room);
      const here = grandStairsAt(layout.grandStairs!, arrival.x, arrival.z, floor.y);
      expect(here).toEqual([court]);
      expect(grandSurfaceAt(here, arrival.x, arrival.z, floor.y)?.floorIndex).toBe(floor.index);
    }
  });

  it("seats the court's floor in front of its north and south walls, clear of its doors", () => {
    const court = roomOf(0, "court");
    expect(court.benches).toHaveLength(8);
    const cx = (court.worldRect.xMin + court.worldRect.xMax) / 2;
    const cz = (court.worldRect.zMin + court.worldRect.zMax) / 2;
    for (const bench of court.benches) {
      expect(bench.along).toBe("x");
      // Beside both lines between the doors, by 3 m and more.
      expect(Math.abs(bench.x - cx) - 1).toBeGreaterThan(PORTAL_WIDTH / 2 + 3);
      expect(Math.abs(bench.z - cz)).toBeGreaterThan(PORTAL_WIDTH / 2 + 3);
    }
    // Alike in all four quarters.
    const quarters = new Set(
      court.benches.map((b) => `${Math.sign(b.x - cx)}:${Math.sign(b.z - cz)}`),
    );
    expect(quarters.size).toBe(4);
    expect(new Set(court.benches.map((b) => Math.abs(b.x - cx).toFixed(3))).size).toBe(1);
    // The floors above are a gallery 5 m wide: no seat.
    for (const floor of layout.floors.slice(1)) {
      expect(roomOf(floor.index, "court").benches).toHaveLength(0);
    }
    for (const room of layout.allRooms.filter((r) => isStairHall(r) || isSpiral(r))) {
      expect(room.benches, room.id).toHaveLength(0);
    }
  });

  it("leaves no gallery a dead end, and every room in reach of the court", () => {
    for (const floor of layout.floors) {
      for (const room of floor.rooms.filter((r) => !r.isStairwell)) {
        expect(room.doors.length, room.id).toBeGreaterThanOrEqual(2);
      }
    }
    // Through doors, and up and down every stair.
    const byId = new Map(layout.allRooms.map((r) => [r.id, r]));
    const start = layout.floors[0].rooms.find((r) => r.isAnchor)!;
    const seen = new Set([start.id]);
    const queue = [start];
    while (queue.length > 0) {
      const room = queue.pop()!;
      const next = room.doors.map((d) => byId.get(d.connectsTo.roomId)!);
      if (isStairHall(room) || isSpiral(room)) {
        for (const other of [room.floorIndex - 1, room.floorIndex + 1]) {
          if (other >= 0 && other <= top) next.push(roomOf(other, keyOf(room)));
        }
      }
      for (const n of next) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        queue.push(n);
      }
    }
    expect(layout.allRooms.filter((r) => !seen.has(r.id)).map((r) => r.id)).toEqual([]);
    // Without the stairs, a floor is one piece too.
    for (const floor of layout.floors) {
      const reached = new Set([roomOf(floor.index, "court").id]);
      const todo = [roomOf(floor.index, "court")];
      while (todo.length > 0) {
        for (const d of todo.pop()!.doors) {
          if (reached.has(d.connectsTo.roomId)) continue;
          reached.add(d.connectsTo.roomId);
          todo.push(byId.get(d.connectsTo.roomId)!);
        }
      }
      expect(reached.size, `floor ${floor.index}`).toBe(floor.rooms.length);
    }
  });

  it("seats every gallery on the lines of the room, never in a passage", () => {
    for (const floor of layout.floors) {
      for (const room of floor.rooms.filter((r) => !r.isStairwell)) {
        // A gallery of the spine is a crossing of two walking lines.
        // With rows of panels every line of them is one of the two: no
        // seat. Between wing walls it has one.
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
        const set = arrangementOf(room.cellBounds, room.dividers);
        const panels = room.dividers
          .filter((d) => !d.bare)
          .map((d) => ({ axis: d.axis, at: d.line * CELL_SIZE }));
        // An island of two on the room's centre: a room with one panel
        // and a door screen, which no one walks straight through.
        const n = Math.max(1, room.benches.length);
        const onCentre =
          Math.abs(room.benches.reduce((sum, q) => sum + q.x, 0) / n - (x0 + x1) / 2) < 1e-6 &&
          Math.abs(room.benches.reduce((sum, q) => sum + q.z, 0) / n - (z0 + z1) / 2) < 1e-6;
        const facing = screenBenches(room);
        const facesScreen = (bench: Bench) =>
          facing.some((f) => f.x === bench.x && f.z === bench.z && f.along === bench.along);
        room.benches.forEach((bench, i) => {
          const r = rects[i];
          // 4 m or more of floor to every wall but the one it looks at,
          // which it stands `BENCH_WALL_VIEW` from: a bench in the 5 m
          // aisle between a panel and a wall could not have it.
          const [toLow, toHigh, toEnds] =
            bench.along === "x"
              ? [r.zMin - z0, z1 - r.zMax, Math.min(r.xMin - x0, x1 - r.xMax)]
              : [r.xMin - x0, x1 - r.xMax, Math.min(r.zMin - z0, z1 - r.zMax)];
          expect(toEnds, room.id).toBeGreaterThanOrEqual(4);
          expect(Math.min(toLow, toHigh), room.id).toBeGreaterThanOrEqual(
            BENCH_WALL_VIEW - BENCH_DEPTH / 2 - 1e-9,
          );
          expect(Math.max(toLow, toHigh), room.id).toBeGreaterThanOrEqual(4);
          // And 2.2 m to every freestanding wall, a door screen included.
          expect(benchClearOfDividers(bench, room, 2.2), room.id).toBe(true);
          if (facesScreen(bench)) {
            // Square in front of a door screen, on its middle, and no
            // other bench beside it.
            const screen = room.dividers.find((d) => {
              if (!d.bare || d.axis !== bench.along) return false;
              const middle = ((d.start + d.end) / 2) * CELL_SIZE;
              const into = d.bare === "high" ? -1 : 1;
              const ahead =
                ((bench.along === "x" ? bench.z : bench.x) - d.line * CELL_SIZE) * into -
                DIVIDER_THICKNESS / 2;
              return (
                Math.abs((bench.along === "x" ? bench.x : bench.z) - middle) < 1e-6 &&
                ahead >= 3.5 - 1e-6 &&
                ahead <= 4.5 + 1e-6
              );
            });
            expect(screen, room.id).toBeDefined();
            for (const other of room.benches) {
              if (other === bench) continue;
              expect(
                Math.hypot(other.x - bench.x, other.z - bench.z),
                room.id,
              ).toBeGreaterThanOrEqual(SCREEN_BENCH_ROOM);
            }
            return;
          }
          if (set.kind === "wings") {
            // Between wing walls a bench lies along the room, across
            // the wings.
            expect(bench.along, room.id).toBe(set.axis);
          } else if ((set.kind === "rows" || set.kind === "pinwheel") && !onCentre) {
            // In a room with panels a bench runs the way a panel does,
            // and stands in line with a row of them, in the middle of a
            // wide aisle, or stepped up from either to the wall it looks
            // at (`benchesToTheirWalls`).
            const parallel = panels.filter((p) => p.axis === bench.along);
            expect(parallel.length, room.id).toBeGreaterThan(0);
            const across = bench.along === "x" ? bench.z : bench.x;
            const inRow = parallel.some((p) => Math.abs(p.at - across) < 1e-6);
            const nearest = Math.min(...parallel.map((p) => Math.abs(p.at - across)));
            const [lo, hi] = bench.along === "x" ? [z0, z1] : [x0, x1];
            const atWall = Math.min(across - lo, hi - across) === BENCH_WALL_VIEW;
            expect(inRow || nearest >= 4.5 || atWall, room.id).toBe(true);
          }
          rects.slice(i + 1).forEach((q) => {
            expect(r.xMin < q.xMax && q.xMin < r.xMax && r.zMin < q.zMax && q.zMin < r.zMax).toBe(
              false,
            );
          });
          // Never in the line of a door in the wall beside it.
          for (const door of room.doors.filter((d) => d.side === "north" || d.side === "south")) {
            const sameSide = (door.side === "north") === bench.z < (z0 + z1) / 2;
            if (sameSide && bench.along === "x" && set.kind === "rows") {
              expect(Math.abs(bench.x - door.worldX), room.id).toBeGreaterThan(door.width / 2 + 1);
            }
          }
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
    expect(benches).toBeGreaterThan(40);
    expect(unmatched).toEqual([]);
  });

  it("gives the bench's work to one of the room's largest, and overlaps none", () => {
    const overlaps: string[] = [];
    let led = 0;
    let rooms = 0;
    // A gallery with no seat has no work to lead with.
    const seated = layout.allRooms.filter((r) => !r.isStairwell && r.benches.length > 0);
    expect(seated.length).toBeGreaterThanOrEqual(16);
    for (const room of seated) {
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
      // Or it is the one picture of a door screen.
      const onScreen =
        largest.divider !== undefined && room.dividers[largest.divider].bare !== undefined;
      if (inFront || onScreen) led++;
    }
    expect(overlaps).toEqual([]);
    // In nearly every room: a work wider than the stretch of wall a
    // bench looks at, or than a screen, hangs elsewhere.
    expect(led / rooms).toBeGreaterThan(0.8);
  });

  it("divides no two rooms that share a door the same way, and each floor in four ways", () => {
    /** How a room's walls stand, apart from where the room is. */
    const styleOf = (room: RoomLayout) => {
      const b = room.cellBounds;
      const walls = room.dividers.map((d) => {
        const low = d.axis === "x" ? b.xMin : b.zMin;
        const line = d.line - (d.axis === "x" ? b.zMin : b.xMin);
        return [d.axis === longAxis(b) ? "along" : "across", line, d.start - low, d.end - low];
      });
      return JSON.stringify(walls.sort());
    };
    const twins: string[] = [];
    for (const floor of layout.floors) {
      const kinds = new Set<string>();
      for (const room of floor.rooms.filter((r) => !r.isStairwell)) {
        // What a visitor would tell apart: rows from wing walls, wing
        // walls in pairs from single ones, and how long the walls are.
        const walls = room.dividers.filter((d) => !d.bare);
        const lengths = walls.map((d) => d.end - d.start);
        const perLine = walls.map(
          (d) => walls.filter((o) => o.axis === d.axis && o.line === d.line).length,
        );
        const set = arrangementOf(room.cellBounds, room.dividers);
        kinds.add(`${set.kind}:${Math.max(0, ...lengths)}:${Math.max(0, ...perLine)}`);
        if (room.dividers.length === 0) continue;
        for (const door of room.doors) {
          const other = floor.rooms.find((r) => r.id === door.connectsTo.roomId)!;
          if (styleOf(room) === styleOf(other)) twins.push(`${room.id} and ${other.id}`);
        }
      }
      expect(kinds.size, floor.title).toBeGreaterThanOrEqual(4);
    }
    expect(twins).toEqual([]);
    // Two rooms that share a door are not of one kind either: rows
    // beside wing walls, or the other way round.
    for (const floor of layout.floors) {
      for (const [a, b] of [
        ["nw", "cw"],
        ["sw", "cw"],
        ["ne", "ce"],
        ["se", "ce"],
      ]) {
        const kinds = [a, b].map((key) => {
          const room = roomOf(floor.index, key);
          const walls = room.dividers.filter((d) => !d.bare);
          return `${arrangementOf(room.cellBounds, room.dividers).kind}:${Math.max(0, ...walls.map((d) => d.end - d.start))}`;
        });
        expect(kinds[0], `${floor.title} ${a} and ${b}`).not.toBe(kinds[1]);
      }
    }
    // Walls of 5 m, 7.5 m and 12.5 m.
    const lengths = new Set(
      layout.floors.flatMap((f) =>
        f.rooms.flatMap((r) => r.dividers.map((d) => (d.end - d.start) * CELL_SIZE)),
      ),
    );
    expect([...lengths].sort((p, q) => p - q)).toEqual([5, 7.5, 12.5]);
  });

  it("stands a screen in front of each door the plan names, hung on the room's side", () => {
    for (const floor of layout.floors) {
      const plan = BLOCK_PLAN[floor.index];
      expect(plan.screens.length, floor.title).toBeGreaterThanOrEqual(3);
      const sides = new Set<string>();
      for (const [cell, toward] of plan.screens) {
        const room = roomOf(floor.index, cell);
        const other = floor.rooms.find((r) => keyOf(r) === toward);
        const door = room.doors.find((d) => d.connectsTo.roomId === other?.id);
        expect(door, `${room.id} has a door to ${toward}`).toBeDefined();
        if (!door || !other) continue;
        expect(door.width, room.id).toBeLessThan(PORTAL_WIDTH);
        expect(sides.has(`${other.id}>${room.id}`), `${room.id}: both sides of one door`).toBe(
          false,
        );
        sides.add(`${room.id}>${other.id}`);

        // 2.5 m into the room, parallel to the door's wall, 5 m long
        // and centred on the door.
        const northSouth = door.side === "north" || door.side === "south";
        const wall = (northSouth ? door.worldZ : door.worldX) / CELL_SIZE;
        const inward = door.side === "north" || door.side === "west" ? 1 : -1;
        const index = room.dividers.findIndex(
          (d) => d.bare && d.axis === (northSouth ? "x" : "z") && d.line === wall + inward,
        );
        const screen = room.dividers[index];
        expect(screen, `${room.id}: a screen at its door to ${toward}`).toBeDefined();
        if (!screen) continue;
        expect(screen.bare, room.id).toBe(inward === 1 ? "low" : "high");
        const along = (northSouth ? door.worldX : door.worldZ) / CELL_SIZE;
        expect((screen.start + screen.end) / 2, room.id).toBeCloseTo(along, 6);
        expect((screen.end - screen.start) * CELL_SIZE, room.id).toBe(5);

        // One picture, on the middle of the face toward the room, and
        // nothing on the face toward the door.
        const hung = room.placements.filter((p) => p.divider === index);
        expect(hung, room.id).toHaveLength(1);
        const [work] = hung;
        const across = (northSouth ? work.position[2] : work.position[0]) / CELL_SIZE;
        expect(Math.sign(across - screen.line), room.id).toBe(inward);
        expect((northSouth ? work.position[0] : work.position[2]) / CELL_SIZE, room.id).toBeCloseTo(
          along,
          6,
        );
        // The largest work of the room that the screen can take
        // centred, 0.5 m clear of either end.
        const faceMetres = 5 - 1;
        const fitting = room.placements.filter(
          (p) => centredFootprint(sizeWork(p.artwork)) <= faceMetres,
        );
        const largest = Math.max(...fitting.map((p) => p.widthM * p.heightM));
        expect(work.widthM * work.heightM, room.id).toBeCloseTo(largest, 6);

        // A bench faces it, on its middle, parallel to it.
        const seat = room.benches.find(
          (b) =>
            b.along === screen.axis &&
            Math.abs((b.along === "x" ? b.x : b.z) / CELL_SIZE - along) < 1e-6 &&
            Math.sign((b.along === "x" ? b.z : b.x) / CELL_SIZE - screen.line) === inward,
        );
        expect(seat, `${room.id}: a bench facing its screen`).toBeDefined();
      }
      // No screen but those, and none in a hall or a stair's room.
      const all = floor.rooms.flatMap((r) => r.dividers.filter((d) => d.bare));
      expect(all, floor.title).toHaveLength(plan.screens.length);
    }
  });

  it("leaves every part of every floor within reach round its walls", () => {
    for (const floor of layout.floors) {
      const { x: gx, z: gz } = floor.gridSize;
      const seen = new Uint8Array(gx * gz);
      const start = floor.rooms.find((r) => r.isAnchor)!.cellBounds;
      const queue = [start.zMin * gx + start.xMin];
      seen[queue[0]] = 1;
      while (queue.length > 0) {
        const cell = queue.pop()!;
        const x = cell % gx;
        const z = (cell - x) / gx;
        const step = (nx: number, nz: number, blocked: number) => {
          if (nx < 0 || nz < 0 || nx >= gx || nz >= gz || blocked) return;
          const next = nz * gx + nx;
          if (seen[next] || !floor.walkable[next]) return;
          seen[next] = 1;
          queue.push(next);
        };
        step(x + 1, z, x < gx - 1 ? floor.blockedEdgesEW[z * (gx - 1) + x] : 1);
        step(x - 1, z, x > 0 ? floor.blockedEdgesEW[z * (gx - 1) + x - 1] : 1);
        step(x, z + 1, z < gz - 1 ? floor.blockedEdgesNS[z * gx + x] : 1);
        step(x, z - 1, z > 0 ? floor.blockedEdgesNS[(z - 1) * gx + x] : 1);
      }
      const cut: string[] = [];
      for (let i = 0; i < seen.length; i++) {
        if (floor.walkable[i] && !seen[i]) cut.push(`${i % gx}:${Math.floor(i / gx)}`);
      }
      expect(cut, floor.title).toEqual([]);
    }
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
      // But for the three cells behind each stair hall's end wall.
      const behind = BLOCK_HALLS.filter((h) => h.design === "loggia").reduce(
        (n, h) => n + 3 * (h.rect.zMax - h.rect.zMin + 1),
        0,
      );
      // And for the rows south of the block, where only the salon stands.
      const blockRows = Math.max(...BLOCK_ROOMS.map((r) => r.rect.zMax)) + 1;
      const salon = BLOCK_HALLS.find((h) => h.design === "salon")!;
      const salonCells =
        floor.index <= (salon.top ?? top)
          ? (salon.rect.xMax - salon.rect.xMin + 1) * (salon.rect.zMax - salon.rect.zMin + 1)
          : 0;
      const outside = (BLOCK_GRID.z - blockRows) * BLOCK_GRID.x - salonCells;
      expect(owned.size).toBe(BLOCK_GRID.x * BLOCK_GRID.z - behind - outside);
      for (let z = 0; z < BLOCK_GRID.z; z++) {
        for (const x of [0, BLOCK_GRID.x - 1]) {
          if (!owned.has(`${x}:${z}`)) expect(floor.walkable[z * BLOCK_GRID.x + x]).toBe(0);
        }
      }
    }
  });

  it("gives every room a door to every neighbour", () => {
    for (const floor of layout.floors) {
      for (const a of floor.rooms) {
        // The salon opens from the south spiral's room only.
        const walled = (b: RoomLayout) =>
          (isSalon(a) && !keyOf(b).startsWith("stair-")) ||
          (isSalon(b) && !keyOf(a).startsWith("stair-"));
        const neighbours = floor.rooms
          .filter((b) => b !== a && sideToward(a, b) && !walled(b))
          .map((b) => b.id);
        expect(a.doors.map((d) => d.connectsTo.roomId).sort(), a.id).toEqual(neighbours.sort());
      }
      // A long gallery meets the court at its corner, along one cell:
      // no door there.
      for (const key of ["nw", "ne", "sw", "se"]) {
        const gallery = roomOf(floor.index, key);
        expect(
          gallery.doors.some((d) => d.connectsTo.roomId === roomOf(floor.index, "court").id),
        ).toBe(false);
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

  it("lines the doors up along the spine, across the court and along both ranges", () => {
    for (const floor of layout.floors) {
      const door = (from: string, to: string) => {
        const a = roomOf(floor.index, from);
        const b = roomOf(floor.index, to);
        return a.doors.find((d) => d.connectsTo.roomId === b.id);
      };
      // The spine: portals in one line from one grand stair to the other.
      const spine = ["hall-w", "cw", "court", "ce", "hall-e"];
      const spineDoors = spine.slice(1).flatMap((key, i) => door(spine[i], key) ?? []);
      expect(spineDoors).toHaveLength(4);
      expect(new Set(spineDoors.map((d) => d.worldZ)).size).toBe(1);
      for (const d of spineDoors) expect(d.width).toBe(PORTAL_WIDTH);
      // The short axis: from the artist's room through the court to the
      // spiral.
      const cross = [door(ARTIST_ROOM, "court")!, door("court", "stair-s")!];
      expect(new Set(cross.map((d) => d.worldX)).size).toBe(1);
      for (const d of cross) expect(d.width).toBe(PORTAL_WIDTH);
      // The two axes cross in the middle of the court.
      const court = roomOf(floor.index, "court").worldRect;
      expect(cross[0].worldX).toBeCloseTo((court.xMin + court.xMax) / 2, 9);
      expect(spineDoors[0].worldZ).toBeCloseTo((court.zMin + court.zMax) / 2, 9);
      // Each range: a door either side of the room beside the court, in
      // one line.
      for (const [w, stair, e] of [
        ["nw", ARTIST_ROOM, "ne"],
        ["sw", "stair-s", "se"],
      ]) {
        const doors = [door(w, stair)!, door(stair, e)!];
        expect(new Set(doors.map((d) => d.worldZ)).size).toBe(1);
        for (const d of doors) expect(d.width).toBe(BLOCK_DOOR_WIDTH);
      }
      // A gallery of the spine has each door in the middle of its wall.
      for (const key of ["cw", "ce"]) {
        const room = roomOf(floor.index, key);
        const cx = ((room.cellBounds.xMin + room.cellBounds.xMax + 1) / 2) * CELL_SIZE;
        const cz = ((room.cellBounds.zMin + room.cellBounds.zMax + 1) / 2) * CELL_SIZE;
        expect(room.doors).toHaveLength(4);
        for (const d of room.doors) {
          const along = d.side === "north" || d.side === "south" ? d.worldX - cx : d.worldZ - cz;
          expect(along, `${key} ${d.side}`).toBeCloseTo(0, 9);
        }
      }
    }
  });

  it("stands walls in every gallery, and names how for each floor", () => {
    for (const floor of layout.floors) {
      const plan = BLOCK_PLAN[floor.index];
      for (const { key } of BLOCK_ROOMS) {
        const room = roomOf(floor.index, key);
        const style = plan.styles[key] ?? "rows";
        // A room left open stands no walls of its own.
        if (style === "open") {
          expect(
            room.dividers.filter((d) => !d.bare),
            room.id,
          ).toEqual([]);
          continue;
        }
        expect(room.dividers.filter((d) => !d.bare).length, room.id).toBeGreaterThan(0);
        // A room the plan does not name takes rows of panels.
        const kind = arrangementOf(room.cellBounds, room.dividers).kind;
        expect(kind, room.id).toBe(style === "bays" || style === "staggered" ? "wings" : "rows");
      }
      for (const key of ["nw", "ne", "sw", "se"]) {
        const b = roomOf(floor.index, key).cellBounds;
        expect(metres(b.zMax - b.zMin + 1)).toBe(17.5);
        expect(metres(b.xMax - b.xMin + 1)).toBe(47.5);
      }
      for (const key of Object.keys(plan.styles)) {
        expect(
          BLOCK_ROOMS.some((r) => r.key === key),
          `${floor.title} ${key}`,
        ).toBe(true);
      }
    }
  });

  it("hangs each era in rooms that touch or stand either side of a room beside the court", () => {
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
      // through doors between them, or through a room beside the court:
      // the spiral's, or the artist's room.
      const spirals = [...floor.rooms.filter(isSpiral), roomOf(floor.index, ARTIST_ROOM)];
      for (const { zone, rooms } of zones) {
        const reached = new Set([rooms[0].id]);
        const queue = [rooms[0]];
        while (queue.length > 0) {
          for (const d of queue.pop()!.doors) {
            const next = [...rooms, ...spirals].find((r) => r.id === d.connectsTo.roomId);
            if (!next || reached.has(next.id)) continue;
            reached.add(next.id);
            queue.push(next);
          }
        }
        expect(
          rooms.filter((r) => !reached.has(r.id)).map((r) => r.id),
          zone.era,
        ).toEqual([]);
      }
      // Every gallery has a number, and an era's rooms run in one stretch.
      const all = zones.flatMap((z) => z.rooms);
      expect(new Set(all).size).toBe(all.length);
      expect(all).toHaveLength(floor.rooms.filter((r) => !r.isStairwell).length);
      const byNumber = [...all].sort((a, b) => (a.roomNumber ?? 0) - (b.roomNumber ?? 0));
      expect(byNumber.map((r) => r.roomNumber)).toEqual(all.map((_, i) => i + 1));
      const eraOf = new Map(zones.flatMap((z) => z.rooms.map((r) => [r.id, z.zone.era] as const)));
      const runs = byNumber
        .map((r) => eraOf.get(r.id))
        .filter((era, i, eras) => i === 0 || era !== eras[i - 1]);
      expect(runs, `floor ${floor.index + 1}`).toEqual([...new Set(runs)]);
      for (const room of floor.rooms.filter((r) => r.isStairwell)) {
        expect(room.roomNumber, room.id).toBeNull();
      }
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

  it("starts a visit on the floor of the court, inside its south door", () => {
    const [x, y, z] = layout.entry.worldPosition;
    const court = layout.floors[0].rooms.find((r) => r.isAnchor)!;
    expect(keyOf(court)).toBe("court");
    expect(y).toBe(0);
    expect(x).toBeCloseTo((court.worldRect.xMin + court.worldRect.xMax) / 2, 9);
    expect(z).toBeGreaterThan((court.worldRect.zMin + court.worldRect.zMax) / 2);
    expect(z).toBeLessThan(court.worldRect.zMax);
    const here = grandStairsAt(layout.grandStairs!, x, z, 0);
    expect(grandSurfaceAt(here, x, z, 0)?.floorIndex).toBe(0);
  });
});

// Rules every room keeps, whatever the plan. They were the tower's tests
// until the tower was taken out on 17 October 2026.
describe("the block plan's rooms as fitted and hung", () => {
  const galleries = layout.floors.flatMap((f) => f.rooms.filter((r) => !r.isStairwell));
  const boundsOf = (room: RoomLayout): Rect => ({
    xMin: room.cellBounds.xMin * CELL_SIZE,
    xMax: (room.cellBounds.xMax + 1) * CELL_SIZE,
    zMin: room.cellBounds.zMin * CELL_SIZE,
    zMax: (room.cellBounds.zMax + 1) * CELL_SIZE,
  });
  const overlap = (a: Rect, b: Rect) =>
    a.xMin < b.xMax - 1e-6 &&
    b.xMin < a.xMax - 1e-6 &&
    a.zMin < b.zMax - 1e-6 &&
    b.zMin < a.zMax - 1e-6;

  it("leaves every room at least one cell of passage past each divider line", () => {
    const blocked: string[] = [];
    for (const room of galleries) {
      const r = room.cellBounds;
      const byLine = new Map<string, number>();
      for (const d of room.dividers) {
        const id = `${d.axis}:${d.line}`;
        byLine.set(id, (byLine.get(id) ?? 0) + d.end - d.start);
      }
      for (const [id, built] of byLine) {
        const span = id.startsWith("x") ? r.xMax - r.xMin + 1 : r.zMax - r.zMin + 1;
        if (span - built < 1) blocked.push(`${room.id} ${id}`);
      }
    }
    expect(blocked).toEqual([]);
  });

  it("keeps benches inside their room and off each other", () => {
    const wrong: string[] = [];
    for (const room of galleries) {
      const b = boundsOf(room);
      const seats = room.benches.map(benchRect);
      for (const seat of seats) {
        if (
          seat.xMin <= b.xMin + 1 ||
          seat.xMax >= b.xMax - 1 ||
          seat.zMin <= b.zMin + 1 ||
          seat.zMax >= b.zMax - 1
        )
          wrong.push(`${room.id}: bench within 1 m of a wall`);
      }
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          if (overlap(seats[i], seats[j])) wrong.push(`${room.id}: benches overlap`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("puts a visitor down clear of every fitting", () => {
    const blocked = galleries
      .filter((room) => {
        const p = arrivalPoint(room);
        return !clearOfFittings({ rooms: [room] }, p.x, p.z, 0.3);
      })
      .map((room) => room.id);
    expect(blocked).toEqual([]);
  });

  it("hangs works on dividers, each on a divider its room has", () => {
    let onDividers = 0;
    const missing: string[] = [];
    for (const room of galleries) {
      for (const p of room.placements) {
        if (p.divider === undefined) continue;
        onDividers++;
        if (!room.dividers[p.divider]) missing.push(`${room.id} ${p.artwork.id}`);
      }
    }
    expect(missing).toEqual([]);
    expect(onDividers).toBeGreaterThan(0);
  });

  // A giant hangs at its real size in a hall, across storeys, and is not
  // held to a room's ceiling.
  const hung = galleries.flatMap((room) =>
    room.placements.filter((p) => !p.giant).map((p) => ({ room, p })),
  );
  /** How far the frame the work hangs in reaches past its canvas. */
  const reachOf = (p: Placement) =>
    frameReach(p.frame ?? pickFrameDesign(p.artwork), p.widthM, p.heightM);

  it("keeps every frame 0.4 m off the floor", () => {
    expect(hung.length).toBeGreaterThan(100);
    let lowest = Number.POSITIVE_INFINITY;
    let lowestId = "";
    for (const { room, p } of hung) {
      const bottom = p.position[1] - p.heightM / 2 - reachOf(p) - room.worldRect.y;
      if (bottom < lowest || Number.isNaN(bottom)) {
        lowest = bottom;
        lowestId = p.artwork.id;
      }
    }
    expect(lowest, lowestId).toBeGreaterThanOrEqual(PAINTING_FLOOR_GAP - 1e-9);
  });

  it("leaves wall for the picture light above every frame", () => {
    let least = Number.POSITIVE_INFINITY;
    let leastId = "";
    for (const { room, p } of hung) {
      const top = p.position[1] + p.heightM / 2 + reachOf(p) - room.worldRect.y;
      const left = room.ceilingHeight - top;
      if (left < least || Number.isNaN(left)) {
        least = left;
        leastId = p.artwork.id;
      }
    }
    expect(least, leastId).toBeGreaterThanOrEqual(0.5);
  });

  it("signs each stair hall's floors on pylons, up on the left and down on the right", () => {
    const misplaced: string[] = [];
    floors: for (const floor of layout.floors) {
      const posts = stairSignPosts(floor);
      const wantCount = floor.index > 0 && floor.index < top ? 4 : 2;
      if (posts.length !== wantCount) {
        misplaced.push(`floor ${floor.index + 1}: ${posts.length} pylons`);
        continue;
      }
      for (const post of posts) {
        const labels = `${post.up ?? "-"}/${post.down ?? "-"}`;
        // The visitor faces the stair from its lobby (local +z), so its
        // left is local -x.
        const stair = layout.grandStairs!.find((s) => post.id.startsWith(`${s.id}-sign-`))!;
        const left = toStairLocal(stair, post.x, post.z).x < 0;
        const want = left
          ? `${floor.index < top ? layout.floors[floor.index + 1].title : "-"}/-`
          : `-/${floor.index > 0 ? layout.floors[floor.index - 1].title : "-"}`;
        if (labels !== want) misplaced.push(`${post.id}: ${labels}, not ${want}`);
        // The pylon's footprint, with 0.3 m either side and in front, is
        // this floor's hall floor: no flight, no void. Its back stands
        // against the balustrade over the void.
        for (const dx of [-0.75, 0.75]) {
          for (const dz of [-0.09, 0.4]) {
            const x = post.x + dx * Math.cos(post.rotationY) + dz * Math.sin(post.rotationY);
            const z = post.z - dx * Math.sin(post.rotationY) + dz * Math.cos(post.rotationY);
            const hall = grandStairsAt(layout.grandStairs!, x, z, floor.y);
            const surface = grandSurfaceAt(hall, x, z, floor.y);
            if (surface?.floorIndex !== floor.index || Math.abs(surface.y - floor.y) > 1e-6) {
              misplaced.push(`${post.id} at ${x.toFixed(2)}, ${z.toFixed(2)}`);
              continue floors;
            }
          }
        }
      }
    }
    expect(misplaced).toEqual([]);
  });
});
