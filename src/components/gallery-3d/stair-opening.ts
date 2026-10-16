import * as THREE from "three";
import {
  SPIRAL_EDGE_SEGMENTS,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";

/**
 * The hole round a spiral, drawn about the well's centre. Its vertices
 * stand where the treads' outer edge has its own, a multiple of 2.5°
 * from +x, as every spiral's entry angle is a quarter turn. So the hole
 * and the treads share one polygon, and the floor meets them edge to
 * edge. `absarc` puts its own vertices elsewhere: the floor's chords
 * would then cross the treads at floor level by a few millimetres, or
 * leave a gap.
 */
export function spiralHole(): THREE.Path {
  const hole = new THREE.Path();
  for (let k = 0; k < SPIRAL_EDGE_SEGMENTS; k++) {
    const a = (k / SPIRAL_EDGE_SEGMENTS) * Math.PI * 2;
    const x = SPIRAL_FLOOR_CUTOUT_RADIUS * Math.cos(a);
    const y = SPIRAL_FLOOR_CUTOUT_RADIUS * Math.sin(a);
    if (k === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
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
