import * as THREE from "three";
import { rgbaToThumbHash } from "thumbhash";
import { describe, expect, it } from "vitest";
import { createPaintingPreview } from "./painting-preview";

describe("instant painting previews", () => {
  it("keeps the picture's top and bottom colors in a tiny filtered texture", () => {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        pixels.set(y < 8 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * 16 + x) * 4);
      }
    }
    const hash = Buffer.from(rgbaToThumbHash(16, 16, pixels)).toString("base64");
    const texture = createPaintingPreview(hash);
    expect(texture).not.toBeNull();
    if (!texture) throw new Error("Missing preview");
    const { data, width, height } = texture.image;
    if (!data) throw new Error("Missing preview pixels");
    expect([width, height]).toEqual([16, 16]);
    expect(data[0]).toBeGreaterThan(data[2]);
    const bottom = 15 * 16 * 4;
    expect(data[bottom + 2]).toBeGreaterThan(data[bottom]);
    expect(texture.flipY).toBe(true);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
    texture.dispose();
  });

  it.each([
    null,
    undefined,
    "",
    "invalid",
    "AAAA",
  ])("handles absent or malformed hash %s", (hash) => {
    expect(createPaintingPreview(hash)).toBeNull();
  });
});
