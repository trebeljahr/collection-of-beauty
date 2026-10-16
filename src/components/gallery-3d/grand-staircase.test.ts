import { describe, expect, it } from "vitest";
import { buildGrandStair, type GrandStairDesign } from "@/lib/gallery-layout/grand-stair";
import { FLOOR_SEPARATION } from "@/lib/gallery-layout/world-coords";
import { buildStair } from "./grand-staircase";

const DESIGNS: GrandStairDesign[] = ["loggia", "court"];
const HALF = 13.75;
/** A loggia's end wall stands three cells inside its square, on its
 *  landings' far edge, as in the block plan. */
const backOf = (design: GrandStairDesign) => (design === "loggia" ? HALF - 7.5 : HALF);

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
    back: backOf(design),
    turns: 0,
    hasFlightBelow: storey > 0,
    hasFlightAbove: storey < 2,
  });
}

describe("grand stair geometry", () => {
  // A hall's walls are planes on its lines, and the room behind draws
  // its own on the same line. A loggia's galleries end in a balustrade
  // that runs to the side wall, and the post at that end is centred on
  // the wall: half of it stood in the long gallery next door.
  it("draws nothing outside its hall", () => {
    let furthest = Number.NEGATIVE_INFINITY;
    let where = "";
    for (const design of DESIGNS) {
      for (const storey of [0, 1, 2]) {
        const built = buildStair(stairOf(design, storey));
        for (const [name, geometry] of Object.entries(built)) {
          if (!geometry) continue;
          const at = geometry.getAttribute("position");
          for (let i = 0; i < at.count; i++) {
            // How far past the nearest wall: positive is outside.
            const reach = Math.max(
              Math.abs(at.getX(i)) - HALF,
              at.getZ(i) - HALF,
              -at.getZ(i) - backOf(design),
            );
            if (reach > furthest || Number.isNaN(reach)) {
              furthest = reach;
              where = `${design}, storey ${storey}, ${name}, vertex ${i}`;
            }
          }
        }
      }
    }
    expect(furthest, where).toBeLessThan(0);
  });
});
