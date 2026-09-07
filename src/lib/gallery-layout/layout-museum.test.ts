import { describe, expect, it } from "vitest";
import { type CellRect, GRAND_HALL, SLOT_STAGES, type Slot, STAIR } from "./layout-museum";

const SLOTS: Slot[] = SLOT_STAGES.flat();

function overlaps(a: CellRect, b: CellRect): boolean {
  return a.xMin <= b.xMax && b.xMin <= a.xMax && a.zMin <= b.zMax && b.zMin <= a.zMax;
}

/** Two rects are walkable neighbours when they share a full edge. The
 *  stairwell's east and west faces carry no door (see `wireDoors`), so
 *  touching it sideways does not connect anything. */
function connects(a: CellRect, b: CellRect, aIsStair: boolean, bIsStair: boolean): boolean {
  const zOverlap = a.zMin <= b.zMax && b.zMin <= a.zMax;
  const xOverlap = a.xMin <= b.xMax && b.xMin <= a.xMax;
  const sideBySide = (a.xMax + 1 === b.xMin || b.xMax + 1 === a.xMin) && zOverlap;
  if (sideBySide) return !aIsStair && !bIsStair;
  return (a.zMax + 1 === b.zMin || b.zMax + 1 === a.zMin) && xOverlap;
}

describe("museum floor plan", () => {
  it("tiles without overlapping rooms", () => {
    const all = [STAIR, GRAND_HALL, ...SLOTS.map((s) => s.rect)];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(overlaps(all[i], all[j]), `rect ${i} overlaps rect ${j}`).toBe(false);
      }
    }
  });

  it("keeps every room inside the grid", () => {
    for (const rect of [STAIR, GRAND_HALL, ...SLOTS.map((s) => s.rect)]) {
      expect(rect.xMin).toBeGreaterThanOrEqual(0);
      expect(rect.zMin).toBeGreaterThanOrEqual(0);
      expect(rect.xMax).toBeLessThan(48);
      expect(rect.zMax).toBeLessThan(48);
    }
  });

  it("leaves every stage prefix reachable from the Grand Hall", () => {
    // A floor opens whole stages in order, so any prefix has to be a
    // connected building — a room nobody can walk to would hang works
    // that can never be seen.
    for (let stages = 0; stages <= SLOT_STAGES.length; stages++) {
      const open = SLOT_STAGES.slice(0, stages).flat();
      const rects = [GRAND_HALL, STAIR, ...open.map((s) => s.rect)];
      const stairIdx = 1;
      const reached = new Set<number>([0]);
      const frontier = [0];
      while (frontier.length > 0) {
        const cur = frontier.pop() as number;
        for (let i = 0; i < rects.length; i++) {
          if (reached.has(i)) continue;
          if (connects(rects[cur], rects[i], cur === stairIdx, i === stairIdx)) {
            reached.add(i);
            frontier.push(i);
          }
        }
      }
      expect(reached.size, `stage prefix ${stages} strands a room`).toBe(rects.length);
    }
  });

  it("opens stages symmetrically, so no floor grows a lopsided corner", () => {
    for (const stage of SLOT_STAGES) {
      if (stage.length === 1) continue;
      expect(stage).toHaveLength(2);
      const [a, b] = stage;
      // A pair mirrors either across the stair's x axis or its z axis.
      const mirroredX =
        a.rect.zMin === b.rect.zMin &&
        a.rect.zMax === b.rect.zMax &&
        a.rect.xMax < STAIR.xMin &&
        b.rect.xMin > STAIR.xMax;
      const mirroredZ =
        a.rect.xMin === b.rect.xMin &&
        a.rect.xMax === b.rect.xMax &&
        a.rect.zMax < STAIR.zMin !== b.rect.zMax < STAIR.zMin;
      expect(mirroredX || mirroredZ, `stage ${a.id}/${b.id} is not a mirrored pair`).toBe(true);
    }
  });

  it("varies room shape — no single footprint dominates the plan", () => {
    const shapes = new Set(
      [GRAND_HALL, ...SLOTS.map((s) => s.rect)].map(
        (r) => `${r.xMax - r.xMin + 1}x${r.zMax - r.zMin + 1}`,
      ),
    );
    // 24 rooms drawn from a 5 × 5 band grid minus the stair cell: every
    // distinct band pairing is its own footprint.
    expect(shapes.size).toBeGreaterThanOrEqual(16);
  });
});
