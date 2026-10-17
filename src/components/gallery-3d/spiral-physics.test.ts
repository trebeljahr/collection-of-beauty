import { describe, expect, it } from "vitest";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  FLOOR_SEPARATION,
  SPIRAL_EDGE_SEGMENTS,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
} from "@/lib/gallery-layout/world-coords";
import {
  isWalkableUnderStair,
  spiralGateHalfArc,
  spiralPieces,
  spiralRailLineY,
  spiralSoffitY,
  stairHeightAt,
  stairSurfaceAt,
  stairUndersideY,
  topLandingDepth,
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

const GATE = spiralGateHalfArc();

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
    // The topmost flight ends in a landing past the gate, as far as the
    // handrail that closes the well. On that floor the landing is floor
    // level, not treads three metres down; past the rail is the well.
    const down2 = flight(1);
    const top = floorAt(2, [down2], []);
    const feetY = 2 * FLOOR_SEPARATION;

    it("treats the landing as standable up to the rail", () => {
      // Angles at which a point at R lies a fraction of the way from
      // the gate to the rail.
      const depth = topLandingDepth(down2);
      for (const theta of [0.1, 0.5, 0.95].map((f) => Math.asin((f * depth) / R))) {
        const [x, z] = at(theta);
        expect(stairSurfaceAt(top, [down2], x, z, feetY), `theta=${theta}`).not.toBeNull();
      }
    });

    it("has nothing to stand on past the rail", () => {
      const pastRail = Math.asin((1.1 * topLandingDepth(down2)) / R);
      for (const theta of [pastRail, Math.PI / 2, Math.PI * 0.9]) {
        const [x, z] = at(theta);
        expect(stairSurfaceAt(top, [down2], x, z, feetY), `theta=${theta}`).toBeNull();
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
  /** The first tread whose soffit clears UNDER_STAIR_HEADROOM all the
   *  way across, and the one before it. */
  const treads = spiralPieces(up0).filter((p) => p.kind === "tread");
  const clear = treads.find((p) => spiralSoffitY(up0, p.from) >= UNDER_STAIR_HEADROOM)!;
  const low = treads[treads.indexOf(clear) - 2];

  it("opens the far side of the footprint, where the flight is a storey up", () => {
    for (const theta of [Math.PI, (3 * Math.PI) / 2, Math.PI * 1.9]) {
      const [x, z] = at(theta);
      expect(isWalkableUnderStair(ground, x, z), `theta=${theta}`).toBe(true);
    }
  });

  it("stops where the soffit drops below head height", () => {
    for (const theta of [0, GATE, Math.PI / 4, (low.from + low.to) / 2]) {
      const [x, z] = at(theta);
      expect(isWalkableUnderStair(ground, x, z), `theta=${theta}`).toBe(false);
    }
  });

  it("hands back the tread the headroom arithmetic promises", () => {
    const [x, z] = at((clear.from + clear.to) / 2);
    expect(isWalkableUnderStair(ground, x, z)).toBe(true);
    const [bx, bz] = at((low.from + low.to) / 2);
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
  // so "under the stairs" is a storey's drop, not a room.
  it("refuses on a floor whose stairwell is a hole", () => {
    const first = floorAt(1, [flight(0)], [flight(1)]);
    const [x, z] = at(Math.PI);
    expect(isWalkableUnderStair(first, x, z)).toBe(false);
  });
});

describe("the flight's pieces", () => {
  const up0 = flight(0);
  const pieces = spiralPieces(up0);
  const rise = FLOOR_SEPARATION / SPIRAL_STEPS_PER_FLOOR;

  it("is half a landing, a riser fewer treads than risers, and half a landing", () => {
    expect(pieces[0]).toMatchObject({ kind: "landing-low", from: 0, top: 0 });
    expect(pieces.at(-1)).toMatchObject({ kind: "landing-high", to: Math.PI * 2 });
    expect(pieces.at(-1)!.top).toBeCloseTo(FLOOR_SEPARATION, 9);
    expect(pieces.filter((p) => p.kind === "tread")).toHaveLength(SPIRAL_STEPS_PER_FLOOR - 1);
  });

  it("joins piece to piece, each a rise above the last", () => {
    const bad: string[] = [];
    for (let i = 1; i < pieces.length; i++) {
      if (Math.abs(pieces[i].from - pieces[i - 1].to) > 1e-9) bad.push(`gap before ${i}`);
      if (Math.abs(pieces[i].top - pieces[i - 1].top - rise) > 1e-9) bad.push(`rise before ${i}`);
    }
    expect(bad).toEqual([]);
  });

  it("puts the feet on the piece under them", () => {
    const bad: string[] = [];
    for (const p of pieces) {
      const y = stairHeightAt(up0, (p.from + p.to) / 2);
      if (Math.abs(y - p.top) > 1e-9) bad.push(`${p.kind} ${p.from}`);
    }
    expect(bad).toEqual([]);
  });

  it("keeps the landing level across the gate, flight to flight", () => {
    const up1 = flight(1);
    for (const g of [-GATE * 0.9, -GATE / 2]) {
      expect(stairHeightAt(up0, Math.PI * 2 + g)).toBeCloseTo(FLOOR_SEPARATION, 9);
    }
    for (const g of [GATE / 2, GATE * 0.9]) {
      expect(stairHeightAt(up1, g)).toBeCloseTo(FLOOR_SEPARATION, 9);
    }
  });

  // One edge of the floor's hole and of every piece (SPIRAL_EDGE_SEGMENTS).
  it("ends every piece on a vertex of the floor's hole", () => {
    const step = (Math.PI * 2) / SPIRAL_EDGE_SEGMENTS;
    let worst = 0;
    for (const p of pieces) {
      for (const a of [p.from, p.to]) {
        const off = Math.abs(a / step - Math.round(a / step));
        worst = Math.max(worst, off);
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("runs one soffit and one rail line under and over the whole helix", () => {
    const up1 = flight(1);
    expect(spiralSoffitY(up0, Math.PI * 2)).toBeCloseTo(spiralSoffitY(up1, 0), 9);
    expect(spiralRailLineY(up0, Math.PI * 2)).toBeCloseTo(spiralRailLineY(up1, 0), 9);
    let worst = 0;
    let at = 0;
    for (let c = 0.001; c < Math.PI * 2; c += 0.001) {
      const jump = Math.abs(spiralSoffitY(up0, c) - spiralSoffitY(up0, c - 0.001));
      if (jump > worst) [worst, at] = [jump, c];
    }
    expect(worst, `at ${at}`).toBeLessThan(rise / 10);
  });
});

describe("stairUndersideY", () => {
  const up0 = flight(0);
  const stepRise = FLOOR_SEPARATION / SPIRAL_STEPS_PER_FLOOR;

  // Treads are full-rise blocks, so under a tread's middle the soffit
  // hangs one rise below the tread the player would be standing on.
  it("sits one rise under the tread top", () => {
    const treads = spiralPieces(up0).filter((p) => p.kind === "tread");
    for (const i of [1, 5, 13, 25]) {
      const t = treads[i - 1];
      expect(stairUndersideY(up0, (t.from + t.to) / 2)).toBeCloseTo((i - 1) * stepRise, 6);
    }
  });

  it("reports no room at all under the bottom of the flight", () => {
    expect(stairUndersideY(up0, 0)).toBeLessThan(0);
  });
});
