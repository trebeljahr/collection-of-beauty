import { describe, expect, it } from "vitest";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  FLOOR_SEPARATION,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
} from "@/lib/gallery-layout/world-coords";
import {
  isWalkableUnderStair,
  spiralGateHalfArc,
  stairSurfaceAt,
  stairUndersideY,
  UNDER_STAIR_HEADROOM,
} from "./spiral-physics";

const CENTER = 30;
const ENTRY_ANGLE = Math.PI / 2;
/** Mid-annulus radius — where a player walking into the spiral's
 *  footprint actually ends up. */
const R = (SPIRAL_INNER_RADIUS + SPIRAL_OUTER_RADIUS) / 2;

function flight(lowerFloor: number): Staircase {
  return {
    id: `stair-${lowerFloor}-to-${lowerFloor + 1}`,
    lowerFloor,
    upperFloor: lowerFloor + 1,
    lowerLabel: "lower",
    upperLabel: "upper",
    centerX: CENTER,
    centerZ: CENTER,
    innerRadius: SPIRAL_INNER_RADIUS,
    outerRadius: SPIRAL_OUTER_RADIUS,
    numSteps: SPIRAL_STEPS_PER_FLOOR,
    direction: 1,
    lowerY: lowerFloor * FLOOR_SEPARATION,
    upperY: (lowerFloor + 1) * FLOOR_SEPARATION,
    entryAngle: ENTRY_ANGLE,
  };
}

function floorAt(index: number, stairsIn: Staircase[], stairsOut: Staircase[]): FloorLayout {
  return {
    index,
    y: index * FLOOR_SEPARATION,
    stairsIn,
    stairsOut,
  } as unknown as FloorLayout;
}

/** Point on the annulus `theta` radians round from the entry gate. */
function at(theta: number): [number, number] {
  const a = ENTRY_ANGLE + theta;
  return [CENTER + R * Math.cos(a), CENTER + R * Math.sin(a)];
}

const GATE = spiralGateHalfArc(SPIRAL_STEPS_PER_FLOOR);

describe("stairSurfaceAt", () => {
  const up0 = flight(0);
  const ground = floorAt(0, [], [up0]);

  it("lets the player onto the spiral through the gate", () => {
    const [x, z] = at(0);
    expect(stairSurfaceAt(ground, [up0], x, z, 0)?.id).toBe(up0.id);
  });

  // The ground floor has only the flight up, so only the half of the
  // gate mouth that flight's bottom treads occupy is enterable. The
  // other half is under the TOP of the helix, six metres up — solid
  // slab to stand on, but no stair to step onto.
  it("covers the ascending half of the gate mouth", () => {
    for (const theta of [0, GATE / 4, GATE / 2, GATE * 0.9]) {
      const [x, z] = at(theta);
      expect(stairSurfaceAt(ground, [up0], x, z, 0), `theta=${theta}`).not.toBeNull();
    }
  });

  // The bug this rule exists for. The ground floor's spiral rises out
  // of solid slab, so its footprint is walkable ground — but the treads
  // climb away from the gate, and past ~100° of arc they are overhead.
  // Without this rule a player strolled onto the STAIR from any angle
  // and then clipped through the low treads as they came back round to
  // the entry. Standing under the high part of the helix is a separate
  // question, answered by `isWalkableUnderStair` below.
  it("refuses entry from behind the spiral, where the treads are overhead", () => {
    for (const theta of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const [x, z] = at(theta);
      expect(stairSurfaceAt(ground, [up0], x, z, 0), `theta=${theta}`).toBeNull();
    }
  });

  it("keeps refusing entry a good margin outside the gate", () => {
    const [x, z] = at(GATE * 3);
    expect(stairSurfaceAt(ground, [up0], x, z, 0)).toBeNull();
  });

  describe("a floor where two flights meet", () => {
    const up1 = flight(1);
    const down1 = flight(0);
    const first = floorAt(1, [down1], [up1]);
    const feetY = FLOOR_SEPARATION;

    it("hands the up-side of the gate to the ascending flight", () => {
      const [x, z] = at(GATE / 2);
      expect(stairSurfaceAt(first, [down1, up1], x, z, feetY)?.id).toBe(up1.id);
    });

    it("hands the down-side of the gate to the descending flight", () => {
      const [x, z] = at(-GATE * 0.7);
      expect(stairSurfaceAt(first, [down1, up1], x, z, feetY)?.id).toBe(down1.id);
    });

    it("still refuses the far side of the well", () => {
      const [x, z] = at(Math.PI);
      expect(stairSurfaceAt(first, [down1, up1], x, z, feetY)).toBeNull();
    });
  });

  describe("the top of the helix", () => {
    // The topmost flight is capped by a flat landing spanning the half
    // revolution past the gate, so on that floor the arc is floor
    // level, not treads three metres down.
    const down2 = flight(1);
    const top = floorAt(2, [down2], []);
    const feetY = 2 * FLOOR_SEPARATION;

    it("treats the landing as standable along its whole arc", () => {
      for (const theta of [0.2, Math.PI / 2, Math.PI * 0.9]) {
        const [x, z] = at(theta);
        expect(stairSurfaceAt(top, [down2], x, z, feetY), `theta=${theta}`).not.toBeNull();
      }
    });

    it("does not extend that to the descending half", () => {
      const [x, z] = at(-Math.PI / 2);
      expect(stairSurfaceAt(top, [down2], x, z, feetY)).toBeNull();
    });
  });
});

describe("isWalkableUnderStair", () => {
  const up0 = flight(0);
  const ground = floorAt(0, [], [up0]);
  const STEP_RISE = FLOOR_SEPARATION / SPIRAL_STEPS_PER_FLOOR;
  /** First arc whose soffit clears UNDER_STAIR_HEADROOM. Step `i`'s
   *  underside is `(i-1)*STEP_RISE` above the slab. */
  const CLEAR_STEP = Math.ceil(UNDER_STAIR_HEADROOM / STEP_RISE) + 1;
  const STEP_ANGLE = (Math.PI * 2) / SPIRAL_STEPS_PER_FLOOR;

  it("opens the far side of the footprint, where the flight is a storey up", () => {
    for (const theta of [Math.PI, (3 * Math.PI) / 2, Math.PI * 1.9]) {
      const [x, z] = at(theta);
      expect(isWalkableUnderStair(ground, x, z), `theta=${theta}`).toBe(true);
    }
  });

  it("stops where the soffit drops below head height", () => {
    for (const theta of [0, GATE, Math.PI / 4, (CLEAR_STEP - 1) * STEP_ANGLE]) {
      const [x, z] = at(theta);
      expect(isWalkableUnderStair(ground, x, z), `theta=${theta}`).toBe(false);
    }
  });

  it("hands back the exact tread the headroom arithmetic promises", () => {
    const [x, z] = at(CLEAR_STEP * STEP_ANGLE + STEP_ANGLE / 2);
    expect(isWalkableUnderStair(ground, x, z)).toBe(true);
    const [bx, bz] = at((CLEAR_STEP - 1) * STEP_ANGLE + STEP_ANGLE / 2);
    expect(isWalkableUnderStair(ground, bx, bz)).toBe(false);
  });

  it("says nothing about ground outside the footprint", () => {
    const a = ENTRY_ANGLE + Math.PI;
    const outside = SPIRAL_OUTER_RADIUS + 1;
    expect(
      isWalkableUnderStair(ground, CENTER + outside * Math.cos(a), CENTER + outside * Math.sin(a)),
    ).toBe(false);
  });

  // Every floor above ground has the annulus punched out of the slab,
  // so "under the stairs" is a six-metre drop, not a room.
  it("refuses on a floor whose stairwell is a hole", () => {
    const first = floorAt(1, [flight(0)], [flight(1)]);
    const [x, z] = at(Math.PI);
    expect(isWalkableUnderStair(first, x, z)).toBe(false);
  });
});

describe("stairUndersideY", () => {
  const up0 = flight(0);
  const stepRise = FLOOR_SEPARATION / SPIRAL_STEPS_PER_FLOOR;

  // Treads are full-rise blocks, so the soffit hangs one rise below the
  // tread the player would be standing on at the same angle.
  it("sits one rise under the tread top", () => {
    const stepAngle = (Math.PI * 2) / SPIRAL_STEPS_PER_FLOOR;
    for (const i of [1, 5, 13, 25]) {
      const raw = i * stepAngle + stepAngle / 2;
      expect(stairUndersideY(up0, raw)).toBeCloseTo((i - 1) * stepRise, 6);
    }
  });

  it("reports no room at all under the bottom tread", () => {
    expect(stairUndersideY(up0, 0)).toBeLessThan(0);
  });
});
