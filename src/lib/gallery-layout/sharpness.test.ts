import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { layoutBlock } from "./layout-block";
import {
  MIN_TEXTURE_PX_PER_METRE,
  sharpEnoughToHang,
  texturePxPerMetre,
  widestTexturePx,
} from "./sharpness";

function work(args: {
  width: number | null;
  height: number | null;
  widthCm: number;
  heightCm: number;
  variantWidths?: number[];
}) {
  return {
    width: args.width,
    height: args.height,
    realDimensions: { widthCm: args.widthCm, heightCm: args.heightCm, source: "test" },
    variantWidths: args.variantWidths ?? [256, 480, 640, 960, 1280, 1920, 2560, 4096],
  } as unknown as ArtworkListing;
}

describe("widestTexturePx", () => {
  it("is the source width when the source is smaller than the ladder", () => {
    expect(widestTexturePx(work({ width: 900, height: 600, widthCm: 300, heightCm: 200 }))).toBe(
      900,
    );
  });

  it("stops at the 4096 rung, or at 6144 where that rung exists", () => {
    const big = { width: 12000, height: 8000, widthCm: 300, heightCm: 200 };
    expect(widestTexturePx(work(big))).toBe(4096);
    expect(
      widestTexturePx(
        work({ ...big, variantWidths: [256, 480, 640, 960, 1280, 1920, 2560, 4096, 6144, 12000] }),
      ),
    ).toBe(6144);
  });

  it("is unknown without pixel dimensions", () => {
    expect(
      widestTexturePx(work({ width: null, height: null, widthCm: 100, heightCm: 80 })),
    ).toBeNull();
  });
});

describe("sharpEnoughToHang", () => {
  it("turns away a large canvas from a small scan", () => {
    // 3 m wide from 900 px: 300 px a metre.
    const blurred = work({ width: 900, height: 600, widthCm: 300, heightCm: 200 });
    expect(texturePxPerMetre(blurred)).toBeCloseTo(300, 6);
    expect(sharpEnoughToHang(blurred)).toBe(false);
  });

  it("hangs the same scan when the work is small", () => {
    expect(sharpEnoughToHang(work({ width: 900, height: 600, widthCm: 60, heightCm: 40 }))).toBe(
      true,
    );
  });

  it("measures the width the work hangs at, not its real width", () => {
    // 9 m wide in reality, hung at the 3.2 m cap: 4096 / 3.2 = 1280.
    const giant = work({ width: 4096, height: 2731, widthCm: 900, heightCm: 600 });
    expect(texturePxPerMetre(giant)).toBeCloseTo(1280, 6);
    expect(sharpEnoughToHang(giant)).toBe(true);
  });

  it("lets the largest canvas on the top rung through", () => {
    // The threshold must stay under 4096 / 3.2, or no full-width canvas
    // without a 6144 rung could ever hang.
    expect(MIN_TEXTURE_PX_PER_METRE).toBeLessThan(4096 / 3.2);
  });

  it("does not judge a work of unknown pixel size", () => {
    expect(
      sharpEnoughToHang(work({ width: null, height: null, widthCm: 300, heightCm: 200 })),
    ).toBe(true);
  });
});

describe("the museum's walls", () => {
  const make = (id: string, width: number) =>
    ({
      id,
      objectKey: `folder/${id}.jpg`,
      movement: "Baroque",
      year: 1650,
      artistSlug: id,
      width,
      height: Math.round(width * 0.75),
      realDimensions: { widthCm: 240, heightCm: 180 },
    }) as unknown as ArtworkListing;

  it("hang the sharp work and leave the blurred one off", () => {
    const layout = layoutBlock([make("sharp", 3000), make("blurred", 1000)]);
    const hung = layout.allRooms.flatMap((r) => r.placements.map((p) => p.artwork.id));
    expect(hung).toEqual(["sharp"]);
  });
});
