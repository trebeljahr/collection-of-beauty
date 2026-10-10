import { describe, expect, it } from "vitest";
import {
  buildLightRig,
  clearSpans,
  type LightRigInput,
  wallContextFor,
} from "./painting-light-rig";

// A 1 × 0.8 m canvas hung at the canonical 1.65 m centre in a 4.2 m room.
function input(over: Partial<LightRigInput> = {}): LightRigInput {
  return {
    frameHalfW: 0.54,
    frameHalfH: 0.44,
    canvasH: 0.8,
    floorY: -1.65,
    ceilingY: 4.2 - 1.65,
    wallOffset: 0.02,
    roomSpan: [-6, 6],
    wallSpans: [[-6, 6]],
    roomDepth: 10,
    ...over,
  };
}

function illuminance(rig: ReturnType<typeof buildLightRig>, p: [number, number, number]) {
  let e = 0;
  for (const h of rig.heads) {
    const toL = [h.position[0] - p[0], h.position[1] - p[1], h.position[2] - p[2]];
    const d2 = toL[0] ** 2 + toL[1] ** 2 + toL[2] ** 2;
    const d = Math.sqrt(d2);
    const l = toL.map((c) => c / d);
    const cosA = -(l[0] * h.direction[0] + l[1] * h.direction[1] + l[2] * h.direction[2]);
    if (cosA < h.cosOuter) continue;
    e += (h.intensity * Math.max(0, l[2])) / d2;
  }
  return e;
}

describe("buildLightRig", () => {
  it("hangs the head below the ceiling and out from the wall", () => {
    const rig = buildLightRig(input());
    expect(rig.heads).toHaveLength(1);
    const [x, y, z] = rig.heads[0].position;
    expect(x).toBe(0);
    expect(y).toBeCloseTo(4.2 - 1.65 - 0.3, 6);
    expect(z).toBeGreaterThan(0.9);
    expect(z).toBeLessThan(2.1);
  });

  it("puts the whole frame inside the fully lit core", () => {
    const rig = buildLightRig(input());
    const h = rig.heads[0];
    for (const cx of [-0.54, 0.54]) {
      for (const cy of [-0.44, 0.44]) {
        const v = [cx - h.position[0], cy - h.position[1], -0.02 - h.position[2]];
        const l = Math.hypot(v[0], v[1], v[2]);
        const cosA = (v[0] * h.direction[0] + v[1] * h.direction[1] + v[2] * h.direction[2]) / l;
        expect(cosA).toBeGreaterThan(h.cosInner);
      }
    }
    expect(h.cosOuter).toBeLessThan(h.cosInner);
  });

  it("normalises every work to the same brightness at its aim point", () => {
    for (const [hw, hh, c] of [
      [0.3, 0.25, 0.4],
      [0.54, 0.44, 0.8],
      [0.8, 1.1, 2.1],
    ]) {
      const rig = buildLightRig(input({ frameHalfW: hw, frameHalfH: hh, canvasH: c }));
      expect(illuminance(rig, [0, -0.06 * c, -0.02])).toBeCloseTo(1, 6);
    }
  });

  it("gives a wide work two heads that together light its centre about evenly", () => {
    const rig = buildLightRig(input({ frameHalfW: 1.3, frameHalfH: 0.8, canvasH: 1.5 }));
    expect(rig.heads).toHaveLength(2);
    const centre = illuminance(rig, [0, -0.09, -0.02]);
    expect(centre).toBeGreaterThan(0.8);
    expect(centre).toBeLessThan(1.5);
  });

  it("bounds a wall pool that covers the frame and spills onto the floor", () => {
    const rig = buildLightRig(input());
    expect(rig.wall).toHaveLength(1);
    const w = rig.wall[0];
    expect(w.xMin).toBeLessThan(-0.54);
    expect(w.xMax).toBeGreaterThan(0.54);
    expect(w.yMax).toBeGreaterThan(0.44);
    expect(w.yMax).toBeLessThanOrEqual(4.2 - 1.65);
    expect(rig.floor).not.toBeNull();
    expect(w.yMin).toBe(-1.65);
    expect(rig.floor?.yMin).toBe(-0.02);
  });

  it("never builds wall pool inside a doorway or past a corner", () => {
    const rig = buildLightRig(
      input({
        roomSpan: [-0.9, 6],
        wallSpans: clearSpans([-0.9, 6], [[0.9, 2.3]]),
      }),
    );
    for (const r of rig.wall) {
      expect(r.xMin).toBeGreaterThanOrEqual(-0.9);
      expect(r.xMax <= 0.9 || r.xMin >= 2.3).toBe(true);
    }
    expect(rig.floor?.xMin).toBeGreaterThanOrEqual(-0.9);
  });
});

describe("clearSpans", () => {
  it("cuts openings out of a span", () => {
    expect(clearSpans([-5, 5], [[-1, 1]])).toEqual([
      [-5, -1],
      [1, 5],
    ]);
    expect(
      clearSpans(
        [-5, 5],
        [
          [-6, -4],
          [4, 7],
        ],
      ),
    ).toEqual([[-4, 4]]);
    expect(clearSpans([-5, 5], [[-6, 6]])).toEqual([]);
  });
});

describe("wallContextFor", () => {
  const bounds = { xMin: 50, xMax: 72.5, zMin: 72.5, zMax: 90 };
  const doors = [
    { side: "north", worldX: 61.25, worldZ: 72.5, width: 1.4 },
    { side: "west", worldX: 50, worldZ: 81.25, width: 1.4 },
  ];

  it("maps a north-wall work: span, depth, door cut and floor", () => {
    const ctx = wallContextFor(bounds, doors, 0, [57.36, 1.65, 72.52], 0);
    expect(ctx.roomSpan[0]).toBeCloseTo(50 - 57.36, 6);
    expect(ctx.roomSpan[1]).toBeCloseTo(72.5 - 57.36, 6);
    expect(ctx.roomDepth).toBeCloseTo(17.5, 6);
    expect(ctx.floorY).toBeCloseTo(-1.65, 6);
    expect(ctx.wallSpans).toHaveLength(2);
    expect(ctx.wallSpans[0][1]).toBeCloseTo(61.25 - 0.79 - 57.36, 6);
  });

  it("maps a south-wall work, whose right hand points at lower x", () => {
    const ctx = wallContextFor(bounds, doors, 0, [64.58, 1.65, 89.98], Math.PI);
    expect(ctx.roomSpan[0]).toBeCloseTo(64.58 - 72.5, 6);
    expect(ctx.roomSpan[1]).toBeCloseTo(64.58 - 50, 6);
    expect(ctx.wallSpans).toHaveLength(1);
  });

  it("maps a west-wall work and cuts the west door", () => {
    const ctx = wallContextFor(bounds, doors, 0, [50.02, 1.65, 86], Math.PI / 2);
    // Right hand points at -z on the west wall.
    expect(ctx.roomSpan[0]).toBeCloseTo(86 - 90, 6);
    expect(ctx.roomSpan[1]).toBeCloseTo(86 - 72.5, 6);
    expect(ctx.roomDepth).toBeCloseTo(22.5, 6);
    expect(ctx.wallSpans).toHaveLength(2);
    expect(ctx.wallSpans[0][1]).toBeCloseTo(86 - 81.25 - 0.79, 6);
  });
});
