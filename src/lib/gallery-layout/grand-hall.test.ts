import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { hangGrandHall, pickHallCandidates } from "./grand-hall";
import type { Door, Placement, RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

const PLAQUE_FOOTPRINT = 0.06 + 0.308;
const DOOR_CLEARANCE = 0.35;

// Grand Hall footprint: 9 × 7 cells, doors centred on north (stairwell),
// west and east — the shape most floors open.
const X_MIN = 20;
const X_MAX = 28;
const Z_MIN = 29;
const Z_MAX = 35;

function door(side: Door["side"], roomId: string): Door {
  const cx = ((X_MIN + X_MAX + 1) / 2) * CELL_SIZE;
  const cz = ((Z_MIN + Z_MAX + 1) / 2) * CELL_SIZE;
  const at = {
    north: [cx, Z_MIN * CELL_SIZE],
    south: [cx, (Z_MAX + 1) * CELL_SIZE],
    west: [X_MIN * CELL_SIZE, cz],
    east: [(X_MAX + 1) * CELL_SIZE, cz],
  }[side];
  return {
    side,
    worldX: at[0],
    worldZ: at[1],
    worldY: 0,
    width: 1.4,
    connectsTo: { kind: "room", roomId },
  };
}

function makeHall(doors: Door[]): RoomLayout {
  return {
    id: "hall",
    floorIndex: 0,
    movement: "test",
    title: "test",
    description: "",
    isAnchor: true,
    roomNumber: 1,
    isStairwell: false,
    cellBounds: { xMin: X_MIN, xMax: X_MAX, zMin: Z_MIN, zMax: Z_MAX },
    worldRect: {
      xMin: X_MIN * CELL_SIZE,
      xMax: (X_MAX + 1) * CELL_SIZE,
      zMin: Z_MIN * CELL_SIZE,
      zMax: (Z_MAX + 1) * CELL_SIZE,
      y: 0,
    },
    doors,
    hasBench: true,
    placements: [],
    artworks: [],
    floorColor: "#fff",
  };
}

/** A hall-worthy work: measured size, a large scan with the full variant
 *  ladder, and pixel aspect matching its real shape. */
function work(id: string, widthCm: number, heightCm: number, artistSlug = id): ArtworkListing {
  const scale = 4000 / Math.max(widthCm, heightCm);
  return {
    id,
    artistSlug,
    objectKey: `${id}.jpg`,
    width: Math.round(widthCm * scale),
    height: Math.round(heightCm * scale),
    variantWidths: [480, 960, 1280, 1920, 2560, 4096],
    realDimensions: { widthCm, heightCm },
  } as ArtworkListing;
}

const POOL = [
  work("giant-a", 320, 200),
  work("giant-b", 310, 195),
  work("big-a", 240, 180),
  work("big-b", 230, 175),
  work("mid-a", 180, 150),
  work("mid-b", 175, 150),
  work("mid-c", 150, 160),
  work("mid-d", 145, 165),
  work("small-a", 110, 90),
  work("small-b", 105, 90),
  work("small-c", 95, 110),
  work("small-d", 90, 115),
  work("portrait", 200, 300),
];

function wallOf(p: Placement, room: RoomLayout): Door["side"] {
  const [x, , z] = p.position;
  const r = room.worldRect;
  if (Math.abs(z - Z_MIN * CELL_SIZE) < 0.1) return "north";
  if (Math.abs(z - (Z_MAX + 1) * CELL_SIZE) < 0.1) return "south";
  if (Math.abs(x - X_MIN * CELL_SIZE) < 0.1) return "west";
  expect(Math.abs(x - r.xMax)).toBeLessThan(0.2);
  return "east";
}

describe("hangGrandHall", () => {
  const hall = makeHall([door("north", "stair"), door("west", "w"), door("east", "e")]);
  const placements = hangGrandHall(hall, POOL, "stair") ?? [];
  const centreX = ((X_MIN + X_MAX + 1) / 2) * CELL_SIZE;
  const centreZ = ((Z_MIN + Z_MAX + 1) / 2) * CELL_SIZE;

  it("composes a hall from a pool of large works", () => {
    expect(placements.length).toBeGreaterThanOrEqual(8);
  });

  it("hangs every work at most once", () => {
    const ids = placements.map((p) => p.artwork.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flanks the stairwell door with the two largest works", () => {
    const north = placements.filter((p) => wallOf(p, hall) === "north");
    const inner = [...north]
      .sort((a, b) => Math.abs(a.position[0] - centreX) - Math.abs(b.position[0] - centreX))
      .slice(0, 2)
      .map((p) => p.artwork.id)
      .sort();
    expect(inner).toEqual(["giant-a", "giant-b"]);
  });

  it("mirrors every wall about its centre, at matched heights", () => {
    for (const side of ["north", "south", "west", "east"] as const) {
      const wall = placements.filter((p) => wallOf(p, hall) === side);
      const along = (p: Placement) =>
        side === "north" || side === "south" ? p.position[0] - centreX : p.position[2] - centreZ;
      for (const p of wall) {
        if (Math.abs(along(p)) < 1e-6) continue; // centrepiece
        const twin = wall.find((q) => q !== p && Math.abs(along(q) + along(p)) < 1e-6);
        expect(twin, `${p.artwork.id} on ${side} has no mirror`).toBeDefined();
        expect(twin?.heightM).toBeCloseTo(p.heightM, 9);
        expect(twin?.position[1]).toBeCloseTo(p.position[1], 9);
      }
    }
  });

  it("keeps paintings and plaques clear of doors and of each other", () => {
    for (const side of ["north", "south", "west", "east"] as const) {
      const wall = placements.filter((p) => wallOf(p, hall) === side);
      const along = (p: Placement) =>
        side === "north" || side === "south" ? p.position[0] : p.position[2];
      // Reserve the plaque on both sides, since which side it lands on
      // depends on the wall's orientation.
      const spans = wall
        .map((p) => [
          along(p) - p.widthM / 2 - PLAQUE_FOOTPRINT,
          along(p) + p.widthM / 2 + PLAQUE_FOOTPRINT,
        ])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-9);
      }
      for (const d of hall.doors.filter((d) => d.side === side)) {
        const c = side === "north" || side === "south" ? d.worldX : d.worldZ;
        const lo = c - d.width / 2 - DOOR_CLEARANCE;
        const hi = c + d.width / 2 + DOOR_CLEARANCE;
        for (const [a, b] of spans) expect(b <= lo + 1e-9 || a >= hi - 1e-9).toBe(true);
      }
    }
  });

  it("puts a centrepiece on a wall without a door", () => {
    const south = placements.filter((p) => wallOf(p, hall) === "south");
    expect(south.some((p) => Math.abs(p.position[0] - centreX) < 1e-6)).toBe(true);
  });

  it("never shows a work more than 15 % larger than its measured size", () => {
    for (const p of placements) {
      const dims = p.artwork.realDimensions;
      if (!dims) continue;
      const measured = Math.max(dims.widthCm, dims.heightCm) / 100;
      expect(Math.max(p.widthM, p.heightM)).toBeLessThanOrEqual(measured * 1.15 + 1e-9);
    }
  });

  it("falls back when the floor has too few large works", () => {
    expect(hangGrandHall(hall, POOL.slice(0, 2), "stair")).toBeNull();
  });
});

describe("pickHallCandidates", () => {
  it("ranks by size and defers an artist's fourth work", () => {
    const works = [
      work("a1", 300, 200, "a"),
      work("a2", 290, 200, "a"),
      work("a3", 280, 200, "a"),
      work("a4", 270, 200, "a"),
      work("b1", 150, 100, "b"),
    ];
    expect(pickHallCandidates(works).map((w) => w.id)).toEqual(["a1", "a2", "a3", "b1", "a4"]);
  });

  it("skips slivers and works too small to hold a wall", () => {
    const works = [work("scroll", 700, 40), work("stamp", 20, 30), work("canvas", 150, 120)];
    expect(pickHallCandidates(works).map((w) => w.id)).toEqual(["canvas"]);
  });
});
