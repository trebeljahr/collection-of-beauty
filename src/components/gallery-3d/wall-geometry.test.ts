import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildDoorTrimGeometry, buildWallFaceGeometry, type WallOpening } from "./wall-geometry";

function area(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).sub(a);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).sub(a);
    total += b.cross(c).length() / 2;
  }
  return total;
}

/** Probe the surface from both sides, including the space just outside it. */
function coverageErrors(
  geometry: THREE.BufferGeometry,
  rect: { x0: number; x1: number; y0: number; y1: number },
  solid: (x: number, y: number) => boolean,
): string[] {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const errors: string[] = [];
  for (const side of [-1, 1]) {
    for (let xi = 0; xi < 31; xi++) {
      const x = rect.x0 + ((xi + 0.371) / 31) * (rect.x1 - rect.x0);
      for (let yi = 0; yi < 23; yi++) {
        const y = rect.y0 + ((yi + 0.619) / 23) * (rect.y1 - rect.y0);
        ray.set(new THREE.Vector3(x, y, side * 2), new THREE.Vector3(0, 0, -side));
        if (ray.intersectObject(mesh, false).length > 0 !== solid(x, y)) {
          errors.push(`${x},${y},${side}`);
        }
      }
    }
  }
  material.dispose();
  return errors;
}

describe("buildWallFaceGeometry", () => {
  const cases: Array<{ name: string; width: number; height: number; doors: WallOpening[] }> = [
    { name: "a solid wall", width: 12.5, height: 6.6, doors: [] },
    {
      name: "one centred opening",
      width: 12.5,
      height: 6.6,
      doors: [{ centerLocalX: 0, width: 3.5, height: 3.6 }],
    },
    {
      name: "unsorted openings of different heights",
      width: 17.5,
      height: 8.6,
      doors: [
        { centerLocalX: 4.25, width: 1.4, height: 2.3 },
        { centerLocalX: -3.5, width: 3.5, height: 3.6 },
      ],
    },
    {
      name: "an opening that meets the wall's top and edge",
      width: 10,
      height: 5.6,
      doors: [{ centerLocalX: 3.25, width: 3.5, height: 5.6 }],
    },
  ];

  it.each(cases)("preserves the exact wall area and openings for $name", ({
    width,
    height,
    doors,
  }) => {
    const geometry = buildWallFaceGeometry(width, height, doors)!;
    const cutArea = doors.reduce((sum, door) => sum + door.width * door.height, 0);
    expect(area(geometry)).toBeCloseTo(width * height - cutArea, 4);
    expect(
      coverageErrors(
        geometry,
        { x0: -width / 2 - 0.3, x1: width / 2 + 0.3, y0: -height / 2 - 0.3, y1: height / 2 + 0.3 },
        (x, y) =>
          Math.abs(x) <= width / 2 &&
          Math.abs(y) <= height / 2 &&
          !doors.some(
            (door) =>
              Math.abs(x - door.centerLocalX) < door.width / 2 && y + height / 2 < door.height,
          ),
      ),
    ).toEqual([]);
    geometry.dispose();
  });

  it("keeps front-facing normals, winding and one metre UV grid across every opening", () => {
    const width = 17.5;
    const height = 8.6;
    const geometry = buildWallFaceGeometry(width, height, cases[2].doors)!;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex()!;
    let maxGridError = 0;
    const invalidNormals: number[] = [];
    const reversed: number[] = [];
    for (let i = 0; i < position.count; i++) {
      maxGridError = Math.max(
        maxGridError,
        Math.abs(uv.getX(i) - (position.getX(i) + width / 2)),
        Math.abs(uv.getY(i) - (position.getY(i) + height / 2)),
      );
      if (
        normal.getX(i) !== 0 ||
        normal.getY(i) !== 0 ||
        normal.getZ(i) !== 1 ||
        position.getZ(i) !== 0
      ) {
        invalidNormals.push(i);
      }
    }
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const cross =
        (position.getX(b) - position.getX(a)) * (position.getY(c) - position.getY(a)) -
        (position.getY(b) - position.getY(a)) * (position.getX(c) - position.getX(a));
      if (!(cross > 0)) reversed.push(i / 3);
    }
    expect(maxGridError).toBeLessThan(2e-6);
    expect(invalidNormals).toEqual([]);
    expect(reversed).toEqual([]);
    geometry.dispose();
  });

  it("returns no geometry when the opening fills the wall", () => {
    expect(buildWallFaceGeometry(10, 6, [{ centerLocalX: 0, width: 10, height: 6 }])).toBeNull();
  });
});

describe("buildDoorTrimGeometry", () => {
  it.each([
    { width: 1.4, height: 2.3, trim: 0.08, depth: 0.08 },
    { width: 3.5, height: 3.6, trim: 0.16, depth: 0.32 },
  ])("keeps the casing's opening, depth and full box surfaces at depth $depth", ({
    width,
    height,
    trim,
    depth,
  }) => {
    const geometry = buildDoorTrimGeometry(width, height, trim, depth);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.min.x).toBeCloseTo(-width / 2 - trim, 6);
    expect(bounds.max.x).toBeCloseTo(width / 2 + trim, 6);
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.max.y).toBeCloseTo(height + trim, 6);
    expect(bounds.min.z).toBeCloseTo(-depth / 2, 6);
    expect(bounds.max.z).toBeCloseTo(depth / 2, 6);
    const boxArea = (w: number, h: number, d: number) => 2 * (w * h + w * d + h * d);
    expect(area(geometry)).toBeCloseTo(
      2 * boxArea(trim, height, depth) + boxArea(width + 2 * trim, trim, depth),
      5,
    );
    expect(
      coverageErrors(
        geometry,
        {
          x0: -width / 2 - trim - 0.1,
          x1: width / 2 + trim + 0.1,
          y0: -0.1,
          y1: height + trim + 0.1,
        },
        (x, y) =>
          Math.abs(x) <= width / 2 + trim &&
          y >= 0 &&
          y <= height + trim &&
          (Math.abs(x) >= width / 2 || y >= height),
      ),
    ).toEqual([]);
    geometry.dispose();
  });

  it("preserves each box face's UV orientation and outward normal", () => {
    const width = 3.5;
    const height = 3.6;
    const trim = 0.16;
    const depth = 0.32;
    const geometry = buildDoorTrimGeometry(width, height, trim, depth);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex()!;
    const invalid: number[] = [];
    let maxUvError = 0;
    // Identify the source box from the triangle's centre, not the batching order.
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const cx = ids.reduce((sum, id) => sum + position.getX(id), 0) / 3;
      const cy = ids.reduce((sum, id) => sum + position.getY(id), 0) / 3;
      const header = cy > height + 1e-6 || Math.abs(cx) < width / 2;
      const w = header ? width + 2 * trim : trim;
      const h = header ? trim : height;
      const ox = header ? 0 : (Math.sign(cx) * (width + trim)) / 2;
      const oy = header ? height + trim / 2 : height / 2;
      for (const id of ids) {
        const x = position.getX(id) - ox;
        const y = position.getY(id) - oy;
        const z = position.getZ(id);
        const nx = normal.getX(id);
        const ny = normal.getY(id);
        const nz = normal.getZ(id);
        let u: number;
        let v: number;
        if (Math.abs(nx) === 1) {
          u = 0.5 - (nx * z) / depth;
          v = 0.5 + y / h;
          if (Math.abs(x - (nx * w) / 2) > 1e-6) invalid.push(id);
        } else if (Math.abs(ny) === 1) {
          u = 0.5 + x / w;
          v = 0.5 - (ny * z) / depth;
          if (Math.abs(y - (ny * h) / 2) > 1e-6) invalid.push(id);
        } else {
          u = 0.5 + (nz * x) / w;
          v = 0.5 + y / h;
          if (Math.abs(nz) !== 1 || Math.abs(z - (nz * depth) / 2) > 1e-6) invalid.push(id);
        }
        maxUvError = Math.max(maxUvError, Math.abs(uv.getX(id) - u), Math.abs(uv.getY(id) - v));
      }
    }
    expect(invalid).toEqual([]);
    expect(maxUvError).toBeLessThan(2e-6);
    geometry.dispose();
  });
});
