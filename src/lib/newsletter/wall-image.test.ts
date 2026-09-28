import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditionWall } from "./wall";
import { renderWallJpeg } from "./wall-image";
import { hangLayout, WALL_COLOURS, wallPalette } from "./wall-layout";

const RATIOS = [1.572, 0.512, 1.279, 0.665, 1.27];

function testWall(base: string): EditionWall {
  return {
    works: RATIOS.map((_, i) => ({
      id: `w${i}`,
      title: `Work ${i}`,
      artist: null,
      sourceUrl: `https://cdn.test/w${i}.webp`,
    })),
    layout: hangLayout(RATIOS, 0),
    palette: wallPalette(base),
    version: "test",
    alt: "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderWallJpeg", () => {
  it("renders at 2x and ends in the flat base colour, so the title cell joins without a seam", async () => {
    const picture = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#e0c080" },
    })
      .png()
      .toBuffer();
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(picture)));
    vi.stubGlobal("fetch", fetchMock);

    const base = WALL_COLOURS.oxblood.base;
    const wall = testWall(base);
    const jpeg = await renderWallJpeg(wall);

    const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(wall.layout.width * 2);
    expect(info.height).toBe(wall.layout.height * 2);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const expected = [1, 3, 5].map((i) => Number.parseInt(base.slice(i, i + 2), 16));
    const row = (info.height - 1) * info.width * info.channels;
    for (let x = 0; x < info.width; x += 37) {
      const px = row + x * info.channels;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(data[px + c] - expected[c])).toBeLessThanOrEqual(2);
      }
    }
  });

  it("fails loudly when a source image is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(renderWallJpeg(testWall(WALL_COLOURS.green.base))).rejects.toThrow(/404/);
  });
});
