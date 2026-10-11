import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import {
  computeRoomRuns,
  PLAQUE_FOOTPRINT,
  packRun,
  runLength,
  sideClearance,
} from "./place-paintings";
import type { Placement, RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

// Expected wall-margin and door clearance, mirrored from
// place-paintings.ts. Kept here rather than exported so the production
// module's surface stays minimal — if either moves, this test fails
// fast and we update.
const WALL_MARGIN = 0.3;
const DOOR_CLEARANCE = 0.35;

/** Where a hung work's claim on the wall starts and ends: its frame on
 *  the left, its frame and plaque on the right. */
function claim(p: Placement): [number, number] {
  const { left, right } = sideClearance({ artwork: p.artwork, wM: p.widthM, hM: p.heightM });
  return [p.position[0] - p.widthM / 2 - left, p.position[0] + p.widthM / 2 + right];
}

function makeRoom(args: {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  doors?: RoomLayout["doors"];
}): RoomLayout {
  const { xMin, xMax, zMin, zMax } = args;
  return {
    id: "r",
    floorIndex: 0,
    movement: "test",
    title: "test",
    description: "",
    isAnchor: false,
    roomNumber: 1,
    isStairwell: false,
    cellBounds: { xMin, xMax, zMin, zMax },
    worldRect: {
      xMin: xMin * CELL_SIZE,
      xMax: (xMax + 1) * CELL_SIZE,
      zMin: zMin * CELL_SIZE,
      zMax: (zMax + 1) * CELL_SIZE,
      y: 0,
    },
    doors: args.doors ?? [],
    hasBench: false,
    placements: [],
    artworks: [],
    floorColor: "#fff",
  };
}

function makeWork(id: string, wM: number, hM: number) {
  return { artwork: { id } as ArtworkListing, wM, hM };
}

describe("computeRoomRuns", () => {
  it("insets each wall from both perpendicular walls", () => {
    const runs = computeRoomRuns(makeRoom({ xMin: 0, xMax: 2, zMin: 0, zMax: 2 }));
    // No doors → one run per wall, each the full wall minus two margins.
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      expect(runLength(run)).toBeCloseTo(3 * CELL_SIZE - 2 * WALL_MARGIN, 9);
    }
  });

  it("splits a wall into two runs either side of a door", () => {
    const doorX = 1.5 * CELL_SIZE; // centre of the middle north cell
    const runs = computeRoomRuns(
      makeRoom({
        xMin: 0,
        xMax: 2,
        zMin: 0,
        zMax: 2,
        doors: [
          {
            side: "north",
            worldX: doorX,
            worldZ: 0,
            worldY: 0,
            width: 1.4,
            connectsTo: { kind: "room", roomId: "h" },
          },
        ],
      }),
    );
    const north = runs.filter((r) => r.normalZ === 1);
    expect(north).toHaveLength(2);
    // Neither run overlaps the door opening plus its clearance.
    const cutLo = doorX - 0.7 - DOOR_CLEARANCE;
    const cutHi = doorX + 0.7 + DOOR_CLEARANCE;
    for (const run of north) {
      // north wall has sign +1, so u is world x directly.
      expect(run.uMax <= cutLo + 1e-9 || run.uMin >= cutHi - 1e-9).toBe(true);
    }
  });
});

describe("packRun", () => {
  const [run] = computeRoomRuns(makeRoom({ xMin: 0, xMax: 3, zMin: 0, zMax: 3 })).filter(
    (r) => r.normalZ === 1,
  );

  it("gives every neighbouring pair the same gap regardless of width", () => {
    const placements = packRun(run, [
      makeWork("a", 0.3, 0.4),
      makeWork("b", 2.0, 1.5),
      makeWork("c", 0.5, 0.6),
      makeWork("d", 1.2, 1.0),
    ]);
    const sorted = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++)
      gaps.push(claim(sorted[i])[0] - claim(sorted[i - 1])[1]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9);
    expect(gaps[0]).toBeGreaterThan(0);
  });

  it("keeps every frame and its plaque inside the run", () => {
    const placements = packRun(run, [
      makeWork("a", 0.3, 0.4),
      makeWork("b", 2.0, 1.5),
      makeWork("c", 0.5, 0.6),
    ]);
    for (const p of placements) {
      const [lo, hi] = claim(p);
      expect(lo).toBeGreaterThanOrEqual(run.uMin - 1e-9);
      expect(hi).toBeLessThanOrEqual(run.uMax + 1e-9);
      // The claim holds a frame on both sides and the plaque on the right.
      expect(hi - lo).toBeGreaterThan(p.widthM + PLAQUE_FOOTPRINT);
    }
  });

  it("hangs the widest work in the middle of the run", () => {
    const placements = packRun(run, [
      makeWork("a", 0.3, 0.4),
      makeWork("wide", 2.0, 1.5),
      makeWork("c", 0.5, 0.6),
    ]);
    const sorted = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    expect(sorted[1].artwork.id).toBe("wide");
  });

  it("centres a sparse run instead of stretching it across the wall", () => {
    // One small work on a 10 m wall: stretching would put it in the
    // middle anyway, but the two end margins must stay equal.
    const placements = packRun(run, [makeWork("lonely", 0.4, 0.5)]);
    const p = placements[0];
    const [lo, hi] = claim(p);
    const leftMargin = lo - run.uMin;
    const rightMargin = run.uMax - hi;
    expect(leftMargin).toBeCloseTo(rightMargin, 9);
  });
});
