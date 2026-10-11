import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BENCH_DEPTH, BENCH_HEIGHT, BENCH_LENGTH } from "@/lib/gallery-layout/fittings";
import { buildBenchesGeometry, buildBenchParts } from "./bench-geometry";

function box(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
}

describe("buildBenchParts", () => {
  const { seat, frame } = buildBenchParts();

  it("is the size the layout and the collider take it to be", () => {
    const s = box(seat);
    expect(s.max.x - s.min.x).toBeCloseTo(BENCH_LENGTH, 4);
    expect(s.max.z - s.min.z).toBeCloseTo(BENCH_DEPTH, 4);
    expect(s.max.y).toBeCloseTo(BENCH_HEIGHT, 4);
  });

  it("stands on the floor, its frame inside the seat's outline", () => {
    const s = box(seat);
    const f = box(frame);
    expect(f.min.y).toBeCloseTo(0, 4);
    expect(f.max.y).toBeCloseTo(s.min.y, 4);
    expect(f.min.x).toBeGreaterThan(s.min.x);
    expect(f.max.x).toBeLessThan(s.max.x);
    expect(f.min.z).toBeGreaterThan(s.min.z);
    expect(f.max.z).toBeLessThan(s.max.z);
  });

  it("carries a baked shade: lightest on top, darker underneath", () => {
    const normal = seat.getAttribute("normal");
    const color = seat.getAttribute("color");
    let top = 0;
    let under = 1;
    for (let i = 0; i < normal.count; i++) {
      if (normal.getY(i) > 0.99) top = Math.max(top, color.getX(i));
      if (normal.getY(i) < -0.99) under = Math.min(under, color.getX(i));
    }
    expect(top).toBeCloseTo(1, 4);
    expect(under).toBeCloseTo(0.5, 4);
  });
});

describe("buildBenchesGeometry", () => {
  it("returns nothing for a room without benches", () => {
    expect(buildBenchesGeometry([], 0)).toBeNull();
  });

  it("puts every bench where the layout says, turned to its axis", () => {
    const g = buildBenchesGeometry(
      [
        { x: 10, z: 20, along: "x" },
        { x: 30, z: 40, along: "z" },
      ],
      6.12,
    );
    const b = box((g as NonNullable<typeof g>).seat);
    expect(b.min.x).toBeCloseTo(10 - BENCH_LENGTH / 2, 4);
    expect(b.max.x).toBeCloseTo(30 + BENCH_DEPTH / 2, 4);
    expect(b.min.z).toBeCloseTo(20 - BENCH_DEPTH / 2, 4);
    expect(b.max.z).toBeCloseTo(40 + BENCH_LENGTH / 2, 4);
    expect(b.max.y).toBeCloseTo(6.12 + BENCH_HEIGHT, 4);
  });

  it("lays a shadow on the floor under each, wider than the bench", () => {
    const g = buildBenchesGeometry([{ x: 10, z: 20, along: "z" }], 6.12);
    const b = box((g as NonNullable<typeof g>).shadow);
    expect(b.min.y).toBeCloseTo(6.12, 4);
    expect(b.max.y).toBeCloseTo(6.12, 4);
    expect(b.max.z - b.min.z).toBeGreaterThan(BENCH_LENGTH);
    expect(b.max.x - b.min.x).toBeGreaterThan(BENCH_DEPTH);
    expect(b.max.x - b.min.x).toBeLessThan(b.max.z - b.min.z);
  });
});
