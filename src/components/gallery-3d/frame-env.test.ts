import { describe, expect, it } from "vitest";
import { buildFrameEnvEquirect } from "./frame-env";

describe("frame env map", () => {
  // A DataTexture is uploaded without flipY, and three's equirect lookup
  // reads v = 0 as straight down. So the first row of the data must be
  // the floor and the lamps must lie in the rows after the middle.
  it("puts the floor in row 0 and the lamps above the horizon", () => {
    const tex = buildFrameEnvEquirect("#ff0000", "#00ff00", "#0000ff");
    const { data, width, height } = tex.image as {
      data: Float32Array;
      width: number;
      height: number;
    };
    const px = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const [r0, , b0] = px(0, 0);
    const [rTop, , bTop] = px(0, height - 1);
    expect(b0).toBeGreaterThan(r0);
    expect(rTop).toBeGreaterThan(bTop);

    let brightestRow = -1;
    let brightest = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const g = px(x, y)[1];
        if (g > brightest) {
          brightest = g;
          brightestRow = y;
        }
      }
    }
    expect(brightestRow, `lamp peak in row ${brightestRow}`).toBeGreaterThan(height / 2);
  });
});
