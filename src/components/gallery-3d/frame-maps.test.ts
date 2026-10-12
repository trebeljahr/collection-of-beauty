import { describe, expect, it } from "vitest";
import {
  ASH,
  buildCarveAtlas,
  buildGiltMaps,
  buildLacquerMaps,
  buildWoodMaps,
  CARVE_ATLAS_H,
  CARVE_ATLAS_W,
  CARVE_ROWS,
  heightToNormal,
  tileCracks,
  tileFbm,
  tileNoise,
} from "./frame-maps";

/** Largest step between a pixel and its right-hand neighbour, counting
 *  the wrap from the last column to the first. */
function maxStepX(data: ArrayLike<number>, w: number, h: number, stride = 1, channel = 0) {
  let seam = 0;
  let inside = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * stride + channel];
      const b = data[(y * w + ((x + 1) % w)) * stride + channel];
      const d = Math.abs(a - b);
      if (x === w - 1) seam = Math.max(seam, d);
      else inside = Math.max(inside, d);
    }
  }
  return { seam, inside };
}

function maxStepY(data: ArrayLike<number>, w: number, h: number, stride = 1, channel = 0) {
  let seam = 0;
  let inside = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * stride + channel];
      const b = data[(((y + 1) % h) * w + x) * stride + channel];
      const d = Math.abs(a - b);
      if (y === h - 1) seam = Math.max(seam, d);
      else inside = Math.max(inside, d);
    }
  }
  return { seam, inside };
}

describe("tileable noise", () => {
  it("stays in 0..1 and wraps at both edges", () => {
    for (const noise of [tileNoise(64, 48, 5, 7, 1), tileFbm(64, 48, 3, 4, 3, 2)]) {
      // Math.min and Math.max return NaN for a NaN sample, which fails both.
      let min = Infinity;
      let max = -Infinity;
      for (const v of noise) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1);
      const x = maxStepX(noise, 64, 48);
      const y = maxStepY(noise, 64, 48);
      expect(x.seam).toBeLessThanOrEqual(x.inside);
      expect(y.seam).toBeLessThanOrEqual(y.inside);
    }
  });

  it("is the same for the same seed and different for another", () => {
    expect(tileNoise(16, 16, 4, 4, 9)).toEqual(tileNoise(16, 16, 4, 4, 9));
    expect(tileNoise(16, 16, 4, 4, 9)).not.toEqual(tileNoise(16, 16, 4, 4, 10));
  });

  it("draws cracks as thin lines, not areas", () => {
    const cracks = tileCracks(128, 128, 6, 6, 1, 3);
    let on = 0;
    for (const v of cracks) if (v > 0.5) on++;
    expect(on).toBeGreaterThan(100);
    expect(on / cracks.length).toBeLessThan(0.12);
  });
});

describe("heightToNormal", () => {
  it("maps a flat field to the straight-up normal", () => {
    const n = heightToNormal(new Float32Array(16).fill(0.3), 4, 4, 1, 1, true);
    for (let i = 0; i < 16; i++) {
      expect([n[i * 4], n[i * 4 + 1], n[i * 4 + 2], n[i * 4 + 3]]).toEqual([128, 128, 255, 255]);
    }
  });

  it("leans away from a rise, by the angle the slope factors give", () => {
    // Height climbs 0.1 per texel in +x. With slopeX = 10 that is a 45°
    // surface, whose normal leans 45° toward -x.
    const w = 8;
    const height = new Float32Array(w * 2);
    for (let y = 0; y < 2; y++) for (let x = 0; x < w; x++) height[y * w + x] = 0.1 * x;
    const n = heightToNormal(height, w, 2, 10, 10, true);
    const i = 3 * 4;
    const nx = n[i] / 127.5 - 1;
    const ny = n[i + 1] / 127.5 - 1;
    const nz = n[i + 2] / 127.5 - 1;
    expect(nx).toBeCloseTo(-Math.SQRT1_2, 1);
    expect(ny).toBeCloseTo(0, 1);
    expect(nz).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it("caps the slope so a cliff does not turn the normal sideways", () => {
    const height = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]);
    const n = heightToNormal(height, 4, 2, 100, 100, true, 2);
    for (let i = 0; i < 8; i++) expect(n[i * 4 + 2] / 127.5 - 1).toBeGreaterThan(0.44);
  });
});

describe("carve atlas", () => {
  const rows = Object.values(CARVE_ROWS).sort((a, b) => a.v0 - b.v0);

  it("gives every band its own row, in bounds, with a gutter between", () => {
    expect(rows[0].v0).toBeGreaterThan(0);
    expect(rows[rows.length - 1].v1).toBeLessThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].v0 - rows[i - 1].v1).toBeGreaterThanOrEqual(5 / CARVE_ATLAS_H);
    }
    for (const row of rows) {
      expect(row.v1).toBeGreaterThan(row.v0);
      expect(Number.isInteger(row.repeats)).toBe(true);
    }
  });

  const atlas = buildCarveAtlas();
  const S = CARVE_ATLAS_W;
  const H = CARVE_ATLAS_H;

  /** Where texel `i` of the atlas is, for a failure message. */
  const where = (i: number) => {
    const x = i % S;
    const y = Math.floor(i / S);
    const v = (y + 0.5) / H;
    let band = "";
    let gap = Infinity;
    for (const [name, row] of Object.entries(CARVE_ROWS)) {
      const d = Math.max(row.v0 - v, v - row.v1, 0);
      if (d < gap) {
        gap = d;
        band = name;
      }
    }
    return `texel (${x}, ${y}), ${gap === 0 ? "in" : "beside"} the ${band} row`;
  };

  it("holds unit normals that face out of the surface", () => {
    expect(atlas.length).toBe(S * H * 4);
    // Every texel is read, and each limit is asserted once, on the texel
    // nearest to it. An `expect` per texel would be 1.5 million calls. At
    // every seventh texel it was 225,000, which ran past the 5 s timeout
    // whenever the machine was busy.
    let steepest = 0;
    let shortest = 0;
    let longest = 0;
    let minZ = Infinity;
    let minLength = Infinity;
    let maxLength = 0;
    for (let i = 0; i < S * H; i++) {
      const x = atlas[i * 4] / 127.5 - 1;
      const y = atlas[i * 4 + 1] / 127.5 - 1;
      const z = atlas[i * 4 + 2] / 127.5 - 1;
      const length = Math.hypot(x, y, z);
      if (z < minZ) {
        minZ = z;
        steepest = i;
      }
      if (length < minLength) {
        minLength = length;
        shortest = i;
      }
      if (length > maxLength) {
        maxLength = length;
        longest = i;
      }
    }
    expect(minZ, where(steepest)).toBeGreaterThan(0.3);
    expect(minLength, where(shortest)).toBeGreaterThan(0.97);
    expect(maxLength, where(longest)).toBeLessThan(1.03);
  });

  it("carves relief into every band's row", () => {
    for (const row of rows) {
      const y = Math.round(((row.v0 + row.v1) / 2) * H);
      let min = 255;
      let max = 0;
      for (let x = 0; x < S; x++) {
        const v = atlas[(y * S + x) * 4];
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      expect(max - min).toBeGreaterThan(20);
    }
  });

  it("repeats along the rail without a seam", () => {
    const { seam, inside } = maxStepX(atlas, S, H, 4, 0);
    expect(seam).toBeLessThanOrEqual(inside);
  });
});

describe("surface maps", () => {
  it("tile in both directions", () => {
    const gilt = buildGiltMaps();
    const wood = buildWoodMaps(ASH);
    const lacquer = buildLacquerMaps();
    for (const map of [gilt.color, gilt.rough, gilt.normal, wood.normal, lacquer.normal]) {
      const x = maxStepX(map.data, map.width, map.height, 4, 1);
      const y = maxStepY(map.data, map.width, map.height, 4, 1);
      expect(x.seam).toBeLessThanOrEqual(x.inside);
      expect(y.seam).toBeLessThanOrEqual(y.inside);
    }
  });

  it("runs wood grain along u: smoother along the rail than across it", () => {
    const { color } = buildWoodMaps(ASH);
    let alongRail = 0;
    let across = 0;
    for (let y = 0; y < color.height - 1; y += 3) {
      for (let x = 0; x < color.width - 1; x += 3) {
        const i = (y * color.width + x) * 4;
        alongRail += Math.abs(color.data[i] - color.data[i + 4]);
        across += Math.abs(color.data[i] - color.data[i + color.width * 4]);
      }
    }
    expect(across).toBeGreaterThan(alongRail * 1.5);
  });
});
