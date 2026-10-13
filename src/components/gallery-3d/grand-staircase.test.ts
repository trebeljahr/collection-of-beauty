import { describe, expect, it } from "vitest";
import {
  buildGrandStair,
  GRAND_RAIL_HEIGHT,
  type GrandStairDesign,
} from "@/lib/gallery-layout/grand-stair";
import { FLOOR_SEPARATION } from "@/lib/gallery-layout/world-coords";
import { buildStair } from "./grand-staircase";

const DESIGNS: GrandStairDesign[] = ["loggia", "imperial", "arcs", "hourglass", "court"];
const HALF = 13.75;

/** The stair of one storey of a hall four floors high. */
function stairOf(design: GrandStairDesign, storey: number) {
  return buildGrandStair({
    id: `${design}-${storey}`,
    design,
    lowerFloor: storey,
    upperFloor: storey + 1,
    topFloor: design === "court" ? 3 : storey + 1,
    lowerLabel: "",
    upperLabel: "",
    lowerY: storey * FLOOR_SEPARATION,
    upperY: (storey + 1) * FLOOR_SEPARATION,
    centerX: 0,
    centerZ: 0,
    half: HALF,
    turns: 0,
    hasFlightBelow: storey > 0,
    hasFlightAbove: storey < 2,
    sheerWall: true,
  });
}

describe("grand stair geometry", () => {
  // A hall's walls are planes on its lines, and the room behind draws
  // its own on the same line. A loggia's galleries end in a balustrade
  // that runs to the side wall, and the post at that end is centred on
  // the wall: half of it stood in the long gallery next door.
  it("draws nothing outside its hall", () => {
    let furthest = 0;
    let where = "";
    for (const design of DESIGNS) {
      for (const storey of [0, 1, 2]) {
        const built = buildStair(stairOf(design, storey));
        for (const [name, geometry] of Object.entries(built)) {
          if (!geometry) continue;
          const at = geometry.getAttribute("position");
          for (let i = 0; i < at.count; i++) {
            const reach = Math.max(Math.abs(at.getX(i)), Math.abs(at.getZ(i)));
            if (reach > furthest || Number.isNaN(reach)) {
              furthest = reach;
              where = `${design}, storey ${storey}, ${name}, vertex ${i}`;
            }
          }
        }
      }
    }
    expect(furthest, where).toBeLessThan(HALF);
  });

  it("keeps a post where a balustrade ends at a wall", () => {
    // The loggia's gallery fence meets the side wall 2.3 m short of the
    // hall's middle. The post there is cut at the wall, not left out:
    // it stands higher than the rail it ends.
    const stair = stairOf("loggia", 1);
    const at = buildStair(stair).stone?.getAttribute("position");
    const overRail = stair.upperY + GRAND_RAIL_HEIGHT + 0.05;
    let onWall = 0;
    for (let i = 0; at && i < at.count; i++) {
      const atWall = Math.abs(at.getX(i)) > HALF - 0.05 && Math.abs(at.getZ(i) + 2.3) < 0.3;
      if (atWall && at.getY(i) > overRail) onWall++;
    }
    expect(onWall).toBeGreaterThan(0);
  });
});
