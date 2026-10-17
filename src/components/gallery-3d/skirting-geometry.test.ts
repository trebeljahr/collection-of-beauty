import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildCorniceGeometry,
  buildSkirtingGeometry,
  SKIRTING_HEIGHT,
  SKIRTING_SINK,
} from "./skirting-geometry";

describe("buildSkirtingGeometry", () => {
  it("runs along each clear span, from just under the floor up, on both faces of the wall", () => {
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
    // Sunk past the stairwell's floor, 5 mm under the others.
    expect(box.min.y).toBeCloseTo(-2.96 - SKIRTING_SINK, 6);
    expect(SKIRTING_SINK).toBeGreaterThan(0.005);
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

describe("buildCorniceGeometry", () => {
  it("hangs from the ceiling on the wall's own face", () => {
    const g = buildCorniceGeometry([{ xMin: -5, xMax: 5 }], 2.6) as THREE.BufferGeometry;
    g.computeBoundingBox();
    const box = g.boundingBox as THREE.Box3;
    expect(box.min.x).toBeCloseTo(-5, 6);
    expect(box.max.x).toBeCloseTo(5, 6);
    expect(box.min.y).toBeCloseTo(2.6 - SKIRTING_HEIGHT, 6);
    // Runs on into the plenum, so no slit shows under the ceiling.
    expect(box.max.y).toBeCloseTo(2.6 + SKIRTING_SINK, 6);
    // One-sided: the room behind may have its ceiling at another height.
    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeGreaterThan(0.01);
  });
});

/** Triangles of `g` whose normal points through the wall (local -z). */
function facingThroughWall(g: THREE.BufferGeometry): number[] {
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const at = (i: number) => (index ? index.getX(i) : i);
  const count = index ? index.count : pos.count;
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const through: number[] = [];
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, at(i));
    b.fromBufferAttribute(pos, at(i + 1));
    c.fromBufferAttribute(pos, at(i + 2));
    const n = b.sub(a).cross(c.sub(a)).normalize();
    if (n.z < -0.9) through.push(i / 3);
  }
  return through;
}

describe("one-sided boards", () => {
  // Where the room behind draws its own wall on the same line, a face
  // at the wall's plane shows in that room and fights its wall.
  it("have no face toward the wall", () => {
    const cornice = buildCorniceGeometry([{ xMin: -5, xMax: 5 }], 2.6) as THREE.BufferGeometry;
    const skirting = buildSkirtingGeometry(
      [{ xMin: -5, xMax: 5 }],
      0,
      true,
    ) as THREE.BufferGeometry;
    expect(facingThroughWall(cornice)).toEqual([]);
    expect(facingThroughWall(skirting)).toEqual([]);
  });

  it("keep both faces when the board straddles the wall", () => {
    const skirting = buildSkirtingGeometry([{ xMin: -5, xMax: 5 }], 0) as THREE.BufferGeometry;
    expect(facingThroughWall(skirting).length).toBeGreaterThan(0);
  });
});
