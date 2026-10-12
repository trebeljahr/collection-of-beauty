// Benches placed for what hangs, after the hang.
//
// `planBenches` (fittings.ts) knows a room's footprint and doors and
// nothing of its works: it seats visitors in the middle of a room or of
// a bay. This pass seats them in front of a room's largest works, at
// the distance from which the whole canvas is in view, facing it. A
// long gallery gets one for every stretch of its length, so it is never
// without a seat.
//
// "Largest" is by hung area. The catalogue the museum is laid out from
// has no measure of how well known a work is.

import { benchRect, dividerRect } from "./fittings";
import type { Bench, Placement, RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

type Rect = { xMin: number; xMax: number; zMin: number; zMax: number };

/** Clear floor between a feature bench and any wall of its room. */
const WALL_CLEARANCE = 1.6;
/** Clear floor between a feature bench and a divider. */
const DIVIDER_CLEARANCE = 1.2;
/** Floor kept free either side of the line a door is walked through. */
const DOOR_LINE_MARGIN = 0.8;
/** Two benches of a room stand at least this far apart, centre to
 *  centre, so a long gallery's are spread along it. */
const BENCH_SPACING = 6;
/** How far back from a work its bench stands: far enough to see all of
 *  the work, near enough to read as its bench. */
const VIEW_FACTOR = 1.3;
const VIEW_MIN = 2.8;
const VIEW_MAX = 4.5;
/** A room that already seats this many needs no more. */
const ENOUGH_BENCHES = 4;

/** How many benches a room gets from this pass, by its longer side. */
function quota(lengthM: number): number {
  if (lengthM >= 50) return 4;
  if (lengthM >= 40) return 3;
  if (lengthM >= 25) return 2;
  return 1;
}

function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.xMin - b.xMax, b.xMin - a.xMax);
  const dz = Math.max(0, a.zMin - b.zMax, b.zMin - a.zMax);
  return Math.hypot(dx, dz);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.xMin < b.xMax && b.xMin < a.xMax && a.zMin < b.zMax && b.zMin < a.zMax;
}

/** The way a work faces, into its room. */
export function placementNormal(p: Placement): { x: number; z: number } {
  return { x: Math.sin(p.rotation[1]), z: Math.cos(p.rotation[1]) };
}

/** The bench that goes with a work: in front of it, long side along
 *  the wall the work hangs on. */
export function benchFacing(p: Placement): Bench {
  const n = placementNormal(p);
  const distance = Math.min(
    VIEW_MAX,
    Math.max(VIEW_MIN, VIEW_FACTOR * Math.max(p.widthM, p.heightM)),
  );
  return {
    x: p.position[0] + n.x * distance,
    z: p.position[2] + n.z * distance,
    along: Math.abs(n.x) > Math.abs(n.z) ? "z" : "x",
  };
}

export function planFeatureBenches(
  room: Pick<RoomLayout, "cellBounds" | "doors" | "dividers" | "benches" | "placements">,
): Bench[] {
  if (room.benches.length >= ENOUGH_BENCHES || room.placements.length === 0) return [];
  const b = room.cellBounds;
  const inner: Rect = {
    xMin: b.xMin * CELL_SIZE + WALL_CLEARANCE,
    xMax: (b.xMax + 1) * CELL_SIZE - WALL_CLEARANCE,
    zMin: b.zMin * CELL_SIZE + WALL_CLEARANCE,
    zMax: (b.zMax + 1) * CELL_SIZE - WALL_CLEARANCE,
  };
  const length = Math.max(b.xMax - b.xMin + 1, b.zMax - b.zMin + 1) * CELL_SIZE;
  const wanted = quota(length);

  // The line each door is walked through, across the whole room.
  const doorLines: Rect[] = room.doors.map((door) => {
    const half = door.width / 2 + DOOR_LINE_MARGIN;
    return door.side === "north" || door.side === "south"
      ? {
          xMin: door.worldX - half,
          xMax: door.worldX + half,
          zMin: Number.NEGATIVE_INFINITY,
          zMax: Number.POSITIVE_INFINITY,
        }
      : {
          xMin: Number.NEGATIVE_INFINITY,
          xMax: Number.POSITIVE_INFINITY,
          zMin: door.worldZ - half,
          zMax: door.worldZ + half,
        };
  });
  const dividers = room.dividers.map(dividerRect);

  const ranked = [...room.placements].sort(
    (p, q) =>
      q.widthM * q.heightM - p.widthM * p.heightM || p.artwork.id.localeCompare(q.artwork.id),
  );
  const standing = room.benches.map((bench) => ({ x: bench.x, z: bench.z }));
  const out: Bench[] = [];
  for (const work of ranked) {
    if (out.length >= wanted) break;
    const bench = benchFacing(work);
    const r = benchRect(bench);
    if (r.xMin < inner.xMin || r.xMax > inner.xMax || r.zMin < inner.zMin || r.zMax > inner.zMax) {
      continue;
    }
    if (doorLines.some((line) => overlaps(r, line))) continue;
    if (dividers.some((d) => gap(r, d) < DIVIDER_CLEARANCE)) continue;
    if (standing.some((s) => Math.hypot(s.x - bench.x, s.z - bench.z) < BENCH_SPACING)) continue;
    // Nothing between the seat and the work.
    let blocked = false;
    for (let i = 1; i < 8 && !blocked; i++) {
      const x = bench.x + ((work.position[0] - bench.x) * i) / 8;
      const z = bench.z + ((work.position[2] - bench.z) * i) / 8;
      blocked = dividers.some(
        (d) => x > d.xMin - 0.2 && x < d.xMax + 0.2 && z > d.zMin - 0.2 && z < d.zMax + 0.2,
      );
    }
    if (blocked) continue;
    out.push(bench);
    standing.push({ x: bench.x, z: bench.z });
  }
  return out;
}
