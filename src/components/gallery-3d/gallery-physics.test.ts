import { describe, expect, it } from "vitest";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  FLOOR_SEPARATION,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
} from "@/lib/gallery-layout/world-coords";
import { createGalleryCollisionController } from "./gallery-physics";
import { spiralGateHalfArc } from "./staircase";

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
  stairsIn: [],
  stairsOut: [stair],
} as unknown as FloorLayout;

/** Walk 10 m radially inward at `theta`, one 5 cm step at a time, and
 *  report how close to the spiral's centre the player got. */
async function walkInwardAt(theta: number): Promise<number> {
  const controller = await createGalleryCollisionController(groundFloor, [stair], PLAYER_RADIUS);
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
  // The ground floor has no cutout, so for a long time it had no
  // perimeter rail either — "there's no hole, nothing to fence". But
  // the spiral's own rails climb with the treads, so past ~100° of arc
  // from the gate they sit above head height and the annulus was open
  // from every direction. The player walked in under the helix from
  // behind and clipped straight through the low treads coming round.
  it("blocks an approach from behind the spiral", async () => {
    const reached = await walkInwardAt(stair.entryAngle + Math.PI);
    expect(reached).toBeGreaterThan(SPIRAL_OUTER_RADIUS);
  });

  it("still lets the player in through the entry gate", async () => {
    const gate = stair.entryAngle + spiralGateHalfArc(stair.numSteps) * 0.35;
    const reached = await walkInwardAt(gate);
    expect(reached).toBeLessThan(SPIRAL_OUTER_RADIUS);
  });
});
