import { describe, expect, it } from "vitest";
import { computeRoomSlots } from "./place-paintings";
import type { RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

// Expected wall-margin and plaque footprint, mirrored from place-paintings.ts.
// Kept here rather than exported so the production module's surface stays
// minimal — if either constant moves, this test fails fast and we update.
const WALL_MARGIN = 0.3;
const PLAQUE_FOOTPRINT = 0.06 + 0.308;

function makeRoom(args: { xMin: number; xMax: number; zMin: number; zMax: number }): RoomLayout {
  const { xMin, xMax, zMin, zMax } = args;
  return {
    id: "r",
    floorIndex: 0,
    movement: "test",
    title: "test",
    description: "",
    isAnchor: false,
    isStairwell: false,
    cellBounds: { xMin, xMax, zMin, zMax },
    worldRect: {
      xMin: xMin * CELL_SIZE,
      xMax: (xMax + 1) * CELL_SIZE,
      zMin: zMin * CELL_SIZE,
      zMax: (zMax + 1) * CELL_SIZE,
      y: 0,
    },
    doors: [],
    hasBench: false,
    placements: [],
    artworks: [],
    floorColor: "#fff",
  };
}

describe("computeRoomSlots wall margin", () => {
  // 3-cell-wide room with no doors → north wall has three slots. The
  // leftmost is a left-corner cell, the rightmost is a right-corner
  // cell (the plaque side), the middle is interior.
  const slots = computeRoomSlots(makeRoom({ xMin: 0, xMax: 2, zMin: 0, zMax: 2 }));
  const northSlots = slots.filter((s) => s.normalZ === 1).sort((a, b) => a.wallX - b.wallX);

  it("keeps the painting's left edge clear of the left perpendicular wall", () => {
    // The leftmost north-wall cell touches the west wall at x = 0. The
    // painting's left edge sits at wallX - maxWidth/2 and must clear the
    // west wall by at least WALL_MARGIN.
    const leftCorner = northSlots[0];
    const leftEdge = leftCorner.wallX - leftCorner.maxWidth / 2;
    expect(leftEdge).toBeGreaterThanOrEqual(WALL_MARGIN - 1e-9);
  });

  it("keeps painting + plaque clear of the right perpendicular wall", () => {
    // The rightmost north-wall cell sits next to the east wall at
    // x = 3 * CELL_SIZE. The plaque hangs on the painting's right, so
    // the rightmost extent is wallX + maxWidth/2 + PLAQUE_FOOTPRINT.
    const rightCorner = northSlots[northSlots.length - 1];
    const eastWallX = 3 * CELL_SIZE;
    const rightEdge = rightCorner.wallX + rightCorner.maxWidth / 2 + PLAQUE_FOOTPRINT;
    expect(eastWallX - rightEdge).toBeGreaterThanOrEqual(WALL_MARGIN - 1e-9);
  });

  it("right-corner cell is narrower than left-corner cell (plaque eats budget)", () => {
    expect(northSlots[northSlots.length - 1].maxWidth).toBeLessThan(northSlots[0].maxWidth);
  });
});
