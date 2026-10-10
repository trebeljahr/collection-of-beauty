import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildFrameGeometry,
  CANVAS_FACE_Z,
  FRAME_PROFILES,
  frameScale,
  profileWidth,
  scaleProfile,
} from "./frame-geometry";

const WALL_OFFSET = 0.02;

describe("frame profiles", () => {
  it.each(
    Object.entries(FRAME_PROFILES),
  )("%s stays clear of the plaque and the canvas", (_, profile) => {
    // The plaque's left edge is PLAQUE_GAP (0.06 m) right of the canvas.
    expect(profileWidth(profile)).toBeLessThanOrEqual(0.05);
    // The lip must sit in front of the canvas face or it z-fights it.
    expect(profile[0].z).toBeGreaterThan(CANVAS_FACE_Z + 0.002);
    // And the frame ends on (just off) the wall.
    expect(profile[profile.length - 1].z).toBeLessThan(0.01);
  });

  it("keeps the lip in front of the canvas when scaled down", () => {
    for (const profile of Object.values(FRAME_PROFILES)) {
      const small = scaleProfile(profile, frameScale(0.3, 0.2));
      expect(small[0].z).toBeGreaterThan(CANVAS_FACE_Z);
      expect(profileWidth(small)).toBeLessThan(profileWidth(profile));
    }
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

  it("splits the slip into its own material group", () => {
    expect(geom.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
    const total = geom.groups.reduce((n, g) => n + g.count, 0);
    expect(total).toBe(geom.index?.count);
  });

  it("winds every face toward its normal", () => {
    const pos = geom.getAttribute("position");
    const nrm = geom.getAttribute("normal");
    const idx = geom.index as THREE.BufferAttribute;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1));
      c.fromBufferAttribute(pos, idx.getX(t + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-14) continue;
      n.fromBufferAttribute(nrm, idx.getX(t));
      expect(face.normalize().dot(n)).toBeGreaterThan(0.2);
    }
  });
});
