import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildSkirtingGeometry, SKIRTING_HEIGHT } from "./skirting-geometry";

describe("buildSkirtingGeometry", () => {
  it("runs along each clear span, from the floor up, on both faces of the wall", () => {
    const g = buildSkirtingGeometry(
      [
        { xMin: -5, xMax: -0.7 },
        { xMin: 0.7, xMax: 5 },
      ],
      -2.96,
    ) as THREE.BufferGeometry;
    g.computeBoundingBox();
    const box = g.boundingBox as THREE.Box3;
    expect(box.min.x).toBeCloseTo(-5, 6);
    expect(box.max.x).toBeCloseTo(5, 6);
    expect(box.min.y).toBeCloseTo(-2.96, 6);
    expect(box.max.y).toBeCloseTo(-2.96 + SKIRTING_HEIGHT, 6);
    // Straddles the wall plane, so the room behind gets a skirting too.
    expect(box.min.z).toBeCloseTo(-box.max.z, 6);
    expect(box.max.z).toBeGreaterThan(0.01);
  });

  it("leaves the doorway open", () => {
    const g = buildSkirtingGeometry(
      [
        { xMin: -5, xMax: -0.7 },
        { xMin: 0.7, xMax: 5 },
      ],
      0,
    ) as THREE.BufferGeometry;
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getX(i))).toBeGreaterThanOrEqual(0.7 - 1e-6);
    }
  });

  it("returns nothing for a wall with no clear span", () => {
    expect(buildSkirtingGeometry([], 0)).toBeNull();
    expect(buildSkirtingGeometry([{ xMin: 1, xMax: 1.005 }], 0)).toBeNull();
  });
});
