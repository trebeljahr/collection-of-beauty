import { describe, expect, it } from "vitest";
import {
  buildLightRig,
  clearSpans,
  doorThreshold,
  FAR_MAX_HEADS,
  hallBounds,
  type LightRigInput,
  POOL_THRESHOLDS,
  SHEER_HALL_WALL_INSET,
  THRESHOLD_FADE_M,
  type Threshold,
  thresholdsNear,
  wallContextFor,
  wallInsetOf,
  wallSideOf,
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

// A giant in a hall. Storey: a canvas 5 m by 4 with its foot 0.4 m over
// the floor, under a gallery 5.9 m up. Sheer: the Wedding at Cana, 12 m
// over the hall floor and 12 m under the roof.
function giant(over: Partial<LightRigInput> = {}): LightRigInput {
  return {
    frameHalfW: 2.7,
    frameHalfH: 2.2,
    canvasH: 4,
    floorY: -2.6,
    ceilingY: 5.9 - 2.6,
    wallOffset: 0.02,
    roomSpan: [-7, 7],
    wallSpans: [[-7, 7]],
    roomDepth: 4.6,
    far: { maxThrow: 4.2, onCeiling: true },
    ...over,
  };
}
const sheer = (over: Partial<LightRigInput> = {}) =>
  giant({
    frameHalfW: 5.25,
    frameHalfH: 3.7,
    canvasH: 6.75,
    floorY: -12,
    ceilingY: 12,
    roomSpan: [-13.75, 13.75],
    wallSpans: [[-13.75, 13.75]],
    roomDepth: 27.5,
    far: { maxThrow: 9, onCeiling: false },
    ...over,
  });
/** What the heads lay on the wall at (x, y), before the pool's own
 *  edge (`LightRig.soft`) ends it. */
function wallLightAt(rig: ReturnType<typeof buildLightRig>, x: number, y: number, wallZ = -0.02) {
  let e = 0;
  for (const h of rig.heads) {
    const toL = [h.position[0] - x, h.position[1] - y, h.position[2] - wallZ];
    const d2 = toL[0] ** 2 + toL[1] ** 2 + toL[2] ** 2;
    const l = toL.map((c) => c / Math.sqrt(d2));
    const along = -(l[0] * h.direction[0] + l[1] * h.direction[1] + l[2] * h.direction[2]);
    const t = Math.min(1, Math.max(0, (along - h.cosOuter) / (h.cosInner - h.cosOuter)));
    e += (h.intensity * Math.max(0, l[2]) * t * t * (3 - 2 * t)) / d2;
  }
  return e;
}
/** The height a head is aimed at on the wall. */
const aimY = (h: ReturnType<typeof buildLightRig>["heads"][number]) =>
  h.position[1] + (h.direction[1] * (-0.02 - h.position[2])) / h.direction[2];
const levi = { frameHalfW: 6.85, frameHalfH: 2.9, canvasH: 5.5 };
const matin = { frameHalfW: 6.6, frameHalfH: 1.2, canvasH: 2 };

describe("a giant's far lamps", () => {
  it("stand further from the wall than a room's can, and no further than the gallery is wide", () => {
    const rig = buildLightRig(giant());
    for (const h of rig.heads) {
      expect(h.position[2] + 0.02).toBeGreaterThan(2.0);
      expect(h.position[2] + 0.02).toBeLessThanOrEqual(4.2 + 1e-9);
      // On a storey they hang from its ceiling, as a room's cans do.
      expect(h.position[1]).toBeCloseTo(5.9 - 2.6 - 0.3, 6);
    }
  });

  it("stand in the air in front of a work on a sheer wall, over its middle", () => {
    const rig = buildLightRig(sheer());
    for (const h of rig.heads) {
      expect(h.position[1]).toBeGreaterThan(0);
      expect(h.position[1]).toBeLessThan(6);
      expect(h.position[2] + 0.02).toBeLessThanOrEqual(9 + 1e-9);
    }
  });

  it("take one head to each stretch of frame about as wide as the frame is tall", () => {
    expect(buildLightRig(giant()).heads).toHaveLength(1);
    expect(buildLightRig(sheer()).heads).toHaveLength(1);
    // Veronese's Feast in the House of Levi, 13.7 m by 5.8 in its frame.
    expect(buildLightRig(sheer(levi)).heads).toHaveLength(2);
    // Monet's Matin, 13.2 m by 2.4, and a handscroll 12 m by 0.5.
    expect(buildLightRig(sheer(matin)).heads).toHaveLength(6);
    const scroll = buildLightRig(giant({ frameHalfW: 6, frameHalfH: 0.25, canvasH: 0.35 }));
    expect(scroll.heads).toHaveLength(5);
    expect(scroll.heads.length).toBeLessThanOrEqual(FAR_MAX_HEADS);
    // Evenly along it, about its middle.
    const xs = scroll.heads.map((h) => h.position[0]);
    for (const [i, x] of xs.entries()) expect(x).toBeCloseTo(-xs[xs.length - 1 - i], 6);
  });

  it("give the brightest aim point the light a room's work has at its own", () => {
    for (const rig of [
      buildLightRig(giant()),
      buildLightRig(sheer()),
      buildLightRig(sheer(levi)),
      buildLightRig(sheer(matin)),
    ]) {
      const lit = rig.heads.map((h) => wallLightAt(rig, h.position[0], aimY(h)));
      expect(Math.max(...lit)).toBeCloseTo(1, 6);
      // And no aim point much under it: the heads of a long work share
      // the wall between them.
      expect(Math.min(...lit)).toBeGreaterThan(0.7);
    }
  });

  it("hold the whole frame in the cones' full strength, and the pool's edge beside it", () => {
    const inCore = (rig: ReturnType<typeof buildLightRig>, x: number, y: number) =>
      rig.heads.some((h) => {
        const v = [x - h.position[0], y - h.position[1], -0.02 - h.position[2]];
        const along = v[0] * h.direction[0] + v[1] * h.direction[1] + v[2] * h.direction[2];
        return along / Math.hypot(v[0], v[1], v[2]) >= h.cosInner - 1e-9;
      });
    for (const input of [giant(), sheer(), sheer(levi), sheer(matin)]) {
      const rig = buildLightRig(input);
      for (const x of [-input.frameHalfW, 0, input.frameHalfW]) {
        for (const y of [-input.frameHalfH, input.frameHalfH]) {
          expect(inCore(rig, x, y), `${x}, ${y}`).toBe(true);
        }
      }
      // The cones do not end the pool: its edge beside the middle of
      // the frame, and over and under it, is still inside a core.
      const soft = rig.soft!;
      expect(inCore(rig, input.frameHalfW + soft, 0)).toBe(true);
      expect(inCore(rig, -input.frameHalfW - soft, 0)).toBe(true);
      expect(inCore(rig, 0, -input.frameHalfH - soft)).toBe(true);
    }
  });

  it("end the pool a set distance from the frame, all round", () => {
    // A quarter of the frame's shorter side, between 0.9 m and 1.8 m.
    expect(buildLightRig(giant()).soft).toBeCloseTo(1.1, 6);
    expect(buildLightRig(sheer()).soft).toBeCloseTo(1.8, 6);
    expect(buildLightRig(sheer(matin)).soft).toBeCloseTo(0.9, 6);
    // A room's work has none: its cone is its pool.
    expect(buildLightRig(input()).soft).toBeUndefined();
    // The Wedding at Cana: lit from a round cone alone, the wall was
    // lit for 13 m under the frame. The quad stops with the pool.
    const cana = sheer();
    const rig = buildLightRig(cana);
    expect(rig.wall).toHaveLength(1);
    expect(rig.wall[0].yMin).toBeCloseTo(-cana.frameHalfH - 1.8 - 0.05, 6);
    expect(rig.wall[0].yMax).toBeCloseTo(cana.frameHalfH + 1.8 + 0.05, 6);
    expect(rig.wall[0].xMin).toBeCloseTo(-cana.frameHalfW - 1.8 - 0.05, 6);
    expect(rig.wall[0].xMax).toBeCloseTo(cana.frameHalfW + 1.8 + 0.05, 6);
    // Nothing of it reaches the hall floor twelve metres down.
    expect(rig.floor).toBeNull();
    expect(rig.thresholds).toHaveLength(0);
  });

  it("stop at the ceiling, the floor and the wall's end", () => {
    // A storey's work: its frame's top is 0.7 m under the gallery above
    // and its foot 0.4 m over the floor.
    const rig = buildLightRig(giant({ roomSpan: [-3, 7], wallSpans: [[-3, 7]] }));
    expect(rig.wall[0].yMax).toBeCloseTo(5.9 - 2.6, 6);
    expect(rig.wall[0].yMin).toBeCloseTo(-2.6, 6);
    expect(rig.wall[0].xMin).toBeCloseTo(-3, 6);
  });

  it("spill onto the floor under a frame that hangs within the pool's reach of it", () => {
    const rig = buildLightRig(giant());
    expect(rig.floor).not.toBeNull();
    // 0.4 m over the floor, with a soft edge of 1.1 m: about a metre.
    const reach = rig.floor!.yMax - rig.floor!.yMin;
    expect(reach).toBeCloseTo(Math.sqrt(1.1 ** 2 - 0.4 ** 2) + 0.05, 6);
    // A frame hung higher than the edge reaches lights no floor.
    expect(buildLightRig(giant({ floorY: -2.2 - 1.2 })).floor).toBeNull();
  });
});

describe("hallBounds", () => {
  const bounds = { xMin: 0, xMax: 27.5, zMin: 17.5, zMax: 45 };
  const sheerWest = { side: "west" as const, depth: 11.45 };

  it("leaves a hall with no sheer wall whole", () => {
    expect(hallBounds(bounds, undefined, 0, false)).toEqual(bounds);
  });

  it("leaves the sheer wall and the wall across from it whole", () => {
    expect(hallBounds(bounds, sheerWest, Math.PI / 2, true)).toEqual(bounds);
    expect(hallBounds(bounds, sheerWest, -Math.PI / 2, false)).toEqual(bounds);
  });

  it("cuts a wall that meets the sheer wall where its gallery ends", () => {
    // North wall: the strip beyond the gallery for a work hung on it,
    // the gallery's stretch for a work hung there.
    expect(hallBounds(bounds, sheerWest, 0, true)).toEqual({ ...bounds, xMax: 11.45 });
    expect(hallBounds(bounds, sheerWest, 0, false)).toEqual({ ...bounds, xMin: 11.45 });
    expect(hallBounds(bounds, sheerWest, Math.PI, true)).toEqual({ ...bounds, xMax: 11.45 });
    // The other end hall, its sheer wall to the east.
    const east = { side: "east" as const, depth: 11.45 };
    const b = { xMin: 90, xMax: 117.5, zMin: 17.5, zMax: 45 };
    expect(hallBounds(b, east, 0, true)).toEqual({ ...b, xMin: 117.5 - 11.45 });
    expect(hallBounds(b, east, Math.PI, false)).toEqual({ ...b, xMax: 117.5 - 11.45 });
    // And a hall turned a quarter.
    const north = { side: "north" as const, depth: 5 };
    expect(hallBounds(bounds, north, Math.PI / 2, true)).toEqual({ ...bounds, zMax: 22.5 });
    expect(hallBounds(bounds, north, -Math.PI / 2, false)).toEqual({ ...bounds, zMin: 22.5 });
    const south = { side: "south" as const, depth: 5 };
    expect(hallBounds(bounds, south, Math.PI / 2, true)).toEqual({ ...bounds, zMin: 40 });
    expect(hallBounds(bounds, south, -Math.PI / 2, false)).toEqual({ ...bounds, zMax: 40 });
  });

  it("stops a gallery work's pool at the gallery's end", () => {
    // A work on the north wall's gallery stretch, 8 m from where the
    // gallery ends: its wall begins there, not at the hall's corner.
    const pos: [number, number, number] = [19.45, 2.5, 17.52];
    const ctx = wallContextFor(hallBounds(bounds, sheerWest, 0, false), [], 0, pos, 0);
    expect(ctx.roomSpan[0]).toBeCloseTo(-8, 6);
    expect(ctx.roomSpan[1]).toBeCloseTo(27.5 - 19.45, 6);
  });
});

describe("the wall a pool lies on", () => {
  it("is the wall as drawn: inside its line in a hall with a sheer wall", () => {
    expect(wallInsetOf({})).toBe(0);
    expect(wallInsetOf({ sheer: { side: "west", depth: 11.45 } })).toBe(SHEER_HALL_WALL_INSET);
    // A pool lies 2 mm off its wall (`SURFACE_LIFT`). The inset is more
    // than that: left on the wall's line, the pool was behind the wall.
    expect(SHEER_HALL_WALL_INSET).toBeGreaterThan(0.002);
  });

  it("names the wall from a placement's turn", () => {
    expect(wallSideOf(0)).toBe("north");
    expect(wallSideOf(Math.PI)).toBe("south");
    expect(wallSideOf(-Math.PI)).toBe("south");
    expect(wallSideOf(Math.PI / 2)).toBe("west");
    expect(wallSideOf(-Math.PI / 2)).toBe("east");
  });
});
