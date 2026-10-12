import { describe, expect, it } from "vitest";
import {
  CANVAS_FACE_Z,
  type ProfilePoint,
  profileFrontZ,
  scaleProfile,
  shadeProfile,
} from "./frame-profiles";

describe("shadeProfile", () => {
  // A bead on a flat, then a hollow, then a raised outer edge.
  const raw: ProfilePoint[] = [
    { o: -0.005, z: 0.037, crease: true },
    { o: -0.005, z: 0.045, crease: true },
    { o: 0.0, z: 0.045 },
    { o: 0.004, z: 0.049 },
    { o: 0.008, z: 0.045 },
    { o: 0.02, z: 0.044 },
    { o: 0.03, z: 0.05 },
    { o: 0.04, z: 0.07 },
    { o: 0.05, z: 0.072 },
    { o: 0.055, z: 0.068, crease: true },
    { o: 0.055, z: 0.004 },
  ];
  const shaded = shadeProfile(raw);
  const at = (o: number, z: number) =>
    shaded.find((p) => p.o === o && p.z === z) as (typeof shaded)[number];

  it("darkens the hollow and leaves the crown open", () => {
    const hollow = at(0.02, 0.044);
    const crown = at(0.05, 0.072);
    expect(hollow.ao).toBeLessThan(crown.ao - 0.1);
    expect(crown.ao).toBeGreaterThan(0.9);
    for (const p of shaded) {
      expect(p.ao).toBeGreaterThanOrEqual(0.4);
      expect(p.ao).toBeLessThanOrEqual(1);
    }
  });

  it("wears and burnishes the high points, not the hollow", () => {
    const hollow = at(0.02, 0.044);
    const crown = at(0.05, 0.072);
    expect(crown.wear).toBeGreaterThan(0.3);
    expect(hollow.wear).toBe(0);
    expect(crown.rough).toBeLessThan(hollow.rough);
  });

  it("leaves the back edge alone: nothing rubs it", () => {
    expect(at(0.055, 0.004).wear).toBeLessThan(0.1);
  });

  it("keeps a value set on the point", () => {
    const [first] = shadeProfile([{ ...raw[0], ao: 0.77, wear: 0.5, rough: 2 }, ...raw.slice(1)]);
    expect(first).toMatchObject({ ao: 0.77, wear: 0.5, rough: 2 });
  });
});

describe("scaleProfile", () => {
  it("scales the reach and only the depth in front of the canvas", () => {
    const profile: ProfilePoint[] = [
      { o: -0.005, z: 0.037 },
      { o: 0.05, z: 0.07 },
      { o: 0.06, z: 0.004 },
    ];
    const half = scaleProfile(profile, 0.5);
    expect(half.map((pt) => pt.o)).toEqual([-0.0025, 0.025, 0.03]);
    // The lip stays in front of the canvas face, the foot on the wall.
    expect(half[0].z).toBeGreaterThan(CANVAS_FACE_Z);
    expect(half[2].z).toBe(0.004);
    expect(profileFrontZ(half)).toBeCloseTo(CANVAS_FACE_Z + (0.07 - CANVAS_FACE_Z) / 2, 12);
  });
});
