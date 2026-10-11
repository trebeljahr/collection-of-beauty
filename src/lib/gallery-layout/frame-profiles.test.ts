import { describe, expect, it } from "vitest";
import { movements } from "@/lib/data";
import {
  FRAME_PROFILES,
  FRAME_VARIANT_IDS,
  frameReach,
  frameScale,
  hasFrameRule,
  MAX_FRAME_REACH,
  type ProfilePoint,
  pickFrameVariant,
  profileWidth,
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

describe("frame reach", () => {
  it("grows with the work and stays within the widest frame", () => {
    for (const id of FRAME_VARIANT_IDS) {
      const small = frameReach(id, 0.3, 0.4);
      const large = frameReach(id, 3.2, 2);
      expect(large).toBeGreaterThanOrEqual(small);
      expect(large).toBeLessThanOrEqual(MAX_FRAME_REACH + 1e-12);
      expect(small).toBeGreaterThan(0.015);
      expect(frameReach(id, 1, 1)).toBeCloseTo(
        profileWidth(FRAME_PROFILES[id]) * frameScale(id, 1, 1),
        12,
      );
    }
    // Wide enough to budget for, narrow enough to hang a wall of them.
    expect(MAX_FRAME_REACH).toBeGreaterThan(0.12);
    expect(MAX_FRAME_REACH).toBeLessThan(0.2);
  });

  it("cuts a floater at one size", () => {
    expect(frameReach("floater", 0.4, 0.4)).toBe(frameReach("floater", 3, 3));
  });
});

describe("pickFrameVariant", () => {
  const work = (id: string, movement: string | null, year: number | null) => ({
    id,
    movement,
    year,
  });

  it("is stable per work", () => {
    const w = work("collection-of-beauty-some-baroque-canvas", "Baroque", 1640);
    expect(pickFrameVariant(w)).toBe(pickFrameVariant({ ...w }));
  });

  it("mats prints and mounts silk whatever their date", () => {
    expect(pickFrameVariant(work("a", "Ukiyo-e", 1830))).toBe("redLacquer");
    expect(pickFrameVariant(work("b", "Natural history illustration", 1838))).toBe("print");
    expect(pickFrameVariant(work("c", "Botanical illustration", 1805))).toBe("print");
    // Sesshū: fifteenth century, but ink on paper, not a panel.
    expect(pickFrameVariant(work("d", "Classical East Asian", 1486))).toBe("mount");
  });

  it("puts works before 1500 in panel frames whatever their school", () => {
    for (let i = 0; i < 40; i++) {
      for (const movement of ["Renaissance", "Northern Renaissance", null]) {
        expect(["cassetta", "walnut"]).toContain(pickFrameVariant(work(`w${i}`, movement, 1470)));
      }
    }
  });

  it("matches the narrower school first", () => {
    const seen = (movement: string) =>
      new Set(
        Array.from({ length: 60 }, (_, i) => pickFrameVariant(work(`w${i}`, movement, 1880))),
      );
    // Never the gilt a plain "Impressionism" match could give.
    expect(seen("Post-Impressionism").has("giltCove")).toBe(false);
    expect([...seen("Neo-Impressionism")]).toEqual(["paleAsh"]);
    expect(seen("Dutch Golden Age").has("gilded")).toBe(false);
  });

  it("has a rule for every movement in the catalogue", () => {
    // A tagged work without a rule would hang in a frame chosen by its
    // year alone.
    for (const movement of movements) {
      expect(hasFrameRule(movement), `no frame rule for "${movement}"`).toBe(true);
    }
  });

  it("frames a modern floor in floaters and an old one in gilt", () => {
    const count = (movement: string, year: number, id: string) =>
      Array.from({ length: 90 }, (_, i) => pickFrameVariant(work(`w${i}`, movement, year))).filter(
        (v) => v === id,
      ).length;
    expect(count("Cubism", 1912, "floater")).toBeGreaterThan(40);
    expect(count("Baroque", 1650, "gilded")).toBeGreaterThan(50);
  });
});
