import { describe, expect, it } from "vitest";
import type { Door, FloorLayout, RoomLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE, DOOR_WIDTH } from "@/lib/gallery-layout/world-coords";
import { fitsDoorwayApertures, nudgeTowardDoorwayCenter } from "./doorway-collision";

const BODY_RADIUS = 0.3;
const COMFORT_CLEARANCE = 0.45;
const WALL_X = CELL_SIZE;
const DOOR_Z = CELL_SIZE / 2;

function makeRoom(doors: Door[]): RoomLayout {
  return {
    id: "a",
    floorIndex: 0,
    movement: "test",
    title: "test",
    description: "",
    isAnchor: false,
    isStairwell: false,
    cellBounds: { xMin: 0, xMax: 0, zMin: 0, zMax: 0 },
    worldRect: {
      xMin: 0,
      xMax: CELL_SIZE,
      zMin: 0,
      zMax: CELL_SIZE,
      y: 0,
    },
    doors,
    hasBench: false,
    placements: [],
    artworks: [],
    floorColor: "#fff",
  };
}

function makeFloor(): Pick<FloorLayout, "rooms"> {
  return {
    rooms: [
      makeRoom([
        {
          side: "east",
          worldX: WALL_X,
          worldZ: DOOR_Z,
          worldY: 0,
          width: DOOR_WIDTH,
          connectsTo: { kind: "hallway", hallwayId: "room:b" },
        },
      ]),
    ],
  };
}

describe("doorway collision", () => {
  it("uses the visual door aperture near the wall plane", () => {
    const floor = makeFloor();

    expect(fitsDoorwayApertures(floor, WALL_X - 0.1, DOOR_Z + 0.35, BODY_RADIUS)).toBe(true);
    expect(fitsDoorwayApertures(floor, WALL_X - 0.1, DOOR_Z + 0.55, BODY_RADIUS)).toBe(false);
  });

  it("does not apply aperture checks away from the wall plane", () => {
    const floor = makeFloor();

    expect(fitsDoorwayApertures(floor, WALL_X - 0.6, DOOR_Z + 0.55, BODY_RADIUS)).toBe(true);
  });

  it("nudges close doorway approaches toward the opening center", () => {
    const floor = makeFloor();
    const nudged = nudgeTowardDoorwayCenter(
      floor,
      WALL_X - 0.5,
      DOOR_Z + 0.6,
      WALL_X - 0.1,
      DOOR_Z + 0.6,
      BODY_RADIUS,
      COMFORT_CLEARANCE,
      0.35,
    );

    expect(nudged).not.toBeNull();
    expect(nudged?.x).toBeCloseTo(WALL_X - 0.1);
    expect(nudged?.z).toBeCloseTo(DOOR_Z + 0.25);
  });

  it("does not magnetize approaches far outside the visual doorway", () => {
    const floor = makeFloor();
    const nudged = nudgeTowardDoorwayCenter(
      floor,
      WALL_X - 0.5,
      DOOR_Z + 1.2,
      WALL_X - 0.1,
      DOOR_Z + 1.2,
      BODY_RADIUS,
      COMFORT_CLEARANCE,
      0.35,
    );

    expect(nudged).toBeNull();
  });
});
