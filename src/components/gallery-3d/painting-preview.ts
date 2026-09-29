import * as THREE from "three";
import { decodeThumbHash, thumbHashToGrid } from "@/lib/thumbhash-grid";

/** Tiny, locally decoded preview; owned and disposed by the painting. */
export function createPaintingPreview(value: string | null | undefined): THREE.DataTexture | null {
  const hash = decodeThumbHash(value);
  if (!hash) return null;
  // Normalized UVs stretch the whole image to the painting's actual aspect.
  const size = 16;
  const rgb = thumbHashToGrid(hash, size, size);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(rgba, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
