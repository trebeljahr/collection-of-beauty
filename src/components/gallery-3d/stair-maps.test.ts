import { describe, expect, it } from "vitest";
import type { Pixels } from "./frame-maps";
import { buildAshlarMaps, buildMarbleMaps, buildPileMaps } from "./stair-maps";

/** How far the colour jumps across the tile's seam, against how far it
 *  moves between two neighbouring texels inside it: mean over a row of
 *  texels, red channel. */
function seamRatio(p: Pixels, axis: "u" | "v"): number {
  const at = (x: number, y: number) => p.data[(y * p.width + x) * 4];
  let seam = 0;
  let inside = 0;
  const n = axis === "u" ? p.height : p.width;
  for (let k = 0; k < n; k++) {
    if (axis === "u") {
      seam += Math.abs(at(p.width - 1, k) - at(0, k));
      inside += Math.abs(at(1, k) - at(0, k));
    } else {
      seam += Math.abs(at(k, p.height - 1) - at(k, 0));
      inside += Math.abs(at(k, 1) - at(k, 0));
    }
  }
  return seam / Math.max(1, inside);
}

describe("stair maps", () => {
  // A tread is a slab cut from anywhere in the map, and a soffit or a
  // wall runs over several tiles: a seam would draw a line across them.
  it("tile without a seam", () => {
    const maps: Array<[string, Pixels]> = [
      ["marble", buildMarbleMaps().color],
      ["ashlar", buildAshlarMaps().color],
      ["pile", buildPileMaps().color],
    ];
    let worst = 0;
    let where = "";
    for (const [name, p] of maps) {
      for (const axis of ["u", "v"] as const) {
        const r = seamRatio(p, axis);
        if (r > worst || Number.isNaN(r)) {
          worst = r;
          where = `${name} across ${axis}`;
        }
      }
    }
    expect(worst, where).toBeLessThan(2);
  });
});
