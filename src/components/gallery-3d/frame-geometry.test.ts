import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CANVAS_FACE_Z,
  FRAME_PROFILES,
  FRAME_VARIANT_IDS,
  frameScale,
  profileWidth,
  scaleProfile,
} from "@/lib/gallery-layout/frame-profiles";
import { buildFrameGeometry, carvePeriods } from "./frame-geometry";
import { CARVE_ROWS } from "./frame-maps";

const WALL_OFFSET = 0.02;

describe("frame profiles", () => {
  it.each(FRAME_VARIANT_IDS)("%s clears the canvas and ends on the wall", (id) => {
    const profile = FRAME_PROFILES[id];
    if (profile[0].o < 0) {
      // A lip must sit in front of the canvas face or it z-fights it.
      expect(profile[0].z).toBeGreaterThan(CANVAS_FACE_Z + 0.002);
    } else {
      // No lip (a floater): the profile starts at the canvas edge, just
      // behind its face.
      expect(profile[0].o).toBe(0);
      expect(profile[0].z).toBeLessThan(CANVAS_FACE_Z);
    }
    // The frame ends on (just off) the wall, at its widest.
    const last = profile[profile.length - 1];
    expect(last.z).toBeLessThan(0.01);
    expect(last.o).toBeCloseTo(profileWidth(profile), 9);
  });

  it("keeps the lip in front of the canvas when scaled down", () => {
    for (const id of FRAME_VARIANT_IDS) {
      const profile = FRAME_PROFILES[id];
      if (profile[0].o >= 0) continue;
      const small = scaleProfile(profile, frameScale(id, 0.3, 0.2));
      expect(small[0].z).toBeGreaterThan(CANVAS_FACE_Z);
    }
  });
});

describe("carvePeriods", () => {
  const half = 0.5;
  const period = 0.047;

  it("starts the ornament at the inner corner and ends on a whole period at the centre", () => {
    expect(carvePeriods(half, half, period)).toBeCloseTo(0, 12);
    expect(carvePeriods(-half, half, period)).toBeCloseTo(0, 12);
    const centre = carvePeriods(0, half, period);
    expect(centre).toBe(Math.round(half / period));
  });

  it("stretches the ornament by less than half a period per half rail", () => {
    const n = carvePeriods(0, half, period);
    expect(Math.abs(n * period - half)).toBeLessThanOrEqual(period / 2);
  });

  it("is mirrored about the rail's centre", () => {
    for (const a of [0.07, 0.31, 0.5, 0.56]) {
      expect(carvePeriods(a, half, period)).toBeCloseTo(carvePeriods(-a, half, period), 12);
    }
  });

  it("runs at the ornament's own pitch in the mitre, whatever the rail's length", () => {
    // 3 cm past the inner corner: the same count on a long and a short
    // rail, which is what lets the carving meet across the joint.
    expect(carvePeriods(half + 0.03, half, period)).toBeCloseTo(-0.03 / period, 12);
    expect(carvePeriods(0.2 + 0.03, 0.2, period)).toBeCloseTo(-0.03 / period, 12);
  });

  it("holds at least one period on a rail shorter than the ornament", () => {
    expect(carvePeriods(0, 0.01, period)).toBe(1);
  });
});

describe("buildFrameGeometry", () => {
  const profile = FRAME_PROFILES.gilded;
  const geom = buildFrameGeometry(profile, 1, 0.6, WALL_OFFSET);

  it("wraps the canvas symmetrically and reaches the profile's width", () => {
    geom.computeBoundingBox();
    const box = geom.boundingBox as THREE.Box3;
    const w = profileWidth(profile);
    expect(box.max.x).toBeCloseTo(0.5 + w, 6);
    expect(box.min.x).toBeCloseTo(-0.5 - w, 6);
    expect(box.max.y).toBeCloseTo(0.3 + w, 6);
    expect(box.min.y).toBeCloseTo(-0.3 - w, 6);
    expect(box.min.z).toBeCloseTo(0.004 - WALL_OFFSET, 6);
  });

  it("puts a slip, mat or canvas edge in its own material group", () => {
    expect(geom.groups.map((g) => g.materialIndex)).toEqual([0]);
    for (const id of ["walnut", "print", "redLacquer", "mount", "floater"] as const) {
      const g = buildFrameGeometry(FRAME_PROFILES[id], 1, 0.6, WALL_OFFSET);
      expect(g.groups.map((group) => group.materialIndex)).toEqual([0, 1]);
      expect(g.groups.reduce((n, group) => n + group.count, 0)).toBe(g.index?.count);
    }
  });

  it.each(FRAME_VARIANT_IDS)("winds every face of %s toward its normal", (id) => {
    const g = buildFrameGeometry(FRAME_PROFILES[id], 0.8, 1.1, WALL_OFFSET);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const idx = g.index as THREE.BufferAttribute;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    let faces = 0;
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1));
      c.fromBufferAttribute(pos, idx.getX(t + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-16) continue;
      n.fromBufferAttribute(nrm, idx.getX(t));
      expect(face.normalize().dot(n)).toBeGreaterThan(0.2);
      faces++;
    }
    expect(faces).toBeGreaterThan(40);
  });

  it("points carved stretches at their atlas row and leaves the rest ungated", () => {
    const carve = geom.getAttribute("aCarveUv");
    const frame = geom.getAttribute("aFrame");
    const rows = [CARVE_ROWS.pearl, CARVE_ROWS.leaf, CARVE_ROWS.laurel];
    let carved = 0;
    for (let i = 0; i < carve.count; i++) {
      const gate = frame.getY(i);
      if (gate === 0) continue;
      carved++;
      expect(Math.abs(gate)).toBe(1);
      const v = carve.getY(i);
      expect(rows.some((r) => v >= r.v0 - 1e-6 && v <= r.v1 + 1e-6)).toBe(true);
    }
    expect(carved).toBeGreaterThan(0);
    expect(carved).toBeLessThan(carve.count);
  });

  it("carves the two rails of a corner as mirror images across the mitre", () => {
    // Reflecting a point of the top rail in the top-right mitre lands on
    // the right rail. Wherever the first is carved, the second must read
    // the same texel of the atlas.
    const pos = geom.getAttribute("position");
    const carve = geom.getAttribute("aCarveUv");
    const frame = geom.getAttribute("aFrame");
    const carved: number[] = [];
    for (let i = 0; i < pos.count; i++) if (frame.getY(i) !== 0) carved.push(i);
    let checked = 0;
    for (const i of carved) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // In the top-right mitre: past the inner corner on both axes.
      if (!(x > 0.5 + 1e-6 && y > 0.3 + 1e-6)) continue;
      // Mirror in the line through (0.5, 0.3) at 45°.
      const mx = 0.5 + (y - 0.3);
      const my = 0.3 + (x - 0.5);
      const twins = carved.filter(
        (j) =>
          Math.abs(pos.getX(j) - mx) < 1e-6 &&
          Math.abs(pos.getY(j) - my) < 1e-6 &&
          Math.abs(pos.getZ(j) - pos.getZ(i)) < 1e-6 &&
          Math.abs(carve.getY(j) - carve.getY(i)) < 1e-6,
      );
      // Both rails have a vertex there, and every one reads the same u.
      expect(twins.length).toBeGreaterThanOrEqual(2);
      for (const j of twins) expect(carve.getX(j)).toBeCloseTo(carve.getX(i), 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});
