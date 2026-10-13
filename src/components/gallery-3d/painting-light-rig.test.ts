import { describe, expect, it } from "vitest";
import {
  buildLightRig,
  clearSpans,
  doorThreshold,
  type LightRigInput,
  POOL_THRESHOLDS,
  THRESHOLD_FADE_M,
  type Threshold,
  thresholdsNear,
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

  it("fades its floor pool toward the door beside the work, not one across the room", () => {
    const beside: Threshold = [0.9, -0.02, 2.3, -0.02];
    const across: Threshold = [-0.7, 9.98, 0.7, 9.98];
    const rig = buildLightRig(input({ thresholds: [across, beside] }));
    expect(rig.floor).not.toBeNull();
    expect(rig.thresholds).toEqual([beside]);
  });

  it("lists no threshold for a pool that stays on the wall", () => {
    // A floor 40 m down: every rim ray meets the wall first.
    const rig = buildLightRig(input({ floorY: -40, thresholds: [[0.9, -0.02, 2.3, -0.02]] }));
    expect(rig.floor).toBeNull();
    expect(rig.thresholds).toEqual([]);
  });
});

describe("thresholdsNear", () => {
  const floor = { xMin: -2, xMax: 2, yMin: 0, yMax: 3 };

  it("keeps the doorways a pool can reach, nearest first", () => {
    const touching: Threshold = [1, 0, 3, 0];
    const close: Threshold = [3, 0, 5, 0];
    const roundTheCorner: Threshold = [2.5, 1, 2.5, 3];
    const far: Threshold = [2 + THRESHOLD_FADE_M, 0, 6, 0];
    expect(thresholdsNear(floor, [far, close, roundTheCorner, touching])).toEqual([
      touching,
      roundTheCorner,
      close,
    ]);
  });

  it("measures to a doorway past a corner along the diagonal", () => {
    const d = THRESHOLD_FADE_M / Math.SQRT2;
    const inside: Threshold = [2 + d - 0.01, 3 + d - 0.01, 9, 3 + d - 0.01];
    const outside: Threshold = [2 + d + 0.01, 3 + d + 0.01, 9, 3 + d + 0.01];
    expect(thresholdsNear(floor, [inside, outside])).toEqual([inside]);
  });

  it("takes no more than the shader has slots for", () => {
    const many = Array.from({ length: 7 }, (_, i): Threshold => [-2, -0.1 * i, 2, -0.1 * i]);
    const kept = thresholdsNear(floor, many);
    expect(kept).toHaveLength(POOL_THRESHOLDS);
    expect(kept).toEqual(many.slice(0, POOL_THRESHOLDS));
  });
});

describe("doorThreshold", () => {
  it("runs along the wall the door is in, on that wall's line", () => {
    expect(doorThreshold({ side: "north", worldX: 61.25, worldZ: 72.5, width: 1.4 })).toEqual([
      60.55, 72.5, 61.95, 72.5,
    ]);
    expect(doorThreshold({ side: "west", worldX: 50, worldZ: 81.25, width: 2.4 })).toEqual([
      50, 80.05, 50, 82.45,
    ]);
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

  it("gives every doorway of the room as a threshold in the work's frame", () => {
    const north = wallContextFor(bounds, doors, 0, [57.36, 1.65, 72.52], 0);
    expect(north.thresholds).toHaveLength(2);
    // The door in the work's own wall lies on the wall line, to its right.
    const [own, west] = north.thresholds;
    expect(own[0]).toBeCloseTo(61.25 - 0.7 - 57.36, 6);
    expect(own[2]).toBeCloseTo(61.25 + 0.7 - 57.36, 6);
    expect(own[1]).toBeCloseTo(-0.02, 6);
    expect(own[3]).toBeCloseTo(-0.02, 6);
    // The west door runs out into the room along the left-hand wall.
    expect(west[0]).toBeCloseTo(50 - 57.36, 6);
    expect(west[2]).toBeCloseTo(50 - 57.36, 6);
    expect(west[1]).toBeCloseTo(81.25 - 0.7 - 72.52, 6);
    expect(west[3]).toBeCloseTo(81.25 + 0.7 - 72.52, 6);

    // From the west wall the same door is in the work's own wall.
    const fromWest = wallContextFor(bounds, doors, 0, [50.02, 1.65, 86], Math.PI / 2);
    const ownWest = fromWest.thresholds[1];
    expect(ownWest[1]).toBeCloseTo(-0.02, 6);
    expect(ownWest[3]).toBeCloseTo(-0.02, 6);
    expect(Math.min(ownWest[0], ownWest[2])).toBeCloseTo(86 - 81.25 - 0.7, 6);
    expect(Math.max(ownWest[0], ownWest[2])).toBeCloseTo(86 - 81.25 + 0.7, 6);
  });
});

describe("wallContextFor with dividers", () => {
  // A 22.5 × 12.5 m room, x 50..72.5 and z 37.5..50, with a wing wall
  // built off its north wall on x = 57.5 and a panel standing free.
  const bounds = { xMin: 50, xMax: 72.5, zMin: 37.5, zMax: 50 };
  const wing = { axis: "z" as const, line: 23, start: 15, end: 16 };
  const panel = { axis: "x" as const, line: 18, start: 25, end: 27 };
  const dividers = [wing, panel];

  it("gives a work on a divider that divider's face for a wall", () => {
    // East face of the wing wall: x = 57.7, looking +x, hung like a
    // west wall. The wing runs z 37.5..40.
    const ctx = wallContextFor(bounds, [], 0, [57.72, 1.65, 38.75], Math.PI / 2, {
      dividers,
      on: 0,
    });
    // Right hand points at -z: the span is the wing's 2.5 m.
    expect(ctx.roomSpan[0]).toBeCloseTo(38.75 - 40, 6);
    expect(ctx.roomSpan[1]).toBeCloseTo(38.75 - 37.5, 6);
    expect(ctx.wallSpans).toEqual([ctx.roomSpan]);
    // The floor runs on past the wing's free end, to the room's walls.
    expect(ctx.floorSpan[0]).toBeCloseTo(38.75 - 50, 6);
    expect(ctx.floorSpan[1]).toBeCloseTo(38.75 - 37.5, 6);
    // From the face at 57.7 to the east wall at 72.5.
    expect(ctx.roomDepth).toBeCloseTo(72.5 - 57.7, 6);
  });

  it("stops a room wall's pool at a wing wall built off it", () => {
    // North wall, a metre east of the wing: the bay starts at its face.
    const ctx = wallContextFor(bounds, [], 0, [58.7, 1.65, 37.52], 0, { dividers });
    expect(ctx.roomSpan[0]).toBeCloseTo(57.7 - 58.7, 6);
    expect(ctx.roomSpan[1]).toBeCloseTo(72.5 - 58.7, 6);
    expect(ctx.floorSpan).toEqual(ctx.roomSpan);
    // And west of it, the bay ends at the wing's other face.
    const west = wallContextFor(bounds, [], 0, [55, 1.65, 37.52], 0, { dividers });
    expect(west.roomSpan[1]).toBeCloseTo(57.3 - 55, 6);
  });

  it("leaves the opposite wall's pool alone", () => {
    const ctx = wallContextFor(bounds, [], 0, [58.7, 1.65, 49.98], Math.PI, { dividers });
    expect(ctx.roomSpan[1] - ctx.roomSpan[0]).toBeCloseTo(22.5, 6);
  });

  it("stops the floor pool at a panel standing in front of the work", () => {
    // The panel is on z = 45, x 62.5..67.5. A work on the south wall
    // behind it sees its face 4.8 m away, not the north wall 12.5 m off.
    const behind = wallContextFor(bounds, [], 0, [65, 1.65, 49.98], Math.PI, { dividers });
    expect(behind.roomDepth).toBeCloseTo(50 - 45.2, 6);
    const beside = wallContextFor(bounds, [], 0, [70, 1.65, 49.98], Math.PI, { dividers });
    expect(beside.roomDepth).toBeCloseTo(12.5, 6);
  });
});
