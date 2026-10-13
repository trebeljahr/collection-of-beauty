import * as THREE from "three";
import type { WorldOpening } from "@/lib/gallery-layout/types";

/**
 * The hole a grand stair leaves in a stair hall's floor or ceiling, as
 * a path for a `THREE.Shape` drawn about the hall's centre. A shape is
 * drawn in XY and laid flat afterwards: turned down onto the floor its
 * +y is the world's -z (`zSign` -1), turned up under the ceiling it is
 * the world's +z (`zSign` 1).
 */
export function openingHole(
  opening: WorldOpening,
  centerX: number,
  centerZ: number,
  zSign: 1 | -1,
): THREE.Path {
  const hole = new THREE.Path();
  if (opening.kind === "disc") {
    hole.absarc(
      opening.x - centerX,
      zSign * (opening.z - centerZ),
      opening.r,
      0,
      Math.PI * 2,
      false,
    );
    return hole;
  }
  opening.outline.forEach(([x, z], k) => {
    const px = x - centerX;
    const py = zSign * (z - centerZ);
    if (k === 0) hole.moveTo(px, py);
    else hole.lineTo(px, py);
  });
  hole.closePath();
  return hole;
}

/**
 * The floor round an opening of rectangles, as rectangles about the
 * hall's centre: the hall's square cut on every edge of the opening,
 * less the pieces inside it. Unlike a hole in a shape, this holds for an
 * opening that reaches the hall's walls.
 */
export function rectsAround(
  rects: ReadonlyArray<{ xMin: number; xMax: number; zMin: number; zMax: number }>,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): Array<{ xMin: number; xMax: number; zMin: number; zMax: number }> {
  const clamp = (v: number, half: number) => Math.min(half, Math.max(-half, v));
  const local = rects.map((r) => ({
    xMin: clamp(r.xMin - centerX, width / 2),
    xMax: clamp(r.xMax - centerX, width / 2),
    zMin: clamp(r.zMin - centerZ, depth / 2),
    zMax: clamp(r.zMax - centerZ, depth / 2),
  }));
  const cuts = (half: number, lo: "xMin" | "zMin", hi: "xMax" | "zMax") =>
    [
      ...new Set([-half, half, ...local.flatMap((r) => [r[lo], r[hi]])].map((v) => +v.toFixed(4))),
    ].sort((a, b) => a - b);
  const xs = cuts(width / 2, "xMin", "xMax");
  const zs = cuts(depth / 2, "zMin", "zMax");
  const out: Array<{ xMin: number; xMax: number; zMin: number; zMax: number }> = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      const z = (zs[j] + zs[j + 1]) / 2;
      if (local.some((r) => x > r.xMin && x < r.xMax && z > r.zMin && z < r.zMax)) continue;
      out.push({ xMin: xs[i], xMax: xs[i + 1], zMin: zs[j], zMax: zs[j + 1] });
    }
  }
  return out;
}
