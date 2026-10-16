import { describe, expect, it } from "vitest";
import { BENCH_HEIGHT, writeDividerEdges } from "@/lib/gallery-layout/fittings";
import type { Bench, Divider, Door, FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  FLOOR_SEPARATION,
  PORTAL_HEIGHT,
  PORTAL_WIDTH,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
} from "@/lib/gallery-layout/world-coords";
import { createGalleryCollisionController } from "./gallery-physics";
import { spiralGateHalfArc } from "./spiral-physics";

const GRID = 12;
const PLAYER_RADIUS = 0.3;

const stair: Staircase = {
  id: "stair-0-to-1",
  lowerFloor: 0,
  upperFloor: 1,
  lowerLabel: "lower",
  upperLabel: "upper",
  centerX: (GRID / 2) * CELL_SIZE,
  centerZ: (GRID / 2) * CELL_SIZE,
  innerRadius: SPIRAL_INNER_RADIUS,
  outerRadius: SPIRAL_OUTER_RADIUS,
  numSteps: SPIRAL_STEPS_PER_FLOOR,
  direction: 1,
  lowerY: 0,
  upperY: FLOOR_SEPARATION,
  entryAngle: Math.PI / 2,
};

/** Bare ground floor: one open walkable slab with the spiral rising out
 *  of it. Enough for the collider builder — it only reads the grid
 *  masks, `y`, `index`, and the stair lists. */
const groundFloor = {
  index: 0,
  y: 0,
  gridSize: { x: GRID, z: GRID },
  walkable: new Uint8Array(GRID * GRID).fill(1),
  blockedEdgesEW: new Uint8Array((GRID - 1) * GRID),
  blockedEdgesNS: new Uint8Array(GRID * (GRID - 1)),
  rooms: [],
  stairsIn: [],
  stairsOut: [stair],
} as unknown as FloorLayout;

/** Walk 10 m radially inward at `theta`, one 5 cm step at a time, and
 *  report how close to the spiral's centre the player got. */
async function walkInwardAt(theta: number): Promise<number> {
  const controller = await createGalleryCollisionController(groundFloor, PLAYER_RADIUS);
  const startR = 10;
  let x = stair.centerX + startR * Math.cos(theta);
  let z = stair.centerZ + startR * Math.sin(theta);
  const stepX = -0.05 * Math.cos(theta);
  const stepZ = -0.05 * Math.sin(theta);
  for (let i = 0; i < 200; i++) {
    const allowed = controller.move({ x, y: 0, z }, { x: stepX, y: 0, z: stepZ });
    x += allowed.x;
    z += allowed.z;
  }
  controller.dispose();
  return Math.hypot(x - stair.centerX, z - stair.centerZ);
}

describe("ground-floor spiral perimeter", () => {
  // The ground floor's spiral rises out of solid slab, so unlike every
  // floor above it there is no hole to fence and no perimeter rail —
  // visual or collider. What keeps the player off the treads is
  // `stairSurfaceAt`: you can only step ON where a tread is at your
  // feet. The footprint itself stays open, because the far arc of it is
  // the room under the stairs. Asserting the absence here so a future
  // "just add a collider ring" doesn't quietly wall that room off.
  it("puts no collider ring around the spiral", async () => {
    const reached = await walkInwardAt(stair.entryAngle + Math.PI);
    expect(reached).toBeLessThan(SPIRAL_OUTER_RADIUS);
  });

  it("leaves the entry gate clear", async () => {
    const gate = stair.entryAngle + spiralGateHalfArc(stair.numSteps) * 0.35;
    const reached = await walkInwardAt(gate);
    expect(reached).toBeLessThan(SPIRAL_OUTER_RADIUS);
  });
});

describe("room fittings", () => {
  // One open 30 m square room with no stair: a bench in the middle of
  // nowhere, a wing wall off the north wall, and a wall right across at
  // z = 20 with a portal in it.
  const bench: Bench = { x: 6.25, z: 8.75, along: "x" };
  const divider: Divider = { axis: "z", line: 8, start: 0, end: 2 };
  const WALL_Z = 20;
  const PORTAL_X = 13.75;
  const portal = {
    side: "south",
    worldX: PORTAL_X,
    worldZ: WALL_Z,
    worldY: 0,
    width: PORTAL_WIDTH,
    height: PORTAL_HEIGHT,
    portal: true,
    connectsTo: { kind: "room", roomId: "south" },
  } satisfies Door;

  function makeFloor(): FloorLayout {
    const blockedEdgesEW = new Uint8Array((GRID - 1) * GRID);
    const blockedEdgesNS = new Uint8Array(GRID * (GRID - 1));
    // The cross wall, open on the three cell edges the portal reaches.
    for (let x = 0; x < GRID; x++) {
      const mid = (x + 0.5) * CELL_SIZE;
      if (Math.abs(mid - PORTAL_X) > 3) blockedEdgesNS[7 * GRID + x] = 1;
    }
    writeDividerEdges([divider], { x: GRID, z: GRID }, blockedEdgesEW, blockedEdgesNS);
    return {
      index: 0,
      y: 0,
      gridSize: { x: GRID, z: GRID },
      walkable: new Uint8Array(GRID * GRID).fill(1),
      blockedEdgesEW,
      blockedEdgesNS,
      rooms: [
        {
          cellBounds: { xMin: 0, xMax: GRID - 1, zMin: 0, zMax: GRID - 1 },
          ceilingHeight: 4.2,
          dividers: [divider],
          benches: [bench],
          doors: [portal],
        },
      ],
      stairsIn: [],
      stairsOut: [],
    } as unknown as FloorLayout;
  }

  /** Walk in a straight line, 5 cm at a time, and report where it ends. */
  async function walk(from: [number, number], heading: [number, number], metres: number) {
    const controller = await createGalleryCollisionController(makeFloor(), PLAYER_RADIUS);
    const length = Math.hypot(heading[0], heading[1]);
    const step = { x: (0.05 * heading[0]) / length, y: 0, z: (0.05 * heading[1]) / length };
    let [x, z] = from;
    for (let i = 0; i < metres / 0.05; i++) {
      const allowed = controller.move({ x, y: 0, z }, step);
      x += allowed.x;
      z += allowed.z;
    }
    controller.dispose();
    return { x, z };
  }

  it("stops the player at a bench's edge", async () => {
    // The bench runs x 5.25..7.25 and z 8.45..9.05.
    const fromEast = await walk([10, 8.75], [-1, 0], 6);
    expect(fromEast.x).toBeGreaterThan(7.25 + PLAYER_RADIUS);
    expect(fromEast.x).toBeLessThan(7.25 + PLAYER_RADIUS + 0.1);
    const fromSouth = await walk([6.25, 12], [0, -1], 6);
    expect(fromSouth.z).toBeGreaterThan(9.05 + PLAYER_RADIUS);
    expect(fromSouth.z).toBeLessThan(9.05 + PLAYER_RADIUS + 0.1);
  });

  it("lets the player slide round a bench", async () => {
    // Heading west and a little north, into the bench's east end.
    const end = await walk([10, 9.0], [-1, -0.35], 8);
    expect(end.x).toBeLessThan(5.25);
    expect(end.z).toBeLessThan(8.45 - PLAYER_RADIUS + 0.05);
  });

  it("lets a jump onto a bench and over it", async () => {
    const controller = await createGalleryCollisionController(makeFloor(), PLAYER_RADIUS);
    // Feet at the top of a jump (0.82 m), right beside the bench.
    const jumping = controller.move({ x: 7.6, y: 0.82, z: 8.75 }, { x: -0.3, y: 0, z: 0 });
    expect(jumping.x).toBeCloseTo(-0.3, 6);
    // Feet on the seat, in the middle of the bench.
    const standing = controller.move({ x: 6.25, y: BENCH_HEIGHT, z: 8.75 }, { x: 0, y: 0, z: 0.3 });
    expect(standing.z).toBeCloseTo(0.3, 6);
    controller.dispose();
  });

  it("stops a body whose feet are still under the seat", async () => {
    const controller = await createGalleryCollisionController(makeFloor(), PLAYER_RADIUS);
    // A step's height, and the capsule's round end level with the
    // seat's edge. Neither rides up the bench.
    for (const feet of [0.2, 0.32, 0.39]) {
      const allowed = controller.move({ x: 7.6, y: feet, z: 8.75 }, { x: -0.3, y: 0, z: 0 });
      expect(7.6 + allowed.x, `feet at ${feet}`).toBeGreaterThan(7.25 + PLAYER_RADIUS);
    }
    controller.dispose();
  });

  it("stops a body over a bench at a divider all the same", async () => {
    const controller = await createGalleryCollisionController(makeFloor(), PLAYER_RADIUS);
    const allowed = controller.move({ x: 19.2, y: 0.82, z: 2.5 }, { x: 0.5, y: 0, z: 0 });
    controller.dispose();
    expect(19.2 + allowed.x).toBeLessThan(19.8 - PLAYER_RADIUS);
  });

  it("leaves a body free to walk on where it drops off a bench", async () => {
    const controller = await createGalleryCollisionController(makeFloor(), PLAYER_RADIUS);
    // The seat stops carrying a body one radius past its edge, which
    // is nearer than the collider lets a walking body come.
    const edge = 7.25 + PLAYER_RADIUS;
    const away = controller.move({ x: edge, y: 0, z: 8.75 }, { x: 0.05, y: 0, z: 0 });
    expect(away.x).toBeCloseTo(0.05, 6);
    const along = controller.move({ x: edge, y: 0, z: 8.75 }, { x: 0, y: 0, z: 0.05 });
    expect(along.z).toBeCloseTo(0.05, 3);
    const back = controller.move({ x: edge, y: 0, z: 8.75 }, { x: -0.05, y: 0, z: 0 });
    expect(back.x).toBeGreaterThan(-0.001);
    controller.dispose();
  });

  it("stops the player at a divider's face, not on its grid line", async () => {
    // The wing wall stands on x = 20, 0.4 m thick, z 0..5.
    const fromWest = await walk([17, 2.5], [1, 0], 6);
    expect(fromWest.x).toBeLessThan(19.8 - PLAYER_RADIUS);
    expect(fromWest.x).toBeGreaterThan(19.8 - PLAYER_RADIUS - 0.1);
    const fromEast = await walk([23, 2.5], [-1, 0], 6);
    expect(fromEast.x).toBeGreaterThan(20.2 + PLAYER_RADIUS);
  });

  it("leaves the passage past a divider's free end open", async () => {
    const end = await walk([17, 6], [1, 0], 6);
    expect(end.x).toBeGreaterThan(22.5);
  });

  it("walks through a portal and is stopped by its jambs", async () => {
    const through = await walk([PORTAL_X + 1.3, 17], [0, 1], 6);
    expect(through.z).toBeGreaterThan(WALL_Z + 2);
    // 2.2 m off the centre: inside the three cells the masks open,
    // outside the 3.5 m opening.
    const jamb = await walk([PORTAL_X + 2.2, 17], [0, 1], 6);
    expect(jamb.z).toBeLessThan(WALL_Z - PLAYER_RADIUS);
    const farJamb = await walk([PORTAL_X - 3.4, 17], [0, 1], 6);
    expect(farJamb.z).toBeLessThan(WALL_Z - PLAYER_RADIUS);
  });
});
