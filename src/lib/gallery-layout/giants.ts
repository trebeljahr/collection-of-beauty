// Works too large for a room, hung at their real size in the stair halls.
//
// A room hangs nothing wider or taller than 3.2 m (`MAX_PAINTING_W`), so
// Veronese's Wedding at Cana, 9.94 m wide, hung at a third of its size
// beside a plaque that gave the true one. A stair hall has the wall a
// room has not: 27.5 m a side, and in the block plan's main hall one
// wall with no gallery in front of it, sheer from the floor to the roof.
//
// Two kinds of place:
//
//   A storey of a hall. Each wall has a stretch either side of its door,
//   about 11.5 m long and one storey high. A work hangs there when its
//   frame fits under the gallery above: canvases up to about 4.9 m tall.
//
//   The sheer wall (`GrandStair.sheerWall`). Works taller than a storey
//   hang there in two tiers. The lower: the widest in the axis of the
//   stair, over its half landing, a pair of like height on the floor
//   either side.
//   The upper starts level with the third storey and is seen from the
//   galleries of the two floors above.
//
// Every work here hangs at the size its plaque states. One that fits
// neither place stays in its era's rooms, at the room's limit.

import type { ArtworkListing } from "@/lib/data";
import { trustworthyRealSize } from "@/lib/real-size";
import { frameExtents, pickFrameDesign } from "./frame-design";
import { artworkBand } from "./painting-bands";
import {
  computeRoomRuns,
  footprintOf,
  frameReachOf,
  MAX_PAINTING_W,
  PAINTING_FLOOR_GAP,
  PAINTING_WALL_OFFSET,
  PLAQUE_FOOTPRINT,
  packRun,
  runLength,
  type SizedWork,
  type WallRun,
} from "./place-paintings";
import { widestTexturePx } from "./sharpness";
import type { Door, Placement, RoomLayout } from "./types";
import { CELL_SIZE, FLOOR_SEPARATION, INTER_FLOOR_HEIGHT } from "./world-coords";

/** Texture pixels a giant needs for each metre of its real width.
 *
 *  A room's works need 1,000 (`sharpness.ts`): sharp from a metre away.
 *  A visitor that near a canvas five metres wide sees a fifteenth of
 *  it. At 400 a work is sharp from 2.5 m, which is nearer than anyone
 *  stands to see it whole. The largest are the thinnest: the Wedding at
 *  Cana has 412, the Coronation of Napoleon 418. Raise this to 1,000
 *  and they go back to their rooms at a third of their size. */
export const GIANT_MIN_PX_PER_METRE = 400;

/** Wall left between two giants, and between a giant and the end of
 *  its stretch, at least. Rico found works a few decimetres apart too
 *  close in a room; a canvas five metres wide wants more. */
const GIANT_GAP = 1.0;
/** Room a frame has on a storey of a hall: from the gap over the floor
 *  to a hand under the gallery above. */
const STOREY_FRAME_ROOM = INTER_FLOOR_HEIGHT - PAINTING_FLOOR_GAP - 0.14;
/** Height of a plaque's centre over the floor when it cannot hang
 *  beside the middle of its canvas: eye level for reading. */
const PLAQUE_EYE = 1.45;
/** A plaque beside the middle of a canvas is read up to this height. */
const PLAQUE_REACH = 1.9;
/** Height of the frame hung in the axis of the stair, over the floor:
 *  above the balustrade of the half landing in front of it, so that it
 *  is seen whole from the hall's door, and above a door under it. */
const OVER_LANDING = FLOOR_SEPARATION / 2 + 0.6;
/** Wall between the casing of a door and the frame hung over it. */
const OVER_DOOR = 0.64;
/** Wall between the two tiers of the sheer wall, at least. */
const TIER_GAP = 1.0;
/** Wall between works of the upper tier, at least. */
const UPPER_GAP = 0.8;
/** Corner kept clear at each end of the sheer wall. */
const SHEER_MARGIN = 0.3;

/**
 * The work at its real size, when that is more than a room hangs and
 * the scan is good for it. Null for every other work.
 *
 * The long edge is the catalogue's, and only an audited one
 * (`trustworthyRealSize`): a size the plaque would not print is not
 * hung at ten metres. The shape is the scan's, as in `sizeWork`.
 */
export function giantSize(artwork: ArtworkListing): SizedWork | null {
  const size = trustworthyRealSize(artwork);
  if (!size || !artwork.width || !artwork.height) return null;
  const long = Math.max(size.widthCm, size.heightCm) / 100;
  const aspect = artwork.width / artwork.height;
  const wM = aspect >= 1 ? long : long * aspect;
  const hM = aspect >= 1 ? long / aspect : long;
  if (wM <= MAX_PAINTING_W && hM <= MAX_PAINTING_W) return null;
  const px = widestTexturePx(artwork);
  if (px == null || px / wM < GIANT_MIN_PX_PER_METRE) return null;
  return { artwork, wM, hM };
}

/** Height of a work in its frame. */
function framedHeight(work: SizedWork): number {
  const e = frameExtents(pickFrameDesign(work.artwork), work.wM, work.hM);
  return work.hM + e.top + e.bottom;
}

/** True when the work's frame fits a storey of a hall. */
export function fitsStorey(work: SizedWork): boolean {
  return framedHeight(work) <= STOREY_FRAME_ROOM;
}

const area = (w: SizedWork) => w.wM * w.hM;
const bySize = (a: SizedWork, b: SizedWork) =>
  area(b) - area(a) || a.artwork.id.localeCompare(b.artwork.id);

// ── A storey of a hall ────────────────────────────────────────────────

/**
 * The stretches of a hall storey's walls that hang works: not the sheer
 * wall, and on the walls that meet it, not the part with no floor in
 * front (`room.sheer`, on every storey over the hall's lowest).
 */
export function hallRuns(room: RoomLayout, lowest: boolean): WallRun[] {
  const runs = computeRoomRuns(room).map((run) => ({
    ...run,
    maxHeight: Number.POSITIVE_INFINITY,
  }));
  const sheer = room.sheer;
  if (!sheer) return runs;
  const cb = room.cellBounds;
  const out: WallRun[] = [];
  for (const run of runs) {
    if (run.side === sheer.side) continue;
    const alongSheer = (sheer.side === "north" || sheer.side === "south") === (run.axis === "x");
    if (alongSheer || lowest) {
      out.push(run);
      continue;
    }
    // World coordinate along the run is `sign * u`. Keep what lies
    // clear of the strip, and a balustrade's depth beyond it.
    const keep = sheer.depth + GIANT_GAP;
    let lo = Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    if (sheer.side === "north") lo = cb.zMin * CELL_SIZE + keep;
    if (sheer.side === "south") hi = (cb.zMax + 1) * CELL_SIZE - keep;
    if (sheer.side === "west") lo = cb.xMin * CELL_SIZE + keep;
    if (sheer.side === "east") hi = (cb.xMax + 1) * CELL_SIZE - keep;
    const uLo = run.sign === 1 ? lo : -hi;
    const uHi = run.sign === 1 ? hi : -lo;
    const trimmed = { ...run, uMin: Math.max(run.uMin, uLo), uMax: Math.min(run.uMax, uHi) };
    if (runLength(trimmed) > 1) out.push(trimmed);
  }
  return out;
}

/** Give a tall work's plaque a place at reading height. */
function withPlaqueAtEye(p: Placement, floorY: number): Placement {
  if (p.position[1] - floorY <= PLAQUE_REACH) return p;
  return { ...p, plaque: { dy: floorY + PLAQUE_EYE - p.position[1] } };
}

/**
 * Hang giants on the storeys of one hall, largest first, one storey
 * after another from `start`, and round to the storeys under it last.
 * A work goes to the stretch with the most wall left, so a storey takes
 * one work a stretch before any stretch takes two. Returns the works
 * that found no place.
 */
export function hangHallStoreys(
  storeys: RoomLayout[],
  works: Array<{ work: SizedWork; start: number }>,
): SizedWork[] {
  const levels = storeys.map((room, i) => {
    const runs = hallRuns(room, i === 0);
    return { room, runs, assigned: runs.map((): SizedWork[] => []), used: runs.map(() => 0) };
  });
  const left: SizedWork[] = [];
  for (const { work, start } of [...works].sort((a, b) => bySize(a.work, b.work))) {
    const need = footprintOf(work);
    const order = [
      ...levels.slice(Math.min(start, levels.length)),
      ...levels.slice(0, Math.min(start, levels.length)).reverse(),
    ];
    let placed = false;
    for (const level of order) {
      let best = -1;
      let bestSlack = 0;
      level.runs.forEach((run, i) => {
        const count = level.assigned[i].length;
        const slack = runLength(run) - level.used[i] - (count + 2) * GIANT_GAP;
        if (slack >= need && slack > bestSlack) {
          best = i;
          bestSlack = slack;
        }
      });
      if (best < 0) continue;
      level.assigned[best].push(work);
      level.used[best] += need;
      placed = true;
      break;
    }
    if (!placed) left.push(work);
  }
  for (const level of levels) {
    level.runs.forEach((run, i) => {
      for (const p of packRun(run, level.assigned[i], Number.POSITIVE_INFINITY)) {
        level.room.placements.push(withPlaqueAtEye({ ...p, giant: true }, level.room.worldRect.y));
      }
    });
  }
  return left;
}

// ── The sheer wall ────────────────────────────────────────────────────

type Framed = SizedWork & { reach: number; top: number; bottom: number };

function framed(work: SizedWork): Framed {
  const e = frameExtents(pickFrameDesign(work.artwork), work.wM, work.hM);
  return { ...work, reach: frameReachOf(work), top: e.top, bottom: e.bottom };
}

/**
 * Compose the sheer wall of a hall from the works too tall for a
 * storey. `storeys` are the hall's rooms from the floor its stair
 * leaves up. Returns the works that found no place.
 */
export function hangSheerWall(storeys: RoomLayout[], tall: SizedWork[]): SizedWork[] {
  const base = storeys[0];
  const sheer = base?.sheer;
  if (!sheer || tall.length === 0) return tall;
  const template = computeRoomRuns(base).find((r) => r.side === sheer.side);
  if (!template) return tall;

  const cb = base.cellBounds;
  const alongX = template.axis === "x";
  const wallLength = (alongX ? cb.xMax - cb.xMin + 1 : cb.zMax - cb.zMin + 1) * CELL_SIZE;
  const wallMid =
    ((alongX ? cb.xMin + cb.xMax + 1 : cb.zMin + cb.zMax + 1) / 2) * CELL_SIZE * template.sign;
  const half = wallLength / 2 - SHEER_MARGIN;
  const floorY = base.worldRect.y;
  const door: Door | undefined = base.doors.find((d) => d.side === sheer.side);

  /** A work on the wall: `u` is its canvas centre along the wall from
   *  the wall's middle, to the viewer's right. */
  const place = (
    room: RoomLayout,
    work: Framed,
    u: number,
    bottomY: number,
    plaque: Placement["plaque"],
  ): number => {
    const centerY = bottomY + work.bottom + work.hM / 2;
    const along = template.sign * (wallMid + u);
    room.placements.push({
      artwork: work.artwork,
      position: [
        (alongX ? along : template.surface) + template.normalX * PAINTING_WALL_OFFSET,
        centerY,
        (alongX ? template.surface : along) + template.normalZ * PAINTING_WALL_OFFSET,
      ],
      rotation: [0, template.rotationY, 0],
      band: artworkBand(work.artwork),
      widthM: work.wM,
      heightM: work.hM,
      giant: true,
      plaque: plaque === undefined ? { dy: floorY + PLAQUE_EYE - centerY } : plaque,
    });
    return bottomY + work.bottom + work.hM + work.top;
  };

  let pool = [...tall].sort(bySize).map(framed);
  const take = (work: Framed) => {
    pool = pool.filter((w) => w !== work);
  };
  let lowerTop = floorY;

  // Lower tier. The widest work hangs in the axis of the stair, over
  // its half landing.
  const centre = [...pool]
    .filter((w) => w.wM + 2 * w.reach <= 2 * half - 2 * GIANT_GAP)
    .sort((a, b) => b.wM - a.wM || bySize(a, b))[0];
  if (centre) {
    take(centre);
    const bottomY = floorY + Math.max(OVER_LANDING, door ? door.height + OVER_DOOR : 0);
    const centreHalf = centre.wM / 2 + centre.reach;
    // Its plaque: at eye level under the middle of it, or on the wall
    // beside the door when there is one there.
    const plaqueU = door ? door.width / 2 + 0.6 : 0;
    lowerTop = place(base, centre, 0, bottomY, {
      dy: floorY + PLAQUE_EYE - (bottomY + centre.bottom + centre.hM / 2),
      dx: plaqueU,
    });

    // A pair on the floor either side: the two nearest in height among
    // the works that fit there, the larger pair when two are as near.
    const span = half - centreHalf - GIANT_GAP;
    const fits = pool.filter((w) => w.wM + 2 * w.reach + PLAQUE_FOOTPRINT + GIANT_GAP <= span);
    let pair: [Framed, Framed] | null = null;
    let pairScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < fits.length; i++) {
      for (let j = i + 1; j < fits.length; j++) {
        const score = Math.abs(fits[i].hM - fits[j].hM) - 1e-3 * (area(fits[i]) + area(fits[j]));
        if (score < pairScore) {
          pairScore = score;
          pair = [fits[i], fits[j]];
        }
      }
    }
    if (pair) {
      for (const [side, work] of [
        [-1, pair[0]],
        [1, pair[1]],
      ] as const) {
        take(work);
        // The stretch between the corner and the centre work, and the
        // work with its plaque in the middle of it.
        const footprint = work.wM + 2 * work.reach + PLAQUE_FOOTPRINT;
        const mid = side * (centreHalf + GIANT_GAP + span / 2);
        const u = mid - footprint / 2 + work.reach + work.wM / 2;
        lowerTop = Math.max(lowerTop, place(base, work, u, floorY + PAINTING_FLOOR_GAP, undefined));
      }
    }
  }

  // Upper tier: level with a floor two storeys up, clear of the lower
  // tier, under the roof. Out of reading distance, so no plaques.
  const upperRoom = storeys[2];
  if (upperRoom && pool.length > 0) {
    const bottomY = Math.max(lowerTop + TIER_GAP, upperRoom.worldRect.y + PAINTING_FLOOR_GAP);
    const roofY = storeys[storeys.length - 1].worldRect.y + INTER_FLOOR_HEIGHT - PAINTING_FLOOR_GAP;
    const row: Framed[] = [];
    let width = 0;
    for (const work of pool) {
      const w = work.wM + 2 * work.reach;
      if (row.length >= 3) break;
      if (bottomY + work.bottom + work.hM + work.top > roofY) continue;
      if (width + w + (row.length + 2) * UPPER_GAP > 2 * half) continue;
      row.push(work);
      width += w;
    }
    // Widest in the middle, as on any wall.
    const ordered: Framed[] = [];
    [...row]
      .sort((a, b) => b.wM - a.wM)
      .forEach((w, i) => {
        if (i % 2 === 0) ordered.push(w);
        else ordered.unshift(w);
      });
    const gap = Math.min(2.5, (2 * half - width) / (ordered.length + 1));
    let cursor = -(width + gap * (ordered.length - 1)) / 2;
    for (const work of ordered) {
      take(work);
      const w = work.wM + 2 * work.reach;
      place(upperRoom, work, cursor + w / 2, bottomY, null);
      cursor += w + gap;
    }
  }
  return pool;
}
